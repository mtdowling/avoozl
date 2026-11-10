// The AHP projection: a derived, rebuildable cache of client-facing state.
//
// SQLite in the workspace remains the only authority for execution state. This
// file owns nothing: every row can be reconstructed by replaying the workspace
// event log from sequence zero, and it records the source cursor and schema
// version that make that rebuild decidable. It never writes a run, request,
// delivery, plan, or task.
//
// Each source event is folded in one transaction together with the cursor
// advance, so a crash can leave the projection behind the workspace but never
// inconsistent with it: on restart it simply replays the gap.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  chatReducer,
  sessionReducer,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@microsoft/agent-host-protocol";
import { runUris, ROOT_CHANNEL, channelKind } from "./uris.mjs";
import { applyEvent } from "./events.mjs";
import { emptyCorrelation, runStatus, STATUS } from "./translate.mjs";
import { workspaceIdentity } from "../identity.mjs";
import { fail } from "../store.mjs";
import { pathToFileURL } from "node:url";

// 6: channel identifiers carry the agent provider in their scheme, so a
// projection built before this rebuilds rather than serving URIs the editor
// cannot resolve.
export const PROJECTION_SCHEMA_VERSION = 6;
// The projection always folds at the newest protocol version it knows, so the
// action log is complete. Delivery to a client is filtered by the version that
// client negotiated.
export const PROJECTION_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

// The editor registers one chat-sessions provider per agent a host advertises,
// named `agent-host-<provider>`. Its own built-in host advertises `claude` and
// `copilotcli`, so advertising a bare `claude` collides with it: the editor
// resolves `agent-host-claude:/<id>` against its built-in provider, which has
// no such session, and the chat never loads. Namespacing the advertised ids
// keeps the provider visible while making the registration ours.
export const AGENT_PROVIDER_PREFIX = "avoozl-";
export const agentProviderId = (provider) =>
  AGENT_PROVIDER_PREFIX + (provider || "unknown");
export const runProviderFromAgentId = (id) =>
  String(id || "").startsWith(AGENT_PROVIDER_PREFIX)
    ? String(id).slice(AGENT_PROVIDER_PREFIX.length)
    : id;

