// Conflict-aware train composition (lt-10.1): entries that overlap by
// footprint go in the same train or wait for the next one.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { composeTrain } from "../integrator-schedule.mjs";
import { planTrain } from "../integrator-trains.mjs";
import { queued, workspace } from "./integrator-fixture.mjs";

const entry = (key, footprint, builtOn = []) => ({ key, footprint, builtOn });
// A and B overlap; C and D touch other files.
const lined = () => [
  entry("A", ["src/a.txt"]),
  entry("C", ["docs/c.txt"]),
  entry("D", ["lib/d.txt"]),
  entry("B", ["src/a.txt", "src/b.txt"]),
];
const keys = (r) => r.members.map((e) => e.key);

test("same-train pulls an overlapping later entry up behind the earlier one", () => {
  assert.deepEqual(
    keys(composeTrain(lined(), { overlap: "same-train", maxBranches: 10 })),
    ["A", "B", "C", "D"],
  );
});

test("same-train stays within maxBranches", () => {
  assert.deepEqual(
    keys(composeTrain(lined(), { overlap: "same-train", maxBranches: 2 })),
    ["A", "B"],
  );
});

test("serialize leaves the later overlapping entry for the next train, with its reason", () => {
  const out = composeTrain(lined(), { overlap: "serialize", maxBranches: 10 });
  assert.deepEqual(keys(out), ["A", "C", "D"]);
  assert.match(out.held[0].reason, /overlaps A/);
});

test("an entry built on one that is left behind is left too, and one built on a queued entry is not pulled past it", () => {
  const out = composeTrain(
    [
      entry("A", ["a"]),
      entry("B", ["a"]),
      entry("C", ["c"], ["B"]),
      entry("D", ["d"]),
    ],
    { overlap: "serialize", maxBranches: 10 },
  );
  assert.deepEqual(keys(out), ["A", "D"]);
  const same = composeTrain(
    [entry("A", ["a"]), entry("X", ["x"]), entry("B", ["a"], ["X"])],
    { overlap: "same-train", maxBranches: 10 },
  );
  assert.deepEqual(keys(same), ["A", "X", "B"]);
});

test("a branch whose real diff exceeds its declared paths is matched on the real files", async (t) => {
  const w = await workspace(t, { trigger: { minBranches: 1 } });
  await queued(w, "t1", { file: "shared.txt" });
  await queued(w, "t2", { file: "other.txt" });
  await queued(w, "t3", {
    write: (wt) => fs.writeFileSync(path.join(wt, "shared.txt"), "again\n"),
  });
  const plan = (overlap) =>
    planTrain(w.store, {
      projectId: "app",
      target: "main",
      settings: { ...w.settings(), scheduling: { overlap } },
    });
  assert.deepEqual(
    plan("same-train").members.map((e) => e.key),
    ["t1", "t3", "t2"],
  );
  const serial = plan("serialize");
  assert.deepEqual(
    serial.members.map((e) => e.key),
    ["t1", "t2"],
  );
  assert.ok(serial.held.some((h) => h.key === "t3"));
});
