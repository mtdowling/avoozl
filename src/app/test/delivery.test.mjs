import { nativeDispatch } from "./executor-fixture.mjs";
import { kirocrewConfiguration } from "../executors/kirocrew.mjs";
// Tasks 2.6, 2.7 and 2.11: worktrees, reports, readiness dispatch, and
// failure handling. One test per rule; each lists the nearby inputs it checks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { handleMcp } from "../mcp.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function dump(store) {
  return Object.fromEntries(
    store.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map(({ name }) => [
        name,
        store.db.prepare(`SELECT * FROM "${name}"`).all(),
      ]),
  );
}

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
  ...extra,
});

// A workspace with a real Git checkout `app` and the given tasks and edges.
function setup(t, { tasks = [leaf("a")], edges = [], delivery } = {}) {
  const root = temporaryDirectory("avoozl-delivery-"),
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
  store.importSnapshot({ ...snapshot(), tasks, edges });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  if (delivery !== undefined)
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, delivery }),
    );
  return {
    root,
    checkout: fs.realpathSync.native(checkout),
    store,
    ops: new Operations(store, { workspaceRoot: root }),
  };
}

const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });

async function bindTick(ops, task, slot, attempt = 1) {
  await ops.execute("session.bind", {
    taskId: task,
    slot,
    attempt,
    source: "tick",
    title: `avoozl:${task} Task ${task}`,
  });
}

// Back-date a binding so it reads as quiet; only the test changes the clock.
function age(store, slot, minutes) {
  const binding = store.get("session_bindings", slot),
    at = new Date(Date.now() - minutes * 60_000).toISOString();
  store.put("session_bindings", { ...binding, boundAt: at, statusAt: at });
}

test("plans_prepare_worktree gives a leaf one worktree on avoozl/<task-id>, again on retry", async (t) => {
  // Nearby inputs: retry with the worktree present (no write), retry after the
  // worktree was removed (same branch, commits kept), an unknown task, an epic,
  // a leaf with no checkout, a foreign directory at the path, and the branch
  // checked out somewhere else.
  const { store, ops, checkout, root } = setup(t, {
    tasks: [
      leaf("a"),
      leaf("b"),
      leaf("loose", { repository: "missing" }),
      leaf("epic", { kind: "package" }),
    ],
  });
  const first = await ops.execute("worktree.prepare", { taskId: "a" });
  assert.equal(first.branch, "avoozl/a");
  assert.equal(first.created, true);
  assert.equal(path.basename(first.path), "avoozl-a");
  assert.ok(!first.path.startsWith(checkout + path.sep));
  assert.equal(git(first.path, "branch", "--show-current"), "avoozl/a");

  const before = dump(store),
    again = await ops.execute("worktree.prepare", { taskId: "a" });
  assert.deepEqual(
    [again.path, again.created, again.changed],
    [first.path, false, false],
  );
  assert.deepEqual(dump(store), before, "a retry writes nothing");

  fs.writeFileSync(path.join(first.path, "work.txt"), "kept\n");
  git(first.path, "add", ".");
  git(first.path, "commit", "-m", "Work");
  const head = git(first.path, "rev-parse", "HEAD");
  git(checkout, "worktree", "remove", "--force", first.path);
  const readded = await ops.execute("worktree.prepare", { taskId: "a" });
  assert.equal(readded.path, first.path);
  assert.equal(readded.head, head, "the branch keeps its commits");

  for (const [taskId, status] of [
    ["missing", 404],
    ["epic", 409],
    ["loose", 409],
  ])
    await assert.rejects(
      ops.execute("worktree.prepare", { taskId }),
      (error) => error.status === status,
      taskId,
    );
  fs.mkdirSync(path.join(root, ".avoozl-worktrees", "avoozl-b"));
  await assert.rejects(
    ops.execute("worktree.prepare", { taskId: "b" }),
    (error) =>
      error.status === 409 && /not this task's worktree/.test(error.message),
  );
  fs.rmSync(path.join(root, ".avoozl-worktrees", "avoozl-b"), {
    recursive: true,
  });
  git(
    checkout,
    "worktree",
    "add",
    "-b",
    "avoozl/b",
    path.join(root, "elsewhere"),
  );
  await assert.rejects(
    ops.execute("worktree.prepare", { taskId: "b" }),
    (error) => error.status === 409 && /checked out at/.test(error.message),
  );
});

