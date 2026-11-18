// A falsifier that goes quiet without a verdict is nudged, then a person is
// told (found by the P50 live run: an idle falsifier held coding forever).
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Store } from "../store.mjs";
import { investigationStep } from "../investigate.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const MINUTE = 60_000;
const leaf = {
  id: "a",
  title: "Task a",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["a works."],
  repository: "app",
};

function setup(t) {
  const root = temporaryDirectory("avoozl-falsifier-nudge-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [leaf], edges: [] });
  store.put("projects", { id: "app", root, baseBranch: "main" });
  const at = new Date(0).toISOString();
  for (const [slot, role, extra] of [
    ["w-a", "worker", { investigate: true, report: { kind: "findings", at } }],
    ["f-a", "falsifier", {}],
  ])
    store.put("session_bindings", {
      id: slot,
      slot,
      taskId: "a",
      role,
      attempt: 1,
      source: "tick",
      status: "idle",
      boundAt: at,
      statusAt: at,
      ...extra,
    });
  store.put("task_investigations", {
    id: "a",
    taskId: "a",
    attempt: 1,
    slot: "w-a",
    state: "falsifying",
    rounds: [{ n: 1, findings: { read: "x" }, findingsAt: at }],
    openedAt: at,
    updatedAt: at,
  });
  return store;
}

const policy = { quietMinutes: 15, nudges: 1 };

test("a quiet falsifier is nudged once, then a person is told once", (t) => {
  const store = setup(t),
    step = (now, script = true) =>
      investigationStep(store, policy, { script, now });
  // Not the cron: nothing is sent.
  assert.deepEqual(step(20 * MINUTE, false).messages, []);
  const first = step(20 * MINUTE);
  assert.equal(first.messages.length, 1);
  assert.equal(first.messages[0].slot, "f-a");
  assert.match(first.messages[0].text, /the way your brief says/);
  assert.equal(first.dispatch.length, 0, "no second falsifier");
  // Within the quiet window after the nudge: wait.
  assert.deepEqual(step(25 * MINUTE).messages, []);
  // Past the bound: one notice, once.
  const spent = step(40 * MINUTE);
  assert.equal(spent.messages.length, 0);
  assert.equal(spent.notify.length, 1);
  assert.match(spent.notify[0].title, /falsifier did not report/);
  assert.equal(step(60 * MINUTE).notify.length, 0);
});

test("a working falsifier is left alone", (t) => {
  const store = setup(t);
  store.put("session_bindings", {
    ...store.get("session_bindings", "f-a"),
    status: "working",
  });
  const result = investigationStep(store, policy, {
    script: true,
    now: 60 * MINUTE,
  });
  assert.deepEqual([result.messages, result.notify], [[], []]);
});
