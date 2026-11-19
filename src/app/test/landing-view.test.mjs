// Home's Landing queue and Recently landed (landing.view): read from the
// landing queue table only, with no GitHub call.
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { enqueueLanding } from "../landing-queue.mjs";
import { landingView } from "../landing-view.mjs";
import { Operations } from "../operations.mjs";

const Q = { repositoryId: "fixture", base: "main" };
const SHA = (n) => String(n).repeat(40).slice(0, 40);
const DAY = 24 * 60 * 60 * 1000;

test("the queue is in order with one held reason each, and landings are newest first", async (t) => {
  const { store } = fixture(t);
  store.put("repositories", { id: "fixture", github: "example/fixture" });
  enqueueLanding(store, {
    ...Q,
    key: "one",
    commit: SHA(1),
    tasks: ["sample-task"],
  });
  enqueueLanding(store, {
    ...Q,
    key: "two",
    commit: SHA(2),
    tasks: ["t2"],
    pr: 12,
  });
  enqueueLanding(store, { ...Q, key: "three", commit: SHA(3), tasks: ["t3"] });
  const now = Date.parse("2026-11-17T12:00:00Z");
  const landed = (key, days, pr) =>
    store.put("landing_queue", {
      id: `fixture\0main\0${key}`,
      ...Q,
      key,
      commit: SHA(4),
      tasks: [key],
      seq: 0,
      state: "landed",
      pr,
      approvers: ["someone"],
      finishedAt: new Date(now - days * DAY).toISOString(),
    });
  landed("old", 9, 3);
  landed("new", 1, 7);
  landed("direct", 2, undefined);

  let view = landingView(store, store.read(), { now });
  assert.deepEqual(
    view.queue.map((r) => [r.position, r.tasks[0].title, r.held]),
    [
      [0, "Implement fixture", "Next to land; checks run on the next tick."],
      [1, "t2", "Behind 1 portion."],
      [2, "t3", "Behind 2 portions."],
    ],
  );
  assert.equal(view.queue[1].url, "https://github.com/example/fixture/pull/12");
  assert.deepEqual(
    view.landed.map((r) => [r.tasks[0].id, r.pr, r.url]),
    [
      ["new", 7, "https://github.com/example/fixture/pull/7"],
      ["direct", null, null],
      ["old", 3, "https://github.com/example/fixture/pull/3"],
    ],
  );
  assert.equal(view.landedThisWeek, 2);
  // Who approved stays out of Home.
  assert.doesNotMatch(JSON.stringify(view), /someone/);

  store.put("flow_stops", {
    id: "stop:x",
    manual: true,
    scope: "all",
    reason: "bad base",
    openedAt: new Date(now).toISOString(),
    closedAt: null,
  });
  view = landingView(store, store.read(), { now });
  assert.ok(
    view.queue.every((r) => r.held === "Paused by a line stop: bad base."),
  );
});

test("landing.view makes no GitHub call", async (t) => {
  const { store } = fixture(t);
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls += 1;
    return new Promise(() => {});
  };
  t.after(() => (globalThis.fetch = real));
  const view = await new Operations(store, {}).execute("landing.view", {});
  assert.deepEqual(view, { queue: [], landed: [], landedThisWeek: 0 });
  assert.equal(calls, 0);
});
