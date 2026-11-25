import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  allTestFiles,
  needsChrome,
  osSensitive,
  planFor,
  shardOf,
  withoutChrome,
} from "../../../scripts/test/test-plan.ts";

const all = allTestFiles();
const sel = { node: all.node, uiFiles: all.ui };

test("the shards of a list are disjoint and together hold every file", () => {
  const files = [...all.node, ...all.ui];
  for (const n of [1, 2, 3]) {
    const parts = Array.from({ length: n }, (_, i) => shardOf(files, i + 1, n));
    const joined = parts.flat();
    assert.equal(new Set(joined).size, joined.length, `no file twice in ${n}`);
    assert.deepEqual(joined.sort(), [...files].sort(), `every file in ${n}`);
  }
});

test("a file not on the reviewed OS-neutral list counts as OS-sensitive", () => {
  assert.deepEqual(osSensitive(["src/app/test/brand-new.test.mjs"]), [
    "src/app/test/brand-new.test.mjs",
  ]);
  const { osNeutral } = JSON.parse(
    fs.readFileSync(
      new URL("../../../scripts/test/test-map.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(osNeutral.length > 0);
  assert.deepEqual(osSensitive(osNeutral), []);
  const tests = new Set([...all.node, ...all.ui]);
  for (const f of osNeutral) assert.ok(tests.has(f), `${f} is a test file`);
});

test("Linux keeps the whole selection and puts the Chrome page tests apart", () => {
  const linux = planFor(sel, "linux", { pullRequest: true });
  assert.ok(linux.chrome.length > 0);
  assert.ok(linux.chrome.every(needsChrome));
  assert.equal(
    linux.files.length + linux.chrome.length,
    all.node.length + all.ui.length,
  );
  assert.ok(!linux.files.some((f) => linux.chrome.includes(f)));
});

test("macOS and Windows run only OS-sensitive tests on a pull request, and all of them otherwise", () => {
  for (const system of ["macos", "windows"] as const) {
    const pr = planFor(sel, system, { pullRequest: true });
    const full = planFor(sel, system, { pullRequest: false });
    assert.deepEqual(pr.chrome, []);
    assert.deepEqual(pr.files, osSensitive(full.files));
    assert.ok(pr.files.length < full.files.length);
    assert.equal(full.files.length, all.node.length + all.ui.length);
  }
});

test("--no-chrome keeps every page test but the Chrome ones; only the local check passes it", () => {
  const kept = withoutChrome(all.ui);
  const chrome = all.ui.filter(needsChrome);
  assert.ok(chrome.length > 0 && kept.length > 0);
  assert.deepEqual([...kept, ...chrome].sort(), [...all.ui].sort());
  assert.ok(!kept.some(needsChrome));
  const read = (file: string) =>
    fs.readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
  const checks = JSON.parse(read(".avoozl.json")).repositories.avoozl.checks;
  assert.deepEqual(checks.test, [
    "npm",
    "run",
    "test:changed",
    "--",
    "--no-chrome",
  ]);
  assert.ok(!read(".github/workflows/test-shards.yml").includes("--no-chrome"));
});
