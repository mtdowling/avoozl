// rc-2.3, changed by avoozl 61.1 (R108.11): projection suggests the
// planner's batch groups whose tasks are open and unblocked (RC2.5, D4.2).
import assert from "node:assert/strict";
import test from "node:test";
import {
  planProjectionBatches,
  resolveBatchGroups,
} from "../radar-coder-batch.mjs";

const t = (id, extra = {}) => ({
  id,
  kind: "leaf",
  status: "planned",
  repository: "app",
  planId: "p",
  phase: { id: "1" },
  batch: { id: "g", tasks: [], reason: "Small edits" },
  ...extra,
});
const many = (n, extra = {}) =>
  Array.from({ length: n }, (_, i) => t(`t${i + 1}`, extra));
const ids = (plan) => plan.batches.map((b) => b.tasks);

test("blocked tasks never batch", () => {
  const tasks = [...many(3), t("b", { status: "planned" })];
  const edges = [{ from: "t1", to: "b", kind: "requires" }];
  const plan = planProjectionBatches({ tasks, edges });
  assert.ok(!ids(plan).flat().includes("b"));
  assert.ok(plan.plain.includes("b"));
  // A sequence edge blocks too; a blocker that is done does not; an unknown
  // blocker is treated as open.
  const seq = planProjectionBatches({
    tasks: [t("a"), t("b"), t("c")],
    edges: [{ from: "a", to: "b", kind: "sequence" }],
  });
  assert.ok(!ids(seq).flat().includes("b"));
  const done = planProjectionBatches({
    tasks: [t("a", { status: "done" }), t("b"), t("c")],
    edges: [{ from: "a", to: "b", kind: "requires" }],
  });
  assert.deepEqual(ids(done), [["b", "c"]]);
  const unknown = planProjectionBatches({
    tasks: [t("b"), t("c")],
    edges: [{ from: "gone", to: "b", kind: "requires" }],
  });
  assert.deepEqual(ids(unknown), []);
});

test("the planner's groups are the batches, with their reason, with no size cap", () => {
  const plan = planProjectionBatches({
    tasks: [
      t("a", { batch: { id: "g1", tasks: [], reason: "Docs" } }),
      t("b", { batch: { id: "g2", tasks: [], reason: "Tests" } }),
      t("c", { batch: { id: "g1", tasks: [], reason: "Docs" } }),
      t("d", { batch: { id: "g2", tasks: [], reason: "Tests" } }),
    ],
  });
  assert.deepEqual(
    plan.batches.map((b) => [b.key, b.reason, b.tasks]),
    [
      ["g1", "Docs", ["a", "c"]],
      ["g2", "Tests", ["b", "d"]],
    ],
  );
  const twelve = planProjectionBatches({ tasks: many(12) });
  assert.deepEqual(ids(twelve), [
    Array.from({ length: 12 }, (_, i) => `t${i + 1}`),
  ]);
  assert.deepEqual(
    resolveBatchGroups({ tasks: many(12), requested: [ids(twelve)[0]] }),
    ids(twelve),
  );
});

test("an edge between two tasks splits them", () => {
  const plan = planProjectionBatches({
    tasks: many(3),
    edges: [{ from: "t1", to: "t2", kind: "supports" }],
  });
  assert.deepEqual(ids(plan), [["t1", "t3"]]);
  assert.deepEqual(plan.plain, ["t2"]);
});

test("a batch of one stays plain", () => {
  const plan = planProjectionBatches({ tasks: many(1) });
  assert.deepEqual(plan.batches, []);
  assert.deepEqual(plan.plain, ["t1"]);
});

test("modes: Off proposes nothing, Suggest proposes, Auto applies", () => {
  const off = planProjectionBatches({ tasks: many(3), mode: "off" });
  assert.deepEqual(off.batches, []);
  assert.equal(off.plain.length, 3);
  const suggest = planProjectionBatches({ tasks: many(3) });
  assert.equal(suggest.mode, "suggest");
  assert.equal(suggest.applied, false);
  const auto = planProjectionBatches({ tasks: many(3), mode: "auto" });
  assert.equal(auto.applied, true);
  assert.deepEqual(ids(auto), [["t1", "t2", "t3"]]);
  assert.throws(() => planProjectionBatches({ tasks: [], mode: "maybe" }));
});

test("nearby inputs: empty, other plans, human, ungrouped, old size, done", () => {
  assert.deepEqual(planProjectionBatches({ tasks: [] }).batches, []);
  const mixed = planProjectionBatches({
    tasks: [t("a"), t("b", { planId: "q" }), t("d")],
  });
  assert.deepEqual(ids(mixed), [["a", "d"]]);
  assert.deepEqual(mixed.plain, ["b"]);
  const human = planProjectionBatches({
    tasks: [
      t("a"),
      t("b", { completion: "person" }),
      t("c", { completion: "human" }),
      t("d"),
    ],
  });
  assert.deepEqual(ids(human), [["a", "d"]]);
  // Only the planner groups: an ungrouped task, or one with an old `size`
  // tag, never batches.
  const ungrouped = planProjectionBatches({
    tasks: [
      t("a", { batch: undefined }),
      t("b", { batch: undefined, size: "small" }),
      t("c", { batch: undefined, size: "small" }),
    ],
  });
  assert.deepEqual(ungrouped.batches, []);
  const finished = planProjectionBatches({
    tasks: [t("a", { status: "done" }), t("b"), t("c")],
  });
  assert.deepEqual(ids(finished), [["b", "c"]]);
  assert.ok(!finished.plain.includes("a"));
});
