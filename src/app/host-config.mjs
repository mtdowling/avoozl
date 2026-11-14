import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  assertPortableRepositoryConfig,
  assertSafeConfig,
  crewHomeAvoozlDirectory,
} from "./layered-config.mjs";
import { workspaceConfig } from "./config.mjs";
import { CatalogStore } from "./catalog-store.mjs";
import { Store } from "./store.mjs";

export const hostConfigSchemaPath = fileURLToPath(
  new URL("../host-config.schema.json", import.meta.url),
);

const WORKSPACE_ID = /^[a-z][a-z0-9-]{0,60}$/;
const DEFAULT_WORKSPACE_CONCURRENCY = 2;
const DEFAULT_HOST_CONCURRENCY = 4;
const ACTIVE_RUN_STATES = new Set([
  "queued",
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
]);

// The platform's own path rules, so a Windows layout can be computed (and
// tested) on any host. An explicit XDG folder wins on every platform, which
// is how tests and portable setups move Avoozl's machine files.
const pathFor = (platform) => (platform === "win32" ? path.win32 : path.posix);
const localAppData = ({ env, home, platform }) =>
  pathFor(platform).resolve(
    env.LOCALAPPDATA ||
      env.APPDATA ||
      pathFor(platform).join(home, "AppData", "Local"),
  );

function configHome({ env, home, platform }) {
  const p = pathFor(platform);
  if (env.XDG_CONFIG_HOME) return p.resolve(env.XDG_CONFIG_HOME);
  return platform === "win32"
    ? localAppData({ env, home, platform })
    : p.join(home, ".config");
}

export function machineAvoozlPaths({
  env = process.env,
  home = os.homedir(),
  platform = process.platform,
} = {}) {
  const p = pathFor(platform);
  const scoped = crewHomeAvoozlDirectory({ env, home, platform });
  if (scoped)
    return {
      configDirectory: scoped,
      configPath: p.join(scoped, "config.json"),
      stateDirectory: p.join(scoped, "state"),
      catalogPath: p.join(scoped, "state", "catalog.sqlite"),
    };
  const configDirectory = p.join(configHome({ env, home, platform }), "avoozl");
  const stateDirectory = env.XDG_STATE_HOME
    ? p.join(p.resolve(env.XDG_STATE_HOME), "avoozl")
    : platform === "win32"
      ? p.join(localAppData({ env, home, platform }), "avoozl", "state")
      : p.join(home, ".local", "state", "avoozl");
  return {
    configDirectory,
    configPath: p.join(configDirectory, "config.json"),
    stateDirectory,
    catalogPath: p.join(stateDirectory, "catalog.sqlite"),
  };
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertInteger(value, name, { minimum, maximum }) {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
}

function assertWorkspaceId(id) {
  if (!WORKSPACE_ID.test(id || ""))
    throw Error(
      "Workspace IDs must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.",
    );
}

function regularFile(filename, label) {
  if (!fs.existsSync(filename)) return false;
  const stat = fs.lstatSync(filename);
  if (stat.isSymbolicLink() || !stat.isFile())
    throw Error(
      `${label} must be a regular file and cannot be a symlink: ${filename}`,
    );
  return true;
}

function safeDirectory(directory, label, { mustExist = true } = {}) {
  if (!fs.existsSync(directory)) {
    if (mustExist) throw Error(`${label} does not exist: ${directory}`);
    return;
  }
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw Error(
      `${label} must be a real directory and cannot be a symlink: ${directory}`,
    );
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function normalizeRepositories(
  repositories,
  root,
  { validatePaths = false } = {},
) {
  if (repositories == null) return {};
  if (!record(repositories))
    throw Error(
      "Workspace repositories must be an object of local checkout paths.",
    );
  return Object.fromEntries(
    Object.entries(repositories).map(([id, repositoryRoot]) => {
      assertWorkspaceId(id);
      if (typeof repositoryRoot !== "string" || !repositoryRoot.trim())
        throw Error(`Repository ${id} must have a local checkout path.`);
      const resolved = path.resolve(root, repositoryRoot);
      if (!validatePaths) return [id, resolved];
      safeDirectory(resolved, `Repository ${id}`);
      let checkoutRoot;
      try {
        checkoutRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
          cwd: resolved,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 5000,
        }).trim();
      } catch {
        throw Error(`Repository ${id} is not a Git checkout: ${resolved}`);
      }
      if (
        fs.realpathSync.native(checkoutRoot) !==
        fs.realpathSync.native(resolved)
      )
        throw Error(
          `Repository ${id} must bind the checkout root, not a subdirectory: ${resolved}`,
        );
      return [id, resolved];
    }),
  );
}

