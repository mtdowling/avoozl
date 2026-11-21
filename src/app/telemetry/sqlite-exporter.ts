// The SQLite exporter: the built-in exporter that writes Avoozl's own database
// (spec otel-export, OT2). It owns the two tables, their writes, their reads
// and their pruning. Only `record.ts` calls the writes.
import type { DatabaseSync } from "node:sqlite";
import type { Store } from "../store/store.ts";

// A row as the exporter writes it: column name to value.
export type Row = Record<string, unknown>;
// A stored span row, as stageSpans reads it.
export type SpanRow = {
  span_id: string;
  key: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  task_id: string;
  stage: string;
  attempt: number | null;
  started_at: string;
  ended_at: string | null;
  [key: string]: unknown;
};
export type Limits = typeof LIMITS;
type Count = { n: number };

export const TELEMETRY_SCHEMA = `
CREATE TABLE IF NOT EXISTS telemetry_spans(
  span_id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  trace_id TEXT NOT NULL,
  parent_span_id TEXT,
  name TEXT NOT NULL,
  task_id TEXT NOT NULL,
  repo TEXT,
  spec TEXT,
  stage TEXT,
  role TEXT,
  attempt INTEGER,
  harness TEXT,
  source TEXT,
  detail TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  outcome TEXT,
  first_pass INTEGER,
  attempts INTEGER
);
CREATE INDEX IF NOT EXISTS telemetry_spans_task
  ON telemetry_spans(task_id, attempt, started_at);
CREATE INDEX IF NOT EXISTS telemetry_spans_trace
  ON telemetry_spans(trace_id);
CREATE INDEX IF NOT EXISTS telemetry_spans_stage
  ON telemetry_spans(stage, started_at);
CREATE TABLE IF NOT EXISTS telemetry_points(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  unit TEXT,
  at TEXT NOT NULL,
  value REAL NOT NULL,
  task_id TEXT,
  trace_id TEXT,
  repo TEXT,
  spec TEXT,
  stage TEXT,
  role TEXT,
  harness TEXT,
  model TEXT,
  attrs TEXT
);
CREATE INDEX IF NOT EXISTS telemetry_points_name
  ON telemetry_points(name, at);
CREATE INDEX IF NOT EXISTS telemetry_points_task
  ON telemetry_points(task_id, name);
`;

const SPAN_COLUMNS = [
  "span_id",
  "key",
  "trace_id",
  "parent_span_id",
  "name",
  "task_id",
  "repo",
  "spec",
  "stage",
  "role",
  "attempt",
  "harness",
  "source",
  "detail",
  "started_at",
  "ended_at",
  "outcome",
  "first_pass",
  "attempts",
];
const POINT_COLUMNS = [
  "id",
  "name",
  "kind",
  "unit",
  "at",
  "value",
  "task_id",
  "trace_id",
  "repo",
  "spec",
  "stage",
  "role",
  "harness",
  "model",
  "attrs",
];

// Fixed values, with no setting (OT2.7). A table over its cap is pruned down
// to 90 percent of it.
export const LIMITS = Object.freeze({
  days: 90,
  openDays: 7,
  spanCap: 200_000,
  pointCap: 1_000_000,
  everyWrites: 500,
  everyMs: 10 * 60 * 1000,
});

const DAY = 24 * 60 * 60 * 1000;

const placeholders = (columns: string[]) => columns.map(() => "?").join(",");
const values = (columns: string[], row: Row) =>
  columns.map((name) => (row[name] ?? null) as string | number | null);
const same = (columns: string[], a: Row, b: Row) =>
  columns.every((name) => (a[name] ?? null) === (b[name] ?? null));

