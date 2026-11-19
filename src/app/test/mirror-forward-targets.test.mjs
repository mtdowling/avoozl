// rc-25.7: the `branch` and `batch` targets (RC26.3, RC26.4, design D31.1).
// Local scratch git repositories and a fake GitHub only; no call here can
// merge a public branch, and a spy proves none is made.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { batchId } from "../forward-epics.mjs";
import {
  mirrorBatchStep,
  publicBranchRows,
  publicBranchStep,
} from "../mirror-forward-batch.mjs";
import { mirrorForwardStep } from "../mirror-forward.mjs";
import { publicMergeReached } from "../mirror-forward-poll.mjs";
import { withFacts } from "./spec-fixture.mjs";
import { forwardRecord } from "../mirror-forward-run.mjs";
import { mirrorNeedsYou, mirrorSyncStep } from "../mirror-sync.mjs";
import {
  SOURCE,
  MIRROR,
  branches,
  fakeGitHub,
  git,
  grant,
  policy,
  scratch,
  forwardName,
} from "./forward-scratch.mjs";

const noMerge = (github) => {
  github.mergeBranch = async () => {
    throw Error("a public branch must never be merged by Avoozl");
  };
  return github;
};
const run = (made, github, pol, id = made.sha) =>
  forwardRecord(made.store, github, id, {
    policy: pol,
    person: "dana",
    git: made.forward,
    grant,
  });

test("each opens the public pull request against the default branch", async (t) => {
  const made = scratch(t),
    github = noMerge(fakeGitHub()),
    result = await run(made, github, policy("nudge"));
  assert.equal(result.record.state, "public_open");
  assert.equal(github.created[0].base, "main");
});

test("branch opens it against the public branch and leaves the default branch alone", async (t) => {
  const made = scratch(t),
    github = noMerge(fakeGitHub());
  git(made.pub, "branch", "rewrite", "main");
  const before = git(made.pub, "rev-parse", "main", "rewrite");
  made.store.put("mirror_forward", {
    ...made.store.get("mirror_forward", made.sha),
    base: "rewrite",
  });
  const result = await run(
    made,
    github,
    policy("nudge", { forwardTarget: "branch", publicBranch: "rewrite" }),
  );
  assert.equal(result.record.state, "public_open");
  assert.equal(github.created.length, 1);
  assert.equal(github.created[0].base, "rewrite");
  assert.equal(git(made.pub, "rev-parse", "main", "rewrite"), before);
  assert.deepEqual(branches(made.pub).sort(), [
    forwardName(made.sha),
    "main",
    "rewrite",
  ]);
});

test("the forward step records a merge into the public branch copy with its base", async (t) => {
  const made = scratch(t),
    pulls = {
      main: [],
      rewrite: [
        {
          number: 9,
          merged_at: "2026-02-01T00:00:00Z",
          merge_commit_sha: "c".repeat(40),
          base: { ref: "rewrite" },
          head: { ref: "avoozl/task-9" },
        },
      ],
    },
    github = {
      repository: async () => ({ default_branch: "main" }),
      listPullRequests: async (_repo, { base }) => pulls[base] ?? [],
      pullRequest: async () => ({ merged_by: { login: "dana" } }),
      commit: async () => ({ parents: [{ sha: "p1" }] }),
    },
    pol = policy("nudge", { forwardTarget: "branch", publicBranch: "rewrite" }),
    options = {
      policy: pol,
      now: Date.parse("2026-01-01T00:00:00Z"),
      publicBranches: () => ["rewrite"],
    };
  await mirrorForwardStep(made.store, github, options);
  const record = made.store.get("mirror_forward", "c".repeat(40));
  assert.equal(record.base, "rewrite");
  assert.equal(record.taskId, "task-9");
});

