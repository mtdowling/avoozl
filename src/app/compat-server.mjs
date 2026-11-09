import { Store, fail } from "./store.mjs";
import { startServer as startWorkspace } from "./server.mjs";
import { RemoteManager } from "./remote-manager.mjs";
import { planFiles } from "../catalog.mjs";
import { reconcileSource } from "./source-sync.mjs";
import { workspaceConfig, applicationRoot } from "./config.mjs";
export const appRoot = applicationRoot;
export function activeConfig() {
  const i = process.argv.indexOf("--workspace");
  return workspaceConfig(i >= 0 ? { workspace: process.argv[i + 1] } : {});
}
export const plansRoot = activeConfig().plansRoot;
export const databasePath = activeConfig().dbPath;
export function readDatabase() {
  const store = new Store(activeConfig().dbPath);
  try {
    return structuredClone(store.read());
  } finally {
    store.close();
  }
}
export function writeDatabase(data) {
  const store = new Store(activeConfig().dbPath);
  try {
    return store.transaction(() => {
      if (store.read().revision !== data.revision - 1)
        fail(
          "Database revision changed; reread before applying the edit.",
          409,
        );
      store.write(data);
    });
  } finally {
    store.close();
  }
}
export function generate(config = activeConfig()) {
  if (!config.configured)
    fail("Choose an initialized workspace before indexing Markdown.");
  const store = new Store(config.dbPath),
    stats = { added: 0, changed: 0, removed: 0, newTasks: 0 };
  try {
    for (const file of new Set([
      ...planFiles(config.plansRoot),
      ...Object.keys(store.read().documents).filter(
        (id) => !store.read().documents[id].managed,
      ),
    ])) {
      const result = reconcileSource(store, config.plansRoot, file);
      if (result.changed) stats[result.removed ? "removed" : "changed"]++;
    }
    return { data: structuredClone(store.read()), stats };
  } finally {
    store.close();
  }
}
export function startServer(options = {}) {
  const config = activeConfig();
  return startWorkspace({
    dbPath: config.dbPath,
    workspaceName: config.name,
    port: config.port,
    host: config.host,
    projectionRoot: config.plansRoot,
    sourceRoot: config.plansRoot,
    manager: new RemoteManager(config.agentManifest),
    ...options,
  });
}
