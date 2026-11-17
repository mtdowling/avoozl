// Task 41.5: Prepare and qualified-ref resolution agree on the spec base,
// and a landed base merges back into the working branch.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { mergeBaseBack, specBase, specBaseRef } from "../spec-base.mjs";
import { checkpointBranch, workingBranch } from "../working-heads.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function repo() {
  const root = temporaryDirectory("avoozl-spec-base-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-q", "-m", "Start");
  return { root, checkout: fs.realpathSync.native(checkout) };
}

// A commit on a new branch from `from`, writing `files`.
function commitOn(checkout, branch, from, files) {
  git(checkout, "checkout", "-q", "-B", branch, from);
  for (const [file, text] of Object.entries(files))
    fs.writeFileSync(path.join(checkout, file), text);
  git(checkout, "add", ".");
  git(checkout, "commit", "-q", "-m", `Work on ${branch}`);
  const commit = git(checkout, "rev-parse", "HEAD");
  git(checkout, "checkout", "-q", "main");
  return commit;
}

test("the spec base is the working branch, then a legacy integration branch, then the base", async () => {
  const { checkout } = repo(),
    main = git(checkout, "rev-parse", "main"),
    options = {
      spec: "reader",
      base: "main",
      legacy: [null, "bad..name", "epic"],
    };
  assert.deepEqual(await specBase(checkout, options), {
    branch: "main",
    kind: "base",
    commit: main,
  });
  const epic = commitOn(checkout, "epic", "main", { "e.txt": "e\n" });
  assert.deepEqual(await specBase(checkout, options), {
    branch: "epic",
    kind: "integration",
    commit: epic,
  });
  const work = commitOn(checkout, workingBranch("reader"), "main", {
    "w.txt": "w\n",
  });
  const found = await specBaseRef(checkout, {
    ...options,
    repository: "acme/app",
  });
  assert.deepEqual(
    [found.kind, found.ref.source.branch, found.ref.source.commit],
    ["working", workingBranch("reader"), work],
  );
  assert.deepEqual(found.ref.target, { repository: "acme/app", base: "main" });
  assert.equal(
    (await specBase(checkout, { ...options, spec: "../x" })).kind,
    "integration",
    "a spec id that cannot name a branch has no working branch",
  );
});

test("Prepare starts a task from its spec's working head and records the exact base", async (t) => {
  const { root, checkout } = repo(),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  const leaf = (id, extra) => ({
    id,
    title: "Task " + id,
    scope: "catalog",
    status: "planned",
    epic: "sample",
    track: "catalog",
    tags: [],
    acceptance: ["Works."],
    repository: "app",
    ...extra,
  });
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("a", { planId: "reader" }), leaf("b")],
    edges: [],
  });
  store.put("projects", { id: "app", root: checkout, baseBranch: "main" });
  store.put("plans", { id: "reader", spec: "reader", state: "approved" });
  const work = commitOn(checkout, workingBranch("reader"), "main", {
      "w.txt": "verified\n",
    }),
    ops = new Operations(store, { workspaceRoot: root });
  const prepared = await ops.execute("worktree.prepare", { taskId: "a" });
  assert.equal(prepared.head, work);
  const ref = await specBaseRef(checkout, {
    spec: "reader",
    repository: "acme/app",
    base: "main",
  });
  assert.deepEqual(store.get("task_worktrees", "a").base, {
    branch: workingBranch("reader"),
    commit: ref.ref.source.commit,
    kind: "working",
  });
  // A task with no spec keeps the project's base branch.
  const plain = await ops.execute("worktree.prepare", { taskId: "b" });
  assert.equal(plain.head, git(checkout, "rev-parse", "main"));
  assert.equal(store.get("task_worktrees", "b").base.kind, "base");
});

test("a landed base merges back with a merge commit, keeping unlanded work and checkpoints", async () => {
  const { checkout } = repo(),
    branch = workingBranch("reader"),
    start = git(checkout, "rev-parse", "main");
  // Two verified integrations on the working branch: one landed, one not.
  const landedTask = commitOn(checkout, "t1", start, { "a.txt": "a\n" }),
    unlanded = commitOn(checkout, "t2", start, { "b.txt": "b\n" });
  git(checkout, "branch", branch, start);
  git(checkout, "checkout", "-q", branch);
  git(checkout, "merge", "-q", "--no-ff", "-m", "Integrate t1", landedTask);
  git(checkout, "merge", "-q", "--no-ff", "-m", "Integrate t2", unlanded);
  git(checkout, "checkout", "-q", "main");
  const checkpoint = checkpointBranch("reader", "t3"),
    unfinished = commitOn(checkout, checkpoint, start, { "c.txt": "wip\n" });
  // The target lands t1 alone, plus an unrelated change.
  git(checkout, "merge", "-q", "--no-ff", "-m", "Land t1", landedTask);
  fs.writeFileSync(path.join(checkout, "other.txt"), "other\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-q", "-m", "Other work");
  const landed = git(checkout, "rev-parse", "main"),
    before = git(checkout, "rev-parse", branch);

  const result = await mergeBaseBack(checkout, {
    spec: "reader",
    landed,
    base: "main",
  });
  assert.equal(result.merged, true);
  const head = git(checkout, "rev-parse", branch);
  assert.equal(
    git(checkout, "rev-list", "--parents", "-n", "1", head),
    `${head} ${before} ${landed}`,
    "a merge commit: working head first, then the landed base",
  );
  for (const commit of [unlanded, landedTask, landed])
    git(checkout, "merge-base", "--is-ancestor", commit, head);
  assert.equal(git(checkout, "rev-parse", checkpoint), unfinished);
  assert.equal(git(checkout, "rev-parse", "main"), landed, "main is untouched");

  const again = await mergeBaseBack(checkout, {
    spec: "reader",
    landed,
    base: "main",
  });
  assert.deepEqual([again.merged, again.reason], [false, "already merged"]);
  assert.equal(
    (await mergeBaseBack(checkout, { spec: "other", landed })).reason,
    "no working branch",
  );

  // A conflicting base leaves the working branch unchanged.
  fs.writeFileSync(path.join(checkout, "b.txt"), "different\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-q", "-m", "Clash");
  const clash = await mergeBaseBack(checkout, {
    spec: "reader",
    landed: git(checkout, "rev-parse", "main"),
  });
  assert.deepEqual([clash.merged, clash.conflict], [false, ["b.txt"]]);
  assert.equal(git(checkout, "rev-parse", branch), head);
});
