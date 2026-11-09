import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fixture } from "./fixtures.mjs";
import { Projection, PROJECTION_SCHEMA_VERSION } from "../ahp/projection.mjs";
import { runUris } from "../ahp/uris.mjs";
import { workspaceIdentity } from "../identity.mjs";

function seedRun(store, overrides = {}) {
  const run = {
    id: "run-demo",
    taskId: "sample-task",
    provider: "claude",
    mode: "implement",
    state: "running",
    prompt: "Run the fixture slow command",
    title: "Fixture cancellation",
    model: "test-model",
    approvalMode: "manual",
    worktree: path.join(store.filename, "..", "worktree"),
    createdAt: new Date(1000).toISOString(),
    ...overrides,
  };
  store.put("runs", run);
  return run;
}

function open(t, store, file) {
  const projection = new Projection({ store, file: file || ":memory:" });
  t.after(() => {
    try {
      projection.close();
    } catch {}
  });
  return projection;
}

function chat(projection, store, runId = "run-demo") {
  const uris = runUris(workspaceIdentity(store), runId);
  return projection.channelState(uris.chat);
}
function session(projection, store, runId = "run-demo") {
  const uris = runUris(workspaceIdentity(store), runId);
  return projection.channelState(uris.session);
}
function toolCalls(state) {
  const parts = [
    ...(state.activeTurn?.responseParts || []),
    ...state.turns.flatMap((turn) => turn.responseParts),
  ];
  return parts.filter((p) => p.kind === "toolCall").map((p) => p.toolCall);
}

test("an approved tool that ran, then was cancelled, stays a completed unsuccessful tool", async (t) => {
  const { store } = fixture(t);
  const run = seedRun(store);
  store.event(run.id, "run.created", { run });
  store.event(run.id, "tool.started", { tool: "Bash", id: "toolu_1" });
  store.event(run.id, "tool.activity", {
    tool: "Bash",
    id: "toolu_1",
    input: { command: "node slow-command.mjs markers/demo" },
  });
  const request = {
    id: "request-1",
    runId: run.id,
    kind: "approval",
    method: "Bash",
    providerRequestId: "p-1",
    state: "pending",
    options: [
      { id: "allow-once", label: "Allow once", kind: "approve" },
      { id: "deny", label: "Deny", kind: "deny" },
    ],
    payload: {
      tool: "Bash",
      toolUseId: "toolu_1",
      input: { command: "node slow-command.mjs markers/demo" },
    },
  };
  store.put("requests", request);
  store.event(run.id, "request.created", { request });
  const projection = open(t, store);
  projection.catchUp();

  let state = chat(projection, store);
  assert.equal(state.activeTurn.message.text, "Run the fixture slow command");
  let call = toolCalls(state)[0];
  assert.equal(call.toolCallId, "toolu_1", "the provider tool ID is the tool call ID");
  assert.equal(call.status, "pending-confirmation");
  assert.deepEqual(
    call.options.map((o) => o.id),
    ["allow-once", "deny"],
  );
  // Waiting for approval is visible from the session channel alone.
  assert.equal(session(projection, store).inputNeeded.length, 1);
  assert.equal(session(projection, store).inputNeeded[0].kind, "toolConfirmation");

  const answered = { ...request, state: "allowed", optionId: "allow-once", executed: true };
  store.put("requests", answered);
  store.event(run.id, "request.answered", { request: answered });
  projection.catchUp();
  state = chat(projection, store);
  assert.equal(toolCalls(state)[0].status, "running");
  assert.equal((session(projection, store).inputNeeded || []).length, 0);

  // Native Cancel: the provider stops the turn after the tool really started.
  store.put("runs", { ...run, state: "interrupted" });
  store.event(run.id, "turn.completed", {
    state: "interrupted",
    cancellation: { source: "client", requested: true, completionRace: "no" },
    providerDiagnostic: "[diagnostic] stop_reason=tool_use",
  });
  projection.catchUp();
  state = chat(projection, store);
  call = toolCalls(state)[0];
  assert.equal(
    call.status,
    "completed",
    "a tool that executed must not become a skipped, never-executed tool",
  );
  assert.equal(call.success, false);
  assert.match(
    JSON.stringify(call.pastTenseMessage || ""),
    /after it had started/,
  );
  assert.equal(state.turns.at(-1).state, "cancelled");
  // The provider's own wording survives, marked as a diagnostic observed
  // during an intentional stop rather than as a failure.
  const notifications = state.turns
    .at(-1)
    .responseParts.filter((p) => p.kind === "systemNotification");
  assert.ok(
    notifications.some((p) =>
      JSON.stringify(p.content).includes("stop_reason=tool_use"),
    ),
  );
  assert.ok(
    notifications.some(
      (p) => p._meta?.["aicommander.diagnosticDuringInterruption"],
    ),
  );
});

