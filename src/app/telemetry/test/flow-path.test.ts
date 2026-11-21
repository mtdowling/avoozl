// ot-2.1 to ot-2.3: Flow writes and reads timing through the recording API
// (OT1.1, OT1.3, OT1.7, OT3, OT8.6, OT8.7).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { gatewayUsageTurns } from "../../executors/kirocrew.ts";
import { listSpans, putStop, syncSpans, taskTiming } from "../../flow/flow.ts";
import { Store } from "../../store/store.ts";
import { seedSpan, snapshot } from "../../test/fixtures.ts";
import { recordUsage } from "../usage.ts";
import type { Task } from "../../../types.ts";

const at = (m: number) =>
  new Date(Date.parse("2026-11-12T10:00:00Z") + m * 60_000).toISOString();

function open(t: TestContext, tasks: Task[] = []) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  store.initialize({ ...snapshot(), tasks: [...snapshot().tasks, ...tasks] });
  return store;
}
const rows = (store: Store, table: string, where = "1") =>
  store.db.prepare(`SELECT * FROM ${table} WHERE ${where}`).all();

test("no source file writes a span or usage table of its own", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (
        /\.(mjs|ts)$/.test(entry.name) &&
        full !== import.meta.filename
      ) {
        // The store's list of tables an old database drops is the one place
        // the old names stay.
        const text = fs
          .readFileSync(full, "utf8")
          .replace(/const DROPPED_TABLES = \[[^\]]*\]/s, "");
        if (
          /\bputSpan\b|\bdeleteSpan\b|\bflow_spans\b|\bflow_usage\b/.test(text)
        )
          hits.push(path.relative(root, full));
      }
    }
  };
  walk(root);
  assert.deepEqual(hits, []);
});

test("Flow's spans live in telemetry_spans and read back in Flow's shape", (t) => {
  const store = open(t, [
    {
      id: "a",
      title: "A",
      kind: "leaf",
      status: "accepted",
      repository: "app",
      planId: "acme-cache",
      tags: [],
      acceptance: ["x"],
      track: "catalog",
      scope: "catalog",
    },
  ]);
  seedSpan(store, "q", "a", 1, null, "queued", at(0), at(10), "events", null);
  seedSpan(
    store,
    "c",
    "a",
    1,
    "worker",
    "coding",
    at(10),
    at(40),
    "tool-calls",
    "npm test",
  );
  const [row] = rows(store, "telemetry_spans", "key='c'");
  assert.equal(row.repo, "app");
  assert.equal(row.spec, "acme-cache");
  assert.equal(row.name, "avoozl.stage.coding");
  assert.deepEqual(
    listSpans(store, { taskId: "a" }).map((s) => [
      s.id,
      s.stage,
      s.role,
      s.detail,
    ]),
    [
      ["q", "queued", null, null],
      ["c", "coding", "worker", "npm test"],
    ],
  );
});

test("Flow's pass records each finished task's root once, with its first-pass result", (t) => {
  const finished = (id: string, extra: Partial<Task> = {}): Task => ({
    id,
    title: id,
    kind: "leaf",
    status: "accepted",
    repository: "app",
    planId: "acme-cache",
    tags: [],
    acceptance: ["x"],
    track: "catalog",
    scope: "catalog",
    integration: { at: at(60) },
    ...extra,
  });
  const store = open(t, [
    finished("a"),
    finished("b"),
    finished("m", {
      manual: true,
      integration: undefined,
      manualDone: { at: at(50), choice: "done" },
    }),
    finished("none"),
  ]);
  seedSpan(
    store,
    "a1",
    "a",
    1,
    "worker",
    "coding",
    at(0),
    at(30),
    "events",
    null,
  );
  seedSpan(
    store,
    "b1",
    "b",
    1,
    "worker",
    "coding",
    at(0),
    at(20),
    "events",
    null,
  );
  seedSpan(
    store,
    "b2",
    "b",
    2,
    "worker",
    "rework",
    at(20),
    at(40),
    "events",
    null,
  );
  seedSpan(
    store,
    "m1",
    "m",
    null,
    "person",
    "waiting",
    at(0),
    at(50),
    "events",
    null,
  );
  syncSpans(store, { now: Date.parse(at(70)) });
  syncSpans(store, { now: Date.parse(at(80)) });
  const roots = Object.fromEntries(
    rows(store, "telemetry_spans", "parent_span_id IS NULL").map((r) => [
      r.task_id,
      r,
    ]),
  );
  assert.deepEqual(Object.keys(roots).sort(), ["a", "b", "m"]);
  assert.equal(roots.a.first_pass, 1);
  assert.equal(roots.b.first_pass, 0);
  assert.equal(roots.b.attempts, 2);
  assert.equal(roots.m.outcome, "done");
  assert.equal(roots.m.first_pass, null);
  assert.equal(roots.a.ended_at, at(60));
  assert.equal(
    rows(store, "telemetry_points", "name='avoozl.tasks.finished'").length,
    3,
  );
  // Flow's timing reads the same spans.
  assert.equal(
    taskTiming(store, { id: "a", integration: { at: at(60) } }).leadMs,
    60 * 60_000,
  );
});

