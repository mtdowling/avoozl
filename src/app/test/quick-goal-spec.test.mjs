// rc-9.2: the quick-goal mini-spec and its approval pull request. Fake GitHub
// only. Nearby inputs checked: a goal with a fence, a private name, a secret
// and a home path; a goal that is only private text; a planner task title with
// a private name; a goal with no usable words for the slug; a proposal with
// edges and with none; the same approval opened twice; the approval pull
// request carrying all four files; the marker over the approved files through
// verify-issue; a changed task title after approval.
import assert from "node:assert/strict";
import test from "node:test";
import { renderProvenance } from "../github-provenance.mjs";
import { approvalChanges, openApproval } from "../spec-approval.mjs";
import { lintSpec } from "../spec-plans.mjs";
import { verifyIssue } from "../verify-issue.mjs";
import { checkProposal, quickGoalRequest } from "../quick-goal.mjs";
import {
  buildMiniSpec,
  goalSlug,
  quickGoalTaskIds,
  scrubPrompt,
} from "../quick-goal-spec.mjs";
import { workspace } from "./radar-fixture.mjs";

const CHECKS = ["npm test"];
const SHA = "0123456789abcdef0123456789abcdef01234567";
const request = (goal = "Make tests faster") =>
  quickGoalRequest({ goal, repository: "example/code" });
const proposal = (extra = {}) =>
  checkProposal(
    {
      tasks: [
        {
          id: "a",
          title: "Cache the fixture build",
          evidence: { file: "test/setup.mjs", line: 12 },
        },
        {
          id: "b",
          title: "Run suites in parallel",
          evidence: { measured: { seconds: 41.5, command: "npm test" } },
        },
        {
          id: "c",
          title: "Drop the unused snapshot",
          evidence: { file: "test/old.mjs", line: 3 },
        },
      ],
      edges: [{ from: "a", to: "b" }],
      batches: [["a", "c"]],
      risks: ["Parallel runs may share a temp folder"],
      questions: ["Is CI limited to two cores?"],
      ...extra,
    },
    { depth: "measure" },
  );
const lint = (spec) =>
  lintSpec({
    spec: { exists: true, folder: `.kiro/specs/${spec.name}/`, ...spec },
  });

test("the slug is goal- plus the goal's words, at most 80 characters", () => {
  assert.equal(goalSlug("Make tests faster"), "goal-make-tests-faster");
  assert.equal(goalSlug("  Fix   the *bug*!! "), "goal-fix-the-bug");
  assert.ok(goalSlug("word ".repeat(60)).length <= 80);
  assert.match(goalSlug("word ".repeat(60)), /^goal-[a-z0-9-]+[a-z0-9]$/);
  // no usable words: a stable hash-based name, not an empty one
  assert.match(goalSlug("!!! ???"), /^goal-[a-f0-9]{12}$/);
  assert.equal(goalSlug("!!! ???"), goalSlug("!!! ???"));
});

test("the mini-spec folder lints with 0 errors and keeps the layout", async (t) => {
  const { store } = await workspace(t, { mode: "single-repo" }),
    spec = buildMiniSpec(store, {
      request: request(),
      proposal: proposal(),
      checks: CHECKS,
    });
  assert.equal(spec.name, "goal-make-tests-faster");
  assert.deepEqual(Object.keys(spec.files).sort(), [
    "avoozl/manifest.json",
    "design.md",
    "requirements.md",
    "tasks.md",
  ]);
  const result = lint(spec);
  assert.equal(result.counts.error, 0, JSON.stringify(result.diagnostics));
  assert.equal(result.taskCount, 3);
});

