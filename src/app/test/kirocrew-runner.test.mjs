// Tasks 2.14 and 2.12: Crew Mode runner support (claim-aware readiness, the
// structured session binding a conductor reports, `next` buckets, one writer)
// and decisions and failures on the app's notification channels with a link
// to the session. One test per rule; each lists the nearby inputs it checks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { workspaceConfig } from "../config.mjs";
import { handleMcp } from "../mcp.mjs";
import {
  gatewayPusher,
  notificationPayload,
  sessionUrl,
} from "../notifications.mjs";
import { Operations } from "../operations.mjs";
import { hookEvent, runnerHookBrief } from "../runner.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

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

const requires = (from, to) => ({
  id: `${from}-${to}`,
  from,
  to,
  kind: "requires",
});

function isolatedEnv(dir) {
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(dir, "config") };
  for (const name of Object.keys(env))
    if (
      /^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_|^NUPP_WORKSPACE$|^PORT$/.test(name)
    )
      delete env[name];
  return env;
}

// A workspace at the CLI's default database path with a real checkout `app`.
function setup(
  t,
  {
    tasks = [leaf("a")],
    edges = [],
    delivery = { runner: "crew-mode", concurrency: 4 },
  } = {},
) {
  const root = temporaryDirectory("avoozl-runner-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "Start");
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks, edges });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync(checkout),
    baseBranch: "main",
  });
  if (delivery)
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, delivery }),
    );
  return {
    root,
    checkout: fs.realpathSync(checkout),
    store,
    ops: new Operations(store, { workspaceRoot: root }),
  };
}

const local = { local: true };
const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });
const next = (ops) => ops.execute("runner.next", {});
const ids = (rows) => rows.map((row) => row.id);
const run = (root, ...args) =>
  JSON.parse(
    execFileSync(process.execPath, [cli, ...args, "--workspace", root], {
      encoding: "utf8",
      env: isolatedEnv(root),
    }),
  );
const tool = (name, input, sessionKey) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name,
    arguments: { input },
    ...(sessionKey
      ? { _meta: { "kirocrew.caller": { schemaVersion: 1, sessionKey } } }
      : {}),
  },
});

test("a claimed task never appears ready twice and cannot be claimed twice", async (t) => {
  // Nearby inputs: the same slot again (no-op), a second slot, plans_query
  // ready:true, the queue, a done report awaiting the tick, a blocked report
  // the tick has not recorded, the recorded failure (ready again as attempt
  // 2), runner "tick", no conductor identity, and a task that is not ready.
  const { store, ops } = setup(t, {
    tasks: [leaf("a"), leaf("b"), leaf("c")],
    edges: [requires("a", "c")],
  });
  assert.deepEqual(ids((await next(ops)).ready), ["a", "b"]);
  const claim = await ops.execute(
    "runner.claim",
    { taskId: "a", slot: "worker-1" },
    undefined,
    as("conductor"),
  );
  assert.equal(claim.changed, true);
  assert.deepEqual(
    [claim.binding.source, claim.binding.conductor, claim.binding.attempt],
    ["conductor", "conductor", 1],
  );
  assert.equal(claim.worktree.branch, "avoozl/a");
  assert.ok(fs.existsSync(claim.worktree.path));
  const again = await ops.execute(
    "runner.claim",
    { taskId: "a", slot: "worker-1" },
    undefined,
    as("conductor"),
  );
  assert.equal(again.changed, false);
  await assert.rejects(
    ops.execute(
      "runner.claim",
      { taskId: "a", slot: "worker-2" },
      undefined,
      as("conductor"),
    ),
    (error) => error.status === 409 && /not ready to start/.test(error.message),
  );
  const view = await next(ops);
  assert.deepEqual(ids(view.ready), ["b"]);
  assert.deepEqual(
    view.running.map((row) => [row.id, row.phase, row.slot]),
    [["a", "working", "worker-1"]],
  );
  const query = await ops.execute("query", { q: "ready:true" });
  assert.deepEqual(ids(query).sort(), ["b"]);
  const queue = await ops.execute("queue", {});
  assert.deepEqual(ids(queue.ready), ["b"]);

  // A blocked result the tick has not recorded still holds the claim.
  await ops.execute(
    "session.report",
    { taskId: "a", slot: "worker-1", kind: "blocked", text: "No fixture." },
    undefined,
    as("conductor"),
  );
  assert.deepEqual(
    (await next(ops)).running.map((row) => [row.id, row.phase]),
    [["a", "recording"]],
  );
  assert.ok(!ids((await next(ops)).ready).includes("a"));
  await ops.execute("workspace.tick", { sessions: [] });
  assert.equal(store.get("task_deliveries", "a").state, "failed");
  const retry = (await next(ops)).ready.find((row) => row.id === "a");
  assert.equal(retry.attempt, 2);
  assert.match(retry.brief, /attempt 2/);
  assert.match(retry.brief, /No fixture\./);

  for (const [input, context, status] of [
    [{ taskId: "c", slot: "w-c" }, as("conductor"), 409],
    [{ taskId: "b", slot: "w-b" }, {}, 403],
  ])
    await assert.rejects(
      ops.execute("runner.claim", input, undefined, context),
      (error) => error.status === status,
      JSON.stringify(input),
    );
  const tick = setup(t, { delivery: { runner: "tick" } });
  await assert.rejects(
    tick.ops.execute(
      "runner.claim",
      { taskId: "a", slot: "w" },
      undefined,
      local,
    ),
    (error) => error.status === 409 && /crew-mode/.test(error.message),
  );
});

