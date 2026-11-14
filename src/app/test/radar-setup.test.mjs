// rc-7.1: Radar set up steps through gh (RC7.1), with a stateful fake GitHub.
// Nothing here reaches the network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { radarSetup } from "../radar-setup.mjs";
import { fixture } from "./fixtures.mjs";

const REPO = "example/code";

function fake({
  admin = true,
  push = true,
  labels = [],
  autoMerge = false,
  agents = null,
} = {}) {
  const state = {
    labels: [...labels],
    rules: [],
    autoMerge,
    writes: [],
    agents: agents === null ? null : { text: agents, sha: "sha-1" },
    pulls: [],
    pull: null,
  };
  return {
    state,
    available: () => true,
    repository: () =>
      Promise.resolve({
        default_branch: "main",
        allow_auto_merge: state.autoMerge,
        permissions: { admin, push },
      }),
    listLabels: () => Promise.resolve(state.labels.map((name) => ({ name }))),
    ensureLabel: (_repository, label) => {
      state.writes.push(["label", label.name]);
      state.labels.push(label.name);
      return Promise.resolve(label);
    },
    request: (method, pathname, { body } = {}) => {
      if (method === "GET" && pathname.endsWith("/contents/AGENTS.md")) {
        if (!state.agents)
          return Promise.reject(
            Object.assign(Error("Not Found"), { status: 404 }),
          );
        return Promise.resolve({
          sha: state.agents.sha,
          content: Buffer.from(state.agents.text).toString("base64"),
        });
      }
      if (method === "GET")
        return Promise.resolve({ object: { sha: "base-sha" } });
      state.writes.push([method, pathname]);
      if (pathname.endsWith("/git/refs")) state.ref = body;
      if (pathname.endsWith("/contents/AGENTS.md")) state.put = body;
      if (pathname.endsWith("/pulls")) {
        state.pull = body;
        state.pulls.push({ number: 7 });
        return Promise.resolve({ number: 7 });
      }
      if (method === "POST" && pathname.endsWith("/rulesets"))
        state.rules.push(
          ...body.rules[0].parameters.required_status_checks.map(
            (c) => c.context,
          ),
        );
      else if (method === "PATCH") state.autoMerge = body.allow_auto_merge;
      return Promise.resolve({});
    },
    branch: () => Promise.resolve({ protected: true }),
    branchRules: () =>
      Promise.resolve(
        state.rules.length
          ? [
              {
                type: "required_status_checks",
                parameters: {
                  required_status_checks: state.rules.map((context) => ({
                    context,
                  })),
                },
              },
            ]
          : [],
      ),
    branchProtection: () => Promise.resolve(null),
    listCommits: () => Promise.resolve([]),
    listPullRequests: () => Promise.resolve(state.pulls),
    checkRuns: () => Promise.resolve([]),
    commitStatus: () => Promise.resolve({ statuses: [] }),
  };
}

const settings = (extra = {}) => ({
  baseBranch: "main",
  requiredChecks: ["build"],
  ...extra,
});
const byId = (result, id) => result.steps.find((step) => step.id === id);

test("a preview shows each step and writes nothing", async () => {
  const github = fake(),
    result = await radarSetup(github, REPO, settings());
  assert.deepEqual(
    result.steps.map((step) => [step.id, step.status]),
    [
      ["labels", "change"],
      ["branch-rule", "change"],
      ["auto-merge", "change"],
      ["agents-pr", "change"],
      ["project", "input"],
    ],
  );
  assert.deepEqual(github.state.writes, []);
  assert.equal(result.applied, undefined);
  assert.match(byId(result, "labels").detail, /to plan.*ready.*merge conflict/);
});

test("each step writes once after confirm and reads back", async () => {
  const github = fake();
  for (const id of ["labels", "branch-rule", "auto-merge", "agents-pr"]) {
    const preview = byId(await radarSetup(github, REPO, settings()), id),
      before = github.state.writes.length,
      done = await radarSetup(github, REPO, settings(), {
        confirm: true,
        step: id,
        previewHash: preview.previewHash,
      });
    assert.equal(done.applied.status, "done", id);
    assert.match(done.applied.detail, /^Read back:/);
    assert.equal(byId(done, id).status, "ok");
    assert.ok(github.state.writes.length > before);
  }
  assert.deepEqual(github.state.labels, ["to plan", "ready", "merge conflict"]);
  assert.equal(github.state.autoMerge, true);
  const writes = github.state.writes.length;
  await radarSetup(github, REPO, settings());
  assert.equal(github.state.writes.length, writes);
});

test("only missing labels are created", async () => {
  const github = fake({ labels: ["Ready", "to plan"] }),
    result = await radarSetup(github, REPO, settings());
  assert.match(byId(result, "labels").detail, /^Create merge conflict\.$/);
});

test("a missing permission writes nothing and names the permission", async () => {
  const github = fake({ admin: false, push: false }),
    preview = await radarSetup(github, REPO, settings());
  for (const step of preview.steps.filter((entry) => entry.id !== "project")) {
    assert.equal(step.status, "blocked", step.id);
    assert.ok(step.permission.length > 10);
  }
  for (const id of ["labels", "branch-rule", "auto-merge", "agents-pr"]) {
    const done = await radarSetup(github, REPO, settings(), {
      confirm: true,
      step: id,
    });
    assert.equal(done.applied.status, "blocked");
    assert.match(done.applied.detail, /Nothing changed/);
  }
  assert.deepEqual(github.state.writes, []);
});