function normalizeWorkspace(id, value, { validatePaths = false } = {}) {
  assertWorkspaceId(id);
  if (!record(value)) throw Error(`Workspace ${id} must be an object.`);
  if (typeof value.root !== "string" || !value.root.trim())
    throw Error(`Workspace ${id} must have a root.`);
  let root = path.resolve(value.root);
  if (validatePaths) {
    safeDirectory(root, `Workspace ${id}`);
    root = fs.realpathSync.native(root);
  }
  const enabled = value.enabled !== false;
  const maxConcurrentRuns =
    value.maxConcurrentRuns ?? DEFAULT_WORKSPACE_CONCURRENCY;
  assertInteger(maxConcurrentRuns, `${id}.maxConcurrentRuns`, {
    minimum: 0,
    maximum: 64,
  });
  const name = value.name || id;
  if (typeof name !== "string" || !name.trim() || name.length > 160)
    throw Error(`${id}.name must be 1–160 characters.`);
  return {
    root,
    name: name.trim(),
    enabled,
    maxConcurrentRuns,
    repositories: normalizeRepositories(value.repositories, root, {
      validatePaths,
    }),
  };
}

function readJson(filename) {
  if (!regularFile(filename, "Avoozl host configuration"))
    return { version: 1 };
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    throw Error(
      `Could not parse Avoozl host configuration at ${filename}: ${error.message}`,
    );
  }
  if (!record(value))
    throw Error(`Avoozl host configuration at ${filename} must be an object.`);
  return value;
}

export function normalizeHostConfig(
  value,
  source = "Avoozl host configuration",
) {
  if (!record(value)) throw Error(`${source} must be an object.`);
  if (value.version !== 1) throw Error(`${source} must use version 1.`);
  assertSafeConfig(value, source);
  const port = value.port ?? 9428;
  assertInteger(port, "port", { minimum: 0, maximum: 65535 });
  const maxConcurrentRuns = value.maxConcurrentRuns ?? DEFAULT_HOST_CONCURRENCY;
  assertInteger(maxConcurrentRuns, "maxConcurrentRuns", {
    minimum: 1,
    maximum: 256,
  });
  if (value.workspaces != null && !record(value.workspaces))
    throw Error("workspaces must be an object.");
  const workspaces = Object.fromEntries(
    Object.entries(value.workspaces || {}).map(([id, workspace]) => [
      id,
      normalizeWorkspace(id, workspace),
    ]),
  );
  let defaultWorkspace = value.defaultWorkspace ?? null;
  if (defaultWorkspace != null) {
    assertWorkspaceId(defaultWorkspace);
    if (!workspaces[defaultWorkspace])
      throw Error(`Default workspace ${defaultWorkspace} is not registered.`);
  } else {
    defaultWorkspace =
      Object.entries(workspaces).find(
        ([, workspace]) => workspace.enabled,
      )?.[0] ||
      Object.keys(workspaces)[0] ||
      null;
  }
  return {
    ...value,
    $schema: value.$schema || "https://avoozl.dev/schema/host-config-v1.json",
    version: 1,
    host: value.host || "127.0.0.1",
    port,
    maxConcurrentRuns,
    defaultWorkspace,
    workspaces,
  };
}

export function loadHostConfig(options = {}) {
  const paths = {
    ...machineAvoozlPaths(options),
    ...(options.configPath
      ? { configPath: path.resolve(options.configPath) }
      : {}),
    ...(options.catalogPath
      ? { catalogPath: path.resolve(options.catalogPath) }
      : {}),
  };
  return {
    ...paths,
    config: normalizeHostConfig(
      readJson(paths.configPath),
      `Avoozl host configuration at ${paths.configPath}`,
    ),
  };
}

