// rc-4.4: release mode (Automatic, Step, Hold), the Step click, a person's
// ready label as an order, and the Release queue. Fake GitHub only. Nearby
// inputs checked: Hold with N=2 and five tasks (nothing released); Hold with an
// allowed person's label (kept) and a stranger's (taken off); Step before and
// after each click, with two phases; the click refused for an agent and when
// every phase is released; Step and Hold with a label Avoozl already wrote
// (kept); the queue's reason for each kind of held task; changed release
// inputs reproject a plan on the tick.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  releaseChangedPlanIds,
  releaseRecorded,
} from "../radar-coder-queue.mjs";
import { planningIdentity } from "../github-marker.mjs";
import {
  CLAIM,
  READY,
  labelsOf,
  leaf,
  setup,
} from "./radar-coder-release-fixture.mjs";

const five = () => ["a", "b", "c", "d", "e"].map((id) => leaf("leaf-" + id));
const phased = (w, phases) =>
  w.store.mutate("Phases", (data) => {
    for (const [id, phase] of Object.entries(phases))
      data.tasks.find((task) => task.id === id).phase = {
        id: phase,
        title: phase.toUpperCase(),
      };
  });
const byHand = (w, id, login) => {
  const issue = w.issueOf(id);
  issue.labels.push({ name: READY });
  w.github.events.set(issue.number, [
    {
      event: "labeled",
      label: { name: READY },
      actor: { login },
      created_at: "2026-11-14T10:00:00Z",
    },
  ]);
  return issue;
};
const rewrite = (w, release) => {
  const file = path.join(w.root, ".avoozl.json"),
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  value.github.repositories["example/code"].release = release;
  fs.writeFileSync(file, JSON.stringify(value));
};

test("Hold releases nothing; an allowed person's label is an order, a stranger's is taken off", async (t) => {
  const w = await setup(t, { release: { capacity: 2, mode: "hold" } }, five());
  w.github.permissions.set("maintainer", "write");
  await w.tick();
  assert.deepEqual(w.readyIds(), []);
  const [a, b, c] = w.approved.taskIds;
  byHand(w, a, "maintainer");
  byHand(w, b, "stranger");
  for (let i = 0; i < 3; i += 1) await w.tick();
  assert.deepEqual(w.readyIds(), [a]);
  // The order outlives the tick that recorded it, and counts as a slot.
  byHand(w, c, "maintainer");
  await w.tick();
  assert.deepEqual(w.readyIds(), [a, c]);
});

test("a person's label is not an order when the actor check fails", async (t) => {
  const w = await setup(t, { release: { capacity: 2 } }, five());
  await w.tick();
  const [, , third] = w.approved.taskIds;
  // Capacity is full; a stranger's third label is taken off.
  byHand(w, third, "stranger");
  await w.tick();
  assert.equal(labelsOf(w.issueOf(third)).includes(READY), false);
  // The same label from an allowed person stays.
  w.github.permissions.set("maintainer", "write");
  byHand(w, third, "maintainer");
  await w.tick();
  assert.equal(labelsOf(w.issueOf(third)).includes(READY), true);
  assert.equal(w.readyIds().length, 3);
});

test("Step labels a phase only after its click, one click per phase", async (t) => {
  const w = await setup(t, { release: { capacity: 9, mode: "step" } }, [
    leaf("s-one"),
    leaf("s-two"),
    leaf("s-three"),
  ]);
  const [one, two, three] = w.approved.taskIds;
  phased(w, { [one]: "p1", [two]: "p1", [three]: "p2" });
  await w.tick();
  assert.deepEqual(w.readyIds(), []);
  const first = await w.ops.execute("radar.releasestep", {
    planId: "rel",
  });
  assert.equal(first.phase, "p1");
  await w.tick();
  assert.deepEqual(w.readyIds(), [one, two]);
  // The second phase still waits for its own click and for p1 to merge.
  assert.equal(labelsOf(w.issueOf(three)).includes(READY), false);
  const second = await w.ops.execute("radar.releasestep", { planId: "rel" });
  assert.equal(second.phase, "p2");
  await w.tick();
  assert.equal(labelsOf(w.issueOf(three)).includes(READY), false);
  await assert.rejects(
    w.ops.execute("radar.releasestep", { planId: "rel" }),
    /already released/,
  );
  // Writes nothing when repeated.
  const labels = w.github.labels.length;
  await w.tick();
  assert.equal(w.github.labels.length, labels);
});

