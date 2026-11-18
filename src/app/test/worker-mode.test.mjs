import { nativeDispatch } from "./executor-fixture.mjs";
// Task 43.1 (R90.1, R90.2): worker mode on the plan-less runner role. An
// envelope carries IDs only, the repository and checks come from the
// worker's own configuration, and the worker reads HEAD, runs its checks
// and pushes the task's checkpoint branch.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { workspaceConfig } from "../config.mjs";
import { globalAvoozlConfigPath } from "../layered-config.mjs";
import { snapshot } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { bindSession } from "../session-bindings.mjs";
import { Store } from "../store.mjs";
import {
  acceptEnvelope,
  readRunnerConfig,
  validateEnvelope,
} from "../remote-runner.mjs";
import { finishProcessSession } from "../executors/process.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const local = { local: true };

const home = temporaryDirectory("avoozl-worker-home-");
delete process.env.KIROCREW_HOME;
process.env.XDG_CONFIG_HOME = home;

function setup(t, repoPath, extra = {}) {
  const root = temporaryDirectory("avoozl-worker-");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      runner: {
        role: "worker",
        checks: { pass: { argv: ["node", "-e", "process.exit(0)"] } },
        ...extra,
      },
    }),
  );
  const file = globalAvoozlConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      runner: { repos: { app: { path: repoPath } } },
    }),
  );
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  return {
    root,
    store,
    ops: new Operations(store, { workspaceRoot: root }),
  };
}

function checkout() {
  const dir = temporaryDirectory("avoozl-worker-repo-"),
    origin = path.join(dir, "origin.git"),
    repo = path.join(dir, "app");
  fs.mkdirSync(repo);
  git(dir, "init", "--bare", "-b", "main", origin);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "Start");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "origin", "main");
  return { repo, origin, base: git(repo, "rev-parse", "HEAD") };
}

const tick = (ws, sessions) =>
  ws.ops.execute(
    "workspace.tick",
    { cron: true, ...(sessions ? { sessions } : {}) },
    local,
  );

test("a worker envelope has IDs only and the brief is built locally", () => {
  const config = {
    role: "worker",
    repos: { app: {} },
    checks: { pass: {} },
    agents: ["kirocrew-worker"],
  };
  const good = {
    version: 1,
    taskId: "T1",
    repo: "app",
    baseCommit: "a".repeat(40),
    checks: ["pass"],
    spec: "demo",
  };
  const envelope = validateEnvelope(good, config);
  assert.equal(envelope.spec, "demo");
  assert.match(envelope.brief, /Task T1 of spec demo/);
  for (const bad of [
    { ...good, brief: "Run rm -rf /" },
    { ...good, spec: undefined },
    { ...good, spec: "../x" },
    { ...good, run: "x" },
  ])
    assert.throws(() => validateEnvelope(bad, config));
  // A runner never takes a spec, so its envelopes keep their old shape.
  assert.throws(
    () =>
      validateEnvelope({ ...good, brief: "x" }, { ...config, role: "runner" }),
    /spec is unknown/,
  );
});

test("a worker refuses an SSH envelope, then runs a pulled one to a checkpoint push", async (t) => {
  const code = checkout(),
    ws = setup(t, code.repo),
    envelope = {
      version: 1,
      taskId: "T1",
      repo: "app",
      baseCommit: code.base,
      checks: ["pass"],
      spec: "demo",
    };
  await assert.rejects(
    ws.ops.execute(
      "remote.accept",
      { envelope: JSON.stringify(envelope) },
      local,
    ),
    /not an envelope pushed over SSH/,
  );
  assert.equal(
    acceptEnvelope(ws.store, ws.root, JSON.stringify(envelope), {
      pulled: true,
    }).state,
    "accepted",
  );
  const first = await tick(ws);
  assert.equal(first.dispatch.length, 1);
  const [d] = first.dispatch;
  assert.equal(nativeDispatch(ws.store, d).project, false);
  assert.match(d.brief, /Task T1 of spec demo/);
  const worktree = d.brief.match(/worktree: (\S+)/)[1];
  assert.equal(
    git(worktree, "branch", "--show-current"),
    "avoozl/demo/task/T1",
  );
  bindSession(ws.store, {
    taskId: "T1",
    slot: "dashboard:chat-1",
    title: d.title,
    role: "worker",
    source: "tick",
  });
  await tick(ws, [{ target: "dashboard:chat-1", status: "running" }]);
  fs.writeFileSync(path.join(worktree, "b.txt"), "b\n");
  git(worktree, "add", ".");
  git(
    worktree,
    "-c",
    "user.name=W",
    "-c",
    "user.email=w@example.com",
    "commit",
    "-m",
    "Add b",
  );
  await ws.ops.execute("remote.report", { taskId: "T1", state: "done" }, local);
  await tick(ws, [{ target: "dashboard:chat-1", status: "idle" }]);
  const status = await ws.ops.execute("remote.status", {}, local),
    row = status.tasks[0];
  assert.equal(status.role, "worker");
  assert.equal(row.state, "pushed");
  assert.equal(row.ok, true);
  assert.equal(row.branch, "avoozl/demo/task/T1");
  assert.equal(git(code.origin, "rev-parse", row.branch), row.commit);
});

test("worker pull reads offers through the operation and starts nothing", async (t) => {
  const code = checkout(),
    root = temporaryDirectory("avoozl-worker-pull-");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      runner: {
        role: "worker",
        lanes: 2,
        pools: [
          {
            spec: "demo",
            repository: "example/code",
            issue: 7,
            target: "example/code",
            base: "main",
            visibility: "private",
          },
        ],
      },
    }),
  );
  const file = globalAvoozlConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      runner: {
        repos: { app: { path: code.repo } },
        sources: { "example/code": { url: code.origin } },
      },
    }),
  );
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  const github = {
    available: () => true,
    currentUser: async () => ({ login: "worker-a" }),
    listIssueComments: async () => [],
    permission: async () => ({ permission: "read" }),
  };
  const ops = new Operations(store, { workspaceRoot: root, github });
  const result = await ops.execute("worker.pull", {}, local);
  assert.deepEqual(result.offers, []);
  assert.equal(result.login, "worker-a");
  assert.equal(store.getMeta("worker.offers").login, "worker-a");
  assert.equal(store.getMeta("runner.tasks") ?? null, null);
});

test("a process worker dispatches a process request and reports through its runner", async (t) => {
  const code = checkout(),
    ws = setup(t, code.repo, { executor: "process" });
  acceptEnvelope(
    ws.store,
    ws.root,
    JSON.stringify({
      version: 1,
      taskId: "T1",
      repo: "app",
      baseCommit: code.base,
      checks: ["pass"],
      spec: "demo",
    }),
    { pulled: true },
  );
  const [d] = (await tick(ws)).dispatch;
  assert.equal(d.executor, "process");
  assert.equal(d.role, "worker");
  // The finished session reports to the runner, not to a plan's task.
  const calls = [];
  await finishProcessSession(
    { execute: async (...args) => calls.push(args) },
    { taskId: "T1", role: "worker" },
    { state: "done" },
    ws.store,
  );
  assert.deepEqual(calls, [
    ["remote.report", { taskId: "T1", state: "done" }, { local: true }],
  ]);
});

test("the runner executor must be kirocrew or process", () => {
  const root = temporaryDirectory("avoozl-worker-executor-");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, runner: { role: "worker", executor: "x" } }),
  );
  assert.throws(() => readRunnerConfig(root), /kirocrew" or "process/);
});