function validateWorkspaceFiles(
  id,
  root,
  { writeIdentity = false, allowIdentityMismatch = false } = {},
) {
  safeDirectory(root, `Workspace ${id}`);
  const localDirectory = path.join(root, ".avoozl");
  safeDirectory(localDirectory, `Workspace ${id} configuration directory`, {
    mustExist: false,
  });
  const filename = path.join(root, ".avoozl.json");
  let saved = null;
  if (fs.existsSync(filename)) {
    regularFile(filename, `Workspace ${id} configuration`);
    try {
      saved = JSON.parse(fs.readFileSync(filename, "utf8"));
    } catch (error) {
      throw Error(
        `Could not parse workspace configuration at ${filename}: ${error.message}`,
      );
    }
    if (!record(saved))
      throw Error(`Workspace configuration at ${filename} must be an object.`);
    if (!allowIdentityMismatch && saved.workspaceId && saved.workspaceId !== id)
      throw Error(
        `Workspace ${id} has portable identity ${saved.workspaceId}; registration refused.`,
      );
  }
  const resolved = workspaceConfig({
    workspace: root,
    env: { ...process.env, AVOOZL_WORKSPACE: root },
  });
  const relativeDatabase = path.relative(root, resolved.dbPath);
  const databaseCandidates = [path.dirname(resolved.dbPath), resolved.dbPath];
  if (
    relativeDatabase &&
    relativeDatabase !== ".." &&
    !relativeDatabase.startsWith(".." + path.sep)
  ) {
    let parent = path.dirname(resolved.dbPath);
    while (parent !== root && parent.startsWith(root + path.sep)) {
      databaseCandidates.push(parent);
      parent = path.dirname(parent);
    }
  }
  for (const candidate of new Set(databaseCandidates)) {
    if (!fs.existsSync(candidate)) continue;
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink())
      throw Error(`Workspace database paths cannot be symlinks: ${candidate}`);
    if (candidate === resolved.dbPath && !stat.isFile())
      throw Error(`Workspace database must be a regular file: ${candidate}`);
  }
  if (writeIdentity && (!saved || !saved.workspaceId)) {
    const next = {
      ...(saved || {
        $schema: "https://avoozl.dev/schema/repository-config-v1.json",
        version: 1,
        name: path.basename(root),
      }),
      $schema: "https://avoozl.dev/schema/repository-config-v1.json",
      workspaceId: id,
    };
    assertSafeConfig(next, `workspace configuration at ${filename}`);
    assertPortableRepositoryConfig(
      next,
      `repository Avoozl configuration at ${filename}`,
    );
    fs.mkdirSync(localDirectory, { recursive: true });
    const temporary = `${filename}.pending-${process.pid}-${randomUUID()}`;
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(temporary, filename);
    saved = next;
  }
  return {
    root,
    filename,
    config: saved,
    database: resolved.dbPath,
    initialized: fs.existsSync(resolved.dbPath),
  };
}

function atomicWrite(filename, value) {
  const directory = path.dirname(filename);
  safeDirectory(directory, "Avoozl configuration directory", {
    mustExist: false,
  });
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  regularFile(filename, "Avoozl host configuration");
  const temporary = `${filename}.pending-${process.pid}-${randomUUID()}`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  fs.renameSync(temporary, filename);
}

function writePortableWorkspaceIdentity(files, id) {
  const current = files.config || {
      $schema: "https://avoozl.dev/schema/repository-config-v1.json",
      version: 1,
      name: path.basename(files.root),
    },
    next = {
      ...current,
      $schema: "https://avoozl.dev/schema/repository-config-v1.json",
      workspaceId: id,
    };
  assertSafeConfig(next, `workspace configuration at ${files.filename}`);
  assertPortableRepositoryConfig(
    next,
    `repository Avoozl configuration at ${files.filename}`,
  );
  atomicWrite(files.filename, next);
  return {
    previousWorkspaceId: current.workspaceId || null,
    changed: current.workspaceId !== id,
  };
}