test("only the session bound to a task's newest attempt may report on it", async (t) => {
  // Nearby inputs: no caller, a caller that is not a dashboard session, an
  // unbound slot, a slot bound to another task, a replaced attempt, done
  // without a SHA or with an unknown one, blocked and question without text,
  // a commit on progress, a repeated report, and a report after done.
  const { store, ops, checkout } = setup(t, {
    tasks: [leaf("a"), leaf("b")],
  });
  await bindTick(ops, "a", "slot-1");
  await bindTick(ops, "b", "slot-b");
  const progress = { taskId: "a", kind: "progress", text: "Halfway." };
  for (const context of [
    {},
    { caller: null },
    { caller: { sessionKey: "cron:job" } },
    as("stranger"),
    as("slot-b"),
  ])
    await assert.rejects(
      ops.execute("session.report", progress, undefined, context),
      (error) => error.status === 403,
      JSON.stringify(context),
    );
  for (const input of [
    { taskId: "a", kind: "done" },
    { taskId: "a", kind: "done", commit: "abc" },
    { taskId: "a", kind: "blocked" },
    { taskId: "a", kind: "question", text: "  " },
    { taskId: "a", kind: "progress", commit: "a".repeat(40) },
    { taskId: "a", kind: "finished" },
    { taskId: "a", kind: "progress", text: "x".repeat(4001) },
  ])
    await assert.rejects(
      ops.execute("session.report", input, undefined, as("slot-1")),
      (error) => error.status === 400,
      JSON.stringify(input),
    );
  await assert.rejects(
    ops.execute(
      "session.report",
      { taskId: "a", kind: "done", commit: "f".repeat(40) },
      undefined,
      as("slot-1"),
    ),
    (error) => error.status === 409,
    "a commit the repository does not have",
  );

  const recorded = await ops.execute(
    "session.report",
    progress,
    undefined,
    as("slot-1"),
  );
  assert.equal(recorded.changed, true);
  const before = dump(store);
  assert.equal(
    (await ops.execute("session.report", progress, undefined, as("slot-1")))
      .changed,
    false,
  );
  assert.deepEqual(dump(store), before, "a repeated report writes nothing");

  const commit = git(checkout, "rev-parse", "HEAD");
  const done = await ops.execute(
    "session.report",
    { taskId: "a", kind: "done", commit },
    undefined,
    as("slot-1"),
  );
  assert.equal(done.report.commit, commit);
  await assert.rejects(
    ops.execute("session.report", progress, undefined, as("slot-1")),
    (error) => error.status === 409,
    "done ends the attempt",
  );

  await bindTick(ops, "b", "slot-b2", 2);
  await assert.rejects(
    ops.execute(
      "session.report",
      { taskId: "b", kind: "progress", text: "Old." },
      undefined,
      as("slot-b"),
    ),
    (error) => error.status === 409,
    "a replaced attempt",
  );
});

test("the caller identity is read only on the app's stdio MCP transport", async (t) => {
  // Nearby inputs: the same forged block over a transport that is not the
  // app's stdio server, a wrong schema version, and an over-long key.
  const { ops } = setup(t);
  await bindTick(ops, "a", "slot-1");
  const call = (meta) => ({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "plans_report",
      arguments: { input: { taskId: "a", kind: "progress", text: "Hi." } },
      _meta: { "kirocrew.caller": meta },
    },
  });
  const good = { schemaVersion: 1, sessionKey: "dashboard:slot-1" };
  const forged = await handleMcp(call(good), ops);
  assert.equal(forged.body.result.isError, true);
  assert.match(forged.body.result.content[0].text, /identity/);
  for (const meta of [
    { ...good, schemaVersion: 2 },
    { ...good, sessionKey: "dashboard:" + "x".repeat(600) },
  ])
    assert.equal(
      (await handleMcp(call(meta), ops, { attestedCaller: true })).body.result
        .isError,
      true,
    );
  const attested = await handleMcp(call(good), ops, { attestedCaller: true });
  assert.notEqual(attested.body.result.isError, true);
  assert.equal(attested.body.result.structuredContent.changed, true);
});

