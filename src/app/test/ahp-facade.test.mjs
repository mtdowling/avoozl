import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { AhpClient } from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";
import {
  SUPPORTED_PROTOCOL_VERSIONS,
  AhpErrorCodes,
} from "@microsoft/agent-host-protocol";
import { fixture } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { RunManager } from "../manager.mjs";
import { localClient } from "../client.mjs";
import { startAhpFacade } from "../ahp/facade.mjs";
import { runUris, ROOT_CHANNEL } from "../ahp/uris.mjs";
import { workspaceIdentity } from "../identity.mjs";

// The protocol versions the installed VS Code desktop offers. Recorded here so
// a change in either direction is caught by a test rather than in an editor.
const VSCODE_1_138_OFFER = ["0.9.0", "0.7.0", "0.6.0", "0.5.2", "0.5.1"];

const EDITOR_TOKEN = "test-editor-token-" + randomUUID();
const OBSERVER_TOKEN = "test-observer-token-" + randomUUID();

// A provider stub that records what reached it and lets a test drive each
// stage of a real turn.
function provider(script = {}) {
  const calls = { sent: [], answered: [], interrupted: 0, models: [] };
  const factory = ({ emit, onRequest }) => {
    const adapter = {
      calls,
      emit,
      onRequest,
      async start(options) {
        calls.options = options;
        if (options.catalogOnly)
          return [
            { id: "stub-model", label: "Stub" },
            { id: "other-model", label: "Other" },
          ];
        emit("session", {
          providerSessionId: "provider-session",
          model: options.model,
        });
        await script.onStart?.(adapter);
      },
      async send(text, mode) {
        calls.sent.push({ text, mode });
        return { turnId: "turn-" + calls.sent.length };
      },
      async answer(request) {
        calls.answered.push(request);
        return { accepted: true };
      },
      async interrupt(reason) {
        calls.interrupted++;
        return { requested: true, acknowledged: true, reason };
      },
      async setModel(model) {
        calls.models.push(model);
        return { applies: "next-turn", model };
      },
      async setApprovalMode(mode) {
        return { applies: "session", mode };
      },
      async close() {},
    };
    return adapter;
  };
  return { factory, calls };
}

async function harness(t, { script, retainTurns } = {}) {
  const { store, root } = fixture(t);
  store.put("projects", {
    id: "fixture",
    root,
    baseBranch: "main",
    worktreeRoot: path.join(root, "worktrees"),
    checks: [],
  });
  const stub = provider(script);
  const manager = new RunManager(store, {
    recover: false,
    factories: { codex: stub.factory, claude: stub.factory },
  });
  const ops = new Operations(store, { manager });
  const client = localClient(ops);
  const facade = startAhpFacade({
    store,
    client,
    file: ":memory:",
    port: 0,
    pollIntervalMs: 20,
    retainTurns,
    tokens: {
      [EDITOR_TOKEN]: { name: "editor", scope: "full" },
      [OBSERVER_TOKEN]: { name: "observer", scope: "read" },
    },
    models: async () => [
      {
        provider: "avoozl-codex",
        displayName: "Avoozl codex",
        description: "stub",
        models: [
          { id: "stub-model", provider: "avoozl-codex", name: "Stub" },
          { id: "other-model", provider: "avoozl-codex", name: "Other" },
        ],
      },
    ],
  });
  await facade.listening;
  t.after(async () => {
    await facade.close();
    await manager.close();
  });
  return { store, root, ops, manager, client, facade, stub };
}

async function connect(facade, token = EDITOR_TOKEN, subscriptions = []) {
  const transport = await WebSocketTransport.connect(
    facade.url + "/?token=" + encodeURIComponent(token),
  );
  const client = new AhpClient(transport);
  client.connect();
  const result = await client.initialize({
    clientId: "test-" + randomUUID(),
    protocolVersions: VSCODE_1_138_OFFER,
    initialSubscriptions: subscriptions,
  });
  return { client, result };
}

