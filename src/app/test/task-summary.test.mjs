// The AI summary on a task's Overview tab: cached by a hash of its inputs.
import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { classifyOperation } from "../operation-kinds.mjs";
import { taskSummaryDispatches } from "../task-summary.mjs";
import { fixture, snapshot } from "./fixtures.mjs";

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: [id + " is observable."],
  ...extra,
});

function workspace(t, title = "Task b") {
  const { root, store } = fixture(t),
    data = snapshot();
  data.tasks = [leaf("a", { status: "accepted" }), leaf("b", { title })];
  data.edges = [{ id: "a:requires:b", from: "a", to: "b", kind: "requires" }];
  store.importSnapshot(data);
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

const summary = (ops) =>
  ops.execute("task.detail", { id: "b" }).then((d) => d.summary);

test("a summary is written once per inputs, shown, and written again only when they change", async (t) => {
  const { store, ops, root } = workspace(t);
  assert.equal((await summary(ops)).state, "none");
  assert.equal(
    (await ops.execute("task.summary.request", { id: "b" })).state,
    "working",
  );
  // The cache: the same inputs ask for nothing more.
  await ops.execute("task.summary.request", { id: "b" });
  assert.equal(taskSummaryDispatches(store).length, 1);
  assert.equal(store.get("receipts", "task-summary:b").attempt, 1);
  assert.equal((await summary(ops)).state, "working");

  // The queued request opens one chat; its bound slot submits the text.
  await ops.execute("session.bind", {
    taskId: "task-summary:b",
    role: "task-summary",
    slot: "slot-s-1",
    attempt: 1,
  });
  assert.equal(taskSummaryDispatches(store).length, 0);
  const caller = { sessionKey: "dashboard:slot-s-1" };
  await assert.rejects(
    ops.execute("tasksummary.submit", { summary: "x" }),
    /identity/,
  );
  await assert.rejects(
    ops.execute("tasksummary.submit", { summary: "" }, undefined, { caller }),
    /1–800/,
  );
  await ops.execute(
    "tasksummary.submit",
    { summary: "Does b. Waits on nothing." },
    undefined,
    { caller },
  );
  const ready = await summary(ops);
  assert.deepEqual(
    [ready.state, ready.text],
    ["ready", "Does b. Waits on nothing."],
  );
  await assert.rejects(
    ops.execute("tasksummary.submit", { summary: "again" }, undefined, {
      caller,
    }),
    /already/,
  );
  // Reopening and asking again changes nothing.
  assert.equal(
    (await ops.execute("task.summary.request", { id: "b" })).state,
    "ready",
  );
  assert.equal(store.get("receipts", "task-summary:b").attempt, 1);

  // A change to the task text is a miss: a new request, a new attempt.
  const data = snapshot();
  data.tasks = [
    leaf("a", { status: "accepted" }),
    leaf("b", { title: "Task b, renamed" }),
  ];
  data.edges = [{ id: "a:requires:b", from: "a", to: "b", kind: "requires" }];
  store.importSnapshot(data);
  assert.equal((await summary(ops)).state, "none");
  await ops.execute("task.summary.request", { id: "b" });
  assert.equal(store.get("receipts", "task-summary:b").attempt, 2);
  assert.equal(taskSummaryDispatches(store).length, 1);
  void root;
});

test("a finished chat with no text is a failure that only Retry writes again", async (t) => {
  const { store, ops } = workspace(t);
  await ops.execute("task.summary.request", { id: "b" });
  await ops.execute("session.bind", {
    taskId: "task-summary:b",
    role: "task-summary",
    slot: "slot-s-1",
    attempt: 1,
  });
  await ops.execute("session.status", { slot: "slot-s-1", status: "closed" });
  assert.equal((await summary(ops)).state, "failed");
  assert.equal(
    (await ops.execute("task.summary.request", { id: "b" })).state,
    "failed",
  );
  assert.equal(store.get("receipts", "task-summary:b").attempt, 1);
  assert.equal(
    (await ops.execute("task.summary.request", { id: "b", retry: true })).state,
    "working",
  );
  assert.equal(store.get("receipts", "task-summary:b").attempt, 2);
});

test("an agent or MCP caller cannot ask for a summary", async (t) => {
  const { ops } = workspace(t);
  await assert.rejects(
    ops.execute("task.summary.request", { id: "b" }, undefined, { mcp: true }),
    /Only a person/,
  );
  assert.notEqual(classifyOperation("task.summary.request"), "observe");
});
