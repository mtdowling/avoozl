#!/usr/bin/env node
// Runs the node tests and the page tests. With no flag, every test runs
// (`npm test`). `--changed [--base REV]` runs only what scripts/test/select-tests.mjs
// picks (`npm run test:changed`). `--ui` also runs the page tests after the
// node tests; `npm test` leaves them to `npm run test:ui`.
//
// CI narrows the list further (scripts/test/test-plan.mjs):
//   --system S --shard K/N   slice K of N of what system S runs (linux,
//                            macos or windows), balanced by measured time
//   --system linux --chrome-only   only the page tests that drive Chrome
// With --changed, macOS and Windows keep only the OS-sensitive files.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { machineAvoozlPaths } from "../../src/app/settings/host-config.mjs";
import { changedFiles, select } from "./select-tests.mjs";
import { allTestFiles, planFor, shardOf } from "./test-plan.mjs";

const args = process.argv.slice(2),
  changed = args.includes("--changed"),
  withUi = args.includes("--ui") || changed,
  base = args.includes("--base")
    ? args[args.indexOf("--base") + 1]
    : "origin/main";

// Most tests wait on child processes and the disk, so a few more than one per
// core keeps small CI runners busy; big machines keep one fewer than their
// cores. A local run also leaves room for what else the machine is doing:
// the cores the last minute's load already uses come off (at least 2 stay).
// Windows reports no load, so it keeps the full count.
const cores = os.availableParallelism(),
  most = Math.max(cores - 1, 8),
  load = process.env.CI ? 0 : Math.round(os.loadavg()[0]),
  concurrency = String(Math.max(2, Math.min(most, cores - load)));
console.log(
  `Test concurrency ${concurrency} (${cores} cores, 1-minute load ${process.env.CI ? "not used on CI" : load}).`,
);
// A local run keeps the person's own git settings out, as on a CI runner:
// a global core.fsmonitor alone starts a watcher process for every scratch
// repository and slows each git call.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-test-env-"));
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));
if (!process.env.CI && !process.env.GIT_CONFIG_GLOBAL) {
  process.env.GIT_CONFIG_GLOBAL = path.join(scratch, "gitconfig");
  fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, "");
}
// No test reads or writes the person's real Avoozl config or state. Every
// test process gets temporary XDG folders and no KIROCREW_HOME, and
// scripts/test/test-guard.mjs makes a write under a real folder throw.
const home = os.homedir(),
  real = machineAvoozlPaths(),
  guard = [
    real.configDirectory,
    real.stateDirectory,
    path.join(home, ".config", "avoozl"),
    path.join(home, ".local", "state", "avoozl"),
    path.join(home, ".kiro", "crew", "avoozl"),
    ...(process.env.LOCALAPPDATA
      ? [path.join(process.env.LOCALAPPDATA, "avoozl")]
      : []),
  ];
process.env.XDG_CONFIG_HOME = path.join(scratch, "config");
process.env.XDG_STATE_HOME = path.join(scratch, "state");
for (const dir of [process.env.XDG_CONFIG_HOME, process.env.XDG_STATE_HOME])
  fs.mkdirSync(dir);
delete process.env.KIROCREW_HOME;
process.env.AVOOZL_TEST_GUARD = JSON.stringify([...new Set(guard)]);
// Sandboxed children inherit NODE_OPTIONS, and their sandbox hides the home
// folder the checkout sits in, so the guard loads from the temp folder.
const guardFile = path.join(scratch, "test-guard.mjs");
fs.copyFileSync(path.join(import.meta.dirname, "test-guard.mjs"), guardFile);
process.env.NODE_OPTIONS = [
  process.env.NODE_OPTIONS,
  `--import=${pathToFileURL(guardFile).href}`,
]
  .filter(Boolean)
  .join(" ");
const node = (files) =>
  spawnSync(
    process.execPath,
    [
      "--test",
      `--test-concurrency=${concurrency}`,
      "--test-timeout=60000",
      ...files,
    ],
    { stdio: "inherit" },
  ).status ?? 1;

const flag = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : null;
const system = flag("--system"),
  shard = flag("--shard")?.split("/").map(Number),
  chromeOnly = args.includes("--chrome-only");
if (system && !["linux", "macos", "windows"].includes(system))
  throw Error("--system takes linux, macos or windows");
if (shard && !(shard[0] >= 1 && shard[0] <= shard[1]))
  throw Error("--shard takes K/N with 1 <= K <= N");
if ((shard || chromeOnly) && !system)
  throw Error("--shard and --chrome-only need --system");

let nodeFiles = ["src/*.test.mjs", "src/app/**/test/*.test.mjs"],
  uiFiles = ["kirocrew-app/ui/test/*.test.mjs"];
if (system && !changed) ({ node: nodeFiles, ui: uiFiles } = allTestFiles());
if (changed) {
  const sel = select(changedFiles(base));
  console.log(
    `Selected ${sel.node.length} of ${sel.nodeTotal} node test files and ${sel.uiFiles.length} of ${sel.uiTotal} page test files${sel.full ? " (full run)" : ""}.`,
  );
  for (const r of sel.reasons.slice(0, 12)) console.log(`  ${r}`);
  nodeFiles = sel.node;
  uiFiles = sel.uiFiles;
}
if (system) {
  const plan = planFor({ node: nodeFiles, uiFiles }, system, {
    pullRequest: changed,
  });
  const mine = new Set(
    chromeOnly
      ? plan.chrome
      : shard
        ? shardOf(plan.files, shard[0], shard[1])
        : plan.files,
  );
  nodeFiles = nodeFiles.filter((f) => mine.has(f));
  uiFiles = uiFiles.filter((f) => mine.has(f));
  console.log(
    `This run: ${nodeFiles.length} node test files and ${uiFiles.length} page test files.`,
  );
}
if (changed || system) {
  if (nodeFiles.length || uiFiles.length) {
    // Same prerequisites as npm's pretest.
    for (const script of ["check:agents", "build"]) {
      const r = spawnSync("npm", ["run", script, "--silent"], {
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      if (r.status) process.exit(r.status);
    }
  }
}
let status = nodeFiles.length ? node(nodeFiles) : 0;
if (withUi && uiFiles.length) {
  if (process.env.CI) process.env.AVOOZL_CHROME ??= "skip";
  status = node(uiFiles) || status;
}
process.exit(status);
