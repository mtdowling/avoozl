// Verify (design §4.26, R86.6, R86.7): declared and protected paths, warm
// checks in the task worktree, and a timeout per check. Every name here is
// made up.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { checkRuns, drainCheckRuns, queueCheckRun } from "../check-runs.mjs";
import { flowPolicy } from "../flow.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import {
  allowProtectedPaths,
  checkTimeout,
  firstErrorLine,
  matchesPath,
  pathOutcome,
  pathVerdict,
  runEach,
} from "../verify.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const node = process.execPath;

test("paths match by file, folder and glob", () => {
  for (const [pattern, file, hit] of [
    ["src/app/x.mjs", "src/app/x.mjs", true],
    ["src/app", "src/app/x.mjs", true],
    ["src/app/", "src/app/deep/x.mjs", true],
    ["src/ap", "src/app/x.mjs", false],
    ["src/*.mjs", "src/x.mjs", true],
    ["src/*.mjs", "src/a/x.mjs", false],
    ["src/**/x.mjs", "src/x.mjs", true],
    ["src/**/x.mjs", "src/a/b/x.mjs", true],
    [".github/workflows/**", ".github/workflows/ci.yml", true],
    [".github/workflows/**", ".github/CODEOWNERS", false],
    ["scripts/worktree", "scripts/worktree", true],
    ["scripts/worktree", "scripts/worktree-notes.md", false],
    ["a?.txt", "ab.txt", true],
    ["a.txt", "aXtxt", false],
  ])
    assert.equal(matchesPath(pattern, file), hit, `${pattern} ~ ${file}`);
});

test("a diff outside declared paths is refused; a protected path is held", () => {
  const changed = ["src/a.mjs", "docs/x.md", ".github/workflows/ci.yml"];
  assert.deepEqual(pathVerdict(changed, { declared: ["src/**"] }), {
    changed: 3,
    outside: ["docs/x.md", ".github/workflows/ci.yml"],
    protected: [".github/workflows/ci.yml"],
  });
  // No declared paths: no outside rule, protected paths still apply.
  assert.deepEqual(
    pathVerdict(changed, { protectedPaths: ["docs/"] }).protected,
    ["docs/x.md", ".github/workflows/ci.yml"],
  );
  assert.deepEqual(pathVerdict(["src/a.mjs"], { declared: ["src"] }), {
    changed: 1,
    outside: [],
    protected: [],
  });
  assert.match(
    pathOutcome({ paths: { outside: ["docs/x.md"], protected: ["x"] } }).cause,
    /^outside declared paths: docs\/x\.md$/,
  );
  assert.equal(
    pathOutcome({ paths: { outside: [], protected: ["x"] } }).outcome,
    "protected",
  );
  assert.equal(pathOutcome({ paths: { outside: [], protected: [] } }), null);
  assert.equal(pathOutcome({}), null);
});

test("each check has its own timeout, and a timeout names it", async () => {
  const flow = flowPolicy({
    flow: { verify: { checkTimeoutSeconds: 30, checkTimeouts: { slow: 1 } } },
  }).workspace;
  assert.equal(checkTimeout("slow", flow), 1000);
  assert.equal(checkTimeout("other", flow), 30_000);
  assert.equal(checkTimeout("other", flow, 500), 500);
  assert.equal(checkTimeout("other", flowPolicy({}).workspace), 1_200_000);
  assert.throws(
    () => flowPolicy({ flow: { verify: { checkTimeouts: { x: 0 } } } }),
    /verify\.checkTimeouts must be/,
  );
  const checks = await runEach(
    process.cwd(),
    [
      [node, "-e", "setTimeout(() => {}, 20000)"],
      [node, "-e", "process.exit(0)"],
    ],
    { timeoutFor: (command) => (command.includes("20000") ? 1000 : 30_000) },
  );
  assert.equal(checks[0].exitCode, null);
  assert.equal(checks[0].notRun, "timed out after 1 s");
  assert.equal(checks[1].exitCode, 0, "the next check still runs");
});

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function setup(t, { paths, checks, flow } = {}) {
  const root = temporaryDirectory("avoozl-verify-paths-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, ".gitignore"), "build/\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({
    ...snapshot(),
    tasks: [
      {
        id: "a",
        title: "Task a",
        kind: "leaf",
        scope: "catalog",
        status: "planned",
        epic: "sample",
        track: "catalog",
        tags: [],
        acceptance: ["Works."],
        repository: "app",
        ...(paths ? { paths } : {}),
      },
    ],
    edges: [],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    checks: checks || [[node, "-e", "process.exit(0)"]],
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      lanes: { local: 2 },
      delivery: { retries: 1 },
      ...(flow ? { flow } : {}),
    }),
  );
  return { store, ops: new Operations(store, { workspaceRoot: root }) };
}