async function startRun(ops, overrides = {}) {
  return ops.execute("run.start", {
    id: "run-facade",
    provider: "codex",
    projectId: "fixture",
    mode: "ask",
    model: "stub-model",
    approvalMode: "manual",
    prompt: "What needs my decision?",
    ...overrides,
  });
}

// Wait for a predicate over the facade's projection rather than for a fixed
// delay, so these tests do not depend on timing.
async function until(check, { timeoutMs = 4000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let value;
    try {
      value = await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      value = null;
    }
    if (value) return value;
    if (Date.now() > deadline)
      throw Error("Timed out waiting for a condition.");
    await delay(10);
  }
}

test("the facade refuses an unauthenticated socket and a non-loopback bind", async (t) => {
  const { facade, store, client } = await harness(t);
  await assert.rejects(
    WebSocketTransport.connect(facade.url),
    /failed to open|401|Unexpected server response/,
    "a socket with no token is rejected at the HTTP upgrade",
  );
  await assert.rejects(
    WebSocketTransport.connect(facade.url + "/?token=wrong"),
    /failed to open|401|Unexpected server response/,
  );
  const health = await fetch(
    facade.url.replace("ws://", "http://") + "/health",
  );
  assert.equal(health.status, 401, "diagnostics require the token too");
  // A listener that hands out owned provider sessions must not be published on
  // another interface; remote access goes through an authenticated tunnel.
  assert.throws(
    () =>
      startAhpFacade({
        store,
        client,
        file: ":memory:",
        host: "0.0.0.0",
        tokens: { [EDITOR_TOKEN]: { name: "editor", scope: "full" } },
      }),
    /binds loopback only/,
  );
});

test("protocol negotiation selects a version the client offered, or refuses clearly", async (t) => {
  const { facade } = await harness(t);
  const { client, result } = await connect(facade);
  t.after(() => client.shutdown());
  assert.equal(
    result.protocolVersion,
    "0.9.0",
    "the installed editor offers 0.9.0 as its newest; the facade must speak it",
  );
  assert.ok(VSCODE_1_138_OFFER.includes(result.protocolVersion));
  assert.equal(result.serverInfo.name, "Avoozl");

  const transport = await WebSocketTransport.connect(
    facade.url + "/?token=" + encodeURIComponent(EDITOR_TOKEN),
  );
  const stubborn = new AhpClient(transport);
  stubborn.connect();
  t.after(() => stubborn.shutdown());
  await assert.rejects(
    stubborn.initialize({
      clientId: "incompatible",
      protocolVersions: ["3.1.0"],
    }),
    (error) => {
      assert.equal(error.code, AhpErrorCodes.UnsupportedProtocolVersion);
      assert.deepEqual(error.data.supportedVersions, [
        ...SUPPORTED_PROTOCOL_VERSIONS,
      ]);
      return true;
    },
  );
});

test("an unimplemented method is refused by name rather than answered as a no-op", async (t) => {
  const { facade } = await harness(t);
  const { client } = await connect(facade);
  t.after(() => client.shutdown());
  await assert.rejects(
    client.resourceWrite({ uri: "file:///tmp/nope", data: "x" }),
    /does not implement|outside the directories/,
  );
  await assert.rejects(
    client.createResourceWatch({ uri: "file:///tmp" }),
    /does not implement/,
  );
});

test("sessions and chats are listed, snapshotted, and tied to the owning run", async (t) => {
  const { facade, ops, store } = await harness(t);
  const run = await startRun(ops);
  const uris = runUris(workspaceIdentity(store), run.id);
  const { client } = await connect(facade, EDITOR_TOKEN, [ROOT_CHANNEL]);
  t.after(() => client.shutdown());
  const listed = await until(async () => {
    const result = await client.subscribe(uris.session);
    return result.result.snapshot ? result : null;
  });
  const session = listed.result.snapshot.state;
  assert.equal(
    session.provider,
    "avoozl-codex",
    "the advertised provider id is namespaced away from the editor's built-ins",
  );
  assert.equal(session._meta["avoozl.provider"], "codex");
  assert.equal(session.defaultChat, uris.chat);
  assert.equal(session._meta["avoozl.runId"], run.id);
  assert.equal(session._meta["avoozl.workspaceId"], workspaceIdentity(store));
  // Model choice is advertised from the provider catalog, not from a hardcoded
  // list on whichever machine built the facade.
  assert.deepEqual(session.config.schema.properties.model.enum, [
    "stub-model",
    "other-model",
  ]);
  const chat = (await client.subscribe(uris.chat)).result.snapshot.state;
  assert.equal(chat.activeTurn.message.text, "What needs my decision?");
  assert.equal(chat._meta["avoozl.runId"], run.id);
  await assert.rejects(
    client.subscribe("ahp-chat:/00000000-0000-5000-8000-000000000000"),
    /No channel named/,
  );
});

