// @ts-nocheck: typing debt
// Token and credit counts as points (spec otel-export, OT8.6, §D4). For each
// session the tick opened, the executor's usage call hands back its turn
// rows; each row becomes up to three points: `avoozl.tokens` input and
// output, and `avoozl.credits`. A point's ID is `<slot>@<ts>:<name>:<direction>`,
// so a row read twice records once. Only counts are kept, never row text.
import { listSessionBindings } from "../sessions/session-bindings.ts";
import { listStageSpans } from "./sqlite-exporter.ts";
import { UNATTRIBUTED, point } from "./record.ts";

const NAME = /^[A-Za-z0-9._:/-]{1,128}$/;
const count = (v) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;

// The stage of the binding's attempt whose span holds `ts`, latest start
// first; else `unattributed`.
function stageAt(spans, binding, ts) {
  const holding = spans
    .filter(
      (s) =>
        (s.attempt === binding.attempt || s.attempt === null) &&
        (s.role === binding.role || s.role === null) &&
        s.startedAt <= ts &&
        (!s.endedAt || ts <= s.endedAt),
    )
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return holding[0]?.stage ?? UNATTRIBUTED;
}

// Record one session's turn rows. `trace` is the task's {repo, spec}, as its
// spans carry them. Returns how many points were added.
export function recordUsage(store, binding, rows, trace = {}) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const spans = listStageSpans(store.db, { taskId: binding.taskId }),
    role = NAME.test(binding.role ?? "") ? binding.role : null;
  let added = 0;
  store.transaction(() => {
    for (const row of rows) {
      if (!row || typeof row.ts !== "string" || !row.ts) continue;
      const base = {
        at: row.ts,
        taskId: binding.taskId,
        ...trace,
        role,
        stage: stageAt(spans, binding, row.ts),
        model:
          typeof row.model === "string" && NAME.test(row.model)
            ? row.model
            : null,
      };
      const id = `${binding.slot}@${row.ts}`;
      for (const [name, value, direction] of [
        ["avoozl.tokens", count(row.input), "input"],
        ["avoozl.tokens", count(row.output), "output"],
        ["avoozl.credits", count(row.credits), null],
      ]) {
        if (!value) continue;
        try {
          added += point(store, {
            ...base,
            id: `${id}:${name}${direction ? `:${direction}` : ""}`,
            name,
            kind: "sum",
            unit: name === "avoozl.tokens" ? "{token}" : "{credit}",
            value,
            ...(direction ? { attrs: { direction } } : {}),
          })
            ? 1
            : 0;
        } catch (error) {
          // A row whose time or ID the allowlist refuses is skipped; a
          // database failure still throws.
          if (!String(error.message).startsWith("Telemetry:")) throw error;
        }
      }
    }
  });
  return added;
}

// Read each session the tick opened, until it ends, and record its turns.
// `readTurns(slot)` is the executor's usage call; `traceOf(taskId)` gives the
// task's {repo, spec}. Returns {points, errors}.
export async function observeUsage(store, readTurns, traceOf = () => ({})) {
  const errors = [];
  let points = 0;
  for (const binding of listSessionBindings(store)) {
    if (binding.source !== "tick") continue;
    const done = `telemetry.usage.done.${binding.slot}`;
    if (store.getMeta(done)) continue;
    try {
      points += recordUsage(
        store,
        binding,
        await readTurns(binding.slot),
        traceOf(binding.taskId),
      );
      if (
        ["closed", "lost", "gone"].includes(binding.status) ||
        binding.report?.kind === "done"
      )
        store.setMeta(done, true);
    } catch (error) {
      errors.push({ slot: binding.slot, error: error.message });
    }
  }
  return { points, errors };
}
