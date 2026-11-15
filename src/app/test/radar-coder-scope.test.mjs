import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SCOPE_RULE, SCOPE_STATEMENT } from "../../work-split.mjs";

// rc-13.1: one source string; the README and Set up show the same words.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the statement names epics, the other tools, and any coder", () => {
  assert.match(SCOPE_STATEMENT, /epics/);
  assert.match(SCOPE_STATEMENT, /Maintenance, triage and one-off pull request/);
  assert.match(SCOPE_STATEMENT, /any coder/);
  assert.match(SCOPE_RULE, /fits in one pull request/);
  assert.match(SCOPE_RULE, /needs a plan with an order/);
});

test("the README shows the same words", () => {
  const readme = read("../../../README.md").replace(/\s+/g, " ");
  assert.ok(readme.includes(SCOPE_STATEMENT));
  assert.ok(readme.includes(SCOPE_RULE));
});

test("Set up imports the string and does not repeat it", () => {
  const source = read("../../../kirocrew-app/ui/src/SetupWizard.tsx");
  assert.match(source, /SCOPE_STATEMENT/);
  assert.match(source, /SCOPE_RULE/);
  assert.ok(!source.includes("maintenance, triage"));
});
