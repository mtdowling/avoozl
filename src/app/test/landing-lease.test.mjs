// The landing lease (lt-2.2): compare-and-set, heartbeat, expiry and the
// hung holder. Two stores on one database file stand for two processes.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  endLandingLease,
  holderAlive,
  integratorNeedsYou,
  landingLease,
  renewLandingLease,
  takeLandingLease,
} from "../landing-lease.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const T0 = Date.parse("2026-01-01T00:00:00.000Z");
const ME = { machine: "m1", pid: process.pid, start: null };
const DEAD = { machine: "m1", pid: 2 ** 22 + 12345, start: null };
const where = { projectId: "app", target: "main" };

function stores(t) {
  const file = path.join(temporaryDirectory("avoozl-lease-"), "w.sqlite"),
    a = new Store(file),
    b = new Store(file);
  t.after(() => {
    a.close();
    b.close();
  });
  return { a, b };
}
// Holder liveness for these tests: this process is alive, the made-up pid is not.
const probe = (holder) => holder.pid === process.pid;

test("two stores race for the lease: exactly one wins and the other writes nothing", (t) => {
  const { a, b } = stores(t);
  const first = takeLandingLease(a, {
    ...where,
    sessionId: "a",
    holder: ME,
    seconds: 180,
    now: T0,
  });
  assert.equal(first.state, "taken");
  const before = JSON.stringify(b.get("landing_leases", first.lease.id));
  const second = takeLandingLease(b, {
    ...where,
    sessionId: "b",
    holder: ME,
    seconds: 180,
    now: T0 + 1000,
  });
  assert.equal(second.state, "busy");
  assert.equal(JSON.stringify(b.get("landing_leases", first.lease.id)), before);
  assert.equal(landingLease(b, "app", "main").sessionId, "a");
});

test("a lease renewed on time stays; one not renewed for three heartbeats goes stale", (t) => {
  const { a, b } = stores(t),
    seconds = 180;
  const { lease } = takeLandingLease(a, {
    ...where,
    sessionId: "a",
    holder: ME,
    seconds,
    now: T0,
  });
  for (const beat of [1, 2, 3, 4]) {
    const now = T0 + beat * 60000;
    assert.ok(
      renewLandingLease(a, { ...where, leaseId: lease.leaseId, seconds, now })
        .lease,
    );
    assert.equal(
      takeLandingLease(b, {
        ...where,
        sessionId: "b",
        holder: DEAD,
        seconds,
        now,
      }).state,
      "busy",
    );
  }
  // Three missed heartbeats after the last renewal at +240 s.
  const late = T0 + 240000 + 181000;
  assert.equal(
    renewLandingLease(a, {
      ...where,
      leaseId: lease.leaseId,
      seconds,
      now: late,
    }).changed,
    true,
  );
  const taken = takeLandingLease(b, {
    ...where,
    sessionId: "b",
    holder: DEAD,
    seconds,
    now: late,
    probe,
  });
  // The stale holder is this live process: not taken.
  assert.equal(taken.state, "hung");
});

test("a stale lease with a live holder is refused with one Needs you item across three loops", (t) => {
  const { a, b } = stores(t);
  takeLandingLease(a, {
    ...where,
    sessionId: "a",
    holder: ME,
    seconds: 180,
    now: T0,
  });
  const notices = [];
  for (const loop of [1, 2, 3]) {
    const r = takeLandingLease(b, {
      ...where,
      sessionId: "b",
      holder: DEAD,
      seconds: 180,
      now: T0 + 300000 + loop * 60000,
      probe,
    });
    assert.equal(r.state, "hung");
    notices.push(...r.notify);
  }
  assert.equal(notices.length, 1);
  assert.match(notices[0].title, /integrator for main is hung/);
  assert.equal(landingLease(b, "app", "main").sessionId, "a");
  const items = integratorNeedsYou(b);
  assert.equal(items.length, 1);
  assert.match(items[0].detail, new RegExp(String(process.pid)));
});

test("a stale lease with a dead holder is taken, and the dead one is handed back for cleanup", (t) => {
  const { a, b } = stores(t);
  takeLandingLease(a, {
    ...where,
    sessionId: "a",
    holder: DEAD,
    seconds: 180,
    train: "train-1",
    now: T0,
  });
  const r = takeLandingLease(b, {
    ...where,
    sessionId: "b",
    holder: ME,
    seconds: 180,
    now: T0 + 181000,
    probe,
  });
  assert.equal(r.state, "taken");
  assert.equal(r.dead.train, "train-1");
  assert.equal(r.lease.sessionId, "b");
  assert.notEqual(r.lease.leaseId, r.dead.leaseId);
});

test("an ended lease is taken with no cleanup; the old holder cannot renew a lost lease", (t) => {
  const { a, b } = stores(t);
  const { lease } = takeLandingLease(a, {
    ...where,
    sessionId: "a",
    holder: ME,
    seconds: 180,
    now: T0,
  });
  assert.equal(
    endLandingLease(a, { ...where, leaseId: "wrong", now: T0 }).changed,
    true,
  );
  assert.ok(
    endLandingLease(a, { ...where, leaseId: lease.leaseId, now: T0 + 1000 })
      .lease,
  );
  const r = takeLandingLease(b, {
    ...where,
    sessionId: "b",
    holder: ME,
    seconds: 180,
    now: T0 + 2000,
  });
  assert.equal(r.state, "taken");
  assert.equal(r.dead, null);
  assert.equal(
    renewLandingLease(a, { ...where, leaseId: lease.leaseId, now: T0 + 3000 })
      .changed,
    true,
  );
});

test("holderAlive: this process is alive, a made-up pid and another machine are not", () => {
  assert.equal(
    holderAlive(
      { machine: "m1", pid: process.pid, start: null },
      { machine: "m1" },
    ),
    true,
  );
  assert.equal(holderAlive(DEAD, { machine: "m1" }), false);
  assert.equal(
    holderAlive({ ...ME, machine: "other" }, { machine: "m1" }),
    false,
  );
});