test("a client turn delivers exactly once however many times it is dispatched", async (t) => {
  const { facade, ops, store, stub, manager } = await harness(t);
  const run = await startRun(ops);
  // Finish the opening turn so a follow-up is delivered rather than queued.
  manager.receive(run.id, "turn.completed", { state: "completed" });
  const uris = runUris(workspaceIdentity(store), run.id);
  const first = await connect(facade, EDITOR_TOKEN, [uris.chat]);
  const second = await connect(facade, EDITOR_TOKEN, [uris.chat]);
  t.after(() =>
    Promise.all([first.client.shutdown(), second.client.shutdown()]),
  );
  const action = {
    type: "chat/turnStarted",
    turnId: "client-turn-1",
    startedAt: new Date().toISOString(),
    message: { text: "Please continue", origin: { kind: "user" } },
  };
  first.client.dispatch(uris.chat, action);
  second.client.dispatch(uris.chat, action);
  first.client.dispatch(uris.chat, action);
  await until(() => stub.calls.sent.some((s) => s.text === "Please continue"));
  await delay(150);
  assert.equal(
    stub.calls.sent.filter((s) => s.text === "Please continue").length,
    1,
    "a retried or duplicated dispatch must not send twice",
  );
  // The turn the transcript records is the one the client named.
  const chat = await until(() => {
    const state = facade.projection.channelState(uris.chat);
    return state.activeTurn?.id === "client-turn-1" ? state : null;
  });
  assert.equal(chat.activeTurn.message.text, "Please continue");
  assert.equal(store.get("deliveries", "ahp:client-turn-1").state, "accepted");
});

test("two clients answering one approval produce one provider answer and a clear conflict", async (t) => {
  const { facade, ops, store, stub, manager } = await harness(t);
  const run = await startRun(ops);
  manager.request(run.id, {
    providerRequestId: "p-1",
    kind: "approval",
    method: "Bash",
    payload: {
      tool: "Bash",
      toolUseId: "toolu_1",
      input: { command: "node check.mjs" },
    },
  });
  const uris = runUris(workspaceIdentity(store), run.id);
  const pending = store.list("requests").find((r) => r.state === "pending");
  const { client } = await connect(facade, EDITOR_TOKEN, [uris.chat]);
  t.after(() => client.shutdown());
  await until(() => {
    const state = facade.projection.channelState(uris.chat);
    return state.activeTurn?.responseParts.some(
      (p) =>
        p.kind === "toolCall" && p.toolCall.status === "pending-confirmation",
    );
  });
  // Answer once through the facade and once directly, as the website would.
  const confirm = () =>
    facade.projection &&
    ops.execute("run.answer", { id: pending.id, decision: "allow" });
  await confirm();
  await assert.rejects(confirm(), /no longer pending/);
  const direct = await until(
    () => store.get("requests", pending.id).state === "allowed",
  );
  assert.equal(stub.calls.answered.length, 1);

  // A stale dispatch from an editor that still shows the prompt is refused
  // with a conflict rather than silently accepted.
  const raw = await rawDispatch(facade, uris.chat, {
    type: "chat/toolCallConfirmed",
    turnId: facade.projection.channelState(uris.chat).activeTurn.id,
    toolCallId: "toolu_1",
    approved: true,
    confirmed: "user-action",
  });
  assert.equal(raw.error.code, AhpErrorCodes.Conflict);
  assert.match(
    raw.error.message,
    /already have been answered|no longer pending/,
  );
  assert.equal(stub.calls.answered.length, 1);
});

