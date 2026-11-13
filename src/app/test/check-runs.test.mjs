// Checks in code (design §5.2 Checks): a command-only bar is checked by
// Avoozl itself in a clean detached worktree, not by a verifier chat. One
// test per rule; each lists the nearby inputs it checks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import {
  checkRuns,
  drainCheckRuns,
  needsJudgment,
  outputTail,
} from "../check-runs.mjs";
import { listSpans } from "../flow.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

const node = process.execPath;
const leaf = (id, extra = {}) => ({
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
  ...extra,
});

function setup(t, { tasks = [leaf("a")], checks = [["git", "status"]] } = {}) {
  const root = temporaryDirectory("avoozl-checkrun-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks, edges: [] });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    checks,
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery: { concurrency: 4, retries: 1 } }),
  );
  return {
    root,
    checkout: fs.realpathSync.native(checkout),
    store,
    ops: new Operations(store, { workspaceRoot: root }),
  };
}

const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });

async function workerDone(ops, taskId, slot, attempt = 1) {
  await ops.execute("session.bind", {
    taskId,
    slot,
    role: "worker",
    attempt,
    source: "tick",
    title: `avoozl:${taskId} worker`,
  });
  const { path: worktree } = await ops.execute("worktree.prepare", { taskId });
  fs.writeFileSync(path.join(worktree, `${taskId}-${attempt}.txt`), "work\n");
  git(worktree, "add", ".");
  git(worktree, "commit", "-m", `Work ${taskId} ${attempt}`);
  const commit = git(worktree, "rev-parse", "HEAD");
  await ops.execute(
    "session.report",
    { taskId, kind: "done", commit },
    undefined,
    as(slot),
  );
  return commit;
}

// The script cron's tick: a roster (even empty) marks it.
const tick = (ops, slots = []) =>
  ops.execute("workspace.tick", {
    sessions: slots.map((target) => ({ target, status: "idle" })),
  });

