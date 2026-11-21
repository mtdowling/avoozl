import { nativeDispatch } from "./executor-fixture.mjs";
// Proof P45 (design §4.24–§4.25): staying current with the base branch. Every
// value is fake: a temporary workspace with a real Git checkout, fake workers
// that report through Operations, and a fake GitHub that answers only the
// reads it is given; anything else is recorded.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../api/operations.mjs";
import { Store } from "../store/store.ts";
import {
  deliveryPolicy,
  integrateVerified,
  rebaseForIntegration,
} from "../delivery/delivery.mjs";
import { conflictsView } from "../api/page-views.mjs";
import { fixture, snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { loopOn } from "./fixtures.mjs";

// The tick starts and lands work only with the server loop on.
loopOn();

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: [id + " works."],
  repository: "app",
  ...extra,
});

// A local workspace with a real checkout `app`, leaves a1, a2 (`investigate: false`), a3,
// and a bugfix spec's f1.
function local(t, delivery = {}) {
  const root = temporaryDirectory("avoozl-p45-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({
    ...snapshot(),
    tasks: [
      leaf("a1"),
      leaf("a2", { investigate: false }),
      leaf("a3"),
      leaf("f1", { specType: "bugfix" }),
    ],
    edges: [],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      lanes: { local: 4 },
      delivery: { ...delivery },
    }),
  );
  const ops = new Operations(store, { workspaceRoot: root });
  const bound = [];
  const tick = () =>
    ops.execute("workspace.tick", {
      sessions: bound.map((slot) => ({ target: slot, status: "working" })),
    });
  const bind = async (taskId, slot, extra = {}) => {
    bound.push(slot);
    await ops.execute("session.bind", {
      taskId,
      slot,
      source: "tick",
      title: `avoozl:${taskId} ${extra.role || "worker"}`,
      ...extra,
    });
  };
  const report = (slot, input) =>
    ops.execute("session.report", input, undefined, as(slot));
  return {
    root,
    checkout: fs.realpathSync.native(checkout),
    store,
    ops,
    tick,
    bind,
    report,
  };
}

const findings = (confidence = "high") => ({
  read: "src/app.js and its test",
  cause: "the loader skips empty lines",
  plan: "keep empty lines in the loader",
  check: "the loader test with an empty line",
  confidence,
});

test("P45 (5) local: a task branch behind the integration branch is merged forward with a merge commit", async (t) => {
  const w = local(t, { investigate: { mode: "off" } });
  const tree = await w.ops.execute("worktree.prepare", { taskId: "a1" });
  fs.writeFileSync(path.join(tree.path, "a1.txt"), "a1\n");
  git(tree.path, "add", ".");
  git(tree.path, "commit", "-m", "a1");
  const commit = git(tree.path, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(w.checkout, "other.txt"), "main moved\n");
  git(w.checkout, "add", ".");
  git(w.checkout, "commit", "-m", "Main moves");
  // A `process` child's result folder is Avoozl's own, not a change that
  // holds the merge forward (nk-p1 preflight).
  fs.mkdirSync(path.join(tree.path, ".avoozl"), { recursive: true });
  fs.writeFileSync(path.join(tree.path, ".avoozl", "result.json"), "{}");
  const moved = await rebaseForIntegration(
    w.store.get("repositories", "app"),
    w.store.get("task_worktrees", "a1"),
    commit,
  );
  assert.equal(moved.how, "merge");
  const parents = git(
    tree.path,
    "rev-list",
    "--parents",
    "-n",
    "1",
    "HEAD",
  ).split(" ");
  assert.equal(parents.length, 3, "a merge commit");
  assert.ok(parents.includes(commit), "the reviewed commit is kept as it was");
});

test("P45 (5) local: a conflict when merging the base forward goes back to the worker chat", async (t) => {
  const w = local(t, { investigate: { mode: "off" } });
  await w.bind("a1", "w-a1", { attempt: 1 });
  const tree = await w.ops.execute("worktree.prepare", { taskId: "a1" });
  fs.writeFileSync(path.join(tree.path, "same.txt"), "from the task\n");
  git(tree.path, "add", ".");
  git(tree.path, "commit", "-m", "a1");
  const commit = git(tree.path, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(w.checkout, "same.txt"), "from main\n");
  git(w.checkout, "add", ".");
  git(w.checkout, "commit", "-m", "Main moves");
  w.store.put("task_deliveries", {
    id: "a1",
    taskId: "a1",
    state: "verified",
    commit,
    attempts: [{ attempt: 1, slot: "w-a1", outcome: "done", commit }],
    verifications: [],
  });
  const { messages, notify } = await integrateVerified(w.store, {});
  assert.deepEqual(notify, []);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].slot, "w-a1");
  assert.match(messages[0].text, /same\.txt/);
  const delivery = w.store.get("task_deliveries", "a1");
  assert.equal(delivery.state, "running");
  assert.equal(delivery.landingConflicts.length, 1);
  assert.equal(git(tree.path, "rev-parse", "HEAD"), commit, "nothing merged");
});
