// Tracker gates, the node (RC23.1 to RC23.3): lint and approval refuse a bad
// gate by task, release holds a dependent while the gate is open, and no
// coder, batch or ready label ever takes a gate.
import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { readyCandidates } from "../delivery.mjs";
import { gateLine } from "../github-projection.mjs";
import { planProjectionBatches } from "../radar-coder-batch.mjs";
import {
  completionReached,
  isGate,
  taskCompletion,
} from "../../work-model.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const ours = (tasks) =>
  tasks.map((task) => task.id).filter((id) => id.startsWith("sdk."));
const manifest = (tasks) => JSON.stringify({ tasks }, null, 2) + "\n";
const TASKS = [
  "# Tasks",
  "",
  "- [ ] 1 Build the client",
  "- [ ] 2 Wait for the review to ship",
  "- [ ] 3 Cut over",
  "",
].join("\n");
const leaf = (extra = {}) => ({
  kind: "leaf",
  repository: "code",
  acceptance: ["It works for a caller"],
  checks: ["npm test"],
  completion: "integrated",
  ...extra,
});
const GATE = {
  kind: "leaf",
  repository: "code",
  acceptance: ["The review shipped to the live release"],
  completion: "tracker",
  tracker: {
    plugin: "fake-gate",
    item: "REV-1",
    done: "the review shipped to the live release",
  },
  requires: ["1"],
};

function workspace(t, gate = GATE, { plugins = ["fake-gate"] } = {}) {
  const { root, store } = fixture(t);
  store.put("projects", {
    id: "code",
    root: temporaryDirectory(),
    baseBranch: "main",
    checks: ["npm test"],
  });
  writeSpec(root, "sdk", {
    "tasks.md": TASKS,
    "avoozl/manifest.json": manifest({
      1: leaf(),
      2: gate,
      3: leaf({ requires: ["2"] }),
    }),
  });
  const ops = new Operations(store, { workspaceRoot: root });
  // No gate plugin part exists until rc-22.2; the test names the ids.
  ops.gatePluginIds = () => plugins;
  return { root, store, ops };
}

const errors = async (ops) =>
  (await ops.execute("plan.lint", { id: "sdk" })).diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => [d.code, d.message, d.taskId]);

async function approve(ops) {
  const plan = await ops.execute("plan.create", { spec: "sdk" }),
    preview = await ops.execute("plan.preview", { id: "sdk" });
  return ops.execute("plan.approve", {
    id: "sdk",
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
}

test("a good gate lints clean", async (t) => {
  const { ops } = workspace(t);
  await ops.execute("plan.create", { spec: "sdk" });
  assert.deepEqual(await errors(ops), []);
});

test("each bad gate is refused at lint, naming the task", async (t) => {
  const bad = [
    ["missing plugin", { tracker: { item: "R", done: "d" } }, /"plugin"/],
    ["missing item", { tracker: { plugin: "fake-gate", done: "d" } }, /"item"/],
    [
      "empty done",
      { tracker: { plugin: "fake-gate", item: "R", done: "  " } },
      /"done"/,
    ],
    [
      "unknown plugin",
      { tracker: { plugin: "nope", item: "R", done: "d" } },
      /nope/,
    ],
    ["no reference", { tracker: undefined }, /needs "tracker"/],
    [
      "extra part",
      { tracker: { plugin: "fake-gate", item: "R", done: "d", token: "x" } },
      /"token"/,
    ],
    ["agent field", { checks: ["npm test"] }, /"checks"/],
    ["manual too", { manual: true }, /./],
  ];
  for (const [name, patch, pattern] of bad) {
    const { ops } = workspace(t, { ...GATE, ...patch });
    await ops.execute("plan.create", { spec: "sdk" });
    const found = await errors(ops);
    assert.ok(
      found.some(
        ([code, message, taskId]) =>
          /^spec\.(gate|manual)/.test(code) &&
          pattern.test(message) &&
          taskId === "sdk.2",
      ),
      `${name}: ${JSON.stringify(found)}`,
    );
  }
  // A tracker reference on a task that is not a gate.
  const { ops } = workspace(t, { ...GATE, completion: "integrated" });
  await ops.execute("plan.create", { spec: "sdk" });
  assert.ok((await errors(ops)).some(([code]) => code === "spec.gate-field"));
});

test("approval is refused while a gate is bad", async (t) => {
  const { ops } = workspace(t, {
    ...GATE,
    tracker: { plugin: "nope", item: "R", done: "d" },
  });
  await assert.rejects(approve(ops), /./);
});

test("a dependent is not released while the gate is open, failed or unknown", async (t) => {
  const { store, ops } = workspace(t);
  await approve(ops);
  store.mutate("finish 1", (data) => {
    data.tasks.find((task) => task.id === "sdk.1").status = "accepted";
  });
  // The gate itself is never ready, and neither is its dependent.
  assert.deepEqual(ours(readyCandidates(store)), []);
  const next = await ops.execute("runner.next", {});
  assert.deepEqual(ours(next.ready), []);
  assert.deepEqual(ours(next.waiting), ["sdk.2", "sdk.3"]);
  const gate = () => store.read().tasks.find((task) => task.id === "sdk.2");
  assert.equal(isGate(gate()), true);
  assert.equal(taskCompletion(gate()), "tracker");
  assert.deepEqual(gate().gate, GATE.tracker);
  for (const state of ["open", "failed", "unknown"]) {
    store.mutate("state", (data) => {
      data.tasks.find((task) => task.id === "sdk.2").gateVerdict = { state };
    });
    assert.deepEqual(ours(readyCandidates(store)), [], state);
  }
});

test("a done or cleared gate satisfies every level and releases its dependent", async (t) => {
  const { store, ops } = workspace(t);
  await approve(ops);
  store.mutate("finish 1", (data) => {
    data.tasks.find((task) => task.id === "sdk.1").status = "accepted";
  });
  for (const state of ["done", "order"]) {
    store.mutate("verdict", (data) => {
      data.tasks.find((task) => task.id === "sdk.2").gateVerdict = { state };
    });
    assert.deepEqual(ours(readyCandidates(store)), ["sdk.3"], state);
    const task = store.read().tasks.find((item) => item.id === "sdk.2");
    for (const level of ["merged-pr", "integrated", "released", undefined])
      assert.equal(
        completionReached(task, level, () => false),
        true,
      );
  }
});

test("a gate is never batched, never ready, and its issue says what it waits on", async (t) => {
  const { store, ops } = workspace(t);
  await approve(ops);
  const data = store.read(),
    gate = data.tasks.find((task) => task.id === "sdk.2"),
    small = (id, completion) => ({
      id,
      kind: "leaf",
      size: "small",
      completion,
      status: "ready",
    }),
    batches = planProjectionBatches({
      tasks: [
        small("a", "integrated"),
        small("g", "tracker"),
        small("c", "integrated"),
      ],
      mode: "auto",
    });
  assert.deepEqual(
    batches.batches.map((batch) => batch.tasks),
    [["a", "c"]],
  );
  assert.match(
    gateLine(gate),
    /fake-gate item REV-1\. Done when: the review shipped to the live release/,
  );
  // A gate with a ready label asked for in dispatch is still not ready.
  gate.dispatch = { ready: true };
  assert.equal(ours(readyCandidates(store, { data })).includes("sdk.2"), false);
});
