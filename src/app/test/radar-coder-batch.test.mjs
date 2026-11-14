// rc-2.3: the batch planner for small ready tasks (RC2.5, design D4.2).
import assert from "node:assert/strict";
import test from "node:test";
import { planProjectionBatches } from "../radar-coder-batch.mjs";
import { flowPolicy } from "../flow.mjs";

const t = (id, extra = {}) => ({
  id,
  kind: "leaf",
  status: "planned",
  size: "small",
  repository: "app",
  planId: "p",
  phase: { id: "1" },
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

test("the cap is 3 by default and 5 at most; above 5 is refused", () => {
  assert.deepEqual(ids(planProjectionBatches({ tasks: many(7) })), [
    ["t1", "t2", "t3"],
    ["t4", "t5", "t6"],
  ]);
  const five = planProjectionBatches({ tasks: many(11), max: 5 });
  assert.deepEqual(
    ids(five).map((b) => b.length),
    [5, 5],
  );
  assert.deepEqual(five.plain, ["t11"]);
  assert.throws(
    () => planProjectionBatches({ tasks: many(7), max: 6 }),
    /flow\.batch\.max must be a whole number 1–5/,
  );
  assert.throws(
    () => flowPolicy({ flow: { batch: { max: 6 } } }),
    /flow\.batch\.max must be a whole number 1–5/,
  );
  assert.throws(() => planProjectionBatches({ tasks: many(3), max: 0 }));
  assert.equal(
    ids(planProjectionBatches({ tasks: many(3), max: 1 })).length,
    0,
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
  // cap + 1 leaves a single leftover, which stays plain.
  const four = planProjectionBatches({ tasks: many(4) });
  assert.deepEqual(ids(four), [["t1", "t2", "t3"]]);
  assert.deepEqual(four.plain, ["t4"]);
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

test("nearby inputs: empty, mixed phases and repositories, human, size, done", () => {
  assert.deepEqual(planProjectionBatches({ tasks: [] }).batches, []);
  const mixed = planProjectionBatches({
    tasks: [
      t("a"),
      t("b", { phase: { id: "2" } }),
      t("c", { repository: "other" }),
      t("d"),
    ],
  });
  assert.deepEqual(ids(mixed), [["a", "d"]]);
  assert.deepEqual(mixed.plain, ["b", "c"]);
  const human = planProjectionBatches({
    tasks: [
      t("a"),
      t("b", { completion: "person" }),
      t("c", { manual: true }),
      t("d"),
    ],
  });
  assert.deepEqual(ids(human), [["a", "d"]]);
  const sizes = planProjectionBatches({
    tasks: [t("a"), t("b", { size: "large" }), t("c", { size: undefined })],
  });
  assert.deepEqual(sizes.batches, []);
  const finished = planProjectionBatches({
    tasks: [t("a", { status: "done" }), t("b"), t("c")],
  });
  assert.deepEqual(ids(finished), [["b", "c"]]);
  assert.ok(!finished.plain.includes("a"));
  const files = planProjectionBatches({
    tasks: [
      t("a", { paths: ["x.js"] }),
      t("b", { paths: ["y.js"] }),
      t("c", { paths: ["x.js", "z.js"] }),
    ],
    by: "files",
  });
  assert.deepEqual(ids(files), [["a", "c"]]);
});
