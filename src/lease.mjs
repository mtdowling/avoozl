// One lease module for activity leases (src/activity.mjs) and the landing
// lease (src/app/landing-lease.mjs). A lease is a record held by one
// session; it is renewed with its lease ID and expires when not renewed.
// Lengths are in seconds, so a one-minute heartbeat is possible. Callers
// own any bounds (activity keeps 5-240 minutes).
import { randomUUID } from "./task-identity.mjs";

const iso = (ms) => new Date(ms).toISOString();

function checkSeconds(seconds) {
  if (!Number.isInteger(seconds) || seconds < 1)
    throw Error("A lease lasts a whole number of seconds, at least 1.");
}

// none | active | stale | ended. A record that is not active (paused,
// finished, ended) reports as `ended`; an active one past its expiry is
// `stale`, never silently active.
export function leaseState(record, now = Date.now()) {
  if (!record) return "none";
  if (record.state !== "active") return "ended";
  return Number.isFinite(Date.parse(record.expiresAt)) &&
    Date.parse(record.expiresAt) > now
    ? "active"
    : "stale";
}

// Takes the lease for `sessionId`. {busy: true, record} when another session
// holds it and it is still active. The same session taking it again keeps
// its lease ID and renews it. On none, stale or ended it makes a new record
// and returns the one it replaced as `replaced`.
export function takeLease(
  record,
  { sessionId, holder, seconds, now = Date.now(), ...extra },
) {
  checkSeconds(seconds);
  if (typeof sessionId !== "string" || !sessionId)
    throw Error("A lease names the session that holds it.");
  const state = leaseState(record, now);
  if (state === "active") {
    if (record.sessionId !== sessionId) return { busy: true, record };
    return {
      record: renewLease(record, { leaseId: record.leaseId, seconds, now })
        .record,
    };
  }
  return {
    record: {
      ...extra,
      state: "active",
      leaseId: randomUUID(),
      sessionId,
      ...(holder === undefined ? {} : { holder }),
      startedAt: iso(now),
      heartbeatAt: iso(now),
      expiresAt: iso(now + seconds * 1000),
      seconds,
    },
    replaced: record ?? null,
  };
}

// Extends the lease from `now`. {changed: true} when the lease ID is not
// the record's: someone else holds it or it was replaced.
export function renewLease(record, { leaseId, seconds, now = Date.now() }) {
  if (!record || !leaseId || record.leaseId !== leaseId)
    return { changed: true };
  seconds ??= record.seconds;
  checkSeconds(seconds);
  const { endedAt, ...rest } = record;
  return {
    record: {
      ...rest,
      state: "active",
      seconds,
      heartbeatAt: iso(now),
      expiresAt: iso(now + seconds * 1000),
    },
  };
}

// Ends the lease (state `ended`, or `paused` / `finished` for an activity).
export function endLease(
  record,
  { leaseId, now = Date.now(), state = "ended" },
) {
  if (!record || !leaseId || record.leaseId !== leaseId)
    return { changed: true };
  return { record: { ...record, state, endedAt: iso(now) } };
}
