// An opt-in watchdog for the Avoozl tick, run as `avoozl tick watchdog`. It
// reads one workspace's tick-health.json and posts a macOS notification when
// the last tick is older than --stale-minutes or ended in an error. It writes
// nothing, starts no tick, and changes no Avoozl state. Nothing installs it;
// see scripts/dev/tick-watchdog.plist.example and kirocrew-app/README.md
// "Tick watchdog".
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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

// Runs one check of the workspace at `root` and returns the exit status: 0
// healthy, 1 stale or failed (notified unless dryRun).
export function watchTick(root, { staleMinutes = 10, dryRun = false } = {}) {
  if (!(staleMinutes > 0)) throw Error("--stale-minutes must be above 0.");
  const problem = tickProblem(readHealth(root), { staleMinutes });
  if (!problem) return 0;
  console.log(problem);
  if (!dryRun) notify(problem);
  return 1;
}
