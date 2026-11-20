// Tasks 12.1–12.3 and 12.5: flow timing from events, phase markers and tool
// rows, the flow settings, and the metrics computed on read (design §4.11).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  commandName,
  flowPolicy,
  ingestToolRows,
  listSpans,
  toolStage,
} from "../flow.mjs";
import { Operations } from "../../api/operations.mjs";
import { Store } from "../../store/store.mjs";
import { seedSpan, snapshot } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

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
  checks: ["npm test"],
  repository: "app",
  ...extra,
});

function setup(t, { tasks = [leaf("a")], edges = [] } = {}) {
  const root = temporaryDirectory("avoozl-flow-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const dbPath = path.join(root, "workspace.sqlite"),
    store = new Store(dbPath);
  t.after(() => store.close());
  store.initialize({ ...snapshot(), tasks, edges });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    checks: [["git", "status"]],
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      lanes: { local: 4 },
      delivery: { retries: 1 },
    }),
  );
  return {
    root,
    dbPath,
    store,
    ops: new Operations(store, { workspaceRoot: root }),
  };
}

const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });
const report = (ops, slot, input) =>
  ops.execute("session.report", input, undefined, as(slot));

test("flow settings: defaults, per-repository overrides, and refused keys", () => {
  const policy = flowPolicy({
    flow: { verify: { checkTimeoutSeconds: 60 } },
    repositories: {
      app: { root: ".", flow: { stopTheLine: { scope: "repo" } } },
    },
  });
  assert.equal(policy.workspace.verify.checkTimeoutSeconds, 60);
  assert.deepEqual(
    policy.workspace.verify.protectedPaths,
    [],
    "a missing key is its default",
  );
  // Batching has no setting (R108.8), and retros run as a skill.
  assert.throws(
    () => flowPolicy({ flow: { batch: { by: "epic", max: 0 } } }),
    /flow\.batch is not a flow setting/,
  );
  assert.throws(
    () => flowPolicy({ flow: { retro: { everyTasks: 5 } } }),
    /flow\.retro is not a flow setting/,
  );
  assert.equal(policy.workspace.stopTheLine.scope, "dependents");
  assert.equal(policy.for("app").stopTheLine.scope, "repo");
  assert.equal(
    policy.for("app").verify.checkTimeoutSeconds,
    60,
    "the workspace value carries over",
  );
  assert.equal(policy.for("other").verify.checkTimeoutSeconds, 60);
  // Nearby inputs: an unknown key, a bad value, timing (there is no setting).
  assert.throws(
    () => flowPolicy({ flow: { timing: false } }),
    /flow\.timing is not a flow setting/,
  );
  assert.throws(
    () => flowPolicy({ flow: { verify: { checkTimeoutSeconds: 0 } } }),
    /flow\.verify\.checkTimeoutSeconds must be a whole number 1–86400/,
  );
  assert.throws(
    () => flowPolicy({ flow: { stopTheLine: { scope: "off" } } }),
    /dependents, repo, all/,
  );
});

test("tool rows: a declared check is tests, other shell calls are commands, the rest coding", () => {
  const checks = ["node test/check.mjs"];
  assert.deepEqual(
    toolStage(
      { meta: { kind: "execute", input: { command: "node test/check.mjs" } } },
      checks,
    ),
    {
      stage: "tests",
      detail: "node test/check.mjs",
    },
  );
  assert.deepEqual(
    toolStage(
      {
        meta: {
          kind: "execute",
          input: { command: "npm install --silent left-pad" },
        },
      },
      checks,
    ),
    {
      stage: "commands",
      detail: "npm install",
    },
  );
  assert.equal(
    toolStage({ meta: { kind: "edit", input: { path: "a.js" } } }, checks)
      .stage,
    "coding",
  );
  assert.equal(commandName("FOO=1 git commit -m 'secret words'"), "git commit");
  assert.equal(commandName("ls -la"), "ls");
});

