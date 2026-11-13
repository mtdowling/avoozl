import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { CLIENT_OPERATIONS } from "../client.mjs";
import { handleMcp } from "../mcp.mjs";
import { MCP_TOOLS } from "../../mcp.mjs";
import { classifyOperation } from "../operation-kinds.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// Every plans_* name the MCP server listed before the agent host was removed
// (Requirement 24.5). A name may change what it does, never disappear.
const NAMES = [
  ...MCP_TOOLS.map((tool) => tool.name),
  ...`plans_examples plans_seed_example plans_workspace plans_metrics
plans_usage plans_models plans_prompt_search plans_prompt_search_result
plans_duplicates plans_merge_tasks plans_merge_receipt plans_capture
plans_update_task plans_archive_task plans_create_plan plans_save_plan
plans_propose_work plans_specs plans_get_plan plans_lint_plan
plans_project_preview plans_submit_review plans_extract plans_triage_design
plans_extraction plans_submit_extraction plans_dispose_fact plans_approve_plan
plans_start_run plans_send_message plans_interrupt_run plans_resume_run
plans_set_run_approvals plans_answer_request plans_task_sessions
plans_discover_sessions plans_register_session plans_bind_session
plans_rediscover_sessions plans_request_session plans_session_status
plans_tick plans_classify_issue plans_draft_children plans_advance_breakdowns
plans_rebuild plans_github_setup plans_prepare_worktree plans_report
plans_post_reply plans_next plans_claim_task plans_retry_delivery
plans_archive_run plans_unarchive_run plans_list_runs plans_get_run
plans_run_context plans_ready_queue plans_targets plans_target_status
plans_jobs plans_review_queue plans_checkpoints plans_checkpoint_publish
plans_primary_state plans_start_batch plans_control_batch plans_handoff
plans_validate_run plans_integrate plans_accept_task plans_andon_status
plans_andon_raise plans_andon_note plans_andon_propose_remediation
plans_andon_review`.split(/\s+/),
];

// The tools whose work moved to Kiro Crew; each answers with a pointer.
const MOVED_TOOLS = `plans_metrics plans_usage plans_models plans_prompt_search
plans_send_message plans_interrupt_run plans_resume_run plans_set_run_approvals
plans_answer_request plans_discover_sessions plans_register_session
plans_run_context plans_targets plans_target_status plans_jobs
plans_review_queue plans_checkpoints plans_checkpoint_publish
plans_primary_state plans_start_batch plans_control_batch plans_andon_status
plans_andon_raise plans_andon_note plans_andon_propose_remediation
plans_andon_review`.split(/\s+/);

const call = (ops, name, input = {}) =>
  handleMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: { input } },
    },
    ops,
  ).then((response) => response.body.result);

test("every plans_* name still lists, and each moved tool answers with a pointer", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  const listed = (
    await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ops)
  ).body.result.tools.map((tool) => tool.name);
  assert.deepEqual(
    NAMES.filter((name) => !listed.includes(name)),
    [],
  );
  const before = store.read().revision;
  for (const name of MOVED_TOOLS) {
    const result = await call(ops, name, { taskId: "sample-task" });
    assert.equal(result.isError, undefined, name);
    assert.equal(result.structuredContent.moved, true, name);
    assert.match(result.structuredContent.message, /\S/, name);
  }
  assert.equal(store.read().revision, before, "a pointer writes nothing");
  assert.equal(store.list("runs").length, 0);
});

test("a moved run tool names the task's Kiro Crew sessions", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  store.put("runs", {
    id: "run-old",
    taskId: "sample-task",
    state: "completed",
    provider: "codex",
  });
  await ops.execute("session.bind", {
    taskId: "sample-task",
    slot: "dashboard:chat-1",
  });
  const moved = await ops.execute("run.send", { id: "run-old", text: "Hi" });
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

test("plans_start_run with a repository and agent is a dispatch request", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  store.put("projects", {
    id: "app",
    root: "/checkout/app",
    baseBranch: "main",
  });
  const pointer = await call(ops, "plans_start_run", { taskId: "sample-task" });
  assert.equal(pointer.structuredContent.moved, true);
  const dispatched = await call(ops, "plans_start_run", {
    taskId: "sample-task",
    repository: "app",
    agent: "worker-agent",
  });
  assert.equal(dispatched.isError, undefined);
  assert.equal(dispatched.structuredContent.changed, true);
  assert.equal(store.list("session_requests").length, 1);
  const refused = await call(ops, "plans_start_run", {
    taskId: "sample-task",
    repository: "missing",
    agent: "worker-agent",
  });
  assert.equal(refused.isError, true);
  assert.equal(store.list("runs").length, 0);
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
  assert.equal(store.list("runs").length, 0);
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
  assert.equal(store.list("runs").length, 0);
});