test("the Step click is a person's", async (t) => {
  const w = await setup(t, { release: { mode: "step" } }, five());
  await assert.rejects(
    w.ops.execute("radar.releasestep", { planId: "rel" }, undefined, {
      mcp: true,
    }),
    /Only a person/,
  );
  await assert.rejects(
    w.ops.execute("radar.releasestep", { planId: "nope" }),
    /not approved/,
  );
});

test("switching to Hold or Step keeps labels Avoozl already wrote", async (t) => {
  const w = await setup(t, { release: { capacity: 2 } }, five());
  await w.tick();
  const ready = w.readyIds();
  assert.equal(ready.length, 2);
  rewrite(w, { capacity: 2, mode: "hold" });
  await w.tick();
  assert.deepEqual(w.readyIds(), ready);
  rewrite(w, { capacity: 2, mode: "step" });
  await w.tick();
  assert.deepEqual(w.readyIds(), ready);
});

test("the queue gives each held task one reason", async (t) => {
  const w = await setup(t, { release: { capacity: 1 } }, [
    leaf("q-one"),
    leaf("q-two"),
    leaf("q-three", { requires: ["q-one"] }),
    leaf("q-four"),
    leaf("q-five"),
  ]);
  const [one, two, three, four, five1] = w.approved.taskIds;
  phased(w, {
    [one]: "p1",
    [two]: "p1",
    [three]: "p1",
    [four]: "p2",
    [five1]: "p2",
  });
  await w.tick();
  const queue = async () => {
      const { repositories } = await w.ops.execute("radar.releasequeue", {});
      return Object.fromEntries(
        repositories[0].rows.map((row) => [row.taskId, row]),
      );
    },
    reason = (rows, id) => `${rows[id].state}: ${rows[id].reason}`;
  let rows = await queue();
  assert.match(reason(rows, one), /^released: Ready label is on/);
  assert.match(
    reason(rows, two),
    /^held: Waiting for a free slot \(1 of 1 in use\)/,
  );
  assert.match(reason(rows, three), /^held: Waiting on .*q-one/);
  assert.match(
    reason(rows, four),
    /^held: Phase P2 waits for phase p1 to merge/,
  );
  // Claimed.
  w.issueOf(one).labels.push({ name: CLAIM });
  w.store.setMeta("radarClaims", {
    readAt: "now",
    repositories: {
      "example/code": {
        rows: [{ number: w.issueOf(one).number, crewName: "Crew A" }],
      },
    },
  });
  rows = await queue();
  assert.equal(reason(rows, one), "claimed: Claimed by Crew A.");
  // The line stopped.
  await w.ops.execute("flow.stop", { scope: "all", reason: "bad base" });
  rows = await queue();
  assert.match(reason(rows, two), /^held: The line is stopped: bad base/);
});

test("the queue shows Hold and Step as the reason", async (t) => {
  const hold = await setup(t, { release: { mode: "hold" } }, five());
  await hold.tick();
  const rows = (await hold.ops.execute("radar.releasequeue", {}))
    .repositories[0].rows;
  assert.equal(
    rows.every((row) => row.state === "held" && /Hold/.test(row.reason)),
    true,
  );
  const step = await setup(t, { release: { mode: "step" } }, five());
  await step.tick();
  const stepRows = (await step.ops.execute("radar.releasequeue", {}))
    .repositories[0];
  assert.match(stepRows.rows[0].reason, /^Step: waiting for a click/);
  assert.deepEqual(
    stepRows.steps.map((s) => [s.phase, s.released]),
    [["", false]],
  );
});

test("changed release inputs reproject the plan once", async (t) => {
  const w = await setup(t, { release: { capacity: 2 } }, five());
  await w.tick();
  const identity = () => planningIdentity(w.root);
  assert.equal(releaseChangedPlanIds(w.store, identity()).size, 0);
  assert.equal(releaseChangedPlanIds(w.store, identity()).size, 0);
  rewrite(w, { capacity: 3 });
  const changed = releaseChangedPlanIds(w.store, identity());
  assert.deepEqual([...changed], ["rel"]);
  releaseRecorded(w.store, identity(), ["rel"]);
  assert.equal(releaseChangedPlanIds(w.store, identity()).size, 0);
  await w.ops.execute("radar.releasestep", { planId: "rel" });
  assert.equal(releaseChangedPlanIds(w.store, identity()).size, 1);
});
