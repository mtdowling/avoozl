import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  hostConfigSchemaPath,
  loadHostConfig,
  machineAvoozlPaths,
  normalizeHostConfig,
  WorkspaceRegistry,
} from "../host-config.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { workspaceConfig } from "../config.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function machineEnvironment() {
  const root = temporaryDirectory("avoozl-machine-host-");
  return {
    root,
    env: {
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
    },
  };
}

function initializedWorkspace(name) {
  const root = temporaryDirectory(`avoozl-${name}-`);
  initializeWorkspace(root, {
    name,
    port: 0,
  });
  return root;
}

test("machine host paths follow XDG and Windows conventions", () => {
  const unix = machineAvoozlPaths({
    env: {
      XDG_CONFIG_HOME: "/tmp/xdg-config",
      XDG_STATE_HOME: "/tmp/xdg-state",
    },
    home: "/unused",
    platform: "linux",
  });
  assert.equal(unix.configPath, "/tmp/xdg-config/avoozl/config.json");
  assert.equal(unix.catalogPath, "/tmp/xdg-state/avoozl/catalog.sqlite");

  const windows = machineAvoozlPaths({
    env: { LOCALAPPDATA: "C:\\Local" },
    home: "C:\\Users\\example",
    platform: "win32",
  });
  assert(windows.configPath.endsWith(path.join("avoozl", "config.json")));
  assert(
    windows.catalogPath.endsWith(
      path.join("avoozl", "state", "catalog.sqlite"),
    ),
  );
});

test("host configuration rejects secrets and invalid concurrency", () => {
  assert.throws(
    () =>
      normalizeHostConfig({
        version: 1,
        githubToken: "no",
      }),
    /secret-like key githubToken/,
  );
  assert.throws(
    () =>
      normalizeHostConfig({
        version: 1,
        maxConcurrentRuns: 0,
      }),
    /maxConcurrentRuns must be an integer from 1 to 256/,
  );
  assert.throws(
    () =>
      normalizeHostConfig({
        version: 1,
        workspaces: {
          invalid: {
            root: "/does/not/exist",
            maxConcurrentRuns: 65,
          },
        },
      }),
    /invalid\.maxConcurrentRuns must be an integer from 0 to 64/,
  );
});

test("registry adds isolated workspaces and persists concurrency controls", () => {
  const { env } = machineEnvironment(),
    first = initializedWorkspace("First"),
    second = initializedWorkspace("Second");
  let registry = new WorkspaceRegistry({ env, home: "/unused" });
  try {
    const added = registry.add("first", {
      root: first,
      maxConcurrentRuns: 2,
    });
    assert.equal(added.id, "first");
    assert.equal(added.maxConcurrentRuns, 2);
    assert.equal(added.state, "closed");
    assert.equal(registry.describe().defaultWorkspace, "first");
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(first, ".avoozl.json"), "utf8"))
        .workspaceId,
      "first",
    );

    registry.add("second", {
      root: second,
      maxConcurrentRuns: 0,
    });
    const paused = registry.setConcurrency("first", 0);
    assert.equal(paused.dispatchPaused, true);
    assert.equal(paused.maxConcurrentRuns, 0);
    assert.equal(registry.setEnabled("second", false).state, "stopped");
    assert.equal(registry.setEnabled("second", true).state, "closed");
    assert.equal(registry.setDefault("second").default, true);
    assert.equal(registry.describe().defaultWorkspace, "second");
    assert.equal(registry.drain("first").state, "draining");

    const tables = registry.catalog.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map(({ name }) => name);
    assert(!tables.includes("tasks"));
    assert(!tables.includes("plans"));
    assert(!tables.includes("runs"));
    assert.equal(
      registry.catalog.db
        .prepare("SELECT count(*) AS count FROM registration_receipts")
        .get().count,
      6,
    );
  } finally {
    registry.close();
  }

  registry = new WorkspaceRegistry({ env, home: "/unused" });
  try {
    assert.equal(registry.get("first").maxConcurrentRuns, 0);
    assert.equal(registry.get("first").state, "draining");
    assert.equal(registry.describe().defaultWorkspace, "second");
  } finally {
    registry.close();
  }
});