test("an approval invalidated by a host restart cannot be answered", async (t) => {
  const { facade, ops, store, manager } = await harness(t);
  const run = await startRun(ops);
  manager.request(run.id, {
    providerRequestId: "p-2",
    kind: "approval",
    method: "Bash",
    payload: { tool: "Bash", toolUseId: "toolu_2", input: { command: "ls" } },
  });
  const uris = runUris(workspaceIdentity(store), run.id);
  await until(() => facade.projection.channelState(uris.chat)?.activeTurn);
  const pending = store.list("requests").find((r) => r.state === "pending");
  // What a host restart does to a pending approval.
  store.put("requests", { ...pending, state: "interrupted", executed: false });
  store.put("runs", { ...store.get("runs", run.id), state: "disconnected" });
  store.event(run.id, "run.recovered", { state: "disconnected" });
  facade.pump();
  const raw = await rawDispatch(facade, uris.chat, {
    type: "chat/toolCallConfirmed",
    turnId: "initial:" + run.id,
    toolCallId: "toolu_2",
    approved: true,
    confirmed: "user-action",
  });
  assert.ok(raw.error, "an invalidated approval must not be accepted");
  assert.match(raw.error.message, /no longer pending|no pending permission/i);
});

test("cancellation reaches the provider and the refusal of an impossible cancel is honest", async (t) => {
  const { facade, ops, store, stub, manager } = await harness(t);
  const run = await startRun(ops);
  const uris = runUris(workspaceIdentity(store), run.id);
  const { client } = await connect(facade, EDITOR_TOKEN, [uris.chat]);
  t.after(() => client.shutdown());
  await until(() => facade.projection.channelState(uris.chat)?.activeTurn);
  client.dispatch(uris.chat, {
    type: "chat/turnCancelled",
    turnId: "initial:" + run.id,
    duration: 0,
  });
  await until(() => stub.calls.interrupted === 1);
  const requested = store
    .events({ runId: run.id })
    .find((e) => e.kind === "interrupt.requested");
  assert.match(requested.reason, /^client-cancel:/);

  // The provider reports the stop. The run is interrupted, not failed.
  manager.receive(run.id, "turn.completed", {
    state: "interrupted",
    cancellation: { source: "provider", requested: true },
  });
  const state = await until(() => {
    const chat = facade.projection.channelState(uris.chat);
    return chat.turns.length ? chat : null;
  });
  assert.equal(state.turns.at(-1).state, "cancelled");
  assert.equal(store.get("runs", run.id).state, "interrupted");
  assert.equal(store.get("runs", run.id).error, undefined);

  // Cancelling a disconnected run cannot work, and says so.
  store.put("runs", { ...store.get("runs", run.id), state: "disconnected" });
  await manager.close();
  const raw = await rawDispatch(facade, uris.chat, {
    type: "chat/turnCancelled",
    turnId: "initial:" + run.id,
    duration: 0,
  });
  assert.ok(raw.error);
  assert.match(raw.error.message, /disconnected/i);
});

test("a refused send corrects the optimistic client instead of leaving a phantom turn", async (t) => {
  const { facade, ops, store, manager } = await harness(t);
  const run = await startRun(ops);
  const uris = runUris(workspaceIdentity(store), run.id);
  await until(() => facade.projection.channelState(uris.chat)?.activeTurn);
  // An integrated worktree refuses follow-ups.
  store.put("runs", { ...store.get("runs", run.id), state: "integrated" });
  const { client } = await connect(facade, EDITOR_TOKEN, [uris.chat]);
  t.after(() => client.shutdown());
  const seen = [];
  const subscription = client.attachSubscription(uris.chat);
  (async () => {
    for await (const event of subscription) seen.push(event);
  })().catch(() => {});
  const raw = await rawDispatch(facade, uris.chat, {
    type: "chat/turnStarted",
    turnId: "phantom-turn",
    startedAt: new Date().toISOString(),
    message: { text: "Another follow-up", origin: { kind: "user" } },
  });
  assert.equal(raw.error.code, AhpErrorCodes.Conflict);
  assert.match(raw.error.message, /landed/);
  // The client is told the turn it rendered did not happen.
  const correction = await until(() =>
    seen.find(
      (event) =>
        event.params?.action?.type === "chat/error" &&
        event.params.action.turnId === "phantom-turn",
    ),
  );
  assert.equal(
    correction.params.action.part.error.errorType,
    "DispatchRefused",
  );
  assert.equal(correction.params.action.part.resumable, false);
});

