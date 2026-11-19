import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../../scripts/spec-lint.mjs", import.meta.url),
);

test("spec lint passes on this repository's specs", () => {
  const run = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /avoozl: 0 errors/);
});

test("spec lint fails on a spec with an error", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spec-lint-"));
  try {
    const folder = path.join(root, ".kiro", "specs", "bad");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "requirements.md"), "# Bad\n");
    fs.writeFileSync(path.join(folder, "design.md"), "# Bad\n");
    fs.writeFileSync(
      path.join(folder, "tasks.md"),
      "- [ ] 1 One\n- [ ] 1 Same ID\n",
    );
    const run = spawnSync(process.execPath, [script, root], {
      encoding: "utf8",
    });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /bad: [1-9]\d* errors/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("spec lint refuses a Status line and says approval lives in Avoozl", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spec-lint-"));
  try {
    const folder = path.join(root, ".kiro", "specs", "stale");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, "requirements.md"),
      "# Stale\n\nStatus: Draft\n",
    );
    fs.writeFileSync(path.join(folder, "design.md"), "# Stale\n");
    fs.writeFileSync(
      path.join(folder, "tasks.md"),
      "---\nchecks: npm test\n---\n- [ ] 1 One\n  - Facts:\n    - done: it works\n",
    );
    const run = spawnSync(process.execPath, [script, root], {
      encoding: "utf8",
    });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /stale: 1 errors/);
    assert.match(run.stdout, /requirements\.md:3 .*approval lives in Avoozl/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
