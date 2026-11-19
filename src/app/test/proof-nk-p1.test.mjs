// Proof nk-p1's plumbing (scripts/proof-nk-p1-live.mjs --agent fake). The
// fake worker and falsifier are both sure, so Avoozl's gate passes on its
// own, as it did for Claude Code in the owner's first live run. The
// script's hold must turn each pass into a person's decision: one Go ahead
// on one task, Investigate again then Go ahead on the other.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
  new URL("../../../scripts/proof-nk-p1-live.mjs", import.meta.url),
);

test(
  "nk-p1 holds every gate pass for the person's decisions",
  {
    timeout: 6 * 60_000,
    skip:
      process.platform === "win32" &&
      "the proof runs from the owner's macOS terminal",
  },
  (t) => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "nkp1-"));
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
    const root = path.join(parent, "run");
    execFileSync(
      process.execPath,
      [SCRIPT, "--root", root, "--agent", "fake"],
      {
        stdio: "ignore",
      },
    );
    const report = JSON.parse(
      fs.readFileSync(path.join(root, "report.json"), "utf8"),
    );
    assert.equal(report.pass, true, JSON.stringify(report.expected));
    const { tasks, decided, held } = report.state;
    assert.deepEqual(decided, {
      "nkp1-go": ["go"],
      "nkp1-again": ["again", "go"],
    });
    const decisions = (id) => tasks[id].rounds.map((r) => r.decision);
    assert.deepEqual(decisions("nkp1-go"), ["go"]);
    assert.deepEqual(decisions("nkp1-again"), ["again", "go"]);
    // Every round was a gate pass the hold caught.
    assert.deepEqual(held.map((h) => `${h.task}:${h.round}`).sort(), [
      "nkp1-again:1",
      "nkp1-again:2",
      "nkp1-go:1",
    ]);
  },
);