test("a turn read twice records once, and takes the stage that holds its time", (t) => {
  const store = open(t);
  seedSpan(
    store,
    "c",
    "sample-task",
    1,
    "worker",
    "coding",
    at(0),
    at(30),
    "events",
    null,
  );
  const binding = {
    slot: "avoozl_w1",
    taskId: "sample-task",
    attempt: 1,
    role: "worker",
  };
  const turns = [
    {
      ts: at(5),
      input: 100,
      output: 20,
      credits: 0.5,
      model: "model-x",
      text: "CANARY",
    },
    { ts: at(45), input: 10, output: 0, credits: 0 },
  ];
  assert.equal(
    recordUsage(store, binding, turns, { repo: "app", spec: "acme-cache" }),
    4,
  );
  assert.equal(
    recordUsage(store, binding, turns, { repo: "app", spec: "acme-cache" }),
    0,
  );
  const points = rows(store, "telemetry_points");
  assert.deepEqual(
    points.map((p) => [p.id, p.stage, p.value, p.model]).sort(),
    [
      [`avoozl_w1@${at(5)}:avoozl.credits`, "coding", 0.5, "model-x"],
      [`avoozl_w1@${at(5)}:avoozl.tokens:input`, "coding", 100, "model-x"],
      [`avoozl_w1@${at(5)}:avoozl.tokens:output`, "coding", 20, "model-x"],
      [`avoozl_w1@${at(45)}:avoozl.tokens:input`, "unattributed", 10, null],
    ],
  );
  assert.ok(!JSON.stringify(points).includes("CANARY"));
  assert.equal(recordUsage(store, binding, [], {}), 0);
});

test("with no usage call there is no reader and no point", () => {
  assert.equal(gatewayUsageTurns({}), null);
});

test("a stop and its resume give one pulled and one resumed point, with no check or reason", (t) => {
  const store = open(t);
  const stop = {
    id: "stop:app:1",
    repositoryId: "app",
    check: "npm test",
    reason: "CANARY-REASON",
    scope: "dependents",
    openedAt: at(0),
    closedAt: null,
  };
  putStop(store, stop);
  putStop(store, { ...stop, runAnyway: { by: "x", at: at(1) } });
  putStop(store, { ...stop, closedAt: at(5) });
  putStop(store, { ...stop, closedAt: at(5) });
  putStop(store, {
    id: "stop:pulled:2",
    manual: true,
    scope: "all",
    openedAt: at(6),
    closedAt: null,
  });
  const points = rows(store, "telemetry_points").map((p) => [
    p.id,
    p.at,
    JSON.parse(String(p.attrs)),
  ]);
  assert.deepEqual(points, [
    [
      "stop:app:1:pulled",
      at(0),
      { scope: "dependents", kind: "check", event: "pulled" },
    ],
    [
      "stop:app:1:resumed",
      at(5),
      { scope: "dependents", kind: "check", event: "resumed" },
    ],
    [
      "stop:pulled:2:pulled",
      at(6),
      { scope: "all", kind: "manual", event: "pulled" },
    ],
  ]);
  assert.ok(
    !JSON.stringify(rows(store, "telemetry_points")).includes("CANARY"),
  );
  assert.ok(
    !JSON.stringify(rows(store, "telemetry_points")).includes("npm test"),
  );
  assert.equal(store.get("flow_stops", "stop:app:1")?.closedAt, at(5));
});
