import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const script = path.join(repoRoot, "scripts", "check", "dup.mjs");

// A function long enough to count as a clone when copied.
const BODY = `export function summarize(rows, options = {}) {
  const totals = { count: 0, failed: 0, skipped: 0, names: [] };
  for (const row of rows) {
    totals.count += 1;
    if (row.state === "failed") totals.failed += row.weight ?? 1;
    else if (row.state === "skipped") totals.skipped += row.weight ?? 1;
    if (options.names !== false) totals.names.push(String(row.name).trim());
  }
  totals.names.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return { ...totals, ok: totals.failed === 0 && totals.count > 0 };
}
`;

function repo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dup-script-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: dir });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  fs.copyFileSync(
    path.join(repoRoot, ".jscpd.json"),
    path.join(dir, ".jscpd.json"),
  );
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "a.mjs"), BODY);
  git("add", ".");
  git("commit", "-q", "-m", "Start");
  const run = (...args) =>
    spawnSync(process.execPath, [script, ...args], {
      cwd: dir,
      encoding: "utf8",
    });
  return { dir, git, run };
}

test("dup:changed fails on a new copy and passes once it is gone", (t) => {
  const { dir, run } = repo(t);
  assert.equal(run("--changed", "--base", "main").status, 0);
  fs.writeFileSync(path.join(dir, "src", "b.mjs"), `// Copy.\n${BODY}`);
  const copied = run("--changed", "--base", "main");
  assert.equal(copied.status, 1, copied.stdout + copied.stderr);
  assert.match(copied.stdout, /new .*src\/a\.mjs.*src\/b\.mjs/);
  fs.writeFileSync(path.join(dir, "src", "b.mjs"), "export const b = 1;\n");
  assert.equal(run("--changed", "--base", "main").status, 0);
});

test("dup fails when duplication grows and --update only lowers the baseline", (t) => {
  const { dir, run } = repo(t);
  const baseline = path.join(dir, "scripts", "check", "dup-baseline.json");
  fs.mkdirSync(path.dirname(baseline), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "b.mjs"), `// Copy.\n${BODY}`);
  const write = (lines) =>
    fs.writeFileSync(
      baseline,
      JSON.stringify({ duplicatedLines: lines, percentage: 0 }),
    );
  write(0);
  assert.equal(run().status, 1);
  assert.equal(run("--update").status, 1);
  assert.equal(
    JSON.parse(fs.readFileSync(baseline, "utf8")).duplicatedLines,
    0,
  );
  write(1000);
  assert.equal(run().status, 0);
  assert.equal(run("--update").status, 0);
  const lowered = JSON.parse(fs.readFileSync(baseline, "utf8"));
  assert.ok(lowered.duplicatedLines > 0 && lowered.duplicatedLines < 1000);
});
