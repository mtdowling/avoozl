// rc-4.3: a phase releases only after every task of the previous phase of its
// spec has a merged closing pull request; a task closed by order does not
// count. Fake GitHub only. Nearby inputs checked: a phase with one task closed
// by order (held), then merged (released next tick); a second tick writes
// nothing; unphased tasks (never held); a package in the previous phase (not
// counted); a worker repository (no gate); three phases (the third waits on
// the second). A manual task is not tested here.
import assert from "node:assert/strict";
import test from "node:test";
import { phaseHolds } from "../radar-coder-release.mjs";
import {
  READY,
  labelsOf,
  leaf,
  setup,
} from "./radar-coder-release-fixture.mjs";

const phased = (w, phases) =>
  w.store.mutate("Phases", (data) => {
    for (const [id, phase] of Object.entries(phases))
      data.tasks.find((task) => task.id === id).phase = {
        id: phase,
        title: phase.toUpperCase(),
      };
  });
const verdict = (w, id, state) =>
  w.store.mutate("Verdict", (data) => {
    const task = data.tasks.find((entry) => entry.id === id);
    task.githubVerdict = { state };
    task.status = "accepted";
  });
const tasksOf = () => [
  leaf("one-a"),
  leaf("one-b"),
  leaf("two-a"),
  leaf("two-b"),
];
const holdsAt = async (t, extra = {}, coder = "issue-radar") => {
  const w = await setup(
    t,
    { release: { capacity: 9 }, ...extra },
    tasksOf(),
    coder,
  );
  const [oneA, oneB, twoA, twoB] = w.approved.taskIds;
  phased(w, { [oneA]: "p1", [oneB]: "p1", [twoA]: "p2", [twoB]: "p2" });
  return { w, oneA, oneB, twoA, twoB };
};

test("a phase with one task closed by order stays held; merging it releases the next phase", async (t) => {
  const { w, oneA, oneB, twoA, twoB } = await holdsAt(t);
  await w.tick();
  assert.deepEqual(w.readyIds(), [oneA, oneB]);
  verdict(w, oneA, "verified");
  verdict(w, oneB, "order");
  await w.tick();
  assert.deepEqual(w.readyIds(), []);
  assert.equal(labelsOf(w.issueOf(twoA)).includes(READY), false);
  verdict(w, oneB, "verified");
  await w.tick();
  assert.deepEqual(w.readyIds(), [twoA, twoB]);
  // A second tick writes nothing.
  const labels = w.github.labels.length,
    updated = w.github.updated.length;
  await w.tick();
  assert.equal(w.github.labels.length, labels);
  assert.equal(w.github.updated.length, updated);
});

test("a worker repository has no phase gate", async (t) => {
  const { w } = await holdsAt(t, {}, "worker");
  await w.tick();
  assert.equal(w.readyIds().length, 4);
});

test("phaseHolds: unphased tasks, packages and three phases", () => {
  const task = (id, phase, extra = {}) => ({
      id,
      phase: phase && { id: phase },
      ...extra,
    }),
    tasks = [
      task("free", null),
      task("a1", "p1"),
      task("pkg", "p1", { kind: "package" }),
      task("b1", "p2"),
      task("c1", "p3"),
    ],
    merged = new Set(["a1"]);
  const holds = phaseHolds(tasks, {
    counts: (entry) => entry.kind !== "package",
    merged: (entry) => merged.has(entry.id),
  });
  assert.equal(holds.has("free"), false);
  assert.equal(holds.has("a1"), false);
  assert.equal(holds.has("b1"), false);
  assert.deepEqual(holds.get("c1"), {
    phase: "p3",
    previous: "p2",
    waiting: ["b1"],
  });
});

test("the third phase waits on the second", async (t) => {
  const w = await setup(t, { release: { capacity: 9 } }, [
    leaf("p-one"),
    leaf("p-two"),
    leaf("p-three"),
  ]);
  const [one, two, three] = w.approved.taskIds;
  phased(w, { [one]: "p1", [two]: "p2", [three]: "p3" });
  await w.tick();
  assert.deepEqual(w.readyIds(), [one]);
  verdict(w, one, "verified");
  await w.tick();
  assert.deepEqual(w.readyIds(), [two]);
  verdict(w, two, "verified");
  await w.tick();
  assert.deepEqual(w.readyIds(), [three]);
});
