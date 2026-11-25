// A Kiro Crew script cron has a 120-second deadline, while one Avoozl tick
// may run repository checks longer than that. The cron starts this detached
// machine pass and returns the intents a completed pass already released.
// Per-workspace pass locks let a later runner skip a busy workspace while
// continuing every other enabled workspace. The pass runs from the engine
// build this machine moved to (engine.ts), else from this copy.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runPass } from "./tick-pass.ts";
import { openRunnerLog } from "./runner-log.ts";
import { engineRunner, recordEngineRan } from "./engine.ts";

const RUNNER = fileURLToPath(import.meta.url);

function launch(
  stateDirectory: string,
  configDirectory: string,
  env: NodeJS.ProcessEnv,
) {
  const output = openRunnerLog(path.join(stateDirectory, "tick-runner.log"));
  let child;
  try {
    // The engine build this machine moved to, else this copy (engine.ts).
    const runner = engineRunner(stateDirectory, RUNNER);
    child = spawn(process.execPath, [runner, stateDirectory, configDirectory], {
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
}: {
  stateDirectory?: string;
  configDirectory?: string;
  env?: NodeJS.ProcessEnv;
  start?: typeof launch;
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

export async function runTickPass(
  stateDirectory?: string,
  configDirectory?: string,
) {
  if (typeof stateDirectory !== "string" || typeof configDirectory !== "string")
    throw Error("The tick runner needs machine state and configuration paths.");
  await runPass({ stateDirectory, configDirectory, updateEngine: true });
  recordEngineRan(stateDirectory, RUNNER);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
)
  runTickPass(process.argv[2], process.argv[3]).catch((error) => {
    const failure = error as Error;
    console.error(failure.stack ?? failure.message ?? String(error));
    process.exitCode = 1;
  });
