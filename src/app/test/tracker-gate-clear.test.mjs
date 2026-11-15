// A person clears a tracker gate (RC23.9, RC23.10, RC23.13) on the fake GitHub
// and the fake gate plugin: Needs you rows, the order, a stranger's removal.
import assert from "node:assert/strict";
import test from "node:test";
import { blockerNotes } from "../github-close.mjs";
import { clearGate, gateNeedsYou } from "../gate-clear.mjs";
import { gateRecord } from "../gate-step.mjs";
import { queryTasks } from "../../query.mjs";
import { setup } from "./gate-fixture.mjs";

const RULES = { allowedActors: ["alice"], minimumPermission: null };
// Task IDs the graph lets start now.
const ready = (store) =>
  queryTasks(store.read(), { scope: "all", q: "ready:true" })
    .map((task) => task.id)
    .filter((id) => id.startsWith("sdk."))
    .sort();
const LABEL = "avoozl:waiting-on-tracker";
const gateTask = (store) =>
  store.read().tasks.find((task) => task.id === "sdk.1");
const clear = (w, how = "command") =>
  clearGate(w.store, w.github, w.policy, {
    taskId: "sdk.1",
    reason: "The review shipped by hand",
    how,
    local: "cli",
  });
// Take the label off the gate's issue the way a person on GitHub does.
async function untag(w, login) {
  await w.github.removeLabel(null, w.number(1), LABEL);
  w.github.events.set(w.number(1), [
    { event: "unlabeled", label: { name: LABEL }, actor: { login } },
  ]);
}

test("a failed gate gives one row across three ticks and releases nothing", async (t) => {
  const w = await setup(t, {}, RULES);
  w.item("failed", "rejected");
  for (const minutes of [0, 40, 80]) {
    await w.tick(minutes);
    await w.step();
  }
  const rows = gateNeedsYou(w.store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /sdk\.1 is failed/);
  assert.deepEqual(ready(w.store), ["sdk.3"]);
  assert.equal(gateTask(w.store).gateVerdict, undefined);
});

test("unknown makes a row on the second read, not the first", async (t) => {
  const w = await setup(t, {}, RULES);
  w.item("unknown");
  await w.tick(0);
  assert.equal(gateNeedsYou(w.store).length, 0);
  await w.tick(10);
  assert.equal(gateNeedsYou(w.store).length, 1);
});

test("an allowed clear releases the dependent as an order and records it once", async (t) => {
  const w = await setup(t, {}, RULES);
  w.github.login = "alice";
  w.item("failed", "rejected");
  await w.tick(0);
  const result = await clear(w);
  assert.equal(result.cleared, true);
  const { gateVerdict } = gateTask(w.store);
  assert.equal(gateVerdict.state, "order");
  assert.deepEqual(
    [
      gateVerdict.order.actor,
      gateVerdict.order.how,
      gateVerdict.order.lastState,
    ],
    ["alice", "command", "failed"],
  );
  assert.ok(gateVerdict.order.at && gateVerdict.order.reason);
  assert.ok(ready(w.store).includes("sdk.2"));
  assert.equal(gateNeedsYou(w.store).length, 0);
  const data = w.store.read();
  assert.match(
    blockerNotes(
      data,
      data.tasks.find((task) => task.id === "sdk.2"),
    )[0],
    /cleared by a person/,
  );
  // A second clear records nothing new.
  const before = JSON.stringify(gateTask(w.store).gateVerdict);
  assert.equal((await clear(w)).cleared, false);
  assert.equal(JSON.stringify(gateTask(w.store).gateVerdict), before);
});

test("a clear by someone the policy does not allow is refused", async (t) => {
  const w = await setup(t, {}, RULES);
  w.github.login = "mallory";
  await assert.rejects(clear(w), (error) => error.status === 403);
  assert.equal(gateTask(w.store).gateVerdict, undefined);
});

test("removing the label as an allowed person clears the gate by label", async (t) => {
  const w = await setup(t, {}, RULES);
  await w.step();
  await untag(w, "alice");
  await w.step();
  assert.equal(gateTask(w.store).gateVerdict.order.how, "label");
  assert.equal(gateTask(w.store).gateVerdict.order.actor, "alice");
  await w.step();
  assert.deepEqual(w.labels(2), []);
});

test("a stranger's label removal is put back with one row", async (t) => {
  const w = await setup(t, {}, RULES);
  await w.step();
  await untag(w, "mallory");
  for (let i = 0; i < 3; i++) await w.step();
  assert.deepEqual(w.labels(1), [LABEL]);
  assert.equal(gateTask(w.store).gateVerdict, undefined);
  const rows = gateNeedsYou(w.store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /mallory removed the waiting label/);
});

test("a later done adds evidence only", async (t) => {
  const w = await setup(t, {}, RULES);
  w.github.login = "alice";
  w.item("failed");
  await w.tick(0);
  await clear(w);
  w.item("done", "shipped later");
  await w.tick(60);
  assert.equal(gateTask(w.store).gateVerdict.state, "order");
  const record = gateRecord(w.store, "sdk.1");
  assert.equal(record.state, "done");
  assert.equal(record.evidence, "shipped later");
  assert.equal(record.rechecked, true);
});
