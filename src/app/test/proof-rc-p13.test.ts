// @ts-nocheck: typing debt
// Proof 13 (rc-p13): the work split. The scope statement shows in the README
// from one source string. Quick goal and its one-pull-request hint
// were removed (RC30.1); goals start in New spec as From a goal.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { SCOPE_RULE, SCOPE_STATEMENT } from "../../work-split.ts";

const read = (file) =>
  fs.readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");

test("Proof 13: the statement shows in the README", () => {
  const readme = read("README.md").replace(/\s+/g, " ");
  assert.ok(readme.includes(SCOPE_STATEMENT));
  assert.ok(readme.includes(SCOPE_RULE));
});

test("Quick goal is gone: no operation, page or module", async () => {
  const { OPERATIONS } = await import("../api/operation-table.ts");
  assert.equal(
    [...OPERATIONS.keys()].some((name) => name.startsWith("quickgoal.")),
    false,
  );
  for (const file of [
    "src/app/quick-goal.mjs",
    "src/app/quick-goal-ops.mjs",
    "hosts/kirocrew/ui/src/QuickGoalModal.tsx",
  ])
    assert.equal(
      fs.existsSync(new URL(`../../../${file}`, import.meta.url)),
      false,
      file,
    );
});