test("the tick dispatches ready local leaves by rank, then graph order, within limits", async (t) => {
  // Nearby inputs: no delivery policy, a blocked
  // dependent, an unregistered repository, an ignored repository limit of 0,
  // the old delivery.concurrency and the machine's lanes. Planning writes
  // nothing.
  const tasks = [
    leaf("late", { rank: 5 }),
    leaf("deep"),
    leaf("prior", { status: "accepted" }),
    leaf("shallow"),
    leaf("after-shallow"),
    leaf("elsewhere", { repository: "other" }),
    leaf("urgent", { rank: 1 }),
  ];
  const edges = [
    { from: "prior", to: "deep", kind: "requires" },
    { from: "shallow", to: "after-shallow", kind: "requires" },
  ];
  const off = setup(t, { tasks, edges });
  assert.deepEqual(
    (await off.ops.execute("workspace.tick", { sessions: [] })).dispatch,
    [],
    "no delivery policy, no readiness dispatch",
  );

  const { root, store, ops } = setup(t, {
    tasks,
    edges,
    delivery: { concurrency: 4 },
  });
  const before = dump(store),
    planned = await ops.execute("workspace.tick", { sessions: [] });
  assert.deepEqual(dump(store), before, "planning a dispatch writes nothing");
  assert.deepEqual(
    planned.dispatch.map((d) => d.task),
    ["urgent", "late", "shallow", "deep"],
    "rank first, unset ranks last, then graph depth, then plan order",
  );
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery: { concurrency: 2 } }),
  );
  assert.deepEqual(
    (await ops.execute("workspace.tick", { sessions: [] })).dispatch.map(
      (d) => d.task,
    ),
    ["urgent", "late"],
    "the old delivery.concurrency counts as lanes",
  );
  const [intent] = planned.dispatch;
  assert.deepEqual(
    { ...nativeDispatch(store, intent), brief: undefined },
    {
      task: "urgent",
      // Investigate first is on by default for a leaf not marked small.
      investigate: true,
      role: "worker",
      attempt: 1,
      title: "avoozl:urgent Task urgent",
      folder: "Avoozl/app",
      project: false,
      agent: "kirocrew-worker",
      checkout: store.get("projects", "app").root,
      brief: undefined,
    },
  );
  assert.match(intent.brief, /worktree prepare urgent/);
  assert.match(intent.brief, /runner report urgent findings --file/);

  // A per-repository concurrency is old input: accepted and ignored (R6.3).
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      delivery: { concurrency: 4, repositories: { app: { concurrency: 0 } } },
    }),
  );
  assert.deepEqual(
    (await ops.execute("workspace.tick", { sessions: [] })).dispatch.map(
      (d) => d.task,
    ),
    ["urgent", "late", "shallow", "deep"],
    "a repository concurrency limits nothing",
  );
  // The machine file's lanes win over the old delivery.concurrency.
  const xdg = temporaryDirectory("avoozl-lanes-"),
    saved = process.env.XDG_CONFIG_HOME;
  t.after(() => {
    if (saved === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = saved;
  });
  process.env.XDG_CONFIG_HOME = xdg;
  fs.mkdirSync(path.join(xdg, "avoozl"));
  fs.writeFileSync(
    path.join(xdg, "avoozl", "config.json"),
    JSON.stringify({ version: 1, lanes: { local: 1 } }),
  );
  assert.deepEqual(
    (await ops.execute("workspace.tick", { sessions: [] })).dispatch.map(
      (d) => d.task,
    ),
    ["urgent"],
    "this machine's lanes",
  );
  fs.rmSync(path.join(xdg, "avoozl", "config.json"));

  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery: { concurrency: 1 } }),
  );
  await ops.execute("workspace.tick", { sessions: [] });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery: { concurrency: 2, extra: true } }),
  );
  const invalid = await ops.execute("workspace.tick", { sessions: [] });
  assert.equal(invalid.policy.status, "invalid");
  assert.match(invalid.policy.error, /delivery\.extra/);
  assert.deepEqual(
    invalid.dispatch.map((d) => d.task),
    ["urgent"],
    "the last valid policy (one lane) still applies",
  );
});

