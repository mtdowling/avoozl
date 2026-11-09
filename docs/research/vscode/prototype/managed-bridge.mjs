// Research prototype only. See ../README.md for known gaps and limits.
import { importApp, importSdk, appRequire } from "./app-source.mjs";
// Disposable durable AHP facade over the unmodified production agent host.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";
import { chatReducer } from "@microsoft/agent-host-protocol";
const { Store } = await importApp("store.mjs");
const root = process.argv[2];
if (!(root && path.basename(root).startsWith("aicommander-vscode-probe-")))
  throw Error("Disposable root required");
const source = new Store(path.join(root, "workspace.sqlite")),
  db = new DatabaseSync(path.join(root, "ahp.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state(id TEXT PRIMARY KEY,body TEXT); CREATE TABLE IF NOT EXISTS actions(seq INTEGER PRIMARY KEY AUTOINCREMENT,channel TEXT,body TEXT); CREATE TABLE IF NOT EXISTS meta(id TEXT PRIMARY KEY,value TEXT);",
);
const state = (id) => {
    const r = db.prepare("SELECT body FROM state WHERE id=?").get(id);
    return r ? JSON.parse(r.body) : null;
  },
  put = (id, value) =>
    db
      .prepare(
        "INSERT INTO state VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(id, JSON.stringify(value));
const meta = (id) =>
    db.prepare("SELECT value FROM meta WHERE id=?").get(id)?.value,
  setMeta = (id, value) =>
    db
      .prepare(
        "INSERT INTO meta VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(id, String(value));
const uuid = (id) =>
  createHash("sha256")
    .update(id)
    .digest("hex")
    .slice(0, 32)
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
const uris = (id) => ({
  session: "ahp-session:/" + uuid(id),
  chat: "ahp-chat:/" + uuid(id + ":chat"),
});
const idFor = (uri) =>
  source.list("runs").find((r) => Object.values(uris(r.id)).includes(uri))?.id;
const clients = new Map(),
  trace = [];
let seq = Number(db.prepare("SELECT MAX(seq) n FROM actions").get().n) || 0;
const stamp = () => new Date().toISOString();
function saveTrace() {
  fs.writeFileSync(
    path.join(root, "managed-bridge.json"),
    JSON.stringify(
      {
        at: stamp(),
        root,
        seq,
        sourceSeq: Number(meta("sourceSeq") || 0),
        trace,
      },
      null,
      2,
    ),
  );
}
function action(channel, a, origin) {
  if (channel.startsWith("ahp-chat:"))
    put(channel, chatReducer(state(channel), a));
  const n = Number(
    db
      .prepare("INSERT INTO actions(channel,body) VALUES (?,?)")
      .run(channel, JSON.stringify(a)).lastInsertRowid,
  );
  seq = n;
  const params = {
    channel,
    action: a,
    serverSeq: seq,
    ...(origin ? { origin } : {}),
  };
  for (const [ws, c] of clients)
    if (c.subs.has(channel))
      ws.send(JSON.stringify({ jsonrpc: "2.0", method: "action", params }));
  return params;
}
function ensure(run) {
  const u = uris(run.id);
  if (!state(u.chat))
    put(u.chat, {
      resource: u.chat,
      title: run.title,
      status: 1,
      modifiedAt: run.createdAt,
      turns: [],
      queuedMessages: [],
      draft: { text: "", origin: { kind: "user" } },
    });
  return u;
}
function startTurn(id, turnId, text) {
  const run = source.get("runs", id),
    u = ensure(run),
    s = state(u.chat);
  if (s.activeTurn?.id === turnId || s.turns.some((t) => t.id === turnId))
    return;
  action(u.chat, {
    type: "chat/turnStarted",
    turnId,
    startedAt: stamp(),
    message: { text, origin: { kind: "user" } },
  });
}
function mapEvent(e) {
  const run = source.get("runs", e.runId);
  if (!run) return;
  const u = ensure(run);
  let s = state(u.chat),
    turnId = s.activeTurn?.id;
  if (e.kind === "run.created") {
    startTurn(run.id, "initial-" + run.id, run.prompt);
    return;
  }
  if (
    e.kind === "delivery.updated" &&
    ["accepted", "submitted"].includes(e.delivery.state)
  ) {
    startTurn(
      run.id,
      e.delivery.id.startsWith("ahp-") ? e.delivery.id.slice(4) : e.delivery.id,
      e.delivery.text,
    );
    return;
  }
  if (e.kind === "message.delta" || e.kind === "message") {
    if (!turnId) return;
    const partId = "text-" + turnId,
      exists = s.activeTurn.responseParts.some((p) => p.id === partId);
    if (e.kind === "message" && exists) return;
    if (!exists)
      action(u.chat, {
        type: "chat/responsePart",
        turnId,
        part: { kind: "markdown", id: partId, content: "" },
      });
    action(u.chat, { type: "chat/delta", turnId, partId, content: e.text });
  } else if (e.kind === "request.created" && turnId) {
    const r = e.request;
    if (r.kind === "approval") {
      action(u.chat, {
        type: "chat/toolCallStart",
        turnId,
        toolCallId: r.id,
        toolName: r.method,
        displayName: "Permission: " + r.method,
      });
      action(u.chat, {
        type: "chat/toolCallReady",
        turnId,
        toolCallId: r.id,
        invocationMessage: JSON.stringify(r.payload, null, 2),
        confirmationTitle: "Real provider permission request",
        options: [
          { id: "allow-once", label: "Allow once", kind: "approve" },
          { id: "deny", label: "Deny", kind: "deny" },
        ],
      });
    } else {
      const questions = r.payload.input?.questions || r.payload.questions || [];
      action(u.chat, {
        type: "chat/inputRequested",
        request: {
          id: r.id,
          message: "Real provider question",
          questions: questions.map((q, i) => ({
            id: q.id || q.question || String(i),
            title: q.header || "Question",
            message: q.question,
            kind: q.options?.length ? "single-select" : "text",
            required: true,
            ...(q.options?.length
              ? {
                  options: q.options.map((o) => ({
                    id: o.label,
                    label: o.label,
                    description: o.description,
                  })),
                  allowFreeformInput: true,
                }
              : {}),
          })),
        },
      });
    }
  } else if (
    e.kind === "request.answered" &&
    turnId &&
    e.request.kind === "approval"
  ) {
    const r = e.request;
    action(u.chat, {
      type: "chat/toolCallConfirmed",
      turnId,
      toolCallId: r.id,
      approved: r.state === "allowed",
    });
  } else if (
    e.kind === "tool.activity" &&
    turnId &&
    e.method === "item/commandExecution/outputDelta"
  ) {
    const request = source
      .list("requests")
      .find((r) => r.runId === run.id && r.payload.itemId === e.itemId);
    if (request)
      action(u.chat, {
        type: "chat/toolCallContentChanged",
        turnId,
        toolCallId: request.id,
        content: [{ type: "text", text: e.delta || "" }],
      });
  } else if (e.kind === "turn.completed" && turnId) {
    const interrupted = e.state === "interrupted";
    for (const part of s.activeTurn.responseParts.filter(
      (p) => p.kind === "toolCall" && p.toolCall?.status === "running",
    )) {
      action(u.chat, {
        type: "chat/toolCallComplete",
        turnId,
        toolCallId: part.toolCall.toolCallId,
        result: {
          success: e.state === "completed",
          pastTenseMessage: interrupted
            ? "Interrupted by user"
            : e.state === "completed"
              ? "Provider turn completed"
              : "Provider turn failed",
        },
      });
    }
    if (e.state === "failed")
      action(u.chat, {
        type: "chat/responsePart",
        turnId,
        part: {
          kind: "markdown",
          id: "failed-" + e.seq,
          content: "Provider failed: " + JSON.stringify(e.error || "No detail"),
        },
      });
    action(u.chat, {
      type: interrupted ? "chat/turnCancelled" : "chat/turnComplete",
      turnId,
      duration: 0,
    });
  } else if (e.kind === "run.recovered" && turnId) {
    action(u.chat, {
      type: "chat/responsePart",
      turnId,
      part: {
        kind: "markdown",
        id: "recovered-" + e.seq,
        content:
          "Host restarted. This run is disconnected; resume explicitly. Pending approvals were invalidated.",
      },
    });
    action(u.chat, { type: "chat/turnCancelled", turnId, duration: 0 });
  }
}
function poll() {
  const events = source.events({
    after: Number(meta("sourceSeq") || 0),
    limit: 1000,
  });
  for (const e of events) {
    db.exec("BEGIN IMMEDIATE");
    try {
      mapEvent(e);
      setMeta("sourceSeq", e.seq);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      trace.push({ error: error.message, event: e.kind });
      throw error;
    }
    if (
      [
        "state",
        "turn.completed",
        "request.created",
        "request.answered",
        "run.recovered",
      ].includes(e.kind)
    ) {
      const r = source.get("runs", e.runId);
      if (r) {
        const summary = session(r);
        for (const [ws, c] of clients)
          if (c.subs.has("ahp-root://"))
            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                method: "root/sessionSummaryChanged",
                params: {
                  channel: "ahp-root://",
                  session: summary.resource,
                  changes: {
                    status: summary.status,
                    modifiedAt: summary.modifiedAt,
                  },
                },
              }),
            );
      }
    }
  }
  if (events.length) saveTrace();
}
const models = {
  codex: [
    {
      id: process.env.CODEX_MODEL || "default",
      name: "Configured Codex model",
      provider: "codex",
    },
  ],
  claude: [
    {
      id: process.env.CLAUDE_MODEL || "haiku",
      name: "Configured Claude model",
      provider: "claude",
    },
  ],
};
function session(run) {
  const u = ensure(run),
    s = state(u.chat),
    status = run.state.startsWith("waiting")
      ? 24
      : run.state === "running"
        ? 8
        : run.state === "failed"
          ? 2
          : 1;
  return {
    resource: u.session,
    provider: run.provider,
    title: run.title,
    status,
    createdAt: run.createdAt,
    modifiedAt: run.updatedAt || run.lastObservedAt || run.createdAt,
    workingDirectories: [pathToFileURL(run.worktree).href],
    lifecycle: "ready",
    activeClients: [],
    chats: [{ resource: u.chat, title: run.title, status }],
    defaultChat: u.chat,
    config: {
      schema: {
        type: "object",
        properties: {
          model: {
            type: "string",
            title: "Model",
            enum: models[run.provider].map((m) => m.id),
            sessionMutable: false,
          },
        },
      },
      values: { model: run.model },
    },
    customizations: [],
    changesets: [],
    _meta: {
      taskId: run.taskId,
      runId: run.id,
      providerSessionId: run.providerSessionId,
    },
  };
}
function snapshot(resource) {
  let value;
  if (resource === "ahp-root://")
    value = {
      agents: Object.entries(models).map(([provider, models]) => ({
        provider,
        displayName: "Plans " + provider,
        models,
        protectedResources: [],
      })),
      activeSessions: source.list("runs").length,
      config: { schema: { type: "object", properties: {} }, values: {} },
      _meta: { "vscode.remoteSessions": true },
    };
  else if (resource.startsWith("ahp-chat:")) value = state(resource);
  else {
    const id = idFor(resource);
    if (id) value = session(source.get("runs", id));
  }
  return value ? { resource, state: value, fromSeq: seq } : null;
}
async function rpc(operation, input) {
  const host = JSON.parse(fs.readFileSync(path.join(root, "host.json"))),
    r = await fetch(host.url + "/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + host.secret,
      },
      body: JSON.stringify({ operation, input }),
    }),
    body = await r.json();
  if (!r.ok) throw Error(body.error);
  return body.result;
}
poll();
const timer = setInterval(() => {
  try {
    poll();
  } catch (error) {
    console.error(error.message);
  }
}, 150);
const port = Number(process.env.AHP_PORT || 9496);
const server = new WebSocketServer({ host: "127.0.0.1", port });
server.on("connection", (ws) => {
  const c = { subs: new Set(), id: "" };
  clients.set(ws, c);
  ws.on("close", () => clients.delete(ws));
  ws.on("message", async (data) => {
    let m;
    try {
      m = JSON.parse(data);
      const p = m.params || {},
        reply = (result) =>
          m.id !== undefined &&
          ws.send(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }));
      trace.push({
        at: stamp(),
        method: m.method,
        action: p.action?.type,
        channel: p.channel,
        ...(m.method === "dispatchAction"
          ? {
              toolCallId: p.action?.toolCallId,
              approved: p.action?.approved,
              turnId: p.action?.turnId,
            }
          : {}),
      });
      switch (m.method) {
        case "initialize":
          c.id = p.clientId;
          c.subs = new Set(p.initialSubscriptions || []);
          reply({
            protocolVersion: "1.0.0",
            serverSeq: seq,
            snapshots: [...c.subs].map(snapshot).filter(Boolean),
            defaultDirectory: pathToFileURL(path.join(root, "repo")).href,
            _meta: { "vscode.ahpSessionUris": true, "vscode.agentHost": true },
          });
          break;
        case "reconnect":
          c.id = p.clientId;
          c.subs = new Set(p.subscriptions || []);
          reply({
            type: "snapshot",
            serverSeq: seq,
            snapshots: [...c.subs].map(snapshot).filter(Boolean),
          });
          break;
        case "listSessions":
          reply({ items: source.list("runs").map(session) });
          break;
        case "subscribe":
          c.subs.add(p.channel);
          reply({
            snapshot: snapshot(p.channel) || {
              resource: p.channel,
              state: {},
              fromSeq: seq,
            },
          });
          break;
        case "unsubscribe":
          c.subs.delete(p.channel);
          reply({});
          break;
        case "resolveSessionConfig":
          reply({ schema: { type: "object", properties: {} }, values: {} });
          break;
        case "sessionConfigCompletions":
        case "completions":
          reply({ items: [] });
          break;
        case "ping":
        case "authenticate":
        case "fetchTurns":
          reply({});
          break;
        case "dispatchAction": {
          const id = idFor(p.channel),
            a = p.action;
          if (!id) throw Error("Unknown probe run");
          if (a.type === "chat/turnStarted") {
            const previous = source.get("deliveries", "ahp-" + a.turnId);
            if (!previous) {
              startTurn(id, a.turnId, a.message.text);
              await rpc("run.send", {
                id,
                text: a.message.text,
                submissionId: "ahp-" + a.turnId,
              });
            }
          } else if (a.type === "chat/toolCallConfirmed") {
            await rpc("run.answer", {
              id: a.toolCallId,
              decision: a.approved ? "allow" : "deny",
            });
            action(p.channel, a, { clientId: c.id, clientSeq: p.clientSeq });
          } else if (a.type === "chat/inputCompleted") {
            const r = source.get("requests", a.requestId),
              answers = {};
            for (const [key, answer] of Object.entries(a.answers || {})) {
              const v = answer.value;
              answers[key] =
                r.method === "AskUserQuestion"
                  ? (v?.value ?? v?.selected ?? v?.selectedValue)
                  : { answers: [v?.value ?? v?.selected ?? v?.selectedValue] };
            }
            await rpc("run.answer", {
              id: a.requestId,
              decision: a.response === "accept" ? "allow" : "deny",
              answers,
            });
            action(p.channel, a, { clientId: c.id, clientSeq: p.clientSeq });
          } else if (a.type === "chat/turnCancelled") {
            await rpc("run.interrupt", { id });
          } else
            action(p.channel, a, { clientId: c.id, clientSeq: p.clientSeq });
          break;
        }
        default:
          if (m.id !== undefined)
            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                id: m.id,
                error: {
                  code: -32601,
                  message: "Probe does not implement " + m.method,
                },
              }),
            );
      }
    } catch (error) {
      trace.push({ error: error.message, method: m?.method });
      if (m?.id !== undefined)
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: m.id,
            error: { code: -32603, message: error.message },
          }),
        );
    }
    saveTrace();
  });
});
server.on("listening", () => {
  fs.writeFileSync(
    path.join(root, "bridge.json"),
    JSON.stringify(
      {
        pid: process.pid,
        port,
        sessions: source
          .list("runs")
          .map((r) => ({ runId: r.id, ...uris(r.id) })),
      },
      null,
      2,
    ),
  );
  console.log("Durable probe bridge on loopback " + port);
});
process.on("SIGTERM", () => {
  clearInterval(timer);
  for (const ws of clients.keys()) ws.close();
  server.close(() => {
    db.close();
    source.close();
    process.exit(0);
  });
});
