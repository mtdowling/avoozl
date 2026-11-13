// Task 12.8: small tasks share one run; checks once on the head; one
// rebase; a failing batch splits at no attempt cost (Requirement 46).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { listSpans } from "../flow.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
  size: "small",
  ...extra,
});

function setup(t, tasks, { flow } = {}) {
  const root = temporaryDirectory("avoozl-batch-"),
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
  store.importSnapshot({ ...snapshot(), tasks, edges: [] });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync(checkout),
    baseBranch: "main",
    checks: [["git", "status"]],
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      delivery: { concurrency: 1, retries: 1 },
      ...(flow ? { flow } : {}),
    }),
  );
  return { store, ops: new Operations(store, { workspaceRoot: root }) };
}

const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });
const tick = (ops, slots = []) =>
  ops.execute("workspace.tick", {
    sessions: slots.map((target) => ({ target, status: "idle" })),
  });

async function runBatch(ops, dispatch, slot, whileRunning = async () => {}) {
  await ops.execute("session.bind", {
    taskId: dispatch.task,
    slot,
    role: "worker",
    attempt: dispatch.attempt,
    source: "tick",
    title: dispatch.title,
    batch: dispatch.batch,
  });
  await whileRunning();
  const { path: worktree } = await ops.execute("worktree.prepare", {
    taskId: dispatch.task,
  });
  const commits = [];
  for (const id of dispatch.batch.tasks) {
    fs.writeFileSync(path.join(worktree, id + ".txt"), id + "\n");
    git(worktree, "add", ".");
    git(worktree, "commit", "-m", "Do " + id);
    const commit = git(worktree, "rev-parse", "HEAD");
    commits.push(commit);
    await ops.execute(
      "session.report",
      { taskId: id, kind: "done", commit },
      undefined,
      as(slot),
    );
  }
  return commits;
}

test("small tasks in one epic share one session, one check run on the head, and one integration", async (t) => {
  const { store, ops } = setup(t, [
    leaf("a1"),
    leaf("a2"),
    leaf("a3"),
    leaf("a4"),
    leaf("b1", { size: undefined }),
  ]);
  const first = await tick(ops);
  const workers = first.dispatch.filter((d) => d.role === "worker");
  assert.equal(workers.length, 1, "one slot");
  assert.deepEqual(
    workers[0].batch.tasks,
    ["a1", "a2", "a3"],
    "flow.batch.max 3 by epic",
  );
  assert.match(workers[0].brief, /one commit per task/);
  const commits = await runBatch(ops, workers[0], "w-batch", async () => {
    // a4 waits while its epic's batch runs, even with a free slot.
    fs.writeFileSync(
      path.join(path.dirname(store.filename), ".avoozl.json"),
      JSON.stringify({ version: 1, delivery: { concurrency: 2, retries: 1 } }),
    );
    const running = await ops.execute("workspace.tick", {
      sessions: [{ target: "w-batch", status: "working" }],
    });
    assert.deepEqual(
      running.dispatch.filter((d) => d.role === "worker").map((d) => d.task),
      ["b1"],
    );
  });
  const second = await tick(ops, ["w-batch"]);
  const verify = second.dispatch.filter((d) => d.role === "verifier");
  assert.deepEqual(
    verify.map((d) => [d.task, d.commit]),
    [["a3", commits[2]]],
    "checks once, on the head",
  );
  assert.deepEqual(
    ["a1", "a2", "a3"].map((id) => store.get("task_deliveries", id).state),
    ["done", "done", "done"],
  );
  await ops.execute("session.bind", {
    taskId: "a3",
    slot: "v1",
    role: "verifier",
    attempt: 1,
    source: "tick",
    commit: commits[2],
  });
  await ops.execute(
    "session.report",
    {
      taskId: "a3",
      kind: "done",
      commit: commits[2],
      checks: [{ command: "git status", exitCode: 0, durationMs: 5 }],
    },
    undefined,
    as("v1"),
  );
  await tick(ops, ["w-batch", "v1"]);
  const integrated = ["a1", "a2", "a3"].map(
    (id) => store.read().tasks.find((x) => x.id === id).integration?.commit,
  );
  assert.deepEqual(integrated, commits, "each task keeps its own commit");
  assert.equal(
    store.get("flow_batches", workers[0].batch.id).state,
    "integrated",
  );
  // Each task has its own timing, marked with its batch.
  for (const id of ["a1", "a2", "a3"])
    assert.ok(
      listSpans(store, { taskId: id }).some(
        (s) => s.role === "worker" && s.batchId === workers[0].batch.id,
      ),
      id,
    );
  const view = await ops.execute("delivery.view", {});
  assert.equal(
    view.items.find((i) => i.id === "a2").batch,
    workers[0].batch.id,
  );
});

test("a failing batch head splits the batch; each task retries alone at no attempt cost", async (t) => {
  const { store, ops } = setup(t, [leaf("a1"), leaf("a2")]);
  const [batch] = (await tick(ops)).dispatch;
  const commits = await runBatch(ops, batch, "w-batch");
  await tick(ops, ["w-batch"]);
  await ops.execute("session.bind", {
    taskId: "a2",
    slot: "v1",
    role: "verifier",
    attempt: 1,
    source: "tick",
    commit: commits[1],
  });
  await ops.execute(
    "session.report",
    {
      taskId: "a2",
      kind: "done",
      commit: commits[1],
      checks: [{ command: "git status", exitCode: 1 }],
    },
    undefined,
    as("v1"),
  );
  const after = await tick(ops, ["w-batch", "v1"]);
  for (const id of ["a1", "a2"]) {
    const delivery = store.get("task_deliveries", id);
    assert.equal(delivery.state, "failed", id);
    assert.equal(delivery.batchSplit, true);
    assert.equal(
      delivery.attempts.filter((a) => a.outcome === "failed").length,
      0,
      "no attempt counts",
    );
  }
  const retried = after.dispatch.filter((d) => d.role === "worker");
  assert.equal(retried.length, 1);
  assert.equal(
    retried[0].batch,
    undefined,
    "never batched again in this delivery",
  );
  assert.equal(retried[0].attempt, 2);
  // Batching off: flow.batch.max 1.
  const off = setup(t, [leaf("c1"), leaf("c2")], {
    flow: { batch: { max: 1 } },
  });
  assert.equal((await tick(off.ops)).dispatch[0].batch, undefined);
});
