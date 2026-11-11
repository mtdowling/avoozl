import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { initializeWorkspace } from "../workspace.mjs";
import { workspaceConfig } from "../config.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));

function invoke(args, env) {
  return JSON.parse(
    execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    }),
  );
}

function invokeFailure(args, env) {
  try {
    execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
  } catch (error) {
    return String(error.stderr || error.message);
  }
  assert.fail(`Expected command to fail: ${args.join(" ")}`);
}

function offlineHostEnvironment(machine) {
  const env = {
      XDG_CONFIG_HOME: path.join(machine, "config"),
      XDG_STATE_HOME: path.join(machine, "state"),
    },
    filename = path.join(env.XDG_CONFIG_HOME, "avoozl", "config.json");
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(
    filename,
    JSON.stringify({ version: 1, port: 0, workspaces: {} }),
  );
  return env;
}

test("workspace CLI registers, controls, lists, and removes a workspace", () => {
  const machine = temporaryDirectory("avoozl-host-cli-"),
    workspace = temporaryDirectory("avoozl-host-cli-workspace-"),
    env = offlineHostEnvironment(machine);
  initializeWorkspace(workspace, { name: "CLI workspace", port: 0 });

  const added = invoke(
    [
      "workspace",
      "add",
      "cli-workspace",
      "--root",
      workspace,
      "--max-concurrent-runs",
      "3",
    ],
    env,
  );
  assert.equal(added.id, "cli-workspace");
  assert.equal(added.maxConcurrentRuns, 3);

  const paused = invoke(
    ["workspace", "concurrency", "cli-workspace", "0"],
    env,
  );
  assert.equal(paused.dispatchPaused, true);

  const status = invoke(["status"], env);
  assert.equal(status.defaultWorkspace, "cli-workspace");
  assert.equal(status.workspaces[0].maxConcurrentRuns, 0);

  const stopped = invoke(["workspace", "stop", "cli-workspace"], env);
  assert.equal(stopped.state, "stopped");
  const started = invoke(["workspace", "start", "cli-workspace"], env);
  assert.equal(started.state, "closed");

  const removed = invoke(["workspace", "remove", "cli-workspace"], env);
  assert.equal(removed.databasePreserved, true);
  assert.equal(invoke(["workspace", "list"], env).workspaces.length, 0);
});

test("workspace CLI adopts existing state and local maintenance refuses registered IDs", () => {
  const machine = temporaryDirectory("avoozl-host-cli-adopt-"),
    workspace = temporaryDirectory("avoozl-host-cli-legacy-"),
    env = offlineHostEnvironment(machine);
  initializeWorkspace(workspace, { name: "Legacy CLI workspace", port: 0 });
  const database = workspaceConfig({ workspace }).dbPath,
    store = new Store(database);
  try {
    store.setMeta("workspaceId", "legacy-random");
    store.put("runs", {
      id: "historical",
      taskId: "missing",
      state: "completed",
    });
  } finally {
    store.close();
  }

  const adopted = invoke(
    ["workspace", "adopt", "legacy-cli", "--root", workspace],
    env,
  );
  assert.equal(adopted.id, "legacy-cli");
  assert.equal(adopted.migration.changes.runsUpdated, 1);
  const retry = invoke(
    ["workspace", "adopt", "legacy-cli", "--root", workspace],
    env,
  );
  assert.equal(retry.migration.alreadyAdopted, true);

  const snapshot = path.join(machine, "snapshot.json"),
    migrated = new Store(database);
  try {
    fs.writeFileSync(snapshot, JSON.stringify(migrated.read()));
  } finally {
    migrated.close();
  }
  for (const [args, message] of [
    [
      ["backup", "--workspace", "legacy-cli", "--output", snapshot + ".sqlite"],
      "Backup",
    ],
    [
      ["export", "--workspace", "legacy-cli", "--output", snapshot + ".out"],
      "Export",
    ],
    [["import", snapshot, "--workspace", "legacy-cli", "--dry-run"], "Import"],
  ])
    assert.match(
      invokeFailure(args, env),
      new RegExp(`${message} is a local-only maintenance operation`),
    );
});
