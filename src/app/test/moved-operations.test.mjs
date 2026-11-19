import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_OPERATIONS } from "../client.mjs";
import { handleMcp } from "../mcp.mjs";
import { MCP_TOOLS } from "../../mcp.mjs";
import { classifyOperation } from "../operation-kinds.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

// Names removed on 2026-11-18 (R56.3): the old one-tool-per-operation names,
// the moved-operation stubs, plans_relay and plans_andon_*. A sample, with a
// name of each kind.
const REMOVED = `plans_update_task plans_bind_session plans_tick plans_flow
plans_start_run plans_send_message plans_metrics plans_targets plans_relay
plans_andon_status plans_andon_raise`.split(/\s+/);

// Operations whose work moved to Kiro Crew; each answers with a pointer.
const MOVED = `metrics usage.limits models search.prompt run.send run.interrupt
run.resume run.approvals run.answer session.discover session.register
run.context targets.list targets.status jobs.status review.queue
checkpoint.reconcile checkpoint.publish primary.liveState batch.start
batch.control safety.status safety.raise safety.note
safety.remediation.request safety.review`.split(/\s+/);

const call = (ops, name, action, input = {}) =>
  handleMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: { action, input } },
    },
    ops,
  ).then((response) => response.body.result);

test("the removed plans_* names are gone, and each moved operation answers with a pointer", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  const listed = (
    await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ops)
  ).body.result.tools.map((tool) => tool.name);
  for (const tool of MCP_TOOLS) assert.ok(listed.includes(tool.name));
  assert.deepEqual(
    REMOVED.filter((name) => listed.includes(name)),
    [],
  );
  const before = store.read().revision;
  for (const name of REMOVED) {
    const result = await call(ops, name, undefined, { taskId: "sample-task" });
    assert.equal(result?.isError ?? true, true, name);
  }
  for (const name of MOVED) {
    const result = await ops.execute(name, { taskId: "sample-task" });
    assert.equal(result.moved, true, name);
    assert.match(result.message, /\S/, name);
  }
  assert.equal(store.read().revision, before, "a pointer writes nothing");
});

test("a moved run tool names the task's Kiro Crew sessions", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  await ops.execute("session.bind", {
    taskId: "sample-task",
    slot: "dashboard:chat-1",
  });
  const moved = await ops.execute("run.send", {
    taskId: "sample-task",
    text: "Hi",
  });
  assert.equal(moved.taskId, "sample-task");
  assert.deepEqual(moved.sessions, [
    {
      slot: "dashboard:chat-1",
      role: "worker",
      attempt: 1,
      status: null,
      url: "/chat?sid=chat-1",
    },
  ]);
  const sessions = await ops.execute("task.sessions", { id: "sample-task" });
  assert.deepEqual(
    sessions.map((session) => [session.id, session.provider]),
    [["dashboard:chat-1", "kiro-crew"]],
  );
});

test("plans_session start with a repository and agent is a dispatch request", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  store.put("projects", {
    id: "app",
    root: "/checkout/app",
    baseBranch: "main",
  });
  const pointer = await call(ops, "plans_session", "start", {
    taskId: "sample-task",
  });
  assert.equal(pointer.structuredContent.moved, true);
  const dispatched = await call(ops, "plans_session", "start", {
    taskId: "sample-task",
    repository: "app",
    agent: "worker-agent",
  });
  assert.equal(dispatched.isError, undefined);
  assert.equal(dispatched.structuredContent.changed, true);
  assert.equal(store.list("session_requests").length, 1);
  const refused = await call(ops, "plans_session", "start", {
    taskId: "sample-task",
    repository: "missing",
    agent: "worker-agent",
  });
  assert.equal(refused.isError, true);
});

test("asking or running an agent through intent.submit answers with a pointer", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  const moved = await ops.execute("intent.submit", {
    action: "run",
    prompt: "Do the work",
  });
  assert.equal(moved.moved, true);
  assert.equal(moved.operation, "intent.submit");
  const { task } = await ops.execute("intent.submit", {
    action: "task",
    prompt: "Capture this",
  });
  assert.ok(task.id);
});

test("an extraction without provider rounds opens a record; one with rounds is a pointer", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      prompt: "Design",
      text: "# Design\n\nKeep it small.\n",
    });
  const extraction = await ops.execute("plan.extract", { planId: plan.id });
  assert.equal(extraction.planId, plan.id);
  const moved = await ops.execute("plan.extract", {
    planId: plan.id,
    provider: "codex",
  });
  assert.equal(moved.moved, true);
});

test("every client operation is classified, moved ones included", () => {
  for (const operation of CLIENT_OPERATIONS)
    assert.ok(
      classifyOperation(operation),
      `missing classification for ${operation}`,
    );
  assert.equal(classifyOperation("future.unreviewed-operation"), null);
});
