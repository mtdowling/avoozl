// Epics and Trace's Done work: epic > spec > phase with the release state,
// specs not on GitHub yet, and the merged work with who did it. Read only.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { classifyOperation } from "../operation-kinds.mjs";
import { APP_OPERATIONS } from "../app-backend.mjs";
import { demoOperations, installDemo } from "../demo.mjs";
import { epicsView } from "../epics-view.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

let shared = null;
async function withSample(fn) {
  shared ||= (await installDemo(path.join(temporaryDirectory(), "demo"))).root;
  const demo = demoOperations(shared);
  try {
    return await fn(demo);
  } finally {
    demo.close();
  }
}

test("the Epics read is read only and offered to the page", () => {
  for (const name of ["epics.view"]) {
    assert.equal(classifyOperation(name), "observe", name);
    assert.ok(APP_OPERATIONS.has(name), name);
  }
});

test("an epic drills to specs and phases with gate and handback", async () => {
  await withSample(async (demo) => {
    const view = await demo.execute("epics.view", {});
    assert.equal(view.epics.length, 1);
    const [epic] = view.epics;
    assert.equal(epic.id, "recipe-box");
    assert.equal(epic.tasks, 10);
    assert.equal(epic.merged, 2);
    assert.equal(epic.running, 0);
    assert.deepEqual(
      epic.plans.map((plan) => plan.id),
      ["recipe-import", "meal-planner", "shopping-list"],
    );
    const phases = epic.plans.flatMap((plan) => plan.phases);
    assert.deepEqual(
      phases.map((phase) => phase.gate),
      ["passed", "open", "open", "closed", "open", "closed"],
    );
    // Release to crews went with Who codes (R91.6): only done tasks count.
    const two = epic.plans[0].phases[1];
    assert.equal(two.released, two.merged);
    // The handed-back phase says a person must answer first.
    assert.match(epic.plans[1].phases[0].held, /Handed back: answer issue #6/);
  });
});

test("a draft spec is listed as not on GitHub, with what to do", async () => {
  await withSample(async (demo) => {
    const { unprojected } = await demo.execute("epics.view", {});
    const draft = unprojected.find((plan) => plan.id === "pantry-photos");
    assert.equal(draft.state, "draft");
    assert.equal(draft.tasks, 1);
    assert.match(draft.reason, /not approved/i);
    assert.ok(!unprojected.some((plan) => plan.id === "recipe-import"));
  });
});

test("Issue Radar's graph is the tab link; its view and focus have no URL", async () => {
  await withSample(async (demo) => {
    const { radarGraph } = await demo.execute("epics.view", {});
    assert.deepEqual(radarGraph, { url: "/issue-radar", focus: false });
  });
});

test("with no epics and no merges the views are empty, not broken", () => {
  const store = {
    read: () => ({ epics: [], tasks: [] }),
    list: () => [],
  };
  assert.deepEqual(epicsView(store, { repositories: [] }), {
    epics: [],
    unprojected: [],
    radarGraph: { url: "/issue-radar", focus: false },
  });
});

test("Trace's reads are gone", () => {
  for (const name of ["radar.trace", "trace.done"]) {
    assert.ok(!APP_OPERATIONS.has(name), name);
    assert.equal(classifyOperation(name), null, name);
  }
});
