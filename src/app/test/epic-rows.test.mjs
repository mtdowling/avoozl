// Epic lifecycle rows and approval evidence (Requirement 59.1, 102.18,
// design §4.32.6). Temporary workspaces and fakes only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import {
  approvalState,
  mayLinkSpecIssue,
  openApproval,
  reconcileApproval,
} from "../spec-approval.mjs";
import {
  epicMembers,
  lintSpec,
  readSpecFolder,
  specHash,
} from "../spec-plans.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const leaf = {
  kind: "leaf",
  summary: "Do it.",
  acceptance: ["A missing file yields defaults."],
  checks: ["npm test"],
  completion: "integrated",
};

function plan(root, name, summary = "Do it.") {
  writeSpec(root, name, {
    "requirements.md": `---\nepic: launch\n---\n# Plan ${name}\n\nThe goal.\n`,
    "tasks.md": "# Tasks\n\n- [ ] 1 Build it\n",
    "avoozl/manifest.json": JSON.stringify({
      tasks: { 1: { ...leaf, summary } },
    }),
  });
}

// An epic folder with one row per [plan, step]; `checked` rows carry [x].
function epic(root, rows, { checked = false } = {}) {
  writeSpec(root, "launch", {
    "requirements.md": "# Epic launch\n\nShip it.\n",
    "design.md": "# Design\n",
    "tasks.md": `# Plans\n\n${rows.map((_, i) => `- [${checked ? "x" : " "}] ${i + 1} Row ${i + 1}\n`).join("")}`,
    "avoozl/manifest.json": JSON.stringify({
      kind: "epic",
      tasks: Object.fromEntries(
        rows.map(([plan, step], i) => [
          String(i + 1),
          { plan, ...(step ? { step } : {}) },
        ]),
      ),
    }),
  });
}

function workspace(t) {
  const { root, store } = fixture(t);
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}
const lint = (ops, name) =>
  lintSpec({
    spec: readSpecFolder(ops.workspaceRoot, name),
    plan: { id: name },
    namespace: ops.specNamespace(),
  });

test("epic rows take a step, default implement, once per plan and step", (t) => {
  const { root, ops } = workspace(t);
  plan(root, "alpha");
  epic(root, [["alpha", "design"], ["alpha", "review"], ["alpha"]]);
  const quality = lint(ops, "launch");
  assert.deepEqual(quality.diagnostics, []);
  assert.deepEqual(
    quality.members.map((m) => m.step),
    ["design", "review", "implement"],
  );
  assert.deepEqual(epicMembers(readSpecFolder(root, "launch").files), [
    "alpha",
  ]);
  epic(root, [["alpha", "implement"], ["alpha"]]);
  assert.deepEqual(
    lint(ops, "launch").diagnostics.map((d) => d.code),
    ["spec.epic-member-twice"],
  );
  epic(root, [["alpha", "ship"]]);
  assert.match(lint(ops, "launch").diagnostics[0].message, /step must be/);
  // Task fields stay refused on a row.
  writeSpec(root, "launch", {
    "avoozl/manifest.json": JSON.stringify({
      kind: "epic",
      tasks: { 1: { plan: "alpha", step: "design", checks: ["npm test"] } },
    }),
    "tasks.md": "# Plans\n\n- [ ] 1 Row\n",
  });
  assert.deepEqual(
    lint(ops, "launch").diagnostics.map((d) => d.code),
    ["spec.epic-task-fields"],
  );
});

