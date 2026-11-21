// One tick pass of this machine (machine-server MS1, design D2): what
// `avoozl tick` runs each time a timer, the Kiro Crew cron or a driver chat
// calls it, and then exits. For every enabled workspace in the machine
// catalog (or the one named): the tick, then the hand-off of `process`
// session requests, the queued checks, then the queued notifications to this
// machine's sinks (NK7.1). Around them, the supervisor pass reaps and resumes
// `process` children and starts the requested ones, and the standalone page
// is kept up when `serve.enabled`. Check runners, process children and the
// page may outlive this pass.
// A start for the `kirocrew` executor is not left queued with no word: with
// no Kiro Crew seen lately, it opens one Needs you item per role (NK8.2).
import fs from "node:fs";
import path from "node:path";
import { Store } from "../store/store.mjs";
import { Operations } from "../api/operations.mjs";
import { workspaceConfig } from "../settings/config.mjs";
import { WorkspaceRegistry } from "../settings/host-config.mjs";
import { prepareWorktree } from "../delivery/delivery.mjs";
import { drainProcessRequests } from "../executors/process.mjs";
import { startCheckRunners } from "../delivery/check-runner.mjs";
import { machineFile } from "./crews.mjs";
import { sinkPushers, validateNotifications } from "./notification-sinks.mjs";
import { loopLockPaths, takeLock } from "../executors/pass-lock.mjs";
import { openSupervisor } from "../executors/supervisor.mjs";
import { hostPage } from "../executors/page-child.mjs";
import { needsKirocrewStep } from "./needs-kirocrew.mjs";
import { blockedHarnesses, needsHarnessStep } from "./needs-harness.mjs";

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
  { stateDirectory, configDirectory, sinks = [], env = process.env },
) {
  const target = workspaceConfig({
    workspace: root,
    env: { ...env, AVOOZL_WORKSPACE: root },
  });
  if (!fs.existsSync(target.dbPath))
    return { root, skipped: "The workspace is not initialized." };
  // One pass per workspace at a time, whichever state folder runs it (MS2.2):
  // the drain after the tick runs outside the tick's work lock, and its
  // in-flight guards are per process.
  const loop = takeLock(loopLockPaths(target.dbPath), {
    pid: process.pid,
    at: new Date().toISOString(),
    stateDirectory: path.resolve(stateDirectory),
  });
  if (!loop.held)
    return {
      root,
      skipped: `Another tick (pid ${loop.holder?.pid ?? "unknown"}) runs this workspace's pass.`,
    };
  const store = new Store(target.dbPath);
  let ops = null;
  try {
    if (!store.initialized())
      return { root, skipped: "The workspace is not initialized." };
    ops = new Operations(store, {
      operator: target.operator,
      workspaceRoot: target.workspaceRoot,
      plansRoot: target.plansRoot,
      configDirectory,
      notifier: sinks,
    });
    const tick = await ops.execute("workspace.tick", { cron: true });
    // A harness that cannot start here holds its starts and opens one item.
    const blocked = blockedHarnesses(configDirectory);
    needsHarnessStep(store, blocked);
    const { errors } = await drainProcessRequests(store, {
      stateDirectory,
      prepareWorktree,
      ops,
      blocked,
    });
    // A repository check may outlive this pass. Its detached runner owns a
    // separate Store and records the result for a later tick to judge.
    try {
      startCheckRunners(store, { dbPath: target.dbPath, env });
    } catch (error) {
      errors.push({ id: "checks", error: error.message });
    }
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
    // This process ends with the store, so send what is queued first. The
    // tick's result is already decided and does not wait on the outcome.
    await ops?.flushTelemetry();
    store.close();
    loop.close();
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

// Every enabled workspace in turn, or `paths.roots`; one failure never stops
// the rest.
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
  for (const root of paths.roots ?? catalogTickRoots(paths))
    try {
      results.push(await tickWorkspace(root, { ...paths, sinks }));
    } catch (error) {
      results.push({ root, error: error.message });
    }
  return results;
}

// The whole pass: reap and resume children first, so the tick reads their
// end; tick each workspace; then start what the tick asked for, and keep the
// page up. Returns one result per workspace, each with its time.
export async function runPass({
  stateDirectory,
  configDirectory,
  roots,
  env = process.env,
}) {
  const supervisor = openSupervisor({ stateDirectory, configDirectory, env });
  try {
    supervisor.pass();
    const results = (
      await tickCatalog({ stateDirectory, configDirectory, roots, env })
    ).map((result) => ({ at: new Date().toISOString(), ...result }));
    const ran = supervisor.pass();
    supervisor.record(results.filter((result) => result.root));
    try {
      hostPage({ stateDirectory, configDirectory, env });
    } catch (error) {
      results.push({ page: error.message });
    }
    return ran
      ? results
      : [...results, { children: "Another tick holds the children's pass." }];
  } finally {
    supervisor.close();
  }
}
