import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startAppBackend, verifyPrincipal } from "../app-backend.mjs";
import { workspaceConfig } from "../config.mjs";
import { WORKSPACE_TOOLS } from "../mcp.mjs";
import { Operations } from "../operations.mjs";
import {
  statusFromRoster,
  taskIdFromSessionTitle,
} from "../session-bindings.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));
const SECRET = "test-proxy-secret";

// Mirrors kiro_crew/apps/proxy_auth.py `sign_proxy_principal_claim`.
function sign({
  kind = "owner-session",
  ownerId = kind === "owner-session" ? "owner" : "",
  method = "POST",
  target = "/api/command",
  body = "",
  secret = SECRET,
  issuedAt = Math.floor(Date.now() / 1000),
  requestId = randomBytes(16).toString("hex"),
} = {}) {
  const claim = { issuedAt, kind, ownerId, requestId, version: 1 },
    encoded = Buffer.from(JSON.stringify(claim)).toString("base64url"),
    signature = createHmac("sha256", secret)
      .update(
        [
          "kirocrew-proxy-principal-v1",
          String(issuedAt),
          method,
          target,
          createHash("sha256").update(body).digest("hex"),
          encoded,
        ].join("\n"),
      )
      .digest("hex");
  return `${encoded}.${signature}`;
}

// Every row of every table, so a test can prove an operation wrote nothing.
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

function isolatedEnv(root) {
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(root, "config") };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
  return env;
}

async function backend(t, secret = SECRET) {
  const root = temporaryDirectory();
  initializeWorkspace(root);
  const server = startAppBackend({
    config: workspaceConfig({ workspace: root, env: isolatedEnv(root) }),
    secret,
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const { address, port } = server.address();
  return { address, base: `http://127.0.0.1:${port}` };
}

function command(base, value, header) {
  const body = JSON.stringify(value);
  return fetch(base + "/api/command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(header === undefined ? {} : { "X-KiroCrew-Principal": header(body) }),
    },
    body,
  });
}

test("app backend binds loopback and leaves only health unsigned", async (t) => {
  const { address, base } = await backend(t);
  assert.equal(address, "127.0.0.1");
  const health = await fetch(base + "/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, app: "avoozl" });
  for (const route of ["/api/command", "/api/anything", "/", "/health?x=1"])
    assert.equal((await fetch(base + route)).status, 401, route);
  assert.equal((await command(base, { operation: "state" })).status, 401);
});

test("app backend accepts only a fresh, exact, gateway-signed principal", async (t) => {
  const { base } = await backend(t),
    state = { operation: "state" };
  const ok = await command(base, state, (body) => sign({ body }));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).result.revision >= 1, true);

  const refused = {
    "wrong secret": (body) => sign({ body, secret: "other" }),
    "other body": () => sign({ body: "{}" }),
    "other target": (body) => sign({ body, target: "/api/other" }),
    "other method": (body) => sign({ body, method: "GET" }),
    stale: (body) =>
      sign({ body, issuedAt: Math.floor(Date.now() / 1000) - 120 }),
    "no principal": (body) => sign({ body, kind: "none" }),
    "owner without id": (body) => sign({ body, ownerId: "" }),
    garbage: () => "not-a-claim",
  };
  for (const [name, header] of Object.entries(refused))
    assert.equal((await command(base, state, header)).status, 401, name);

  const body = JSON.stringify(state),
    once = sign({ body });
  assert.equal((await command(base, state, () => once)).status, 200);
  assert.equal(
    (await command(base, state, () => once)).status,
    401,
    "a replayed claim is refused",
  );
});