test("rows derive from member state and never from checkmarks", async (t) => {
  const { root, store, ops } = workspace(t);
  plan(root, "alpha");
  epic(root, [["alpha", "design"], ["alpha", "review"], ["alpha"]], {
    checked: true,
  });
  const rows = async () =>
    (await ops.execute("epic.get", { id: "launch" })).rows.map((row) => [
      row.step,
      row.done,
    ]);
  assert.deepEqual(await rows(), [
    ["design", false],
    ["review", false],
    ["implement", false],
  ]);
  const created = await ops.execute("plan.create", { spec: "alpha" });
  assert.deepEqual(await rows(), [
    ["design", false],
    ["review", false],
    ["implement", false],
  ]);
  const preview = await ops.execute("plan.preview", { id: created.id });
  const receipt = await ops.execute("plan.approve", {
    id: created.id,
    expectedHash: created.hash,
    expectedRevision: preview.expectedRevision,
  });
  // No approval pull request: an explicit local approval.
  assert.equal(receipt.approval.kind, "local");
  assert.deepEqual(await rows(), [
    ["design", true],
    ["review", true],
    ["implement", false],
  ]);
  const [task] = store.read().tasks.filter((entry) => entry.planId === "alpha");
  await ops.execute("task.update", { id: task.id, status: "accepted" });
  assert.deepEqual(await rows(), [
    ["design", true],
    ["review", true],
    ["implement", true],
  ]);
  // An edited spec is stale: its approval no longer covers this revision.
  plan(root, "alpha", "Do it differently.");
  const saved = await ops.execute("plan.save", {
    id: created.id,
    expectedHash: created.hash,
  });
  assert.notEqual(saved.hash, created.hash);
  assert.deepEqual(await rows(), [
    ["design", false],
    ["review", false],
    ["implement", false],
  ]);
});

const SHA = "0123456789abcdef0123456789abcdef01234567";
class FakePulls {
  constructor() {
    this.pulls = [];
    this.requested = [];
    this.reviews = [];
  }
  async repository() {
    return { default_branch: "main" };
  }
  async branchHead() {
    return { oid: SHA };
  }
  async createBranch() {}
  async commitFiles() {
    return "c".repeat(40);
  }
  async blobTexts(_r, _ref, paths) {
    return new Map(
      paths.map((name) => [name, this.files[name.split("/").pop()] ?? null]),
    );
  }
  async createPullRequest(_r, input) {
    this.pulls.push({ number: this.pulls.length + 1, state: "open", ...input });
    return { number: this.pulls.length };
  }
  async pullRequest(_r, number) {
    return this.pulls[number - 1];
  }
  async requestReviewers(_r, number, reviewers) {
    this.requested.push([number, reviewers]);
  }
  async pullRequestReviews() {
    return this.reviews;
  }
}