test("workspace registration ignores .avoozl/config.json", () => {
  const { env } = machineEnvironment(),
    workspace = initializedWorkspace("Legacy paths"),
    current = path.join(workspace, ".avoozl.json"),
    legacy = path.join(workspace, ".avoozl", "config.json"),
    database = workspaceConfig({ workspace }).dbPath,
    saved = JSON.parse(fs.readFileSync(current, "utf8"));
  fs.renameSync(current, legacy);
  fs.writeFileSync(
    legacy,
    JSON.stringify(
      {
        ...saved,
        dbPath: database,
        projects: {
          machine: {
            root: "/machine/checkout",
            checks: [],
          },
        },
      },
      null,
      2,
    ) + "\n",
  );

  const registry = new WorkspaceRegistry({ env, home: "/unused" });
  try {
    registry.add("legacy-paths", { root: workspace });
    const portable = JSON.parse(fs.readFileSync(current, "utf8"));
    assert.equal(portable.workspaceId, "legacy-paths");
    assert.equal(portable.dbPath, undefined);
    assert.equal(portable.projects, undefined);
    assert.equal(JSON.parse(fs.readFileSync(legacy, "utf8")).dbPath, database);
    assert.equal(workspaceConfig({ workspace }).dbPath, database);
  } finally {
    registry.close();
  }
});

test("registry adopts an existing workspace in place and retries idempotently", () => {
  const { env } = machineEnvironment(),
    workspace = initializedWorkspace("Legacy"),
    database = workspaceConfig({ workspace }).dbPath,
    before = fs.statSync(database),
    store = new Store(database);
  try {
    store.mutate("Add preserved task", (data) => {
      data.tasks.push({
        id: "preserved",
        title: "Preserved",
        status: "planned",
        scope: "catalog",
      });
    });
    store.setMeta("workspaceId", "legacy-random-identity");
    store.setMeta("runtimeOwner", { id: "stale", pid: 2147483647 });
    store.put("runs", {
      id: "run-one",
      taskId: "preserved",
      state: "completed",
      workspaceId: "legacy-random-identity",
    });
    store.put("runs", {
      id: "run-two",
      taskId: "preserved",
      state: "failed",
    });
    const now = new Date().toISOString(),
      later = new Date(Date.now() + 60000).toISOString();
    store.db
      .prepare("INSERT INTO run_capabilities VALUES (?,?,?,?,?,?)")
      .run("run-live", "run-one", Buffer.alloc(32), later, null, "{}");
    store.db
      .prepare("INSERT INTO run_capabilities VALUES (?,?,?,?,?,?)")
      .run("run-old", "run-one", Buffer.alloc(32), later, now, "{}");
    for (const id of ["surface-one", "surface-two"])
      store.db
        .prepare("INSERT INTO surface_capabilities VALUES (?,?,?,?,?,?)")
        .run(id, "run-one", "conversation", Buffer.alloc(32), later, "{}");
    store.db
      .prepare("INSERT INTO github_intake_capabilities VALUES (?,?,?,?,?,?)")
      .run("intake-live", "owner/repo", Buffer.alloc(32), later, null, "{}");
    store.db
      .prepare("INSERT INTO github_intake_capabilities VALUES (?,?,?,?,?,?)")
      .run("intake-old", "owner/repo", Buffer.alloc(32), later, now, "{}");
  } finally {
    store.close();
  }

  const registry = new WorkspaceRegistry({ env, home: "/unused" });
  try {
    const adopted = registry.adopt("legacy", { root: workspace });
    assert.equal(adopted.databasePreserved, true);
    assert.equal(
      adopted.migration.previousWorkspaceId,
      "legacy-random-identity",
    );
    assert.deepEqual(adopted.migration.changes, {
      runsUpdated: 2,
      runCapabilitiesRevoked: 1,
      surfaceCapabilitiesRevoked: 2,
      intakeCapabilitiesRevoked: 1,
      staleOwnersCleared: 1,
    });
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(workspace, ".avoozl.json"), "utf8"))
        .workspaceId,
      "legacy",
    );
    const migrated = new Store(database);
    try {
      assert.equal(migrated.getMeta("workspaceId"), "legacy");
      assert.equal(migrated.read().tasks.length, 1);
      assert.equal(migrated.read().tasks[0].id, "preserved");
      assert(
        migrated.list("runs").every((run) => run.workspaceId === "legacy"),
      );
      assert.equal(
        migrated.db
          .prepare(
            "SELECT COUNT(*) count FROM run_capabilities WHERE revoked_at IS NULL",
          )
          .get().count,
        0,
      );
      assert.equal(
        migrated.db
          .prepare("SELECT COUNT(*) count FROM surface_capabilities")
          .get().count,
        0,
      );
      assert.equal(
        migrated.db
          .prepare(
            "SELECT COUNT(*) count FROM github_intake_capabilities WHERE revoked_at IS NULL",
          )
          .get().count,
        0,
      );
    } finally {
      migrated.close();
    }
    const after = fs.statSync(database);
    assert.equal(after.dev, before.dev);
    assert.equal(after.ino, before.ino);

    const retried = registry.adopt("legacy", { root: workspace });
    assert.equal(retried.alreadyRegistered, true);
    assert.equal(retried.migration.alreadyAdopted, true);
    assert.deepEqual(retried.migration.changes, {
      runsUpdated: 0,
      runCapabilitiesRevoked: 0,
      surfaceCapabilitiesRevoked: 0,
      intakeCapabilitiesRevoked: 0,
      staleOwnersCleared: 0,
    });
    assert.equal(
      registry.catalog.db
        .prepare(
          "SELECT COUNT(*) count FROM registration_receipts WHERE action='adopt'",
        )
        .get().count,
      1,
    );
  } finally {
    registry.close();
  }
});

