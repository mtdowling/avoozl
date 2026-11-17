// The tick on a headless machine (R95.3, design §4.28). With no Kiro Crew,
// no cron runs the tick and no app backend hands `process` requests to the
// supervisor, so `avoozl supervisor --tick` runs this, in its own process,
// for every enabled workspace in the machine catalog: the tick, then the
// hand-off of `process` session requests, then the queued checks.
// shortcut: intents for the `kirocrew` executor stay queued here, since no
// Kiro Crew runs; a headless machine's projects use `process`.
import fs from "node:fs";
import path from "node:path";
import { Store } from "./store.mjs";
import { Operations } from "./operations.mjs";
import { workspaceConfig } from "./config.mjs";
import { driverSettingsPath } from "./driver.mjs";
import { WorkspaceRegistry } from "./host-config.mjs";
import { prepareWorktree } from "./delivery.mjs";
import { drainProcessRequests } from "./executors/process.mjs";
import { drainCheckRuns } from "./check-runs.mjs";

// The enabled workspace roots in the machine catalog, synced from the
// machine config first so a hand edit counts.
export function catalogTickRoots({ stateDirectory, configDirectory }) {
  const registry = new WorkspaceRegistry({
    configPath: path.join(path.resolve(configDirectory), "config.json"),
    catalogPath: path.join(path.resolve(stateDirectory), "catalog.sqlite"),
  });
  try {
    return registry
      .list()
      .filter((workspace) => workspace.enabled)
      .map((workspace) => workspace.root);
  } finally {
    registry.close();
  }
}

// One workspace: returns {root, tick, errors} or {root, skipped}.
export async function tickWorkspace(root, { stateDirectory, configDirectory }) {
  const target = workspaceConfig({
    workspace: root,
    env: { ...process.env, AVOOZL_WORKSPACE: root },
  });
  if (!fs.existsSync(target.dbPath))
    return { root, skipped: "The workspace is not initialized." };
  const store = new Store(target.dbPath);
  try {
    if (!store.initialized())
      return { root, skipped: "The workspace is not initialized." };
    const ops = new Operations(store, {
      operator: target.operator,
      workspaceRoot: target.workspaceRoot,
      plansRoot: target.plansRoot,
      configDirectory,
      driver: { settingsFile: driverSettingsPath() },
    });
    const tick = await ops.execute("workspace.tick", { cron: true });
    const { errors } = await drainProcessRequests(store, {
      stateDirectory,
      prepareWorktree,
      ops,
    });
    // Awaited, unlike the app backend's, since the store closes after.
    await drainCheckRuns(store);
    return {
      root,
      tick: tick?.skipped ? { skipped: tick.skipped } : "ran",
      errors,
    };
  } finally {
    store.close();
  }
}

// Every enabled workspace in turn; one failure never stops the rest.
export async function tickCatalog(paths) {
  const results = [];
  for (const root of catalogTickRoots(paths))
    try {
      results.push(await tickWorkspace(root, paths));
    } catch (error) {
      results.push({ root, error: error.message });
    }
  return results;
}
