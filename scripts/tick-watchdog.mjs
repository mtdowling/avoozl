#!/usr/bin/env node
// An opt-in watchdog for the Avoozl tick. It reads one workspace's
// tick-health.json and posts a macOS notification when the last tick is older
// than --stale-minutes or ended in an error. It writes nothing, starts no
// tick, and changes no Avoozl state. Nothing installs it; see
// scripts/tick-watchdog.plist.example and README "Tick watchdog".
//
//   node scripts/tick-watchdog.mjs --workspace ROOT [--stale-minutes 10]
//     [--dry-run]
//
// Exit status: 0 healthy, 1 stale or failed (notified), 2 bad arguments.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// What the watchdog says about one health receipt, or null when healthy.
export function tickProblem(health, { now = Date.now(), staleMinutes = 10 }) {
  if (!health) return "Avoozl has no tick health yet.";
  const at = Date.parse(health.at);
  if (!Number.isFinite(at)) return "Avoozl's tick health has no time.";
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes > staleMinutes)
    return `Avoozl's tick last ran ${minutes} min ago.`;
  if (health.outcome === "error")
    return `Avoozl's last tick failed: ${String(health.error || "unknown error").slice(0, 120)}`;
  return null;
}

export function readHealth(root) {
  const file = path.join(root, ".avoozl", "local", "tick-health.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    return { at: null, outcome: "error", error: `unreadable ${file}` };
  }
}

function notify(text) {
  // osascript takes the text as an argument, never as script source.
  execFileSync("osascript", [
    "-e",
    "on run argv",
    "-e",
    'display notification (item 1 of argv) with title "Avoozl"',
    "-e",
    "end run",
    text,
  ]);
}

function main(argv) {
  const options = { staleMinutes: 10, dryRun: false, workspace: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--workspace") options.workspace = argv[++i];
    else if (argv[i] === "--stale-minutes")
      options.staleMinutes = Number(argv[++i]);
    else if (argv[i] === "--dry-run") options.dryRun = true;
    else return usage(`unknown argument ${argv[i]}`);
  }
  if (!options.workspace) return usage("--workspace ROOT is required");
  if (!(options.staleMinutes > 0))
    return usage("--stale-minutes must be above 0");
  const problem = tickProblem(readHealth(path.resolve(options.workspace)), {
    staleMinutes: options.staleMinutes,
  });
  if (!problem) return 0;
  console.log(problem);
  if (!options.dryRun) notify(problem);
  return 1;
}

function usage(text) {
  console.error(
    `${text}\nUsage: tick-watchdog.mjs --workspace ROOT [--stale-minutes N] [--dry-run]`,
  );
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2));
