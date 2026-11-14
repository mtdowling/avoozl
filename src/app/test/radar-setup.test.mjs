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
} = {}) {
  const state = { labels: [...labels], rules: [], autoMerge, writes: [] };
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
      state.writes.push([method, pathname]);
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
    listPullRequests: () => Promise.resolve([]),
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
    ],
  );
  assert.deepEqual(github.state.writes, []);
  assert.equal(result.applied, undefined);
  assert.match(byId(result, "labels").detail, /to plan.*ready.*merge conflict/);
});

test("each step writes once after confirm and reads back", async () => {
  const github = fake();
  for (const id of ["labels", "branch-rule", "auto-merge"]) {
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
  for (const step of preview.steps) {
    assert.equal(step.status, "blocked", step.id);
    assert.ok(step.permission.length > 10);
  }
  for (const id of ["labels", "branch-rule", "auto-merge"]) {
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
    ["ok", "ok", "ok"],
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
  assert.equal(result.steps.length, 3);
  await assert.rejects(
    ops.execute("radar.setup", { repository: "other/repo" }),
    (error) => error.status === 404,
  );
});