test("the sync step also fast-forwards the copy of a public branch, with its own refspec", async () => {
  const heads = {
      [SOURCE]: { main: "s2", rewrite: "r2" },
      [MIRROR]: { main: "s2" },
    },
    copies = [],
    github = {
      available: () => true,
      repository: async (value) => ({ default_branch: "main", value }),
      branch: async (repo, name) => {
        const sha = heads[repo]?.[name];
        if (!sha) throw Object.assign(Error("Not Found"), { status: 404 });
        return { commit: { sha } };
      },
      compareCommits: async () => ({ status: "ahead" }),
    },
    pol = policy("nudge", { forwardTarget: "branch", publicBranch: "rewrite" }),
    options = {
      policy: pol,
      copy: async (input) => copies.push(input),
      publicBranches: () => ["rewrite"],
    };
  const step = await mirrorSyncStep({ ...fakeStore() }, github, options);
  assert.deepEqual(step.errors, []);
  assert.deepEqual(
    copies.map((c) => [c.branch, c.sha]),
    [["rewrite", "r2"]],
  );
  // A diverged copy is not touched: the source comes in through the
  // branch's own tracking branch and import pull request (R102.21).
  heads[MIRROR].rewrite = "x1";
  github.compareCommits = async () => ({ status: "diverged" });
  const created = [];
  github.listPullRequests = async () => [];
  github.createPullRequest = async (_repo, input) => {
    created.push(input);
    return { number: 4, head: { ref: input.head } };
  };
  copies.length = 0;
  const store = fakeStore(),
    again = await mirrorSyncStep(store, github, options);
  assert.deepEqual(again.errors, []);
  assert.deepEqual(
    copies.map((c) => [c.branch, c.target, c.sha]),
    [["rewrite", "avoozl-upstream/rewrite", "r2"]],
  );
  assert.deepEqual(
    created.map((c) => [c.head, c.base]),
    [["avoozl-upstream/rewrite", "rewrite"]],
  );
  assert.equal(again.notify.length, 1);
  assert.match(mirrorNeedsYou(store)[0].title, /branch rewrite/);
});

function fakeStore() {
  const meta = {};
  return { getMeta: (k) => meta[k], setMeta: (k, v) => (meta[k] = v) };
}

// An epic whose work sits on a mirror branch, never pushed to the source.
function epic(t, extra = {}, target = { forwardTarget: "batch" }) {
  const made = scratch(t),
    { store, work } = made;
  git(work, "checkout", "-q", "-b", "rewrite/epic", "main");
  // Two commits with files: the net change has two files and no history.
  for (const [name, text] of [
    ["e1.txt", "one\n"],
    ["e2.txt", "two\n"],
  ]) {
    writeFile(work, name, text);
    git(work, "add", ".");
    git(work, "commit", "-q", "-m", `Crew work on ${name}`);
  }
  git(work, "push", "-q", "private", "rewrite/epic:refs/heads/rewrite/epic");
  git(work, "checkout", "-q", "main");
  store.put("approvals", {
    id: "approval-rewrite",
    planId: "p1",
    hash: "h",
    files: withFacts({
      "tasks.md": "- [ ] 1 Rewrite\n",
      "avoozl/manifest.json": JSON.stringify({
        integrationBranch: "rewrite/epic",
        ...target,
        tasks: { 1: { kind: "leaf", repository: SOURCE } },
      }),
    }),
  });
  store.put("plans", {
    id: "p1",
    spec: "rewrite",
    title: "Rewrite the parser",
    approvalId: "approval-rewrite",
    state: "approved",
    ...extra,
  });
  store.mutate("epic tasks", (data) => {
    for (const id of ["t1", "t2"])
      data.tasks.push({
        id,
        title: id,
        scope: "catalog",
        status: "planned",
        track: "catalog",
        tags: [],
        acceptance: ["ok"],
        planId: "p1",
      });
  });
  return made;
}
const writeFile = (dir, name, text) =>
  fs.writeFileSync(path.join(dir, name), text);
const finish = (store, status = "accepted") =>
  store.mutate("done", (data) => {
    for (const task of data.tasks)
      if (task.planId === "p1") task.status = status;
  });
const batchPolicy = (extra = {}) =>
  policy("nudge", { forwardTarget: "batch", ...extra });

test("a batch epic makes one record when it is done, and not before", async (t) => {
  const made = epic(t),
    pol = batchPolicy();
  await mirrorBatchStep(made.store, null, { policy: pol });
  assert.equal(made.store.get("mirror_forward", "batch:p1"), null);
  finish(made.store);
  await mirrorBatchStep(made.store, null, { policy: pol });
  await mirrorBatchStep(made.store, null, { policy: pol });
  const batch = made.store
    .list("mirror_forward")
    .filter((record) => record.batch);
  assert.equal(batch.length, 1);
  assert.equal(batch[0].id, batchId({ id: "p1" }));
  assert.equal(batch[0].title, "Rewrite the parser");
});

