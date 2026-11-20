import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { select } from "../../../scripts/test/select-tests.mjs";

test("a docs or spec change runs only the tests that read repository docs", () => {
  const s = select([
    "docs/overview.md",
    ".kiro/specs/x/tasks.md",
    ".kiro/skills/x/SKILL.md",
  ]);
  assert.equal(s.full, false);
  assert.equal(s.specLint, true);
  assert.ok(s.node.includes("src/app/test/no-sage.test.mjs"));
  assert.ok(s.node.length < 10);
  assert.equal(s.ui, false);
});

test("anything unclassified, a package or CI file, a helper, or the selector runs everything", () => {
  for (const f of [
    "package.json",
    ".github/workflows/test.yml",
    "src/app/test/helpers.mjs",
    "scripts/test/select-tests.mjs",
    "scripts/test/run-tests.mjs",
    "something-new/file.txt",
    "src/schema.json",
  ])
    assert.equal(select([f]).full, true, f);
  assert.equal(select([]).full, true);
});

test("a source change runs the tests that run it and the page tests, not the whole suite", () => {
  const s = select(["src/app/executors/process.mjs"]);
  assert.equal(s.full, false);
  assert.equal(s.ui, true);
  assert.ok(s.node.length > 0 && s.node.length < s.nodeTotal);
});

test("a changed test file runs itself", () => {
  const s = select(["src/app/test/select-tests.test.mjs"]);
  assert.deepEqual(s.node, ["src/app/test/select-tests.test.mjs"]);
});

test("the test map names only test files that exist", () => {
  const map = JSON.parse(
    fs.readFileSync("scripts/test/test-map.json", "utf8"),
  ).files;
  for (const tests of Object.values(map))
    for (const t of tests) assert.ok(fs.existsSync(t), t);
});

test("a page source change runs the class check against Kiro Crew's stylesheet", () => {
  const s = select(["kirocrew-app/ui/src/Badge.tsx"]);
  assert.equal(s.ui, true);
  assert.ok(s.uiFiles.includes("kirocrew-app/ui/test/host-classes.test.mjs"));
});
