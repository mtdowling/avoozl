// The tick on a headless machine (R95.3, design §4.28). With no Kiro Crew,
// no cron runs the tick and no app backend hands `process` requests to the
// supervisor, so `avoozl supervisor --tick` runs this, in its own process,
// for every enabled workspace in the machine catalog: the tick, then the
// hand-off of `process` session requests, the queued checks, then the
// queued notifications to this machine's sinks (NK7.1).
// A start for the `kirocrew` executor is not left queued with no word: with
// no Kiro Crew seen lately, it opens one Needs you item per role (NK8.2).
import fs from "node:fs";
import path from "node:path";
import { Store } from "../store/store.mjs";
import { Operations } from "../api/operations.mjs";
import { workspaceConfig } from "../settings/config.mjs";
import { driverSettingsPath } from "../workers/driver.mjs";
import { WorkspaceRegistry } from "../settings/host-config.mjs";
import { prepareWorktree } from "../delivery/delivery.mjs";
import { drainProcessRequests } from "../executors/process.mjs";
import { drainCheckRuns } from "../delivery/check-runs.mjs";
import { machineFile } from "./crews.mjs";
import { sinkPushers, validateNotifications } from "./notification-sinks.mjs";
import { needsKirocrewStep } from "./needs-kirocrew.mjs";

// The enabled workspace roots in the machine catalog, synced from the
// machine config first so a hand edit counts.
function catalogTickRoots({ stateDirectory, configDirectory }) {
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
// `sinks` is [{id, push}] (notifications.mjs deliverToSinks); with none, the
// notifications wait and `avoozl status` counts them.
export async function tickWorkspace(
  root,
  { stateDirectory, configDirectory, sinks = [] },
) {
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
      notifier: sinks,
    });
    const tick = await ops.execute("workspace.tick", { cron: true });
    const { errors } = await drainProcessRequests(store, {
      stateDirectory,
      prepareWorktree,
      ops,
    });
    // Awaited, unlike the app backend's, since the store closes after.
    await drainCheckRuns(store);
    needsKirocrewStep(store);
    // The same delivery the app backend runs. A sink's failure is recorded
    // on the sink and never fails the tick.
    let notifications;
    try {
      notifications = await ops.execute("notifications.deliver", {});
    } catch (error) {
      errors.push({ id: "notifications", error: error.message });
    }
    return {
      root,
      tick: tick?.skipped ? { skipped: tick.skipped } : "ran",
      errors,
      ...(notifications ? { notifications } : {}),
    };
  } finally {
    store.close();
  }
}

// This machine's sinks, from `notifications.sinks` in the machine file
// (NK7.2). A bad value sends nothing and says why. With the standalone page
// on a fixed port, each link opens that page (direct-links D3).
export function machineSinks(file) {
  const { value } = machineFile(file),
    serve = value.serve,
    pageUrl =
      serve?.enabled === true && Number.isInteger(serve.port)
        ? `http://127.0.0.1:${serve.port}/apps/avoozl`
        : null;
  return sinkPushers(validateNotifications(value.notifications).sinks, {
    pageUrl,
  });
}

// Every enabled workspace in turn; one failure never stops the rest.
export async function tickCatalog(paths) {
  const results = [];
  let sinks = paths.sinks;
  if (!sinks)
    try {
      sinks = machineSinks(
        paths.configDirectory
          ? path.join(path.resolve(paths.configDirectory), "config.json")
          : undefined,
      );
    } catch (error) {
      sinks = [];
      results.push({ notifications: error.message });
    }
  for (const root of catalogTickRoots(paths))
    try {
      results.push(await tickWorkspace(root, { ...paths, sinks }));
    } catch (error) {
      results.push({ root, error: error.message });
    }
  return results;
}
