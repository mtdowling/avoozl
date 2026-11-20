import fs from "node:fs";
import path from "node:path";
import { Store, fail } from "../store/store.mjs";
import { workspaceConfig } from "../settings/config.mjs";
import { Operations } from "../api/operations.mjs";
import { generateNamespace } from "../github/github-marker.mjs";
import { REPOSITORY_CONFIG_SCHEMA_URL } from "../settings/config-schema.mjs";
import { specsDirectory } from "../specs/specs-path.mjs";
import { shellQuote } from "../executors/process-view.mjs";

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
// What a workspace gets with no flag. `.avoozl.json` is shared policy, so
// init leaves these out of it: the loader supplies the same values, and a
// machine's own layers (its config file, the environment, a flag) can still
// set them.
const DEFAULT_PORT = 9428,
  DEFAULT_DOCUMENTS = "plans",
  DEFAULT_DB = ".avoozl/local/workspace.sqlite";

// Whether a database file exists and holds a snapshot. A missing file is
// not created.
export function hasSnapshot(dbPath) {
  if (!fs.existsSync(dbPath)) return false;
  const store = new Store(dbPath);
  try {
    return store.initialized();
  } finally {
    store.close();
  }
}

// The refusal for a workspace with no snapshot, naming what to run.
export function initializeFirst(root) {
  const where = shellQuote(root);
  return `Initialize this Avoozl workspace first: run avoozl init ${where}, then avoozl rebuild --workspace ${where}.`;
}

export function initializeWorkspace(
  root,
  {
    name = "My workspace",
    port = DEFAULT_PORT,
    documents = DEFAULT_DOCUMENTS,
    db = DEFAULT_DB,
  } = {},
) {
  if (typeof name !== "string" || !name.trim() || name.length > 160)
    fail("Choose a workspace name of 1–160 characters.");
  const config = workspaceConfig({ workspace: root, port, documents, db }),
    current = workspaceConfig({ workspace: root });
  // A configured workspace counts as existing only once its database holds
  // a snapshot; any other database file is refused as it was.
  const taken = current.configured ? hasSnapshot : fs.existsSync;
  if (taken(config.dbPath) || taken(current.dbPath))
    fail(
      "This workspace already exists. Choose a new directory; existing data was preserved.",
      409,
    );
  // A configuration with no database (a new machine, or a deleted SQLite
  // file), or with a database that was never initialized, gets an empty
  // snapshot under the same configuration and namespace, so `avoozl
  // rebuild` can find its GitHub issues (§3.3).
  if (current.configured) {
    const store = new Store(current.dbPath);
    try {
      new Operations(store).initialize(emptySnapshot(current.name));
    } finally {
      store.close();
    }
    return {
      workspace: current.workspaceRoot,
      dbPath: current.dbPath,
      name: current.name,
      port: current.port,
      existingConfiguration: true,
    };
  }
  fs.mkdirSync(config.workspaceRoot, { recursive: true });
  // Forward slashes: .avoozl.json is shared, and every platform reads them.
  const relative = (target) =>
      portable(path.relative(path.dirname(config.filename), target)),
    dbPath = relative(config.dbPath),
    documentsRoot = relative(config.plansRoot);
  const saved = {
    $schema: REPOSITORY_CONFIG_SCHEMA_URL,
    version: 1,
    name,
    // Owns this workspace's GitHub task IDs (design §3.4); never changes.
    namespace: generateNamespace(),
    // Only a layout the person chose is written. It has to be: no other
    // layer is per workspace, so a later command could not find it again.
    ...(dbPath !== DEFAULT_DB ? { dbPath } : {}),
    ...(documentsRoot !== DEFAULT_DOCUMENTS
      ? { documents: documentsRoot }
      : {}),
    ...(config.port !== DEFAULT_PORT ? { port: config.port } : {}),
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
  // Specs are Kiro spec folders here. The Markdown documents root is made
  // when a document is first published to it (outbox.mjs), not before.
  fs.mkdirSync(specsDirectory(config.workspaceRoot), {
    recursive: true,
  });
  return {
    workspace: config.workspaceRoot,
    dbPath: config.dbPath,
    name,
    port: config.port,
  };
}
