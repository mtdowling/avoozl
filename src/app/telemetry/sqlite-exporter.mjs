// The SQLite exporter: the built-in exporter that writes Avoozl's own database
// (spec otel-export, OT2). It owns the two tables, their writes, their reads
// and their pruning. Only `record.mjs` calls the writes.

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

export const SPAN_COLUMNS = [
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
export const POINT_COLUMNS = [
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

const placeholders = (columns) => columns.map(() => "?").join(",");
const values = (columns, row) => columns.map((name) => row[name] ?? null);
const same = (columns, a, b) =>
  columns.every((name) => (a[name] ?? null) === (b[name] ?? null));

// Delete finished traces (a trace with a root row) whose newest time is older
// than `cutoff`, then the oldest finished traces until the table is at 90
// percent of its cap. A trace with an open span and a time after `openCutoff`
// stays. Returns the number of rows deleted.
function pruneSpans(db, limits, now) {
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
    .run(cutoff).changes;
  let total = db.prepare("SELECT COUNT(*) AS n FROM telemetry_spans").get().n;
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
    .all();
  for (const trace of traces) {
    if (total <= target) break;
    if (trace.open > 0 && trace.newest > openCutoff) continue;
    remove.run(trace.trace_id);
    total -= trace.n;
    removed += trace.n;
  }
  return removed;
}

function prunePoints(db, limits, now) {
  const cutoff = new Date(now - limits.days * DAY).toISOString();
  let removed = db
    .prepare("DELETE FROM telemetry_points WHERE at < ?")
    .run(cutoff).changes;
  const total = db
    .prepare("SELECT COUNT(*) AS n FROM telemetry_points")
    .get().n;
  if (total > limits.pointCap)
    removed += db
      .prepare(
        `DELETE FROM telemetry_points WHERE id IN (
           SELECT id FROM telemetry_points ORDER BY at LIMIT ?)`,
      )
      .run(total - Math.floor(limits.pointCap * 0.9)).changes;
  return removed;
}

// Whether a table has a row to prune, read without taking the write lock.
function due(db, limits, now) {
  const cutoff = new Date(now - limits.days * DAY).toISOString();
  const count = (table) =>
    db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
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
export function pruneOnOpen(db, options = {}) {
  const { limits = LIMITS, now = Date.now() } = options;
  try {
    if (due(db, limits, now)) pruneTelemetry(db, { limits, now });
  } catch {}
}

// Prune both tables as one transaction of their own. Returns the rows deleted.
export function pruneTelemetry(db, { limits = LIMITS, now = Date.now() } = {}) {
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

// The exporter for one store. `limits` and `clock` are for tests.
export function createSqliteExporter(
  store,
  { limits = LIMITS, clock = Date.now } = {},
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
    findSpan: (key) => findSpan.get(key),
    // True when the row is new or differs from the stored one.
    putSpan(row) {
      const before = findSpan.get(row.key);
      if (before && same(SPAN_COLUMNS, before, row)) return false;
      upsertSpan.run(...values(SPAN_COLUMNS, row));
      maybePrune();
      return true;
    },
    deleteSpan(key) {
      return db.prepare("DELETE FROM telemetry_spans WHERE key=?").run(key)
        .changes;
    },
    // True when the point is new.
    putPoint(row) {
      const added =
        insertPoint.run(...values(POINT_COLUMNS, row)).changes === 1;
      if (added) maybePrune();
      return added;
    },
    // Every stage span of a task's trace, oldest first.
    stageSpans: (traceId) =>
      db
        .prepare(
          `SELECT * FROM telemetry_spans WHERE trace_id=? AND parent_span_id IS NOT NULL
           ORDER BY started_at, span_id`,
        )
        .all(traceId),
    // The one model the token points inside a time span name, or null.
    modelIn(taskId, from, to) {
      const models = db
        .prepare(
          `SELECT DISTINCT model FROM telemetry_points
           WHERE task_id=? AND name='avoozl.tokens' AND model IS NOT NULL
             AND at >= ? AND at <= ?`,
        )
        .all(taskId, from, to);
      return models.length === 1 ? models[0].model : null;
    },
    counts: () => ({
      spans: db.prepare("SELECT COUNT(*) AS n FROM telemetry_spans").get().n,
      points: db.prepare("SELECT COUNT(*) AS n FROM telemetry_points").get().n,
    }),
    prune: () => pruneTelemetry(db, { limits, now: clock() }),
  };
}
