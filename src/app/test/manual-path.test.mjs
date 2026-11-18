// Task 52.1 (R96.5, design §4.28): the manual path stays. A person at a
// plain shell, with no Kiro Crew session, gateway or MCP, can run `avoozl
// next`, `avoozl claim` and `avoozl runner report`. One test per command;
// each runs the real CLI as a child process.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { workspaceConfig } from "../config.mjs";
import { globalAvoozlConfigPath } from "../layered-config.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

// The runner's machine config lives here, for this process and the CLI.
const config = temporaryDirectory("avoozl-manual-config-");
delete process.env.KIROCREW_HOME;
process.env.XDG_CONFIG_HOME = config;

// A plain shell: no Kiro Crew, gateway, session or Avoozl variables.
function plainEnv() {
  const env = { ...process.env, XDG_CONFIG_HOME: config };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE|KIROCREW)(_|$)|^PORT$/.test(name))
      delete env[name];
  return env;
}

// Run the CLI as a person would; a refusal or crash fails the test with its
// own message.
function avoozl(root, ...args) {
  const result = spawnSync(
    process.execPath,
    [cli, ...args, "--workspace", root],
    { encoding: "utf8", env: plainEnv(), cwd: root },
  );
  assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function repository(dir) {
  fs.mkdirSync(dir);
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.name", "Person");
  git(dir, "config", "user.email", "person@example.com");
  fs.writeFileSync(path.join(dir, "README.md"), "app\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "Start");
  return fs.realpathSync.native(dir);
}

function commit(worktree, file) {
  fs.writeFileSync(path.join(worktree, file), "done\n");
  git(worktree, "add", file);
  git(
    worktree,
    "-c",
    "user.name=Person",
    "-c",
    "user.email=person@example.com",
    "commit",
    "-m",
    "Do the task",
  );
  return git(worktree, "rev-parse", "HEAD");
}

const leaf = (id) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  checks: [],
  repository: "app",
});

// A workspace at the CLI's default database path. `avoozl` holds the
// portable settings; the runner's repository paths are machine config.
function workspace(t, avoozl, machine) {
  const root = temporaryDirectory("avoozl-manual-");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, ...avoozl }),
  );
  const file = globalAvoozlConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, ...machine }));
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

function crewMode(t) {
  const ws = workspace(
    t,
    { delivery: { runner: "crew-mode", concurrency: 2 } },
    {},
  );
  ws.store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("a"), leaf("b")],
    edges: [],
  });
  ws.store.put("projects", {
    id: "app",
    root: repository(path.join(ws.root, "app")),
    baseBranch: "main",
  });
  return ws;
}

const ids = (rows) => rows.map((row) => row.id);

test("avoozl next lists ready work with its brief from a plain shell", (t) => {
  const { root } = crewMode(t);
  const view = avoozl(root, "next");
  assert.deepEqual(ids(view.ready), ["a", "b"]);
  assert.match(view.ready[0].brief, /Task a/);
  assert.deepEqual(view.running, []);
  assert.equal(view.finished, false);
});

test("avoozl claim gives a person the task and its worktree from a plain shell", (t) => {
  const { root, store } = crewMode(t);
  const claim = avoozl(root, "claim", "a", "--slot", "me");
  assert.deepEqual(
    [claim.binding.taskId, claim.binding.slot, claim.binding.conductor],
    ["a", "me", "cli"],
  );
  assert.equal(claim.worktree.branch, "avoozl/a");
  assert.ok(fs.existsSync(claim.worktree.path));
  // The claim holds: next shows it running, not ready, and a second claim is
  // refused with a message a person can act on.
  const view = avoozl(root, "next");
  assert.deepEqual(ids(view.ready), ["b"]);
  assert.deepEqual(
    view.running.map((row) => [row.id, row.slot]),
    [["a", "me"]],
  );
  const again = spawnSync(
    process.execPath,
    [cli, "claim", "a", "--slot", "other", "--workspace", root],
    { encoding: "utf8", env: plainEnv(), cwd: root },
  );
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /not ready to start/);
  // The person finishes in crew mode with the plain report.
  const head = commit(claim.worktree.path, "a.txt");
  const done = avoozl(
    root,
    "report",
    "a",
    "--slot",
    "me",
    "--kind",
    "done",
    "--commit",
    head,
  );
  assert.equal(done.binding.taskId, "a");
  assert.equal(store.get("session_bindings", "me").report.kind, "done");
});

test("avoozl runner report finishes a person's claim from its worktree with no token", (t) => {
  const { root, store } = crewMode(t);
  const claim = avoozl(root, "claim", "a", "--slot", "me");
  const head = commit(claim.worktree.path, "a.txt");
  const report = (cwd, id) =>
    spawnSync(
      process.execPath,
      [cli, "runner", "report", id, "done", "--workspace", root],
      { encoding: "utf8", env: plainEnv(), cwd },
    );
  // Outside the worktree, or for a task nobody claimed, it is refused.
  const outside = report(root, "a");
  assert.notEqual(outside.status, 0);
  assert.match(outside.stderr, /this task's worktree/);
  assert.match(report(claim.worktree.path, "b").stderr, /No one has claimed b/);
  // From the worktree, the commit is read from HEAD.
  const done = report(claim.worktree.path, "a");
  assert.equal(done.status, 0, done.stderr);
  assert.equal(JSON.parse(done.stdout).report.commit, head);
  assert.equal(store.get("session_bindings", "me").report.kind, "done");
});
