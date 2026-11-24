// A person takes a task by hand while the tick is the dispatcher
// (worker-paths WP2.1 to WP2.4, WP2.7; design D6). No delivery.runner is set.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { drainCheckRuns } from "../../delivery/check-runs.ts";
import { workspaceConfig } from "../../settings/config.ts";
import { Operations, type OperationContext } from "../../api/operations.ts";
import { Store } from "../../store/store.ts";
import { snapshot } from "../../test/fixtures.ts";
import { gitCheckout } from "../../test/delivery-fixture.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { loopOn } from "../../test/fixtures.ts";
import { withStatus } from "../../test/refusal.ts";
import { found } from "../../test/view-shapes.ts";
import type { SessionBinding } from "../../sessions/session-bindings.ts";
import type { Task } from "../../../types.ts";

// What runner.take answers for a take, and for a release.
interface Taken {
  binding: SessionBinding;
  report: string;
  worktree: { path: string };
}
type Released = { released: string; discarded: boolean };

// The tick starts and lands work only with the server loop on.
loopOn();

const cli = fileURLToPath(new URL("../../../../cli.ts", import.meta.url));
const config = temporaryDirectory("avoozl-take-config-");
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const leaf = (id: string) => ({
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
const as = (slot: string) => ({ caller: { sessionKey: "dashboard:" + slot } });
const local: OperationContext = { local: true };

// A workspace on the tick: two lanes, a real checkout, tasks a, b, c, where c
// requires a.
function setup(t: TestContext) {
  const root = temporaryDirectory("avoozl-take-"),
    checkout = gitCheckout(path.join(root, "app"));
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery: { retries: 1, reviewers: [] } }),
  );
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  store.initialize({
    ...snapshot(),
    tasks: [leaf("a"), leaf("b"), leaf("c")],
    edges: [{ from: "a", to: "c", kind: "requires" }],
  });
  store.put("repositories", {
    id: "app",
    root: checkout,
    baseBranch: "main",
    checks: [["git", "status"]],
  });
  const ops = new Operations(store, { workspaceRoot: root }),
    take = <T = Taken>(
      input: Record<string, unknown>,
      context: OperationContext = local,
    ) => ops.execute<T>("runner.take", input, undefined, context),
    tick = (slots: string[] = []) =>
      ops.execute<{ dispatch: { task: string }[] }>("workspace.tick", {
        sessions: slots.map((target) => ({ target, status: "working" })),
      });
  return { root, store, ops, take, tick };
}

function run(root: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const clean: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_CONFIG_HOME: config,
    ...env,
  };
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
  const started: string[] = [];
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
    if (store.read().tasks.find((x: Task) => x.id === "a")?.integration?.commit)
      break;
  }
  assert.ok(
    store.read().tasks.find((x: Task) => x.id === "a")?.integration?.commit,
    "the checks ran and the work landed",
  );
});

test("a take is refused with its reason for a task that is not ready, running, or held", async (t) => {
  const { store, ops, take } = setup(t);
  await assert.rejects(
    take({ taskId: "c" }),
    withStatus(409, /not ready to start: it is blocked/),
  );
  await assert.rejects(take({ taskId: "zzz" }), withStatus(404));
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
    withStatus(409, /not ready to start: it has a session running/),
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
    withStatus(409, /Stop the line holds it/),
  );
});

test("a take over MCP and from a supervisor child both run", async (t) => {
  const { root, take } = setup(t);
  const mine = await take<{ worktree: { path: string } }>(
    { taskId: "a" },
    as("chat"),
  );
  assert.ok(fs.existsSync(mine.worktree.path));
  const child = run(root, ["take", "b"], { AVOOZL_CHILD: "1" });
  assert.equal(child.status, 0, child.stderr);
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
    clean = await take<Released>({ taskId: "b", release: true });
  assert.equal(clean.released, "b");
  assert.equal(clean.discarded, false);
  assert.equal(store.get("session_bindings", second.binding.slot), null);
});
