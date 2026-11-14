// Phase 38 (R84): runner mode over SSH. A driver hands a task envelope to a
// runner, the runner's own tick opens the worker, and status and the worker's
// identity come back. SSH is replaced by `via: "local"`, which runs the same
// `avoozl runner ...` argv on this machine.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { workspaceConfig } from "../config.mjs";
import { globalAvoozlConfigPath } from "../layered-config.mjs";
import { snapshot } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { bindSession } from "../session-bindings.mjs";
import { Store } from "../store.mjs";
import { commandFor, validateEnvelope } from "../remote-runner.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const local = { local: true };

// Machine-local paths belong in the machine config, not in .avoozl.json.
const home = temporaryDirectory("avoozl-remote-home-");
delete process.env.KIROCREW_HOME;
process.env.XDG_CONFIG_HOME = home;
function workspace(t, runner, machine) {
  const root = temporaryDirectory("avoozl-remote-");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, ...(runner ? { runner } : {}) }),
  );
  if (machine) {
    const file = globalAvoozlConfigPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 1, runner: machine }));
  }
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => {
    try {
      store.close();
    } catch {
      // A test that closed it to simulate a restart.
    }
  });
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  return {
    root,
    dbPath,
    store,
    ops: new Operations(store, { workspaceRoot: root }),
  };
}

// A checkout with a bare `origin`, so the runner has somewhere to push.
function checkout() {
  const dir = temporaryDirectory("avoozl-remote-repo-"),
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

function pair(t) {
  const code = checkout(),
    runner = workspace(t, {
      role: "runner",
      crewId: "crew-b",
      checks: {
        pass: { argv: ["node", "-e", "process.exit(0)"] },
        fail: { argv: ["node", "-e", "process.exit(3)"] },
      },
    }),
    env = {
      AVOOZL_WORKSPACE: runner.root,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    };
  // Paths and the local stand-in for ssh are machine config.
  const file = globalAvoozlConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      runner: {
        repos: { app: { path: code.repo } },
        hosts: { box: { argv: ["node", cli], env } },
      },
    }),
  );
  const driver = workspace(t, {
    role: "driver",
    hosts: { box: { via: "local", dashboardUrl: "https://crew-b.example/" } },
  });
  const envelope = {
    version: 1,
    taskId: "T1",
    repo: "app",
    baseCommit: code.base,
    brief: "Add b.txt with the word hello.",
    checks: ["pass", "fail"],
    agent: "kirocrew-worker",
  };
  return { code, runner, driver, envelope };
}

const tick = (ws, sessions) =>
  ws.ops.execute(
    "workspace.tick",
    { cron: true, ...(sessions ? { sessions } : {}) },
    local,
  );

test("an envelope with an unknown field, check, repo or agent is refused", (t) => {
  const { runner, envelope } = pair(t),
    config = {
      repos: { app: {} },
      checks: { pass: {} },
      agents: ["kirocrew-worker"],
    };
  assert.equal(
    validateEnvelope(envelope, { ...config, checks: { pass: {}, fail: {} } })
      .taskId,
    "T1",
  );
  for (const bad of [
    { ...envelope, run: "rm -rf /" },
    { ...envelope, repo: "../../etc" },
    { ...envelope, checks: ["pass; rm -rf /"] },
    { ...envelope, agent: "other" },
    { ...envelope, baseCommit: "main" },
    { ...envelope, version: 2 },
  ])
    assert.throws(() => validateEnvelope(bad, config));
  assert.ok(runner.root);
});

test("a workspace without runner settings refuses runner operations", async (t) => {
  const ws = workspace(t, null);
  await assert.rejects(
    ws.ops.execute("remote.status", {}, local),
    /not a runner/,
  );
  await assert.rejects(
    ws.ops.execute("remote.accept", { envelope: "{}" }, local),
    /not a runner/,
  );
});

