// Checks in code (design §5.2 Checks): a command-only bar is checked by
// Avoozl itself in a clean detached worktree. One
// test per rule; each lists the nearby inputs it checks.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  checkRuns,
  drainCheckRuns,
  outputTail,
  runChecksAt,
  taskEnv,
} from "../check-runs.ts";
import { startCheckRunners } from "../check-runner.ts";
import { listSpans } from "../../flow/flow.ts";
import {
  deliveryWorkspace,
  git,
  leaf,
  workerDone,
} from "../../test/delivery-fixture.ts";
import { loopOn } from "../../test/fixtures.ts";
import { found, storedRow, type TickResult } from "../../test/view-shapes.ts";
import type { Operations } from "../../api/operations.ts";
import type { Store } from "../../store/store.ts";
import type { Task } from "../../../types.ts";

// A task's delivery record, for the fields these tests read.
interface Delivery {
  id: string;
  state: string;
  commit?: string;
  attempts: { outcome: string; cause?: string }[];
  verifications: {
    role?: string;
    by?: string;
    outcome?: string;
    commit?: string;
    cause?: string;
    attempt?: number;
    checks: { tail: string }[];
  }[];
  [key: string]: unknown;
}
const delivered = (store: Store) =>
  storedRow<Delivery>(store, "task_deliveries", "a");

// The tick starts and lands work only with the server loop on.
loopOn();

const node = process.execPath;

const setup = (
  t: TestContext,
  {
    tasks = [leaf("a")],
    checks = [["git", "status"]],
  }: { tasks?: Task[]; checks?: string[][] } = {},
) =>
  deliveryWorkspace(t, {
    prefix: "avoozl-checkrun-",
    tasks,
    repository: { checks },
  });

// The script cron's tick: a roster (even empty) marks it.
const tick = (ops: Operations, slots: string[] = []) =>
  ops.execute<TickResult>("workspace.tick", {
    sessions: slots.map((target) => ({ target, status: "idle" })),
  });

