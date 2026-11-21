// ot-1.3: the recording API and the allowlist (OT1, OT9.1, OT9.3, OT9.4, OT13).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Store } from "../../store/store.ts";
import {
  dropSpan,
  exporters,
  finishTask,
  point,
  registerExporter,
  span,
  unregisterExporter,
} from "../record.mjs";

const stage = (extra = {}) => ({
  key: "a1:1:coding:2025-11-20T03:00:00.000Z",
  taskId: "a1",
  repo: "acme/app",
  spec: "acme-cache",
  stage: "coding",
  attempt: 1,
  startedAt: "2025-11-20T03:00:00.000Z",
  endedAt: "2025-11-20T03:10:00.000Z",
  ...extra,
});
const sample = (extra = {}) => ({
  id: "p1",
  name: "avoozl.tokens",
  kind: "sum",
  value: 1,
  at: "2025-11-20T03:04:00.000Z",
  ...extra,
});

function open(t) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  return store;
}
const rows = (store, table) => store.db.prepare(`SELECT * FROM ${table}`).all();

test("a field or a value outside the allowlist is refused and nothing is written", (t) => {
  const store = open(t);
  for (const [change, pattern] of [
    [{ title: "x" }, /title is not a field/],
    [{ stage: "dancing" }, /stage dancing/],
    [{ spec: "a b" }, /spec/],
    [{ spec: "a/b" }, /spec/],
    [{ repo: "x".repeat(129) }, /repo/],
    [{ role: "a\nb" }, /role/],
    [{ harness: "a\u0007b" }, /harness/],
    [{ detail: { a: 1 } }, /detail must be a string/],
    [{ attempt: "1" }, /attempt/],
    [{ startedAt: "yesterday" }, /startedAt/],
  ])
    assert.throws(() => span(store, stage(change)), pattern);
  for (const [change, pattern] of [
    [{ prompt: "x" }, /prompt is not a field/],
    [{ value: "1" }, /value/],
    [{ value: Number.NaN }, /value/],
    [{ kind: "gauge" }, /kind/],
    [{ model: "a b" }, /model/],
    [{ attrs: { branch: "main" } }, /attrs\.branch/],
    [{ attrs: { event: ["x"] } }, /attrs\.event/],
    [{ stage: "unknown-stage" }, /stage/],
  ])
    assert.throws(() => point(store, sample(change)), pattern);
  assert.equal(rows(store, "telemetry_spans").length, 0);
  assert.equal(rows(store, "telemetry_points").length, 0);
  assert.equal(point(store, sample({ stage: "unattributed" })), true);
});

test("an equal repeat reaches no other exporter, and a change does", (t) => {
  const store = open(t);
  const seen = [];
  registerExporter(store, {
    name: "fake",
    onSpan: (row) => seen.push(["span", row.key]),
    onPoint: (row) => seen.push(["point", row.id]),
  });
  span(store, stage());
  span(store, stage());
  point(store, sample());
  point(store, sample());
  span(store, stage({ endedAt: null }));
  assert.deepEqual(seen, [
    ["span", stage().key],
    ["point", "p1"],
    ["span", stage().key],
  ]);
});

test("a second exporter that throws or never returns does not stop a call", (t) => {
  const store = open(t);
  registerExporter(store, {
    name: "throws",
    onSpan() {
      throw Error("boom");
    },
    onPoint: () => new Promise(() => {}),
  });
  registerExporter(store, {
    name: "rejects",
    onPoint: () => Promise.reject(Error("late")),
  });
  assert.equal(span(store, stage()), true);
  assert.equal(point(store, sample()), true);
});

test("the SQLite exporter is first and cannot be unregistered", (t) => {
  const store = open(t);
  registerExporter(store, { name: "fake" });
  assert.deepEqual(
    exporters(store).map((e) => e.name),
    ["sqlite", "fake"],
  );
  unregisterExporter(store, "sqlite");
  assert.equal(exporters(store)[0].name, "sqlite");
  assert.throws(() => registerExporter(store, { name: "sqlite" }));
  unregisterExporter(store, "fake");
  assert.equal(exporters(store).length, 1);
});

test("a SQLite write failure throws to the caller", (t) => {
  const store = open(t);
  store.db.exec("ALTER TABLE telemetry_points RENAME TO moved_points");
  assert.throws(() => point(store, sample()), /telemetry_points/);
});

test("dropSpan removes a span by key", (t) => {
  const store = open(t);
  span(store, stage());
  assert.equal(dropSpan(store, stage().key), true);
  assert.equal(dropSpan(store, stage().key), false);
  assert.equal(rows(store, "telemetry_spans").length, 0);
});

test("finishTask records the root, the lead time, the stage times and one finished point once", (t) => {
  const store = open(t);
  span(store, stage());
  span(
    store,
    stage({
      key: "a1:1:tests:x",
      stage: "tests",
      startedAt: "2025-11-20T03:10:00.000Z",
      endedAt: "2025-11-20T03:15:00.000Z",
    }),
  );
  span(
    store,
    stage({
      key: "a1:2:coding:y",
      attempt: 2,
      startedAt: "2025-11-20T03:16:00.000Z",
      endedAt: null,
    }),
  );
  const done = {
    taskId: "a1",
    repo: "acme/app",
    spec: "acme-cache",
    finishedAt: "2025-11-20T03:30:00.000Z",
    outcome: "landed",
    firstPass: false,
  };
  assert.equal(finishTask(store, done), true);
  const root = rows(store, "telemetry_spans").find(
    (r) => r.name === "avoozl.task",
  );
  assert.equal(root.started_at, "2025-11-20T03:00:00.000Z");
  assert.equal(root.ended_at, done.finishedAt);
  assert.equal(root.outcome, "landed");
  assert.equal(root.first_pass, 0);
  assert.equal(root.attempts, 2);
  const points = Object.fromEntries(
    rows(store, "telemetry_points").map((r) => [
      r.id.split(":").slice(1).join(":"),
      r,
    ]),
  );
  assert.equal(points.lead_time.value, 1800);
  assert.equal(points["duration:coding"].value, 600);
  assert.equal(points["duration:tests"].value, 300);
  assert.equal(points.finished.value, 1);
  assert.equal(rows(store, "telemetry_points").length, 4);
  assert.equal(finishTask(store, done), false);
  assert.equal(rows(store, "telemetry_points").length, 4);
});

test("a manual task has outcome done and no first_pass", (t) => {
  const store = open(t);
  span(store, stage());
  finishTask(store, {
    taskId: "a1",
    repo: "acme/app",
    spec: "acme-cache",
    finishedAt: "2025-11-20T03:30:00.000Z",
    manual: true,
    firstPass: true,
  });
  const root = rows(store, "telemetry_spans").find(
    (r) => r.name === "avoozl.task",
  );
  assert.equal(root.outcome, "done");
  assert.equal(root.first_pass, null);
  const finished = rows(store, "telemetry_points").find(
    (r) => r.name === "avoozl.tasks.finished",
  );
  assert.deepEqual(JSON.parse(finished.attrs), { outcome: "done" });
});

test("the telemetry folder imports nothing from the flow folder", () => {
  const folder = path
    .dirname(fileURLToPath(import.meta.url))
    .replace(/test$/, "");
  for (const name of fs
    .readdirSync(folder)
    .filter((n) => /\.(mjs|ts)$/.test(n)))
    assert.doesNotMatch(
      fs.readFileSync(path.join(folder, name), "utf8"),
      /from\s+["'][^"']*\/flow\//,
      name,
    );
});
