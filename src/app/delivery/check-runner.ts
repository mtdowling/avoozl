// A repository's checks may run for twenty minutes, longer than a timer tick.
// The tick starts one detached runner per ready repository and returns. Each
// runner opens the workspace database, drains only that repository's queue,
// records the results there, and exits. The next tick judges those results.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Store } from "../store/store.ts";
import { drainCheckRuns, runnableCheckRepositories } from "./check-runs.ts";
import { openRunnerLog } from "../tick/runner-log.ts";

const RUNNER = fileURLToPath(import.meta.url);

function launch(dbPath: string, repositoryId: string, env: NodeJS.ProcessEnv) {
  const output = openRunnerLog(
    path.join(path.dirname(dbPath), "check-runner.log"),
  );
  let child;
  try {
    child = spawn(process.execPath, [RUNNER, dbPath, repositoryId], {
      detached: true,
      stdio: ["ignore", output, output],
      env,
      windowsHide: true,
    });
  } finally {
    fs.closeSync(output);
  }
  if (!child.pid)
    throw Error(`Avoozl could not start checks for ${repositoryId}.`);
  child.on("error", () => {});
  child.unref();
  return child.pid;
}

export function startCheckRunners(
  store: Store,
  {
    dbPath,
    env = process.env,
    start = launch,
  }: {
    dbPath?: string;
    env?: NodeJS.ProcessEnv;
    start?: typeof launch;
  } = {},
) {
  if (typeof dbPath !== "string" || !path.isAbsolute(dbPath))
    throw Error("The check runner needs an absolute workspace database path.");
  return runnableCheckRepositories(store).map((repositoryId) => ({
    repositoryId,
    pid: start(dbPath, repositoryId, env),
  }));
}

export async function runCheckRunner(dbPath?: string, repositoryId?: string) {
  if (
    typeof dbPath !== "string" ||
    !path.isAbsolute(dbPath) ||
    typeof repositoryId !== "string" ||
    !repositoryId
  )
    throw Error("The check runner needs a database and repository.");
  const store = new Store(dbPath);
  try {
    await drainCheckRuns(store, { repositoryIds: [repositoryId] });
  } finally {
    store.close();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
)
  runCheckRunner(process.argv[2], process.argv[3]).catch((error) => {
    const failure = error as Error;
    console.error(failure.stack ?? failure.message ?? String(error));
    process.exitCode = 1;
  });
