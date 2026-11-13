import fs from "node:fs";
import path from "node:path";
import { Store, fail } from "./store.mjs";
import { workspaceConfig } from "./config.mjs";
import { Operations } from "./operations.mjs";
import { generateNamespace } from "./github-marker.mjs";
import { SUPERSEDED_STATUS } from "./supersede.mjs";

const portable = (relative) => relative.split(path.sep).join("/");

export function emptySnapshot(name = "My workspace") {
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: new Date().toISOString(),
    project: { name, title: name, pollIntervalMs: 10000 },
    statuses: [
      { id: "planned", label: "Planned", complete: false },
      { id: "partial", label: "In progress", complete: false },
      { id: "implemented", label: "Implemented", complete: false },
      { id: "accepted", label: "Accepted", complete: true },
      { id: "review", label: "Review", complete: false },
      { id: "blocked", label: "Blocked", complete: false },
      { id: "deferred", label: "Deferred", complete: false },
      { id: "recorded", label: "Historical completion", complete: false },
      { ...SUPERSEDED_STATUS },
    ],
    // Cross-plan epics only; each comes from an approved epic folder.
    epics: [],
    tracks: [{ id: "catalog", label: "General" }],
    tasks: [],
    edges: [],
    documents: {},
    changelog: [],
  };
}
export function initializeWorkspace(
  root,
  {
    name = "My workspace",
    port = 9428,
    documents = "plans",
    db = ".avoozl/local/workspace.sqlite",
  } = {},
) {
  if (typeof name !== "string" || !name.trim() || name.length > 160)
    fail("Choose a workspace name of 1–160 characters.");
  const config = workspaceConfig({ workspace: root, port, documents, db }),
    current = workspaceConfig({ workspace: root });
  if (fs.existsSync(config.dbPath) || fs.existsSync(current.dbPath))
    fail(
      "This workspace already exists. Choose a new directory; existing data was preserved.",
      409,
    );
  // A configuration with no database (a new machine, or a deleted SQLite
  // file) gets an empty database under the same configuration and
  // namespace, so `avoozl rebuild` can find its GitHub issues (§3.3).
  if (current.configured) {
    const store = new Store(current.dbPath);
    try {
      new Operations(store).initialize(emptySnapshot(current.name));
    } finally {
      store.close();
    }
    fs.mkdirSync(current.plansRoot, { recursive: true });
    return {
      workspace: current.workspaceRoot,
      dbPath: current.dbPath,
      name: current.name,
      port: current.port,
      existingConfiguration: true,
    };
  }
  fs.mkdirSync(config.workspaceRoot, { recursive: true });
  const saved = {
    $schema: "https://avoozl.dev/schema/repository-config-v1.json",
    version: 1,
    name,
    // Owns this workspace's GitHub task IDs (design §3.4); never changes.
    namespace: generateNamespace(),
    // Forward slashes: .avoozl.json is shared, and every platform reads them.
    dbPath: portable(
      path.relative(path.dirname(config.filename), config.dbPath),
    ),
    documents: portable(
      path.relative(path.dirname(config.filename), config.plansRoot),
    ),
    port: config.port,
    host: "127.0.0.1",
  };
  // Reserve the configuration before creating state, so concurrent initializers cannot overwrite it.
  fs.mkdirSync(path.dirname(config.filename), { recursive: true });
  fs.writeFileSync(config.filename, JSON.stringify(saved, null, 2) + "\n", {
    flag: "wx",
  });
  const store = new Store(config.dbPath);
  try {
    new Operations(store).initialize(emptySnapshot(name));
  } finally {
    store.close();
  }
  fs.mkdirSync(config.plansRoot, { recursive: true });
  return {
    workspace: config.workspaceRoot,
    dbPath: config.dbPath,
    name,
    port: config.port,
  };
}
