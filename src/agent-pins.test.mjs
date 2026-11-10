import test from "node:test";
import assert from "node:assert/strict";
import { agentPins, stripActivityMarkers } from "./agent-pins.mjs";

test("strip markers distinguish current workers from landing receipts", () => {
  const task = { id: "task", title: "A task" },
    item = { task, index: 7 },
    receipt = { task, commit: "abcdef123", acceptance: "pending" },
    run = { id: "run", taskId: "task", provider: "codex", state: "running" },
    markers = stripActivityMarkers([item], {
      runs: [run],
      landings: [receipt],
    });
  assert.deepEqual(
    markers.map((p) => [p.kind, p.index]),
    [
      ["working", 7],
      ["landed", 7],
    ],
  );
  assert.equal(markers[0].run, run);
  assert.equal(markers[1].receipt, receipt);
  assert.equal(task.activity, undefined);
  assert.deepEqual(
    stripActivityMarkers([item], { runs: [{ ...run, state: "completed" }] }),
    [],
  );
});

test("strip markers preserve fresh external check-ins and omit stale or out-of-scope work", () => {
  const task = {
      id: "external",
      activity: {
        state: "active",
        owner: "External",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    },
    other = { id: "outside" },
    markers = stripActivityMarkers([{ task, index: 3 }], {
      landings: [{ task: other }],
    });
  assert.equal(markers.length, 1);
  assert.equal(markers[0].owner, "External");
  task.activity.expiresAt = "2000-01-01T00:00:00Z";
  assert.deepEqual(stripActivityMarkers([{ task, index: 3 }]), []);
});

test("crowded strips cluster workers and landings separately without losing tasks", () => {
  const items = Array.from({ length: 100 }, (_, index) => ({
      index,
      kind: index % 2 ? "landed" : "working",
    })),
    pins = agentPins(items, { start: 0, end: 100, width: 320 });
  assert.ok(pins.length <= 24);
  assert.deepEqual(
    new Set(pins.map((p) => p.kind)),
    new Set(["landed", "working"]),
  );
  assert.equal(pins.flatMap((p) => p.items || [p]).length, items.length);
  for (const pin of pins)
    assert.ok(pin.items.every((item) => item.kind === pin.kind));
});