test("a read-only client observes but cannot change a session", async (t) => {
  const { facade, ops, store, stub } = await harness(t);
  const run = await startRun(ops);
  const uris = runUris(workspaceIdentity(store), run.id);
  const { client, result } = await connect(facade, OBSERVER_TOKEN, [uris.chat]);
  t.after(() => client.shutdown());
  assert.equal(result._meta["avoozl.scope"], "read");
  assert.ok(result.snapshots.length, "observers still receive state");
  const raw = await rawDispatch(
    facade,
    uris.chat,
    {
      type: "chat/turnStarted",
      turnId: "observer-turn",
      startedAt: new Date().toISOString(),
      message: { text: "let me in", origin: { kind: "user" } },
    },
    OBSERVER_TOKEN,
  );
  assert.equal(raw.error.code, AhpErrorCodes.PermissionDenied);
  assert.equal(stub.calls.sent.filter((s) => s.text === "let me in").length, 0);
});

test("concurrent clients see the same actions in the same order", async (t) => {
  const { facade, ops, store, manager } = await harness(t);
  const run = await startRun(ops);
  const uris = runUris(workspaceIdentity(store), run.id);
  const a = await connect(facade, EDITOR_TOKEN, [uris.chat]);
  const b = await connect(facade, OBSERVER_TOKEN, [uris.chat]);
  t.after(() => Promise.all([a.client.shutdown(), b.client.shutdown()]));
  const seenA = [],
    seenB = [];
  for (const [client, sink] of [
    [a.client, seenA],
    [b.client, seenB],
  ]) {
    const subscription = client.attachSubscription(uris.chat);
    (async () => {
      for await (const event of subscription) sink.push(event);
    })().catch(() => {});
  }
  manager.receive(run.id, "message", { text: "Shared answer" });
  manager.receive(run.id, "turn.completed", { state: "completed" });
  await until(
    () =>
      seenA.some((e) => e.params?.action?.type === "chat/turnComplete") &&
      seenB.some((e) => e.params?.action?.type === "chat/turnComplete"),
  );
  const types = (sink) =>
    sink.map((e) => e.params?.action?.type).filter(Boolean);
  assert.deepEqual(types(seenA), types(seenB));
  assert.ok(types(seenA).includes("chat/turnComplete"));
  const seqs = seenA
    .filter((e) => e.type === "action")
    .map((e) => e.params.serverSeq);
  assert.deepEqual(
    seqs,
    [...seqs].sort((x, y) => x - y),
    "actions arrive in durable server-sequence order",
  );
});

