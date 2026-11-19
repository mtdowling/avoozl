// A person takes a task by hand while the tick is the dispatcher
// (worker-paths WP2.1 to WP2.4, WP2.7; design D6). No delivery.runner is set.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { drainCheckRuns } from "../check-runs.mjs";
import { workspaceConfig } from "../config.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));
const config = temporaryDirectory("avoozl-take-config-");
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
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
  repository: "app",
});
const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });
const local = { local: true };

// A workspace on the tick: two lanes, a real checkout, tasks a, b, c, where c
// requires a.
function setup(t) {
  const root = temporaryDirectory("avoozl-take-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery: { concurrency: 3, retries: 1 } }),
  );
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [leaf("a"), leaf("b"), leaf("c")],
    edges: [{ from: "a", to: "c", kind: "requires" }],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    checks: [["git", "status"]],
  });
  const ops = new Operations(store, { workspaceRoot: root }),
    take = (input, context = local) =>
      ops.execute("runner.take", input, undefined, context),
    tick = (slots = []) =>
      ops.execute("workspace.tick", {
        sessions: slots.map((target) => ({ target, status: "working" })),
      });
  return { root, store, ops, take, tick };
}

function run(root, args, env = {}) {
  const clean = { ...process.env, XDG_CONFIG_HOME: config, ...env };
  for (const name of Object.keys(clean))
    if (/^(AVOOZL_(?!CHILD)|KIROCREW)/.test(name)) delete clean[name];
  return spawnSync(process.execPath, [cli, ...args, "--workspace", root], {
    encoding: "utf8",
    env: clean,
    cwd: root,
  });
}

test("a taken task stays unstarted across three ticks, and the tick still starts the others", async (t) => {
  const { take, tick } = setup(t),
    mine = await take({ taskId: "a" });
  assert.equal(mine.binding.conductor, "cli");
  assert.match(mine.report, /runner report a done/);
  assert.ok(fs.existsSync(mine.worktree.path));
  const started = [];
  for (let i = 0; i < 3; i++)
    for (const d of (await tick([mine.binding.slot])).dispatch)
      started.push(d.task);
  assert.ok(!started.includes("a"), "the tick never starts a taken task");
  assert.ok(started.includes("b"), "it starts the other ready task");
});

test("runner report from the worktree with no token finishes it, and Avoozl runs the checks", async (t) => {
  const { root, store, take, tick } = setup(t),
    mine = await take({ taskId: "a" });
  fs.writeFileSync(path.join(mine.worktree.path, "a.txt"), "a\n");
  git(mine.worktree.path, "add", ".");
  git(mine.worktree.path, "commit", "-qm", "Do a");
  const head = git(mine.worktree.path, "rev-parse", "HEAD"),
    out = spawnSync(
      process.execPath,
      [cli, "runner", "report", "a", "done", "--workspace", root],
      {
        encoding: "utf8",
        cwd: mine.worktree.path,
        env: { ...process.env, XDG_CONFIG_HOME: config },
      },
    );
  assert.equal(out.status, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).report.commit, head);
  const slots = [mine.binding.slot];
  for (let i = 0; i < 12; i++) {
    await tick(slots);
    await drainCheckRuns(store);
    if (store.read().tasks.find((x) => x.id === "a").integration?.commit) break;
  }
  assert.ok(
    store.read().tasks.find((x) => x.id === "a").integration?.commit,
    "the checks ran and the work landed",
  );
});

test("a take is refused with its reason for a task that is not ready, running, or held", async (t) => {
  const { store, ops, take } = setup(t);
  await assert.rejects(
    take({ taskId: "c" }),
    (e) =>
      e.status === 409 && /not ready to start: it is blocked/.test(e.message),
  );
  await assert.rejects(take({ taskId: "zzz" }), (e) => e.status === 404);
  // A chat the tick started holds b.
  await ops.execute("session.bind", {
    taskId: "b",
    slot: "chat",
    attempt: 1,
    source: "tick",
    title: "avoozl:b Task b",
  });
  await assert.rejects(
    take({ taskId: "b" }),
    (e) =>
      e.status === 409 &&
      /not ready to start: it has a session running/.test(e.message),
  );
  // Stop the line holds a.
  store.put("flow_stops", {
    id: "stop-1",
    manual: true,
    scope: "all",
    repositoryId: "app",
    openedAt: new Date().toISOString(),
    closedAt: null,
    runAnyway: null,
  });
  await assert.rejects(
    take({ taskId: "a" }),
    (e) => e.status === 409 && /Stop the line holds it/.test(e.message),
  );
});

test("a take over MCP, from an agent session, or from a supervisor child is refused", async (t) => {
  const { root, take } = setup(t);
  for (const context of [{}, as("chat"), { caller: { sessionKey: null } }])
    await assert.rejects(
      take({ taskId: "a" }, context),
      (e) => e.status === 403 && /person/.test(e.message),
    );
  const child = run(root, ["take", "a"], { AVOOZL_CHILD: "1" });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /supervisor started/);
  const person = run(root, ["take", "a"]);
  assert.equal(person.status, 0, person.stderr);
});

test("release gives the task back, refuses a dirty worktree without --discard", async (t) => {
  const { root, store, take, tick } = setup(t),
    mine = await take({ taskId: "a" });
  fs.writeFileSync(path.join(mine.worktree.path, "wip.txt"), "wip\n");
  const refused = run(root, ["take", "a", "--release"]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /uncommitted changes/);
  assert.ok(store.get("session_bindings", mine.binding.slot), "still taken");
  const out = run(root, ["take", "a", "--release", "--discard"]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).discarded, true);
  assert.equal(fs.existsSync(path.join(mine.worktree.path, "wip.txt")), false);
  assert.equal(store.get("session_bindings", mine.binding.slot), null);
  // Ready again: the next tick starts it.
  const started = (await tick()).dispatch.map((d) => d.task);
  assert.ok(started.includes("a"));
  // A clean take releases without a flag.
  const second = await take({ taskId: "b" }),
    clean = await take({ taskId: "b", release: true });
  assert.equal(clean.released, "b");
  assert.equal(clean.discarded, false);
  assert.equal(store.get("session_bindings", second.binding.slot), null);
});
