import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { fixture, waitFor } from "./fixtures.mjs";
import { RunManager } from "../manager.mjs";
import { Operations } from "../operations.mjs";
import { ClaudeAdapter } from "../providers/claude.mjs";
import { CodexAdapter } from "../providers/codex.mjs";
import {
  classifyTurnEnd,
  requestInterruption,
  INTERRUPTION_CONTRACT_VERSION,
} from "../providers/cancellation.mjs";

test("the interruption contract separates cancellation from genuine failure", () => {
  // No stop was requested: a provider error is a failure and keeps its text.
  const failed = classifyTurnEnd({
    isError: true,
    diagnostic: "model overloaded",
    observation: 5,
  });
  assert.equal(failed.state, "failed");
  assert.equal(failed.error, "model overloaded");
  assert.equal(failed.cancellation, undefined);

  // A provider that reports interruption itself is authoritative.
  const providerInterrupted = classifyTurnEnd({
    providerState: "interrupted",
    observation: 5,
  });
  assert.equal(providerInterrupted.state, "interrupted");
  assert.equal(providerInterrupted.error, undefined);
  assert.equal(providerInterrupted.cancellation.source, "provider");

  // The reported bug: Claude ends an interrupted turn with an error result.
  // The run is interrupted, and the provider's wording is preserved rather
  // than being dropped or presented as a failure.
  const interruption = requestInterruption(3, "client-cancel");
  const cancelled = classifyTurnEnd({
    interruption,
    isError: true,
    diagnostic: "[diagnostic] result_type=user stop_reason=tool_use",
    observation: 7,
  });
  assert.equal(cancelled.state, "interrupted");
  assert.equal(cancelled.error, undefined);
  assert.equal(
    cancelled.providerDiagnostic,
    "[diagnostic] result_type=user stop_reason=tool_use",
  );
  assert.equal(cancelled.diagnosticDuringInterruption, true);
  assert.equal(cancelled.cancellation.completionRace, "no");
  assert.equal(cancelled.cancellation.contract, INTERRUPTION_CONTRACT_VERSION);

  // A failure the adapter had already observed before the stop was requested
  // cannot be explained by that stop, so it stays a failure.
  const raced = classifyTurnEnd({
    interruption: requestInterruption(9),
    isError: true,
    diagnostic: "provider crashed",
    observation: 4,
  });
  assert.equal(raced.state, "failed");
  assert.equal(raced.error, "provider crashed");

  // A clean terminal result after a stop request is genuinely ambiguous for a
  // provider with no interruption status. The uncertainty is recorded.
  const ambiguous = classifyTurnEnd({
    interruption: requestInterruption(1),
    isError: false,
    observation: 2,
  });
  assert.equal(ambiguous.state, "interrupted");
  assert.equal(ambiguous.cancellation.completionRace, "possible");
  assert.equal(ambiguous.cancellation.providerConfirmed, false);
});

test("Claude reports an interrupted turn as interrupted and keeps its diagnostic", async (t) => {
  const events = [];
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const query = () => {
    const iterator = (async function* () {
      yield { type: "system", session_id: "claude-session", model: "test" };
      await gate;
      yield {
        type: "result",
        is_error: true,
        result: "stopped",
        errors: ["[diagnostic] stop_reason=tool_use"],
        uuid: "result-1",
      };
    })();
    iterator.interrupt = async () => release();
    iterator.close = () => release();
    return iterator;
  };
  const adapter = new ClaudeAdapter({
    query,
    emit: (kind, body) => events.push({ kind, ...body }),
    onRequest: () => {},
  });
  t.after(() => adapter.close());
  await adapter.start({ cwd: ".", mode: "implement" });
  await waitFor(() => events.some((e) => e.kind === "session"), {
    label: "the session to be reported",
  });
  const acknowledgement = await adapter.interrupt();
  assert.equal(acknowledgement.acknowledged, true);
  assert.ok(acknowledgement.requestedAt);
  await waitFor(() => events.some((e) => e.kind === "turn.completed"), {
    label: "the terminal turn event",
  });
  const completed = events.find((e) => e.kind === "turn.completed");
  assert.equal(completed.state, "interrupted");
  assert.equal(completed.error, undefined);
  assert.equal(
    completed.providerDiagnostic,
    "[diagnostic] stop_reason=tool_use",
  );
  assert.equal(completed.cancellation.source, "client");
});

