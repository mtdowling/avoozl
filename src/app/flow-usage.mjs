// Token and credit usage per flow stage (design §4.11, owner addition
// 2026-11-13). Kiro Crew records each turn's input and output tokens and
// credits (the kiro backend fills credits, others fill tokens) and lets an
// app read the rows of the sessions it opened: GET /api/usage/turns?slot=
// with the grant in app.json, row-level isolated to the app (Kiro Crew
// dashboard/handlers/telemetry.py api_usage_turns; Verified from source, not
// called live). Each turn is attributed to its session, then the session's
// task and attempt, then the flow stage whose span holds the turn's time,
// and to its model. Only counts are stored: no prompts, text, or cost.
import { bucketOf, listSpans } from "./flow.mjs";
import { listSessionBindings } from "./session-bindings.mjs";
import { taskRepository } from "../work-model.mjs";

const COLUMNS = "id,slot,task_id,attempt,role,ts,model,input,output,credits";
const num = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;

export function ensureUsageTable(store) {
  store.db.exec(
    `CREATE TABLE IF NOT EXISTS flow_usage(id TEXT PRIMARY KEY,slot TEXT NOT NULL,task_id TEXT NOT NULL,attempt INTEGER,role TEXT,ts TEXT NOT NULL,model TEXT,input REAL,output REAL,credits REAL)`,
  );
}

// Record one session's turn rows; rows already seen are skipped. Returns
// how many were added.
export function ingestUsage(store, binding, rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  ensureUsageTable(store);
  const insert = store.db.prepare(
    `INSERT OR IGNORE INTO flow_usage(${COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  let added = 0;
  store.transaction(() => {
    for (const row of rows) {
      if (!row || typeof row.ts !== "string" || !row.ts) continue;
      const input = num(row.input),
        output = num(row.output),
        credits = num(row.credits);
      if (!input && !output && !credits) continue;
      added += insert.run(
        `${binding.slot}@${row.ts}`,
        binding.slot,
        binding.taskId,
        binding.attempt ?? null,
        binding.role ?? null,
        row.ts,
        typeof row.model === "string" ? row.model.slice(0, 128) : null,
        input,
        output,
        credits,
      ).changes;
    }
  });
  return added;
}

export function listUsage(store) {
  try {
    return store.db
      .prepare(`SELECT ${COLUMNS} FROM flow_usage ORDER BY ts`)
      .all();
  } catch {
    return [];
  }
}

// The stage a turn ran in: the span of its task, attempt and role whose time
// holds the turn's; a turn outside every span counts to the role's stage.
export function turnStage(spans, turn) {
  const own = spans.filter(
    (s) =>
      s.taskId === turn.task_id && (s.role === turn.role || s.role === null),
  );
  const holding = own.filter(
    (s) =>
      (s.attempt === turn.attempt || s.attempt === null) &&
      s.startedAt <= turn.ts &&
      (!s.endedAt || turn.ts <= s.endedAt),
  );
  const pick = holding.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
  if (pick) return pick.stage;
  if (turn.role === "verifier") return "tests";
  if (String(turn.role || "").startsWith("review:")) return "review";
  if (turn.role === "worker") return turn.attempt > 1 ? "rework" : "coding";
  return turn.role || "other";
}

const add = (map, key, turn) => {
  const row = map.get(key) || {
    key,
    input: 0,
    output: 0,
    credits: 0,
    turns: 0,
  };
  row.input += turn.input;
  row.output += turn.output;
  row.credits += turn.credits;
  row.turns += 1;
  map.set(key, row);
};

// Totals per task, plan, stage and model, and per day, over the tasks the
// filter keeps. `available` is false until a usage read has ever answered.
export function usageView(store, data, { tasks = null } = {}) {
  const available = Boolean(store.getMeta("flow.usage.readable"));
  const keep = tasks ? new Set(tasks) : null,
    byId = new Map(data.tasks.map((t) => [t.id, t])),
    spans = listSpans(store),
    turns = listUsage(store).filter((t) => !keep || keep.has(t.task_id)),
    byTask = new Map(),
    byPlan = new Map(),
    byStage = new Map(),
    byModel = new Map(),
    byDay = new Map(),
    byWeek = new Map(),
    total = { input: 0, output: 0, credits: 0, turns: 0 };
  for (const turn of turns) {
    const task = byId.get(turn.task_id),
      plan = task?.spec || task?.planId || "no plan";
    add(byTask, turn.task_id, turn);
    add(byPlan, plan, turn);
    add(byStage, turnStage(spans, turn), turn);
    add(byModel, turn.model || "unknown", turn);
    add(byDay, bucketOf(turn.ts, "day"), turn);
    add(byWeek, bucketOf(turn.ts, "week"), turn);
    total.input += turn.input;
    total.output += turn.output;
    total.credits += turn.credits;
    total.turns += 1;
  }
  const rows = (map) =>
    [...map.values()].sort(
      (a, b) =>
        b.credits + b.input + b.output - (a.credits + a.input + a.output),
    );
  return {
    available: available || turns.length > 0,
    total,
    byTask: rows(byTask).slice(0, 100),
    byPlan: rows(byPlan),
    byStage: rows(byStage),
    byModel: rows(byModel),
    byDay: [...byDay.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    byWeek: [...byWeek.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    repositories: [
      ...new Set(
        turns.map((t) => taskRepository(byId.get(t.task_id))).filter(Boolean),
      ),
    ],
  };
}

// The backend's read, after each tick receipt: every session the tick
// opened, until one read after it ended. Writes only new rows.
export async function observeUsage(store, readTurns) {
  const errors = [];
  let rows = 0;
  for (const binding of listSessionBindings(store)) {
    if (binding.source !== "tick") continue;
    const done = "flow.usage.done." + binding.slot;
    if (store.getMeta(done)) continue;
    // Each slot's last read, for a budget's "spend unknown" and its time
    // (design §4.17).
    const read = "flow.usage.read." + binding.slot;
    try {
      const turns = await readTurns(binding.slot);
      if (!store.getMeta("flow.usage.readable"))
        store.setMeta("flow.usage.readable", true);
      rows += ingestUsage(store, binding, turns);
      store.setMeta(read, { at: new Date().toISOString(), ok: true });
      if (
        ["closed", "lost", "gone"].includes(binding.status) ||
        binding.report?.kind === "done"
      )
        store.setMeta(done, true);
    } catch (error) {
      const last = store.getMeta(read);
      store.setMeta(read, {
        at: last?.at ?? null,
        ok: false,
        failedAt: last?.ok === false ? last.failedAt : new Date().toISOString(),
      });
      errors.push({ slot: binding.slot, error: error.message });
    }
  }
  return { rows, errors };
}