// The gateway's aiohttp pool reuses an idle connection for up to 15 s and does
// not retry a POST that fails on it. Node's default closes idle connections
// at 5 s (6 s with its buffer), which raced that reuse into "Connection reset
// by peer". A connection idle past Node's default must still serve a request.
test("app backend keeps an idle connection open past Node's default close", async (t) => {
  const { base } = await backend(t),
    { port } = new URL(base),
    socket = net.connect(Number(port), "127.0.0.1");
  t.after(() => socket.destroy());
  let received = "",
    closed = false;
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => (received += chunk));
  socket.on("end", () => (closed = true));
  socket.on("close", () => (closed = true));
  const health = async () => {
    received = "";
    socket.write("GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
    for (let waited = 0; !received.includes('"app":"avoozl"'); waited += 20) {
      if (closed || waited > 5000) return null;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return received.split("\r\n", 1)[0];
  };
  await new Promise((resolve) => socket.once("connect", resolve));
  assert.equal(await health(), "HTTP/1.1 200 OK");
  const nodeDefault = http.createServer().keepAliveTimeout;
  await new Promise((resolve) => setTimeout(resolve, nodeDefault + 1500));
  assert.equal(
    closed,
    false,
    "the backend closed an idle connection the gateway may reuse",
  );
  assert.equal(await health(), "HTTP/1.1 200 OK");
});

test("app backend fails closed without a proxy secret", async (t) => {
  const { base } = await backend(t, "");
  assert.equal(
    (await command(base, { operation: "state" }, (body) => sign({ body })))
      .status,
    401,
  );
  assert.equal(
    verifyPrincipal(sign(), {
      method: "POST",
      target: "/api/command",
      secret: "",
      replay: { accept: () => true },
    }),
    null,
  );
});

test("app tokens and agent tools may observe but not write", async (t) => {
  const { base } = await backend(t);
  for (const kind of ["app-token", "agent-tool"]) {
    assert.equal(
      (
        await command(base, { operation: "state" }, (body) =>
          sign({ body, kind }),
        )
      ).status,
      200,
      kind,
    );
    assert.equal(
      (
        await command(
          base,
          { operation: "task.capture", input: { title: "x" } },
          (body) => sign({ body, kind }),
        )
      ).status,
      403,
      kind,
    );
  }
  assert.equal(
    (await command(base, { operation: "legacy.mcp" }, (body) => sign({ body })))
      .status,
    403,
    "operations outside the client API are refused",
  );
});

test("avoozl mcp serves plans_* tools over stdio without a web server", () => {
  const root = temporaryDirectory();
  initializeWorkspace(path.join(root, "workspace"));
  const messages = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "plans_tick", arguments: { input: {} } },
    },
  ];
  const output = execFileSync(
    process.execPath,
    [cli, "mcp", "--workspace", path.join(root, "workspace")],
    {
      encoding: "utf8",
      env: isolatedEnv(root),
      input: messages.map((m) => JSON.stringify(m)).join("\n") + "\n",
    },
  );
  const responses = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    responses.map((r) => r.id),
    [1, 2, 3],
    "the notification gets no response",
  );
  assert.ok(responses[0].result.protocolVersion);
  const names = responses[1].result.tools.map((tool) => tool.name);
  for (const tool of WORKSPACE_TOOLS) assert.ok(names.includes(tool.name));
  for (const name of [
    "plans_tick",
    "plans_bind_session",
    "plans_rediscover_sessions",
    "plans_register_session",
    "plans_ready_queue",
  ])
    assert.ok(names.includes(name), name);
  assert.ok(names.every((name) => name.startsWith("plans_")));
  const tick = responses[2].result;
  assert.notEqual(tick.isError, true, JSON.stringify(tick));
  assert.equal(tick.structuredContent.policy.status, "loaded");
  assert.deepEqual(tick.structuredContent.dispatch, []);
});

test("workspace.tick is locked, loads policy, and writes nothing twice", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root }),
    policyFile = path.join(root, ".avoozl.json");
  fs.writeFileSync(policyFile, JSON.stringify({ version: 1, name: "Fix" }));

  const before = dump(store),
    first = await ops.execute("workspace.tick"),
    second = await ops.execute("workspace.tick");
  assert.deepEqual(dump(store), before, "two ticks write nothing");
  assert.deepEqual(second, first);
  assert.equal(first.policy.status, "loaded");
  assert.match(first.policy.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    { ...first, policy: undefined },
    {
      policy: undefined,
      observe: [],
      dispatch: [],
      messages: [],
      notify: [],
    },
  );

  store.db
    .prepare("INSERT INTO work_locks VALUES (?,?,?,?,?)")
    .run(
      "avoozl:workspace-tick",
      "avoozl:workspace",
      "tick",
      process.pid,
      "held",
    );
  const held = dump(store);
  assert.deepEqual(await ops.execute("workspace.tick"), { skipped: "locked" });
  assert.deepEqual(dump(store), held, "a locked tick writes nothing");
  store.db.prepare("DELETE FROM work_locks").run();

  fs.writeFileSync(policyFile, "{ not json");
  const invalid = await ops.execute("workspace.tick");
  assert.equal(invalid.policy.status, "invalid");
  assert.equal(invalid.policy.using, first.policy.hash);
  assert.equal(invalid.notify.length, 1);
  assert.equal(invalid.notify[0].channel, "decision");
  assert.deepEqual(
    (await ops.execute("workspace.tick")).notify,
    [],
    "one invalid file raises one decision",
  );

  fs.writeFileSync(
    policyFile,
    JSON.stringify({ version: 1, github: { token: "x" } }),
  );
  assert.equal((await ops.execute("workspace.tick")).policy.status, "invalid");
  fs.rmSync(policyFile);
  assert.equal((await ops.execute("workspace.tick")).policy.status, "absent");
});

