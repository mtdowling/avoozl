// The gate rows the page, `avoozl gate list` and the MCP read share, and the
// Trace step (RC23.11, RC23.12).
import assert from "node:assert/strict";
import test from "node:test";
import { buildTrace } from "../trace.mjs";
import { gateRows, gateTraceStep } from "../gate-view.mjs";
import { REPOSITORY, setup } from "./gate-fixture.mjs";

test("a gate row has its tracker, state, checks, evidence and the tasks it holds", async (t) => {
  const w = await setup(t);
  w.item("open", "In review", "https://tracker.example.test/REV-1");
  await w.tick(0);
  await w.step();
  const [row] = gateRows(w.store);
  assert.equal(row.taskId, "sdk.1");
  assert.equal(row.tracker, "fake-gate");
  assert.equal(row.item, "REV-1");
  assert.equal(row.state, "open");
  assert.equal(row.evidence, "In review");
  assert.ok(row.lastCheck && row.nextCheck);
  assert.deepEqual(row.held, ["sdk.2"]);
  assert.equal(row.needsYou, false);
  // The operation returns the same rows the CLI and the MCP read print.
  const view = await w.ops.execute("gate.list", {});
  assert.deepEqual(view.gates, gateRows(w.store));
});

test("Trace gets a Tracker step on the gate and a waits-on step on a held task", async (t) => {
  const w = await setup(t);
  w.item("failed", "rejected");
  await w.tick(0);
  const own = gateTraceStep(w.store, REPOSITORY, w.number(1)),
    held = gateTraceStep(w.store, REPOSITORY, w.number(2)),
    free = gateTraceStep(w.store, REPOSITORY, w.number(3));
  assert.equal(own.label, "Tracker");
  assert.match(own.detail, /fake-gate REV-1: failed.*rejected/);
  assert.equal(held.label, "Waits on gate");
  assert.match(held.detail, /sdk\.1 \(fake-gate REV-1\): failed/);
  assert.equal(free, null);
  const trace = buildTrace({
    issue: { number: 40, body: "" },
    tracker: own,
    readyLabel: "r",
  });
  assert.equal(trace.steps[3].key, "tracker");
});