test("the tick leaves ready leaves to a Crew Mode conductor and still verifies its work", async (t) => {
  // Nearby inputs: runner crew-mode with ready leaves (no worker dispatch), a
  // relayed done report (one verifier dispatch), and runner tick (dispatch).
  const { ops } = setup(t, { tasks: [leaf("a"), leaf("b")] });
  const quiet = await ops.execute("workspace.tick", { sessions: [] });
  assert.deepEqual(quiet.dispatch, []);
  const { worktree } = await ops.execute(
    "runner.claim",
    { taskId: "a", slot: "worker-1" },
    undefined,
    local,
  );
  fs.writeFileSync(path.join(worktree.path, "a.txt"), "a\n");
  git(worktree.path, "add", ".");
  git(worktree.path, "commit", "-m", "Do a");
  const commit = git(worktree.path, "rev-parse", "HEAD");
  await ops.execute(
    "session.report",
    { taskId: "a", slot: "worker-1", kind: "done", commit },
    undefined,
    local,
  );
  const verify = await ops.execute("workspace.tick", { sessions: [] });
  assert.deepEqual(
    verify.dispatch.map((d) => [d.task, d.role]),
    [["a", "verifier"]],
  );
  assert.equal(
    (await next(ops)).running.find((row) => row.id === "a").phase,
    "verifying",
  );
  const tick = setup(t, { delivery: { runner: "tick", concurrency: 4 } });
  const dispatched = await tick.ops.execute("workspace.tick", { sessions: [] });
  assert.deepEqual(
    dispatched.dispatch.map((d) => d.task),
    ["a"],
  );
});

test("only the claiming conductor, the worker, or the local command line may report", async (t) => {
  // Nearby inputs: the worker itself, its conductor naming the slot, another
  // session naming the slot, a relay for a plain plans_bind_session binding,
  // and the local CLI.
  const { ops } = setup(t, { tasks: [leaf("a"), leaf("b")] });
  await ops.execute(
    "runner.claim",
    { taskId: "a", slot: "worker-a" },
    undefined,
    as("conductor"),
  );
  await ops.execute("session.bind", { taskId: "b", slot: "worker-b" });
  const progress = (taskId, slot, text) => ({
    taskId,
    slot,
    kind: "progress",
    text,
  });
  for (const [input, context] of [
    [progress("a", "worker-a", "1"), as("stranger")],
    [progress("b", "worker-b", "2"), as("conductor")],
    [progress("b", "worker-b", "3"), local],
    [{ taskId: "a", kind: "progress", text: "4" }, local],
  ])
    await assert.rejects(
      ops.execute("session.report", input, undefined, context),
      (error) => error.status === 403,
      JSON.stringify([input, context]),
    );
  for (const [input, context] of [
    [{ taskId: "a", kind: "progress", text: "self" }, as("worker-a")],
    [progress("a", "worker-a", "relay"), as("conductor")],
    [progress("a", "worker-a", "cli"), local],
  ])
    assert.equal(
      (await ops.execute("session.report", input, undefined, context)).changed,
      true,
      JSON.stringify(input),
    );
});

