import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { digest, validate } from "../model.mjs";

export const canonical = (value) => JSON.stringify(normalize(value));
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, normalize(value[k])]),
    );
  return value;
}
export function fail(message, status = 400) {
  const error = Error(message);
  error.status = status;
  throw error;
}
const stamp = () => new Date().toISOString();
function writable(filename) {
  try {
    fs.accessSync(filename, fs.constants.W_OK);
    return true;
  } catch (error) {
    return error.code === "ENOENT";
  }
}
export class Store {
  constructor(filename) {
    if (filename !== ":memory:")
      fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    this.filename = filename;
    // A database file the user made read-only is opened read-only, without
    // the schema statements, so reading it never writes. Writes then fail.
    this.readOnly = filename !== ":memory:" && !writable(filename);
    this.db = new DatabaseSync(filename, { readOnly: this.readOnly });
    if (this.readOnly) return;
    // An existing database gaining the activity log takes its current state
    // as the tick's first snapshot, so old changes are not logged as new.
    const activityLog = this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE name='activity_log'")
      .get();
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,ordinal INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));
   CREATE TABLE IF NOT EXISTS baseline(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));
   CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,plan_id TEXT NOT NULL,hash TEXT NOT NULL,body TEXT NOT NULL,UNIQUE(plan_id,hash));
   CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,state TEXT NOT NULL,body TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS runs_task ON runs(task_id,state);
   CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT,kind TEXT NOT NULL,at TEXT NOT NULL,body TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS events_run ON events(run_id,seq);
   CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS deliveries(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,path TEXT NOT NULL,text TEXT NOT NULL,expected_hash TEXT,state TEXT NOT NULL DEFAULT 'pending');
   CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS integration(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,state TEXT NOT NULL,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS work_locks(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,kind TEXT NOT NULL,pid INTEGER NOT NULL,token TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS usage_counters(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS usage_samples(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,task_id TEXT NOT NULL,at TEXT NOT NULL,body TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS usage_samples_task ON usage_samples(task_id,at);
   CREATE TABLE IF NOT EXISTS run_capabilities(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,token_hash BLOB NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT,body TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS run_capabilities_run ON run_capabilities(run_id,revoked_at);
   CREATE TABLE IF NOT EXISTS provider_events(run_id TEXT NOT NULL,provider_event_id TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(run_id,provider_event_id));
   CREATE TABLE IF NOT EXISTS surface_capabilities(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,conversation_id TEXT NOT NULL,token_hash BLOB NOT NULL,expires_at TEXT NOT NULL,body TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS surface_capabilities_run ON surface_capabilities(run_id,expires_at);
   CREATE TABLE IF NOT EXISTS github_repositories(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS github_issues(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS github_queue_repositories(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS github_queue_items(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS github_queue_associations(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS github_intake_capabilities(id TEXT PRIMARY KEY,repository TEXT NOT NULL,token_hash BLOB NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT,body TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS github_intake_capabilities_repository ON github_intake_capabilities(repository,revoked_at,expires_at);
   CREATE TABLE IF NOT EXISTS github_intake_generations(id TEXT PRIMARY KEY,capability_id TEXT NOT NULL,repository TEXT NOT NULL,state TEXT NOT NULL,started_at TEXT NOT NULL,body TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS github_intake_generations_repository ON github_intake_generations(repository,started_at);
   CREATE TABLE IF NOT EXISTS github_intake_deliveries(id TEXT PRIMARY KEY,capability_id TEXT NOT NULL,repository TEXT NOT NULL,state TEXT NOT NULL,received_at TEXT NOT NULL,body TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS github_intake_deliveries_repository ON github_intake_deliveries(repository,received_at);
   CREATE TABLE IF NOT EXISTS review_threads(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS review_rounds(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS execution_targets(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS execution_jobs(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS team_checkpoints(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS review_requests(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS safety_incidents(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS safety_permits(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS safety_submissions(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS extractions(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS plan_facts(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS session_bindings(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS session_requests(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS github_responses(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS task_worktrees(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS task_deliveries(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS github_linked_branches(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS app_notifications(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS route_submissions(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS plugin_health(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS content_decisions(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS content_allowances(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS content_reports(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS flow_spans(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,attempt INTEGER,batch_id TEXT,role TEXT,stage TEXT NOT NULL,started_at TEXT NOT NULL,ended_at TEXT,source TEXT NOT NULL,detail TEXT);
   CREATE INDEX IF NOT EXISTS flow_spans_task ON flow_spans(task_id,attempt);
   CREATE TABLE IF NOT EXISTS flow_records(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS flow_stops(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS flow_retros(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS flow_batches(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS pr_feedback(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS incoming_items(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS intake_sources(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS placement_decisions(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS provider_health(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS provider_switches(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS drivers(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS flow_usage(id TEXT PRIMARY KEY,slot TEXT NOT NULL,task_id TEXT NOT NULL,attempt INTEGER,role TEXT,ts TEXT NOT NULL,model TEXT,input REAL,output REAL,credits REAL);
   CREATE TABLE IF NOT EXISTS price_versions(version INTEGER PRIMARY KEY,sha256 TEXT NOT NULL,saved_at TEXT NOT NULL,table_json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS budget_raises(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,by TEXT NOT NULL,at TEXT NOT NULL,from_json TEXT,to_json TEXT NOT NULL,price_version INTEGER);
   CREATE INDEX IF NOT EXISTS budget_raises_task ON budget_raises(task_id,at);
   CREATE TABLE IF NOT EXISTS budget_holds(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS activity_log(seq INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,source TEXT NOT NULL,actor TEXT,kind TEXT NOT NULL,summary TEXT NOT NULL,target_id TEXT,link TEXT,redacted INTEGER NOT NULL DEFAULT 0,key TEXT UNIQUE);
   CREATE INDEX IF NOT EXISTS activity_log_at ON activity_log(at);
  `);
    if (!activityLog && this.initialized())
      this.setMeta("activity.upgrade", true);
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      this.cache = null;
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.cache = null;
      throw error;
    }
  }
  getMeta(key) {
    const row = this.db.prepare("SELECT value FROM meta WHERE key=?").get(key);
    return row ? JSON.parse(row.value) : null;
  }
  setMeta(key, value) {
    this.db
      .prepare(
        "INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  initialized() {
    return Boolean(this.getMeta("snapshot"));
  }
  read() {
    const metadata = this.getMeta("snapshot");
    if (!metadata) fail("Import a JSON snapshot first.", 503);
    if (this.cache?.revision === metadata.revision) return this.cache;
    const data = { ...metadata, tasks: [], documents: {}, edges: [] },
      stored = new Map();
    for (const row of this.db
      .prepare("SELECT * FROM entities ORDER BY kind,ordinal")
      .all()) {
      const value = JSON.parse(row.body);
      stored.set(row.kind + "\0" + row.id, row.ordinal + "\0" + row.body);
      if (row.kind === "task") data.tasks.push(value);
      else if (row.kind === "document") data.documents[row.id] = value;
      else if (row.kind === "edge") data.edges.push(value);
    }
    this.cache = data;
    // Each row as it is on disk at this revision, so write() skips rows
    // that did not change instead of running one statement per entity.
    this.stored = { revision: metadata.revision, rows: stored };
    return data;
  }
  write(data) {
    const errors = validate(data);
    if (errors.length) fail(errors.join("\n"), 422);
    const { tasks, documents, edges, ...metadata } = data,
      known =
        this.stored &&
        this.stored.revision === this.getMeta("snapshot")?.revision
          ? this.stored.rows
          : null;
    this.setMeta("snapshot", metadata);
    this.stored = null;
    const seen = new Set(),
      upsert = this.db.prepare(
        "INSERT INTO entities VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET ordinal=excluded.ordinal,body=excluded.body WHERE body<>excluded.body OR ordinal<>excluded.ordinal",
      );
    for (const [kind, rows] of [
      ["task", tasks.map((t) => [t.id, t])],
      ["document", Object.entries(documents)],
      ["edge", edges.map((e, i) => [e.id || "edge-" + i, e])],
    ])
      rows.forEach(([id, value], i) => {
        const key = kind + "\0" + id,
          body = JSON.stringify(value);
        seen.add(key);
        if (known?.get(key) !== i + "\0" + body) upsert.run(kind, id, i, body);
      });
    for (const row of this.db.prepare("SELECT kind,id FROM entities").all())
      if (!seen.has(row.kind + "\0" + row.id))
        this.db
          .prepare("DELETE FROM entities WHERE kind=? AND id=?")
          .run(row.kind, row.id);
    this.cache = null;
  }
  commit(data, summary, expectedRevision) {
    if (this.read().revision !== (expectedRevision ?? data.revision))
      fail("Database changed. Reload and review before saving.", 409);
    data.revision = this.read().revision + 1;
    data.updatedAt = stamp();
    data.changelog = [
      { at: data.updatedAt, kind: "workspace", summary },
      ...(data.changelog || []),
    ].slice(0, 100);
    this.write(data);
    return data.revision;
  }
  mutate(summary, fn, expectedRevision) {
    return this.transaction(() => {
      const next = structuredClone(this.read());
      if (expectedRevision !== undefined && next.revision !== expectedRevision)
        fail("Database changed. Reload and review before saving.", 409);
      const result = fn(next);
      this.commit(next, summary);
      return result;
    });
  }
  importSnapshot(data, { final = false, dryRun = false } = {}) {
    const errors = validate(data);
    if (errors.length) fail(errors.join("\n"), 422);
    const sourceHash = digest(canonical(data)),
      old = this.initialized() ? this.read() : null;
    let merged = structuredClone(data);
    const conflicts = [];
    if (old) {
      const baseline = new Map(
        this.db
          .prepare("SELECT * FROM baseline")
          .all()
          .map((r) => [r.kind + "\0" + r.id, JSON.parse(r.body)]),
      );
      for (const [kind, list] of [
        ["task", "tasks"],
        ["edge", "edges"],
        ["document", "documents"],
      ]) {
        const entries = (value) =>
          list === "documents"
            ? Object.entries(value[list])
            : value[list].map((v, i) => [v.id || "edge-" + i, v]);
        const current = new Map(entries(old)),
          incoming = new Map(entries(merged));
        for (const [id, value] of current) {
          const base = baseline.get(kind + "\0" + id),
            next = incoming.get(id);
          if (base === undefined) {
            if (next && canonical(next) !== canonical(value))
              conflicts.push(kind + ":" + id);
            else incoming.set(id, value);
          } else if (canonical(value) !== canonical(base)) {
            if (
              next &&
              canonical(next) !== canonical(base) &&
              canonical(next) !== canonical(value)
            )
              conflicts.push(kind + ":" + id);
            else if (!next)
              conflicts.push(kind + ":" + id + " removed upstream");
            else incoming.set(id, value);
          }
        }
        merged[list] =
          list === "documents"
            ? Object.fromEntries(incoming)
            : [...incoming.values()];
      }
      const baseMetadata = this.getMeta("baselineMetadata") || {};
      for (const key of new Set([
        ...Object.keys(baseMetadata),
        ...Object.keys(old),
      ])) {
        if (
          [
            "tasks",
            "edges",
            "documents",
            "revision",
            "updatedAt",
            "changelog",
          ].includes(key)
        )
          continue;
        if (canonical(old[key]) !== canonical(baseMetadata[key])) {
          if (
            canonical(data[key]) !== canonical(baseMetadata[key]) &&
            canonical(data[key]) !== canonical(old[key])
          )
            conflicts.push("metadata:" + key);
          else merged[key] = old[key];
        }
      }
      merged.revision = Math.max(old.revision, data.revision) + 1;
    }
    const report = {
      sourceHash,
      sourceRevision: data.revision,
      tasks: data.tasks.length,
      documents: Object.keys(data.documents).length,
      edges: data.edges.length,
      conflicts,
      final,
    };
    if (dryRun) return report;
    if (conflicts.length)
      fail(
        "Import conflicts require reconciliation: " + conflicts.join(", "),
        409,
      );
    return this.transaction(() => {
      this.write(merged);
      this.db.exec("DELETE FROM baseline");
      const put = this.db.prepare("INSERT INTO baseline VALUES (?,?,?)");
      for (const [kind, rows] of [
        ["task", data.tasks.map((v) => [v.id, v])],
        ["document", Object.entries(data.documents)],
        ["edge", data.edges.map((v, i) => [v.id || "edge-" + i, v])],
      ])
        for (const [id, v] of rows) put.run(kind, id, JSON.stringify(v));
      const { tasks, documents, edges, ...metadata } = data;
      this.setMeta("baselineMetadata", metadata);
      this.setMeta("import", { ...report, at: stamp() });
      if (final) this.setMeta("mode", "final-import");
      else if (!this.getMeta("mode")) this.setMeta("mode", "shadow");
      this.event(null, "import.completed", report);
      return report;
    });
  }
  event(runId, kind, body) {
    const at = stamp();
    const result = this.db
      .prepare("INSERT INTO events(run_id,kind,at,body) VALUES (?,?,?,?)")
      .run(runId, kind, at, JSON.stringify(body));
    return { seq: Number(result.lastInsertRowid), runId, kind, at, ...body };
  }
  events({ after = 0, before, runId, limit = 500, latest = false } = {}) {
    const backward = latest || before !== undefined,
      where = ["seq>?"],
      args = [Number(after) || 0];
    if (runId) {
      where.push("run_id=?");
      args.push(runId);
    }
    if (before !== undefined) {
      where.push("seq<?");
      args.push(Number(before));
    }
    args.push(Math.max(1, Math.min(Number(limit) || 500, 1000)));
    const rows = this.db
      .prepare(
        "SELECT * FROM events WHERE " +
          where.join(" AND ") +
          " ORDER BY seq " +
          (backward ? "DESC" : "ASC") +
          " LIMIT ?",
      )
      .all(...args);
    if (backward) rows.reverse();
    return rows.map((r) => ({
      seq: r.seq,
      runId: r.run_id,
      kind: r.kind,
      at: r.at,
      ...JSON.parse(r.body),
    }));
  }
  get(table, id) {
    if (
      ![
        "plans",
        "approvals",
        "runs",
        "requests",
        "deliveries",
        "evidence",
        "integration",
        "projects",
        "receipts",
        "batches",
        "github_repositories",
        "github_issues",
        "github_queue_repositories",
        "github_queue_items",
        "github_queue_associations",
        "review_threads",
        "review_rounds",
        "execution_targets",
        "execution_jobs",
        "team_checkpoints",
        "review_requests",
        "safety_incidents",
        "safety_permits",
        "safety_submissions",
        "extractions",
        "plan_facts",
        "session_bindings",
        "session_requests",
        "github_responses",
        "task_worktrees",
        "task_deliveries",
        "github_linked_branches",
        "app_notifications",
        "route_submissions",
        "plugin_health",
        "content_decisions",
        "content_allowances",
        "content_reports",
        "flow_records",
        "flow_stops",
        "flow_retros",
        "flow_batches",
        "pr_feedback",
        "incoming_items",
        "intake_sources",
        "placement_decisions",
        "budget_holds",
        "provider_health",
        "provider_switches",
        "drivers",
      ].includes(table)
    )
      fail("Unknown record type");
    // A missing or non-text ID names no record; SQLite would throw on it.
    if (typeof id !== "string" && typeof id !== "number") return null;
    const row = this.db.prepare(`SELECT body FROM ${table} WHERE id=?`).get(id);
    return row ? JSON.parse(row.body) : null;
  }
  list(table) {
    if (
      ![
        "plans",
        "approvals",
        "runs",
        "requests",
        "deliveries",
        "evidence",
        "integration",
        "projects",
        "receipts",
        "batches",
        "github_repositories",
        "github_issues",
        "github_queue_repositories",
        "github_queue_items",
        "github_queue_associations",
        "review_threads",
        "review_rounds",
        "execution_targets",
        "execution_jobs",
        "team_checkpoints",
        "review_requests",
        "safety_incidents",
        "safety_permits",
        "safety_submissions",
        "extractions",
        "plan_facts",
        "session_bindings",
        "session_requests",
        "github_responses",
        "task_worktrees",
        "task_deliveries",
        "github_linked_branches",
        "app_notifications",
        "route_submissions",
        "plugin_health",
        "content_decisions",
        "content_allowances",
        "content_reports",
        "flow_records",
        "flow_stops",
        "flow_retros",
        "flow_batches",
        "pr_feedback",
        "incoming_items",
        "intake_sources",
        "placement_decisions",
        "budget_holds",
        "provider_health",
        "provider_switches",
        "drivers",
      ].includes(table)
    )
      fail("Unknown record type");
    return this.db
      .prepare(`SELECT body FROM ${table} ORDER BY rowid DESC`)
      .all()
      .map((r) => JSON.parse(r.body));
  }
  put(table, item) {
    const body = JSON.stringify(item);
    if (
      [
        "plans",
        "requests",
        "projects",
        "receipts",
        "batches",
        "github_repositories",
        "github_issues",
        "github_queue_repositories",
        "github_queue_items",
        "github_queue_associations",
        "review_threads",
        "review_rounds",
        "execution_targets",
        "execution_jobs",
        "team_checkpoints",
        "review_requests",
        "safety_incidents",
        "safety_permits",
        "safety_submissions",
        "extractions",
        "plan_facts",
        "session_bindings",
        "session_requests",
        "github_responses",
        "task_worktrees",
        "task_deliveries",
        "github_linked_branches",
        "app_notifications",
        "route_submissions",
        "plugin_health",
        "content_decisions",
        "content_allowances",
        "content_reports",
        "flow_records",
        "flow_stops",
        "flow_retros",
        "flow_batches",
        "pr_feedback",
        "incoming_items",
        "intake_sources",
        "placement_decisions",
        "budget_holds",
        "provider_health",
        "provider_switches",
        "drivers",
      ].includes(table)
    )
      this.db
        .prepare(
          `INSERT INTO ${table} VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body`,
        )
        .run(item.id, body);
    else if (table === "runs" || table === "integration")
      this.db
        .prepare(
          `INSERT INTO ${table} VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,body=excluded.body`,
        )
        .run(item.id, item.taskId, item.state, body);
    else if (table === "approvals")
      this.db
        .prepare("INSERT INTO approvals VALUES (?,?,?,?)")
        .run(item.id, item.planId, item.hash, body);
    else if (table === "deliveries")
      this.db
        .prepare(
          "INSERT INTO deliveries VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        )
        .run(item.id, item.runId, body);
    else if (table === "evidence")
      this.db
        .prepare("INSERT INTO evidence VALUES (?,?,?)")
        .run(item.id, item.taskId, body);
    else fail("Unknown record type");
    return item;
  }
  remove(table, id) {
    if (
      ![
        "plans",
        "projects",
        "receipts",
        "batches",
        "github_repositories",
        "github_issues",
        "github_queue_repositories",
        "github_queue_items",
        "github_queue_associations",
        "review_threads",
        "review_rounds",
        "execution_targets",
        "execution_jobs",
        "team_checkpoints",
        "review_requests",
        "safety_incidents",
        "safety_permits",
        "safety_submissions",
        "extractions",
        "plan_facts",
        "session_bindings",
        "session_requests",
        "task_worktrees",
        "task_deliveries",
        "github_linked_branches",
        "app_notifications",
        "route_submissions",
        "plugin_health",
        "content_decisions",
        "content_allowances",
        "content_reports",
        "flow_records",
        "flow_stops",
        "flow_retros",
        "flow_batches",
        "pr_feedback",
        "incoming_items",
        "intake_sources",
        "placement_decisions",
        "budget_holds",
        "provider_health",
        "provider_switches",
        "drivers",
      ].includes(table)
    )
      fail("Unknown record type");
    return (
      this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id).changes > 0
    );
  }
  // An in-memory copy for a dry run: writes to it never reach this database.
  scratch() {
    const copy = new Store(":memory:"),
      tables = this.db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .all(),
      present = new Set(
        copy.db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
          .map((row) => row.name),
      );
    copy.db.exec("PRAGMA foreign_keys=OFF");
    for (const { name, sql } of tables) {
      if (!present.has(name)) copy.db.exec(sql);
      const rows = this.db.prepare(`SELECT * FROM "${name}"`).all();
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]),
        insert = copy.db.prepare(
          `INSERT OR REPLACE INTO "${name}" (${columns.map((c) => `"${c}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
        );
      for (const row of rows) insert.run(...columns.map((c) => row[c]));
    }
    copy.db.exec("PRAGMA foreign_keys=ON");
    return copy;
  }
  close() {
    this.db.close();
  }
}