test("workspace adoption refuses active runs and live owners", () => {
  const { env } = machineEnvironment(),
    workspace = initializedWorkspace("Busy"),
    database = workspaceConfig({ workspace }).dbPath,
    store = new Store(database);
  try {
    store.put("runs", {
      id: "run-active",
      taskId: "missing",
      state: "running",
    });
  } finally {
    store.close();
  }
  const registry = new WorkspaceRegistry({ env, home: "/unused" });
  try {
    assert.throws(
      () => registry.adopt("busy", { root: workspace }),
      /1 active runs/,
    );
    const owned = new Store(database);
    try {
      const run = owned.get("runs", "run-active");
      run.state = "completed";
      owned.put("runs", run);
      owned.setMeta("webOwner", { id: "live", pid: process.pid });
    } finally {
      owned.close();
    }
    assert.throws(
      () => registry.adopt("busy", { root: workspace }),
      /webOwner PID/,
    );
    assert.equal(registry.list().length, 0);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(workspace, ".avoozl.json"), "utf8"))
        .workspaceId,
      undefined,
    );
  } finally {
    registry.close();
  }
});

test("catalog is rebuildable and unregistering preserves workspace data", () => {
  const { env } = machineEnvironment(),
    workspace = initializedWorkspace("Rebuild"),
    workspaceDatabase = path.join(
      workspace,
      ".avoozl",
      "local",
      "workspace.sqlite",
    );
  let registry = new WorkspaceRegistry({ env, home: "/unused" });
  const paths = {
    configPath: registry.configPath,
    catalogPath: registry.catalogPath,
  };
  try {
    registry.add("rebuild", { root: workspace });
  } finally {
    registry.close();
  }

  for (const suffix of ["", "-wal", "-shm"]) {
    const filename = paths.catalogPath + suffix;
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
  }
  assert(fs.existsSync(workspaceDatabase));

  registry = new WorkspaceRegistry(paths);
  try {
    assert.deepEqual(registry.catalog.integrityCheck(), ["ok"]);
    assert.equal(registry.get("rebuild").root, fs.realpathSync(workspace));
    const removed = registry.remove("rebuild");
    assert.equal(removed.databasePreserved, true);
    assert(fs.existsSync(workspaceDatabase));
    assert.equal(registry.list().length, 0);
  } finally {
    registry.close();
  }
});

