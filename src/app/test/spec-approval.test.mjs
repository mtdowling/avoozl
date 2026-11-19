import assert from "node:assert/strict";
import test from "node:test";
import { specHash } from "../spec-plans.mjs";
import {
  approvalChangedAtMerge,
  approvalChanges,
  approvalEvidence,
  approvalState,
  openApproval,
  reconcileApproval,
} from "../spec-approval.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const files = () => ({
  "requirements.md": "# Requirements\n\nStatus: Draft\n\nBody.\n",
  "design.md": "# Design\n\nStatus: Draft\n\nBody.\n",
  "tasks.md": "# Tasks\n\nStatus: Draft\n\n- [ ] 1 Do it\n",
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
  // One commit per call; each file is also kept as written.
  async commitFiles(_r, { branch, message, files, expectedHeadOid }) {
    this.commits = [
      ...(this.commits ?? []),
      { branch, message, expectedHeadOid },
    ];
    for (const [path, content] of Object.entries(files))
      this.written.push({
        path,
        branch,
        message,
        content,
        text: Buffer.from(content, "base64").toString(),
      });
    return "c".repeat(40);
  }
  // The files at a merge: the base branch's, then what the pull request wrote.
  async blobTexts(_r, _ref, paths) {
    const landed = { ...this.base };
    for (const file of this.written) landed[file.path] = file.text;
    return new Map(paths.map((path) => [path, landed[path] ?? null]));
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
const H = specHash(files());
const run = (extra = {}) => {
  const store = memoryStore(),
    github = new Fake(),
    repository = { owner: "octo", repo: "plans" },
    base = {
      github,
      repository,
      planId: "p1",
      hash: H,
      spec: "demo",
      files: files(),
      approvedBy: "octocat",
    };
  const args = { ...base, ...extra };
  github.base = Object.fromEntries(
    Object.entries(args.files).map(([name, text]) => [
      `.kiro/specs/${args.spec}/${name}`,
      text,
    ]),
  );
  return { store, github, repository, base, args };
};

test("the approval commit holds the spec's files as they are", () => {
  const before = files(),
    after = Object.fromEntries(
      Object.entries(approvalChanges({ spec: "demo", files: before })).map(
        ([p, t]) => [p.split("/").pop(), t],
      ),
    );
  assert.deepEqual(after, before);
  assert.equal(specHash(after), specHash(before));
});

test("the pull request writes the spec's files unchanged and nothing is recorded before the merge", async () => {
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
        f.branch === "avoozl/approve-demo" &&
        f.text === files()[f.path.split("/").pop()],
    ),
  );
  // Still open: a read records nothing.
  const read = await reconcileApproval(store, args);
  assert.equal(read.commit, undefined);
  assert.equal(approvalState(store, "p1", H).approvedBy, undefined);
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

test("a revision edited after an approval opens a pull request with no marker or record", async () => {
  const edited = { ...files(), "design.md": "# Design\n\nNew body.\n" };
  const { store, github, args } = run({
    files: edited,
    hash: specHash(edited),
  });
  assert.equal((await openApproval(store, args)).state, "open");
  assert.deepEqual(github.written.map((f) => f.path).sort(), [
    ".kiro/specs/demo/design.md",
    ".kiro/specs/demo/requirements.md",
    ".kiro/specs/demo/tasks.md",
  ]);
});

test("a merge whose author may not approve approves nothing", async () => {
  const { store, github, args } = run();
  await openApproval(store, args);
  github.merge(1);
  github.commit = async () => ({
    commit: { author: { email: "agent@avoozl.invalid" } },
    author: null,
  });
  const seen = [];
  const refused = await reconcileApproval(store, {
    ...args,
    mayApprove: async (email) => {
      seen.push(email);
      return false;
    },
  });
  assert.deepEqual(seen, ["agent@avoozl.invalid"]);
  assert.equal(refused.state, "refused");
  assert.throws(
    () => approvalChangedAtMerge(refused),
    /not on the approvers list/,
  );
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
  assert.equal(approvalState(store, "p1", H).state, "open");
});

test("a try that failed after making its branch is retried under the next name", async () => {
  const { store, github, args } = run();
  // The first try made avoozl/approve-demo, then failed on a file write.
  const taken = new Set(["avoozl/approve-demo"]);
  github.createBranch = async (_r, name) => {
    if (taken.has(name))
      throw Object.assign(Error("Reference already exists"), { status: 422 });
    taken.add(name);
    github.branches.push(name);
  };
  const state = await openApproval(store, args);
  assert.equal(state.branch, "avoozl/approve-demo-2");
  assert.equal(state.attempt, 2);
  assert.ok(github.written.every((f) => f.branch === "avoozl/approve-demo-2"));
  assert.equal(github.pulls[0].head, "avoozl/approve-demo-2");
});

test("private approval branches from the orphan ref and records its ref only on the correct merge", async () => {
  const { store, github, args } = run({ ref: "private-plans" });
  let source;
  github.branchHead = async (_repository, base) => {
    source = base;
    return { oid: SHA };
  };
  github.compareCommits = async () => {
    throw Object.assign(
      new Error("No common ancestor between main and private-plans."),
      { status: 404 },
    );
  };
  const opened = await openApproval(store, args);
  assert.equal(opened.base, "private-plans");
  assert.equal(opened.ref, "private-plans");
  assert.equal(source, "private-plans");
  assert.equal(github.pulls[0].base, "private-plans");
  assert.equal(
    github.written.find((file) => file.path.endsWith("/tasks.md")).text,
    args.files["tasks.md"],
  );
  assert.ok(!github.written.some((file) => file.path.endsWith(".json")));
  github.merge(1);
  github.pulls[0].base = { ref: "main" };
  await assert.rejects(
    () => reconcileApproval(store, args),
    /different branch/,
  );
  assert.equal(approvalState(store, args.planId, args.hash).state, "open");
  github.pulls[0].base = { ref: "private-plans" };
  const merged = await reconcileApproval(store, args);
  assert.equal(merged.ref, "private-plans");
  assert.equal(merged.commit, SHA);
});
test("private approval refuses unsafe, default, shared and unreadable refs before any write", async () => {
  for (const ref of ["--oops", "main", "private-plans"]) {
    const w = run({ ref });
    w.github.compareCommits = async () => ({ status: "diverged" });
    await assert.rejects(() => openApproval(w.store, w.args));
    assert.deepEqual(w.github.branches, []);
    assert.deepEqual(w.github.written, []);
  }
  const w = run({ ref: "private-plans" });
  w.github.compareCommits = async () => {
    throw Object.assign(new Error("Not Found"), { status: 404 });
  };
  await assert.rejects(
    () => openApproval(w.store, w.args),
    /history could not/,
  );
  assert.deepEqual(w.github.branches, []);
});

test("the approval pull request is one commit on the branch head it read", async () => {
  const { store, github, args } = run();
  await openApproval(store, args);
  assert.equal(github.commits.length, 1);
  assert.equal(github.commits[0].expectedHeadOid, SHA);
  assert.equal(github.written.length, 3);
});

test("a merge whose spec changed on the branch approves nothing; the merger is recorded", async () => {
  const { store, github, args } = run();
  await openApproval(store, args);
  // Someone pushed a body edit to the approval branch before merging.
  github.written.push({
    path: ".kiro/specs/demo/design.md",
    text: "# Design\n\nStatus: Approved\n\nOther body.\n",
  });
  github.merge(1);
  github.pulls[0].merged_by = { login: "merger" };
  const changed = await reconcileApproval(store, args);
  assert.equal(changed.state, "changed");
  assert.equal(changed.mergedBy, "merger");
  assert.equal(changed.approvedBy, undefined);
  assert.throws(
    () => approvalChangedAtMerge(changed),
    /merged a different revision/,
  );
  // An unchanged merge records who merged it beside the approver.
  const ok = run();
  await openApproval(ok.store, ok.args);
  ok.github.merge(1);
  ok.github.pulls[0].merged_by = { login: "merger" };
  const merged = await reconcileApproval(ok.store, ok.args);
  assert.equal(merged.state, "merged");
  assert.equal(merged.approvedBy, "octocat");
  assert.equal(merged.mergedBy, "merger");
  assert.equal(
    approvalEvidence(merged),
    `Approval merged at ${SHA} by @merger.`,
  );
});