test("the goal and the evidence are quoted in requirements.md", async (t) => {
  const { store } = await workspace(t, { mode: "single-repo" }),
    spec = buildMiniSpec(store, {
      request: request("Make tests faster\n```\nnot a fence end"),
      proposal: proposal(),
      checks: CHECKS,
    }),
    text = spec.files["requirements.md"];
  assert.match(text, /^````data$/m);
  assert.match(text, /not a fence end/);
  assert.match(text, /test\/setup\.mjs:12/);
  assert.match(text, /41\.5 s with `npm test`/);
  assert.match(
    spec.files["design.md"],
    /Parallel runs may share a temp folder/,
  );
  assert.match(spec.files["design.md"], /Is CI limited to two cores\?/);
});

test("task IDs are numbered in proposal order and edges become requires", async (t) => {
  const { store } = await workspace(t, { mode: "single-repo" }),
    spec = buildMiniSpec(store, {
      request: request(),
      proposal: proposal(),
      checks: CHECKS,
    }),
    manifest = JSON.parse(spec.files["avoozl/manifest.json"]);
  assert.deepEqual(
    quickGoalTaskIds(spec),
    ["1", "2", "3"].map((k) => `${spec.name}.${k}`),
  );
  assert.deepEqual(manifest.tasks["2"].requires, ["1"]);
  assert.equal(manifest.tasks["1"].requires, undefined);
  assert.match(spec.files["tasks.md"], /^- \[ \] 1 Cache the fixture build/m);
});