test("duplicate roots, checkout bindings, symlinks, and identity mismatches fail closed", (t) => {
  const { env } = machineEnvironment(),
    first = initializedWorkspace("First"),
    second = initializedWorkspace("Second"),
    sharedCheckout = temporaryDirectory("avoozl-shared-checkout-");
  execFileSync("git", ["init", "-q"], { cwd: sharedCheckout });
  const registry = new WorkspaceRegistry({ env, home: "/unused" });
  try {
    registry.add("first", {
      root: first,
      repositories: { code: sharedCheckout },
    });
    assert.throws(
      () => registry.add("duplicate", { root: first }),
      /portable identity first|same root/,
    );
    assert.throws(
      () =>
        registry.add("second", {
          root: second,
          repositories: { code: sharedCheckout },
        }),
      /already bound to workspace first/,
    );

    const mismatched = initializedWorkspace("Mismatched");
    const mismatchConfig = path.join(mismatched, ".avoozl.json");
    const saved = JSON.parse(fs.readFileSync(mismatchConfig, "utf8"));
    fs.writeFileSync(
      mismatchConfig,
      JSON.stringify({ ...saved, workspaceId: "somewhere-else" }, null, 2),
    );
    assert.throws(
      () => registry.add("mismatched", { root: mismatched }),
      /portable identity somewhere-else/,
    );

    const target = initializedWorkspace("Target");
    const linked = path.join(
      temporaryDirectory("avoozl-linked-parent-"),
      "root",
    );
    try {
      fs.symlinkSync(target, linked, "dir");
    } catch (error) {
      if (process.platform === "win32") {
        t.diagnostic(`symlink assertion skipped: ${error.message}`);
        return;
      }
      throw error;
    }
    assert.throws(
      () => registry.add("linked", { root: linked }),
      /cannot be a symlink/,
    );
  } finally {
    registry.close();
  }
});

test("host schema publishes workspace and concurrency contracts", () => {
  const schema = JSON.parse(fs.readFileSync(hostConfigSchemaPath, "utf8"));
  assert.equal(schema.$id, "https://avoozl.dev/schema/host-config-v1.json");
  assert.equal(schema.properties.maxConcurrentRuns.minimum, 1);
  assert.equal(schema.$defs.workspace.properties.maxConcurrentRuns.minimum, 0);
  assert.equal(
    schema.$defs.workspace.properties.maxConcurrentRuns.description,
    "Maximum new runs in this workspace. Zero pauses dispatch without stopping active runs.",
  );
});

test("loadHostConfig preserves unrelated global defaults", () => {
  const { env } = machineEnvironment(),
    paths = machineAvoozlPaths({ env, home: "/unused" });
  fs.mkdirSync(path.dirname(paths.configPath), { recursive: true });
  fs.writeFileSync(
    paths.configPath,
    JSON.stringify({
      version: 1,
      conversations: { autoArchiveCompleted: true },
      workspaces: {},
    }),
  );
  const loaded = loadHostConfig({ env, home: "/unused" });
  assert.equal(loaded.config.conversations.autoArchiveCompleted, true);
  assert.deepEqual(loaded.config.workspaces, {});
});

test("one unavailable workspace does not prevent healthy registrations from loading", () => {
  const { env } = machineEnvironment(),
    healthy = initializedWorkspace("Healthy"),
    paths = machineAvoozlPaths({ env, home: "/unused" });
  fs.mkdirSync(path.dirname(paths.configPath), { recursive: true });
  fs.writeFileSync(
    paths.configPath,
    JSON.stringify({
      version: 1,
      defaultWorkspace: "healthy",
      workspaces: {
        missing: {
          root: path.join(path.dirname(healthy), "missing-workspace"),
          enabled: true,
        },
        healthy: {
          root: healthy,
          enabled: true,
        },
      },
    }),
  );
  const registry = new WorkspaceRegistry({ env, home: "/unused" });
  try {
    assert.equal(registry.list().length, 2);
    assert.equal(registry.validate("healthy").root, fs.realpathSync(healthy));
    assert.throws(() => registry.validate("missing"), /does not exist/);
  } finally {
    registry.close();
  }
});
