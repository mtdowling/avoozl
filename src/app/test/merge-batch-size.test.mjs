// The merge batch size limit (mb-1.1): the D2 rule, the setting and the
// store round trip.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Store } from "../store.mjs";
import {
  afterBatch,
  ceiling,
  emptySize,
  failureRate,
  recordBatch,
  sizeLimit,
  sizeRecord,
} from "../merge-batch-size.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const landedAll = (record, n, waiting) =>
  afterBatch(record, { landed: n, held: n, waiting });

test("the limit starts at 1 and grows by one only when more members waited", () => {
  let record = emptySize();
  assert.equal(record.limit, 1);
  record = landedAll(record, 1, 1);
  assert.equal(record.limit, 1, "nobody else waited");
  record = landedAll(record, 1, 5);
  assert.equal(record.limit, 2);
  record = landedAll(record, 2, 6);
  assert.equal(record.limit, 3);
});

test("a culprit halves the limit, rounding down, and the floor is 1", () => {
  let record = { ...emptySize(), limit: 7 };
  record = afterBatch(record, { landed: 3, culprits: 1, held: 4, waiting: 9 });
  assert.equal(record.limit, 3);
  record = afterBatch(record, { culprits: 1, held: 1, waiting: 1 });
  assert.equal(record.limit, 1);
  record = afterBatch(record, { culprits: 1, held: 1, waiting: 1 });
  assert.equal(record.limit, 1);
});

test("the ceiling follows the measured failure rate, 10% assumed below 5 results", () => {
  assert.equal(failureRate(["culprit", "culprit"]), 0.1);
  assert.equal(ceiling([]), 7);
  const rate = (culprits, landed) => [
    ...Array(culprits).fill("culprit"),
    ...Array(landed).fill("landed"),
  ];
  assert.equal(ceiling(rate(1, 19)), 14, "5% gives 14");
  assert.equal(ceiling(rate(4, 16)), 3, "20% gives 3");
  assert.equal(ceiling(rate(0, 20)), 16, "no failures stops at 16");
  assert.equal(ceiling(rate(10, 10)), 1, "never below 1");
  // The limit never rises above the ceiling.
  const high = { limit: 9, results: rate(10, 10), alone: [] };
  assert.equal(afterBatch(high, { held: 0, waiting: 0 }).limit, 1);
});

test("only the last 20 results count", () => {
  let record = emptySize();
  for (let i = 0; i < 30; i += 1)
    record = afterBatch(record, { landed: 1, held: 1, waiting: 1 });
  assert.equal(record.results.length, 20);
});

test("a number in landing.mergeBatch replaces the limit, and 1 keeps batches to one", () => {
  const record = { ...emptySize(), limit: 6 };
  assert.equal(sizeLimit(record, "auto"), 6);
  assert.equal(sizeLimit(record), 6);
  assert.equal(sizeLimit(record, 3), 3);
  assert.equal(sizeLimit(record, 1), 1);
});

test("the record survives a restart, and a culprit stays alone until it lands", (t) => {
  const file = path.join(temporaryDirectory("avoozl-size-"), "w.sqlite"),
    Q = { projectId: "app", base: "main" };
  let store = new Store(file);
  assert.deepEqual(sizeRecord(store, Q), emptySize());
  recordBatch(store, Q, { landed: ["a", "b"], held: 2, waiting: 4 });
  recordBatch(store, Q, {
    landed: ["c"],
    culprits: ["d"],
    held: 2,
    waiting: 2,
  });
  store.close();
  store = new Store(file);
  t.after(() => store.close());
  const record = sizeRecord(store, Q);
  assert.equal(record.limit, 1);
  assert.deepEqual(record.alone, ["d"]);
  assert.deepEqual(record.results, ["landed", "landed", "landed", "culprit"]);
  recordBatch(store, Q, { landed: ["d"], held: 1, waiting: 1 });
  assert.deepEqual(sizeRecord(store, Q).alone, []);
  // Another base has its own record.
  assert.deepEqual(sizeRecord(store, { ...Q, base: "dev" }), emptySize());
});

test("landing.mergeBatch is auto or a whole number from 1 to 16", () => {
  const policy = (mergeBatch) =>
    normalizeGitHubPolicy({
      repositories: {
        "acme/app": {
          baseBranch: "main",
          landing: { mode: "direct", mergeBatch },
        },
      },
    });
  assert.equal(
    policy("auto").repositories["acme/app"].landing.mergeBatch,
    "auto",
  );
  assert.equal(policy(4).repositories["acme/app"].landing.mergeBatch, 4);
  assert.equal(
    policy(undefined).repositories["acme/app"].landing.mergeBatch,
    null,
  );
  for (const bad of [0, 17, 1.5, "big", true])
    assert.throws(() => policy(bad), /mergeBatch/);
});
