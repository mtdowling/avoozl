// Batch branches and queue registration for `landing: train` (lt-1.2).
// Real git (a bare origin and a checkout); nothing live.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest } from "../../model.mjs";
import { bindContentRules } from "../content-rules.mjs";
import { integrateVerified } from "../delivery.mjs";
import { queueBatch, submitBranch } from "../integrator-trains.mjs";
import { landingQueue } from "../landing-queue.mjs";
import { loadLayeredConfig } from "../layered-config.mjs";
import { Store } from "../store.mjs";
import { takeOverSpec } from "../spec-takeover.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const leaf = (id) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: [id + " works."],
  repository: "app",
  planId: "s",
});
// A check that fails while the tree has a file named FAIL.
const CHECK = [
  process.execPath,
  "-e",
  "process.exit(require('fs').existsSync('FAIL') ? 1 : 0)",
];
const MACHINE = { hostname: "made-up-host", username: "madeupuser" };

async function workspace(t, { cheap = [], approved = true } = {}) {
  const root = temporaryDirectory("avoozl-batch-"),
    origin = path.join(root, "origin.git"),
    checkout = path.join(root, "app");
  git(root, "init", "--bare", "-b", "main", origin);
  git(root, "clone", "-q", origin, checkout);
  for (const [k, v] of [
    ["user.name", "Test"],
    ["user.email", "test@example.com"],
  ])
    git(checkout, "config", k, v);
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  git(checkout, "push", "-q", "origin", "main");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      landing: {
        trains: {
          ci: { workflow: "ci.yml" },
          validation: { cheap },
          targets: { main: { policy: "gated" } },
        },
      },
    }),
  );
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  bindContentRules(store, {
    workspaceRoot: root,
    configFile: path.join(root, "machine.json"),
  });
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("t1"), leaf("t2")],
    edges: [],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    landing: "train",
    checks: [CHECK],
    worktreeRoot: path.join(root, "wt"),
  });
  store.put("plans", {
    id: "s",
    spec: "s",
    hash: digest("plan s"),
    ...(approved ? { state: "approved" } : {}),
  });
  store.put("receipts", {
    id: "spec-journal:s",
    kind: "spec-journal",
    planId: "s",
    home: "local",
  });
  await takeOverSpec(store, { workspaceRoot: root, actor: "Operator" }, "s");
  return {
    root,
    origin,
    checkout: fs.realpathSync.native(checkout),
    store,
    config: () => loadLayeredConfig({ workspaceRoot: root }).config,
  };
}

// A task worktree with one commit on top of `from`, and a verified delivery.
function verified(w, taskId, { file = `${taskId}.txt`, from = "main" } = {}) {
  const branch = `avoozl/${taskId}`,
    wt = path.join(w.root, "wt", taskId);
  git(w.checkout, "worktree", "add", "-q", "-b", branch, wt, from);
  return { wt, branch, ...commitIn(wt, taskId, file), taskId };
}
function commitIn(wt, taskId, file, message = `Do ${taskId}`) {
  fs.writeFileSync(path.join(wt, file), taskId + "\n");
  git(wt, "add", ".");
  git(wt, "commit", "-qm", message);
  return { commit: git(wt, "rev-parse", "HEAD") };
}
const taskOf = (w, id) => w.store.read().tasks.find((t) => t.id === id);
const remoteHead = (w, branch) =>
  git(w.origin, "rev-parse", "--verify", `refs/heads/${branch}`);
const queue = (w) => landingQueue(w.store, { projectId: "app", base: "main" });
const queueIt = (w, task, commit, extra = {}) =>
  queueBatch(w.store, {
    project: w.store.get("projects", "app"),
    task: taskOf(w, task),
    commit,
    config: w.config(),
    machine: {},
    ...extra,
  });

test("a verified task's commit is pushed as avoozl-batch/<task> and queued with every field", async (t) => {
  const w = await workspace(t),
    start = git(w.origin, "rev-parse", "main"),
    { commit, wt, branch, taskId } = verified(w, "t1");
  w.store.put("task_worktrees", {
    id: taskId,
    taskId,
    path: wt,
    branch,
    repository: "app",
  });
  w.store.put("task_deliveries", {
    id: taskId,
    taskId,
    state: "verified",
    commit,
    attempts: [],
    verifications: [],
  });
  await integrateVerified(w.store);
  assert.equal(remoteHead(w, "avoozl-batch/t1"), commit);
  assert.equal(
    git(w.origin, "rev-parse", "main"),
    start,
    "the trunk is not pushed",
  );
  const [entry] = queue(w);
  assert.equal(entry.key, "t1");
  assert.equal(entry.branch, "avoozl-batch/t1");
  assert.equal(entry.commit, commit);
  assert.equal(entry.forkPoint, start);
  assert.deepEqual(entry.builtOn, []);
  assert.deepEqual(entry.footprint, ["t1.txt"]);
  assert.equal(entry.cheap.commit, commit);
  assert.equal(entry.state, "queued");
  assert.equal(w.store.get("task_deliveries", "t1").landing.commit, commit);
  // A second pass queues nothing new and pushes nothing.
  await integrateVerified(w.store);
  assert.equal(queue(w).length, 1);
});