// The tables the agent host, safety gate and team coordination wrote. A
// workspace that has them still opens, and their rows stay readable.
function oldHostWorkspace() {
  const root = temporaryDirectory(),
    dbPath = path.join(root, "workspace.sqlite"),
    store = new Store(dbPath);
  store.importSnapshot(fixtureSnapshot());
  store.put("runs", {
    id: "run-old",
    taskId: "sample-task",
    provider: "codex",
    mode: "implement",
    state: "completed",
    prompt: "Old work",
    createdAt: new Date(0).toISOString(),
  });
  store.event("run-old", "message", { text: "Finished." });
  store.put("deliveries", {
    id: "delivery-old",
    runId: "run-old",
    text: "Follow up",
    state: "delivered",
  });
  store.put("safety_incidents", {
    id: "andon-0000000001",
    revision: 1,
    safetyEpoch: 1,
    state: "resolved",
    scope: { kind: "task", id: "sample-task" },
    mode: "interrupt",
    reason: "Old incident",
    notes: [],
    transitions: [],
  });
  store.put("execution_targets", { id: "target-old", state: "paired" });
  store.put("execution_jobs", {
    id: "job-old",
    taskId: "sample-task",
    state: "completed",
  });
  store.put("team_checkpoints", {
    id: "checkpoint-old",
    taskId: "sample-task",
  });
  store.db
    .prepare(
      "INSERT INTO run_capabilities(id,run_id,token_hash,expires_at,revoked_at,body) VALUES(?,?,?,?,NULL,?)",
    )
    .run("capability-old", "run-old", "hash-old", "2026-01-01T00:00:00Z", "{}");
  store.close();
  return { root, dbPath };
}

function fixtureSnapshot() {
  const store = fixture({ after() {} }).store,
    data = store.read();
  store.close();
  return data;
}

test("a workspace with the old host tables opens, reads its history, and stays read-only to it", async (t) => {
  const { dbPath } = oldHostWorkspace(),
    store = new Store(dbPath);
  t.after(() => store.close());
  const ops = new Operations(store);
  const run = await ops.execute("run.get", { id: "run-old" });
  assert.equal(run.state, "completed");
  assert.equal(run.events.at(-1).text, "Finished.");
  assert.equal(run.deliveries[0].id, "delivery-old");
  assert.equal((await ops.execute("run.list", {})).items[0].id, "run-old");
  const task = await ops.execute("task.get", { id: "sample-task" });
  assert.equal(task.team.jobs[0].id, "job-old");
  assert.equal(task.team.checkpoints[0].id, "checkpoint-old");
  const workspace = await ops.execute("workspace", {});
  assert.equal(workspace.runs[0].id, "run-old");
  assert.equal((await ops.execute("graph.view", {})).tasks.length, 1);
  const andon = await ops.execute("safety.status", {});
  assert.equal(andon.moved, true);
  assert.equal(
    store.get("safety_incidents", "andon-0000000001").state,
    "resolved",
  );
  assert.equal(store.list("execution_targets").length, 1);
});

test("an old workspace database opened read-only still answers", async (t) => {
  const { dbPath } = oldHostWorkspace();
  fs.chmodSync(dbPath, 0o444);
  const before = fs.readFileSync(dbPath),
    store = new Store(dbPath);
  t.after(() => store.close());
  assert.equal(store.readOnly, true);
  const ops = new Operations(store);
  assert.equal((await ops.execute("run.get", { id: "run-old" })).id, "run-old");
  assert.equal(
    (await ops.execute("run.interrupt", { id: "run-old" })).moved,
    true,
  );
  assert.ok(fs.readFileSync(dbPath).equals(before));
});

test("every client operation is classified, moved ones included", () => {
  for (const operation of CLIENT_OPERATIONS)
    assert.ok(
      classifyOperation(operation),
      `missing classification for ${operation}`,
    );
  assert.equal(classifyOperation("future.unreviewed-operation"), null);
});
