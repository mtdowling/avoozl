// @ts-nocheck: typing debt
// ot-1.1: the local tables and the SQLite exporter (OT2.1, OT2.2, OT2.6).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Store } from "../../store/store.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { point, span } from "../record.ts";

const stage = (extra = {}) => ({
  key: "a1:1:coding:2025-11-20T03:00:00.000Z",
  taskId: "a1",
  repo: "acme/app",
  spec: "acme-cache",
  stage: "coding",
  role: "worker",
  attempt: 1,
  harness: "claude",
  source: "tool-calls",
  detail: "npm test",
  startedAt: "2025-11-20T03:00:00.000Z",
  endedAt: null,
  ...extra,
});
const sample = (extra = {}) => ({
  id: "slot-7@2025-11-20T03:04:00.000Z:input",
  name: "avoozl.tokens",
  kind: "sum",
  value: 18200,
  at: "2025-11-20T03:04:00.000Z",
  taskId: "a1",
  repo: "acme/app",
  spec: "acme-cache",
  stage: "coding",
  attrs: { direction: "input" },
  ...extra,
});

function open(t) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  return store;
}
const rows = (store, table) => store.db.prepare(`SELECT * FROM ${table}`).all();

test("a span upserts by key, and an equal repeat changes nothing", (t) => {
  const store = open(t);
  assert.equal(span(store, stage()), true);
  assert.equal(span(store, stage()), false);
  assert.equal(
    span(store, stage({ endedAt: "2025-11-20T03:10:00.000Z" })),
    true,
  );
  const [row, ...rest] = rows(store, "telemetry_spans");
  assert.equal(rest.length, 0);
  assert.equal(row.ended_at, "2025-11-20T03:10:00.000Z");
  assert.equal(row.name, "avoozl.stage.coding");
  assert.equal(row.detail, "npm test");
});

test("a point inserts by ID and ignores a repeat", (t) => {
  const store = open(t);
  assert.equal(point(store, sample()), true);
  assert.equal(point(store, sample({ value: 1 })), false);
  const [row, ...rest] = rows(store, "telemetry_points");
  assert.equal(rest.length, 0);
  assert.equal(row.value, 18200);
  assert.deepEqual(JSON.parse(row.attrs), { direction: "input" });
});

test("a stage span's parent is set before its root exists", (t) => {
  const store = open(t);
  span(store, stage());
  const [row] = rows(store, "telemetry_spans");
  assert.match(row.parent_span_id, /^[0-9a-f]{16}$/);
  assert.notEqual(row.parent_span_id, row.span_id);
  assert.equal(
    rows(store, "telemetry_spans").some((r) => r.parent_span_id === null),
    false,
  );
});

test("a database made again holds both tables empty", (t) => {
  const directory = temporaryDirectory("avoozl-telemetry-");
  const file = path.join(directory, "workspace.sqlite");
  const first = new Store(file);
  span(first, stage());
  point(first, sample());
  first.close();
  for (const name of fs.readdirSync(directory))
    fs.rmSync(path.join(directory, name));
  const second = new Store(file);
  t.after(() => second.close());
  assert.deepEqual(rows(second, "telemetry_spans"), []);
  assert.deepEqual(rows(second, "telemetry_points"), []);
});