function adoptDatabaseIdentity(store, id) {
  return store.transaction(() => {
    const previousWorkspaceId = store.getMeta("workspaceId") || null,
      priorAdoption = store.getMeta("workspaceAdoption"),
      owners = ["machineHostOwner", "webOwner", "runtimeOwner"]
        .map((key) => ({ key, value: store.getMeta(key) }))
        .filter(({ value }) => value),
      activeRuns = store
        .list("runs")
        .filter((run) => ACTIVE_RUN_STATES.has(run.state)),
      workLocks = store.db
        .prepare("SELECT COUNT(*) count FROM work_locks")
        .get().count;
    const liveOwners = owners.filter(({ value }) => processAlive(value.pid));
    if (liveOwners.length)
      throw Error(
        `Workspace adoption refused while ${liveOwners
          .map(({ key, value }) => `${key} PID ${value.pid}`)
          .join(", ")} is live.`,
      );
    if (activeRuns.length || workLocks)
      throw Error(
        `Workspace adoption refused with ${activeRuns.length} active runs and ${workLocks} protected operations.`,
      );

    const updateRun = store.db.prepare("UPDATE runs SET body=? WHERE id=?");
    let runsUpdated = 0;
    for (const row of store.db.prepare("SELECT id,body FROM runs").all()) {
      const run = JSON.parse(row.body);
      if (run.workspaceId === id) continue;
      run.workspaceId = id;
      updateRun.run(JSON.stringify(run), row.id);
      runsUpdated += 1;
    }
    const runCapabilitiesRevoked = store.db
        .prepare(
          "UPDATE run_capabilities SET revoked_at=? WHERE revoked_at IS NULL",
        )
        .run(new Date().toISOString()).changes,
      surfaceCapabilitiesRevoked = store.db
        .prepare("DELETE FROM surface_capabilities")
        .run().changes,
      intakeCapabilitiesRevoked = store.db
        .prepare(
          "UPDATE github_intake_capabilities SET revoked_at=? WHERE revoked_at IS NULL",
        )
        .run(new Date().toISOString()).changes,
      staleOwnersCleared = owners.length;
    for (const { key } of owners) store.setMeta(key, null);
    store.setMeta("workspaceId", id);
    store.setMeta("workspaceInstanceEpoch", null);
    const changes = {
        runsUpdated,
        runCapabilitiesRevoked,
        surfaceCapabilitiesRevoked,
        intakeCapabilitiesRevoked,
        staleOwnersCleared,
      },
      report = {
        workspaceId: id,
        previousWorkspaceId:
          priorAdoption?.previousWorkspaceId || previousWorkspaceId,
        adoptedAt: priorAdoption?.adoptedAt || new Date().toISOString(),
        changes,
      };
    store.setMeta("workspaceAdoption", report);
    return {
      ...report,
      alreadyAdopted:
        previousWorkspaceId === id &&
        Object.values(changes).every((count) => count === 0),
    };
  });
}

export class WorkspaceRegistry {
  constructor(options = {}) {
    const loaded = loadHostConfig(options);
    this.configPath = loaded.configPath;
    this.catalogPath = loaded.catalogPath;
    this.config = loaded.config;
    this.catalog = new CatalogStore(this.catalogPath);
    this.catalog.sync(this.config);
  }

  close() {
    this.catalog.close();
  }

  reload() {
    this.config = loadHostConfig({
      configPath: this.configPath,
      catalogPath: this.catalogPath,
    }).config;
    this.catalog.sync(this.config);
    return this.describe();
  }

  save(next, action, workspaceId, detail = {}) {
    const normalized = normalizeHostConfig(next);
    atomicWrite(this.configPath, normalized);
    this.config = normalized;
    this.catalog.sync(normalized);
    const receipt = this.catalog.receipt(workspaceId || "host", action, detail);
    this.catalog.record(workspaceId, `registry.${action}`, {
      receiptId: receipt.id,
      ...detail,
    });
    return { config: normalized, receipt };
  }

