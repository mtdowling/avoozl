// The Switch model dialog's dry run (design §4.20, R72.12): which running
// chats switch, which cannot and why, what Also new tasks marks and moves,
// and that Switch runs exactly the dry run's set or refuses a changed one.
import assert from "node:assert/strict";
import test from "node:test";
import { Store } from "../store.mjs";
import {
  healthContext,
  listSwitches,
  queueSwitch,
  switchDryRun,
} from "../provider-health.mjs";

const bind = (slot, taskId, model, extra = {}) => ({
  id: slot,
  slot,
  taskId,
  role: "worker",
  attempt: 1,
  source: "tick",
  status: "busy",
  boundAt: "2026-11-13T00:00:00.000Z",
  ...(model ? { model } : {}),
  ...extra,
});

function setup() {
  const store = new Store(":memory:");
  for (const b of [
    bind("s1", "t1", "alpha-1"),
    bind("s2", "t2", "alpha-2"),
    bind("s3", "t3", "alpha-1", { crew: "remote-1" }),
    bind("s4", "t4", "alpha-1", { source: "conductor" }),
    bind("s5", "t5", "alpha-1"),
    bind("s6", "t6", "beta-1"),
    bind("s7", "t7", "alpha-1", { report: { kind: "done" } }),
    // t6's reviewer: distinctFrom model, and the writer ran on gamma-1.
    bind("s8", "t8", "alpha-1", { role: "review:correctness" }),
    bind("s9", "t8", "gamma-1", { report: { kind: "done" } }),
  ])
    store.put("session_bindings", b);
  const tasks = new Map(
    ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "q1", "q2", "r1"].map(
      (id) => [id, { id, title: `Task ${id}`, planId: "spec-a" }],
    ),
  );
  tasks.get("t5").session = { model: "alpha-1" };
  const options = {
    settings: {},
    tasks,
    radar: (task) => task?.id === "r1",
    reviewRoles: (b) =>
      b.role === "review:correctness"
        ? [{ id: "correctness", distinctFrom: "model", model: "delta-1" }]
        : [],
    ready: [
      { taskId: "q1", model: "alpha-1" },
      { taskId: "q2", model: "beta-1" },
    ],
  };
  return { store, options };
}

test("the dry run lists who switches, who cannot and why, and writes nothing", () => {
  const { store, options } = setup();
  const dry = switchDryRun(
    store,
    { from: { provider: "alpha" }, to: "gamma-1", alsoNewTasks: true },
    options,
  );
  assert.deepEqual(
    dry.chats.map((c) => [c.slot, c.model, c.to, c.where, c.spec]),
    [
      ["s1", "alpha-1", "gamma-1", "local", "spec-a"],
      ["s2", "alpha-2", "gamma-1", "local", "spec-a"],
    ],
  );
  const why = Object.fromEntries(dry.skipped.map((c) => [c.taskId, c.why]));
  assert.match(why.t3, /remote crew remote-1/);
  assert.match(why.t4, /Crew Mode/);
  assert.match(why.t5, /spec pins alpha-1/);
  assert.match(why.t8, /distinctFrom: model reviewer/);
  assert.equal(why.t7, undefined, "a finished chat is not listed");
  assert.deepEqual(dry.marks, [
    { scope: "provider", name: "alpha", to: "gamma-1" },
  ]);
  assert.deepEqual(
    dry.queued.map((q) => q.taskId),
    ["q1"],
  );
  assert.deepEqual(dry.counts, { switch: 2, cannot: 4, queued: 1 });
  assert.equal(listSwitches(store).length, 0);
  assert.equal(healthContext(store, { settings: {} }).empty, true);
});

test("chosen tasks without an Avoozl chat say why; auto is a target", () => {
  const { store, options } = setup();
  const dry = switchDryRun(
    store,
    { from: { tasks: ["t1", "r1", "q2"] }, to: "auto" },
    options,
  );
  assert.deepEqual(
    dry.chats.map((c) => [c.slot, c.to]),
    [["s1", "auto"]],
  );
  const why = Object.fromEntries(dry.skipped.map((c) => [c.taskId, c.why]));
  assert.equal(why.r1, "Issue Radar codes this task");
  assert.equal(why.q2, "no running chat");
  assert.deepEqual(dry.marks, []);
  assert.deepEqual(dry.queued, []);
  // An unread ready list is null, not an empty list.
  assert.equal(
    switchDryRun(
      store,
      { from: { model: "beta-1" }, to: "auto", alsoNewTasks: true },
      { ...options, ready: null },
    ).queued,
    null,
  );
});

test("Switch runs exactly the dry run's set and refuses one that changed", () => {
  const { store, options } = setup();
  const input = { from: { model: "alpha-1" }, to: "gamma-1" };
  const dry = switchDryRun(store, input, options);
  // A new chat joins after the dry run: the old hash is refused.
  store.put("session_bindings", bind("s10", "t9", "alpha-1"));
  assert.throws(
    () =>
      queueSwitch(store, { ...input, previewHash: dry.previewHash }, options),
    (error) =>
      error.status === 409 && /changed since the dry run/.test(error.message),
  );
  assert.equal(
    listSwitches(store).length,
    0,
    "a refused switch writes nothing",
  );
  const again = switchDryRun(store, input, options);
  const result = queueSwitch(
    store,
    { ...input, previewHash: again.previewHash },
    options,
  );
  assert.deepEqual(
    result.switches.map((s) => s.slot).sort(),
    again.chats.map((c) => c.slot).sort(),
  );
  assert.ok(
    result.switches.every((s) => s.state === "pending" && s.to === "gamma-1"),
  );
  assert.deepEqual(result.marked, []);
});
