import assert from "node:assert/strict";
import test from "node:test";
import {
  pathsOverlap,
  rankCandidates,
  rankingFor,
  unblockCounts,
} from "../release-ranking.mjs";

const open = () => true;

test("unblock count counts every open task downstream, once", () => {
  const counts = unblockCounts(
    [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "a", to: "c" },
      { from: "d", to: "c" },
    ],
    (id) => id !== "b",
  );
  assert.equal(counts.get("a"), 1);
  assert.equal(counts.get("d"), 1);
  assert.equal(unblockCounts([{ from: "a", to: "b" }], open).get("a"), 1);
});

test("the task that unblocks the most goes first; ties keep plan order", () => {
  const counts = { a: 0, b: 3, c: 3, d: 1 },
    { order, notes } = rankCandidates({
      candidates: ["a", "b", "c", "d"],
      unblocks: (id) => counts[id],
    });
  assert.deepEqual(order, ["b", "c", "d", "a"]);
  assert.equal(notes.get("b").reason, "Next: unblocks 3 tasks.");
  assert.equal(notes.get("d").reason, "Next: unblocks 1 task.");
  assert.equal(notes.has("a"), false);
});

test("an overlapping task goes behind every clear one and says why", () => {
  const { order, notes } = rankCandidates({
    candidates: ["a", "b", "c"],
    unblocks: (id) => ({ a: 9, b: 0, c: 0 })[id],
    overlap: (id) => (id === "a" ? ["#112 (open pull request)"] : []),
    heldHours: () => 5,
    agingHours: 12,
  });
  assert.deepEqual(order, ["b", "c", "a"]);
  assert.equal(
    notes.get("a").reason,
    "Held: paths overlap #112 (open pull request); moves up in 7h.",
  );
  assert.equal(notes.get("a").kind, "held");
});

test("aging moves a held task up one rank per wait and releases it after four", () => {
  const run = (hours) =>
    rankCandidates({
      candidates: ["a", "b", "c"],
      overlap: (id) => (id === "a" ? ["claimed x"] : []),
      heldHours: () => hours,
      agingHours: 10,
    });
  assert.deepEqual(run(0).order, ["b", "c", "a"]);
  assert.deepEqual(run(10).order, ["b", "a", "c"]);
  assert.deepEqual(run(20).order, ["a", "b", "c"]);
  const aged = run(40);
  assert.deepEqual(aged.order, ["a", "b", "c"]);
  assert.equal(aged.notes.get("a").kind, "next");
  assert.equal(aged.notes.get("a").reason, "Next: waited 40h.");
});

test("plan order is the tie-break when nothing differs", () => {
  const { order, notes } = rankCandidates({ candidates: ["x", "y", "z"] });
  assert.deepEqual(order, ["x", "y", "z"]);
  assert.equal(notes.size, 0);
});

test("ranking settings default on with 12 hours; bad values fall back", () => {
  assert.deepEqual(rankingFor({}), { enabled: true, agingHours: 12 });
  assert.deepEqual(rankingFor({ ranking: { enabled: false, agingHours: 3 } }), {
    enabled: false,
    agingHours: 3,
  });
  assert.equal(rankingFor({ ranking: { agingHours: 0 } }).agingHours, 12);
});

test("paths overlap when equal, nested or a glob covers the other", () => {
  assert.equal(pathsOverlap(["src/a.mjs"], ["src/a.mjs"]), true);
  assert.equal(pathsOverlap(["src/app"], ["src/app/x.mjs"]), true);
  assert.equal(pathsOverlap(["src/app/*.mjs"], ["src/app/x.mjs"]), true);
  assert.equal(pathsOverlap(["src/app/x.mjs"], ["docs/x.md"]), false);
  assert.equal(pathsOverlap([], ["src"]), false);
});
