import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../../test/fixtures.mjs";
import { flowView, syncSpans, listSpans } from "../flow.mjs";
import {
  ingestUsage,
  listUsage,
  usageView,
  observeUsage,
} from "../flow-usage.mjs";
import { syncPlanningSpans, planningFlowView } from "../planning-flow.mjs";

function setup(t) {
  const { store } = fixture(t);
  store.put("plans", { id: "p", spec: "synthetic", state: "draft", hash: "h" });
  store.put("review_rounds", {
    id: "sample-task",
    planId: "p",
    spec: "synthetic",
    state: "done",
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T00:01:00Z",
    commits: { app: "a".repeat(40) },
  });
  for (const [slot, role] of [
    ["review", "plan-review"],
    ["answer", "plan-answer"],
  ])
    store.put("session_bindings", {
      id: slot,
      slot,
      taskId: "sample-task",
      source: "tick",
      role,
      boundAt: "2026-01-01T00:00:00Z",
      model: "fake-requested",
      served: { model: "fake-served" },
      status: "idle",
    });
  store.put("receipts", {
    id: "plan-answer:sample-task",
    state: "done",
    endedAt: "2026-01-01T00:02:00Z",
  });
  return store;
}
const turns = [
  {
    ts: "2026-01-01T00:00:30Z",
    model: "fake-served",
    input: 10,
    output: 5,
    credits: 2,
  },
];
test("planning usage and spans cannot affect task metrics even with colliding IDs", async (t) => {
  const store = setup(t),
    data = store.read(),
    baseline = flowView(store, data),
    taskUsage = usageView(store, data);
  assert.equal(
    ingestUsage(store, store.get("session_bindings", "review"), turns),
    1,
  );
  assert.equal(
    ingestUsage(store, store.get("session_bindings", "review"), turns),
    0,
  );
  const observed = await observeUsage(store, async () => turns);
  assert.equal(observed.rows, 1);
  syncSpans(store);
  syncSpans(store);
  assert.deepEqual(listUsage(store), []);
  assert.deepEqual(listSpans(store), []);
  assert.deepEqual(usageView(store, data).total, taskUsage.total);
  assert.deepEqual(flowView(store, data).metrics, baseline.metrics);
  const [planning] = planningFlowView(
    store,
    {},
    { now: Date.parse("2026-01-01T01:00:00Z") },
  );
  assert.equal(planning.spec, "synthetic");
  assert.equal(planning.durationMs, 180000);
  assert.equal(planning.usage.turns, 2);
  assert.equal(planning.usage.input, 20);
  assert.deepEqual(
    planning.roles.map((r) => [r.role, r.model, r.durationMs]),
    [
      ["plan-review", "fake-served", 60000],
      ["plan-answer", "fake-served", 120000],
    ],
  );
  assert.equal(
    store.db.prepare("SELECT count(*) AS n FROM planning_spans").get().n,
    2,
  );
  assert.deepEqual(planningFlowView(store, { plan: "other" }), []);
  assert.deepEqual(planningFlowView(store, { repository: "other" }), []);
});
test("legacy planning usage is preserved by spec and excluded from task reads before and after migration", (t) => {
  const store = setup(t);
  store.db
    .prepare(
      "INSERT INTO flow_usage(id,slot,task_id,role,ts,model,input,output,credits) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "review@" + turns[0].ts,
      "review",
      "sample-task",
      "plan-review",
      turns[0].ts,
      "fake-served",
      10,
      5,
      2,
    );
  store.db
    .prepare(
      "INSERT INTO flow_usage(id,slot,task_id,role,ts,model,input,output,credits) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "orphan",
      "missing",
      "sample-task",
      "plan-answer",
      turns[0].ts,
      "fake-served",
      1000,
      5,
      2,
    );
  assert.deepEqual(listUsage(store), []);
  assert.equal(planningFlowView(store)[0].usage.input, 10);
  syncPlanningSpans(store);
  syncPlanningSpans(store);
  assert.equal(
    store.db.prepare("SELECT count(*) AS n FROM planning_usage").get().n,
    1,
  );
  assert.equal(
    store.db.prepare("SELECT count(*) AS n FROM flow_usage").get().n,
    1,
    "unattributable legacy evidence is retained",
  );
  assert.deepEqual(listUsage(store), []);
  assert.equal(planningFlowView(store)[0].usage.input, 10);
});