test("a worker attempt's spans come from events and markers and survive a restart", async (t) => {
  const { dbPath, store, ops } = setup(t, { tasks: [leaf("a"), leaf("b")] });
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-11-12T10:00:00Z"),
  });
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "w1",
    role: "worker",
    attempt: 1,
    source: "tick",
  });
  t.mock.timers.tick(5 * 60_000);
  await report(ops, "w1", {
    taskId: "a",
    kind: "progress",
    phase: "tests",
    text: "running checks",
  });
  t.mock.timers.tick(2 * 60_000);
  await report(ops, "w1", {
    taskId: "a",
    kind: "question",
    text: "Which file?",
  });
  t.mock.timers.tick(10 * 60_000);
  // A restart while waiting: the open span stays open.
  const reopened = new Store(dbPath);
  t.after(() => reopened.close());
  const again = new Operations(reopened, {
    workspaceRoot: path.dirname(dbPath),
  });
  assert.ok(
    listSpans(reopened, { taskId: "a" }).some(
      (s) => s.stage === "waiting" && !s.endedAt,
    ),
  );
  t.mock.timers.tick(60_000);
  await report(again, "w1", {
    taskId: "a",
    kind: "progress",
    phase: "coding",
    text: "answered",
  });
  const spans = listSpans(reopened, { taskId: "a" }).map((s) => [
    s.stage,
    s.source,
    s.startedAt,
    s.endedAt,
  ]);
  assert.deepEqual(spans, [
    [
      "coding",
      "events",
      "2026-11-12T10:00:00.000Z",
      "2026-11-12T10:05:00.000Z",
    ],
    [
      "tests",
      "markers",
      "2026-11-12T10:05:00.000Z",
      "2026-11-12T10:07:00.000Z",
    ],
    // Closed at the event that ended it, not at the restart (10:17).
    [
      "waiting",
      "events",
      "2026-11-12T10:07:00.000Z",
      "2026-11-12T10:18:00.000Z",
    ],
    ["coding", "markers", "2026-11-12T10:18:00.000Z", null],
  ]);
  // Nearby inputs: a phase on a question, an unknown phase.
  await assert.rejects(
    report(again, "w1", {
      taskId: "a",
      kind: "question",
      phase: "tests",
      text: "x",
    }),
    /progress report may mark phase/,
  );
  await assert.rejects(
    report(again, "w1", { taskId: "a", kind: "progress", phase: "lunch" }),
    /progress report may mark phase/,
  );
  // Prompts and output never reach the table.
  const text = JSON.stringify(
    reopened.db.prepare("SELECT * FROM telemetry_spans").all(),
  );
  assert.doesNotMatch(text, /Which file|running checks|answered/);
  void store;
});