test("a task with a live bound session is never dispatched twice", async (t) => {
  // Nearby inputs: a tick-opened session working, idle, and queued; a session
  // a conductor bound whose status Avoozl never reads; and a done report while
  // the session stays open.
  const { store, ops, checkout } = setup(t, {
    tasks: [leaf("a"), leaf("b"), leaf("c")],
    delivery: { concurrency: 3 },
  });
  await bindTick(ops, "a", "slot-a");
  await ops.execute("session.bind", { taskId: "b", slot: "conductor-b" });
  for (const status of ["working", "idle", "queued"]) {
    const result = await ops.execute("workspace.tick", {
      sessions: [{ target: "slot-a", status }],
    });
    assert.deepEqual(
      result.dispatch.map((d) => d.task),
      ["c"],
      status,
    );
  }
  await ops.execute(
    "session.report",
    { taskId: "a", kind: "done", commit: git(checkout, "rev-parse", "HEAD") },
    undefined,
    as("slot-a"),
  );
  const after = await ops.execute("workspace.tick", {
    sessions: [{ target: "slot-a", status: "idle" }],
  });
  assert.deepEqual(
    after.dispatch.filter((d) => d.role === "worker").map((d) => d.task),
    ["c"],
  );
  assert.equal(store.get("task_deliveries", "a").state, "done");
});

test("a local worker opens with project false, whatever its chat folder", async (t) => {
  // Nearby inputs: folders not read (old cron), the folder not made yet, the
  // folder without and with a project directory (R88.2: the brief names the
  // worktree, so no folder project is needed and no notice is raised).
  const { store, ops } = setup(t, {
    tasks: [leaf("a")],
    delivery: { concurrency: 1 },
  });
  const tick = (folders) =>
    ops.execute("workspace.tick", {
      sessions: [],
      ...(folders ? { folders } : {}),
    });
  for (const folders of [
    undefined,
    {},
    { Avoozl: false, "Avoozl/app": false },
    { "Avoozl/app": true },
  ]) {
    const result = await tick(folders),
      label = JSON.stringify(folders ?? null);
    assert.equal(result.dispatch[0]?.task, "a", label);
    assert.deepEqual(
      kirocrewConfiguration(store, result.dispatch[0]),
      { folder: "Avoozl/app", project: false, agent: "kirocrew-worker" },
      label,
    );
    assert.ok(
      !result.notify.some((n) => /project directory/.test(n.title ?? "")),
      label,
    );
  }
});

