import assert from "node:assert/strict";
import test from "node:test";
import { endLease, leaseState, renewLease, takeLease } from "./lease.mjs";

const T0 = Date.parse("2026-01-01T00:00:00.000Z");

test("take on none and on stale makes a new lease; an active foreign lease is busy", () => {
  const first = takeLease(null, { sessionId: "a", seconds: 180, now: T0 });
  assert.equal(first.record.state, "active");
  assert.equal(first.replaced, null);
  assert.equal(leaseState(first.record, T0), "active");
  // Another session while it is fresh.
  const busy = takeLease(first.record, {
    sessionId: "b",
    seconds: 180,
    now: T0 + 1000,
  });
  assert.equal(busy.busy, true);
  assert.equal(busy.record, first.record);
  // The same session keeps its lease ID and renews.
  const again = takeLease(first.record, {
    sessionId: "a",
    seconds: 180,
    now: T0 + 60000,
  });
  assert.equal(again.record.leaseId, first.record.leaseId);
  assert.equal(
    again.record.expiresAt,
    new Date(T0 + 60000 + 180000).toISOString(),
  );
  // Stale: another session takes it and sees what it replaced.
  const later = T0 + 181000;
  assert.equal(leaseState(first.record, later), "stale");
  const taken = takeLease(first.record, {
    sessionId: "b",
    seconds: 180,
    now: later,
  });
  assert.notEqual(taken.record.leaseId, first.record.leaseId);
  assert.equal(taken.replaced, first.record);
});

test("renew and end need the right lease ID", () => {
  const { record } = takeLease(null, { sessionId: "a", seconds: 60, now: T0 });
  assert.equal(renewLease(record, { leaseId: "wrong", now: T0 }).changed, true);
  assert.equal(endLease(record, { leaseId: "wrong", now: T0 }).changed, true);
  const renewed = renewLease(record, {
    leaseId: record.leaseId,
    now: T0 + 30000,
  });
  assert.equal(renewed.record.expiresAt, new Date(T0 + 90000).toISOString());
  const ended = endLease(renewed.record, {
    leaseId: record.leaseId,
    now: T0 + 40000,
  });
  assert.equal(ended.record.state, "ended");
  assert.equal(leaseState(ended.record, T0 + 41000), "ended");
  // An ended lease can be taken by anyone.
  assert.ok(
    takeLease(ended.record, { sessionId: "b", seconds: 60, now: T0 + 41000 })
      .record,
  );
});

test("a 180-second lease goes stale at 181 seconds, and none reads as none", () => {
  const { record } = takeLease(null, { sessionId: "a", seconds: 180, now: T0 });
  assert.equal(leaseState(record, T0 + 179000), "active");
  assert.equal(leaseState(record, T0 + 181000), "stale");
  assert.equal(leaseState(undefined, T0), "none");
});

test("a lease lasts a whole number of seconds", () => {
  assert.throws(
    () => takeLease(null, { sessionId: "a", seconds: 0 }),
    /whole number of seconds/,
  );
  assert.throws(
    () => takeLease(null, { sessionId: "a", seconds: 1.5 }),
    /whole number of seconds/,
  );
  assert.throws(() => takeLease(null, { seconds: 5 }), /names the session/);
});