test("a planted content-rule match blocks the push and the entry", async (t) => {
  const w = await workspace(t),
    { wt } = verified(w, "t1"),
    { commit } = commitIn(wt, "t1", "leak.txt", `Ran on ${MACHINE.hostname}`);
  await assert.rejects(
    queueIt(w, "t1", commit, { machine: MACHINE }),
    /content scan refused this push, nothing was pushed: rule machine-name/,
  );
  assert.equal(git(w.origin, "branch", "--list", "avoozl-batch/*"), "");
  assert.equal(queue(w).length, 0);
});

test("submit refuses a wrong prefix, an unapproved plan and a failed cheap check, each naming the step", async (t) => {
  const w = await workspace(t, { cheap: [CHECK] }),
    { wt, commit } = verified(w, "t1");
  git(wt, "push", "-q", "origin", "HEAD:refs/heads/other/t1");
  git(wt, "push", "-q", "origin", "HEAD:refs/heads/avoozl-batch/t1");
  await assert.rejects(
    submitBranch(w.store, w.root, { taskId: "t1", branch: "other/t1" }),
    /does not start with the batch prefix avoozl-batch\//,
  );
  // A failing head.
  const bad = commitIn(wt, "t1", "FAIL");
  git(wt, "push", "-q", "origin", "HEAD:refs/heads/avoozl-batch/t1");
  await assert.rejects(
    submitBranch(w.store, w.root, { taskId: "t1", branch: "avoozl-batch/t1" }),
    /the cheap check .* failed at/,
  );
  assert.equal(queue(w).length, 0);
  // A passing head queues.
  fs.rmSync(path.join(wt, "FAIL"));
  git(wt, "rm", "-q", "--cached", "FAIL");
  const fixed = commitIn(wt, "t1", "t1.txt", "Fix");
  git(wt, "push", "-q", "origin", "HEAD:refs/heads/avoozl-batch/t1");
  const done = await submitBranch(w.store, w.root, {
    taskId: "t1",
    branch: "avoozl-batch/t1",
  });
  assert.equal(done.commit, fixed.commit);
  assert.notEqual(done.commit, commit);
  assert.notEqual(done.commit, bad.commit);
  assert.equal(queue(w)[0].cheap.source, "submit");
});

test("submit refuses a task outside an approved plan", async (t) => {
  const w = await workspace(t, { approved: false }),
    { wt } = verified(w, "t1");
  git(wt, "push", "-q", "origin", "HEAD:refs/heads/avoozl-batch/t1");
  await assert.rejects(
    submitBranch(w.store, w.root, { taskId: "t1", branch: "avoozl-batch/t1" }),
    /not in an approved plan/,
  );
  assert.equal(queue(w).length, 0);
});

test("a descendant head requeues in place; a rewritten head is refused and nothing changes", async (t) => {
  const w = await workspace(t),
    one = verified(w, "t1"),
    two = verified(w, "t2");
  await queueIt(w, "t1", one.commit);
  await queueIt(w, "t2", two.commit);
  const [first, second] = queue(w);
  assert.deepEqual([first.key, second.key], ["t1", "t2"]);
  // A descendant: same place in line, new head on the remote.
  const next = commitIn(one.wt, "t1", "more.txt", "More");
  await queueIt(w, "t1", next.commit);
  assert.deepEqual(
    queue(w).map((e) => [e.key, e.seq]),
    [
      ["t1", first.seq],
      ["t2", second.seq],
    ],
  );
  assert.equal(queue(w)[0].commit, next.commit);
  assert.equal(remoteHead(w, "avoozl-batch/t1"), next.commit);
  // A rewritten head: amend the last commit.
  git(one.wt, "commit", "-q", "--amend", "-m", "Rewritten");
  const rewritten = git(one.wt, "rev-parse", "HEAD");
  await assert.rejects(
    queueIt(w, "t1", rewritten),
    /does not descend from the pushed avoozl-batch\/t1/,
  );
  assert.equal(remoteHead(w, "avoozl-batch/t1"), next.commit);
  assert.equal(queue(w)[0].commit, next.commit);
});

test("a branch built on another queued branch records it in builtOn", async (t) => {
  const w = await workspace(t),
    one = verified(w, "t1");
  await queueIt(w, "t1", one.commit);
  const two = verified(w, "t2", { from: one.branch });
  const entry = await queueIt(w, "t2", two.commit);
  assert.deepEqual(entry.builtOn, ["t1"]);
  assert.equal(entry.forkPoint, git(w.origin, "rev-parse", "main"));
  assert.deepEqual(entry.footprint, ["t1.txt", "t2.txt"]);
});

test("landing: train with no policy queues nothing and the delivery waits for a decision", async (t) => {
  const w = await workspace(t);
  fs.writeFileSync(
    path.join(w.root, ".avoozl.json"),
    JSON.stringify({ version: 1 }),
  );
  const { wt, commit, branch, taskId } = verified(w, "t1");
  w.store.put("task_worktrees", {
    id: taskId,
    taskId,
    path: wt,
    branch,
    repository: "app",
  });
  w.store.put("task_deliveries", {
    id: taskId,
    taskId,
    state: "verified",
    commit,
    attempts: [],
    verifications: [],
  });
  const { notify } = await integrateVerified(w.store);
  assert.equal(queue(w).length, 0);
  assert.equal(git(w.origin, "branch", "--list", "avoozl-batch/*"), "");
  assert.equal(notify.length, 1);
  assert.match(notify[0].text, /landing\.trains\.targets\.main\.policy/);
  assert.equal(w.store.get("task_deliveries", "t1").state, "decision");
});
