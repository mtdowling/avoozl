import assert from "node:assert/strict";
import test from "node:test";
import { taskDefinition } from "../task-outcomes.mjs";
import { specHash } from "../spec-plans.mjs";
import { specFiles } from "../../test/spec-fixture.mjs";

const entry = {
  kind: "leaf",
  summary: "Read the config file.",
  acceptance: ["A missing file yields defaults."],
  checks: ["npm test"],
};
const definition = taskDefinition(entry);

test("the definition digest ignores key order and sees any change", () => {
  const reordered = Object.fromEntries(Object.entries(entry).reverse());
  assert.equal(taskDefinition(reordered), definition);
  assert.notEqual(
    taskDefinition({ ...entry, checks: ["npm test", "git diff --check"] }),
    definition,
  );
});

test("branch checkmarks stay outside the revision hash", () => {
  const files = specFiles(),
    checked = {
      ...files,
      "tasks.md": files["tasks.md"].replace("[ ] 1.1", "[x] 1.1"),
    };
  assert.notEqual(checked["tasks.md"], files["tasks.md"]);
  assert.equal(specHash(checked), specHash(files));
});
