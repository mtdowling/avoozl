// The gate rows the page, `avoozl gate list` and the MCP read share, and the
// Trace step (RC23.11, RC23.12).
import assert from "node:assert/strict";
import test from "node:test";
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