test("a failed attempt retries on the same worktree, up to the bound, then opens a decision", async (t) => {
  // Nearby inputs: a blocked report, a session closed without a report, a
  // lost session, retries 0 (straight to a decision), and the decision
  // notified once.
  const { store, ops } = setup(t, {
    tasks: [leaf("a")],
    delivery: { retries: 2 },
  });
  const worktree = await ops.execute("worktree.prepare", { taskId: "a" });
  await bindTick(ops, "a", "slot-1");
  await ops.execute(
    "session.report",
    { taskId: "a", kind: "blocked", text: "Tests need a fixture." },
    undefined,
    as("slot-1"),
  );
  const retry = await ops.execute("workspace.tick", {
    sessions: [{ target: "slot-1", status: "idle" }],
  });
  assert.equal(store.get("task_deliveries", "a").state, "failed");
  assert.deepEqual(
    retry.dispatch.map((d) => [d.task, d.attempt]),
    [["a", 2]],
  );
  assert.ok(retry.dispatch[0].brief.includes(worktree.path));
  assert.match(retry.dispatch[0].brief, /attempt 2/);
  assert.match(retry.dispatch[0].brief, /```text\nTests need a fixture\.\n```/);
  // Kiro Crew returns the existing session for a name it already has, so a
  // retry must not reuse attempt 1's title.
  assert.equal(retry.dispatch[0].title, "avoozl:a attempt 2 Task a");

  await bindTick(ops, "a", "slot-2", 2);
  const closed = await ops.execute("workspace.tick", {
    sessions: [
      { target: "slot-1", status: "idle" },
      { target: "slot-2", status: "closed" },
    ],
  });
  assert.deepEqual(
    closed.dispatch.map((d) => d.attempt),
    [3],
  );
  assert.match(
    closed.dispatch[0].brief,
    /session closed without a done report/,
  );

  await bindTick(ops, "a", "slot-3", 3);
  const sessions = [
    { target: "slot-1", status: "idle" },
    { target: "slot-2", status: "closed" },
    { target: "slot-3", status: "lost" },
  ];
  const past = await ops.execute("workspace.tick", { sessions });
  // A third attempt starts a retrospective (R47.1), not another worker.
  assert.deepEqual(
    past.dispatch.map((d) => d.role),
    ["retro"],
  );
  assert.equal(store.get("task_deliveries", "a").state, "decision");
  assert.equal(past.notify.length, 1);
  assert.equal(past.notify[0].channel, "failure");
  const quiet = dump(store),
    again = await ops.execute("workspace.tick", { sessions });
  assert.deepEqual([again.dispatch, again.notify], [[], []]);
  assert.deepEqual(dump(store), quiet, "a decision is raised once");

  const none = setup(t, { tasks: [leaf("a")], delivery: { retries: 0 } });
  await bindTick(none.ops, "a", "slot-1");
  const stop = await none.ops.execute("workspace.tick", {
    sessions: [{ target: "slot-1", status: "closed" }],
  });
  assert.deepEqual(stop.dispatch, []);
  assert.equal(none.store.get("task_deliveries", "a").state, "decision");
});

test("a recorded failure stays failed when its closed session reads live again", async (t) => {
  // Nearby inputs: the reopened session idle past quietMinutes (no nudge), and
  // a later working status (still failed, attempt kept once).
  const { store, ops } = setup(t, {
    tasks: [leaf("a")],
    delivery: { quietMinutes: 1 },
  });
  await bindTick(ops, "a", "slot-1");
  await ops.execute("workspace.tick", {
    sessions: [{ target: "slot-1", status: "closed" }],
  });
  const failed = store.get("task_deliveries", "a");
  assert.equal(failed.state, "failed");
  age(store, "slot-1", 30);
  const reopened = await ops.execute("workspace.tick", {
    sessions: [{ target: "slot-1", status: "idle" }],
  });
  assert.deepEqual(reopened.messages, [], "a recorded attempt is not nudged");
  await ops.execute("workspace.tick", {
    sessions: [{ target: "slot-1", status: "working" }],
  });
  const after = store.get("task_deliveries", "a");
  assert.equal(after.state, "failed");
  assert.deepEqual(after.attempts, failed.attempts);
});

test("a quiet notice names a report refused for want of a caller identity", async (t) => {
  const { store, ops } = setup(t, {
    tasks: [leaf("a")],
    delivery: { quietMinutes: 10, nudges: 0, concurrency: 1 },
  });
  await bindTick(ops, "a", "slot-1");
  const idle = [{ target: "slot-1", status: "idle" }];
  await ops.execute("workspace.tick", { sessions: idle });
  age(store, "slot-1", 600);
  // No caller: the report is refused, as when Kiro Crew does not share the server.
  await assert.rejects(
    ops.execute("session.report", {
      taskId: "a",
      kind: "done",
      commit: "0".repeat(40),
    }),
    /caller|identity/,
  );
  const { notify } = await ops.execute("workspace.tick", { sessions: idle });
  assert.equal(notify.length, 1);
  assert.match(notify[0].text, /no caller identity came from Kiro Crew/);
});