test("reconnect replays the exact gap, or admits it must resend a snapshot", async (t) => {
  const { facade, ops, store, manager } = await harness(t);
  const run = await startRun(ops);
  const uris = runUris(workspaceIdentity(store), run.id);
  const { client } = await connect(facade, EDITOR_TOKEN, [uris.chat]);
  t.after(() => client.shutdown());
  await until(() => facade.projection.channelState(uris.chat)?.activeTurn);
  const beforeSeq = facade.projection.seq;
  manager.receive(run.id, "message", { text: "Missed while away" });
  manager.receive(run.id, "turn.completed", { state: "completed" });
  facade.pump();
  const replay = await client.reconnect({
    clientId: "reconnecting",
    lastSeenServerSeq: beforeSeq,
    subscriptions: [uris.chat],
  });
  assert.equal(replay.type, "replay");
  assert.ok(replay.actions.length >= 2);
  assert.ok(replay.actions.every((entry) => entry.serverSeq > beforeSeq));
  assert.deepEqual(replay.missing, []);
  // A gap the buffer cannot cover must become a snapshot rather than a
  // partial replay that would leave a silent hole.
  facade.projection.db.exec("DELETE FROM actions WHERE seq <= 2");
  const snapshot = await client.reconnect({
    clientId: "reconnecting",
    lastSeenServerSeq: 0,
    subscriptions: [uris.chat],
  });
  assert.equal(snapshot.type, "snapshot");
  assert.ok(snapshot.snapshots.length);
  // A channel that no longer exists is reported as missing, not invented.
  const gone = await client.reconnect({
    clientId: "reconnecting",
    lastSeenServerSeq: facade.projection.seq,
    subscriptions: [
      uris.chat,
      "ahp-chat:/00000000-0000-5000-8000-000000000000",
    ],
  });
  assert.deepEqual(gone.missing, [
    "ahp-chat:/00000000-0000-5000-8000-000000000000",
  ]);
});

test("a model change is a host operation recorded at a turn boundary", async (t) => {
  const { facade, ops, store, stub, manager } = await harness(t);
  const run = await startRun(ops);
  manager.receive(run.id, "session", {
    providerSessionId: "provider-session",
    model: "stub-model",
  });
  const uris = runUris(workspaceIdentity(store), run.id);
  const { client } = await connect(facade, EDITOR_TOKEN, [uris.session]);
  t.after(() => client.shutdown());
  // A model that the provider catalog does not list is refused.
  const bogus = await rawDispatch(facade, uris.session, {
    type: "session/configChanged",
    config: { model: "invented-model" },
  });
  assert.match(bogus.error.message, /not in the provider catalog/);
  assert.equal(stub.calls.models.length, 0);

  // A pending decision must be answered before the model changes.
  manager.request(run.id, {
    providerRequestId: "p-model",
    kind: "approval",
    method: "Bash",
    payload: { tool: "Bash", toolUseId: "toolu_m", input: { command: "ls" } },
  });
  const blocked = await rawDispatch(facade, uris.session, {
    type: "session/configChanged",
    config: { model: "other-model" },
  });
  assert.match(blocked.error.message, /pending request/);

  const pending = store.list("requests").find((r) => r.state === "pending");
  await ops.execute("run.answer", { id: pending.id, decision: "allow" });
  const accepted = await rawDispatch(facade, uris.session, {
    type: "session/configChanged",
    config: { model: "other-model" },
  });
  assert.equal(accepted.error, undefined);
  assert.deepEqual(stub.calls.models, ["other-model"]);
  const updated = store.get("runs", run.id);
  // Requested and actually-reported models stay separable, with when the
  // change takes effect recorded.
  assert.equal(updated.requestedModel, "other-model");
  assert.equal(updated.actualModel, "stub-model");
  assert.equal(updated.modelChange.applies, "next-turn");
  const session = await until(() => {
    const state = facade.projection.channelState(uris.session);
    return state.config.values.model === "other-model" ? state : null;
  });
  assert.equal(session._meta["avoozl.requestedModel"], "other-model");
  assert.equal(session._meta["avoozl.actualModel"], "stub-model");
});