  describe() {
    return {
      host: this.config.host,
      port: this.config.port,
      maxConcurrentRuns: this.config.maxConcurrentRuns,
      defaultWorkspace: this.config.defaultWorkspace,
      configPath: this.configPath,
      catalogPath: this.catalogPath,
      workspaces: this.catalog.list().map((workspace) => ({
        ...workspace,
        repositories: this.config.workspaces[workspace.id]?.repositories || {},
      })),
    };
  }

  list() {
    return this.describe().workspaces;
  }

  get(id) {
    assertWorkspaceId(id);
    const registered = this.config.workspaces[id];
    if (!registered) throw Error(`Unknown workspace: ${id}`);
    return {
      ...this.catalog.get(id),
      repositories: registered.repositories,
    };
  }

  validate(id, { writeIdentity = false } = {}) {
    const registered = this.config.workspaces[id];
    if (!registered) throw Error(`Unknown workspace: ${id}`);
    const candidate = normalizeWorkspace(id, registered, {
      validatePaths: true,
    });
    validateWorkspaceFiles(id, candidate.root, { writeIdentity });
    const candidateRoot = fs.realpathSync.native(candidate.root);
    const candidateRepositories = new Set(
      Object.values(candidate.repositories).map((root) =>
        fs.realpathSync.native(root),
      ),
    );
    for (const [otherId, other] of Object.entries(this.config.workspaces)) {
      if (otherId === id) continue;
      if (
        fs.existsSync(other.root) &&
        fs.realpathSync.native(other.root) === candidateRoot
      )
        throw Error(
          `Workspaces ${otherId} and ${id} use the same root: ${candidateRoot}`,
        );
      for (const repositoryRoot of Object.values(other.repositories || {}))
        if (
          fs.existsSync(repositoryRoot) &&
          candidateRepositories.has(fs.realpathSync.native(repositoryRoot))
        )
          throw Error(
            `Editable checkout ${fs.realpathSync.native(
              repositoryRoot,
            )} is already bound to workspace ${otherId}.`,
          );
    }
    return candidate;
  }

  add(
    id,
    {
      root,
      name,
      enabled = true,
      maxConcurrentRuns = DEFAULT_WORKSPACE_CONCURRENCY,
      repositories = {},
    } = {},
  ) {
    assertWorkspaceId(id);
    if (this.config.workspaces[id])
      throw Error(`Workspace ${id} is already registered.`);
    if (!root) throw Error("Choose a workspace root.");
    const candidate = normalizeWorkspace(
      id,
      {
        root,
        name,
        enabled,
        maxConcurrentRuns,
        repositories,
      },
      { validatePaths: true },
    );
    for (const [otherId, other] of Object.entries(this.config.workspaces)) {
      if (
        fs.existsSync(other.root) &&
        fs.realpathSync.native(other.root) ===
          fs.realpathSync.native(candidate.root)
      )
        throw Error(
          `Workspaces ${otherId} and ${id} use the same root: ${candidate.root}`,
        );
      const otherRepositories = new Set(
        Object.values(other.repositories || {})
          .filter((repositoryRoot) => fs.existsSync(repositoryRoot))
          .map((repositoryRoot) => fs.realpathSync.native(repositoryRoot)),
      );
      for (const repositoryRoot of Object.values(candidate.repositories))
        if (otherRepositories.has(fs.realpathSync.native(repositoryRoot)))
          throw Error(
            `Editable checkout ${fs.realpathSync.native(
              repositoryRoot,
            )} is already bound to workspace ${otherId}.`,
          );
    }
    const files = validateWorkspaceFiles(id, candidate.root, {
      writeIdentity: true,
    });
    const next = structuredClone(this.config);
    next.workspaces[id] = candidate;
    if (!next.defaultWorkspace && enabled) next.defaultWorkspace = id;
    const saved = this.save(next, "add", id, {
      root: candidate.root,
      initialized: files.initialized,
    });
    return { ...this.get(id), receipt: saved.receipt };
  }

