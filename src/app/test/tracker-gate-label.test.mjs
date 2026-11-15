// The waiting label on tracker gates and their gate-only dependents (RC23.4,
// RC23.5, RC23.13) on the fake GitHub and the fake gate plugin.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { REPOSITORY, setup } from "./gate-fixture.mjs";

test("the label is on the gate and its gate-only dependents, not on one with another blocker", async (t) => {
  const { step, labels } = await setup(t);
  await step();
  assert.deepEqual(labels(1), ["avoozl:waiting-on-tracker"]);
  assert.deepEqual(labels(2), ["avoozl:waiting-on-tracker"]);
  assert.deepEqual(labels(3), []);
  assert.deepEqual(labels(4), []);
});

test("three ticks write the label once", async (t) => {
  const { step, github } = await setup(t);
  for (let i = 0; i < 3; i++) await step();
  assert.equal(github.labels.filter((entry) => entry[0] === "add").length, 2);
  assert.equal(
    github.labels.filter((entry) => entry[0] === "remove").length,
    0,
  );
});

test("a failed or unknown gate keeps the label; done removes it from all", async (t) => {
  const { step, tick, item, labels, github } = await setup(t);
  item("failed");
  await tick(0);
  await step();
  assert.deepEqual(labels(1), ["avoozl:waiting-on-tracker"]);
  item("unknown");
  await tick(10);
  await step();
  assert.deepEqual(labels(2), ["avoozl:waiting-on-tracker"]);
  item("done");
  await tick(60);
  await step();
  assert.deepEqual(labels(1), []);
  assert.deepEqual(labels(2), []);
  assert.equal(
    github.labels.filter((entry) => entry[0] === "remove").length,
    2,
  );
});

test("a dependent loses the label when its last gate clears and keeps it until then", async (t) => {
  const { step, store, labels } = await setup(t);
  await step();
  store.mutate("clear", (data) => {
    data.tasks.find((task) => task.id === "sdk.1").gateVerdict = {
      state: "order",
    };
  });
  await step();
  assert.deepEqual(labels(1), []);
  assert.deepEqual(labels(2), []);
});

test("a gate removed from the plan loses the label", async (t) => {
  const { step, store, labels } = await setup(t);
  await step();
  store.mutate("remove", (data) => {
    data.tasks.find((task) => task.id === "sdk.1").planArchived = true;
  });
  await step();
  assert.deepEqual(labels(1), []);
});

test("a set name is used, and a label equal to another managed label is refused naming both", async (t) => {
  const { step, labels } = await setup(t, { trackerLabel: "waiting" });
  await step();
  assert.deepEqual(labels(1), ["waiting"]);
  const repo = (radar, managedLabels) =>
    normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: {
        [REPOSITORY]: { baseBranch: "main", radar, managedLabels },
      },
    });
  assert.throws(
    () => repo({ trackerLabel: "avoozl:review" }),
    /avoozl:review for both review and waiting-on-tracker/,
  );
  assert.throws(
    () => repo({ trackerLabel: "go" }, { ready: "go" }),
    /cannot use managed label go|both/,
  );
  assert.equal(
    repo({}).repositories[REPOSITORY].radar.trackerLabel,
    "avoozl:waiting-on-tracker",
  );
});