test("a stale preview hash and an unnamed step are refused", async () => {
  const github = fake();
  await assert.rejects(
    radarSetup(github, REPO, settings(), {
      confirm: true,
      step: "labels",
      previewHash: "x",
    }),
    (error) => error.status === 409,
  );
  await assert.rejects(
    radarSetup(github, REPO, settings(), { confirm: true }),
    (error) => error.status === 400,
  );
  assert.deepEqual(github.state.writes, []);
});

test("no named CI check asks for one; steps that are done change nothing", async () => {
  const github = fake({
    labels: ["to plan", "ready", "merge conflict"],
    autoMerge: true,
  });
  github.state.rules.push("build");
  const result = await radarSetup(github, REPO, settings());
  assert.deepEqual(
    result.steps.map((step) => step.status),
    ["ok", "ok", "ok", "change", "input"],
  );
  const none = await radarSetup(fake(), REPO, settings({ requiredChecks: [] }));
  assert.equal(byId(none, "branch-rule").status, "input");
  await assert.rejects(
    radarSetup(github, REPO, settings(), { confirm: true, step: "labels" }),
    (error) => error.status === 409,
  );
});

test("an unreadable repository is an error on every step, not a guess", async () => {
  const github = {
    ...fake(),
    repository: () => Promise.reject(Error("boom")),
  };
  const result = await radarSetup(github, REPO, settings());
  assert.ok(result.steps.every((step) => step.status === "error"));
});

test("radar.setup runs through operations and refuses an unregistered repository", async (t) => {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdef",
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            requiredChecks: ["build"],
            coder: "issue-radar",
          },
        },
      },
    }),
  );
  const github = fake(),
    ops = new Operations(store, { github, workspaceRoot: root }),
    result = await ops.execute("radar.setup", { repository: REPO });
  assert.equal(result.steps.length, 5);
  await assert.rejects(
    ops.execute("radar.setup", { repository: "other/repo" }),
    (error) => error.status === 404,
  );
});

const AGENTS_START = "<!-- avoozl:review-rules -->";

test("the review-rules pull request adds one block, once, on a branch", async () => {
  const github = fake({ agents: "# Rules\n\nBe kind.\n" }),
    preview = byId(await radarSetup(github, REPO, settings()), "agents-pr");
  assert.equal(preview.status, "change");
  assert.deepEqual(github.state.writes, []);
  const done = await radarSetup(github, REPO, settings(), {
    confirm: true,
    step: "agents-pr",
    previewHash: preview.previewHash,
  });
  // Branch, file, pull request: nothing touches main.
  assert.deepEqual(
    github.state.writes.map(
      ([method, path]) => `${method} ${path.split("/").slice(-1)[0]}`,
    ),
    ["POST refs", "PUT AGENTS.md", "POST pulls"],
  );
  assert.equal(github.state.put.branch, "avoozl/review-rules");
  assert.equal(github.state.pull.base, "main");
  const text = Buffer.from(github.state.put.content, "base64").toString();
  assert.ok(text.startsWith("# Rules\n\nBe kind.\n"));
  assert.ok(text.includes(AGENTS_START));
  assert.match(text, /avoozl verify-issue OWNER\/REPO#N/);
  // With the pull request open the step reads ok and a second confirm is refused.
  assert.equal(byId(done, "agents-pr").status, "ok");
  assert.match(byId(done, "agents-pr").detail, /#7/);
});

test("a repository that already holds the block has nothing to change", async () => {
  const github = fake({ agents: "" }),
    first = byId(await radarSetup(github, REPO, settings()), "agents-pr"),
    { rulesBlock } = await import("../radar-agents-pr.mjs");
  assert.equal(first.status, "change");
  github.state.agents = { text: `# A\n\n${rulesBlock(settings())}`, sha: "s2" };
  assert.equal(
    byId(await radarSetup(github, REPO, settings()), "agents-pr").status,
    "ok",
  );
});

test("custom review rules replace the built-in text", async () => {
  const github = fake(),
    custom = settings({ radar: { reviewRules: "- Run the linter." } }),
    preview = byId(await radarSetup(github, REPO, custom), "agents-pr");
  await radarSetup(github, REPO, custom, {
    confirm: true,
    step: "agents-pr",
    previewHash: preview.previewHash,
  });
  const text = Buffer.from(github.state.put.content, "base64").toString();
  assert.match(text, /- Run the linter\./);
  assert.doesNotMatch(text, /Closes #N/);
});

test("without write access the pull request step changes nothing and names the permission", async () => {
  const github = fake({ push: false, admin: false }),
    step = byId(await radarSetup(github, REPO, settings()), "agents-pr");
  assert.equal(step.status, "blocked");
  assert.match(step.permission, /Pull requests/);
  const done = await radarSetup(github, REPO, settings(), {
    confirm: true,
    step: "agents-pr",
  });
  assert.equal(done.applied.status, "blocked");
  assert.deepEqual(github.state.writes, []);
});

test("a content rule that blocks the pull request text stops it before any write", async () => {
  const github = fake(),
    context = { check: () => ["names/term-1"] },
    step = byId(
      await radarSetup(github, REPO, settings(), {}, context),
      "agents-pr",
    );
  assert.equal(step.status, "error");
  assert.match(step.detail, /names\/term-1/);
  assert.doesNotMatch(step.detail, /Review rules/);
  assert.deepEqual(github.state.writes, []);
});

test("the Project step reads the configured Project and never writes it", async () => {
  const github = fake(),
    context = { project: { owner: "example", number: 3 } },
    step = byId(
      await radarSetup(github, REPO, settings(), {}, context),
      "project",
    );
  assert.equal(step.status, "ok");
  assert.match(step.detail, /example#3/);
  await assert.rejects(
    radarSetup(github, REPO, settings(), { confirm: true, step: "project" }),
    (error) => error.status === 409,
  );
});