// Delete finished traces (a trace with a root row) whose newest time is older
// than `cutoff`, then the oldest finished traces until the table is at 90
// percent of its cap. A trace with an open span and a time after `openCutoff`
// stays. Returns the number of rows deleted.
function pruneSpans(db: DatabaseSync, limits: Limits, now: number) {
  const cutoff = new Date(now - limits.days * DAY).toISOString();
  const openCutoff = new Date(now - limits.openDays * DAY).toISOString();
  const remove = db.prepare("DELETE FROM telemetry_spans WHERE trace_id=?");
  let removed = db
    .prepare(
      `DELETE FROM telemetry_spans WHERE trace_id IN (
         SELECT trace_id FROM telemetry_spans GROUP BY trace_id
         HAVING SUM(parent_span_id IS NULL) > 0
            AND MAX(COALESCE(ended_at, started_at)) < ?)`,
    )
    .run(cutoff).changes as number;
  let total = (
    db.prepare("SELECT COUNT(*) AS n FROM telemetry_spans").get() as Count
  ).n;
  if (total <= limits.spanCap) return removed;
  const target = Math.floor(limits.spanCap * 0.9);
  const traces = db
    .prepare(
      `SELECT trace_id, COUNT(*) AS n,
              MAX(COALESCE(ended_at, started_at)) AS newest,
              SUM(ended_at IS NULL AND parent_span_id IS NOT NULL) AS open
       FROM telemetry_spans GROUP BY trace_id
       HAVING SUM(parent_span_id IS NULL) > 0
       ORDER BY newest`,
    )
    .all() as {
    trace_id: string;
    n: number;
    newest: string;
    open: number;
  }[];
  for (const trace of traces) {
    if (total <= target) break;
    if (trace.open > 0 && trace.newest > openCutoff) continue;
    remove.run(trace.trace_id);
    total -= trace.n;
    removed += trace.n;
  }
  return removed;
}

function prunePoints(db: DatabaseSync, limits: Limits, now: number) {
  const cutoff = new Date(now - limits.days * DAY).toISOString();
  let removed = db
    .prepare("DELETE FROM telemetry_points WHERE at < ?")
    .run(cutoff).changes as number;
  const total = (
    db.prepare("SELECT COUNT(*) AS n FROM telemetry_points").get() as Count
  ).n;
  if (total > limits.pointCap)
    removed += db
      .prepare(
        `DELETE FROM telemetry_points WHERE id IN (
           SELECT id FROM telemetry_points ORDER BY at LIMIT ?)`,
      )
      .run(total - Math.floor(limits.pointCap * 0.9)).changes as number;
  return removed;
}

// Whether a table has a row to prune, read without taking the write lock.
function due(db: DatabaseSync, limits: Limits, now: number) {
  const cutoff = new Date(now - limits.days * DAY).toISOString();
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as Count).n;
  return (
    count("telemetry_spans") > limits.spanCap ||
    count("telemetry_points") > limits.pointCap ||
    Boolean(
      db
        .prepare("SELECT 1 FROM telemetry_points WHERE at < ? LIMIT 1")
        .get(cutoff),
    ) ||
    Boolean(
      db
        .prepare(
          "SELECT 1 FROM telemetry_spans WHERE COALESCE(ended_at, started_at) < ? LIMIT 1",
        )
        .get(cutoff),
    )
  );
}

// Prune when the database opens: a database with nothing old is not written,
// so opening beside another connection's writer still reads. A busy database
// waits for the next write's pruning.
type PruneOptions = { limits?: Limits; now?: number };

export function pruneOnOpen(db: DatabaseSync, options: PruneOptions = {}) {
  const { limits = LIMITS, now = Date.now() } = options;
  try {
    if (due(db, limits, now)) pruneTelemetry(db, { limits, now });
  } catch {}
}

// Prune both tables as one transaction of their own. Returns the rows deleted.
export function pruneTelemetry(
  db: DatabaseSync,
  { limits = LIMITS, now = Date.now() }: PruneOptions = {},
) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const removed = pruneSpans(db, limits, now) + prunePoints(db, limits, now);
    db.exec("COMMIT");
    return removed;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// The stage spans Flow reads, oldest first, in Flow's shape: the key is the