test("a quiet notice without a refused report names no identity cause", async (t) => {
  const { store, ops } = setup(t, {
    tasks: [leaf("a")],
    delivery: { quietMinutes: 10, nudges: 0, concurrency: 1 },
  });
  await bindTick(ops, "a", "slot-1");
  const idle = [{ target: "slot-1", status: "idle" }];
  await ops.execute("workspace.tick", { sessions: idle });
  age(store, "slot-1", 600);
  const { notify } = await ops.execute("workspace.tick", { sessions: idle });
  assert.equal(notify.length, 1);
  assert.doesNotMatch(notify[0].text, /caller identity/);
});

test("a quiet session is nudged, never replaced, and a person decides past the nudge bound", async (t) => {
  // Nearby inputs: idle for less than quietMinutes, working for hours, a
  // session waiting on its question, and ticks without a roster (the page).
  const { store, ops } = setup(t, {
    tasks: [leaf("a"), leaf("q")],
    delivery: { quietMinutes: 10, nudges: 2, concurrency: 1 },
  });
  await bindTick(ops, "a", "slot-1");
  const idle = [{ target: "slot-1", status: "idle" }];
  await ops.execute("workspace.tick", { sessions: idle });
  age(store, "slot-1", 5);
  assert.deepEqual(
    (await ops.execute("workspace.tick", { sessions: idle })).messages,
    [],
    "not quiet yet",
  );
  age(store, "slot-1", 600);
  assert.deepEqual(
    (await ops.execute("workspace.tick", {})).messages,
    [],
    "a tick without the roster sends nothing",
  );
  const first = await ops.execute("workspace.tick", { sessions: idle });
  assert.equal(first.messages.length, 1);
  assert.equal(first.messages[0].slot, "slot-1");
  assert.deepEqual(first.dispatch, [], "quiet is never a reason to replace");
  assert.deepEqual(
    (await ops.execute("workspace.tick", { sessions: idle })).messages,
    [],
    "one nudge per quiet interval",
  );
  const delivery = store.get("task_deliveries", "a");
  store.put("task_deliveries", {
    ...delivery,
    nudge: {
      ...delivery.nudge,
      at: new Date(Date.now() - 3600_000).toISOString(),
    },
  });
  assert.equal(
    (await ops.execute("workspace.tick", { sessions: idle })).messages.length,
    1,
  );
  const nudged = store.get("task_deliveries", "a");
  store.put("task_deliveries", {
    ...nudged,
    nudge: {
      ...nudged.nudge,
      at: new Date(Date.now() - 3600_000).toISOString(),
    },
  });
  const bound = await ops.execute("workspace.tick", { sessions: idle });
  assert.deepEqual(bound.messages, []);
  assert.deepEqual(bound.dispatch, []);
  assert.equal(bound.notify.length, 1);
  assert.match(bound.notify[0].text, /will not replace/);

  const working = [{ target: "slot-1", status: "working" }];
  await ops.execute("workspace.tick", { sessions: working });
  age(store, "slot-1", 6000);
  const busy = await ops.execute("workspace.tick", { sessions: working });
  assert.deepEqual([busy.messages, busy.dispatch], [[], []]);

  const asking = setup(t, {
    tasks: [leaf("q")],
    delivery: { quietMinutes: 1 },
  });
  await bindTick(asking.ops, "q", "slot-q");
  await asking.ops.execute(
    "session.report",
    { taskId: "q", kind: "question", text: "Which format?" },
    undefined,
    as("slot-q"),
  );
  age(asking.store, "slot-q", 60);
  const question = await asking.ops.execute("workspace.tick", {
    sessions: [{ target: "slot-q", status: "idle" }],
  });
  assert.deepEqual(question.messages, [], "a question is not nudged");
  assert.equal(question.notify.length, 1);
  assert.match(question.notify[0].text, /Which format\?/);
});

