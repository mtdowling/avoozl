// Entry point for one workspace's integrator (landing-trains LT2, design D4).
// The machine's supervisor starts it and restarts it if it dies; a person may
// also run `avoozl integrator run`. It is the only process that pushes a
// train trunk.
import fs from "node:fs";
import { parseArgs } from "node:util";
import { workspaceConfig } from "./config.mjs";
import { leaseSettings } from "./landing-config.mjs";
import { loadLayeredConfig } from "./layered-config.mjs";
import { defaultGitHubClient } from "./github.mjs";
import { machineAvoozlPaths } from "./host-config.mjs";
import { cleanupDeadTrain } from "./integrator-cleanup.mjs";
import { readTrainCi } from "./integrator-ci.mjs";
import { integratorChat } from "./integrator-resolver.mjs";
import { bisectRedTrain } from "./integrator-red.mjs";
import { runTrain } from "./integrator-run.mjs";
import { processExecutor } from "./executors/process.mjs";
import { runIntegrator } from "./integrator-trains.mjs";
import { machinePlatforms } from "./integrator-validation.mjs";
import { openSupervisorDatabase } from "./supervisor.mjs";
import { Store } from "./store.mjs";

const { values } = parseArgs({
  options: { workspace: { type: "string" } },
  strict: false,
});
if (!values.workspace && !process.env.AVOOZL_WORKSPACE) {
  console.error("Usage: avoozl integrator run --workspace PATH");
  process.exit(1);
}
const workspace = values.workspace ?? process.env.AVOOZL_WORKSPACE,
  target = workspaceConfig({
    workspace,
    env: { ...process.env, AVOOZL_WORKSPACE: workspace },
  });
// Never create a workspace by running in the wrong folder.
if (!fs.existsSync(target.dbPath)) {
  console.error(`${target.workspaceRoot} is not an initialized workspace.`);
  process.exit(1);
}
const store = new Store(target.dbPath),
  stop = new AbortController(),
  loadConfig = () =>
    loadLayeredConfig({ workspaceRoot: target.workspaceRoot }).config;
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"])
  process.on(signal, () => stop.abort());
const interval = () => {
  try {
    return Math.min(leaseSettings(loadConfig()).heartbeatSeconds, 10) * 1000;
  } catch {
    return 10_000;
  }
};
// One train, with the machine's resource slots when a platform names one.
const githubClient = () => {
  try {
    return defaultGitHubClient();
  } catch {
    return undefined;
  }
};
const run = {
  cleanup: async (store, context) => {
    let db;
    try {
      if (Object.values(machinePlatforms(context.config)).some((e) => e?.slot))
        db = openSupervisorDatabase(machineAvoozlPaths().stateDirectory);
      await cleanupDeadTrain(store, {
        project: context.project,
        target: context.target,
        settings: context.settings,
        config: context.config,
        slots: db && { db },
        by: `integrator ${process.pid}`,
      });
    } finally {
      db?.close();
    }
  },
  ci: (store, context) =>
    readTrainCi(store, {
      github: githubClient(),
      repository: context.project.repository,
      projectId: context.project.id,
      target: context.target,
      workflow: context.settings.ci.workflow,
    }).catch(() => []),
  bisectRed: (store, context) =>
    bisectRedTrain(store, {
      ...context,
      workspaceRoot: target.workspaceRoot,
      github: githubClient(),
    }),
  train: async (store, context, { now }) => {
    const needSlots = Object.values(machinePlatforms(context.config)).some(
      (env) => env?.slot,
    );
    let db;
    try {
      if (needSlots)
        db = openSupervisorDatabase(machineAvoozlPaths().stateDirectory);
      return await runTrain(store, {
        ...context,
        workspaceRoot: target.workspaceRoot,
        github: githubClient(),
        now,
        // Only asked for under `conflicts.resolver: "chat"`.
        resolverChat: () =>
          integratorChat({
            executor: processExecutor({
              stateDirectory: machineAvoozlPaths().stateDirectory,
              projectFor: () => context.project,
            }),
            store,
            repository: context.project.repository || context.project.id,
          }),
        slots: db && {
          db,
          counts: context.config.machine?.slots,
          workspace: target.workspaceRoot,
        },
      });
    } finally {
      db?.close();
    }
  },
};
try {
  await runIntegrator(store, {
    run,
    loadConfig,
    // A loop must be shorter than a heartbeat; the loop renews the lease.
    intervalMs: interval(),
    signal: stop.signal,
  });
} finally {
  store.close();
}
