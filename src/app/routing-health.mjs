// Whether routing works (design §4.10, R41.7). With routing on, a task never
// runs on this machine because routing failed: it stays Ready, marked, and
// the router is asked again after a backoff. This file keeps the count of
// failures in a row, the last success and error, and the marks. Only
// "routing off" runs tasks locally.
import { recordActivity } from "./activity-log.mjs";

const KEY = "routing.health";
const MINUTE = 60_000;
// 1, 2, 4, 8 minutes, then every 15.
const BACKOFF = [1, 2, 4, 8, 15];
// Failures in a row before Needs you opens.
export const NEEDS_YOU_AFTER = 3;

export const backoffMs = (failures) =>
  BACKOFF[Math.min(Math.max(failures, 1), BACKOFF.length) - 1] * MINUTE;

const EMPTY = Object.freeze({
  failures: 0,
  lastSuccessAt: null,
  lastError: null,
  lastErrorAt: null,
  retryAt: null,
  marks: {},
});

export const routingHealth = (store) => ({
  ...EMPTY,
  ...(store.getMeta(KEY) || {}),
});

const write = (store, next) => store.setMeta(KEY, next);
const iso = (ms) => new Date(ms).toISOString();

function log(store, kind, summary, now) {
  try {
    recordActivity(store, {
      source: "local",
      actor: "avoozl",
      kind,
      summary,
      at: iso(now),
    });
  } catch {}
}

// One failure of the router: an error, a timeout, a bad reply, a held brief,
// a router model that is out, or a pick that no longer passes.
export function routeFailed(store, why, now = Date.now()) {
  const was = routingHealth(store),
    failures = was.failures + 1;
  write(store, {
    ...was,
    failures,
    lastError: why,
    lastErrorAt: iso(now),
    retryAt: now + backoffMs(failures),
  });
  log(
    store,
    "routing.failed",
    `Routing failed (${failures} in a row): ${why}. Tasks wait and nothing runs on this machine; next try in ${backoffMs(failures) / MINUTE} min.`,
    now,
  );
}

// A call whose every pick was usable.
export function routeSucceeded(store, now = Date.now()) {
  const was = routingHealth(store);
  if (was.failures)
    log(
      store,
      "routing.recovered",
      `Routing works again after ${was.failures} failure${was.failures === 1 ? "" : "s"}.`,
      now,
    );
  write(store, {
    ...was,
    failures: 0,
    retryAt: null,
    lastSuccessAt: iso(now),
  });
}

// Retry now (Needs you): the next tick asks again at once.
export function retryRoutingNow(store) {
  const was = routingHealth(store);
  write(store, { ...was, retryAt: null });
  return { retrying: was.failures > 0 };
}

// Turn routing off (Needs you): nothing is left to retry.
export function clearRoutingHealth(store) {
  const was = routingHealth(store);
  write(store, { ...EMPTY, lastSuccessAt: was.lastSuccessAt, marks: {} });
}

// While a failure's backoff has not passed, no task asks the router.
export const backingOff = (health, now) =>
  health.failures > 0 && health.retryAt !== null && now < health.retryAt;

// The tick's marks: each task held by routing, with the reason. Replaced
// whole each tick; written only when they changed.
export function setRoutingMarks(store, marks) {
  const was = routingHealth(store);
  if (JSON.stringify(was.marks) === JSON.stringify(marks)) return;
  write(store, { ...was, marks });
}

// Needs you after three failures in a row, until routing works or is off.
export function routingFailedItems(store) {
  const h = routingHealth(store);
  if (h.failures < NEEDS_YOU_AFTER) return [];
  return [
    {
      kind: "routing-failed",
      id: "routing-failed",
      taskId: null,
      title: `Routing failed ${h.failures} times in a row`,
      detail: `${h.lastError}. Ready tasks wait and nothing runs on this machine until routing works or you turn it off.`,
      failures: h.failures,
      retryAt: h.retryAt ? iso(h.retryAt) : null,
      openedAt: h.lastErrorAt,
    },
  ];
}