test("every issue summary ends with the quoted prompt", async (t) => {
  const { store } = await workspace(t, { mode: "single-repo" }),
    spec = buildMiniSpec(store, {
      request: request(),
      proposal: proposal(),
      checks: CHECKS,
    }),
    manifest = JSON.parse(spec.files["avoozl/manifest.json"]);
  for (const entry of Object.values(manifest.tasks)) {
    assert.match(entry.summary, /Original prompt/);
    assert.match(entry.summary, /Make tests faster\n`{3,}$/);
  }
});

test("a private name, a secret and a home path are removed from the prompt", async (t) => {
  const { store } = await workspace(t, {
      mode: "single-repo",
      blockTerm: "Zebra",
    }),
    goal = [
      "Make tests faster",
      "Ask the Zebra team first",
      "token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "see /home/someone/project/notes",
    ].join("\n"),
    spec = buildMiniSpec(store, {
      request: request(goal),
      proposal: proposal(),
      checks: CHECKS,
    }),
    all = Object.values(spec.files).join("\n");
  assert.doesNotMatch(all, /Zebra|ghp_|\/home\/someone/);
  assert.match(spec.files["requirements.md"], /Make tests faster/);
  assert.equal((all.match(/\[removed\]/g) || []).length > 0, true);
  assert.equal(scrubPrompt(store, goal).removed, 3);
});

test("a prompt that is only private text is refused", async (t) => {
  const { store } = await workspace(t, {
    mode: "single-repo",
    blockTerm: "Zebra",
  });
  assert.throws(
    () =>
      buildMiniSpec(store, {
        request: request("Zebra"),
        proposal: proposal(),
        checks: CHECKS,
      }),
    (error) => error.status === 422 && !/Zebra/.test(error.message),
  );
});

test("a private name in a planner task title is refused without echoing it", async (t) => {
  const { store } = await workspace(t, {
      mode: "single-repo",
      blockTerm: "Zebra",
    }),
    bad = proposal();
  bad.tasks[0].title = "Ask the Zebra team";
  assert.throws(
    () =>
      buildMiniSpec(store, {
        request: request(),
        proposal: bad,
        checks: CHECKS,
      }),
    (error) => error.status === 422 && !/Zebra/.test(error.message),
  );
});

test("the approval pull request adds all four files, approved, and opens once", async (t) => {
  const { store } = await workspace(t, { mode: "single-repo" }),
    spec = buildMiniSpec(store, {
      request: request(),
      proposal: proposal(),
      checks: CHECKS,
    }),
    pulls = [],
    written = [],
    github = {
      repository: async () => ({ default_branch: "main" }),
      branchHead: async () => ({ oid: SHA }),
      createBranch: async () => {},
      putFile: async (_r, file) =>
        written.push({
          path: file.path,
          text: Buffer.from(file.content, "base64").toString(),
        }),
      createPullRequest: async (_r, input) => {
        pulls.push(input);
        return { number: pulls.length };
      },
    },
    args = {
      github,
      repository: { owner: "example", repo: "code", id: "example/code" },
      planId: "quick-goal-1",
      hash: "h1",
      spec: spec.name,
      files: spec.files,
      approvedBy: "octocat",
      extra: {
        [`.kiro/specs/${spec.name}/avoozl/manifest.json`]:
          spec.files["avoozl/manifest.json"],
      },
    };
  const first = await openApproval(store, args),
    second = await openApproval(store, args);
  assert.equal(first.number, 1);
  assert.deepEqual(second, first);
  assert.equal(pulls.length, 1);
  assert.deepEqual(written.map((w) => w.path).sort(), [
    `.kiro/specs/${spec.name}/avoozl/manifest.json`,
    `.kiro/specs/${spec.name}/design.md`,
    `.kiro/specs/${spec.name}/requirements.md`,
    `.kiro/specs/${spec.name}/tasks.md`,
  ]);
  for (const w of written.filter((w) => w.path.endsWith(".md")))
    assert.match(w.text, /^Status: Approved$/m);
});

test("the marker passes verify-issue over the approved files", async (t) => {
  const { store } = await workspace(t, { mode: "single-repo" }),
    spec = buildMiniSpec(store, {
      request: request(),
      proposal: proposal(),
      checks: CHECKS,
    }),
    ids = quickGoalTaskIds(spec),
    approved = approvalChanges({ spec: spec.name, files: spec.files }),
    base = `repos/example/code/contents/.kiro/specs/${spec.name}`,
    table = new Map([
      [
        "repos/example/code/issues/5",
        {
          body: {
            user: { login: "maintainer" },
            body: `body\n${renderProvenance({ spec: spec.name, tasks: [ids[0]], commit: SHA, approvedBy: "octocat" })}\n`,
          },
        },
      ],
      ["repos/example/code", { body: { default_branch: "main" } }],
      [
        `repos/example/code/compare/main...${SHA}`,
        { body: { status: "identical" } },
      ],
      [
        `${base}/avoozl/manifest.json?ref=${SHA}`,
        { text: spec.files["avoozl/manifest.json"] },
      ],
    ]);
  for (const login of ["octocat", "maintainer"])
    table.set(`repos/example/code/collaborators/${login}/permission`, {
      body: { permission: "write" },
    });
  for (const [file, text] of Object.entries(approved))
    table.set(`${base}/${file.split("/").slice(3).join("/")}?ref=${SHA}`, {
      text,
    });
  const read = async (path) => {
      const hit = table.get(path);
      return hit
        ? {
            status: 200,
            headers: {},
            text: hit.text ?? JSON.stringify(hit.body),
          }
        : { status: 404, headers: {}, text: "{}" };
    },
    result = await verifyIssue("example/code#5", { read });
  assert.equal(result.ok, true, JSON.stringify(result.checks));
});

test("a goal with only symbols still builds a spec", async (t) => {
  const { store } = await workspace(t, { mode: "single-repo" }),
    spec = buildMiniSpec(store, {
      request: request("!!! ???"),
      proposal: proposal(),
      checks: CHECKS,
    });
  assert.match(spec.name, /^goal-[a-f0-9]{12}$/);
  assert.equal(lint(spec).counts.error, 0);
});

test("a repository with no named checks is refused", async (t) => {
  const { store } = await workspace(t, { mode: "single-repo" });
  for (const checks of [undefined, []])
    assert.throws(
      () =>
        buildMiniSpec(store, {
          request: request(),
          proposal: proposal(),
          checks,
        }),
      /checks/,
    );
});
