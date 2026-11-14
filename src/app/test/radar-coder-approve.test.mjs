import assert from "node:assert/strict";
import test from "node:test";
import { specHash } from "../spec-plans.mjs";
import {
  approvalChanges,
  approvalState,
  openApproval,
  reconcileApproval,
  statusOf,
} from "../spec-approval.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const files = () => ({
  "requirements.md": "# Requirements\n\nStatus: Draft\n\nBody.\n",
  "design.md": "# Design\n\nStatus: Draft\n\nBody.\n",
  "tasks.md": "# Tasks\n\nStatus: Draft\n\n- [ ] 1 Do it\n",
  "avoozl/manifest.json": "{}",
});

// An in-memory store and GitHub. No network, no real repository.
const memoryStore = () => {
  const meta = new Map();
  return {
    getMeta: (k) => meta.get(k) ?? null,
    setMeta: (k, v) => meta.set(k, structuredClone(v)),
  };
};
class Fake {
  constructor() {
    this.branches = [];
    this.written = [];
    this.pulls = [];
  }
  async repository() {
    return { default_branch: "main" };
  }
  async branchHead() {
    return { oid: SHA };
  }
  async createBranch(_r, name) {
    this.branches.push(name);
  }
  async putFile(_r, file) {
    this.written.push({
      ...file,
      text: Buffer.from(file.content, "base64").toString(),
    });
  }
  async createPullRequest(_r, input) {
    this.pulls.push({
      number: this.pulls.length + 1,
      state: "open",
      merged: false,
      ...input,
    });
    return { number: this.pulls.length };
  }
  async pullRequest(_r, number) {
    return this.pulls[number - 1];
  }
  merge(number, commit = SHA) {
    Object.assign(this.pulls[number - 1], {
      state: "closed",
      merged: true,
      merge_commit_sha: commit,
    });
  }
  close(number) {
    Object.assign(this.pulls[number - 1], {
      state: "closed",
      merged: false,
      merge_commit_sha: null,
    });
  }
}
const run = (extra = {}) => {
  const store = memoryStore(),
    github = new Fake(),
    repository = { owner: "octo", repo: "plans" },
    base = {
      github,
      repository,
      planId: "p1",
      hash: "h1",
      spec: "demo",
      files: files(),
      approvedBy: "octocat",
    };
  return { store, github, repository, base, args: { ...base, ...extra } };
};

test("approving does not change the spec hash", () => {
  const before = files(),
    after = Object.fromEntries(
      Object.entries(approvalChanges({ spec: "demo", files: before })).map(
        ([p, t]) => [p.split("/").pop(), t],
      ),
    );
  assert.equal(statusOf(after["design.md"]), "Approved");
  assert.equal(specHash({ ...before, ...after }), specHash(before));
  // A spec with no Status line gains one without changing its hash either.
  const bare = {
    "requirements.md": "# R\n\nBody\n",
    "design.md": "# D\n",
    "tasks.md": "# T\n",
  };
  const added = Object.fromEntries(
    Object.entries(approvalChanges({ spec: "demo", files: bare })).map(
      ([p, t]) => [p.split("/").pop(), t],
    ),
  );
  assert.equal(statusOf(added["tasks.md"]), "Approved");
  assert.equal(specHash({ ...bare, ...added }), specHash(bare));
  // Body edits still change it.
  assert.notEqual(
    specHash({ ...before, "design.md": "# Design\n\nOther\n" }),
    specHash(before),
  );
});

test("the pull request sets Status in three prose files and nothing is recorded before the merge", async () => {
  const { store, github, args } = run();
  const state = await openApproval(store, args);
  assert.equal(state.state, "open");
  assert.equal(state.commit, undefined);
  assert.equal(state.approvedBy, undefined);
  assert.deepEqual(github.written.map((f) => f.path).sort(), [
    ".kiro/specs/demo/design.md",
    ".kiro/specs/demo/requirements.md",
    ".kiro/specs/demo/tasks.md",
  ]);
  assert.ok(
    github.written.every(
      (f) =>
        f.branch === "avoozl/approve-demo" && statusOf(f.text) === "Approved",
    ),
  );
  // Still open: a read records nothing.
  const read = await reconcileApproval(store, args);
  assert.equal(read.commit, undefined);
  assert.equal(approvalState(store, "p1", "h1").approvedBy, undefined);
});