// span's `id`. A database without the table (an old read-only one) reads as
// none.
export function listStageSpans(
  db: DatabaseSync,
  { taskId }: { taskId?: string } = {},
) {
  try {
    const where = taskId
      ? "parent_span_id IS NOT NULL AND task_id=?"
      : "parent_span_id IS NOT NULL";
    return db
      .prepare(
        `SELECT key, task_id, attempt, role, stage, started_at, ended_at, source, detail
         FROM telemetry_spans WHERE ${where} ORDER BY started_at, key`,
      )
      .all(...(taskId ? [taskId] : []))
      .map((stored) => {
        const row = stored as SpanRow;
        return {
          id: row.key,
          taskId: row.task_id,
          attempt: row.attempt,
          role: row.role as string | null,
          stage: row.stage,
          startedAt: row.started_at,
          endedAt: row.ended_at,
          source: row.source as string | null,
          detail: row.detail as string | null,
        };
      });
  } catch {
    return [];
  }
}

// The exporter for one store. `limits` and `clock` are for tests.
export function createSqliteExporter(
  store: Store,
  {
    limits = LIMITS,
    clock = Date.now,
  }: { limits?: Limits; clock?: () => number } = {},
) {
  const { db } = store;
  const findSpan = db.prepare("SELECT * FROM telemetry_spans WHERE key=?");
  const upsertSpan = db.prepare(
    `INSERT OR REPLACE INTO telemetry_spans(${SPAN_COLUMNS.join(",")})
     VALUES (${placeholders(SPAN_COLUMNS)})`,
  );
  const insertPoint = db.prepare(
    `INSERT OR IGNORE INTO telemetry_points(${POINT_COLUMNS.join(",")})
     VALUES (${placeholders(POINT_COLUMNS)})`,
  );
  let writes = 0;
  let lastPrune = clock();

  // After a write, and never inside a transaction: the write waits for the
  // next one outside it.
  function maybePrune() {
    writes++;
    if (store.depth || writes < limits.everyWrites) return;
    if (clock() - lastPrune < limits.everyMs) return;
    writes = 0;
    lastPrune = clock();
    pruneTelemetry(db, { limits, now: clock() });
  }

  return {
    name: "sqlite",
    status: () => ({ name: "sqlite" }),
    findSpan: (key: string) => findSpan.get(key) as SpanRow | undefined,
    // True when the row is new or differs from the stored one.
    writeSpan(row: Row) {
      const before = findSpan.get(String(row.key));
      if (before && same(SPAN_COLUMNS, before, row)) return false;
      upsertSpan.run(...values(SPAN_COLUMNS, row));
      maybePrune();
      return true;
    },
    removeSpan(key: string) {
      return db.prepare("DELETE FROM telemetry_spans WHERE key=?").run(key)
        .changes as number;
    },
    // True when the point is new.
    putPoint(row: Row) {
      const added =
        insertPoint.run(...values(POINT_COLUMNS, row)).changes === 1;
      if (added) maybePrune();
      return added;
    },
    // Every stage span of a task's trace, oldest first.
    stageSpans: (traceId: string) =>
      db
        .prepare(
          `SELECT * FROM telemetry_spans WHERE trace_id=? AND parent_span_id IS NOT NULL
           ORDER BY started_at, span_id`,
        )
        .all(traceId) as SpanRow[],
    // The one model the token points inside a time span name, or null.
    modelIn(taskId: string, from: string, to: string) {
      const models = db
        .prepare(
          `SELECT DISTINCT model FROM telemetry_points
           WHERE task_id=? AND name='avoozl.tokens' AND model IS NOT NULL
             AND at >= ? AND at <= ?`,
        )
        .all(taskId, from, to);
      return models.length === 1 ? String(models[0].model) : null;
    },
    counts: () => ({
      spans: (
        db.prepare("SELECT COUNT(*) AS n FROM telemetry_spans").get() as Count
      ).n,
      points: (
        db.prepare("SELECT COUNT(*) AS n FROM telemetry_points").get() as Count
      ).n,
    }),
    prune: () => pruneTelemetry(db, { limits, now: clock() }),
  };
}