test("a tool cancelled before its decision is recorded as never executed", async (t) => {
  const { store } = fixture(t);
  const run = seedRun(store, { id: "run-before" });
  store.event(run.id, "run.created", { run });
  const request = {
    id: "request-b",
    runId: run.id,
    kind: "approval",
    method: "Bash",
    providerRequestId: "p-b",
    state: "pending",
    options: [{ id: "allow-once", label: "Allow once", kind: "approve" }],
    payload: { tool: "Bash", toolUseId: "toolu_b", input: { command: "sleep 100" } },
  };
  store.put("requests", request);
  store.event(run.id, "request.created", { request });
  store.event(run.id, "request.interrupted", {
    providerRequestId: "p-b",
    toolUseId: "toolu_b",
    executed: false,
    reason: "cancelled-before-acquisition",
  });
  store.event(run.id, "turn.completed", {
    state: "interrupted",
    cancellation: { source: "client", requested: true, completionRace: "no" },
  });
  const projection = open(t, store);
  projection.catchUp();
  const state = chat(projection, store, run.id);
  const call = toolCalls(state)[0];
  assert.equal(call.status, "cancelled");
  assert.equal(call.reason, "skipped");
  assert.match(JSON.stringify(call.reasonMessage), /did not run/);
  assert.equal(state.turns.at(-1).state, "cancelled");
  assert.equal((session(projection, store, run.id).inputNeeded || []).length, 0);
});

test("a genuine provider failure stays an error with its own message", async (t) => {
  const { store } = fixture(t);
  const run = seedRun(store, { id: "run-fail" });
  store.event(run.id, "run.created", { run });
  store.event(run.id, "tool.started", { tool: "Read", id: "toolu_r" });
  store.event(run.id, "tool.activity", {
    tool: "Read",
    id: "toolu_r",
    input: { file_path: "/tmp/demo" },
  });
  store.event(run.id, "tool.finished", {
    id: "toolu_r",
    isError: true,
    content: "ENOENT: no such file",
  });
  store.event(run.id, "turn.completed", {
    state: "failed",
    error: "the model returned an error",
  });
  const projection = open(t, store);
  projection.catchUp();
  const state = chat(projection, store, run.id);
  const call = toolCalls(state)[0];
  // A tool that ran and failed is completed-with-error, not cancelled.
  assert.equal(call.status, "completed");
  assert.equal(call.success, false);
  assert.match(call.error.message, /ENOENT/);
  const turn = state.turns.at(-1);
  assert.equal(turn.state, "error");
  const errorPart = turn.responseParts.find((p) => p.kind === "error");
  assert.equal(errorPart.error.message, "the model returned an error");
  assert.equal(
    errorPart.resumable,
    false,
    "a provider failure is not resumed silently; the user decides what to do",
  );
});

test("a tool needing no permission goes straight to running and reports its result", async (t) => {
  const { store } = fixture(t);
  const run = seedRun(store, { id: "run-auto" });
  store.event(run.id, "run.created", { run });
  store.event(run.id, "message.delta", { text: "Checking", itemId: "0" });
  store.event(run.id, "tool.started", { tool: "Glob", id: "toolu_g" });
  store.event(run.id, "tool.activity", {
    tool: "Glob",
    id: "toolu_g",
    input: { pattern: "**/*.mjs" },
  });
  store.event(run.id, "tool.finished", { id: "toolu_g", content: "3 files" });
  store.event(run.id, "message", { text: "Checking the files found 3." });
  store.event(run.id, "usage", {
    mainLoopUsage: { input_tokens: 10, output_tokens: 4 },
    model: "test-model",
  });
  store.event(run.id, "turn.completed", { state: "completed" });
  const projection = open(t, store);
  projection.catchUp();
  const state = chat(projection, store, run.id);
  const call = toolCalls(state)[0];
  assert.equal(call.status, "completed");
  assert.equal(call.success, true);
  assert.equal(call.confirmed ?? "not-needed", "not-needed");
  const turn = state.turns.at(-1);
  assert.equal(turn.state, "complete");
  assert.equal(turn.usage.inputTokens, 10);
  const markdown = turn.responseParts.filter((p) => p.kind === "markdown");
  // The streamed text is not duplicated by the completed message.
  assert.equal(markdown.length, 1);
  assert.equal(markdown[0].content, "Checking");
});

