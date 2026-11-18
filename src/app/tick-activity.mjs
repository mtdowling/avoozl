// What the tick tells Activity and Needs you about its own health. A tick
// that fails, stalls past its interval, or recovers writes one Activity row
// (source "tick"). A run of identical failures is one row whose count grows,
// not one row per tick. A tick that works writes nothing. Three failures in
// a row open a Needs you item that clears when a tick works.
import { recordActivity, removeActivity } from "./activity-log.mjs";

const KEY = "tick.health";
const MINUTE = 60_000;
// shortcut: the tick does not know its own schedule (the cron, the page and
// the supervisor set it), so a gap this long counts as a stall. Read the
// schedule instead if a workspace ticks less often than this.
export const STALL_MS = 10 * MINUTE;
// Failures in a row before Needs you opens.
export const NEEDS_YOU_AFTER = 3;

const EMPTY = Object.freeze({
  failures: 0,
  error: null,
  failedAt: null,
  since: null,
  rowKey: null,
});

export const tickFailures = (store) => ({
  ...EMPTY,
  ...(store.getMeta(KEY) || {}),
});

// The first line of the error, short enough for one Activity row.
export const firstLine = (message) =>
  String(message || "unknown error")
    .split("\n")[0]
    .trim()
    .slice(0, 120) || "unknown error";

const iso = (ms) => new Date(ms).toISOString();

function log(store, kind, summary, at, key) {
  try {
    return recordActivity(store, {
      source: "tick",
      actor: "avoozl",
      kind,
      summary,
      at,
      key,
    });
  } catch {
    return null;
  }
}

// Called for each run the tick records, with the time of the run before it. `locked`, `held` and `unreadable`
// runs say nothing about whether the tick works, so they change nothing.
export function noteTickRun(store, run, previousAt = null) {
  if (store.readOnly || (run.outcome !== "ok" && run.outcome !== "error"))
    return;
  const was = tickFailures(store),
    now = Date.parse(run.at) || Date.now(),
    gap = previousAt ? now - Date.parse(previousAt) : 0,
    next = { ...was };
  if (gap > STALL_MS)
    log(
      store,
      "tick.stalled",
      `Tick had not run for ${Math.round(gap / MINUTE)} min; it is running again`,
      iso(now),
      `tick.stalled:${iso(now)}`,
    );
  if (run.outcome === "error") {
    const error = firstLine(run.error),
      same = was.failures > 0 && was.error === error;
    next.failures = same ? was.failures + 1 : 1;
    next.error = error;
    next.failedAt = iso(now);
    next.since = same ? was.since : iso(now);
    next.rowKey = `tick.failed:${next.since}:${next.failures}`;
    // The same message replaces its row with a higher count; a new message
    // starts a new row.
    const summary = `Tick failed${next.failures > 1 ? ` ${next.failures} times in a row` : ""}: ${error}`;
    if (same) removeActivity(store, was.rowKey);
    log(store, "tick.failed", summary, iso(now), next.rowKey);
  } else if (was.failures > 0) {
    log(
      store,
      "tick.recovered",
      `Tick works again after ${was.failures} failure${was.failures === 1 ? "" : "s"}`,
      iso(now),
      `tick.recovered:${iso(now)}`,
    );
    Object.assign(next, EMPTY);
  }
  if (run.outcome === "error" || was.failures > 0) store.setMeta(KEY, next);
}

// Needs you after three failures in a row, until a tick works.
export function tickFailedItems(store) {
  const h = tickFailures(store);
  if (h.failures < NEEDS_YOU_AFTER) return [];
  return [
    {
      kind: "tick-failed",
      id: "tick-failed",
      taskId: null,
      title: `The tick failed ${h.failures} times in a row`,
      detail: `${h.error}. Nothing is dispatched, merged or read from GitHub until a tick works.`,
      failures: h.failures,
      openedAt: h.failedAt,
    },
  ];
}