// The §14 kill criterion for Crew Mode dispatch watches for conductors that
// skip reporting session bindings (task 8.3). A skipped claim is not silent:
// the unbound worker cannot record a result, and the task stays ready.
test("a worker whose conductor skipped the claim cannot report, and its task stays ready", async (t) => {
  const { ops } = setup(t, { tasks: [leaf("a")] });
  for (const [input, context] of [
    [{ taskId: "a" }, as("worker-a")],
    [{ taskId: "a", slot: "worker-a" }, as("conductor")],
  ])
    await assert.rejects(
      ops.execute(
        "session.report",
        { ...input, kind: "progress", text: "started" },
        undefined,
        context,
      ),
      (error) => error.status === 403,
    );
  assert.deepEqual(ids((await next(ops)).ready), ["a"]);
});

test("plans_next puts every local leaf in one bucket with what it waits on", async (t) => {
  // Nearby inputs: a dependent of an unfinished leaf, a blocked leaf, a leaf
  // in review, a worker's open question, an accepted leaf, an integrated leaf,
  // a deferred leaf, an epic (not a leaf), a GitHub-routed leaf, and capacity 1.
  const { store, ops } = setup(t, {
    tasks: [
      leaf("asks"),
      leaf("a"),
      leaf("b"),
      leaf("dep"),
      leaf("stuck", { status: "blocked" }),
      leaf("check", { status: "review" }),
      leaf("old", { status: "accepted" }),
      leaf("merged", { integration: { commit: "f".repeat(40) } }),
      leaf("later", { status: "deferred" }),
      leaf("epic", { kind: "epic" }),
      leaf("remote", { route: "github" }),
    ],
    edges: [requires("a", "dep"), requires("b", "dep")],
    delivery: { runner: "crew-mode", concurrency: 2 },
  });
  await ops.execute(
    "runner.claim",
    { taskId: "asks", slot: "w-asks" },
    undefined,
    local,
  );
  await ops.execute(
    "session.report",
    { taskId: "asks", kind: "question", text: "YAML or JSON?" },
    undefined,
    as("w-asks"),
  );
  const view = await next(ops);
  assert.match(view.rule, /wait while running is not empty/i);
  assert.equal(view.runner, "crew-mode");
  assert.deepEqual(ids(view.ready), ["a"], "capacity 2, one is held by asks");
  assert.deepEqual(ids(view.running), []);
  assert.deepEqual(view.needsYou.map((row) => [row.id, row.reason]).sort(), [
    ["asks", "question"],
    ["check", "review"],
    ["stuck", "blocked"],
  ]);
  const question = view.needsYou.find((row) => row.id === "asks");
  assert.equal(question.detail, "YAML or JSON?");
  assert.equal(question.link, "/chat?sid=w-asks");
  assert.deepEqual(ids(view.done).sort(), ["merged", "old"]);
  const waiting = Object.fromEntries(view.waiting.map((row) => [row.id, row]));
  assert.deepEqual(Object.keys(waiting).sort(), ["b", "dep", "later"]);
  assert.deepEqual(ids(waiting.dep.blockedBy), ["a", "b"]);
  assert.equal(waiting.b.reason, "capacity");
  assert.equal(waiting.later.reason, "deferred");
  assert.equal(view.finished, false);
  const brief = view.ready[0].brief;
  assert.match(brief, /^Avoozl task a: Task a/);
  assert.match(brief, /Acceptance: Works\./);
  assert.match(brief, /avoozl-a, on branch avoozl\/a/);
  assert.equal(view.ready[0].sessionTitle, "avoozl:a Task a");

  // Every leaf done: the conductor stops.
  store.mutate("finish", (data) => {
    for (const task of data.tasks) task.status = "accepted";
  });
  const finished = await next(ops);
  assert.equal(finished.finished, true);
  assert.deepEqual(
    [finished.ready, finished.running, finished.waiting, finished.needsYou],
    [[], [], [], []],
  );
});

