// Planning sessions have their own accounting domain, even when a round ID
// happens to equal a task ID. Task flow and budgets never read these tables.
export const planningRole = (role) =>
  ["plan-review", "plan-answer"].includes(role);
const num = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
export function ensurePlanningTables(store) {
  store.db.exec(
    "CREATE TABLE IF NOT EXISTS planning_spans(id TEXT PRIMARY KEY,spec TEXT NOT NULL,plan_id TEXT NOT NULL,round_id TEXT NOT NULL,slot TEXT NOT NULL,role TEXT NOT NULL,model TEXT,started_at TEXT NOT NULL,ended_at TEXT); CREATE TABLE IF NOT EXISTS planning_usage(id TEXT PRIMARY KEY,slot TEXT NOT NULL,spec TEXT NOT NULL,plan_id TEXT NOT NULL,round_id TEXT NOT NULL,role TEXT NOT NULL,ts TEXT NOT NULL,model TEXT,input REAL,output REAL,credits REAL)",
  );
}
function target(store, binding) {
  const round = store.get("review_rounds", binding.taskId),
    plan = round && store.get("plans", round.planId);
  return round?.spec && plan ? { round, plan, spec: round.spec } : null;
}
export function ingestPlanningUsage(store, binding, rows) {
  const scope = target(store, binding);
  if (!scope) return 0;
  ensurePlanningTables(store);
  const insert = store.db.prepare(
    "INSERT OR IGNORE INTO planning_usage(id,slot,spec,plan_id,round_id,role,ts,model,input,output,credits) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  );
  let added = 0;
  store.transaction(() => {
    for (const row of rows) {
      if (typeof row?.ts !== "string" || !row.ts) continue;
      const input = num(row.input),
        output = num(row.output),
        credits = num(row.credits);
      if (!input && !output && !credits) continue;
      added += insert.run(
        binding.slot + "@" + row.ts,
        binding.slot,
        scope.spec,
        scope.plan.id,
        scope.round.id,
        binding.role,
        row.ts,
        typeof row.model === "string"
          ? row.model.slice(0, 128)
          : (binding.served?.model ?? binding.model ?? null),
        input,
        output,
        credits,
      ).changes;
    }
  });
  return added;
}
function derivedSpans(store) {
  return store
    .list("session_bindings")
    .filter((binding) => planningRole(binding.role))
    .flatMap((binding) => {
      const scope = target(store, binding);
      if (!scope || !binding.boundAt) return [];
      const done =
        binding.role === "plan-review"
          ? scope.round
          : store.get("receipts", "plan-answer:" + scope.round.id);
      const end =
        done?.state === "done" || done?.state === "skipped"
          ? done.endedAt
          : null;
      return [
        {
          id: binding.slot,
          slot: binding.slot,
          spec: scope.spec,
          plan_id: scope.plan.id,
          round_id: scope.round.id,
          role: binding.role,
          model: binding.served?.model ?? binding.model ?? null,
          started_at: binding.boundAt,
          ended_at:
            end ??
            (["closed", "lost", "gone"].includes(binding.status)
              ? binding.statusAt
              : null) ??
            null,
        },
      ];
    });
}
export function syncPlanningSpans(store) {
  ensurePlanningTables(store);
  const insert = store.db.prepare(
    "INSERT INTO planning_spans(id,slot,spec,plan_id,round_id,role,model,started_at,ended_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET model=excluded.model,ended_at=excluded.ended_at WHERE planning_spans.model IS NOT excluded.model OR planning_spans.ended_at IS NOT excluded.ended_at",
  );
  store.transaction(() => {
    for (const row of derivedSpans(store))
      insert.run(
        row.id,
        row.slot,
        row.spec,
        row.plan_id,
        row.round_id,
        row.role,
        row.model,
        row.started_at,
        row.ended_at,
      );
    // Upgrade usage already collected before planning had its own accounting.
    for (const binding of store
      .list("session_bindings")
      .filter((b) => planningRole(b.role))) {
      if (!target(store, binding)) continue;
      const legacy = store.db
        .prepare(
          "SELECT * FROM flow_usage WHERE slot=? AND role IN ('plan-review','plan-answer')",
        )
        .all(binding.slot);
      ingestPlanningUsage(store, binding, legacy);
      store.db
        .prepare(
          "DELETE FROM flow_usage WHERE slot=? AND role IN ('plan-review','plan-answer')",
        )
        .run(binding.slot);
    }
  });
}
const totals = () => ({ input: 0, output: 0, credits: 0, turns: 0 });
export function planningFlowView(store, input = {}, { now = Date.now() } = {}) {
  let spans = [],
    turns = [];
  try {
    spans = store.db.prepare("SELECT * FROM planning_spans").all();
    turns = store.db.prepare("SELECT * FROM planning_usage").all();
  } catch {
    /* A workspace with no planning sessions has no history yet. */
  }
  const bySlot = new Map(spans.map((span) => [span.slot, span]));
  for (const span of derivedSpans(store)) bySlot.set(span.slot, span);
  // Unmigrated legacy rows are visible here, never through task usage readers.
  try {
    const bindings = new Map(
      store
        .list("session_bindings")
        .filter((b) => planningRole(b.role))
        .map((b) => [b.slot, b]),
    );
    for (const row of store.db
      .prepare(
        "SELECT * FROM flow_usage WHERE role IN ('plan-review','plan-answer')",
      )
      .all()) {
      const binding = bindings.get(row.slot),
        scope = binding && target(store, binding);
      if (scope)
        turns.push({
          ...row,
          spec: scope.spec,
          plan_id: scope.plan.id,
          round_id: scope.round.id,
        });
    }
  } catch {
    /* No old usage table. */
  }
  const groups = new Map(),
    group = (row) => {
      if (input.plan && input.plan !== row.plan_id) return null;
      const round = store.get("review_rounds", row.round_id);
      if (
        input.repository &&
        !Object.hasOwn(round?.commits ?? {}, input.repository)
      )
        return null;
      let value = groups.get(row.plan_id);
      if (!value) {
        value = {
          spec: row.spec,
          planId: row.plan_id,
          durationMs: 0,
          usage: totals(),
          roles: [],
        };
        groups.set(row.plan_id, value);
      }
      return value;
    },
    role = (value, row) => {
      let found = value.roles.find(
        (item) => item.role === row.role && item.model === row.model,
      );
      if (!found) {
        found = {
          role: row.role,
          model: row.model,
          durationMs: 0,
          ...totals(),
        };
        value.roles.push(found);
      }
      return found;
    };
  for (const row of bySlot.values()) {
    const value = group(row);
    if (!value) continue;
    const duration = Math.max(
      0,
      (row.ended_at ? Date.parse(row.ended_at) : now) -
        Date.parse(row.started_at),
    );
    value.durationMs += duration;
    role(value, row).durationMs += duration;
  }
  for (const row of new Map(turns.map((turn) => [turn.id, turn])).values()) {
    const value = group(row);
    if (!value) continue;
    const own = role(value, row);
    for (const key of ["input", "output", "credits"]) {
      value.usage[key] += num(row[key]);
      own[key] += num(row[key]);
    }
    value.usage.turns++;
    own.turns++;
  }
  for (const value of groups.values())
    value.roles.sort(
      (a, b) =>
        ["plan-review", "plan-answer"].indexOf(a.role) -
          ["plan-review", "plan-answer"].indexOf(b.role) ||
        String(a.model).localeCompare(String(b.model)),
    );
  return [...groups.values()].sort((a, b) => a.spec.localeCompare(b.spec));
}