test("Claude keeps an uncancelled provider error as a failure and reports tool results honestly", async (t) => {
  const events = [];
  const query = () => {
    const iterator = (async function* () {
      yield { type: "system", session_id: "s", model: "test" };
      yield {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "Bash",
              input: { command: "false" },
            },
          ],
        },
      };
      yield {
        type: "user",
        uuid: "u1",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              is_error: true,
              content: [{ type: "text", text: "exit status 1" }],
            },
          ],
        },
      };
      yield { type: "result", is_error: true, result: "failed", uuid: "r" };
    })();
    iterator.interrupt = async () => {};
    iterator.close = () => {};
    return iterator;
  };
  const adapter = new ClaudeAdapter({
    query,
    emit: (kind, body) => events.push({ kind, ...body }),
    onRequest: () => {},
  });
  t.after(() => adapter.close());
  await adapter.start({ cwd: ".", mode: "implement" });
  await waitFor(() => events.some((e) => e.kind === "turn.completed"), {
    label: "the tool result and terminal turn",
  });
  const finished = events.find((e) => e.kind === "tool.finished");
  assert.equal(finished.id, "toolu_1");
  assert.equal(finished.isError, true);
  assert.equal(finished.content, "exit status 1");
  const completed = events.find((e) => e.kind === "turn.completed");
  assert.equal(completed.state, "failed");
  assert.equal(completed.error, "failed");
});

test("Claude records an interrupted permission acquisition as never executed", async (t) => {
  const events = [],
    requests = [];
  let abort;
  const query = (options) => {
    const controller = new AbortController();
    abort = () => controller.abort();
    const iterator = (async function* () {
      yield { type: "system", session_id: "s" };
      await options.options.canUseTool(
        "Bash",
        { command: "node slow-command.mjs markers/demo" },
        {
          requestId: "permission-1",
          toolUseID: "toolu_slow",
          signal: controller.signal,
        },
      );
      yield { type: "result", is_error: true, result: "stopped", uuid: "r" };
    })();
    iterator.interrupt = async () => abort();
    iterator.close = () => {};
    return iterator;
  };
  const adapter = new ClaudeAdapter({
    query,
    emit: (kind, body) => events.push({ kind, ...body }),
    onRequest: (request) => requests.push(request),
  });
  t.after(() => adapter.close());
  await adapter.start({ cwd: ".", mode: "implement" });
  await waitFor(() => requests.length, { label: "the permission request" });
  assert.equal(requests[0].payload.toolUseId, "toolu_slow");
  await adapter.interrupt();
  await waitFor(
    () =>
      events.some((e) => e.kind === "request.interrupted") &&
      events.some((e) => e.kind === "turn.completed"),
    { label: "the interrupted acquisition and terminal turn" },
  );
  const interrupted = events.find((e) => e.kind === "request.interrupted");
  assert.equal(interrupted.executed, false);
  assert.equal(interrupted.reason, "cancelled-before-acquisition");
  assert.equal(interrupted.toolUseId, "toolu_slow");
  const completed = events.find((e) => e.kind === "turn.completed");
  assert.equal(completed.state, "interrupted");
});

