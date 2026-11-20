// Epics and Trace's Done work: epic > spec > phase with the release state,
// specs not on GitHub yet, and the merged work with who did it. Read only.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { classifyOperation } from "../../api/operation-table.mjs";
import { APP_OPERATIONS } from "../../executors/kirocrew/app-backend.mjs";
import { demoOperations, installDemo } from "../../test/demo-fixture.mjs";
import { epicsView } from "../epics-view.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

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

test("with no epics and no merges the views are empty, not broken", () => {
  const store = {
    read: () => ({ epics: [], tasks: [] }),
    list: () => [],
  };
  assert.deepEqual(epicsView(store, { repositories: [] }), {
    epics: [],
    unprojected: [],
  });
});

test("Trace's reads are gone", () => {
  for (const name of ["radar.trace", "trace.done"]) {
    assert.ok(!APP_OPERATIONS.has(name), name);
    assert.equal(classifyOperation(name), null, name);
  }
});
