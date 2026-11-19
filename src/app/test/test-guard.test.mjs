// scripts/test/test-guard.mjs: a test process that writes under a guarded folder
// fails; reads and writes elsewhere go on.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { temporaryDirectory } from "./temporary.mjs";

const GUARD = pathToFileURL(
  path.join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "scripts",
    "test",
    "test-guard.mjs",
  ),
).href;

test("a write under a guarded folder throws; one elsewhere does not", () => {
  const root = temporaryDirectory("avoozl-guard-"),
    real = path.join(root, "real"),
    free = path.join(root, "free");
  fs.mkdirSync(real);
  fs.mkdirSync(free);
  fs.writeFileSync(path.join(real, "config.json"), "{}");
  const script = `
    import fs, { writeFileSync } from "node:fs";
    import path from "node:path";
    const real = ${JSON.stringify(real)}, free = ${JSON.stringify(free)};
    const tries = {
      writeFileSync: () => fs.writeFileSync(path.join(real, "config.json"), "x"),
      named: () => writeFileSync(path.join(real, "a.json"), "x"),
      mkdirSync: () => fs.mkdirSync(path.join(real, "d"), { recursive: true }),
      renameInto: () => {
        fs.writeFileSync(path.join(free, "t"), "x");
        fs.renameSync(path.join(free, "t"), path.join(real, "t"));
      },
      openWrite: () => fs.openSync(path.join(real, "config.json"), "a"),
      promises: () => fs.promises.writeFile(path.join(real, "p.json"), "x"),
    };
    const refused = [];
    for (const [name, f] of Object.entries(tries))
      try { await f(); } catch (e) { if (/real Avoozl folder/.test(e.message)) refused.push(name); }
    fs.readFileSync(path.join(real, "config.json"), "utf8");
    fs.writeFileSync(path.join(free, "ok.json"), "x");
    console.log(JSON.stringify(refused));
  `;
  const run = spawnSync(
    process.execPath,
    ["--import", GUARD, "--input-type=module", "-e", script],
    {
      encoding: "utf8",
      env: { ...process.env, AVOOZL_TEST_GUARD: JSON.stringify([real]) },
    },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), [
    "writeFileSync",
    "named",
    "mkdirSync",
    "renameInto",
    "openWrite",
    "promises",
  ]);
  assert.equal(fs.readFileSync(path.join(real, "config.json"), "utf8"), "{}");
  assert.equal(fs.existsSync(path.join(free, "ok.json")), true);
});
