// The operation tables (operation-table.mjs) are the one list of operations:
// each has a class, an MCP policy and a handler, and no name is registered twice.
import assert from "node:assert/strict";
import test from "node:test";
import { OPERATIONS, TABLES } from "../operation-table.mjs";

const CLASSES = ["observe", "draft", "execute", "protect", "incident"];
const NAME = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)*$/;
const entries = Object.entries(TABLES).flatMap(([feature, table]) =>
  table.map((entry) => ({ feature, ...entry })),
);

test("every operation has a name, class, policy and handler", () => {
  assert.ok(entries.length > 200, "the tables hold the operations");
  for (const entry of entries) {
    const at = `${entry.feature}: ${entry.name}`;
    assert.match(entry.name, NAME, at);
    assert.ok(CLASSES.includes(entry.class), `${at} has no class`);
    assert.ok(
      ["routed", "person", "notOnMcp"].includes(entry.policy?.kind),
      `${at} has no policy`,
    );
    if (entry.policy.kind !== "routed")
      assert.ok(entry.policy.reason, `${at} has no reason`);
    assert.equal(typeof entry.handler, "function", `${at} has no handler`);
  }
});

test("no operation name is registered twice", () => {
  const names = entries.map((entry) => entry.name);
  const twice = names.filter((name, i) => names.indexOf(name) !== i);
  assert.deepEqual(twice, []);
  assert.equal(OPERATIONS.size, names.length);
});