export class Projection {
  constructor({
    store,
    file,
    retainTurns = 40,
    retainActions = 20000,
    models = async () => [],
  }) {
    this.store = store;
    this.file = file;
    this.retainTurns = retainTurns;
    this.retainActions = retainActions;
    this.modelCatalog = models;
    this.workspaceId = workspaceIdentity(store);
    this.agents = [];
    this.listeners = new Set();
    if (file !== ":memory:")
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS channels(resource TEXT PRIMARY KEY, kind TEXT NOT NULL, run_id TEXT, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mappings(resource TEXT PRIMARY KEY, run_id TEXT NOT NULL, kind TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS mappings_run ON mappings(run_id, kind);
      CREATE TABLE IF NOT EXISTS actions(seq INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, source_seq INTEGER, at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS actions_channel ON actions(channel, seq);
      CREATE TABLE IF NOT EXISTS correlation(run_id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS archived_turns(channel TEXT NOT NULL, turn_id TEXT NOT NULL, ordinal INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(channel, turn_id));
      CREATE INDEX IF NOT EXISTS archived_turns_channel ON archived_turns(channel, ordinal);
      CREATE TABLE IF NOT EXISTS dispatches(seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, client_id TEXT, client_name TEXT, grant_name TEXT, channel TEXT, action TEXT, accepted INTEGER NOT NULL, detail TEXT);
    `);
    this.verify();
    this.seq = Number(
      this.db.prepare("SELECT COALESCE(MAX(seq),0) seq FROM actions").get().seq,
    );
  }

  // The projection is only valid for one workspace, one source database, and
  // one schema. Anything else is discarded and rebuilt rather than merged.
  verify() {
    const expected = {
      schemaVersion: PROJECTION_SCHEMA_VERSION,
      workspaceId: this.workspaceId,
      sourceAuthority: path.resolve(this.store.filename),
      protocolVersion: PROJECTION_PROTOCOL_VERSION,
    };
    const recorded = this.meta("identity");
    if (
      recorded &&
      recorded.schemaVersion === expected.schemaVersion &&
      recorded.workspaceId === expected.workspaceId &&
      recorded.sourceAuthority === expected.sourceAuthority &&
      recorded.protocolVersion === expected.protocolVersion
    )
      return { rebuilt: false, identity: recorded };
    this.rebuild(expected, recorded);
    return { rebuilt: true, identity: expected, previous: recorded };
  }

  rebuild(identity, previous) {
    this.transaction(() => {
      for (const table of [
        "channels",
        "mappings",
        "actions",
        "correlation",
        "archived_turns",
        "dispatches",
      ])
        this.db.exec("DELETE FROM " + table);
      this.db.exec(
        "DELETE FROM sqlite_sequence WHERE name IN ('actions','dispatches')",
      );
      this.setMeta("identity", identity);
      this.setMeta("sourceCursor", 0);
      this.setMeta("rebuiltAt", new Date().toISOString());
      this.setMeta("rebuiltFrom", previous || null);
    });
    this.seq = 0;
  }

  meta(key) {
    const row = this.db.prepare("SELECT value FROM meta WHERE key=?").get(key);
    return row ? JSON.parse(row.value) : null;
  }
  setMeta(key, value) {
    this.db
      .prepare(
        "INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value ?? null));
  }
  cursor() {
    return Number(this.meta("sourceCursor") || 0);
  }

  // ─── Channel state ─────────────────────────────────────────────────────────

  channelRow(resource) {
    const row = this.db
      .prepare("SELECT * FROM channels WHERE resource=?")
      .get(resource);
    return row ? { ...row, state: JSON.parse(row.body) } : null;
  }
  channelState(resource) {
    return this.channelRow(resource)?.state || null;
  }
  putChannel(resource, kind, runId, state) {
    this.db
      .prepare(
        "INSERT INTO channels VALUES (?,?,?,?) ON CONFLICT(resource) DO UPDATE SET body=excluded.body",
      )
      .run(resource, kind, runId, JSON.stringify(state));
  }
  runFor(resource) {
    if (resource === ROOT_CHANNEL) return null;
    const row = this.db
      .prepare("SELECT run_id FROM mappings WHERE resource=?")
      .get(resource);
    return row ? row.run_id : null;
  }
  resourcesFor(runId) {
    const rows = this.db
      .prepare("SELECT resource, kind FROM mappings WHERE run_id=?")
      .all(runId);
    return Object.fromEntries(rows.map((r) => [r.kind, r.resource]));
  }

  ensureRun(run) {
    // The channel scheme carries the advertised provider: see uris.mjs.
    const uris = runUris(
      this.workspaceId,
      run.id,
      agentProviderId(run.provider),
    );
    for (const [kind, resource] of Object.entries(uris))
      this.db
        .prepare(
          "INSERT INTO mappings VALUES (?,?,?) ON CONFLICT(resource) DO NOTHING",
        )
        .run(resource, run.id, kind);
    if (!this.channelRow(uris.chat))
      this.putChannel(uris.chat, "chat", run.id, {
        resource: uris.chat,
        title: chatTitle(run),
        status: runStatus(run),
        modifiedAt: run.createdAt || new Date().toISOString(),
        turns: [],
        queuedMessages: [],
        interactivity: run.external ? "read-only" : "full",
        _meta: this.chatMeta(run),
      });
    if (!this.channelRow(uris.session))
      this.putChannel(uris.session, "session", run.id, {
        resource: uris.session,
        provider: agentProviderId(run.provider),
        title: chatTitle(run),
        status: runStatus(run),
        createdAt: run.createdAt || new Date().toISOString(),
        modifiedAt: run.updatedAt || run.createdAt || new Date().toISOString(),
        lifecycle: "ready",
        activeClients: [],
        chats: [
          {
            resource: uris.chat,
            title: chatTitle(run),
            status: runStatus(run),
            modifiedAt: run.createdAt || new Date().toISOString(),
          },
        ],
        defaultChat: uris.chat,
        workingDirectories: run.worktree
          ? [pathToFileURL(run.worktree).href]
          : [],
        inputNeeded: [],
        config: this.sessionConfig(run),
        _meta: this.sessionMeta(run),
      });
    return uris;
  }

  chatMeta(run) {
    return {
      "avoozl.runId": run.id,
      "avoozl.taskId": run.taskId,
      "avoozl.workspaceId": this.workspaceId,
      "avoozl.mode": run.mode,
      ...(run.planId ? { "avoozl.planId": run.planId } : {}),
    };
  }
  sessionConfig(run) {
    const models = (
      this.agents.find((a) => a.provider === agentProviderId(run.provider))
        ?.models || []
    ).map((m) => m.id);
    return {
      schema: {
        type: "object",
        properties: {
          model: {
            type: "string",
            title: "Model",
            description:
              "Model changes are host operations applied at a turn boundary.",
            ...(models.length ? { enum: models } : {}),
          },
          approvalMode: {
            type: "string",
            title: "Approvals",
            enum: ["manual", "automatic"],
          },
        },
      },
      values: {
        ...(run.model ? { model: run.model } : {}),
        approvalMode: run.approvalMode || "manual",
      },
    };
  }
  sessionMeta(run) {
    const integration = this.store.get("integration", run.id);
    return {
      "avoozl.runId": run.id,
      "avoozl.taskId": run.taskId,
      "avoozl.workspaceId": this.workspaceId,
      "avoozl.provider": run.provider,
      "avoozl.state": run.state,
      "avoozl.requestedModel": run.requestedModel || null,
      "avoozl.actualModel": run.actualModel || null,
      "avoozl.approvalMode": run.approvalMode || null,
      "avoozl.effectiveApprovalMode": run.effectiveApprovalMode || null,
      ...(run.cancellation ? { "avoozl.cancellation": run.cancellation } : {}),
      ...(run.providerDiagnostic
        ? { "avoozl.providerDiagnostic": run.providerDiagnostic }
        : {}),
      ...(run.error ? { "avoozl.error": run.error } : {}),
      ...(run.branch ? { "avoozl.branch": run.branch } : {}),
      ...(integration
        ? {
            "avoozl.integration": {
              state: integration.state,
              commit: integration.commit,
              integratedCommit: integration.integratedCommit || null,
            },
          }
        : {}),
    };
  }

  // ─── Folding source events ─────────────────────────────────────────────────

  record(channel, action, sourceSeq) {
    const at = new Date().toISOString();
    const result = this.db
      .prepare(
        "INSERT INTO actions(channel,source_seq,at,body) VALUES (?,?,?,?)",
      )
      .run(channel, sourceSeq ?? null, at, JSON.stringify(action));
    const seq = Number(result.lastInsertRowid);
    this.seq = seq;
    return { channel, action, serverSeq: seq, at };
  }

  reduce(channel, action) {
    const row = this.channelRow(channel);
    if (!row) return;
    const next =
      row.kind === "chat"
        ? chatReducer(row.state, action)
        : row.kind === "session"
          ? sessionReducer(row.state, action)
          : row.state;
    this.putChannel(channel, row.kind, row.run_id, next);
  }

  // Older turns are moved out of the live state so a long conversation does
  // not grow a client's snapshot without bound. They stay readable through
  // `fetchTurns`.
  trimTurns(channel) {
    const row = this.channelRow(channel);
    if (row?.kind !== "chat") return;
    const state = row.state;
    if (!state.turns || state.turns.length <= this.retainTurns) return;
    const overflow = state.turns.slice(
      0,
      state.turns.length - this.retainTurns,
    );
    // Archiving is idempotent: a turn that was paged back in and then trimmed
    // again keeps its original ordinal, so history order never changes.
    let next =
      Number(
        this.db
          .prepare(
            "SELECT COALESCE(MAX(ordinal),-1) ordinal FROM archived_turns WHERE channel=?",
          )
          .get(channel).ordinal,
      ) + 1;
    for (const turn of overflow) {
      const existing = this.db
        .prepare(
          "SELECT ordinal FROM archived_turns WHERE channel=? AND turn_id=?",
        )
        .get(channel, turn.id);
      const ordinal = existing ? existing.ordinal : next++;
      this.db
        .prepare(
          "INSERT INTO archived_turns VALUES (?,?,?,?) ON CONFLICT(channel,turn_id) DO UPDATE SET body=excluded.body",
        )
        .run(channel, turn.id, ordinal, JSON.stringify(turn));
    }
    const kept = state.turns.slice(state.turns.length - this.retainTurns);
    const highest = Number(
      this.db
        .prepare(
          "SELECT COALESCE(MAX(ordinal),-1) ordinal FROM archived_turns WHERE channel=?",
        )
        .get(channel).ordinal,
    );
    // The cursor names the highest archived ordinal still unread, so paging is
    // stateless and cannot return the same page twice.
    this.putChannel(channel, row.kind, row.run_id, {
      ...state,
      turns: kept,
      turnsNextCursor: "ordinal:" + highest,
    });
  }

  trimActions() {
    if (this.seq <= this.retainActions) return;
    this.db
      .prepare("DELETE FROM actions WHERE seq <= ?")
      .run(this.seq - this.retainActions);
  }

  // Durable record of which client asked for what, and whether it was
  // accepted. It is the authorization audit trail for a facade that can be
  // reached by more than one client, and it is the only way to show that a
  // native editor control, rather than a script, produced an action.
  recordDispatch(entry) {
    this.db
      .prepare(
        "INSERT INTO dispatches(at,client_id,client_name,grant_name,channel,action,accepted,detail) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        entry.at || new Date().toISOString(),
        entry.clientId || null,
        entry.clientName || null,
        entry.grant || null,
        entry.channel || null,
        entry.action || null,
        entry.accepted ? 1 : 0,
        entry.detail || null,
      );
    const excess = Number(
      this.db.prepare("SELECT COUNT(*) count FROM dispatches").get().count,
    );
    if (excess > 5000)
      this.db.exec(
        "DELETE FROM dispatches WHERE seq <= (SELECT MAX(seq)-5000 FROM dispatches)",
      );
  }
  // Which protocol methods a client actually called, and how each answered.
  // This is the diagnostic that tells an operator whether a client probed a
  // capability at all, rather than leaving it to be guessed from behavior.
  recordCall(entry) {
    this.calls ??= [];
    this.calls.push({
      at: new Date().toISOString(),
      clientName: entry.clientName || null,
      method: entry.method,
      ok: Boolean(entry.ok),
      ...(entry.detail ? { detail: String(entry.detail).slice(0, 200) } : {}),
    });
    if (this.calls.length > 500) this.calls.splice(0, 250);
  }
  callLog({ limit = 120 } = {}) {
    return (this.calls || []).slice(-limit);
  }
  dispatches({ limit = 200, since } = {}) {
    const rows = since
      ? this.db
          .prepare(
            "SELECT * FROM dispatches WHERE at >= ? ORDER BY seq DESC LIMIT ?",
          )
          .all(since, limit)
      : this.db
          .prepare("SELECT * FROM dispatches ORDER BY seq DESC LIMIT ?")
          .all(limit);
    return rows.reverse().map((row) => ({
      seq: row.seq,
      at: row.at,
      clientId: row.client_id,
      clientName: row.client_name,
      grant: row.grant_name,
      channel: row.channel,
      action: row.action,
      accepted: Boolean(row.accepted),
      ...(row.detail ? { detail: row.detail } : {}),
    }));
  }
  correlationFor(runId) {
    const row = this.db
      .prepare("SELECT body FROM correlation WHERE run_id=?")
      .get(runId);
    return row ? JSON.parse(row.body) : emptyCorrelation();
  }
  putCorrelation(runId, value) {
    this.db
      .prepare(
        "INSERT INTO correlation VALUES (?,?) ON CONFLICT(run_id) DO UPDATE SET body=excluded.body",
      )
      .run(runId, JSON.stringify(value));
  }

  // Read new workspace events and fold them in. Returns the broadcastable
  // envelopes in order. Safe to call concurrently with the writer: events
  // already applied are skipped by the cursor.
  catchUp({ limit = 500 } = {}) {
    const produced = [];
    for (;;) {
      const cursor = this.cursor();
      const events = this.store.events({ after: cursor, limit });
      if (!events.length) break;
      for (const event of events) {
        if (event.seq <= this.cursor()) continue;
        produced.push(...this.foldEvent(event));
      }
      if (events.length < limit) break;
    }
    if (produced.length) {
      this.trimActions();
      for (const listener of this.listeners) listener(produced);
    }
    return produced;
  }

  foldEvent(event) {
    const envelopes = [];
    try {
      this.transaction(() => {
        if (event.seq <= this.cursor()) {
          return;
        }
        if (event.runId) {
          const run = this.store.get("runs", event.runId);
          if (run) {
            const uris = this.ensureRun(run);
            const correlation = this.correlationFor(run.id);
            const emit = (channel, action) => {
              envelopes.push(this.record(channel, action, event.seq));
              this.reduce(channel, action);
            };
            applyEvent(event, {
              run,
              uris,
              correlation,
              emit,
              at: event.at,
              protocolVersion: PROJECTION_PROTOCOL_VERSION,
              chatState: () => this.channelState(uris.chat),
              sessionConfig: () => this.sessionConfig(run),
              sessionMeta: () => this.sessionMeta(run),
            });
            this.putCorrelation(run.id, correlation);
            this.syncSummaries(run, uris, envelopes, event.seq);
            this.trimTurns(uris.chat);
          }
        }
        this.setMeta("sourceCursor", event.seq);
      });
    } catch (error) {
      // Record the failure and move past the event rather than wedging the
      // projection: the workspace remains authoritative and a rebuild can
      // always recover a correct projection.
      try {
        this.transaction(() => {
          this.setMeta("sourceCursor", event.seq);
          this.setMeta("lastFoldError", {
            at: new Date().toISOString(),
            sourceSeq: event.seq,
            kind: event.kind,
            message: error.message,
          });
        });
      } catch {}
      return [];
    }
    return envelopes;
  }

  // Keep the denormalized summaries the protocol requires in step with the
  // run record, so a client reading only a session list sees current state.
  syncSummaries(run, uris, envelopes, sourceSeq) {
    const archived = Boolean(this.store.getMeta("runArchive:" + run.id));
    const status = runStatus(run, { archived });
    const chat = this.channelState(uris.chat);
    const session = this.channelState(uris.session);
    const title = chatTitle(run);
    const modifiedAt =
      run.updatedAt || run.lastObservedAt || run.createdAt || chat?.modifiedAt;
    if (chat && (chat.status !== status || chat.title !== title))
      this.putChannel(uris.chat, "chat", run.id, {
        ...chat,
        status,
        title,
        modifiedAt: modifiedAt || chat.modifiedAt,
        _meta: this.chatMeta(run),
      });
    if (session) {
      const summary = {
        resource: uris.chat,
        title,
        status,
        modifiedAt: modifiedAt || session.modifiedAt,
        activity: chat?.activity,
      };
      const current = session.chats?.[0];
      if (
        !current ||
        current.status !== summary.status ||
        current.title !== summary.title ||
        current.activity !== summary.activity
      )
        envelopes.push(
          this.applyNow(
            uris.session,
            {
              type: "session/chatUpdated",
              chat: summary,
            },
            sourceSeq,
          ),
        );
      if (session.status !== status || session.title !== title)
        this.putChannel(uris.session, "session", run.id, {
          ...this.channelState(uris.session),
          status,
          title,
          modifiedAt: modifiedAt || session.modifiedAt,
          _meta: this.sessionMeta(run),
        });
      else
        this.putChannel(uris.session, "session", run.id, {
          ...this.channelState(uris.session),
          _meta: this.sessionMeta(run),
        });
    }
  }

  applyNow(channel, action, sourceSeq) {
    const envelope = this.record(channel, action, sourceSeq);
    this.reduce(channel, action);
    return envelope;
  }

  // A client-dispatched action the host accepted. Echoed to every subscriber
  // so concurrent clients converge on the same state.
  echo(channel, action, origin) {
    return this.transaction(() => {
      const envelope = this.applyNow(channel, action, null);
      this.trimTurns(channel);
      return origin ? { ...envelope, origin } : envelope;
    });
  }

  // Re-entrant: reads such as `snapshot` may run inside a fold transaction.
  transaction(fn) {
    if (this.depth) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    this.depth = 1;
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.depth = 0;
    }
  }

  // ─── Reads ─────────────────────────────────────────────────────────────────

  actionsSince(seq, channels) {
    const rows = this.db
      .prepare("SELECT * FROM actions WHERE seq > ? ORDER BY seq LIMIT 5000")
      .all(seq);
    return rows
      .filter((row) => !channels || channels.has(row.channel))
      .map((row) => ({
        channel: row.channel,
        action: JSON.parse(row.body),
        serverSeq: row.seq,
      }));
  }
  // The oldest sequence still replayable. A client that asks for less than
  // this must be given a snapshot instead of a silent gap.
  oldestAction() {
    const row = this.db
      .prepare("SELECT COALESCE(MIN(seq),0) seq FROM actions")
      .get();
    return Number(row.seq);
  }

  loadOlderTurns(channel, cursor) {
    const row = this.channelRow(channel);
    if (row?.kind !== "chat") fail("Not a chat channel.", 404);
    const state = row.state;
    if (!state.turnsNextCursor) return null;
    // An unrecognized cursor is rejected rather than silently reinterpreted,
    // so a client never receives a page it did not ask for.
    if (cursor && cursor !== state.turnsNextCursor)
      fail("Unrecognized history cursor.", 400);
    const ceiling = Number(state.turnsNextCursor.replace("ordinal:", ""));
    if (!Number.isFinite(ceiling)) fail("Unrecognized history cursor.", 400);
    const page = this.db
      .prepare(
        "SELECT * FROM archived_turns WHERE channel=? AND ordinal <= ? ORDER BY ordinal DESC LIMIT ?",
      )
      .all(channel, ceiling, this.retainTurns)
      .reverse();
    if (!page.length) return null;
    const remaining = this.db
      .prepare(
        "SELECT COUNT(*) count FROM archived_turns WHERE channel=? AND ordinal < ?",
      )
      .get(channel, page[0].ordinal).count;
    const turns = page.map((r) => JSON.parse(r.body));
    const nextCursor = remaining ? "ordinal:" + (page[0].ordinal - 1) : null;
    return this.transaction(() => {
      const envelope = this.applyNow(
        channel,
        {
          type: "chat/turnsLoaded",
          turns,
          ...(nextCursor ? { turnsNextCursor: nextCursor } : {}),
        },
        null,
      );
      const current = this.channelState(channel);
      if (!nextCursor) {
        const { turnsNextCursor, ...rest } = current;
        this.putChannel(channel, "chat", row.run_id, rest);
      }
      // Loaded history must not be trimmed straight back out.
      return envelope;
    });
  }

  async refreshAgents() {
    const agents = await this.modelCatalog();
    const changed = JSON.stringify(agents) !== JSON.stringify(this.agents);
    this.agents = agents;
    return changed;
  }

  // Host-side configuration the editor stores through `root/configChanged`.
  // It is the client's own preference state, so it is kept rather than
  // refused, and it lives in the projection because it is derived client
  // state, not workspace state.
  rootConfigValues() {
    return this.meta("rootConfig") || {};
  }
  setRootConfigValues(values, replace) {
    const next = replace
      ? { ...values }
      : { ...this.rootConfigValues(), ...values };
    this.transaction(() => this.setMeta("rootConfig", next));
    return next;
  }
  rootState() {
    const runs = this.store.list("runs").filter((r) => !r.deletedAt);
    return {
      agents: this.agents,
      activeSessions: runs.length,
      config: {
        schema: { type: "object", properties: {} },
        values: this.rootConfigValues(),
      },
      _meta: {
        "avoozl.workspaceId": this.workspaceId,
        "avoozl.authority": path.resolve(this.store.filename),
        "avoozl.projectionSchema": PROJECTION_SCHEMA_VERSION,
        "avoozl.sourceCursor": this.cursor(),
        "vscode.remoteSessions": true,
      },
    };
  }

  sessionSummaries({ limit = 200 } = {}) {
    const runs = this.store
      .list("runs")
      .filter((r) => !r.deletedAt)
      .sort((a, b) =>
        String(b.updatedAt || b.createdAt || "").localeCompare(
          String(a.updatedAt || a.createdAt || ""),
        ),
      )
      .slice(0, limit);
    return runs.map((run) => {
      const uris = this.transaction(() => this.ensureRun(run));
      const archived = Boolean(this.store.getMeta("runArchive:" + run.id));
      const chat = this.channelState(uris.chat);
      return {
        resource: uris.session,
        provider: agentProviderId(run.provider),
        title: chatTitle(run),
        status: runStatus(run, { archived }),
        createdAt: run.createdAt || new Date(0).toISOString(),
        modifiedAt:
          run.updatedAt ||
          run.lastObservedAt ||
          run.createdAt ||
          new Date(0).toISOString(),
        workingDirectories: run.worktree
          ? [pathToFileURL(run.worktree).href]
          : [],
        chats: [
          {
            resource: uris.chat,
            title: chatTitle(run),
            status: runStatus(run, { archived }),
            modifiedAt: chat?.modifiedAt || run.createdAt,
          },
        ],
        defaultChat: uris.chat,
        _meta: this.sessionMeta(run),
      };
    });
  }

  snapshot(resource) {
    if (resource === ROOT_CHANNEL)
      return { resource, state: this.rootState(), fromSeq: this.seq };
    const kind = channelKind(resource);
    if (kind === "session" || kind === "chat") {
      const runId = this.runFor(resource);
      if (!runId) return null;
      const run = this.store.get("runs", runId);
      if (!run || run.deletedAt) return null;
      this.transaction(() => this.ensureRun(run));
      const state = this.channelState(resource);
      return state ? { resource, state, fromSeq: this.seq } : null;
    }
    return null;
  }

  close() {
    this.db.close();
  }
}

export function chatTitle(run) {
  return (
    run.title ||
    (run.prompt ? run.prompt.split("\n")[0].slice(0, 160) : "") ||
    run.id
  );
}