test("a worker waiting on the decision on its findings is not quiet until the decision is sent", async (t) => {
  // Found by the wp-p1 live run: the nudge and Go ahead went out in one
  // tick, and the nudge named plans_report to a worker that reports by CLI.
  // Nearby inputs: no decision yet, a decision sent minutes ago, one sent
  // long ago.
  const { store, ops } = setup(t, {
    delivery: { quietMinutes: 10, nudges: 2, concurrency: 1 },
  });
  await bindTick(ops, "a", "slot-1");
  const idle = [{ target: "slot-1", status: "idle" }],
    ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString(),
    binding = store.get("session_bindings", "slot-1");
  store.put("session_bindings", {
    ...binding,
    status: "idle",
    boundAt: ago(600),
    statusAt: ago(600),
    report: { kind: "findings", at: ago(600) },
  });
  const row = {
    id: "a",
    taskId: "a",
    attempt: 1,
    slot: "slot-1",
    state: "needs-you",
    rounds: [],
    openedAt: ago(600),
    updatedAt: ago(600),
  };
  store.put("task_investigations", row);
  const nudges = async () =>
    (await ops.execute("workspace.tick", { sessions: idle })).messages.filter(
      (m) => m.slot === "slot-1",
    );
  assert.deepEqual(await nudges(), [], "findings wait on Avoozl");
  const go = (minutes) =>
    store.put("task_investigations", {
      ...row,
      state: "go",
      message: {
        action: "go",
        text: "Go ahead",
        at: ago(minutes),
        sentAt: ago(minutes),
      },
    });
  go(5);
  assert.deepEqual(await nudges(), [], "quiet counts from the Go ahead");
  go(600);
  const [nudge, ...rest] = await nudges();
  assert.deepEqual(rest, []);
  assert.match(nudge.text, /the way your brief says/);
  assert.doesNotMatch(nudge.text, /plans_report/);
});

test("after a restart, every session the cron opened is observed before any new dispatch", async (t) => {
  // Nearby inputs: no roster at all, a roster missing one live slot, a roster
  // missing only a finished slot, and an explicit session request.
  const { store, ops } = setup(t, {
    tasks: [leaf("a"), leaf("b"), leaf("c")],
    delivery: { concurrency: 3 },
  });
  await bindTick(ops, "a", "slot-a");
  await bindTick(ops, "b", "slot-b");
  await ops.execute("session.request", {
    taskId: "c",
    repository: "app",
    agent: "kirocrew-worker",
  });
  const blind = await ops.execute("workspace.tick", {});
  assert.deepEqual(blind.dispatch, []);
  assert.deepEqual(blind.held, {
    reason: "unobserved",
    slots: ["slot-a", "slot-b"],
  });
  const partial = await ops.execute("workspace.tick", {
    sessions: [{ target: "slot-a", status: "working" }],
  });
  assert.deepEqual(partial.dispatch, []);
  assert.deepEqual(partial.held.slots, ["slot-b"]);
  assert.equal(store.get("session_bindings", "slot-a").status, "working");

  const seen = await ops.execute("workspace.tick", {
    sessions: [
      { target: "slot-a", status: "working" },
      { target: "slot-b", status: "closed" },
    ],
  });
  assert.equal(seen.held, undefined);
  assert.deepEqual(
    seen.dispatch.map((d) => [d.task, d.attempt ?? 1]),
    [
      ["c", 1],
      ["b", 2],
    ],
  );
  const finished = await ops.execute("workspace.tick", {
    sessions: [{ target: "slot-a", status: "working" }],
  });
  assert.equal(finished.held, undefined, "a closed slot need not be listed");
});
