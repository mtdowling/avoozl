// Task 28.2 and 28.7: diffs proposals carry, strict apply, and the
// three-way merge an override rebase uses (design §4.18).
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDiff,
  merge3,
  reverseDiff,
  unifiedDiff,
} from "../text-diff.mjs";

const before = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].join("\n");

test("a diff applies to the exact text it was made on and undoes with its reverse", () => {
  const cases = [
    before.replace("c", "C"),
    before.replace("a\n", ""),
    before + "\nk",
    "x\n" + before,
    before.replace("b", "b2").replace("i", "i2\ni3"),
    "",
  ];
  for (const after of cases) {
    const diff = unifiedDiff(before, after);
    assert.equal(applyDiff(before, diff), after, JSON.stringify(after));
    assert.equal(applyDiff(after, reverseDiff(diff)), before);
  }
  assert.equal(unifiedDiff(before, before), "");
});

test("a diff does not apply to other text or to junk", () => {
  const diff = unifiedDiff(before, before.replace("e", "E"));
  assert.equal(applyDiff(before.replace("d", "D"), diff), null);
  assert.equal(applyDiff(before, "not a diff"), null);
  assert.equal(applyDiff(before, "@@ -1,1 +1,1 @@\n a"), null, "no change");
});

test("merge3 replays an override onto a changed base, or reports a conflict", () => {
  const base = "intro\nRun the checks.\nend",
    ours = "intro\nRun the checks. Add a test per branch.\nend",
    theirs = "intro v2\n\nRun the checks.\nend";
  assert.deepEqual(merge3(base, ours, theirs), {
    text: "intro v2\n\nRun the checks. Add a test per branch.\nend",
    conflict: false,
  });
  assert.equal(merge3(base, ours, "intro\nRun all checks.\nend").conflict, true);
  assert.equal(merge3(base, base, theirs).text, theirs);
  assert.equal(merge3(base, ours, base).text, ours);
});
