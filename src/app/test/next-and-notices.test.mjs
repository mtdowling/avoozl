// `avoozl next` buckets, one writer for every surface, and decisions and
// failures on the app's notification channels with a link to the session
// (tasks 2.14 and 2.12; moved from the Crew Mode runner tests by worker-paths
// wp-2.2). One test per rule; each lists the nearby inputs it checks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
  { tasks = [leaf("a")], edges = [], delivery = { concurrency: 4 } } = {},
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
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
  });
  if (delivery)
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

test("avoozl next puts every local leaf in one bucket with what it waits on", async (t) => {
  // Nearby inputs: a dependent of an unfinished leaf, a blocked leaf, a leaf
  // in review, a worker's open question, an accepted leaf, an integrated leaf,
  // a deferred leaf, an epic (not a leaf), a GitHub-routed leaf, and capacity 1.
  const { store, ops } = setup(t, {
    tasks: [
      // Ranked first: a and b unblock dep, so they would go before it.
      leaf("asks", { rank: 1 }),
      leaf("a"),
      leaf("b"),
      leaf("dep"),
      leaf("stuck", { status: "blocked" }),
      leaf("check", { status: "review" }),
      leaf("old", { status: "accepted" }),
      leaf("merged", { integration: { commit: "f".repeat(40) } }),
      leaf("later", { status: "deferred" }),
      leaf("epic", { kind: "package" }),
    ],
    edges: [requires("a", "dep"), requires("b", "dep")],
    delivery: { concurrency: 2 },
  });
  await ops.execute(
    "runner.take",
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
  assert.equal(view.ready[0].repository, "app");

  // Every leaf done: finished.
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

test("every take and next goes through Operations.execute, and MCP may not take", async (t) => {
  // Nearby inputs: the CLI (another process, the local caller), the app's
  // MCP server (attested caller), and an unattested MCP call.
  const { root, store, ops } = setup(t, { tasks: [leaf("a"), leaf("b")] });
  const executed = [],
    execute = ops.execute.bind(ops);
  ops.execute = (...args) => {
    executed.push(args[0]);
    return execute(...args);
  };
  const viaCli = run(root, "take", "a");
  assert.equal(viaCli.binding.conductor, "cli");
  assert.deepEqual(ids(run(root, "next").ready), ["b"]);
  for (const attestedCaller of [true, false]) {
    const denied = await handleMcp(
      tool("plans_take_task", { taskId: "b" }, "dashboard:c"),
      ops,
      { attestedCaller },
    );
    assert.equal(denied.body.result.isError, true);
  }
  const listed = await handleMcp(tool("plans_next", {}, "dashboard:c"), ops, {
    attestedCaller: true,
  });
  assert.deepEqual(ids(listed.body.result.structuredContent.running), ["a"]);
  assert.ok(executed.includes("runner.next"));
  assert.deepEqual(
    store.list("session_bindings").map((b) => [b.taskId, b.source]),
    [["a", "conductor"]],
  );
});

test("the removed Crew Mode report command is refused as unknown and changes nothing", async (t) => {
  // worker-paths WP7.1 (owner decision 2026-11-18): removed commands are
  // deleted, not answered.
  const { root, store } = setup(t);
  let out;
  try {
    execFileSync(
      process.execPath,
      [
        cli,
        "report",
        "a",
        "--slot",
        "s",
        "--kind",
        "done",
        "--workspace",
        root,
      ],
      { encoding: "utf8", env: isolatedEnv(root) },
    );
  } catch (error) {
    out = error;
  }
  assert.equal(out?.status, 1);
  assert.match(out.stderr, /Unknown command or operation report/);
  assert.deepEqual(store.list("session_bindings"), []);
});

test("decisions and failures queue once on the app's channels with a link to the session", async (t) => {
  // Nearby inputs: an unknown channel, a notice with no session (the Avoozl
  // page), a dashboard: prefix, a repeated tick, the page's tick without a
  // roster (queues nothing), a failed push (stays queued), and no notifier.
  assert.throws(() => notificationPayload({ channel: "chat", text: "x" }));
  assert.equal(sessionUrl("dashboard:chat 1"), "/chat?sid=chat%201");
  assert.equal(sessionUrl(null), "/apps/avoozl");
  const { store, ops } = setup(t, {
    delivery: { retries: 0 },
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
    body: "a failed 1 times. Last cause: session closed without a done report.\n\nOpen the last session to see why. Fix the cause, then ask Avoozl to retry a (plans_task (action: retry)).",
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
  // A 403 is also exchanged once more (Kiro Crew 0.12.2.4); a second 403 stands.
  pushes = [403, 403];
  await assert.rejects(push(payload), /refused the notification \(403\)/);
});