const worktrees = (checkout) =>
  git(checkout, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((line) => line.startsWith("worktree "));

test("a command-only bar opens no verifier chat: Avoozl runs the checks at the exact commit", async (t) => {
  // Nearby inputs: a second tick while the run is queued (no second run), a
  // page tick (queues nothing), the worktree left behind (none), flow
  // timing (one `checks` span), and `verify: "agent"` or a prose-only bar
  // (those still open a verifier chat).
  const { store, ops, checkout } = setup(t, {
    checks: [[node, "-e", "console.log('ok from checks')"]],
  });
  const commit = await workerDone(ops, "a", "w-1");
  await ops.execute("workspace.tick", {});
  assert.equal(checkRuns(store).length, 0, "a page tick queues nothing");
  const first = await tick(ops, ["w-1"]);
  assert.deepEqual(
    first.dispatch.filter((d) => d.role === "verifier"),
    [],
    "no verifier chat for a command-only bar",
  );
  const [queued] = checkRuns(store);
  assert.deepEqual(
    [queued.state, queued.commit, queued.attempt],
    ["queued", commit, 1],
  );
  await tick(ops, ["w-1"]);
  assert.equal(checkRuns(store).length, 1, "one run per commit");
  const before = worktrees(checkout).length;
  await drainCheckRuns(store);
  const [run] = checkRuns(store);
  assert.equal(run.state, "finished");
  assert.equal(run.head, commit);
  assert.equal(run.checks[0].exitCode, 0);
  assert.match(run.checks[0].tail, /ok from checks/);
  assert.equal(worktrees(checkout).length, before, "the worktree is removed");
  await tick(ops, ["w-1"]);
  const delivery = store.get("task_deliveries", "a");
  assert.equal(delivery.state, "integrated");
  const entry = delivery.verifications.at(-1);
  assert.deepEqual(
    [entry.role, entry.by, entry.outcome, entry.commit],
    [undefined, "avoozl", "accepted", commit],
    "the receipt keeps the checks role",
  );
  assert.ok(
    listSpans(store).some((s) => s.taskId === "a" && s.stage === "checks"),
    "flow timing records check time as checks",
  );
  assert.equal(
    store.list("session_bindings").filter((b) => b.role === "verifier").length,
    0,
  );

  // Judgment bars keep their verifier chat.
  assert.equal(needsJudgment(leaf("x", { checks: ["npm test"] }), {}), false);
  assert.equal(
    needsJudgment(leaf("x", { checks: ["npm test"], verify: "agent" }), {}),
    true,
  );
  assert.equal(needsJudgment(leaf("x"), { checks: [] }), true);
  const judged = setup(t, { tasks: [leaf("j", { verify: "agent" })] });
  await workerDone(judged.ops, "j", "w-j");
  const opened = await tick(judged.ops, ["w-j"]);
  assert.deepEqual(
    opened.dispatch.filter((d) => d.role === "verifier").map((d) => d.task),
    ["j"],
  );
  assert.match(opened.dispatch.at(-1).brief, /verdict/);
  assert.equal(checkRuns(judged.store).length, 0);
});

test("a failing check fails the writer's attempt, with a short redacted tail", async (t) => {
  // Nearby inputs: a secret and a home path in the output (redacted), more
  // than 20 lines (only the last kept), and an exit code other than 1.
  // It fails only where the task's file is, so not on the base (R44.2).
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\\n");
  const script = `if (!require("fs").existsSync("a-1.txt")) process.exit(0); console.log("${lines}"); console.log("token ghp_${"a".repeat(36)}"); console.log("at /home/someone/x.js"); process.exit(3)`;
  const { store, ops } = setup(t, { checks: [[node, "-e", script]] });
  await workerDone(ops, "a", "w-1");
  await tick(ops, ["w-1"]);
  await drainCheckRuns(store);
  const retried = await tick(ops, ["w-1"]);
  const delivery = store.get("task_deliveries", "a");
  assert.equal(delivery.state, "failed");
  assert.match(
    delivery.attempts[0].cause,
    /checks failed: check `.+` exited 3/,
  );
  const tail = delivery.verifications.at(-1).checks[0].tail;
  assert.equal(tail.split("\n").length, 20);
  assert.doesNotMatch(tail, /line 0\b/);
  assert.doesNotMatch(tail, /ghp_/);
  assert.match(tail, /\[redacted\]/);
  assert.doesNotMatch(tail, /\/home\/someone/);
  assert.deepEqual(
    retried.dispatch.map((d) => [d.role, d.attempt]),
    [["worker", 2]],
  );
  assert.equal(outputTail("a\n\n b \n"), "a\n b ");
});

test("a check that times out or cannot start is the checking's failure, not the writer's", async (t) => {
  // Nearby inputs: a timeout, a missing command (could not start), the retry
  // within the bound (a new run), and past it (a decision).
  const { store, ops } = setup(t, {
    checks: [
      [node, "-e", "setTimeout(() => {}, 20000)"],
      ["avoozl-no-such-command"],
    ],
  });
  await workerDone(ops, "a", "w-1");
  await tick(ops, ["w-1"]);
  await drainCheckRuns(store, { timeoutMs: 300 });
  const [run] = checkRuns(store);
  assert.equal(run.checks[0].exitCode, null);
  assert.match(run.checks[0].notRun, /timed out/);
  assert.equal(run.checks[1].exitCode, null);
  assert.ok(run.checks[1].notRun);
  await tick(ops, ["w-1"]);
  let delivery = store.get("task_deliveries", "a");
  assert.equal(delivery.state, "done", "the writer's attempt stands");
  assert.equal(delivery.attempts[0].outcome, "done");
  assert.match(
    delivery.verifications.at(-1).cause,
    /checks not run: .+timed out/,
  );
  assert.deepEqual(
    checkRuns(store)
      .map((r) => [r.attempt, r.state])
      .sort(),
    [
      [1, "finished"],
      [2, "queued"],
    ],
    "retried as a new run",
  );
  await drainCheckRuns(store, { timeoutMs: 300 });
  await tick(ops, ["w-1"]);
  delivery = store.get("task_deliveries", "a");
  assert.equal(delivery.state, "decision", "past the retry bound");
  assert.equal(checkRuns(store).length, 2);
});

test("a run at the wrong commit runs nothing, and a stale run judges nothing", async (t) => {
  // Nearby inputs: a commit missing from the checkout, a delivery whose
  // commit moved while its run was queued, and Stop all agents (no run).
  const { store, ops } = setup(t);
  const commit = await workerDone(ops, "a", "w-1");
  await ops.execute("workspace.tick", {});
  const missing = "0".repeat(40);
  store.put("task_deliveries", {
    ...store.get("task_deliveries", "a"),
    commit: missing,
  });
  await tick(ops, ["w-1"]);
  await drainCheckRuns(store);
  const [run] = checkRuns(store);
  assert.equal(run.commit, missing);
  assert.ok(run.checks.every((c) => c.exitCode === null && c.notRun));
  assert.match(run.checks[0].notRun, /no worktree at 000000000000/);
  await tick(ops, ["w-1"]);
  assert.equal(store.get("task_deliveries", "a").attempts[0].outcome, "done");
  assert.match(
    store.get("task_deliveries", "a").verifications.at(-1).cause,
    /checks not run/,
  );

  // The queued run is for the old commit; the delivery moved on.
  const [second] = checkRuns(store).filter((r) => r.state === "queued");
  store.put("task_deliveries", {
    ...store.get("task_deliveries", "a"),
    commit,
  });
  await drainCheckRuns(store);
  await tick(ops, ["w-1"]);
  const delivery = store.get("task_deliveries", "a");
  const stale = delivery.verifications.find(
    (v) => v.attempt === second.attempt,
  );
  assert.equal(stale.commit, missing, "history on the old commit");
  assert.equal(delivery.state, "done", "nothing judged on the new commit");
  assert.ok(
    checkRuns(store).some((r) => r.commit === commit && r.state === "queued"),
    "the current commit gets its own run",
  );

  // Stop all agents: nothing starts until Resume.
  store.put("flow_stops", {
    id: "stop:full",
    manual: true,
    full: true,
    scope: "all",
    openedAt: new Date().toISOString(),
    closedAt: null,
  });
  await drainCheckRuns(store);
  assert.ok(
    checkRuns(store).some((r) => r.commit === commit && r.state === "queued"),
    "a full stop starts no run",
  );
});
