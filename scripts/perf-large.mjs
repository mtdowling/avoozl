// Time the tick and the page reads on a large synthetic workspace, with the
// SQLite statements each one runs and the size of its reply.
//
//   node scripts/perf-large.mjs [--specs 60] [--keep DIR]
//
// Builds the workspace from src/app/test/large-workspace.mjs in a temporary
// folder (or DIR), prints one Markdown table, and removes the folder unless
// --keep names it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StatementSync } from "node:sqlite";
import { largeWorkspace } from "../src/app/test/large-workspace.mjs";

const args = process.argv.slice(2),
  option = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  },
  specs = Number(option("--specs") ?? 60),
  keep = option("--keep"),
  root = keep
    ? path.resolve(keep)
    : fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-perf-"));

// Count every statement run, whatever module prepared it.
let queries = 0;
for (const method of ["all", "get", "run", "iterate"]) {
  const original = StatementSync.prototype[method];
  StatementSync.prototype[method] = function (...values) {
    queries++;
    return original.apply(this, values);
  };
}

const building = Date.now(),
  built = await largeWorkspace(root, { specs }),
  { ops, store } = built;
console.error(
  JSON.stringify({
    ...built.counts,
    buildSeconds: (Date.now() - building) / 1000,
  }),
);

const cases = [
  ["tick (first)", "workspace.tick", {}, 1],
  ["tick (page)", "workspace.tick", {}],
  ["tick (cron)", "workspace.tick", { cron: true }],
  ["plan.specs", "plan.specs", {}],
  ["plan.table", "plan.table", {}],
  ["plan.list", "plan.list", { limit: 100 }],
  ["graph.view (full)", "graph.view", {}],
  ["graph.view (one epic)", "graph.view", { epic: built.epics[0] }],
  ["graph.view (one spec)", "graph.view", { spec: built.specs.at(-1) }],
  ["delivery.view", "delivery.view", {}],
  ["conflicts.view", "conflicts.view", {}],
  ["intake.list", "intake.list", {}],
  ["flow.view", "flow.view", {}],
];
const rows = [];
for (const [label, name, input, runs = 3] of cases) {
  const times = [];
  let count = 0,
    size = 0;
  for (let run = 0; run < runs; run++) {
    // Each read starts cold, as a fresh page load after a write would.
    store.cache = null;
    queries = 0;
    const started = process.hrtime.bigint(),
      result = await ops.execute(name, input);
    times.push(Number(process.hrtime.bigint() - started) / 1e6);
    count = queries;
    size = JSON.stringify(result).length;
  }
  // The median run, so one garbage collection does not decide the number.
  const ms = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
  rows.push([label, ms.toFixed(0), count, (size / 1024).toFixed(0)]);
}
// The Dashboard makes four of the reads above.
const sum = (labels, column) =>
  rows
    .filter((row) => labels.includes(row[0]))
    .reduce((total, row) => total + Number(row[column]), 0);
const dashboard = [
  "graph.view (full)",
  "delivery.view",
  "conflicts.view",
  "plan.list",
];
rows.push([
  "Dashboard (4 reads)",
  String(sum(dashboard, 1)),
  sum(dashboard, 2),
  String(sum(dashboard, 3)),
]);

console.log("| Operation | ms | SQLite statements | Reply KB |");
console.log("| --- | ---: | ---: | ---: |");
for (const row of rows) console.log(`| ${row.join(" | ")} |`);
store.close();
if (!keep) fs.rmSync(root, { recursive: true, force: true });
