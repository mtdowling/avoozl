import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture } from "./fixtures.mjs";
import { RunManager } from "../manager.mjs";
import { Operations } from "../operations.mjs";
import { handleMcp } from "../mcp.mjs";
import { ClaudeAdapter } from "../providers/claude.mjs";
import { CodexAdapter } from "../providers/codex.mjs";
import {
  approvalMode,
  claudeApprovals,
  codexApprovals,
} from "../approvals.mjs";

test("automatic review keeps provider boundaries and manual mode remains available", () => {
  assert.equal(approvalMode(), "automatic");
  assert.throws(() => approvalMode("bypass"), /Choose automatic or manual/);
  assert.deepEqual(codexApprovals(), {
    approvalPolicy: "on-request",
    approvalsReviewer: "auto_review",
  });
  assert.equal(codexApprovals("manual").approvalsReviewer, "user");
  assert.equal(claudeApprovals("implement").permissionMode, "auto");
  assert.equal(
    claudeApprovals("implement", "manual").permissionMode,
    "default",
  );
  assert.equal(claudeApprovals("ask").permissionMode, "plan");
  assert.equal(claudeApprovals("plan").settings.useAutoModeDuringPlan, true);
  assert.equal(
    claudeApprovals("ask", "manual").settings.useAutoModeDuringPlan,
    false,
  );
});
test("Claude permission changes keep the same session and genuine questions remain interactive", async (t) => {
  let captured, mode, settings;
  const requests = [],
    events = [],
    adapter = new ClaudeAdapter({
      query: (input) => {
        captured = input;
        const q = (async function* () {
          yield { type: "system", permissionMode: "default" };
        })();
        q.close = () => {};
        q.setPermissionMode = async (m) => (mode = m);
        q.applyFlagSettings = async (s) => (settings = s);
        return q;
      },
      emit: (kind, body) => events.push({ kind, ...body }),
      onRequest: (r) => requests.push(r),
    });
  t.after(() => adapter.close());
  await adapter.start({
    cwd: process.cwd(),
    mode: "implement",
    approvalMode: "automatic",
    resumeId: "same-session",
    mcpUrl: "http://127.0.0.1:1/mcp",
  });
  assert.equal(captured.options.permissionMode, "auto");
  assert.equal(captured.options.resume, "same-session");
  assert(
    captured.options.allowedTools.includes("mcp__nupp_plans__plans_query"),
  );
  assert(
    !captured.options.allowedTools.includes(
      "mcp__nupp_plans__plans_approve_plan",
    ),
  );
  assert.equal(captured.options.allowDangerouslySkipPermissions, undefined);
  const pending = captured.options.canUseTool(
    "AskUserQuestion",
    { questions: [] },
    { requestId: "question", signal: new AbortController().signal },
  );
  assert.equal(requests[0].kind, "input");
  await adapter.answer({
    providerRequestId: "question",
    decision: "allow",
    answers: { answer: "yes" },
  });
  assert.equal((await pending).behavior, "allow");
  await adapter.setApprovalMode("manual");
  assert.equal(mode, "default");
  assert.equal(settings.useAutoModeDuringPlan, false);
  assert(
    events.some(
      (e) =>
        e.kind === "approvals.status" && e.effectiveApprovalMode === "manual",
    ),
  );
});
test("Codex applies approval reviewer on start, resume, subsequent turns and live settings without widening its sandbox", async (t) => {
  const { root } = fixture(t),
    script = path.join(root, "protocol.mjs");
  fs.writeFileSync(
    script,
    `import readline from 'node:readline';for await(const line of readline.createInterface({input:process.stdin})){const m=JSON.parse(line);if(m.method==='initialized')continue;const result=m.method==='thread/start'||m.method==='thread/resume'?{thread:{id:'saved-thread'}}:m.method==='turn/start'?{turn:{id:'turn'}}:{};process.stdout.write(JSON.stringify({method:'observed',params:m})+'\\n');process.stdout.write(JSON.stringify({id:m.id,result})+'\\n');}`,
  );
  const adapter = new CodexAdapter({
    command: process.execPath,
    args: [script],
    emit: () => {},
    onRequest: () => {},
  });
  t.after(() => adapter.close());
  const observed = [];
  const receive = adapter.receive.bind(adapter);
  adapter.receive = (m) => {
    if (m.method === "observed") observed.push(m.params);
    else receive(m);
  };
  await adapter.start({
    cwd: root,
    mode: "ask",
    resumeId: "saved-thread",
    approvalMode: "automatic",
  });
  await adapter.setApprovalMode("manual");
  await adapter.send("A follow-up");
  const resume = observed.find((m) => m.method === "thread/resume");
  assert.equal(resume.params.approvalsReviewer, "auto_review");
  assert.equal(resume.params.sandbox, "read-only");
  const update = observed.find((m) => m.method === "thread/settings/update");
  assert.equal(update.params.approvalsReviewer, "user");
  assert.equal(update.params.sandboxPolicy, undefined);
  assert.equal(
    observed.find((m) => m.method === "turn/start").params.approvalsReviewer,
    "user",
  );
});
test("run policy changes persist across reconnect and never answer pending approvals implicitly", async (t) => {
  const { store } = fixture(t),
    manager = new RunManager(store, { recover: false });
  t.after(() => manager.close());
  const changes = [];
  store.put("runs", {
    id: "run-approval",
    taskId: "sample-task",
    provider: "claude",
    mode: "ask",
    state: "waiting-approval",
    providerSessionId: "original",
    approvalMode: "manual",
  });
  store.put("requests", {
    id: "still-pending",
    runId: "run-approval",
    kind: "approval",
    state: "pending",
  });
  manager.live.set("run-approval", {
    async setApprovalMode(mode) {
      changes.push(mode);
      return { applies: "session" };
    },
    async close() {},
  });
  const ops = new Operations(store, { manager }),
    result = await ops.execute("run.approvals", {
      id: "run-approval",
      approvalMode: "automatic",
    });
  assert.deepEqual(changes, ["automatic"]);
  assert.equal(result.pendingApprovals, 1);
  assert.equal(store.get("requests", "still-pending").state, "pending");
  assert.equal(store.get("runs", "run-approval").providerSessionId, "original");
  assert.equal(store.get("runs", "run-approval").approvalMode, "automatic");
  manager.live.delete("run-approval");
  assert.equal(
    (
      await ops.execute("run.approvals", {
        id: "run-approval",
        approvalMode: "manual",
      })
    ).applies,
    "on-resume",
  );
  await assert.rejects(
    ops.execute("run.approvals", { id: "run-approval", approvalMode: "never" }),
    /Choose automatic/,
  );
});
test("owned agent MCP connections cannot grant themselves different approval policies", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  const message = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "plans_set_run_approvals",
      arguments: { input: { id: "run-worker", approvalMode: "automatic" } },
    },
  };
  const result = await handleMcp(message, ops, { runId: "run-worker" });
  assert.equal(result.body.result.isError, true);
  assert.match(result.body.result.content[0].text, /user authorization/);
  const listed = await handleMcp(
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ops,
    { runId: "run-worker" },
  );
  assert(
    !listed.body.result.tools.some((t) => t.name === "plans_set_run_approvals"),
  );
});
test("web permission changes route to the durable agent host", async (t) => {
  const { store } = fixture(t),
    calls = [],
    ops = new Operations(store, {
      manager: {
        remote: true,
        async command(operation, input) {
          calls.push({ operation, input });
          return { approvalMode: input.approvalMode };
        },
      },
    });
  const result = await ops.execute("run.approvals", {
    id: "run-on-host",
    approvalMode: "automatic",
  });
  assert.equal(result.approvalMode, "automatic");
  assert.deepEqual(calls, [
    {
      operation: "run.approvals",
      input: { id: "run-on-host", approvalMode: "automatic" },
    },
  ]);
});
