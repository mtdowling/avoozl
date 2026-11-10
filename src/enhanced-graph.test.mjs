import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("dependency relationship scope can be chosen before selecting a task", () => {
  const source = fs.readFileSync(
    new URL("./web/EnhancedGraph.tsx", import.meta.url),
    "utf8",
  );

  const selector = source.match(
    /<select\s+aria-label="Choose dependency graph scope"[\s\S]*?<\/select>/,
  )?.[0];
  assert.ok(selector);
  assert.doesNotMatch(selector, /\bdisabled=/);
  assert.match(selector, /value="whole">Whole matching graph/);
  assert.match(selector, /value="immediate">Immediate context/);
  assert.match(source, /Click a task to show its immediate context/);
  assert.match(source, /selectedTask && <button onClick=\{\(\) => openTask\(selectedTask\)\}>Open task/);
});