// A worker's commit in the task worktree, then one queued run for it.
async function committed(store, ops, files) {
  const { path: worktree } = await ops.execute("worktree.prepare", {
    taskId: "a",
  });
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(worktree, file)), { recursive: true });
    fs.writeFileSync(path.join(worktree, file), "work\n");
  }
  git(worktree, "add", ".");
  git(worktree, "commit", "-qm", "Work a");
  const commit = git(worktree, "rev-parse", "HEAD"),
    task = store.read().tasks.find((x) => x.id === "a");
  queueCheckRun(store, {
    task,
    repository: store.get("repositories", "app"),
    commit,
    attempt: checkRuns(store).length + 1,
  });
  return { worktree, commit };
}

test("checks run warm in the task worktree, which keeps its build output", async (t) => {
  // Nearby inputs: a declared path that covers the change (no refusal), a
  // check writing ignored build output (kept after the run), and a per-check
  // timeout from .avoozl.json (timed out with its reason).
  const build =
    "require('fs').mkdirSync('build',{recursive:true});require('fs').writeFileSync('build/out.txt','x')";
  const { store, ops } = setup(t, {
    paths: ["src/**"],
    checks: [
      [node, "-e", build],
      [node, "-e", "setTimeout(() => {}, 20000)"],
    ],
    flow: {
      verify: {
        checkTimeouts: { [`${node} -e setTimeout(() => {}, 20000)`]: 1 },
      },
    },
  });
  const { worktree, commit } = await committed(store, ops, ["src/a.mjs"]);
  await drainCheckRuns(store);
  const [run] = checkRuns(store);
  assert.equal(run.warm, true);
  assert.equal(run.head, commit);
  assert.deepEqual([run.paths.changed, run.paths.outside], [1, []]);
  assert.equal(run.checks[0].exitCode, 0);
  assert.ok(fs.existsSync(path.join(worktree, "build", "out.txt")), "warm");
  assert.equal(run.checks[1].notRun, "timed out after 1 s");
});

test("a file outside declared paths runs no check; a protected path waits for a person", async (t) => {
  // Nearby inputs: an undeclared file (no checks run), a workflow file
  // (protected), a session or an early allowance (refused), and the person's
  // allowance for that exact commit (the next run passes the paths).
  const outside = setup(t, { paths: ["src/**"] });
  await committed(outside.store, outside.ops, ["src/a.mjs", "notes.txt"]);
  await drainCheckRuns(outside.store);
  const [refused] = checkRuns(outside.store);
  assert.deepEqual(refused.paths.outside, ["notes.txt"]);
  assert.deepEqual(refused.checks, []);
  assert.equal(pathOutcome(refused).outcome, "rejected");

  const { store, ops } = setup(t);
  const { commit } = await committed(store, ops, [".github/workflows/ci.yml"]);
  await drainCheckRuns(store);
  const [held] = checkRuns(store);
  assert.deepEqual(held.paths.protected, [".github/workflows/ci.yml"]);
  assert.equal(pathOutcome(held).outcome, "protected");
  store.put("task_deliveries", {
    id: "a",
    taskId: "a",
    state: "done",
    commit,
    attempts: [],
    verifications: [],
  });
  const allow = (input, who) =>
    allowProtectedPaths(
      store,
      { taskId: "a", reason: "CI change", ...input },
      who,
    );
  assert.throws(
    () => allow({}),
    (e) => e.status === 409,
    "not held yet",
  );
  store.put("task_deliveries", {
    ...store.get("task_deliveries", "a"),
    state: "decision",
    cause: pathOutcome(held).cause,
    verifications: [{ attempt: 1, by: "avoozl", commit, ...pathOutcome(held) }],
  });
  assert.throws(
    () => allow({}, { caller: { sessionKey: "dashboard:w-1" } }),
    (e) => e.status === 403,
  );
  assert.throws(
    () => allow({}, { mcp: true }),
    (e) => e.status === 403,
  );
  assert.throws(
    () => allow({ reason: "" }),
    (e) => e.status === 400,
  );
  allow({}, { local: true });
  const delivery = store.get("task_deliveries", "a");
  assert.deepEqual([delivery.state, delivery.cause], ["done", undefined]);
  queueCheckRun(store, {
    task: store.read().tasks[0],
    repository: store.get("repositories", "app"),
    commit,
    attempt: 2,
  });
  await drainCheckRuns(store);
  const again = checkRuns(store).find((r) => r.attempt === 2);
  assert.deepEqual(again.paths.protected, []);
  assert.deepEqual(again.paths.allowed, [".github/workflows/ci.yml"]);
  assert.equal(again.checks[0].exitCode, 0);
});