test("every runner write goes through Operations.execute, whichever surface calls", async (t) => {
  // Nearby inputs: the CLI (another process, the local caller), the app's MCP
  // server (attested caller), an unattested MCP call, and a claim from one
  // surface refused on the other.
  const { root, store, ops } = setup(t, { tasks: [leaf("a"), leaf("b")] });
  const executed = [],
    execute = ops.execute.bind(ops);
  ops.execute = (...args) => {
    executed.push(args[0]);
    return execute(...args);
  };
  const viaCli = run(root, "claim", "a", "--slot", "worker-a");
  assert.equal(viaCli.binding.conductor, "cli");
  assert.deepEqual(ids(run(root, "next").ready), ["b"]);
  const denied = await handleMcp(
    tool("plans_claim_task", { taskId: "a", slot: "worker-x" }, "dashboard:c"),
    ops,
    { attestedCaller: true },
  );
  assert.equal(denied.body.result.isError, true);
  assert.match(denied.body.result.content[0].text, /not ready to start/);
  const unattested = await handleMcp(
    tool("plans_claim_task", { taskId: "b", slot: "worker-b" }, "dashboard:c"),
    ops,
  );
  assert.equal(unattested.body.result.isError, true);
  const claimed = await handleMcp(
    tool("plans_claim_task", { taskId: "b", slot: "worker-b" }, "dashboard:c"),
    ops,
    { attestedCaller: true },
  );
  assert.equal(claimed.body.result.structuredContent.binding.conductor, "c");
  const listed = await handleMcp(tool("plans_next", {}, "dashboard:c"), ops, {
    attestedCaller: true,
  });
  assert.deepEqual(ids(listed.body.result.structuredContent.running).sort(), [
    "a",
    "b",
  ]);
  assert.deepEqual(executed, [
    "runner.claim",
    "runner.claim",
    "runner.claim",
    "runner.next",
  ]);
  const bindings = store.list("session_bindings");
  assert.deepEqual(bindings.map((b) => [b.taskId, b.slot, b.source]).sort(), [
    ["a", "worker-a", "conductor"],
    ["b", "worker-b", "conductor"],
  ]);
});

test("decisions and failures queue once on the app's channels with a link to the session", async (t) => {
  // Nearby inputs: an unknown channel, a notice with no session (the Avoozl
  // page), a dashboard: prefix, a repeated tick, the page's tick without a
  // roster (queues nothing), a failed push (stays queued), and no notifier.
  assert.throws(() => notificationPayload({ channel: "chat", text: "x" }));
  assert.equal(sessionUrl("dashboard:chat 1"), "/chat?sid=chat%201");
  assert.equal(sessionUrl(null), "/apps/avoozl");
  const { store, ops } = setup(t, {
    delivery: { runner: "tick", retries: 0 },
  });
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "w-1",
    source: "tick",
  });
  const page = await ops.execute("workspace.tick", {});
  assert.equal(store.list("app_notifications").length, 0, String(page.notify));
  const stopped = await ops.execute("workspace.tick", {
    sessions: [{ target: "w-1", status: "closed" }],
  });
  assert.equal(stopped.notify.length, 1);
  assert.equal(stopped.notify[0].link, "/chat?sid=w-1");
  const rows = store.list("app_notifications");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].payload, {
    channel: "failure",
    title: "Avoozl stopped on a",
    body: "a failed 1 times. Last cause: session closed without a done report.\n\nOpen the last session to see why. Fix the cause, then ask Avoozl to retry a (plans_retry_delivery).",
    url: "/chat?sid=w-1",
    group_key: "avoozl:a",
  });
  await ops.execute("workspace.tick", {
    sessions: [{ target: "w-1", status: "closed" }],
  });
  assert.equal(store.list("app_notifications").length, 1, "queued once");

  assert.deepEqual(await ops.execute("notifications.deliver", {}), {
    sent: 0,
    queued: 1,
    dormant: true,
  });
  const pushed = [];
  let fail = true;
  const pushing = new Operations(store, {
    notifier: async (payload) => {
      if (fail) throw Error("gateway down");
      pushed.push(payload);
    },
  });
  const down = await pushing.execute("notifications.deliver", {});
  assert.deepEqual([down.sent, down.queued], [0, 1]);
  fail = false;
  const up = await pushing.execute("notifications.deliver", {});
  assert.deepEqual([up.sent, up.queued], [1, 0]);
  assert.deepEqual(pushed, [rows[0].payload]);
  assert.ok(store.list("app_notifications")[0].sentAt);

  // The person resumes the stopped leaf.
  const resumed = await ops.execute("delivery.retry", { taskId: "a" });
  assert.equal(resumed.delivery.state, "failed");
  await assert.rejects(
    ops.execute("delivery.retry", { taskId: "a" }),
    (error) => error.status === 409,
  );
  const redo = await ops.execute("workspace.tick", {
    sessions: [{ target: "w-1", status: "closed" }],
  });
  assert.deepEqual(
    redo.dispatch.map((d) => [d.task, d.attempt]),
    [["a", 2]],
  );
});