test("subagent work is attributed and cleared when the delegating tool finishes", async (t) => {
  const { store } = fixture(t);
  const run = seedRun(store, { id: "run-sub" });
  store.event(run.id, "run.created", { run });
  store.event(run.id, "tool.started", { tool: "Task", id: "toolu_task" });
  store.event(run.id, "tool.activity", {
    tool: "Task",
    id: "toolu_task",
    input: { prompt: "Investigate" },
  });
  store.event(run.id, "message", {
    text: "Nested finding",
    subagent: "toolu_task",
  });
  const projection = open(t, store);
  projection.catchUp();
  let state = chat(projection, store, run.id);
  assert.equal(state.backgroundWork.length, 1);
  assert.equal(state.backgroundWork[0].kind, "subagent");
  assert.equal(
    state.backgroundWork[0]._meta["aicommander.parentToolUseId"],
    "toolu_task",
  );
  store.event(run.id, "tool.finished", { id: "toolu_task", content: "done" });
  store.event(run.id, "turn.completed", { state: "completed" });
  projection.catchUp();
  state = chat(projection, store, run.id);
  assert.equal((state.backgroundWork || []).length, 0);
});

test("queued and steered follow-ups stay distinguishable and durable", async (t) => {
  const { store } = fixture(t);
  const run = seedRun(store, { id: "run-queue", provider: "codex", state: "running" });
  store.event(run.id, "run.created", { run });
  const queued = {
    id: "ahp:turn-7",
    runId: run.id,
    text: "Also update the README",
    mode: "queue",
    state: "queued",
  };
  store.event(run.id, "delivery.queued", { delivery: queued });
  const projection = open(t, store);
  projection.catchUp();
  let state = chat(projection, store, run.id);
  // A client's own identifier is what it sees back.
  assert.deepEqual(
    state.queuedMessages.map((m) => m.id),
    ["turn-7"],
  );
  assert.equal(state.steeringMessage, undefined);

  store.event(run.id, "turn.completed", { state: "completed" });
  store.event(run.id, "delivery.updated", {
    delivery: { ...queued, state: "accepted" },
  });
  projection.catchUp();
  state = chat(projection, store, run.id);
  assert.equal((state.queuedMessages || []).length, 0);
  // Consuming the queued message starts the turn the client asked for.
  assert.equal(state.activeTurn.id, "turn-7");

  const steer = {
    id: "ahp:steer-1",
    runId: run.id,
    text: "Focus on the API",
    mode: "steer",
    state: "queued",
  };
  store.event(run.id, "delivery.queued", { delivery: steer });
  projection.catchUp();
  state = chat(projection, store, run.id);
  assert.equal(state.steeringMessage.id, "steer-1");
  store.event(run.id, "delivery.updated", {
    delivery: { ...steer, state: "accepted" },
  });
  projection.catchUp();
  state = chat(projection, store, run.id);
  assert.equal(state.steeringMessage, undefined);
  // Steering joins the running turn rather than starting another.
  assert.equal(state.activeTurn.id, "turn-7");
  assert.ok(
    state.activeTurn.responseParts.some(
      (p) => p.kind === "systemNotification" && JSON.stringify(p.content).includes("Steered"),
    ),
  );
});

test("an uncertain delivery stays pending and says so instead of being resent", async (t) => {
  const { store } = fixture(t);
  const run = seedRun(store, { id: "run-uncertain" });
  store.event(run.id, "run.created", { run });
  const delivery = {
    id: "ahp:turn-9",
    runId: run.id,
    text: "Follow up",
    mode: "queue",
    state: "queued",
  };
  store.event(run.id, "delivery.queued", { delivery });
  store.event(run.id, "delivery.updated", {
    delivery: { ...delivery, state: "uncertain", error: "socket closed" },
  });
  const projection = open(t, store);
  projection.catchUp();
  const state = chat(projection, store, run.id);
  assert.deepEqual(
    state.queuedMessages.map((m) => m.id),
    ["turn-9"],
  );
  assert.ok(
    state.activeTurn.responseParts.some((p) =>
      JSON.stringify(p.content || "").includes("uncertain"),
    ),
  );
});

