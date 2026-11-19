import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../../scripts/dev/live-harness.sh", import.meta.url),
);

test("harness.sh parses and offers route-avoozl", () => {
  assert.equal(spawnSync("bash", ["-n", script]).status, 0);
  const text = fs.readFileSync(script, "utf8");
  assert.match(text, /^\s+route-avoozl\)/m);
  // The override alone leaves the server unwrapped: the launch must be approved.
  assert.match(text, /servers\/stub/);
});
