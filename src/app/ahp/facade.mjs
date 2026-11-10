// The AHP facade: a versioned, authenticated translation of Avoozl's
// owned sessions into the Agent Host Protocol.
//
// It is a client of the workspace, never a second writer. Every state change
// goes through the shared client contract, which goes through the operations
// the website and CLI use, which go through the one persistent host that owns
// each provider process. The facade's own SQLite file holds a derived
// projection that can be rebuilt from the workspace event log.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  negotiateProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
  ACTION_INTRODUCED_IN,
  compareProtocolVersions,
  isClientDispatchable,
  AhpErrorCodes,
} from "@microsoft/agent-host-protocol";
import { Projection, agentProviderId } from "./projection.mjs";
import { ROOT_CHANNEL, channelKind } from "./uris.mjs";
import { AHP_SUBMISSION_PREFIX } from "./events.mjs";

export const FACADE_VERSION = "1.0.0";
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
const JSON_RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
};

// Client-dispatched actions this host can really carry out, and how.
// Anything outside this table is refused by name. Accepting an action the
// host cannot perform, and echoing it as though it had succeeded, would make
// the transcript lie.
const DISPATCH = new Set([
  "chat/turnStarted",
  "chat/pendingMessageSet",
  "chat/pendingMessageRemoved",
  "chat/queuedMessagesReordered",
  "chat/toolCallConfirmed",
  "chat/inputCompleted",
  "chat/inputAnswerChanged",
  "chat/turnCancelled",
  "chat/turnResume",
  "chat/draftChanged",
  "chat/isReadChanged",
  "chat/isArchivedChanged",
  "session/isArchivedChanged",
  "session/isReadChanged",
  "session/activeClientSet",
  "session/activeClientRemoved",
  "session/configChanged",
  "root/configChanged",
]);
const UNSUPPORTED_REASON = {
  "chat/truncated":
    "Transcripts are the durable execution record and are not truncated from a client.",
  "chat/toolCallComplete":
    "This host contributes no client-executed tools, so a client cannot complete a tool call.",
  "chat/toolCallContentChanged":
    "This host contributes no client-executed tools.",
  "chat/toolCallResultConfirmed":
    "Tool results are not gated on a second confirmation by this host.",
  "chat/workingDirectorySet":
    "A run's worktree is created by the workspace and cannot be changed from a client.",
  "chat/workingDirectoryRemoved":
    "A run's worktree is created by the workspace and cannot be changed from a client.",
  "session/workingDirectorySet":
    "A run's worktree is created by the workspace and cannot be changed from a client.",
  "session/workingDirectoryRemoved":
    "A run's worktree is created by the workspace and cannot be changed from a client.",
};