test("Codex reports its own interruption and a no-op interrupt is not claimed as one", async (t) => {
  const { root } = fixture(t);
  const script = `import readline from 'node:readline';
const send=(v)=>process.stdout.write(JSON.stringify(v)+'\\n');
for await (const line of readline.createInterface({input:process.stdin})) {
  const m=JSON.parse(line);
  if(m.method==='initialize') send({id:m.id,result:{}});
  else if(m.method==='thread/start') send({id:m.id,result:{thread:{id:'thread-1'},model:'codex-test'}});
  else if(m.method==='turn/start'){ send({id:m.id,result:{turn:{id:'turn-1'}}}); send({method:'turn/started',params:{turn:{id:'turn-1'}}}); }
  else if(m.method==='turn/interrupt'){ send({id:m.id,result:{}}); send({method:'turn/completed',params:{turn:{status:'interrupted',error:null}}}); }
}`;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const file = path.join(root, "codex-stub.mjs");
  fs.writeFileSync(file, script);
  const events = [];
  const adapter = new CodexAdapter({
    command: process.execPath,
    args: [file],
    emit: (kind, body) => events.push({ kind, ...body }),
    onRequest: () => {},
  });
  t.after(() => adapter.close());
  await adapter.start({ cwd: root, mode: "implement", prompt: "work" });
  await waitFor(() => adapter.turnId, { label: "the provider turn to start" });
  const idle = await adapter.interrupt();
  assert.equal(idle.acknowledged, true);
  // There was an active turn, so this is a real interruption.
  assert.equal(idle.noActiveTurn, undefined);
  await waitFor(() => events.some((e) => e.kind === "turn.completed"), {
    label: "the provider to report the interrupted turn",
  });
  const completed = events.find((e) => e.kind === "turn.completed");
  assert.equal(completed.state, "interrupted");
  assert.equal(completed.cancellation.source, "provider");
  // With no active turn there is nothing to interrupt; say so rather than
  // reporting a cancellation that never happened.
  const noop = await adapter.interrupt();
  assert.equal(noop.noActiveTurn, true);
});

test("interrupt records intent, waits for acknowledgement, and reports it", async (t) => {
  const { store, root } = fixture(t);
  store.put("projects", {
    id: "fixture",
    root,
    baseBranch: "main",
    checks: [],
  });
  let acknowledged = 0;
  const manager = new RunManager(store, {
    recover: false,
    factories: {
      codex: ({ emit }) => ({
        async start() {
          emit("session", { providerSessionId: "thread" });
        },
        async interrupt(reason) {
          acknowledged++;
          await delay(5);
          return { requested: true, acknowledged: true, reason };
        },
        async close() {},
      }),
    },
  });
  t.after(() => manager.close());
  const ops = new Operations(store, { manager });
  const run = await ops.execute("run.start", {
    id: "run-cancel",
    provider: "codex",
    projectId: "fixture",
    mode: "ask",
    prompt: "A question",
  });
  const result = await ops.execute("run.interrupt", {
    id: run.id,
    reason: "client-cancel:test",
  });
  assert.equal(acknowledged, 1);
  assert.equal(result.acknowledged, true);
  assert.equal(result.reason, "client-cancel:test");
  const kinds = store.events({ runId: run.id }).map((e) => e.kind);
  // The intent is durable before the provider is asked, so a crash between
  // the two still shows that a stop was requested.
  assert.ok(
    kinds.indexOf("interrupt.requested") <
      kinds.indexOf("interrupt.acknowledged"),
  );
  assert.equal(
    store
      .events({ runId: run.id })
      .find((e) => e.kind === "interrupt.requested").reason,
    "client-cancel:test",
  );
  await assert.rejects(
    ops.execute("run.interrupt", { id: "run-missing" }),
    /Run not found/,
  );
});

test("a turn ending while a stop is in flight still reports the acknowledgement", async (t) => {
  // The provider can end the turn before `interrupt` returns. The reply must
  // still describe what was requested rather than failing on a record the
  // terminal event has already cleared.
  const events = [];
  let endTurn;
  const query = () => {
    const iterator = (async function* () {
      yield { type: "system", session_id: "s" };
      await new Promise((resolve) => (endTurn = resolve));
      yield { type: "result", is_error: true, result: "stopped", uuid: "r" };
    })();
    iterator.interrupt = async () => {
      // End the turn first, then resolve the interrupt request.
      endTurn();
      await delay(5);
    };
    iterator.close = () => endTurn?.();
    return iterator;
  };
  const adapter = new ClaudeAdapter({
    query,
    emit: (kind, body) => events.push({ kind, ...body }),
    onRequest: () => {},
  });
  t.after(() => adapter.close());
  await adapter.start({ cwd: ".", mode: "implement" });
  await waitFor(() => events.some((e) => e.kind === "session"));
  const acknowledgement = await adapter.interrupt();
  assert.equal(acknowledgement.acknowledged, true);
  assert.ok(acknowledgement.requestedAt);
  assert.ok(acknowledgement.acknowledgedAt);
  await waitFor(() => events.some((e) => e.kind === "turn.completed"));
  assert.equal(
    events.find((e) => e.kind === "turn.completed").state,
    "interrupted",
  );
});