test("a handed task runs end to end and the status carries the worker", async (t) => {
  const { code, runner, driver, envelope } = pair(t);
  // Idle: a runner with no task plans nothing and asks nothing of a model.
  const idle = await tick(runner);
  assert.deepEqual(idle.dispatch, []);
  // The driver pushes through the transport; the runner records it once.
  const handed = await driver.ops.execute(
    "remote.handoff",
    { host: "box", envelope },
    local,
  );
  assert.equal(handed.state, "accepted");
  const again = await driver.ops.execute(
    "remote.handoff",
    { host: "box", envelope },
    local,
  );
  assert.equal(again.duplicate, true);
  await assert.rejects(
    driver.ops.execute(
      "remote.handoff",
      { host: "box", envelope: { ...envelope, brief: "Something else." } },
      local,
    ),
    /already accepted with other content/,
  );
  // The runner's own tick plans the worker.
  const first = await tick(runner);
  assert.equal(first.dispatch.length, 1);
  const [d] = first.dispatch;
  assert.equal(d.task, "T1");
  assert.equal(d.project, false);
  assert.match(d.brief, /runner report T1 --state done/);
  const worktree = d.brief.match(/worktree: (\S+)/)[1];
  assert.equal(git(worktree, "rev-parse", "HEAD"), code.base);
  // Until the script binds it, the same dispatch is planned again, not a second worker.
  bindSession(runner.store, {
    taskId: "T1",
    slot: "dashboard:chat-9",
    title: d.title,
    role: "worker",
    source: "tick",
  });
  const second = await tick(runner, [
    { target: "dashboard:chat-9", status: "running" },
  ]);
  assert.deepEqual(second.dispatch, []);
  // A report before any commit is refused.
  await assert.rejects(
    runner.ops.execute("remote.report", { taskId: "T1", state: "done" }, local),
    /no new commit/,
  );
  fs.writeFileSync(path.join(worktree, "b.txt"), "hello\n");
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
  await runner.ops.execute(
    "remote.report",
    { taskId: "T1", state: "done" },
    local,
  );
  await tick(runner, [{ target: "dashboard:chat-9", status: "idle" }]);
  const status = await runner.ops.execute("remote.status", {}, local),
    row = status.tasks[0];
  assert.equal(row.state, "pushed");
  assert.equal(row.branch, "avoozl/remote/T1");
  assert.deepEqual(row.checks, [
    { id: "pass", exit: 0 },
    { id: "fail", exit: 3 },
  ]);
  assert.equal(row.ok, false);
  assert.equal(git(code.origin, "rev-parse", row.branch), row.commit);
  assert.deepEqual(
    {
      chatKey: row.worker.chatKey,
      crewId: row.worker.crewId,
      path: row.worker.path,
    },
    { chatKey: "chat-9", crewId: "crew-b", path: "/chat?sid=chat-9" },
  );
  assert.ok(!JSON.stringify(status).includes("token"));
  // The driver reads it back through the same transport.
  assert.equal(
    (await driver.ops.execute("remote.pull", { host: "box" }, local)).ok,
    true,
  );
  const view = await driver.ops.execute("remote.view", {}, local);
  // A pushed task is finished; no worker is in flight.
  assert.deepEqual(view.workers, []);
});

