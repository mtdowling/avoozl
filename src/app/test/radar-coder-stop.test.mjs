// rc-4.2: Stop the line and a reopened blocker take ready labels from
// unclaimed issues only. Fake GitHub only. Nearby inputs checked: a claimed
// and an unclaimed issue under one stop; three ticks (one comment); resume
// (release continues, no second comment); a second stop (a new comment); a
// stop on one task (its dependents only); a stop on another repository; a
// worker repository (untouched); a blocker that is open again with an
// unclaimed and a claimed dependent.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CLAIM,
  READY,
  labelsOf,
  leaf,
  setup,
} from "./radar-coder-release-fixture.mjs";

const five = () => ["a", "b", "c", "d", "e"].map((id) => leaf("leaf-" + id));
const removals = (w) =>
  w.github.labels.filter(
    ([kind, , label]) => kind === "remove" && label === READY,
  );
const noticesOn = (w, issue) =>
  w.github.comments.filter((comment) => comment.number === issue.number);

test("a stop clears unclaimed ready labels, leaves the claimed issue alone and comments once", async (t) => {
  const w = await setup(t, { release: { capacity: 2 } }, five());
  await w.tick();
  const [first, second, third] = w.approved.taskIds,
    claimed = w.issueOf(first);
  claimed.labels.push({ name: CLAIM });
  const before = labelsOf(claimed);
  const { stop } = await w.ops.execute("flow.stop", {
    scope: "all",
    reason: "bad base",
  });
  for (let i = 0; i < 3; i += 1) await w.tick();
  assert.deepEqual(labelsOf(claimed), before);
  assert.equal(labelsOf(w.issueOf(second)).includes(READY), false);
  assert.equal(labelsOf(w.issueOf(third)).includes(READY), false);
  assert.equal(
    removals(w).every(([, number]) => number !== claimed.number),
    true,
  );
  assert.equal(noticesOn(w, claimed).length, 1);
  assert.equal(noticesOn(w, w.issueOf(second)).length, 0);
  // Resume: release continues up to N, which the claimed issue still uses.
  await w.ops.execute("flow.resume", { stopId: stop.id });
  await w.tick();
  assert.deepEqual(w.readyIds(), [first, second]);
  assert.equal(noticesOn(w, claimed).length, 1);
  // A second stop is a new cause: one more comment.
  await w.ops.execute("flow.stop", { scope: "all", reason: "again" });
  await w.tick();
  await w.tick();
  assert.equal(noticesOn(w, claimed).length, 2);
});

test("a stop on one task pauses only that task and its dependents", async (t) => {
  const w = await setup(t, { release: { capacity: 5 } }, [
    leaf("root-one"),
    leaf("child-one", { requires: ["root-one"] }),
    leaf("other-one"),
  ]);
  const [rootId, , otherId] = w.approved.taskIds;
  await w.tick();
  await w.ops.execute("flow.stop", {
    scope: "task",
    taskId: rootId,
    reason: "root is bad",
  });
  await w.tick();
  assert.deepEqual(w.readyIds(), [otherId]);
});

test("a stop on another repository changes nothing here", async (t) => {
  const w = await setup(t, { release: { capacity: 2 } }, five());
  w.store.put("projects", {
    id: "elsewhere",
    root: "/tmp/elsewhere",
    baseBranch: "main",
    worktreeRoot: "/tmp/elsewhere-wt",
    checks: [["npm", "test"]],
  });
  await w.tick();
  await w.ops.execute("flow.stop", {
    scope: "repo",
    repository: "elsewhere",
    reason: "not ours",
  });
  const before = w.github.labels.length;
  await w.tick();
  assert.equal(w.github.labels.length, before);
  assert.equal(w.readyIds().length, 2);
});

test("a worker repository keeps its ready labels under a stop", async (t) => {
  const w = await setup(t, { concurrency: 2 }, five(), "worker");
  await w.tick();
  await w.ops.execute("flow.stop", { scope: "all", reason: "stop" });
  await w.tick();
  assert.equal(w.readyIds().length, 2);
  assert.equal(w.github.comments.length, 0);
});

test("a blocker that is open again clears unclaimed dependents and comments once on a claimed one", async (t) => {
  const w = await setup(t, { release: { capacity: 5 } }, [
    leaf("base-one"),
    leaf("dep-one", { requires: ["base-one"] }),
    leaf("dep-two", { requires: ["base-one"] }),
  ]);
  const [base, one, two] = w.approved.taskIds,
    setStatus = (status) =>
      w.store.mutate("status", (data) => {
        data.tasks.find((task) => task.id === base).status = status;
      });
  setStatus("accepted");
  await w.tick();
  assert.equal(labelsOf(w.issueOf(one)).includes(READY), true);
  assert.equal(labelsOf(w.issueOf(two)).includes(READY), true);
  w.issueOf(one).labels.push({ name: CLAIM });
  const claimedLabels = labelsOf(w.issueOf(one));
  setStatus("planned");
  for (let i = 0; i < 3; i += 1) await w.tick();
  assert.deepEqual(labelsOf(w.issueOf(one)), claimedLabels);
  assert.equal(labelsOf(w.issueOf(two)).includes(READY), false);
  assert.equal(noticesOn(w, w.issueOf(one)).length, 1);
  assert.equal(noticesOn(w, w.issueOf(two)).length, 0);
  // Closed again: the unclaimed dependent gets its label back.
  setStatus("accepted");
  await w.tick();
  assert.equal(labelsOf(w.issueOf(two)).includes(READY), true);
});
