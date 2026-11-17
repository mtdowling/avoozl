import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { lintSpec, readSpecFolder } from "../spec-plans.mjs";
import { readDeliveryPolicy, warnRemovedBudgets } from "../tick.mjs";
import { parseHarnessDefinition } from "../harness-definitions.mjs";
import { fixture } from "./fixtures.mjs";
import { specFiles, writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// Budgets were removed 2026-11-17. Old keys must still load.
test("a workspace with old budget keys still loads and warns once", (t) => {
  const root = temporaryDirectory("avoozl-old-budgets-");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      budget: { usd: 5, mode: "stop", notify: true },
      prices: { version: 3 },
      projects: { app: { budget: { usd: 2, mode: "warn" } } },
    }),
  );
  const warnings = [];
  t.mock.method(console, "warn", (text) => warnings.push(text));
  assert.equal(readDeliveryPolicy(root).status, "loaded");
  assert.equal(readDeliveryPolicy(root).status, "loaded");
  assert.equal(warnings.length, 1, "one warning per process");
  assert.equal(warnRemovedBudgets({ version: 1 }), false);
});

test("a manifest with old budget keys still lints", () => {
  const files = specFiles(),
    manifest = JSON.parse(files["avoozl/manifest.json"]);
  manifest.budget = { usd: 6 };
  manifest.tasks["1.1"].budget = { usd: "not a number" };
  const root = temporaryDirectory("avoozl-old-manifest-");
  writeSpec(root, "config", {
    "avoozl/manifest.json": JSON.stringify(manifest),
  });
  const result = lintSpec({
    spec: readSpecFolder(root, "config"),
    plan: { id: "config" },
  });
  assert.deepEqual(result.diagnostics, []);
});

test("Flow usage still reads and sums without budgets", async (t) => {
  const { store } = fixture(t);
  const { Operations } = await import("../operations.mjs");
  const ops = new Operations(store, {});
  const view = await ops.execute("flow.view", {});
  assert.equal("budget" in view, false);
  assert.ok("usage" in view);
  await assert.rejects(ops.execute("budget.view", {}), /Unknown operation/);
});

test("a harness definition with an old spendCap loads", () => {
  assert.equal(
    parseHarnessDefinition({
      name: "old-cli",
      start: [
        "old-cli",
        "--cwd",
        "{worktree}",
        "--prompt-file",
        "{brief_file}",
      ],
      resume: ["old-cli", "--resume", "{session}"],
      permission: { write: "workspace-write", read: "read-only" },
      writeRoots: ["{worktree}", "{tmp}", "{project_cache_dirs}"],
      spendCap: ["--max", "{budget_usd}"],
    }).spendCap,
    undefined,
  );
});
