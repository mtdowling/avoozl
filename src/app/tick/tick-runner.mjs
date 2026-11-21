// A Kiro Crew script cron has a 120-second deadline, while one Avoozl tick
// may run repository checks longer than that. The cron starts this detached
// machine pass and returns the intents a completed pass already released.
// Per-workspace pass locks let a later runner skip a busy workspace while
// continuing every other enabled workspace.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runPass } from "./tick-pass.mjs";

const RUNNER = fileURLToPath(import.meta.url);

function launch(stateDirectory, configDirectory, env) {
  fs.mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  const log = path.join(stateDirectory, "tick-runner.log"),
    output = fs.openSync(log, "a", 0o600);
  fs.chmodSync(log, 0o600);
  let child;
  try {
    child = spawn(process.execPath, [RUNNER, stateDirectory, configDirectory], {
      detached: true,
      stdio: ["ignore", output, output],
      env,
      windowsHide: true,
    });
  } finally {
    fs.closeSync(output);
  }
  if (!child.pid) throw Error("Avoozl could not start the machine tick.");
  child.on("error", () => {});
  child.unref();
  return child.pid;
}

export function startTickPass({
  stateDirectory,
  configDirectory,
  env = process.env,
  start = launch,
} = {}) {
  if (
    typeof stateDirectory !== "string" ||
    !path.isAbsolute(stateDirectory) ||
    typeof configDirectory !== "string" ||
    !path.isAbsolute(configDirectory)
  )
    throw Error(
      "The tick runner needs absolute machine state and configuration paths.",
    );
  return start(stateDirectory, configDirectory, env);
}

export async function runTickPass(stateDirectory, configDirectory) {
  await runPass({ stateDirectory, configDirectory });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
)
  runTickPass(process.argv[2], process.argv[3]).catch((error) => {
    console.error(error?.stack ?? error?.message ?? String(error));
    process.exitCode = 1;
  });
