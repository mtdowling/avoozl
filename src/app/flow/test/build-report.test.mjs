import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  comparisonKey,
  isReportArtifact,
  parseBuildReport,
  reportsFromArtifact,
  reportsFromReceipts,
  validateReportSetting,
} from "../build-report.mjs";
import { parseReceipts } from "../build-receipt.mjs";
import { loadLayeredConfig } from "../../settings/layered-config.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

// Made-up names only (Requirement 101.8).
const report = (extra = {}) => ({
  format: "avoozl.build-report",
  v: 1,
  workload: "widget-suite",
  engine: "engine-a",
  target: "target-x",
  toolchain: "seed-0001",
  cache: "warm",
  costs: { build: 1200, provisioning: 300, cache: 50, test: 4000 },
  parts: [
    { name: "compile-gadget", kind: "build", ms: 900 },
    { name: "fetch-seed", kind: "provisioning", ms: 300 },
  ],
  counters: { units: 42 },
  ...extra,
});

const receiptLine = (extra = {}) => ({
  v: 1,
  task: "1.1",
  attempt: 2,
  phase: "test",
  commit: "abc1234",
  command: "make check",
  target: "target-x",
  start: "warm",
  ms: 5550,
  exit: 0,
  counters: {},
  at: "2026-01-01T00:00:00Z",
  ...extra,
});

test("parseBuildReport reads a version 1 report", () => {
  const { breakdown } = parseBuildReport(report());
  assert.equal(breakdown.workload, "widget-suite");
  assert.deepEqual(breakdown.costs, {
    build: 1200,
    provisioning: 300,
    cache: 50,
    test: 4000,
  });
  assert.equal(breakdown.parts.length, 2);
  assert.deepEqual(breakdown.counters, { units: 42 });
});

test("parseBuildReport skips an unknown version or a missing field", () => {
  assert.deepEqual(parseBuildReport(report({ v: 2 })), { skip: "version" });
  assert.deepEqual(parseBuildReport(report({ format: "other" })), {
    skip: "version",
  });
  assert.deepEqual(parseBuildReport(report({ engine: undefined })), {
    skip: "missing:engine",
  });
  assert.deepEqual(
    parseBuildReport(
      report({ costs: { build: 1, provisioning: 2, cache: 3 } }),
    ),
    { skip: "missing:costs.test" },
  );
  assert.deepEqual(parseBuildReport(report({ cache: "x".repeat(33) })), {
    skip: "invalid:cache",
  });
  assert.deepEqual(
    parseBuildReport(report({ parts: [{ name: "p", kind: "other", ms: 1 }] })),
    { skip: "invalid:parts" },
  );
  assert.deepEqual(parseBuildReport("text"), { skip: "not-object" });
});

test("comparisonKey needs all five fields", () => {
  const key = comparisonKey(parseBuildReport(report()).breakdown);
  assert.equal(
    key,
    JSON.stringify([
      "widget-suite",
      "engine-a",
      "target-x",
      "seed-0001",
      "warm",
    ]),
  );
  assert.notEqual(
    comparisonKey(parseBuildReport(report({ cache: "cold" })).breakdown),
    key,
  );
  assert.equal(comparisonKey({ ...report(), toolchain: null }), null);
  assert.equal(comparisonKey({ ...report(), engine: "" }), null);
  assert.equal(comparisonKey(null), null);
});

test("field form reads reports from receipt lines and counts skips", () => {
  const text = [
    receiptLine({ breakdown: report() }),
    receiptLine({ breakdown: report({ v: 9 }) }),
    receiptLine({ breakdown: report({ workload: undefined }) }),
    receiptLine({ phase: "lint" }),
  ]
    .map((line) => JSON.stringify(line))
    .concat("not json")
    .join("\n");
  const result = reportsFromReceipts(text, { field: "breakdown" });
  assert.equal(result.breakdowns.length, 1);
  assert.equal(result.skipped, 2);
  assert.deepEqual(result.reasons, { version: 1, "missing:workload": 1 });
  // The receipt line fills task, attempt, commit and time.
  const [b] = result.breakdowns;
  assert.equal(b.task, "1.1");
  assert.equal(b.attempt, 2);
  assert.equal(b.commit, "abc1234");
  // The receipt parser still keeps the lines; the bad one is its skip.
  const receipts = parseReceipts(text);
  assert.equal(receipts.records.length, 4);
  assert.equal(receipts.skipped, 1);
  assert.deepEqual(reportsFromReceipts(text, null).breakdowns, []);
});

test("artifact form reads one report per line and counts skips", () => {
  const text = [
    JSON.stringify(report({ task: "2.3", attempt: 1 })),
    JSON.stringify(report({ target: "target-y" })),
    JSON.stringify(report({ v: 0 })),
    JSON.stringify(report({ costs: undefined })),
    "{broken",
    "",
  ].join("\n");
  const result = reportsFromArtifact(text);
  assert.equal(result.breakdowns.length, 2);
  assert.equal(result.breakdowns[0].task, "2.3");
  assert.equal(result.breakdowns[1].attempt, 1);
  assert.equal(result.skipped, 3);
  assert.deepEqual(result.reasons, {
    version: 1,
    "missing:costs": 1,
    json: 1,
  });
  assert.equal(
    isReportArtifact("gadget-report-linux", { artifact: "gadget-report" }),
    true,
  );
  assert.equal(
    isReportArtifact("build-receipt-linux", { artifact: "gadget-report" }),
    false,
  );
  assert.equal(
    isReportArtifact("gadget-report", { field: "breakdown" }),
    false,
  );
});

test("receipts.report is a field or an artifact prefix", () => {
  assert.equal(validateReportSetting(undefined), null);
  assert.deepEqual(validateReportSetting({ field: "breakdown" }), {
    field: "breakdown",
  });
  assert.deepEqual(validateReportSetting({ artifact: "gadget-report" }), {
    artifact: "gadget-report",
  });
  for (const bad of [
    "breakdown",
    {},
    { field: "a", artifact: "b" },
    { file: "breakdown" },
    { field: "has space" },
    { field: "ms" },
    { artifact: "build-receipt-x" },
    { artifact: "../x" },
  ])
    assert.throws(() => validateReportSetting(bad), /receipts\.report/);
});

test("loading configuration checks receipts.report", () => {
  const workspaceRoot = temporaryDirectory("avoozl-report-config-"),
    xdg = temporaryDirectory("avoozl-report-xdg-"),
    env = { XDG_CONFIG_HOME: xdg },
    file = path.join(workspaceRoot, ".avoozl.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      receipts: { report: { field: "breakdown" } },
    }),
  );
  assert.deepEqual(
    loadLayeredConfig({ workspaceRoot, env }).config.receipts.report,
    { field: "breakdown" },
  );
  fs.writeFileSync(
    file,
    JSON.stringify({ version: 1, receipts: { report: { both: true } } }),
  );
  assert.throws(
    () => loadLayeredConfig({ workspaceRoot, env }),
    /receipts\.report/,
  );
});