test("the backend pushes to the gateway only on a proven origin, with an app token", async () => {
  // Nearby inputs: no origin, a forged proof, a refused token exchange, an
  // expired token (exchanged once more), and a refused push.
  const origin = "http://127.0.0.1:5476",
    secret = "app-secret",
    proof = createHmac("sha256", secret).update(origin).digest("hex"),
    env = {
      KIROCREW_GATEWAY_ORIGIN: origin,
      KIROCREW_PROXY_SECRET: secret,
      KIROCREW_GATEWAY_ORIGIN_PROOF: proof,
      KIROCREW_APP_NAME: "avoozl",
    };
  assert.equal(gatewayPusher({ ...env, KIROCREW_GATEWAY_ORIGIN: "" }), null);
  assert.equal(
    gatewayPusher({ ...env, KIROCREW_GATEWAY_ORIGIN_PROOF: "0".repeat(64) }),
    null,
  );
  const calls = [];
  let pushes = [401, 200];
  const fetch = async (url, init) => {
    calls.push([url, init.headers]);
    if (url.endsWith("/token"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ token: "t" + calls.length }),
      };
    const status = pushes.shift();
    return { ok: status === 200, status, json: async () => ({}) };
  };
  const push = gatewayPusher(env, fetch),
    payload = {
      channel: "decision",
      title: "T",
      body: "B",
      url: "/chat?sid=s",
    };
  await push(payload);
  assert.deepEqual(
    calls.map(([url]) => url),
    [
      origin + "/api/apps/avoozl/token",
      origin + "/api/notifications/push?token=t1",
      origin + "/api/apps/avoozl/token",
      origin + "/api/notifications/push?token=t3",
    ],
  );
  assert.equal(calls[0][1]["X-App-Secret"], secret);
  pushes = [403];
  await assert.rejects(push(payload), /refused the notification \(403\)/);
});

test("the AgentSpawn hook briefs a Crew Mode conductor only in this workspace", async (t) => {
  // Nearby inputs: a directory outside the workspace, runner tick, no
  // policy, a hook event on stdin, no stdin, and the packaged hook file.
  const { root, checkout, store } = setup(t);
  const elsewhere = temporaryDirectory();
  const brief = (cwd, workspaceRoot = root) =>
    runnerHookBrief(store, { workspaceRoot, cwd, command: "node avz" });
  const text = brief(checkout);
  assert.match(text, /Avoozl runs the rounds/);
  assert.match(text, /AVOOZL is `node avz`/);
  assert.match(text, /Right now: 1 ready, 0 running/);
  assert.equal(brief(elsewhere), "");
  const tick = setup(t, { delivery: { runner: "tick" } });
  assert.equal(
    runnerHookBrief(tick.store, {
      workspaceRoot: tick.root,
      cwd: tick.checkout,
      command: "x",
    }),
    "",
  );
  const none = setup(t, { delivery: null });
  assert.equal(
    runnerHookBrief(none.store, {
      workspaceRoot: none.root,
      cwd: none.checkout,
      command: "x",
    }),
    "",
  );
  assert.deepEqual(
    await hookEvent(Readable.from([JSON.stringify({ cwd: checkout })])),
    { cwd: checkout },
  );
  const open = new Readable({ read() {} });
  assert.deepEqual(await hookEvent(open, { ms: 20 }), {});
  const printed = execFileSync(
    process.execPath,
    [cli, "next", "--hook", "--workspace", root],
    {
      encoding: "utf8",
      env: isolatedEnv(root),
      input: JSON.stringify({ hook_event_name: "agentSpawn", cwd: checkout }),
    },
  );
  assert.match(printed, /Avoozl runs the rounds/);
  const hook = JSON.parse(
    fs.readFileSync(
      fileURLToPath(
        new URL(
          "../../../kirocrew-app/hooks/avoozl-runner.json",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
  );
  assert.equal(hook.version, "v1");
  assert.equal(hook.hooks[0].trigger, "AgentSpawn");
  assert.match(
    hook.hooks[0].action.command,
    /apps\/avoozl\/bin\/avoozl\.mjs" next --hook$/,
  );
});
