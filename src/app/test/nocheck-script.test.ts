import assert from "node:assert/strict";
import test from "node:test";
import { markedFiles, problem } from "../../../scripts/check/nocheck.ts";

test("the @ts-nocheck count may only fall, and a fall lowers the baseline", () => {
  assert.equal(problem(5, 5), null);
  assert.match(String(problem(6, 5)), /1 more file/);
  assert.match(String(problem(4, 5)), /--update/);
  assert.match(String(problem(4, null)), /No scripts\/check/);
});

test("the count is the tracked files whose line starts with the mark", () => {
  const files = markedFiles();
  assert.ok(!files.includes("scripts/check/nocheck.ts"));
  assert.deepEqual(files, [...files].sort());
});