const worktrees = (checkout: string) =>
  git(checkout, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((line) => line.startsWith("worktree "));

test("a command-only bar opens no verifier chat: Avoozl runs the checks at the exact commit", async (t) => {
  // Nearby inputs: a second tick while the run is queued (no second run), a
  // page tick (queues nothing), the worktree left behind (none), flow
  // timing (one `checks` span), and a repository with no checks (that
  // is judged by its reviewers only).
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
  const [run] = checkRuns(store),
    ranChecks = found(run.checks);
  assert.equal(run.state, "finished");
  assert.equal(run.head, commit);
  assert.equal(ranChecks[0].exitCode, 0);
  assert.match(ranChecks[0].tail ?? "", /ok from checks/);
  assert.equal(worktrees(checkout).length, before, "the worktree is removed");
  await tick(ops, ["w-1"]);
  const delivery = delivered(store);
  assert.equal(delivery.state, "integrated");
  const entry = found(delivery.verifications.at(-1));
  assert.deepEqual(
    [entry.role, entry.by, entry.outcome, entry.commit],
    [undefined, "avoozl", "accepted", commit],
    "the receipt keeps the checks role",
  );
  assert.ok(
    listSpans(store).some((s) => s.taskId === "a" && s.stage === "checks"),
    "flow timing records check time as checks",
  );
});

test("the detached runner finishes checks after the tick path returns", async (t) => {
  const { root, store, ops } = setup(t, {
    checks: [
      [
        node,
        "-e",
        "setTimeout(() => { console.log('detached check done') }, 500)",
      ],
    ],
  });
  await workerDone(ops, "a", "w-1");
  await tick(ops, ["w-1"]);
  const dbPath = path.join(root, "workspace.sqlite"),
    startedAt = Date.now(),
    runners = startCheckRunners(store, { dbPath });
  assert.equal(runners.length, 1);
  assert.ok(Date.now() - startedAt < 1000, "the caller does not await checks");

  const deadline = Date.now() + 15_000;
  while (
    checkRuns(store).some((run) => run.state !== "finished") &&
    Date.now() < deadline
  )
    await new Promise((resolve) => setTimeout(resolve, 50));

  const [run] = checkRuns(store),
    ranChecks = found(run.checks);
  assert.equal(run.state, "finished");
  assert.match(ranChecks[0].tail ?? "", /detached check done/);
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
  const delivery = delivered(store);
  assert.equal(delivery.state, "failed");
  assert.match(
    delivery.attempts[0].cause ?? "",
    /checks failed: check `.+` exited 3/,
  );
  const tail = found(delivery.verifications.at(-1)).checks[0].tail;
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
  const [run] = checkRuns(store),
    ranChecks = found(run.checks);
  assert.equal(ranChecks[0].exitCode, null);
  assert.match(ranChecks[0].notRun ?? "", /timed out/);
  assert.equal(ranChecks[1].exitCode, null);
  assert.ok(ranChecks[1].notRun);
  await tick(ops, ["w-1"]);
  let delivery = delivered(store);
  assert.equal(delivery.state, "done", "the writer's attempt stands");
  assert.equal(delivery.attempts[0].outcome, "done");
  assert.match(
    found(delivery.verifications.at(-1)).cause ?? "",
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
  delivery = delivered(store);
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
    ...delivered(store),
    commit: missing,
  });
  await tick(ops, ["w-1"]);
  await drainCheckRuns(store);
  const [run] = checkRuns(store),
    ranChecks = found(run.checks);
  assert.equal(run.commit, missing);
  assert.ok(ranChecks.every((c) => c.exitCode === null && c.notRun));
  assert.match(ranChecks[0].notRun ?? "", /no worktree at 000000000000/);
  await tick(ops, ["w-1"]);
  assert.equal(delivered(store).attempts[0].outcome, "done");
  assert.match(
    found(delivered(store).verifications.at(-1)).cause ?? "",
    /checks not run/,
  );

  // The queued run is for the old commit; the delivery moved on.
  const [second] = checkRuns(store).filter((r) => r.state === "queued");
  store.put("task_deliveries", {
    ...delivered(store),
    commit,
  });
  await drainCheckRuns(store);
  await tick(ops, ["w-1"]);
  const delivery = delivered(store);
  const stale = found(
    delivery.verifications.find((v) => v.attempt === second.attempt),
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

// A check that prints the task names it was given, as JSON.
const printTaskEnv = [
  node,
  "-e",
  "const e = process.env; console.log('ENV ' + JSON.stringify({ task: e.AVOOZL_TASK, spec: e.AVOOZL_SPEC, start: e.AVOOZL_START }))",
];
const printedEnv = (tail: string | undefined) =>
  JSON.parse(/ENV (\{.*\})/.exec(tail ?? "")?.[1] ?? "null");

// Set one variable in Avoozl's own environment for a test.
function inherit(t: TestContext, name: string, value: string) {
  const before = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  });
}

test("a task's check run is told its task and start commit, over a stray inherited value", async (t) => {
  // Nearby inputs: stray AVOOZL_TASK and AVOOZL_START in Avoozl's own
  // environment, listed in checksEnv (overridden), and a task with no plan
  // and no claim (no AVOOZL_SPEC; the start is the merge base).
  inherit(t, "AVOOZL_TASK", "stray");
  inherit(t, "AVOOZL_START", "stray");
  const { store, ops, checkout } = setup(t, { checks: [printTaskEnv] });
  store.put("repositories", {
    ...storedRow(store, "repositories", "app"),
    checksEnv: ["AVOOZL_TASK", "AVOOZL_START"],
  });
  const commit = await workerDone(ops, "a", "w-1");
  await tick(ops, ["w-1"]);
  await drainCheckRuns(store);
  const [run] = checkRuns(store);
  assert.deepEqual(printedEnv(found(run.checks)[0].tail), {
    task: "a",
    start: git(checkout, "merge-base", "main", commit).trim(),
  });
});

test("a run with no task gets none of the task names, even listed and inherited", async (t) => {
  inherit(t, "AVOOZL_TASK", "stray");
  inherit(t, "AVOOZL_SPEC", "stray");
  const { checkout } = setup(t),
    head = git(checkout, "rev-parse", "HEAD").trim(),
    { checks } = await runChecksAt(
      {
        id: "app",
        root: checkout,
        checksEnv: ["AVOOZL_TASK", "AVOOZL_SPEC"],
      },
      head,
      [printTaskEnv],
    );
  assert.deepEqual(printedEnv(found(checks[0]).tail), {});
});

test("taskEnv names the lease's start commit and the spec's path", () => {
  // Nearby inputs: a single-file spec, a split spec folder, a claim with
  // no lease yet (the base), and no GitHub name (the base).
  const plans: Record<string, unknown> = {
      flat: { spec: "flat", specFolder: "specs/", flat: true },
      split: { spec: "split", specFolder: ".kiro/specs/split/" },
    },
    claims = {
      "acme/app": [
        { task: "flat.1", lease: { start: "lease-start" } },
        { task: "split.1", lease: null },
      ],
    },
    store = {
      get: (_table: string, id: string) => plans[id],
      getMeta: () => claims,
    } as unknown as Parameters<typeof taskEnv>[0];
  assert.deepEqual(
    taskEnv(
      store,
      { id: "flat.1", planId: "flat" },
      { github: "acme/app" },
      "base",
    ),
    {
      AVOOZL_TASK: "flat.1",
      AVOOZL_SPEC: "specs/flat.md",
      AVOOZL_START: "lease-start",
    },
  );
  assert.deepEqual(
    taskEnv(
      store,
      { id: "split.1", planId: "split" },
      { github: "acme/app" },
      "base",
    ),
    {
      AVOOZL_TASK: "split.1",
      AVOOZL_SPEC: ".kiro/specs/split",
      AVOOZL_START: "base",
    },
  );
  assert.deepEqual(taskEnv(store, { id: "x" }, { github: null }, null), {
    AVOOZL_TASK: "x",
  });
});