test("a merged approval keeps requester, real reviewers, merger and time apart", async () => {
  const meta = new Map(),
    store = {
      getMeta: (k) => meta.get(k) ?? null,
      setMeta: (k, v) => meta.set(k, structuredClone(v)),
    },
    github = new FakePulls(),
    files = {
      "requirements.md": "# R\n\nStatus: Draft\n",
      "design.md": "# D\n\nStatus: Draft\n",
      "tasks.md": "# T\n\nStatus: Draft\n\n- [ ] 1 Do it\n",
    },
    hash = specHash(files),
    args = {
      github,
      repository: { owner: "octo", repo: "plans" },
      planId: "p1",
      hash,
      spec: "demo",
      files,
      approvedBy: "requester",
    };
  github.files = files;
  await openApproval(store, {
    ...args,
    reviewers: ["alice"],
    specIssue: "octo/plans#4",
  });
  assert.deepEqual(github.requested, [[1, ["alice"]]]);
  assert.match(github.pulls[0].body, /Spec issue: octo\/plans#4/);
  // No configured reviewers: nothing requested, GitHub's CODEOWNERS decide.
  const other = new FakePulls();
  other.files = files;
  await openApproval(
    { getMeta: () => null, setMeta: () => {} },
    { ...args, github: other },
  );
  assert.deepEqual(other.requested, []);
  assert.doesNotMatch(other.pulls[0].body, /Spec issue/);

  github.reviews = [
    { user: { login: "alice" }, state: "CHANGES_REQUESTED" },
    { user: { login: "bob" }, state: "APPROVED" },
    { user: { login: "alice" }, state: "APPROVED" },
    { user: { login: "bob" }, state: "DISMISSED" },
    { user: { login: "carol" }, state: "COMMENTED" },
  ];
  Object.assign(github.pulls[0], {
    state: "closed",
    merged: true,
    merge_commit_sha: SHA,
    merged_by: { login: "merger" },
    merged_at: "2026-11-16T20:00:00Z",
  });
  const state = await reconcileApproval(store, args);
  assert.deepEqual(
    {
      requestedBy: state.requestedBy,
      reviewers: state.reviewers,
      mergedBy: state.mergedBy,
      mergedAt: state.mergedAt,
      commit: state.commit,
      verified: state.verified,
    },
    {
      requestedBy: "requester",
      reviewers: ["alice"],
      mergedBy: "merger",
      mergedAt: "2026-11-16T20:00:00Z",
      commit: SHA,
      verified: true,
    },
  );
  assert.equal(approvalState(store, "p1", hash).reviewers[0], "alice");
});

test("a public pull request never names a private spec issue", () => {
  assert.equal(
    mayLinkSpecIssue({ pullPrivate: false, issuePrivate: false }),
    true,
  );
  assert.equal(
    mayLinkSpecIssue({ pullPrivate: true, issuePrivate: true }),
    true,
  );
  assert.equal(
    mayLinkSpecIssue({ pullPrivate: true, issuePrivate: false }),
    true,
  );
  assert.equal(
    mayLinkSpecIssue({ pullPrivate: false, issuePrivate: true }),
    false,
  );
  assert.equal(
    mayLinkSpecIssue({ pullPrivate: undefined, issuePrivate: false }),
    false,
  );
});

test("github.specReviewers names logins per spec and nothing else", () => {
  assert.deepEqual(
    normalizeGitHubPolicy({ specReviewers: { demo: ["alice", "bob"] } })
      .specReviewers,
    { demo: ["alice", "bob"] },
  );
  assert.equal(normalizeGitHubPolicy({}).specReviewers, undefined);
  for (const bad of [
    { demo: "alice" },
    { demo: ["not a login"] },
    { demo: ["alice", "ALICE"] },
    { "Not A Spec": ["alice"] },
  ])
    assert.throws(() => normalizeGitHubPolicy({ specReviewers: bad }));
  // The approval pull request asks the configured logins.
  const root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: { specReviewers: { demo: ["alice"] } },
    }),
  );
  const ops = new Operations(fixture({ after() {} }).store, {
    workspaceRoot: root,
  });
  assert.deepEqual(ops.specReviewers({ spec: "demo" }), ["alice"]);
  assert.deepEqual(ops.specReviewers({ spec: "other" }), []);
});

test("an approval receipt carries the merged pull request's evidence", async (t) => {
  const { root, store, ops } = workspace(t);
  plan(root, "alpha");
  const created = await ops.execute("plan.create", { spec: "alpha" });
  store.setMeta(`spec-approval:${created.id}:${created.hash}`, {
    state: "merged",
    repository: "octo/plans",
    number: 3,
    requestedBy: "requester",
    reviewers: ["alice"],
    mergedBy: "merger",
    commit: SHA,
    mergedAt: "2026-11-16T20:00:00Z",
    verified: true,
  });
  const preview = await ops.execute("plan.preview", { id: created.id });
  const receipt = await ops.execute("plan.approve", {
    id: created.id,
    expectedHash: created.hash,
    expectedRevision: preview.expectedRevision,
  });
  assert.deepEqual(receipt.approval, {
    kind: "pull-request",
    repository: "octo/plans",
    number: 3,
    requestedBy: "requester",
    reviewers: ["alice"],
    mergedBy: "merger",
    commit: SHA,
    mergedAt: "2026-11-16T20:00:00Z",
    verified: true,
  });
});