test("tool rows replace the coarse coding stretch and close at done", async (t) => {
  const { store, ops } = setup(t);
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-11-12T10:00:00Z"),
  });
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "w1",
    role: "worker",
    attempt: 1,
    source: "tick",
  });
  await ops.execute("workspace.tick", {
    sessions: [{ target: "w1", status: "working" }],
  });
  const binding = store.get("session_bindings", "w1"),
    row = (id, minute, kind, command) => ({
      role: "tool",
      ts: new Date(
        Date.parse("2026-11-12T10:00:00Z") + minute * 60_000,
      ).toISOString(),
      content: "OUTPUT SHOULD NOT BE KEPT",
      meta: {
        tool_call_id: id,
        kind,
        input: command ? { command } : { path: "x.js" },
      },
    });
  assert.equal(
    ingestToolRows(
      store,
      binding,
      [
        row("t1", 1, "edit"),
        row("t2", 4, "execute", "npm install"),
        row("t3", 6, "execute", "npm test"),
      ],
      {
        checks: ["npm test"],
      },
    ),
    3,
  );
  // The same rows read again add nothing.
  assert.equal(
    ingestToolRows(store, binding, [row("t3", 6, "execute", "npm test")], {
      checks: ["npm test"],
    }),
    0,
  );
  t.mock.timers.tick(9 * 60_000);
  const { path: worktree } = await ops.execute("worktree.prepare", {
    taskId: "a",
  });
  fs.writeFileSync(path.join(worktree, "a.txt"), "a\n");
  git(worktree, "add", ".");
  git(worktree, "commit", "-m", "a");
  await report(ops, "w1", {
    taskId: "a",
    kind: "done",
    commit: git(worktree, "rev-parse", "HEAD"),
  });
  const spans = listSpans(store, { taskId: "a" }).filter(
    (s) => s.role === "worker",
  );
  assert.deepEqual(
    spans.map((s) => [s.stage, s.source, s.detail, s.endedAt?.slice(11, 16)]),
    [
      ["coding", "tool-calls", null, "10:01"],
      ["coding", "tool-calls", null, "10:04"],
      ["commands", "tool-calls", "npm install", "10:06"],
      ["tests", "tool-calls", "npm test", "10:09"],
    ],
  );
  assert.doesNotMatch(
    JSON.stringify(store.db.prepare("SELECT * FROM telemetry_spans").all()),
    /OUTPUT/,
  );
  const view = await ops.execute("task.detail", { id: "a" });
  assert.equal(view.timing.coarse, false, "tool-call spans are exact");
  assert.equal(view.timing.stages.tests, 3 * 60_000);
});

test("flow.view computes lead time, flow efficiency and first-pass rate on read", async (t) => {
  const { store, ops } = setup(t, { tasks: [leaf("a"), leaf("b")] });
  const put = (id, task, stage, from, to, attempt = 1, role = "worker") =>
    seedSpan(store, id, task, attempt, role, stage, from, to, "events", null);
  // a: 10 min queued, 30 coding, 20 review, 10 merge = 70 min lead, 40 active.
  put(
    "1",
    "a",
    "queued",
    "2026-11-12T10:00:00Z",
    "2026-11-12T10:10:00Z",
    1,
    null,
  );
  put("2", "a", "coding", "2026-11-12T10:10:00Z", "2026-11-12T10:40:00Z");
  put(
    "3",
    "a",
    "review",
    "2026-11-12T10:40:00Z",
    "2026-11-12T11:00:00Z",
    1,
    "review:r",
  );
  put(
    "4",
    "a",
    "merge",
    "2026-11-12T11:00:00Z",
    "2026-11-12T11:10:00Z",
    null,
    null,
  );
  // b: 20 coding, 20 rework, finished at 50 min: 50 lead, 40 active.
  put("5", "b", "coding", "2026-11-12T10:00:00Z", "2026-11-12T10:20:00Z");
  put("6", "b", "rework", "2026-11-12T10:30:00Z", "2026-11-12T10:50:00Z", 2);
  store.mutate("finish", (data) => {
    data.tasks.find((x) => x.id === "a").integration = {
      at: "2026-11-12T11:10:00Z",
    };
    data.tasks.find((x) => x.id === "b").integration = {
      at: "2026-11-12T10:50:00Z",
    };
  });
  const view = await ops.execute("flow.view", {});
  assert.equal(view.metrics.tasks, 2);
  assert.equal(
    view.metrics.leadTimeMs,
    60 * 60_000,
    "median of 70 and 50 minutes",
  );
  assert.equal(view.metrics.flowEfficiency, 80 / 120);
  assert.equal(view.metrics.firstPassRate, 0.5, "b had a rework span");
  assert.equal(
    view.bottleneck.stage,
    "review",
    "a tie goes to the first waiting stage",
  );
  assert.equal(view.previous.tasks, 0);
  const narrow = await ops.execute("flow.view", { stage: "review" });
  assert.deepEqual(
    narrow.tasks.map((x) => x.taskId),
    ["a"],
  );
});
