// `avoozl status` and `avoozl runner status --json` on a headless machine
// (R98.5): the supervisor and its children, read from the machine state.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { temporaryDirectory } from "./temporary.mjs";
import { machineStatus } from "../machine-status.mjs";
import { openSupervisorDatabase, supervisorPaths } from "../supervisor.mjs";

const CLI = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));

function machine() {
  const root = temporaryDirectory("avoozl-machine-status-");
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE|KIROCREW)(_|$)/.test(key))
      delete env[key];
  Object.assign(env, {
    HOME: path.join(root, "home"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_STATE_HOME: path.join(root, "state"),
    AVOOZL_WORKSPACE: path.join(root, "workspace"),
  });
  fs.mkdirSync(env.HOME, { recursive: true });
  return { env, stateDirectory: path.join(root, "state", "avoozl") };
}

function addChild(db, id, state, exitCode = null) {
  db.prepare(
    `INSERT INTO children (session_id, role, task, worktree, harness,
       permission_class, brief, placeholder_values, state, exit_code,
       requested_at, updated_at)
     VALUES (?, 'worker', ?, '/w', 'claude-code', 'edit', 'SECRET BRIEF',
       '{}', ?, ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z')`,
  ).run(id, `task-${id}`, state, exitCode);
}

const cli = (m, ...args) => {
  const run = spawnSync(process.execPath, [CLI, ...args], {
    env: m.env,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
};

test("a machine with no supervisor state reports nothing and creates nothing", () => {
  const m = machine();
  const status = machineStatus({ stateDirectory: m.stateDirectory });
  assert.deepEqual(status.supervisor, { running: false });
  assert.deepEqual(status.children, []);
  assert.equal(fs.existsSync(supervisorPaths(m.stateDirectory).root), false);
});

test("children show their state and status, never the brief", () => {
  const m = machine();
  const db = openSupervisorDatabase(m.stateDirectory);
  addChild(db, "a", "running");
  addChild(db, "b", "exited", 0);
  addChild(db, "c", "gone");
  db.close();
  const status = machineStatus({ stateDirectory: m.stateDirectory });
  assert.deepEqual(
    status.children.map((c) => [c.sessionId, c.status, c.exitCode]),
    [
      ["a", "working", null],
      ["b", "exited 0", 0],
      ["c", "gone", null],
    ],
  );
  assert.doesNotMatch(JSON.stringify(status), /SECRET BRIEF/);
});

test("runner status --json and status read the same children from the CLI", () => {
  const m = machine();
  const db = openSupervisorDatabase(m.stateDirectory);
  addChild(db, "a", "exited", 0);
  db.close();
  const args = ["--state-directory", m.stateDirectory];
  const runner = cli(m, "runner", "status", "--json", ...args);
  assert.equal(runner.children[0].task, "task-a");
  assert.equal(runner.children[0].status, "exited 0");
  const status = cli(m, "status", ...args);
  assert.equal(status.machine.children[0].sessionId, "a");
});
