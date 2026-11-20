import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../../scripts/check/spec-lint.mjs", import.meta.url),
);

// Lint one spec folder `name` holding `files` in a temporary repository.
function lintFolder(name, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spec-lint-"));
  try {
    const folder = path.join(root, ".kiro", "specs", name);
    fs.mkdirSync(folder, { recursive: true });
    for (const [file, text] of Object.entries(files))
      fs.writeFileSync(path.join(folder, file), text);
    return spawnSync(process.execPath, [script, root], { encoding: "utf8" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("spec lint passes on this repository's specs", () => {
  const run = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /avoozl: 0 errors/);
});

test("spec lint fails on a spec with an error", () => {
  const run = lintFolder("bad", {
    "requirements.md": "# Bad\n",
    "design.md": "# Bad\n",
    "tasks.md": "- [ ] 1 One\n- [ ] 1 Same ID\n",
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /bad: [1-9]\d* errors/);
});

test("spec lint refuses a Status line and says approval lives in Avoozl", () => {
  const run = lintFolder("stale", {
    "requirements.md": "# Stale\n\nStatus: Draft\n",
    "design.md": "# Stale\n",
    "tasks.md": "- [ ] 1 One\n  - it works\n",
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /stale: 1 errors/);
  assert.match(run.stdout, /requirements\.md:3 .*approval lives in Avoozl/);
});

test("spec lint refuses tasks and requirements marked superseded or retired", () => {
  const run = lintFolder("old", {
    "requirements.md": [
      "# Old",
      "",
      "### Requirement 1: Kept",
      "",
      "1. A task MAY take status `superseded`.",
      "2. Retired.",
      "",
      "### Requirement 2: Ideas (retired)",
      "",
      "Superseded 2026-11-18 by Requirement 1.",
      "",
    ].join("\n"),
    "tasks.md": [
      "- [x] 1 Retired 2026-11-18",
      "  - nothing",
      "- [ ] 2 Two",
      "  - it works",
      "  - Superseded: proves a removed feature; not run.",
      "",
    ].join("\n"),
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /old: 5 errors/);
  for (const at of [
    "requirements.md:6",
    "requirements.md:8",
    "requirements.md:10",
    "tasks.md:1",
    "tasks.md:5",
  ])
    assert.match(
      run.stdout,
      new RegExp(`${at} .*marked superseded or retired`),
    );
  assert.doesNotMatch(run.stdout, /requirements\.md:5 /);
});