// A worker's done through the tick, the run, and the next tick's judgment.
async function judgedAfter(store, ops, files) {
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "w-1",
    role: "worker",
    attempt: 1,
    source: "tick",
    title: "avoozl:a worker",
  });
  const { path: worktree } = await ops.execute("worktree.prepare", {
    taskId: "a",
  });
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(worktree, file)), { recursive: true });
    fs.writeFileSync(path.join(worktree, file), "work\n");
  }
  git(worktree, "add", ".");
  git(worktree, "commit", "-qm", "Work a");
  await ops.execute(
    "session.report",
    { taskId: "a", kind: "done" },
    undefined,
    {
      caller: { sessionKey: "dashboard:w-1" },
    },
  );
  const tick = () =>
    ops.execute("workspace.tick", {
      sessions: [{ target: "w-1", status: "idle" }],
    });
  await tick();
  await drainCheckRuns(store);
  const result = await tick();
  return { result, delivery: store.get("task_deliveries", "a") };
}

test("the tick fails an attempt outside declared paths and holds a protected path for a person", async (t) => {
  // Nearby inputs: an undeclared file (the writer's attempt fails and
  // retries) and a workflow file (a decision, no attempt spent, one notice).
  const outside = setup(t, { paths: ["src/**"] });
  const failed = await judgedAfter(outside.store, outside.ops, ["notes.txt"]);
  assert.equal(failed.delivery.state, "failed");
  assert.match(
    failed.delivery.attempts[0].cause,
    /^outside declared paths: notes\.txt$/,
  );

  const { store, ops } = setup(t);
  const held = await judgedAfter(store, ops, [".github/workflows/ci.yml"]);
  assert.equal(held.delivery.state, "decision");
  assert.match(held.delivery.cause, /touches protected paths/);
  assert.equal(held.delivery.attempts[0].outcome, "done", "no attempt spent");
  assert.equal(held.delivery.verifications.at(-1).outcome, "protected");
  // Through the operation: a session is refused, the command line is not.
  await assert.rejects(
    ops.execute(
      "verify.allow",
      { taskId: "a", reason: "CI change" },
      undefined,
      { caller: { sessionKey: "dashboard:w-1" } },
    ),
    (e) => e.status === 403,
  );
  await ops.execute(
    "verify.allow",
    { taskId: "a", reason: "CI change" },
    undefined,
    { local: true },
  );
  assert.equal(store.get("task_deliveries", "a").state, "done");
});

test("a failed check's first error line: the first naming an error, else the first, redacted and cut", () => {
  assert.equal(
    firstErrorLine("Running 12 tests\n\nnot ok 3 - Error: got 2", "1 error"),
    "not ok 3 - Error: got 2",
  );
  assert.equal(firstErrorLine("only line", null), "only line");
  assert.equal(firstErrorLine(null, "", undefined), null);
  assert.doesNotMatch(
    firstErrorLine("Error at /Users/someone/app/x.js:3"),
    /someone/,
  );
  assert.equal(firstErrorLine("Error " + "x".repeat(400)).length, 200);
});