test("plans_bind_session binds once and never moves a slot", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  const bound = await ops.execute("session.bind", {
    taskId: "sample-task",
    slot: "slot-1",
    title: "avoozl:sample-task Implement fixture",
  });
  assert.equal(bound.changed, true);
  assert.equal(bound.binding.role, "worker");
  assert.equal(bound.binding.attempt, 1);

  const before = dump(store),
    again = await ops.execute("session.bind", {
      taskId: "sample-task",
      slot: "slot-1",
    });
  assert.equal(again.changed, false);
  assert.deepEqual(dump(store), before, "rebinding writes nothing");

  await assert.rejects(
    ops.execute("session.bind", {
      taskId: "sample-task",
      slot: "slot-1",
      role: "verifier",
    }),
    (error) => error.status === 409,
  );
  await assert.rejects(
    ops.execute("session.bind", { taskId: "missing", slot: "slot-2" }),
    (error) => error.status === 404,
  );
  await assert.rejects(
    ops.execute("session.bind", { taskId: "sample-task", slot: "" }),
    (error) => error.status === 400,
  );
  assert.deepEqual((await ops.execute("workspace.tick")).observe, [
    { slot: "slot-1", taskId: "sample-task", role: "worker" },
  ]);
});

test("lost bindings are rediscovered from avoozl:<task-id> titles", async (t) => {
  assert.equal(
    taskIdFromSessionTitle("avoozl:w3.reactor-timers Add timers"),
    "w3.reactor-timers",
  );
  assert.equal(taskIdFromSessionTitle("avoozl:sample-task"), "sample-task");
  for (const title of ["avoozl:", "avoozl: x", "my avoozl:x", null])
    assert.equal(taskIdFromSessionTitle(title), null);

  const { store } = fixture(t),
    ops = new Operations(store);
  await ops.execute("session.bind", { taskId: "sample-task", slot: "kept" });
  const sessions = [
    { slot: "kept", title: "avoozl:sample-task Implement fixture" },
    { slot: "lost", title: "avoozl:sample-task Implement fixture" },
    { slot: "chat", title: "Ordinary chat" },
    { slot: "gone", title: "avoozl:deleted-task Old work" },
  ];
  const found = await ops.execute("session.rediscover", { sessions });
  assert.deepEqual(
    found.bound.map((b) => [b.slot, b.taskId, b.attempt, b.source]),
    [["lost", "sample-task", 2, "title"]],
  );
  assert.deepEqual(
    found.unchanged.map((b) => b.slot),
    ["kept"],
  );
  assert.deepEqual(found.ignored, [
    { slot: "chat", reason: "not-avoozl" },
    { slot: "gone", reason: "unknown-task" },
  ]);

  const before = dump(store),
    repeat = await ops.execute("session.rediscover", { sessions });
  assert.deepEqual(repeat.bound, []);
  assert.deepEqual(dump(store), before, "a second rediscovery writes nothing");
});