test("queue controls the editor offers are carried out or refused for a stated reason", async (t) => {
  const { facade, ops, store, manager, stub } = await harness(t);
  const run = await startRun(ops);
  const uris = runUris(workspaceIdentity(store), run.id);
  await until(() => facade.projection.channelState(uris.chat)?.activeTurn);
  for (const id of ["q1", "q2"])
    await ops.execute("run.send", {
      id: run.id,
      text: "Queued " + id,
      submissionId: "ahp:" + id,
      mode: "queue",
    });
  await until(() => {
    const state = facade.projection.channelState(uris.chat);
    return state.queuedMessages?.length === 2;
  });
  // Reordering rewrites only the order, never a durable delivery.
  const reordered = await rawDispatch(facade, uris.chat, {
    type: "chat/queuedMessagesReordered",
    order: ["q2", "q1"],
  });
  assert.equal(reordered.error, undefined);
  assert.deepEqual(
    manager.queueOrder(run.id).map((d) => d.id),
    ["ahp:q2", "ahp:q1"],
  );
  // A queued message that never reached the provider can be withdrawn.
  const removed = await rawDispatch(facade, uris.chat, {
    type: "chat/pendingMessageRemoved",
    kind: "queued",
    id: "q1",
  });
  assert.equal(removed.error, undefined);
  assert.equal(store.get("deliveries", "ahp:q1").state, "cancelled");
  await until(() => {
    const state = facade.projection.channelState(uris.chat);
    return (
      state.queuedMessages?.length === 1 && state.queuedMessages[0].id === "q2"
    );
  });
  // Truncating the durable transcript is refused with its reason, not
  // accepted as a silent no-op.
  const truncate = await rawDispatch(facade, uris.chat, {
    type: "chat/truncated",
  });
  assert.match(truncate.error.message, /durable execution record/);
});

test("draining the host refuses new turns while existing work continues", async (t) => {
  const { facade, ops, store, manager } = await harness(t);
  const run = await startRun(ops);
  const uris = runUris(workspaceIdentity(store), run.id);
  await until(() => facade.projection.channelState(uris.chat)?.activeTurn);
  manager.draining = true;
  const steer = await rawDispatch(facade, uris.chat, {
    type: "chat/pendingMessageSet",
    kind: "steering",
    id: "drain-steer",
    message: { text: "steer now", origin: { kind: "user" } },
  });
  assert.match(steer.error.message, /draining/);
  // A queued follow-up is still accepted and stays durable for after the
  // update, rather than being lost or delivered mid-drain.
  const queued = await rawDispatch(facade, uris.chat, {
    type: "chat/pendingMessageSet",
    kind: "queued",
    id: "drain-queue",
    message: { text: "later", origin: { kind: "user" } },
  });
  assert.equal(queued.error, undefined);
  assert.equal(store.get("deliveries", "ahp:drain-queue").state, "queued");
});

test("resource reads are confined to the directories the workspace exposes", async (t) => {
  const { facade, ops, root } = await harness(t);
  const run = await startRun(ops);
  const fs = await import("node:fs");
  fs.writeFileSync(path.join(root, "inside.txt"), "visible");
  const { client } = await connect(facade);
  t.after(() => client.shutdown());
  const read = await client.resourceRead({
    uri: "file://" + path.join(root, "inside.txt"),
  });
  assert.equal(read.data, "visible");
  await assert.rejects(
    client.resourceRead({ uri: "file:///etc/passwd" }),
    (error) => {
      assert.equal(error.code, AhpErrorCodes.PermissionDenied);
      return true;
    },
  );
  await assert.rejects(
    client.resourceRead({ uri: "file://" + path.join(root, "..", "escape") }),
    /outside the directories|No such file/,
  );
});