test("a host restart ends the turn resumably and invalidates pending approvals", async (t) => {
  const { store } = fixture(t);
  const run = seedRun(store, { id: "run-recover" });
  store.event(run.id, "run.created", { run });
  const request = {
    id: "request-x",
    runId: run.id,
    kind: "approval",
    method: "Bash",
    providerRequestId: "p-x",
    state: "pending",
    options: [{ id: "allow-once", label: "Allow once", kind: "approve" }],
    payload: { tool: "Bash", toolUseId: "toolu_x", input: { command: "ls" } },
  };
  store.put("requests", request);
  store.event(run.id, "request.created", { request });
  store.put("runs", { ...run, state: "disconnected" });
  store.event(run.id, "run.recovered", {
    state: "disconnected",
    message: "Agent host restarted. Resume explicitly.",
  });
  const projection = open(t, store);
  projection.catchUp();
  const state = chat(projection, store, run.id);
  const call = toolCalls(state)[0];
  assert.equal(call.status, "cancelled");
  const turn = state.turns.at(-1);
  assert.equal(turn.state, "error");
  const errorPart = turn.responseParts.find((p) => p.kind === "error");
  assert.equal(errorPart.resumable, true);
  assert.equal(errorPart.error.errorType, "SessionDisconnected");
  assert.equal((session(projection, store, run.id).inputNeeded || []).length, 0);
});

test("a question reaches the session channel and its answer converges", async (t) => {
  const { store } = fixture(t);
  const run = seedRun(store, { id: "run-question" });
  store.event(run.id, "run.created", { run });
  const request = {
    id: "request-q",
    runId: run.id,
    kind: "input",
    method: "AskUserQuestion",
    providerRequestId: "p-q",
    state: "pending",
    payload: {
      tool: "AskUserQuestion",
      input: {
        questions: [
          {
            header: "Colour",
            question: "Which colour should the banner use?",
            options: [
              { label: "Blue", description: "Calm" },
              { label: "Green", description: "Fresh" },
            ],
          },
        ],
      },
    },
  };
  store.put("requests", request);
  store.event(run.id, "request.created", { request });
  const projection = open(t, store);
  projection.catchUp();
  let state = chat(projection, store, run.id);
  const part = state.activeTurn.responseParts.find(
    (p) => p.kind === "inputRequest",
  );
  assert.equal(part.request.questions[0].kind, "single-select");
  assert.deepEqual(
    part.request.questions[0].options.map((o) => o.id),
    ["Blue", "Green"],
  );
  assert.equal(session(projection, store, run.id).inputNeeded[0].kind, "chatInput");

  store.event(run.id, "request.answered", {
    request: {
      ...request,
      state: "allowed",
      answers: { Colour: { answers: ["Blue"] } },
    },
  });
  projection.catchUp();
  state = chat(projection, store, run.id);
  const answered = state.activeTurn.responseParts.find(
    (p) => p.kind === "inputRequest",
  );
  assert.equal(answered.request.response ?? "accept", "accept");
  assert.equal(answered.request.answers.Colour.value.value, "Blue");
  assert.equal((session(projection, store, run.id).inputNeeded || []).length, 0);
});

test("the projection rebuilds from the event log and reproduces the same state", async (t) => {
  const { store, root } = fixture(t);
  const run = seedRun(store, { id: "run-rebuild" });
  store.event(run.id, "run.created", { run });
  store.event(run.id, "message", { text: "Answer one" });
  store.event(run.id, "turn.completed", { state: "completed" });
  const file = path.join(root, "ahp.sqlite");
  const first = new Projection({ store, file });
  first.catchUp();
  const before = JSON.stringify(chat(first, store, run.id));
  const cursor = first.cursor();
  assert.ok(cursor > 0);
  first.close();

  // A schema change makes the cached projection unusable. It must be
  // discarded and replayed, not merged.
  const direct = new (await import("node:sqlite")).DatabaseSync(file);
  const identity = JSON.parse(
    direct.prepare("SELECT value FROM meta WHERE key='identity'").get().value,
  );
  direct
    .prepare("UPDATE meta SET value=? WHERE key='identity'")
    .run(JSON.stringify({ ...identity, schemaVersion: identity.schemaVersion - 1 }));
  direct.close();

  const second = new Projection({ store, file });
  t.after(() => second.close());
  assert.equal(second.cursor(), 0, "a stale schema forces a replay from zero");
  assert.ok(second.meta("rebuiltAt"));
  second.catchUp();
  assert.equal(
    JSON.stringify(chat(second, store, run.id)),
    before,
    "a replay must rebuild identical state, so timing comes from the event log",
  );
  assert.equal(second.cursor(), cursor);
  assert.equal(
    second.meta("identity").schemaVersion,
    PROJECTION_SCHEMA_VERSION,
  );
});

