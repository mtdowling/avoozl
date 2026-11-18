// Entry point for one workspace's integrator (landing-trains LT2, design D4).
// The machine's supervisor starts it and restarts it if it dies; a person may
// also run `avoozl integrator run`. It is the only process that pushes a
// train trunk.
import { parseArgs } from "node:util";
import { workspaceConfig } from "./config.mjs";
import { leaseSettings } from "./landing-config.mjs";
import { loadLayeredConfig } from "./layered-config.mjs";
import { runIntegrator } from "./integrator-trains.mjs";
import { Store } from "./store.mjs";

const { values } = parseArgs({
  options: { workspace: { type: "string" } },
  strict: false,
});
const target = workspaceConfig({
  workspace: values.workspace,
  env: { ...process.env, AVOOZL_WORKSPACE: values.workspace },
});
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
try {
  await runIntegrator(store, {
    loadConfig,
    // A loop must be shorter than a heartbeat; the loop renews the lease.
    intervalMs: interval(),
    signal: stop.signal,
  });
} finally {
  store.close();
}
