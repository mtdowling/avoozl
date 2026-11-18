#!/usr/bin/env node
// Splits the selected tests across CI shards and operating systems. Used by
// scripts/run-tests.mjs and, as a script, by the plan job in
// .github/workflows/test.yml:
//
//   node scripts/test-plan.mjs [--base REV] [--full] [--github-output]
//
// prints, for each system, how many test files it runs and in how many shards.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  changedFiles,
  nodeTestFiles,
  select,
  uiTestFiles,
} from "./select-tests.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

export const allTestFiles = () => ({
  node: nodeTestFiles(),
  ui: uiTestFiles(),
});

// A page test that drives a real Chrome. Linux CI runs these in their own
// shard with Chrome; elsewhere they run with Chrome skipped.
export const needsChrome = (file) =>
  fs.readFileSync(path.join(root, file), "utf8").includes("findChrome");

// scripts/test-map.json lists, in "osNeutral", the test files a person has
// reviewed and found to give the same result on every system: they start no
// process, touch no file system or git, and read no path or line ending. Any
// file not listed, including a new one, counts as OS-sensitive.
export function osSensitive(files) {
  const neutral = new Set(readJson("scripts/test-map.json").osNeutral ?? []);
  return files.filter((f) => !neutral.has(f));
}

let times;
// Milliseconds each file took alone (scripts/test-times.json); a file without
// a measurement counts as the median.
export function cost(file) {
  if (!times) {
    try {
      times = readJson("scripts/test-times.json").times;
    } catch {
      times = {};
    }
    const known = Object.values(times).sort((a, b) => a - b);
    times.median = known[Math.floor(known.length / 2)] ?? 1;
  }
  return times[file] ?? times.median;
}

// Splits files into n groups of about equal measured time (longest file
// first, into the lightest group), and returns group k of n (k from 1). The
// groups are disjoint and together hold every file.
export function shardOf(files, k, n) {
  const groups = Array.from({ length: n }, () => ({ total: 0, files: [] }));
  for (const f of [...files].sort(
    (a, b) => cost(b) - cost(a) || (a < b ? -1 : 1),
  )) {
    const lightest = groups.reduce((a, b) => (b.total < a.total ? b : a));
    lightest.files.push(f);
    lightest.total += cost(f);
  }
  return groups[k - 1].files.sort();
}

// What one CI system runs. Linux runs the whole selection, with the Chrome
// page tests in their own shard; macOS and Windows run the OS-sensitive part
// on a pull request and everything otherwise.
export function planFor(sel, system, { pullRequest }) {
  let node = sel.node,
    ui = sel.uiFiles;
  if (pullRequest && system !== "linux") {
    node = osSensitive(node);
    ui = osSensitive(ui);
  }
  const chrome = system === "linux" ? ui.filter(needsChrome) : [];
  const sharded = [...node, ...ui.filter((f) => !chrome.includes(f))];
  return { files: sharded, chrome };
}

// Shards for a list: one per SHARD_MS of measured time on this system, at most
// three. Each shard pays for its own install and build, so a small selection
// gets one. Windows runs the same tests about 2.5 times slower than Linux.
const SHARD_MS = 40_000,
  CONCURRENCY = 8,
  SLOWER = { linux: 1, macos: 1.5, windows: 2.5 };
export function shardCount(files, system) {
  if (!files.length) return 0;
  const ms =
    (files.reduce((t, f) => t + cost(f), 0) * SLOWER[system]) / CONCURRENCY;
  return Math.min(3, Math.max(1, Math.ceil(ms / SHARD_MS)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    at = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null),
    full = args.includes("--full");
  const sel = select(full ? [] : changedFiles(at("--base") ?? "origin/main"));
  const out = [];
  for (const system of ["linux", "macos", "windows"]) {
    const { files, chrome } = planFor(sel, system, { pullRequest: !full });
    const n = shardCount(files, system);
    console.log(
      `${system}: ${files.length} test files in ${n} shard(s)${chrome.length ? `, ${chrome.length} Chrome page test files in one more` : ""}`,
    );
    out.push(
      `${system}=${JSON.stringify(Array.from({ length: n }, (_, i) => `${i + 1}/${n}`))}`,
      `${system}-chrome=${chrome.length ? "true" : "false"}`,
    );
  }
  if (args.includes("--github-output") && process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, out.join("\n") + "\n");
}