test("In flight shows a remote worker with its crew's chat link, and a dropped link keeps the last answer", async (t) => {
  const { runner, driver, envelope } = pair(t);
  await driver.ops.execute("remote.handoff", { host: "box", envelope }, local);
  const { dispatch } = await tick(runner);
  bindSession(runner.store, {
    taskId: "T1",
    slot: "dashboard:chat-4",
    title: dispatch[0].title,
    role: "worker",
    source: "tick",
  });
  await tick(runner, [{ target: "dashboard:chat-4", status: "running" }]);
  await driver.ops.execute("remote.pull", { host: "box" }, local);
  let [worker] = (await driver.ops.execute("remote.view", {}, local)).workers;
  assert.equal(worker.attachUrl, "https://crew-b.example/chat?sid=chat-4");
  assert.equal(worker.host, "box");
  assert.equal(worker.crewId, "crew-b");
  assert.equal(worker.stale, false);
  // SSH drops: the pull fails, the last answer stays, marked stale.
  const bad = {
    code: 255,
    stdout: "",
    stderr: "ssh: connect to host box port 22: Connection timed out",
  };
  const { pullStatus } = await import("../remote-runner.mjs");
  const result = await pullStatus(
    driver.store,
    driver.root,
    { host: "box" },
    { run: async () => bad },
  );
  assert.equal(result.stale, true);
  [worker] = (await driver.ops.execute("remote.view", {}, local)).workers;
  assert.equal(worker.stale, true);
  assert.equal(worker.chatKey, "chat-4");
  // A hand-off over a dead link fails and writes nothing on the runner.
  await assert.rejects(
    (await import("../remote-runner.mjs")).handoff(
      driver.store,
      driver.root,
      { host: "box", envelope: { ...envelope, taskId: "T2" } },
      { run: async () => bad },
    ),
    /refused the task \(exit 255\)/,
  );
  const status = await runner.ops.execute("remote.status", {}, local);
  assert.deepEqual(
    status.tasks.map((x) => x.taskId),
    ["T1"],
  );
  // The link comes back: the same pull works again.
  assert.equal(
    (await driver.ops.execute("remote.pull", { host: "box" }, local)).ok,
    true,
  );
  [worker] = (await driver.ops.execute("remote.view", {}, local)).workers;
  assert.equal(worker.stale, false);
});

test("a restarted runner claims nothing twice and never replaces a worker whose chat ended", async (t) => {
  const { runner, driver, envelope } = pair(t);
  await driver.ops.execute("remote.handoff", { host: "box", envelope }, local);
  const { dispatch } = await tick(runner);
  bindSession(runner.store, {
    taskId: "T1",
    slot: "dashboard:chat-2",
    title: dispatch[0].title,
    role: "worker",
    source: "tick",
  });
  await tick(runner, [{ target: "dashboard:chat-2", status: "running" }]);
  // A restart: a new process opens the same database.
  runner.store.close();
  const store = new Store(runner.dbPath);
  t.after(() => store.close());
  const ops = new Operations(store, { workspaceRoot: runner.root });
  const after = await tick({ ops }, [
    { target: "dashboard:chat-2", status: "closed" },
  ]);
  assert.deepEqual(after.dispatch, []);
  assert.equal(after.notify.length, 1);
  assert.match(after.notify[0].text, /was not replaced/);
  const again = await tick({ ops }, [
    { target: "dashboard:chat-2", status: "closed" },
  ]);
  assert.deepEqual(again.dispatch, []);
  assert.equal(
    (await ops.execute("remote.status", {}, local)).tasks[0].state,
    "working",
  );
});

test("ssh runs a fixed command line and the envelope never enters it", () => {
  const argv = commandFor({ ssh: "me@box" }, ["runner", "accept", "-"]);
  assert.deepEqual(argv.slice(-4), ["avoozl", "runner", "accept", "-"]);
  assert.ok(argv.includes("BatchMode=yes") && argv.includes("me@box"));
});

test("worker mode is off unless the runner names it, and a lost binding is found by title", async (t) => {
  const { runner, driver, envelope } = pair(t);
  await driver.ops.execute("remote.handoff", { host: "box", envelope }, local);
  const [d] = (await tick(runner)).dispatch;
  assert.equal(d.mode, undefined);
  const { rediscoverSessions } = await import("../session-bindings.mjs");
  const found = rediscoverSessions(runner.store, {
    sessions: [{ slot: "dashboard:chat-7", title: d.title }],
  });
  assert.equal(found.bound.length, 1);
  assert.deepEqual((await tick(runner)).dispatch, []);
  const root = runner.root;
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      runner: { role: "runner", workerMode: "trust" },
    }),
  );
  const { readRunnerConfig } = await import("../remote-runner.mjs");
  assert.equal(readRunnerConfig(root).workerMode, "trust");
});
