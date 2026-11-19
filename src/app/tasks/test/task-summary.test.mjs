// The AI summary on a task's Overview tab: cached by a hash of its inputs.
import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { classifyOperation } from "../../api/operation-table.mjs";
import { handleMcp } from "../../mcp/mcp.mjs";
import { taskSummaryDispatches } from "../task-summary.mjs";
import { fixture, snapshot } from "../../test/fixtures.mjs";

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
  store.initialize(data);
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
  store.initialize(data);
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

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const bindChat = (ops, slot = "slot-s-1", attempt = 1) =>
  ops.execute("session.bind", {
    taskId: "task-summary:b",
    role: "task-summary",
    slot,
    attempt,
  });
const age = (store, table, id, field, minutes) =>
  store.put(table, { ...store.get(table, id), [field]: ago(minutes) });

test("a chat sends its summary with the call its brief names", async (t) => {
  const { store, ops } = workspace(t);
  await ops.execute("task.summary.request", { id: "b" });
  const { brief } = store.get("receipts", "task-summary:b");
  const call = JSON.parse(
    brief.match(/call plans_submit_task_summary with (\{.*\})\./)[1],
  );
  await bindChat(ops);
  call.input.summary = "Does b. Waits on nothing.";
  const result = (
    await handleMcp(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "plans_submit_task_summary",
          arguments: call,
          _meta: {
            "kirocrew.caller": {
              schemaVersion: 1,
              sessionKey: "dashboard:slot-s-1",
            },
          },
        },
      },
      ops,
      { attestedCaller: true },
    )
  ).body.result;
  assert.notEqual(result.isError, true, result.content[0].text);
  assert.equal((await summary(ops)).state, "ready");
});

test("every way a summary gets no text ends the wait and says why", async (t) => {
  const { store, ops } = workspace(t);
  const failure = async () => {
    const shown = await summary(ops);
    assert.equal(shown.state, "failed");
    // Retry writes it again, and the next attempt waits once more.
    const retried = await ops.execute("task.summary.request", {
      id: "b",
      retry: true,
    });
    assert.equal(retried.state, "working");
    return shown.reason;
  };
  // No chat ever starts.
  await ops.execute("task.summary.request", { id: "b" });
  assert.equal((await summary(ops)).state, "working");
  age(store, "receipts", "task-summary:b", "requestedAt", 11);
  assert.match(await failure(), /No chat started for it in 10 minutes/);

  // A chat ends its turn (idle) or leaves Kiro Crew (gone) without the text.
  for (const [attempt, status] of [
    [2, "idle"],
    [3, "gone"],
  ]) {
    const slot = `slot-${status}`;
    await bindChat(ops, slot, attempt);
    await ops.execute("session.status", { slot, status });
    assert.equal((await summary(ops)).state, "working", "a short quiet waits");
    age(store, "session_bindings", slot, "statusAt", 3);
    assert.match(await failure(), /stopped without sending a summary/);
  }

  // A chat still working sends nothing for 10 minutes.
  await bindChat(ops, "slot-slow", 4);
  await ops.execute("session.status", { slot: "slot-slow", status: "working" });
  age(store, "receipts", "task-summary:b", "requestedAt", 11);
  assert.match(await failure(), /sent nothing in 10 minutes/);

  // No Kiro Crew answers and the role has no harness: no chat can start.
  store.setMeta("needs-kirocrew.items", {
    taskSummary: { role: "taskSummary", since: ago(1), requests: [] },
  });
  assert.match(await failure(), /no harness\. Pick one in Settings › Models/);
  assert.equal(store.get("receipts", "task-summary:b").attempt, 6);
});
