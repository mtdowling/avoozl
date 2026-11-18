// Train records and the back-to-back trigger (lt-3.1), with a fake clock.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  endTrain,
  planTrain,
  readyEntries,
  runningTrain,
  startTrain,
} from "../integrator-trains.mjs";
import { trainSettings } from "../landing-config.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const T0 = Date.parse("2026-01-01T00:00:00.000Z"),
  MIN = 60000;
const sha = (n) => String(n).padStart(40, "0");

function setup(t, trigger = {}) {
  const store = new Store(
    path.join(temporaryDirectory("avoozl-trigger-"), "w.sqlite"),
  );
  t.after(() => store.close());
  const settings = trainSettings(
    {
      landing: { trains: { trigger, targets: { main: { policy: "gated" } } } },
    },
    "main",
  );
  let seq = 0;
  const add = (
    key,
    { at = T0, builtOn = [], cheap = true, state = "queued" } = {},
  ) =>
    store.put("landing_queue", {
      id: `app\0main\0${key}`,
      projectId: "app",
      base: "main",
      key,
      commit: sha(++seq),
      tasks: [{ task: key, definition: "d" }],
      spec: "s",
      seq,
      state,
      queuedAt: new Date(at).toISOString(),
      branch: `avoozl-batch/${key}`,
      builtOn,
      ...(cheap ? { cheap: { commit: sha(seq) } } : {}),
    });
  const plan = (now) =>
    planTrain(store, { projectId: "app", target: "main", settings, now });
  const start = (members, now) =>
    startTrain(store, {
      projectId: "app",
      target: "main",
      policy: "gated",
      members,
      baseHead: sha(999),
      now,
    });
  return { store, add, plan, start, settings };
}

test("two ready entries with minBranches 3 wait until maxWaitMinutes, then go as a train of two", (t) => {
  const w = setup(t, { minBranches: 3, maxWaitMinutes: 15 });
  w.add("a");
  w.add("b", { at: T0 + MIN });
  const early = w.plan(T0 + 14 * MIN);
  assert.equal(early.state, "wait");
  assert.equal(early.ready, 2);
  assert.equal(early.startsAt, new Date(T0 + 15 * MIN).toISOString());
  const due = w.plan(T0 + 15 * MIN);
  assert.equal(due.state, "start");
  assert.deepEqual(
    due.members.map((e) => e.key),
    ["a", "b"],
  );
});

test("a third ready entry starts the train at once", (t) => {
  const w = setup(t, { minBranches: 3 });
  for (const k of ["a", "b", "c"]) w.add(k);
  assert.equal(w.plan(T0).state, "start");
});

test("twelve ready entries make a train of ten and leave two", (t) => {
  const w = setup(t);
  for (let i = 1; i <= 12; i++) w.add(`t${String(i).padStart(2, "0")}`);
  const plan = w.plan(T0);
  assert.equal(plan.members.length, 10);
  assert.equal(plan.members[0].key, "t01");
  const train = w.start(plan.members, T0);
  assert.equal(train.members.length, 10);
  const left = readyEntries(w.store, { projectId: "app", base: "main" }).ready;
  assert.deepEqual(
    left.map((e) => e.key),
    ["t11", "t12"],
  );
});

test("a finished train starts the next only after the cooldown", (t) => {
  const w = setup(t, { minBranches: 1, cooldownSeconds: 60 });
  w.add("a");
  const train = w.start(w.plan(T0).members, T0);
  assert.equal(w.plan(T0 + 1000).state, "running");
  w.add("b");
  endTrain(w.store, train.id, "landed", { now: T0 + 10000 });
  const cooling = w.plan(T0 + 10000 + 59000);
  assert.equal(cooling.state, "cooldown");
  assert.equal(cooling.until, new Date(T0 + 70000).toISOString());
  assert.equal(w.plan(T0 + 70000).state, "start");
});

test("a paused entry and an entry built on one outside the train are held, each with a reason", (t) => {
  const w = setup(t, { minBranches: 1 });
  w.add("a", { cheap: false });
  w.add("b", { builtOn: ["a"] });
  w.add("c");
  w.store.put("flow_stops", {
    id: "stop:test",
    manual: true,
    scope: "task",
    taskId: "c",
    projectId: "app",
    openedAt: new Date(T0).toISOString(),
    closedAt: null,
  });
  const { ready, held } = readyEntries(w.store, {
    projectId: "app",
    base: "main",
  });
  const reasons = Object.fromEntries(held.map((h) => [h.key, h.reason]));
  assert.match(reasons.a, /cheap checks/);
  assert.match(reasons.b, /built on a, which is queued outside this train/);
  assert.match(reasons.c, /paused by stop stop:test/);
  assert.deepEqual(ready, []);
});

test("an entry built on one in the same train, or already landed, is ready", (t) => {
  const w = setup(t, { minBranches: 1 });
  w.add("a");
  w.add("b", { builtOn: ["a"] });
  w.add("old", { state: "landed" });
  w.add("c", { builtOn: ["old"] });
  const { ready, held } = readyEntries(w.store, {
    projectId: "app",
    base: "main",
  });
  assert.deepEqual(
    ready.map((e) => e.key),
    ["a", "b", "c"],
  );
  assert.deepEqual(held, []);
});

test("no two trains exist for one target at any step", (t) => {
  const w = setup(t, { minBranches: 1 });
  w.add("a");
  w.add("b");
  const first = w.start([w.plan(T0).members[0]], T0);
  assert.throws(
    () =>
      w.start(
        [w.plan(T0 + 1).members?.[0] ?? { key: "b", id: "app\0main\0b" }],
        T0,
      ),
    /already running/,
  );
  assert.equal(runningTrain(w.store, "app", "main").id, first.id);
  assert.equal(w.store.list("landing_trains").length, 1);
  // The member is in-train; the other entry is untouched.
  assert.equal(w.store.get("landing_queue", "app\0main\0a").state, "in-train");
  assert.equal(w.store.get("landing_queue", "app\0main\0b").state, "queued");
  // Ending without landing puts the member back in its place.
  endTrain(w.store, first.id, "failed", { now: T0 + 5 });
  assert.equal(w.store.get("landing_queue", "app\0main\0a").state, "queued");
  assert.equal(w.store.get("landing_queue", "app\0main\0a").seq, 1);
});
