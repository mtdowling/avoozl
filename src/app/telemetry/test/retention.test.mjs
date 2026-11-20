// ot-2.4: retention and size cap (OT2.3, OT2.4, OT2.5, OT2.7).
import assert from "node:assert/strict";
import test from "node:test";
import { Store } from "../../store/store.mjs";
import { finishTask, openTelemetry, point, span } from "../record.mjs";
import { LIMITS, pruneTelemetry } from "../sqlite-exporter.mjs";

const NOW = Date.parse("2026-01-01T00:00:00.000Z");
const DAY = 86_400_000;
const ago = (days) => new Date(NOW - days * DAY).toISOString();

function open(t, options) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  if (options) openTelemetry(store, options);
  return store;
}
const count = (store, table) =>
  store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const tasks = (store) =>
  store.db
    .prepare("SELECT DISTINCT task_id FROM telemetry_spans ORDER BY task_id")
    .all()
    .map((row) => row.task_id);

// One trace: a stage span a day long ending `days` ago, finished or open.
function trace(store, id, days, { finished = true, open = false } = {}) {
  span(store, {
    key: `${id}:1:coding`,
    taskId: id,
    repo: "acme/app",
    spec: "acme-cache",
    stage: "coding",
    attempt: 1,
    startedAt: ago(days + 1),
    endedAt: open ? null : ago(days),
  });
  if (finished)
    finishTask(store, {
      taskId: id,
      repo: "acme/app",
      spec: "acme-cache",
      finishedAt: ago(days),
      outcome: "landed",
    });
}
const small = { ...LIMITS, spanCap: 10, pointCap: 10 };

test("a finished trace older than 90 days goes with its root and children", (t) => {
  const store = open(t);
  trace(store, "old", 100);
  trace(store, "new", 10);
  assert.equal(count(store, "telemetry_spans"), 4);
  pruneTelemetry(store.db, { limits: LIMITS, now: NOW });
  assert.deepEqual(tasks(store), ["new"]);
  assert.equal(count(store, "telemetry_spans"), 2);
});

test("over the cap the oldest finished traces go until the table is at 90 percent", (t) => {
  const store = open(t);
  for (let i = 0; i < 6; i++) trace(store, `t${i}`, 30 - i * 2);
  assert.equal(count(store, "telemetry_spans"), 12);
  pruneTelemetry(store.db, { limits: small, now: NOW });
  // 90 percent of 10 is 9: two traces (4 rows) go, the oldest two.
  assert.equal(count(store, "telemetry_spans"), 8);
  assert.deepEqual(tasks(store), ["t2", "t3", "t4", "t5"]);
});

test("a trace with an open span active in the last 7 days stays", (t) => {
  const store = open(t);
  trace(store, "busy", 3, { open: true });
  for (let i = 0; i < 5; i++) trace(store, `t${i}`, 30 - i);
  pruneTelemetry(store.db, { limits: small, now: NOW });
  assert.ok(tasks(store).includes("busy"));
  assert.ok(count(store, "telemetry_spans") <= 9);
});

test("a trace with no root yet is not finished and stays", (t) => {
  const store = open(t);
  trace(store, "running", 200, { finished: false, open: true });
  pruneTelemetry(store.db, { limits: LIMITS, now: NOW });
  assert.deepEqual(tasks(store), ["running"]);
});

test("points go by age and then oldest first", (t) => {
  const store = open(t);
  const add = (id, days) =>
    point(store, {
      id,
      name: "avoozl.tokens",
      kind: "sum",
      value: 1,
      at: ago(days),
    });
  add("old", 100);
  for (let i = 0; i < 12; i++) add(`p${i}`, 40 - i);
  pruneTelemetry(store.db, { limits: small, now: NOW });
  const left = store.db
    .prepare("SELECT id FROM telemetry_points ORDER BY at")
    .all()
    .map((row) => row.id);
  assert.equal(left.length, 9);
  assert.equal(left[0], "p3");
  assert.ok(!left.includes("old"));
});

test("pruning runs after the write count and gap, and never inside a transaction", (t) => {
  let clock = NOW;
  const store = open(t, {
    limits: { ...LIMITS, everyWrites: 2, everyMs: 1000 },
    clock: () => clock,
  });
  const add = (id, days) =>
    point(store, {
      id,
      name: "avoozl.tokens",
      kind: "sum",
      value: 1,
      at: ago(days),
    });
  add("a", 100);
  add("b", 100);
  // Too soon after the open: nothing runs.
  assert.equal(count(store, "telemetry_points"), 2);
  clock += 2000;
  store.transaction(() => {
    add("c", 100);
    add("d", 100);
    assert.equal(count(store, "telemetry_points"), 4);
  });
  assert.equal(count(store, "telemetry_points"), 4);
  add("e", 1);
  assert.deepEqual(
    store.db
      .prepare("SELECT id FROM telemetry_points")
      .all()
      .map((row) => row.id),
    ["e"],
  );
});