test("a session request dispatches once, and a closed session is read once", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  store.put("projects", {
    id: "app",
    root: "/checkout/app",
    baseBranch: "main",
  });
  const request = {
    taskId: "sample-task",
    repository: "app",
    agent: "p2-worker",
  };
  await assert.rejects(
    ops.execute("session.request", { ...request, repository: "missing" }),
    (error) => error.status === 404,
  );
  await assert.rejects(
    ops.execute("session.request", { ...request, agent: "bad agent" }),
    (error) => error.status === 400,
  );
  assert.equal((await ops.execute("session.request", request)).changed, true);
  assert.equal((await ops.execute("session.request", request)).changed, false);
  await assert.rejects(
    ops.execute("session.request", { ...request, agent: "other" }),
    (error) => error.status === 409,
  );

  const before = dump(store),
    first = await ops.execute("workspace.tick"),
    second = await ops.execute("workspace.tick");
  assert.deepEqual(dump(store), before, "planning a dispatch writes nothing");
  assert.deepEqual(second.dispatch, first.dispatch);
  assert.equal(first.dispatch.length, 1);
  const [intent] = first.dispatch;
  assert.deepEqual(
    { ...intent, brief: undefined },
    {
      task: "sample-task",
      role: "worker",
      title: "avoozl:sample-task Implement fixture",
      folder: "Avoozl/app",
      agent: "p2-worker",
      checkout: "/checkout/app",
      brief: undefined,
    },
  );
  assert.match(intent.brief, /\/checkout\/app/);

  await ops.execute("session.bind", {
    taskId: "sample-task",
    slot: "slot-1",
    title: intent.title,
  });
  const bound = await ops.execute("workspace.tick");
  assert.deepEqual(bound.dispatch, [], "a bound task is not dispatched again");
  assert.deepEqual(bound.observe, [
    { slot: "slot-1", taskId: "sample-task", role: "worker" },
  ]);

  const roster = (status) =>
    `📋 1 session(s) you stood up:\n  💤 \`other\` (x) — working\n  ${
      status === "closed"
        ? "✅ `slot-1` — closed (finished and closed its tab; nothing to re-dispatch)"
        : "💤 `slot-1` (avoozl:sample-task Implement fixture) — idle"
    }`;
  const idle = await ops.execute("session.status", {
    slot: "slot-1",
    status: roster("idle"),
  });
  assert.deepEqual([idle.status, idle.changed], ["idle", true]);
  const unchanged = dump(store);
  assert.equal(
    (
      await ops.execute("session.status", {
        slot: "slot-1",
        status: roster("idle"),
      })
    ).changed,
    false,
  );
  assert.equal(
    (await ops.execute("session.status", { slot: "slot-1", status: "📋 none" }))
      .changed,
    false,
    "an unlisted slot writes nothing",
  );
  assert.deepEqual(dump(store), unchanged);
  const closed = await ops.execute("session.status", {
    slot: "slot-1",
    status: roster("closed"),
  });
  assert.deepEqual([closed.status, closed.changed], ["closed", true]);
  const after = await ops.execute("workspace.tick");
  assert.deepEqual(after.observe, [], "a closed session is final");
  assert.deepEqual(after.dispatch, [], "closing does not redispatch");
  await assert.rejects(
    ops.execute("session.status", { slot: "nope", status: "idle" }),
    (error) => error.status === 404,
  );
});

test("statusFromRoster skips the bound title", () => {
  assert.equal(
    statusFromRoster("  💤 `s` (a — working) — idle", "s", "a — working"),
    "idle",
  );
  assert.equal(
    statusFromRoster("  🔃 `s` (t) — working, 2 queued", "s"),
    "working",
  );
  assert.equal(statusFromRoster("  `x` — closed", "s"), null);
});

// Task 5.3 and 5.5: the app backend is the only listener left. Every page
// view loads through it, and the website, intake callback and queue browser
// routes and operations are gone.
test("app page views load through the backend, and removed routes are gone", async (t) => {
  const { base } = await backend(t);
  for (const [operation, input] of [
    ["workspaces.list", {}],
    ["repositories.list", {}],
    ["plan.specs", {}],
    ["graph.view", {}],
    ["delivery.view", {}],
    ["conflicts.view", {}],
    ["github.settings.get", {}],
    ["workspace.tick.health", {}],
  ]) {
    const reply = await command(base, { operation, input }, (body) =>
      sign({ body }),
    );
    assert.equal(reply.status, 200, operation);
    assert.ok("result" in (await reply.json()), operation);
  }
  for (const [method, route] of [
    ["POST", "/api/github-intake"],
    ["POST", "/github-intake"],
    ["GET", "/"],
    ["GET", "/index.html"],
    ["GET", "/api/view-state"],
    ["GET", "/database.json"],
    ["GET", "/api/events"],
    ["POST", "/api/operation"],
    ["POST", "/mcp"],
  ]) {
    const body = method === "POST" ? "{}" : "",
      init = { method, ...(body ? { body } : {}) };
    assert.equal((await fetch(base + route, init)).status, 401, route);
    const signed = await fetch(base + route, {
      ...init,
      headers: {
        "X-KiroCrew-Principal": sign({ method, target: route, body }),
      },
    });
    assert.equal(signed.status, 404, route);
  }
  for (const operation of [
    "queue.items",
    "queue.sync",
    "queue.claim",
    "queue.createTask",
    "queue.confirmLink",
    "work.take",
    "github.queue.configure",
    "github.queue.remove",
    "github.intake.capabilities",
    "github.intake.capability.create",
    "github.intake.capability.revoke",
  ]) {
    const reply = await command(base, { operation }, (body) => sign({ body }));
    assert.equal(reply.status, 403, operation);
  }
});

test("removed queue and intake operations are unknown to Operations", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  for (const operation of [
    "queue.items",
    "queue.claim",
    "work.take",
    "github.queue.configure",
    "github.intake.capability.create",
    "openhands.automations.intake.prepare",
  ])
    await assert.rejects(ops.execute(operation, {}), (error) => {
      assert.equal(error.status, 404, operation);
      return true;
    });
});