test("replayed and already-applied events produce no duplicate actions", async (t) => {
  const { store } = fixture(t);
  const run = seedRun(store, { id: "run-replay" });
  store.event(run.id, "run.created", { run });
  store.event(run.id, "message", { text: "Only once" });
  const projection = open(t, store);
  const first = projection.catchUp();
  assert.ok(first.length > 0);
  // Nothing new in the source: no further actions.
  assert.equal(projection.catchUp().length, 0);
  // Re-folding an event already behind the cursor is a no-op rather than a
  // second copy of the same transcript.
  const events = store.events({ after: 0 });
  assert.equal(projection.foldEvent(events[0]).length, 0);
  const state = chat(projection, store, run.id);
  assert.equal(
    state.activeTurn.responseParts.filter((p) => p.kind === "markdown").length,
    1,
  );
});

test("history stays bounded and older turns page back in without gaps", async (t) => {
  const { store } = fixture(t);
  const run = seedRun(store, { id: "run-history" });
  store.event(run.id, "run.created", { run });
  store.event(run.id, "turn.completed", { state: "completed" });
  for (let i = 0; i < 25; i++) {
    const delivery = {
      id: "ahp:turn-" + i,
      runId: run.id,
      text: "Message " + i,
      mode: "queue",
      state: "accepted",
    };
    store.event(run.id, "delivery.updated", { delivery });
    store.event(run.id, "message", { text: "Reply " + i });
    store.event(run.id, "turn.completed", { state: "completed" });
  }
  const projection = new Projection({ store, file: ":memory:", retainTurns: 5 });
  t.after(() => projection.close());
  projection.catchUp();
  const uris = runUris(workspaceIdentity(store), run.id);
  let state = projection.channelState(uris.chat);
  assert.equal(state.turns.length, 5, "the live window is bounded");
  assert.equal(state.turns.at(-1).id, "turn-24");
  assert.ok(state.turnsNextCursor, "older turns remain reachable");
  // The bound is about the delivered payload, not just the object graph.
  assert.ok(JSON.stringify(projection.snapshot(uris.chat)).length < 20000);

  const seen = new Set(state.turns.map((t) => t.id));
  let cursor = state.turnsNextCursor;
  let pages = 0;
  while (cursor && pages < 10) {
    const envelope = projection.loadOlderTurns(uris.chat, cursor);
    assert.ok(envelope, "a cursor the host advertised must load a page");
    for (const turn of envelope.action.turns) {
      assert.equal(seen.has(turn.id), false, "pages must not repeat a turn");
      seen.add(turn.id);
    }
    cursor = envelope.action.turnsNextCursor;
    pages++;
  }
  assert.equal(seen.size, 26, "every turn is reachable exactly once");
  assert.equal(
    projection.channelState(uris.chat).turnsNextCursor,
    undefined,
    "the cursor clears once history is fully loaded",
  );
  assert.equal(
    projection.loadOlderTurns(uris.chat, undefined),
    null,
    "there is nothing left to page",
  );
  assert.throws(
    () => {
      projection.putChannel(uris.chat, "chat", run.id, {
        ...projection.channelState(uris.chat),
        turnsNextCursor: "ordinal:3",
      });
      projection.loadOlderTurns(uris.chat, "ordinal:nonsense");
    },
    /Unrecognised history cursor/,
  );
});

test("channel identifiers are namespaced by workspace and stable across titles", async (t) => {
  const { store } = fixture(t);
  const workspaceId = workspaceIdentity(store);
  const first = runUris(workspaceId, "run-demo");
  const renamed = runUris(workspaceId, "run-demo");
  assert.deepEqual(first, renamed);
  const other = runUris("a-different-workspace", "run-demo");
  assert.notEqual(first.chat, other.chat);
  assert.notEqual(first.session, other.session);
  assert.match(first.chat, /^ahp-chat:\/[0-9a-f-]{36}$/);
  assert.match(first.session, /^ahp-session:\/[0-9a-f-]{36}$/);
  // Identity is persisted, so a reopened workspace keeps its mappings.
  assert.equal(workspaceIdentity(store), workspaceId);
});
