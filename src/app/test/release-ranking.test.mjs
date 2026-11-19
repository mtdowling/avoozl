import assert from "node:assert/strict";
import test from "node:test";
import { pathsOverlap, unblockCounts } from "../release-ranking.mjs";

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

test("paths overlap when equal, nested or a glob covers the other", () => {
  assert.equal(pathsOverlap(["src/a.mjs"], ["src/a.mjs"]), true);
  assert.equal(pathsOverlap(["src/app"], ["src/app/x.mjs"]), true);
  assert.equal(pathsOverlap(["src/app/*.mjs"], ["src/app/x.mjs"]), true);
  assert.equal(pathsOverlap(["src/app/x.mjs"], ["docs/x.md"]), false);
  assert.equal(pathsOverlap([], ["src"]), false);
});
