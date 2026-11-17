// The tick lands `direct` projects on their remote (task 41.9). Real git (a
// bare "origin" and a checkout) and real checks; nothing live.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest } from "../../model.mjs";
import { Store } from "../store.mjs";
import { integrateVerified } from "../delivery.mjs";
import { landingQueue } from "../landing-queue.mjs";
import { landDirect } from "../direct-landing.mjs";
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
// The check fails while the tree has a file named FAIL.
const CHECK = [
  process.execPath,
  "-e",
  "process.exit(require('fs').existsSync('FAIL') ? 1 : 0)",
];

async function workspace(t) {
  const root = temporaryDirectory("avoozl-directland-"),
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
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("t1"), leaf("t2")],
    edges: [],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    landing: "direct",
    checks: [CHECK],
    worktreeRoot: path.join(root, "wt"),
  });
  store.put("plans", { id: "s", spec: "s", hash: digest("plan s") });
  store.put("receipts", {
    id: "spec-journal:s",
    kind: "spec-journal",
    planId: "s",
    home: "local",
  });
  await takeOverSpec(store, { workspaceRoot: root, actor: "Operator" }, "s");
  return { root, origin, checkout: fs.realpathSync.native(checkout), store };
}

// A task worktree with one commit, a verified delivery and a worker chat.
function verified(w, taskId, file = `${taskId}.txt`) {
  const branch = `avoozl/${taskId}`,
    wt = path.join(w.root, "wt", taskId);
  git(w.checkout, "worktree", "add", "-q", "-b", branch, wt, "main");
  fs.writeFileSync(path.join(wt, file), taskId + "\n");
  git(wt, "add", ".");
  git(wt, "commit", "-qm", "Do " + taskId);
  const commit = git(wt, "rev-parse", "HEAD");
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
  w.store.put("session_bindings", {
    id: "slot-" + taskId,
    slot: "slot-" + taskId,
    taskId,
    role: "worker",
    attempt: 1,
    status: "working",
  });
  return { commit, wt, branch };
}

const step = (w) =>
  landDirect(w.store, { workspaceRoot: w.root, rounds: 2, machine: {} });

test("a verified task is queued, checked at the candidate and pushed by the tick", async (t) => {
  const w = await workspace(t),
    start = git(w.origin, "rev-parse", "main"),
    { commit, wt, branch } = verified(w, "t1");
  await integrateVerified(w.store);
  // Queued, not pushed.
  assert.equal(git(w.origin, "rev-parse", "main"), start);
  assert.equal(
    landingQueue(w.store, { projectId: "app", base: "main" }).length,
    1,
  );
  const result = await step(w);
  assert.deepEqual(result.notify, []);
  const landed = git(w.origin, "rev-parse", "main");
  assert.notEqual(landed, start);
  git(w.origin, "merge-base", "--is-ancestor", commit, landed);
  const delivery = w.store.get("task_deliveries", "t1");
  assert.equal(delivery.state, "integrated");
  assert.equal(delivery.integratedCommit, landed);
  assert.equal(
    w.store.read().tasks.find((x) => x.id === "t1").integration.commit,
    landed,
  );
  // The local base follows, and the task's worktree and branch are gone.
  assert.equal(git(w.checkout, "rev-parse", "main"), landed);
  assert.equal(fs.existsSync(wt), false);
  assert.equal(w.store.get("task_worktrees", "t1"), null);
  assert.throws(() => git(w.checkout, "rev-parse", "--verify", branch));
  // A second step has nothing to do.
  await step(w);
  assert.equal(git(w.origin, "rev-parse", "main"), landed);
});

test("a failed check at the candidate goes back to the chat and pushes nothing", async (t) => {
  const w = await workspace(t),
    start = git(w.origin, "rev-parse", "main");
  verified(w, "t1", "FAIL");
  await integrateVerified(w.store);
  const result = await step(w);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].slot, "slot-t1");
  assert.match(result.messages[0].text, /landing candidate on main/);
  assert.match(result.messages[0].text, /exit 1/);
  assert.equal(w.store.get("task_deliveries", "t1").state, "running");
  assert.equal(git(w.origin, "rev-parse", "main"), start);
});

// The round sent back is finished by the same attempt's next done report,
// which replaces the first and goes through Verify again on the new commit.
// A `process` child sent back after landing is resumed by the message: its
// session reads as working again, so the backend reads the resumed run's
// result file, and it is told to finish with that file, not a commit.
test("a process worker sent back after landing is watched again and told to exit", async (t) => {
  const w = await workspace(t),
    { commit } = verified(w, "t1", "FAIL");
  w.store.put("session_bindings", {
    ...w.store.get("session_bindings", "slot-t1"),
    status: "closed",
    source: "tick",
    executor: "process",
    report: { kind: "done", commit, at: "2026-01-01T00:00:00.000Z" },
  });
  await integrateVerified(w.store);
  const result = await step(w);
  assert.match(result.messages[0].text, /\.avoozl\/result\.json/);
  assert.doesNotMatch(result.messages[0].text, /report done again/);
  const reopened = w.store.get("session_bindings", "slot-t1");
  assert.equal(reopened.report, undefined, "the done is set aside");
  assert.equal(reopened.status, "working", "the backend watches the resume");
});

test("a chat sent back after landing is told to report done again", async (t) => {
  const w = await workspace(t);
  verified(w, "t1", "FAIL");
  await integrateVerified(w.store);
  const result = await step(w);
  assert.match(result.messages[0].text, /report done again/);
  assert.equal(
    w.store.get("session_bindings", "slot-t1").status,
    "working",
    "a chat's own status is left alone",
  );
});

test("without a take over nothing is queued or pushed", async (t) => {
  const w = await workspace(t),
    start = git(w.origin, "rev-parse", "main");
  w.store.setMeta("specDrivers", {});
  verified(w, "t2");
  const { notify } = await integrateVerified(w.store);
  assert.match(notify[0].text, /spec takeover/);
  assert.equal(w.store.get("task_deliveries", "t2").state, "decision");
  assert.equal(
    landingQueue(w.store, { projectId: "app", base: "main" }).length,
    0,
  );
  assert.equal(git(w.origin, "rev-parse", "main"), start);
});