test("a batch epic opens exactly one public pull request from one new commit", async (t) => {
  const made = epic(t),
    github = noMerge(fakeGitHub()),
    pol = batchPolicy();
  finish(made.store);
  await mirrorBatchStep(made.store, null, { policy: pol });
  const pushes = made.commands.length;
  const result = await run(made, github, pol, "batch:p1");
  assert.equal(result.record.state, "public_open");
  assert.equal(github.created.length, 1);
  assert.equal(github.created[0].base, "main");
  assert.equal(github.created[0].title, "Rewrite the parser");
  // One commit on the source base, holding the net change, no history.
  assert.equal(
    git(made.pub, "rev-list", "--count", "main..avoozl/epic-rewrite"),
    "1",
  );
  assert.equal(
    git(made.pub, "log", "-1", "--format=%P", "avoozl/epic-rewrite"),
    git(made.pub, "rev-parse", "main"),
  );
  assert.equal(
    git(made.pub, "diff", "--name-only", "main", "avoozl/epic-rewrite"),
    "e1.txt\ne2.txt",
  );
  const log = git(
    made.pub,
    "log",
    "--format=%an %s",
    "main..avoozl/epic-rewrite",
  );
  assert.equal(log, "dana Rewrite the parser");
  // The epic's mirror branch never exists on the source.
  assert.deepEqual(branches(made.pub).sort(), ["avoozl/epic-rewrite", "main"]);
  assert.ok(made.commands.length > pushes);
  // A second press finds the first pull request.
  const again = await run(made, github, pol, "batch:p1");
  assert.equal(again.again, true);
  assert.equal(github.created.length, 1);
});

test("a batch epic can aim at a public branch, and every protection still runs", async (t) => {
  const made = epic(t, {}, { forwardTarget: "batch", publicBranch: "rewrite" }),
    github = noMerge(fakeGitHub());
  git(made.pub, "branch", "rewrite", "main");
  finish(made.store);
  const pol = batchPolicy({ publicBranch: "rewrite" });
  await mirrorBatchStep(made.store, null, { policy: pol });
  const result = await run(made, github, pol, "batch:p1");
  assert.equal(github.created[0].base, "rewrite");
  assert.equal(result.record.state, "public_open");
  // The protections run on the batch: an excluded path blocks it.
  const other = epic(t),
    blockedGithub = fakeGitHub();
  git(other.work, "checkout", "-q", "rewrite/epic");
  fs.mkdirSync(path.join(other.work, ".kiro"));
  writeFile(other.work, ".kiro/x.md", "x\n");
  git(other.work, "add", ".");
  git(other.work, "commit", "-q", "-m", "private notes");
  git(
    other.work,
    "push",
    "-q",
    "private",
    "rewrite/epic:refs/heads/rewrite/epic",
  );
  finish(other.store);
  await mirrorBatchStep(other.store, null, { policy: batchPolicy() });
  const blocked = await run(other, blockedGithub, batchPolicy(), "batch:p1");
  assert.equal(blocked.blocked, true);
  assert.match(blocked.reason, /path-kiro/);
  assert.equal(blockedGithub.created.length, 0);
});

test("a batch epic's task counts as done on its mirror merge; others wait for the public merge", async (t) => {
  const made = epic(t),
    task = made.store.read().tasks.find((x) => x.id === "t1"),
    repo = { mirror: policy().repositories[SOURCE].mirror };
  assert.equal(publicMergeReached(made.store, task, repo), true);
  // A task under an epic that forwards each change waits for its public merge.
  made.store.put("approvals", {
    id: "approval-each",
    planId: "p2",
    hash: "h2",
    files: { "tasks.md": "---\nforwardTarget: each\n---\n" },
  });
  made.store.put("plans", {
    id: "p2",
    spec: "each",
    approvalId: "approval-each",
  });
  assert.equal(
    publicMergeReached(made.store, { id: "t9", planId: "p2" }, repo),
    false,
  );
  assert.equal(
    publicMergeReached(made.store, { id: "other", planId: "none" }, repo),
    false,
  );
});

test("a public branch with a merged change is a Needs you row naming its head; nothing merges it", async (t) => {
  const made = scratch(t),
    head = "a".repeat(40),
    calls = [],
    github = noMerge({
      repository: async () => ({ default_branch: "main" }),
      branch: async (_repo, name) => (
        calls.push(name), { commit: { sha: head } }
      ),
      compareCommits: async () => ({ status: "ahead" }),
    }),
    pol = policy("nudge", { forwardTarget: "branch", publicBranch: "rewrite" });
  made.store.put("mirror_forward", {
    ...made.store.get("mirror_forward", made.sha),
    state: "public_merged",
    base: "rewrite",
  });
  await publicBranchStep(made.store, github, { policy: pol });
  const rows = publicBranchRows(made.store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].detail, /Head aaaaaaa was checked/);
  assert.match(rows[0].detail, /Avoozl never merges it/);
  // Once the default branch holds it, the row goes.
  github.compareCommits = async () => ({ status: "behind" });
  await publicBranchStep(made.store, github, { policy: pol });
  assert.equal(publicBranchRows(made.store).length, 0);
});