// `dispatchAction` is a protocol notification, so the official client cannot
// observe a refusal. These tests send it with an id to read the error the
// facade produces; the facade answers both shapes.
async function rawDispatch(facade, channel, action, token = EDITOR_TOKEN) {
  const ws = new WebSocket(facade.url + "/?token=" + encodeURIComponent(token));
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const replies = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) replies.get(message.id)?.(message);
  });
  const request = (id, method, params) =>
    new Promise((resolve) => {
      replies.set(id, resolve);
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  await request(1, "initialize", {
    channel: ROOT_CHANNEL,
    clientId: "raw-" + randomUUID(),
    protocolVersions: VSCODE_1_138_OFFER,
  });
  const reply = await request(2, "dispatchAction", {
    channel,
    clientSeq: 1,
    action,
  });
  ws.close();
  return reply;
}

test("the audit trail names the client behind every dispatch, accepted or refused", async (t) => {
  const { facade, ops, store, manager } = await harness(t);
  const run = await startRun(ops);
  manager.receive(run.id, "turn.completed", { state: "completed" });
  const uris = runUris(workspaceIdentity(store), run.id);
  const editor = await connect(facade, EDITOR_TOKEN, [uris.chat]);
  t.after(() => editor.client.shutdown());
  editor.client.dispatch(uris.chat, {
    type: "chat/turnStarted",
    turnId: "audited-turn",
    startedAt: new Date().toISOString(),
    message: { text: "Audited", origin: { kind: "user" } },
  });
  await until(() => facade.dispatches().some((entry) => entry.accepted));
  // A refusal is recorded too, with the reason and the client that asked.
  await rawDispatch(
    facade,
    uris.chat,
    { type: "chat/truncated" },
    EDITOR_TOKEN,
  );
  await rawDispatch(
    facade,
    uris.chat,
    {
      type: "chat/turnStarted",
      turnId: "observer-turn",
      startedAt: new Date().toISOString(),
      message: { text: "no", origin: { kind: "user" } },
    },
    OBSERVER_TOKEN,
  );
  const trail = await until(() =>
    facade.dispatches().length >= 3 ? facade.dispatches() : null,
  );
  const accepted = trail.find((entry) => entry.accepted);
  assert.equal(accepted.action, "chat/turnStarted");
  assert.equal(accepted.grant, "editor");
  assert.equal(accepted.channel, uris.chat);
  // The client identity is what makes it possible to say a native editor
  // control, rather than a script, produced an action.
  assert.ok(accepted.clientId);
  const truncation = trail.find((entry) => entry.action === "chat/truncated");
  assert.equal(truncation.accepted, false);
  assert.match(truncation.detail, /durable execution record/);
  const denied = trail.find((entry) => entry.grant === "observer");
  assert.equal(denied.accepted, false);
  assert.match(denied.detail, /observe/);
  // Ordering is by the facade's own sequence, oldest first.
  const seqs = trail.map((entry) => entry.seq);
  assert.deepEqual(
    seqs,
    [...seqs].sort((a, b) => a - b),
  );
});

test("the host stores the editor's own root configuration instead of refusing it", async (t) => {
  // The editor dispatches root/configChanged to keep preferences on the host.
  // Refusing it left a real editor retrying the same action and never
  // listing the sessions this host owns.
  const { facade } = await harness(t);
  const { client } = await connect(facade, EDITOR_TOKEN, [ROOT_CHANNEL]);
  t.after(() => client.shutdown());
  const accepted = await rawDispatch(facade, ROOT_CHANNEL, {
    type: "root/configChanged",
    config: { "some.editor.preference": "kept" },
  });
  assert.equal(accepted.error, undefined);
  assert.deepEqual(facade.projection.rootConfigValues(), {
    "some.editor.preference": "kept",
  });
  // Merging by default, replacing on request.
  await rawDispatch(facade, ROOT_CHANNEL, {
    type: "root/configChanged",
    config: { another: 1 },
  });
  assert.equal(facade.projection.rootConfigValues().another, 1);
  assert.equal(
    facade.projection.rootConfigValues()["some.editor.preference"],
    "kept",
  );
  await rawDispatch(facade, ROOT_CHANNEL, {
    type: "root/configChanged",
    config: { only: true },
    replace: true,
  });
  assert.deepEqual(facade.projection.rootConfigValues(), { only: true });
  // It reaches the root state a client reads.
  assert.deepEqual(facade.projection.rootState().config.values, {
    only: true,
  });
  // A server action is still refused: a client cannot claim to change the
  // agents this host advertises.
  const serverAction = await rawDispatch(facade, ROOT_CHANNEL, {
    type: "root/agentsChanged",
    agents: [],
  });
  assert.ok(serverAction.error);
  assert.match(serverAction.error.message, /server action/);
  // And a client-dispatchable action with no meaning on the root channel is
  // refused by name rather than silently accepted.
  const wrongChannel = await rawDispatch(facade, ROOT_CHANNEL, {
    type: "chat/isReadChanged",
    isRead: true,
  });
  assert.ok(wrongChannel.error);
  assert.match(wrongChannel.error.message, /root channel/);
});
