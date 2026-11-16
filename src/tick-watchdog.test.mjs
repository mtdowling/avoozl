// scripts/tick-watchdog.mjs: stale and failed ticks are problems; a fresh one
// is not. It only reads.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { readHealth, tickProblem } from "../scripts/tick-watchdog.mjs";
import { temporaryDirectory } from "./app/test/temporary.mjs";

const now = Date.parse("2026-11-15T12:00:00Z");
const at = (minutes) => new Date(now - minutes * 60_000).toISOString();

test("a fresh ok tick is healthy; old, failed or missing ones are not", () => {
  assert.equal(tickProblem({ at: at(2), outcome: "ok" }, { now }), null);
  assert.match(
    tickProblem({ at: at(25), outcome: "ok" }, { now }),
    /last ran 25 min ago/,
  );
  assert.equal(
    tickProblem({ at: at(25), outcome: "ok" }, { now, staleMinutes: 30 }),
    null,
  );
  assert.match(
    tickProblem({ at: at(1), outcome: "error", error: "boom" }, { now }),
    /failed: boom/,
  );
  assert.match(tickProblem(null, { now }), /no tick health/);
});

test("it reads the workspace's tick-health.json", () => {
  const root = temporaryDirectory("avoozl-watchdog-");
  assert.equal(readHealth(root), null);
  fs.mkdirSync(path.join(root, ".avoozl", "local"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".avoozl", "local", "tick-health.json"),
    JSON.stringify({ at: at(1), outcome: "ok" }),
  );
  assert.equal(readHealth(root).outcome, "ok");
});