class AhpError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function startAhpFacade({
  store,
  client,
  file,
  host = "127.0.0.1",
  port = 0,
  tokens,
  manifestPath,
  pollIntervalMs = 150,
  retainTurns = 40,
  models,
  serverName = "Avoozl",
  allowNonLoopback = false,
  workspaceEndpoint = null,
}) {
  if (!store) throw Error("A workspace store is required.");
  if (!client) throw Error("A workspace client is required.");
  // This listener hands out control of owned provider sessions. It binds
  // loopback only. Remote access goes through an authenticated tunnel or an
  // SSH port forward, which keeps the listener itself private; publishing it
  // on another interface is refused rather than warned about.
  if (!LOOPBACK.has(host) && !allowNonLoopback)
    throw Error(
      "The agent host facade binds loopback only. " +
        host +
        " would let other machines reach owned provider sessions. Use an authenticated tunnel or an SSH port forward, or pass allowNonLoopback explicitly.",
    );
  // No anonymous access. A listener that hands out an owned provider session
  // must authenticate even on loopback, because a tunnel or port forward can
  // extend loopback to another machine.
  const grants = new Map(
    Object.entries(
      tokens && Object.keys(tokens).length
        ? tokens
        : { [randomUUID()]: { name: "default", scope: "full" } },
    ),
  );
  const projection = new Projection({
    store,
    file: file || ":memory:",
    retainTurns,
    models: models || (async () => []),
  });
  const clients = new Map();
  const subscriptionLog = [];
  let closing = false;

  const httpServer = http.createServer((req, res) => {
    // A plain HTTP request to the facade is answered only for diagnostics, and
    // only with information a client already needs to connect.
    if (req.method === "GET" && req.url?.startsWith("/health")) {
      const token = tokenFrom(req);
      const grant = token ? grants.get(token) : null;
      res.writeHead(grant ? 200 : 401, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      });
      res.end(
        JSON.stringify(
          grant
            ? {
                ok: true,
                facade: FACADE_VERSION,
                protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
                workspaceId: projection.workspaceId,
                sourceCursor: projection.cursor(),
                serverSeq: projection.seq,
                clients: [...clients.values()].map((c) => ({
                  clientId: c.clientId,
                  clientName: c.clientInfo?.name || null,
                  grant: c.grant.name,
                  protocolVersion: c.protocolVersion,
                  subscriptions: [...c.subs],
                })),
                // The channel identifiers this host owns. A client resolves a
                // conversation's channel from here rather than constructing a
                // scheme, because editor registrations differ by surface.
                dispatches: projection.dispatches({ limit: 50 }),
                calls: projection.callLog({ limit: 80 }),
                sessions: store
                  .list("runs")
                  .filter((r) => !r.deletedAt)
                  .map((r) => ({
                    runId: r.id,
                    taskId: r.taskId,
                    provider: r.provider,
                    // What the editor was told, and therefore the scheme it
                    // registers this session's chat under.
                    agentProvider: agentProviderId(r.provider),
                    state: r.state,
                    ...projection.transaction(() => projection.ensureRun(r)),
                  })),
              }
            : { error: "Authentication required." },
        ),
      );
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found." }));
  });

  function tokenFrom(req) {
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) {
      const supplied = header.slice(7);
      for (const key of grants.keys())
        if (constantTimeEqual(key, supplied)) return key;
      return null;
    }
    try {
      const url = new URL(req.url || "/", "http://localhost");
      // `tkn` is the editor's own convention for a connection token; `token`
      // is accepted for a hand-written address.
      const supplied =
        url.searchParams.get("tkn") || url.searchParams.get("token");
      if (!supplied) return null;
      for (const key of grants.keys())
        if (constantTimeEqual(key, supplied)) return key;
    } catch {}
    return null;
  }

  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const token = tokenFrom(req);
    if (!token) {
      socket.write(
        "HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Bearer\r\nConnection: close\r\n\r\n",
      );
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req, grants.get(token)),
    );
  });

  // ─── Delivery ──────────────────────────────────────────────────────────────

  function deliverable(connection, type) {
    const introduced = ACTION_INTRODUCED_IN[type];
    if (!introduced) return false;
    return compareProtocolVersions(connection.protocolVersion, introduced) >= 0;
  }

  function broadcast(envelopes) {
    for (const envelope of envelopes)
      for (const connection of clients.values()) {
        if (!connection.ready) continue;
        if (!connection.subs.has(envelope.channel)) continue;
        // An action newer than the version this client negotiated is withheld
        // rather than sent in a shape the client cannot reduce.
        if (!deliverable(connection, envelope.action.type)) continue;
        send(connection, {
          jsonrpc: "2.0",
          method: "action",
          params: {
            channel: envelope.channel,
            action: envelope.action,
            serverSeq: envelope.serverSeq,
            ...(envelope.origin ? { origin: envelope.origin } : {}),
          },
        });
        connection.lastSentSeq = envelope.serverSeq;
      }
  }

  function notifyRoot(method, params) {
    for (const connection of clients.values())
      if (connection.ready && connection.subs.has(ROOT_CHANNEL))
        send(connection, { jsonrpc: "2.0", method, params });
  }

  function send(connection, message) {
    try {
      connection.ws.send(JSON.stringify(message));
    } catch {}
  }

  // Session summaries are catalog projections. After folding, tell root
  // subscribers what changed so a client that only lists sessions stays current.
  let lastSummaries = new Map();
  function syncCatalog() {
    const summaries = projection.sessionSummaries();
    const seen = new Set();
    for (const summary of summaries) {
      seen.add(summary.resource);
      const previous = lastSummaries.get(summary.resource);
      if (!previous) {
        notifyRoot("root/sessionAdded", {
          channel: ROOT_CHANNEL,
          summary,
        });
      } else if (JSON.stringify(previous) !== JSON.stringify(summary)) {
        const { resource, provider, createdAt, ...changes } = summary;
        notifyRoot("root/sessionSummaryChanged", {
          channel: ROOT_CHANNEL,
          session: summary.resource,
          changes,
        });
      }
      lastSummaries.set(summary.resource, summary);
    }
    for (const resource of [...lastSummaries.keys()])
      if (!seen.has(resource)) {
        lastSummaries.delete(resource);
        notifyRoot("root/sessionRemoved", {
          channel: ROOT_CHANNEL,
          session: resource,
        });
      }
  }

  function pump() {
    if (closing) return;
    let envelopes = [];
    try {
      envelopes = projection.catchUp();
    } catch (error) {
      projection.setMeta("lastPumpError", {
        at: new Date().toISOString(),
        message: error.message,
      });
      return;
    }
    if (envelopes.length) broadcast(envelopes);
    syncCatalog();
  }

  // ─── Command mapping ───────────────────────────────────────────────────────

  function runIdFor(channel) {
    const runId = projection.runFor(channel);
    if (!runId)
      throw new AhpError(
        AhpErrorCodes.SessionNotFound,
        "No session in this workspace owns " + channel + ".",
      );
    return runId;
  }

  function requestForToolCall(runId, toolCallId) {
    const correlation = projection.correlationFor(runId);
    const tracked = correlation.tools[toolCallId];
    if (tracked?.requestId) return tracked.requestId;
    // Fall back to the durable record: a restarted facade may hold no
    // correlation for a request the workspace still has pending.
    const pending = store
      .list("requests")
      .find(
        (r) =>
          r.runId === runId &&
          r.state === "pending" &&
          (r.payload?.toolUseId === toolCallId ||
            r.payload?.itemId === toolCallId ||
            "request-tool:" + r.id === toolCallId),
      );
    if (pending) return pending.id;
    throw new AhpError(
      AhpErrorCodes.Conflict,
      "No pending permission request is correlated with tool call " +
        toolCallId +
        ". It may already have been answered, cancelled, or invalidated by a host restart.",
    );
  }

  async function perform(connection, channel, action) {
    if (channel === ROOT_CHANNEL) {
      if (action.type === "root/configChanged") {
        projection.setRootConfigValues(action.config || {}, action.replace);
        return { echo: true };
      }
      throw new AhpError(
        JSON_RPC.invalidParams,
        "This host does not implement " + action.type + " on the root channel.",
      );
    }
    const runId = runIdFor(channel);
    const kind = channelKind(channel);
    switch (action.type) {
      case "chat/turnStarted": {
        // The submission identifier is derived from the turn identifier, so a
        // retry, a reconnect, or a second client dispatching the same turn
        // delivers exactly once.
        await client.send({
          id: runId,
          text: action.message?.text || "",
          submissionId: AHP_SUBMISSION_PREFIX + action.turnId,
          mode: "queue",
        });
        return { echo: false };
      }
      case "chat/pendingMessageSet": {
        const steering = action.kind === "steering";
        await client.send({
          id: runId,
          text: action.message?.text || "",
          submissionId: AHP_SUBMISSION_PREFIX + action.id,
          mode: steering ? "steer" : "queue",
        });
        return { echo: false };
      }
      case "chat/pendingMessageRemoved": {
        // Only a delivery that never reached the provider can be withdrawn.
        await client.unsend({
          id: runId,
          submissionId: AHP_SUBMISSION_PREFIX + action.id,
        });
        return { echo: false };
      }
      case "chat/queuedMessagesReordered": {
        await client.reorderQueue({
          id: runId,
          order: (action.order || []).map((id) => AHP_SUBMISSION_PREFIX + id),
        });
        return { echo: true };
      }
      case "chat/toolCallConfirmed": {
        const requestId = requestForToolCall(runId, action.toolCallId);
        await client.answer({
          id: requestId,
          runId,
          decision: action.approved ? "allow" : "deny",
          optionId: action.selectedOptionId,
          answeredBy: connection.clientId,
        });
        return { echo: false };
      }
      case "chat/inputCompleted": {
        await client.answer({
          id: action.requestId,
          runId,
          decision: action.response === "accept" ? "allow" : "deny",
          answers: fromInputAnswers(action.answers),
          answeredBy: connection.clientId,
        });
        return { echo: false };
      }
      case "chat/turnCancelled": {
        // Record the intent, ask the provider, and wait for acknowledgement.
        // The turn's terminal state still comes from the provider.
        await client.interrupt(runId, "client-cancel:" + connection.clientId);
        return { echo: false };
      }
      case "chat/turnResume": {
        await client.resume({ id: runId });
        return { echo: false };
      }
      case "chat/isArchivedChanged":
      case "session/isArchivedChanged": {
        await client.call(action.isArchived ? "run.archive" : "run.unarchive", {
          id: runId,
        });
        return { echo: true };
      }
      case "session/configChanged": {
        // The action carries the values map itself, not a schema wrapper.
        const model = action.config?.model;
        const approvalMode = action.config?.approvalMode;
        if (model) await client.setModel({ id: runId, model });
        if (approvalMode) await client.approvals({ id: runId, approvalMode });
        if (!model && !approvalMode)
          throw new AhpError(
            JSON_RPC.invalidParams,
            "Only model and approvalMode are configurable on a session.",
          );
        return { echo: false };
      }
      // Presentation-only state. Echoing is the whole effect, and it is
      // shared so concurrent clients agree.
      case "chat/inputAnswerChanged":
      case "chat/draftChanged":
      case "chat/isReadChanged":
      case "session/isReadChanged":
      case "session/activeClientSet":
      case "session/activeClientRemoved":
        return { echo: true };
      default:
        throw new AhpError(
          JSON_RPC.invalidParams,
          "This host does not implement " + action.type + ".",
        );
    }
  }

  // A refused dispatch leaves an optimistic client believing something that
  // did not happen. Where the protocol has an action that undoes the client's
  // assumption, send it; the host's own reducer treats it as a no-op because
  // the host never applied the original.
  function correct(channel, action, error) {
    try {
      if (action.type === "chat/turnStarted") {
        const envelope = projection.transaction(() =>
          projection.record(
            channel,
            {
              type: "chat/error",
              turnId: action.turnId,
              duration: 0,
              part: {
                kind: "error",
                error: {
                  errorType: "DispatchRefused",
                  message: error.message,
                },
                resumable: false,
              },
            },
            null,
          ),
        );
        broadcast([envelope]);
        return;
      }
      if (action.type === "chat/pendingMessageSet") {
        const envelope = projection.transaction(() =>
          projection.record(
            channel,
            {
              type: "chat/pendingMessageRemoved",
              kind: action.kind,
              id: action.id,
            },
            null,
          ),
        );
        broadcast([envelope]);
        return;
      }
      // For everything else the durable record is already authoritative, and
      // the projection has broadcast, or will broadcast, the real outcome.
      pump();
    } catch {}
  }

  function fromInputAnswers(answers) {
    const result = {};
    for (const [key, answer] of Object.entries(answers || {})) {
      const value = answer?.value;
      if (!value) continue;
      const primitive =
        value.kind === "selected-many"
          ? [...(value.value || []), ...(value.freeformValues || [])]
          : value.kind === "selected"
            ? (value.freeformValues?.[0] ?? value.value)
            : value.value;
      result[key] = primitive;
    }
    return result;
  }

  // ─── Connection handling ───────────────────────────────────────────────────

  wss.on("connection", (ws, req, grant) => {
    const connection = {
      ws,
      grant,
      clientId: null,
      clientInfo: null,
      protocolVersion: null,
      subs: new Set(),
      ready: false,
      lastSentSeq: 0,
      connectedAt: new Date().toISOString(),
    };
    clients.set(ws, connection);
    ws.on("close", () => {
      clients.delete(ws);
      for (const resource of connection.subs)
        if (channelKind(resource) === "session" && connection.clientId)
          try {
            projection.echo(resource, {
              type: "session/activeClientRemoved",
              clientId: connection.clientId,
            });
          } catch {}
    });
    ws.on("message", async (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        send(connection, {
          jsonrpc: "2.0",
          id: null,
          error: { code: JSON_RPC.parseError, message: "Invalid JSON." },
        });
        return;
      }
      try {
        const result = await handle(connection, message);
        if (message.method)
          projection.recordCall({
            clientName: connection.clientInfo?.name || null,
            method: message.method,
            ok: true,
          });
        if (message.id !== undefined && result !== undefined)
          send(connection, { jsonrpc: "2.0", id: message.id, result });
      } catch (error) {
        if (message.method)
          projection.recordCall({
            clientName: connection.clientInfo?.name || null,
            method: message.method,
            ok: false,
            detail: error.message,
          });
        const code = Number.isInteger(error.code)
          ? error.code
          : JSON_RPC.internalError;
        if (message.id !== undefined)
          send(connection, {
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code,
              message: error.message,
              ...(error.data ? { data: error.data } : {}),
            },
          });
      }
    });
  });

  async function handle(connection, message) {
    const params = message.params || {};
    // Fold anything the workspace has recorded since the last poll before
    // answering. A client that connects or acts immediately after a run
    // starts must not be told the session does not exist yet.
    if (
      [
        "initialize",
        "reconnect",
        "subscribe",
        "listSessions",
        "dispatchAction",
        "fetchTurns",
      ].includes(message.method)
    )
      pump();
    switch (message.method) {
      case "initialize": {
        const offered = Array.isArray(params.protocolVersions)
          ? params.protocolVersions
          : [];
        let selected;
        try {
          selected = negotiateProtocolVersion(offered);
        } catch {
          selected = undefined;
        }
        if (!selected)
          throw new AhpError(
            AhpErrorCodes.UnsupportedProtocolVersion,
            "No offered protocol version is supported.",
            { supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS] },
          );
        connection.protocolVersion = selected;
        connection.clientId = params.clientId || randomUUID();
        connection.clientInfo = params.clientInfo || null;
        connection.subs = new Set(params.initialSubscriptions || []);
        connection.ready = true;
        connection.lastSentSeq = projection.seq;
        recordSubscriptions(connection);
        return {
          protocolVersion: selected,
          serverSeq: projection.seq,
          serverInfo: { name: serverName, version: FACADE_VERSION },
          snapshots: snapshotsFor(connection),
          defaultDirectory: defaultDirectory(),
          _meta: {
            "avoozl.workspaceId": projection.workspaceId,
            "avoozl.scope": connection.grant.scope,
            "avoozl.facadeVersion": FACADE_VERSION,
            "vscode.ahpSessionUris": true,
            "vscode.agentHost": true,
          },
        };
      }
      case "reconnect": {
        if (!connection.protocolVersion)
          // A reconnect on a fresh socket has negotiated nothing. Pick the
          // newest version this host speaks rather than guessing the client's.
          connection.protocolVersion = SUPPORTED_PROTOCOL_VERSIONS[0];
        connection.clientId =
          params.clientId || connection.clientId || randomUUID();
        connection.subs = new Set(params.subscriptions || []);
        connection.ready = true;
        recordSubscriptions(connection);
        const from = Number(params.lastSeenServerSeq || 0);
        const oldest = projection.oldestAction();
        // Replay only when the whole gap is still in the buffer. Otherwise a
        // snapshot is the only honest answer; a partial replay would be a
        // silent hole in the client's state.
        if (from >= oldest - 1 && from <= projection.seq) {
          const actions = projection
            .actionsSince(from, connection.subs)
            .filter((entry) => deliverable(connection, entry.action.type))
            .map((entry) => ({
              channel: entry.channel,
              action: entry.action,
              serverSeq: entry.serverSeq,
            }));
          const missing = [...connection.subs].filter(
            (resource) => !projection.snapshot(resource),
          );
          connection.lastSentSeq = projection.seq;
          return { type: "replay", actions, missing };
        }
        connection.lastSentSeq = projection.seq;
        return {
          type: "snapshot",
          serverSeq: projection.seq,
          snapshots: snapshotsFor(connection),
        };
      }
      case "ping":
        return null;
      case "authenticate":
        // The facade authenticates at the transport. It advertises no
        // protected resources, so there is nothing further to push.
        return { authenticated: true };
      case "subscribe": {
        requireReady(connection);
        connection.subs.add(params.channel);
        recordSubscriptions(connection);
        const snapshot = projection.snapshot(params.channel);
        if (!snapshot)
          throw new AhpError(
            AhpErrorCodes.NotFound,
            "No channel named " + params.channel + " exists in this workspace.",
          );
        if (
          channelKind(params.channel) === "session" &&
          connection.grant.scope === "full"
        ) {
          const envelope = projection.echo(params.channel, {
            type: "session/activeClientSet",
            client: {
              clientId: connection.clientId,
              name: connection.clientInfo?.name || "client",
            },
          });
          broadcast([envelope]);
        }
        return { snapshot: projection.snapshot(params.channel) };
      }
      case "unsubscribe":
        connection.subs.delete(params.channel);
        return {};
      case "listSessions":
        requireReady(connection);
        return { items: projection.sessionSummaries() };
      case "fetchTurns": {
        requireReady(connection);
        runIdFor(params.channel);
        const envelope = projection.loadOlderTurns(
          params.channel,
          params.cursor,
        );
        if (envelope) broadcast([envelope]);
        return {};
      }
      case "resolveSessionConfig": {
        requireReady(connection);
        // Sessions are created by the workspace, not by this client, so there
        // is no creation form to resolve.
        return {
          schema: { type: "object", properties: {} },
          values: {},
        };
      }
      case "sessionConfigCompletions":
      case "completions":
        requireReady(connection);
        return { items: [] };
      case "resourceRead":
        requireReady(connection);
        return readResource(params);
      case "resourceList":
        requireReady(connection);
        return listResource(params);
      case "resourceResolve":
        requireReady(connection);
        return resolveResource(params);
      case "dispatchAction": {
        requireReady(connection);
        // Every attempt is recorded, accepted or refused, so the trail shows
        // which client asked for what rather than only what succeeded. It is
        // the authorization audit for a host more than one client can reach,
        // and the only way to show that an action came from a native editor
        // control rather than from a script.
        const audit = (accepted, detail) => {
          try {
            projection.recordDispatch({
              clientId: connection.clientId,
              clientName: connection.clientInfo?.name || null,
              grant: connection.grant.name,
              channel: params.channel,
              action: params.action?.type || null,
              accepted,
              detail,
            });
          } catch {}
        };
        const refuse = (code, message) => {
          audit(false, message);
          throw new AhpError(code, message);
        };
        if (connection.grant.scope !== "full")
          refuse(
            AhpErrorCodes.PermissionDenied,
            "This client is authorized to observe sessions, not to change them.",
          );
        const action = params.action;
        if (!action?.type)
          refuse(JSON_RPC.invalidParams, "An action is required.");
        if (!isClientDispatchable(action))
          refuse(
            JSON_RPC.invalidParams,
            action.type + " is a server action; a client cannot dispatch it.",
          );
        if (!deliverable(connection, action.type))
          refuse(
            JSON_RPC.invalidParams,
            action.type +
              " was introduced after protocol version " +
              connection.protocolVersion +
              ".",
          );
        if (UNSUPPORTED_REASON[action.type])
          refuse(JSON_RPC.invalidParams, UNSUPPORTED_REASON[action.type]);
        if (!DISPATCH.has(action.type))
          refuse(
            JSON_RPC.invalidParams,
            "This host does not implement " + action.type + ".",
          );
        const origin = {
          clientId: connection.clientId,
          ...(params.clientSeq !== undefined
            ? { clientSeq: params.clientSeq }
            : {}),
        };
        let outcome;
        try {
          outcome = await perform(connection, params.channel, action);
        } catch (error) {
          // `dispatchAction` is fire-and-forget, so a client that applied this
          // action optimistically would otherwise keep showing work the host
          // refused. Push a correction before reporting the error.
          correct(params.channel, action, error);
          // Surface the workspace's own refusal, including its status, instead
          // of reporting a generic failure or pretending the action applied.
          audit(false, error.message);
          throw new AhpError(
            Number.isInteger(error.code)
              ? error.code
              : error.status === 409
                ? AhpErrorCodes.Conflict
                : error.status === 404
                  ? AhpErrorCodes.NotFound
                  : JSON_RPC.invalidParams,
            error.message,
          );
        }
        audit(true, null);
        if (outcome.echo) {
          const envelope = projection.echo(params.channel, action, origin);
          broadcast([envelope]);
        }
        // Commands that changed durable state show up through the projection
        // on the next pump, in the order the workspace recorded them.
        pump();
        return {};
      }
      default:
        throw new AhpError(
          JSON_RPC.methodNotFound,
          "This agent host does not implement " + message.method + ".",
        );
    }
  }

  function requireReady(connection) {
    if (!connection.ready)
      throw new AhpError(
        JSON_RPC.invalidRequest,
        "Call initialize before any other method.",
      );
  }

  function snapshotsFor(connection) {
    return [...connection.subs]
      .map((resource) => projection.snapshot(resource))
      .filter(Boolean);
  }

  function recordSubscriptions(connection) {
    // Kept so a client can prove which conversation an editor actually
    // opened, rather than inferring it from a command returning successfully.
    for (const resource of connection.subs)
      subscriptionLog.push({
        at: new Date().toISOString(),
        clientId: connection.clientId,
        clientName: connection.clientInfo?.name || null,
        resource,
      });
    if (subscriptionLog.length > 2000) subscriptionLog.splice(0, 1000);
  }

  function defaultDirectory() {
    const run = store
      .list("runs")
      .find((r) => r.worktree && !r.deletedAt && !r.readOnly);
    const project = store.list("projects")[0];
    const root = run?.worktree || project?.root;
    return root ? pathToFileURL(root).href : undefined;
  }

  // Resource access is confined to the directories the workspace already
  // exposes to its own runs. Anything else is refused rather than read.
  function allowedRoots() {
    const roots = new Set();
    for (const project of store.list("projects")) {
      if (project.root) roots.add(path.resolve(project.root));
      if (project.worktreeRoot) roots.add(path.resolve(project.worktreeRoot));
    }
    for (const run of store.list("runs"))
      if (run.worktree) roots.add(path.resolve(run.worktree));
    return [...roots];
  }
  function resolveWithin(uri) {
    let target;
    try {
      target = fileURLToPath(uri);
    } catch {
      throw new AhpError(JSON_RPC.invalidParams, "A file URI is required.");
    }
    const resolved = path.resolve(target);
    const roots = allowedRoots();
    const inside = roots.some(
      (root) => resolved === root || resolved.startsWith(root + path.sep),
    );
    if (!inside)
      throw new AhpError(
        AhpErrorCodes.PermissionDenied,
        "This path is outside the directories this workspace exposes.",
      );
    return resolved;
  }
  function readResource(params) {
    const file = resolveWithin(params.uri || params.resource);
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      throw new AhpError(AhpErrorCodes.NotFound, "No such file.");
    }
    if (!stat.isFile())
      throw new AhpError(AhpErrorCodes.NotFound, "Not a file.");
    if (stat.size > 2 * 1024 * 1024)
      throw new AhpError(
        JSON_RPC.invalidParams,
        "This file is larger than the 2 MiB read limit.",
      );
    const data = fs.readFileSync(file);
    const text = data.toString("utf8");
    const binary = text.includes("\u0000");
    return {
      uri: pathToFileURL(file).href,
      encoding: binary ? "base64" : "utf-8",
      data: binary ? data.toString("base64") : text,
      mimeType: binary ? "application/octet-stream" : "text/plain",
    };
  }
  function listResource(params) {
    const directory = resolveWithin(params.uri || params.resource);
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      throw new AhpError(AhpErrorCodes.NotFound, "No such directory.");
    }
    return {
      entries: entries.slice(0, 2000).map((entry) => ({
        uri: pathToFileURL(path.join(directory, entry.name)).href,
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
      })),
    };
  }
  function resolveResource(params) {
    const file = resolveWithin(params.uri || params.resource);
    const stat = fs.existsSync(file) ? fs.statSync(file) : null;
    return {
      uri: pathToFileURL(file).href,
      exists: Boolean(stat),
      ...(stat
        ? {
            type: stat.isDirectory() ? "directory" : "file",
            size: stat.size,
            etag: String(stat.mtimeMs) + "-" + String(stat.size),
          }
        : {}),
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  const facade = {
    projection,
    httpServer,
    tokens: [...grants.keys()],
    // The token for a named client, so a caller can authenticate to the
    // facade's own diagnostics without re-reading the manifest.
    tokenFor(name) {
      for (const [token, grant] of grants)
        if (grant.name === name) return token;
      return null;
    },
    grants,
    url: null,
    port: null,
    subscriptionLog,
    clients,
    pump,
    async refreshAgents() {
      if (await projection.refreshAgents())
        notifyRoot("action", {
          channel: ROOT_CHANNEL,
          action: { type: "root/agentsChanged", agents: projection.agents },
          serverSeq: projection.seq,
        });
      return projection.agents;
    },
    // Which clients dispatched which actions, and whether each was accepted.
    dispatches(options) {
      return projection.dispatches(options);
    },
    calls(options) {
      return projection.callLog(options);
    },
    // Evidence helper: which clients subscribed to a channel, and when.
    subscribers(resource, since) {
      return subscriptionLog.filter(
        (entry) =>
          entry.resource === resource &&
          (!since || Date.parse(entry.at) >= Date.parse(since)),
      );
    },
    async close() {
      closing = true;
      clearInterval(timer);
      for (const connection of clients.keys())
        try {
          connection.close(1001, "Agent host facade closing");
        } catch {}
      await new Promise((resolve) => httpServer.close(resolve));
      wss.close();
      projection.close();
      if (manifestPath)
        try {
          fs.rmSync(manifestPath, { force: true });
        } catch {}
    },
  };

  const timer = setInterval(pump, pollIntervalMs);
  timer.unref?.();

  facade.listening = new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, async () => {
      facade.port = httpServer.address().port;
      facade.url = "ws://" + host + ":" + facade.port;
      try {
        await facade.refreshAgents();
      } catch {}
      pump();
      if (manifestPath) {
        fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
        const manifest = {
          facade: FACADE_VERSION,
          pid: process.pid,
          url: facade.url,
          host,
          port: facade.port,
          workspaceId: projection.workspaceId,
          authority: path.resolve(store.filename),
          ...(workspaceEndpoint ? { workspaceEndpoint } : {}),
          protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
          startedAt: new Date().toISOString(),
          clients: Object.fromEntries(
            [...grants.entries()].map(([token, grant]) => [
              grant.name,
              {
                scope: grant.scope,
                address: facade.url,
                connectionToken: token,
              },
            ]),
          ),
        };
        fs.writeFileSync(
          manifestPath + ".pending",
          JSON.stringify(manifest, null, 2),
          {
            mode: 0o600,
          },
        );
        fs.renameSync(manifestPath + ".pending", manifestPath);
      }
      resolve(facade);
    });
  });
  return facade;
}