  adopt(
    id,
    {
      root,
      name,
      enabled = true,
      maxConcurrentRuns = DEFAULT_WORKSPACE_CONCURRENCY,
      repositories = {},
    } = {},
  ) {
    assertWorkspaceId(id);
    if (!root) throw Error("Choose a workspace root.");
    const candidate = normalizeWorkspace(
        id,
        {
          root,
          name,
          enabled,
          maxConcurrentRuns,
          repositories,
        },
        { validatePaths: true },
      ),
      existing = this.config.workspaces[id];
    if (
      existing &&
      fs.realpathSync.native(existing.root) !==
        fs.realpathSync.native(candidate.root)
    )
      throw Error(`Workspace ${id} is already registered at ${existing.root}.`);
    for (const [otherId, other] of Object.entries(this.config.workspaces))
      if (
        otherId !== id &&
        fs.existsSync(other.root) &&
        fs.realpathSync.native(other.root) ===
          fs.realpathSync.native(candidate.root)
      )
        throw Error(
          `Workspace root ${candidate.root} is already registered as ${otherId}.`,
        );

    const files = validateWorkspaceFiles(id, candidate.root, {
      allowIdentityMismatch: true,
    });
    if (!files.initialized)
      throw Error(`Workspace ${id} is not initialized: ${files.database}`);
    const before = fs.statSync(files.database),
      store = new Store(files.database);
    let migration;
    try {
      migration = adoptDatabaseIdentity(store, id);
    } finally {
      store.close();
    }
    const after = fs.statSync(files.database);
    if (before.dev !== after.dev || before.ino !== after.ino)
      throw Error("Workspace adoption replaced the database unexpectedly.");
    const portable = writePortableWorkspaceIdentity(files, id);

    if (existing)
      return {
        ...this.get(id),
        adopted: true,
        alreadyRegistered: true,
        databasePreserved: true,
        portable,
        migration,
      };
    const next = structuredClone(this.config);
    next.workspaces[id] = candidate;
    if (!next.defaultWorkspace && enabled) next.defaultWorkspace = id;
    const saved = this.save(next, "adopt", id, {
      root: candidate.root,
      database: files.database,
      previousWorkspaceId: migration.previousWorkspaceId,
      changes: migration.changes,
    });
    return {
      ...this.get(id),
      adopted: true,
      alreadyRegistered: false,
      databasePreserved: true,
      portable,
      migration,
      receipt: saved.receipt,
    };
  }

  remove(id) {
    const current = this.get(id);
    const next = structuredClone(this.config);
    delete next.workspaces[id];
    if (next.defaultWorkspace === id)
      next.defaultWorkspace =
        Object.entries(next.workspaces).find(
          ([, workspace]) => workspace.enabled,
        )?.[0] ||
        Object.keys(next.workspaces)[0] ||
        null;
    const saved = this.save(next, "remove", id, { root: current.root });
    return {
      id,
      root: current.root,
      removed: true,
      databasePreserved: true,
      receipt: saved.receipt,
    };
  }

  setDefault(id) {
    this.get(id);
    const next = structuredClone(this.config);
    next.defaultWorkspace = id;
    const saved = this.save(next, "set-default", id);
    return { ...this.get(id), default: true, receipt: saved.receipt };
  }

  setEnabled(id, enabled) {
    this.get(id);
    const next = structuredClone(this.config);
    next.workspaces[id].enabled = Boolean(enabled);
    if (enabled && !next.defaultWorkspace) next.defaultWorkspace = id;
    const action = enabled ? "start" : "stop";
    const saved = this.save(next, action, id);
    this.catalog.setState(id, enabled ? "closed" : "stopped");
    return { ...this.get(id), receipt: saved.receipt };
  }

  setConcurrency(id, limit) {
    this.get(id);
    limit = Number(limit);
    assertInteger(limit, "Workspace concurrency", { minimum: 0, maximum: 64 });
    const next = structuredClone(this.config);
    next.workspaces[id].maxConcurrentRuns = limit;
    const saved = this.save(next, "set-concurrency", id, { limit });
    return {
      ...this.get(id),
      dispatchPaused: limit === 0,
      receipt: saved.receipt,
    };
  }

  drain(id) {
    this.get(id);
    return this.catalog.setState(id, "draining", {
      requestedBy: "local-cli",
    });
  }

  rebuild() {
    return {
      workspaces: this.catalog.rebuild(this.config),
      integrity: this.catalog.integrityCheck(),
    };
  }
}
