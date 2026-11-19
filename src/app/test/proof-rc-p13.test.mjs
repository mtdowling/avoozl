// Proof 13 (rc-p13): the work split. The scope statement shows in the README
// and Set up from one source string. Quick goal and its one-pull-request hint
// were removed (RC30.1); goals start in New spec as From a goal.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { SCOPE_RULE, SCOPE_STATEMENT } from "../../work-split.mjs";

const read = (file) =>
  fs.readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");

test("Proof 13: the statement shows in the README and Set up", () => {
  assert.ok(read("README.md").replace(/\s+/g, " ").includes(SCOPE_STATEMENT));
  const source = read("kirocrew-app/ui/src/SetupWizard.tsx");
  assert.match(source, /SCOPE_STATEMENT/);
  assert.match(source, /SCOPE_RULE/);
  assert.ok(source.includes("work-split.mjs"));
});

test("Quick goal is gone: no operation, page or module", async () => {
  const { OPERATIONS } = await import("../api/operation-table.mjs");
  assert.equal(
    [...OPERATIONS.keys()].some((name) => name.startsWith("quickgoal.")),
    false,
  );
  for (const file of [
    "src/app/quick-goal.mjs",
    "src/app/quick-goal-ops.mjs",
    "kirocrew-app/ui/src/QuickGoalModal.tsx",
  ])
    assert.equal(
      fs.existsSync(new URL(`../../../${file}`, import.meta.url)),
      false,
      file,
    );
});
