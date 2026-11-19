// `avoozl status` with a workspace named by --workspace or AVOOZL_WORKSPACE
// reports that workspace, registered on this machine or not, beside the
// machine view. Naming a workspace is never ignored.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { workspaceConfig } from "../config.mjs";
import { Store } from "../store.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const CLI = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));

// A machine with an offline host (port 0) and no workspace in its environment.
function machine() {
  const root = temporaryDirectory("avoozl-workspace-status-"),
    env = { ...process.env };
  for (const key of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE|KIROCREW)(_|$)/.test(key))
      delete env[key];
  Object.assign(env, {
    HOME: path.join(root, "home"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_STATE_HOME: path.join(root, "state"),
  });
  fs.mkdirSync(env.HOME, { recursive: true });
  const hostFile = path.join(env.XDG_CONFIG_HOME, "avoozl", "config.json");
  fs.mkdirSync(path.dirname(hostFile), { recursive: true });
  fs.writeFileSync(
    hostFile,
    JSON.stringify({ version: 1, port: 0, workspaces: {} }),
  );
  return { root, env };
}

function cli(env, ...args) {
  const run = spawnSync(process.execPath, [CLI, ...args], {
    env,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

// An initialized workspace holding the fixture's one planned task.
function workspace(root, name) {
  const directory = path.join(root, name);
  initializeWorkspace(directory, { name: "Status fixture", port: 0 });
  const store = new Store(workspaceConfig({ workspace: directory }).dbPath);
  try {
    store.write({ ...structuredClone(store.read()), tasks: snapshot().tasks });
  } finally {
    store.close();
  }
  return directory;
}

test("status reports a named workspace that this machine has not registered", () => {
  const { root, env } = machine(),
    directory = workspace(root, "unregistered"),
    status = cli(env, "status", "--workspace", directory);
  assert.equal(status.workspace.named, directory);
  assert.equal(status.workspace.from, "--workspace");
  assert.equal(status.workspace.root, directory);
  assert.equal(status.workspace.name, "Status fixture");
  assert.match(status.workspace.namespace, /^avz_/);
  assert.equal(
    status.workspace.configFile,
    path.join(directory, ".avoozl.json"),
  );
  assert.equal(status.workspace.registered, false);
  assert.equal(Object.hasOwn(status.workspace, "registration"), false);
  assert.equal(status.workspace.initialized, true);
  assert.equal(status.workspace.health, "ok");
  assert.deepEqual(status.workspace.counts, {
    tasks: 1,
    tasksByStatus: { planned: 1 },
    documents: 0,
    plans: 0,
    runsByState: {},
  });
  // The machine view is still there, beside the workspace.
  assert.deepEqual(status.workspaces, []);
  assert.deepEqual(status.machine.supervisor, { running: false });
});

test("status says a named workspace is registered, by path, by ID and from the environment", () => {
  const { root, env } = machine(),
    directory = workspace(root, "registered");
  cli(env, "workspace", "add", "status-fixture", "--root", directory);
  const expected = {
    id: "status-fixture",
    default: true,
    enabled: true,
    state: "closed",
  };
  for (const [args, extra, from, named] of [
    [["--workspace", directory], {}, "--workspace", directory],
    [["--workspace", "status-fixture"], {}, "--workspace", "status-fixture"],
    [[], { AVOOZL_WORKSPACE: directory }, "AVOOZL_WORKSPACE", directory],
  ]) {
    const status = cli({ ...env, ...extra }, "status", ...args);
    assert.equal(status.workspace.named, named);
    assert.equal(status.workspace.from, from);
    assert.equal(
      fs.realpathSync(status.workspace.root),
      fs.realpathSync(directory),
    );
    assert.equal(status.workspace.workspaceId, "status-fixture");
    assert.equal(status.workspace.registered, true);
    assert.deepEqual(status.workspace.registration, expected);
    assert.equal(status.workspace.counts.tasks, 1);
    assert.equal(status.defaultWorkspace, "status-fixture");
  }
});

test("status with no workspace named keeps the machine view alone", () => {
  const { root, env } = machine();
  workspace(root, "unnamed");
  const status = cli(env, "status");
  assert.equal(Object.hasOwn(status, "workspace"), false);
  assert.deepEqual(Object.keys(status), [
    "host",
    "port",
    "defaultWorkspace",
    "configPath",
    "catalogPath",
    "workspaces",
    "machine",
  ]);
});

test("status says so when the named path holds no workspace, and creates nothing", () => {
  const { root, env } = machine(),
    missing = path.join(root, "missing"),
    status = cli(env, "status", "--workspace", missing);
  assert.equal(status.workspace.root, missing);
  assert.equal(status.workspace.initialized, false);
  assert.equal(status.workspace.registered, false);
  assert.equal(status.workspace.name, null);
  assert.equal(
    status.workspace.health,
    `No workspace at ${missing}. Create one with avoozl init ${missing}.`,
  );
  assert.equal(Object.hasOwn(status.workspace, "counts"), false);
  assert.equal(fs.existsSync(missing), false);

  // A configuration whose database is gone is a different state.
  const directory = workspace(root, "no-database"),
    { dbPath } = workspaceConfig({ workspace: directory });
  for (const suffix of ["", "-wal", "-shm"])
    fs.rmSync(dbPath + suffix, { force: true });
  const configured = cli(env, "status", "--workspace", directory);
  assert.equal(configured.workspace.name, "Status fixture");
  assert.equal(configured.workspace.initialized, false);
  assert.match(configured.workspace.health, /configured but has no database/);
  assert.equal(fs.existsSync(dbPath), false);
});
