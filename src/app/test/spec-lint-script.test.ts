import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../../scripts/check/spec-lint.ts", import.meta.url),
);

// Lint spec folders `{name: {file: text}}` in a temporary repository.
function lintSpecs(specs: Record<string, Record<string, string>>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spec-lint-"));
  try {
    for (const [name, files] of Object.entries(specs)) {
      const folder = path.join(root, ".kiro", "specs", name);
      fs.mkdirSync(folder, { recursive: true });
      for (const [file, text] of Object.entries(files))
        fs.writeFileSync(path.join(folder, file), text);
    }
    return spawnSync(process.execPath, [script, root], { encoding: "utf8" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const lintFolder = (name: string, files: Record<string, string>) =>
  lintSpecs({ [name]: files });

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
    "tasks.md": "- [ ] `1` One\n  - it works\n",
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
      "- [x] `1` Retired 2026-11-18",
      "  - nothing",
      "- [ ] `2` Two",
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

test("spec lint refuses a bare ID, an ID another spec holds, a task naming another spec's task, and other front-matter keys", () => {
  const run = lintSpecs({
    parser: {
      "tasks.md": [
        "- [ ] `p-1` Read tokens",
        "  - Each row is one token",
        "- [ ] p-2 Report unknown tokens",
        "  - Each unknown token has a line",
        "- [ ] `p-3` Count tokens",
        "  - Each file has a count",
        "",
      ].join("\n"),
      "design.md": "---\nkind: epic\nrepo: app\n---\n# Parser\n",
    },
    report: {
      "tasks.md": [
        "- [ ] `p-1` Reuse an ID",
        "  - It is refused",
        "- [ ] `r-1` Write the report",
        "  - It waits for `p-3`",
        "- [ ] `r-2` Read the parser spec",
        "  - The parser spec's tokens appear in the report",
        "",
      ].join("\n"),
    },
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /parser: 2 errors/);
  assert.match(run.stdout, /tasks\.md:3 Write task ID "p-2" as a code span/);
  assert.match(
    run.stdout,
    /design\.md:2 Front-matter key "kind" is not allowed/,
  );
  assert.doesNotMatch(run.stdout, /design\.md:3 /);
  assert.match(run.stdout, /report: 2 errors/);
  assert.match(
    run.stdout,
    /tasks\.md:1 Task ID "p-1" is already used by spec parser/,
  );
  assert.match(
    run.stdout,
    /tasks\.md:3 Task "r-1" names task p-3 of spec parser/,
  );
});