test("a merge records the merge commit and the approver", async () => {
  const { store, github, args } = run();
  await openApproval(store, args);
  github.merge(1);
  const state = await reconcileApproval(store, args);
  assert.equal(state.state, "merged");
  assert.equal(state.commit, SHA);
  assert.equal(state.approvedBy, "octocat");
  // Asking again changes nothing and opens no second pull request.
  assert.equal((await openApproval(store, args)).commit, SHA);
  assert.equal(github.pulls.length, 1);
});

test("a closed unmerged pull request records nothing", async () => {
  const { store, github, args } = run();
  await openApproval(store, args);
  github.close(1);
  const state = await reconcileApproval(store, args);
  assert.equal(state.state, "closed");
  assert.equal(state.commit, undefined);
  assert.equal(state.approvedBy, undefined);
  // The person may approve again: a new pull request opens.
  github.branches.length = 0;
  assert.equal((await openApproval(store, args)).state, "open");
  assert.equal(github.pulls.length, 2);
});

test("a spec with lint errors cannot be approved", async () => {
  const { store, github, args } = run({
    diagnostics: [{ severity: "error", code: "task.id", message: "Bad id." }],
  });
  await assert.rejects(
    () => openApproval(store, args),
    /Resolve plan diagnostic task.id/,
  );
  assert.equal(github.pulls.length, 0);
  assert.equal(github.written.length, 0);
  // Warnings do not block.
  const warn = run({
    diagnostics: [{ severity: "warning", code: "x", message: "m" }],
  });
  assert.equal((await openApproval(warn.store, warn.args)).state, "open");
});

test("an already approved spec is refused, and the decision record is optional", async () => {
  const approved = Object.fromEntries(
    Object.entries(files()).map(([n, t]) => [
      n,
      n.endsWith(".md") ? t.replace("Draft", "Approved") : t,
    ]),
  );
  const { store, github, args } = run({ files: approved });
  await assert.rejects(
    () => openApproval(store, args),
    /already says Status: Approved/,
  );
  assert.equal(github.pulls.length, 0);
  const off = run();
  await openApproval(off.store, off.args);
  assert.ok(
    !off.github.written.some((f) => f.path.startsWith("docs/decisions/")),
  );
  const on = run({ decisionRecord: true });
  await openApproval(on.store, on.args);
  const record = on.github.written.find(
    (f) => f.path === "docs/decisions/demo.md",
  );
  assert.match(record.text, /^Status: Accepted$/m);
  assert.match(record.text, /Automation may build it/);
  assert.doesNotMatch(record.text, /octo/);
});

test("a bugfix spec, both modes and a worker repository use the same path", async () => {
  const bug = { ...files(), "bugfix.md": "# Bug\n\nStatus: Draft\n" };
  delete bug["requirements.md"];
  assert.deepEqual(
    Object.keys(approvalChanges({ spec: "demo", files: bug })).map((p) =>
      p.split("/").pop(),
    ),
    ["bugfix.md", "design.md", "tasks.md"],
  );
  // The repository is the caller's: a plans repository, a code repository
  // or a worker's repository all open the pull request there.
  for (const repository of [
    { owner: "o", repo: "plans" },
    { owner: "o", repo: "code" },
    { owner: "w", repo: "worker" },
  ]) {
    const { store, github, args } = run({ repository });
    const state = await openApproval(store, args);
    assert.equal(state.repository, `${repository.owner}/${repository.repo}`);
    github.merge(1);
    assert.equal((await reconcileApproval(store, args)).state, "merged");
  }
});

test("an invalid approver or merge commit is refused", async () => {
  const bad = run({ approvedBy: "not a login" });
  await assert.rejects(() => openApproval(bad.store, bad.args), /GitHub login/);
  const { store, github, args } = run();
  await openApproval(store, args);
  github.merge(1, "nothex");
  await assert.rejects(() => reconcileApproval(store, args), /no merge commit/);
  assert.equal(approvalState(store, "p1", "h1").state, "open");
});
