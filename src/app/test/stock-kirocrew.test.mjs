// Avoozl on a stock Kiro Crew: the script cron has no
// ScriptContext.session_status, so the tick gets no roster and the app
// backend reads each session the cron opened (session-observer.mjs). One
// test per rule; each lists the nearby inputs it checks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { startAppBackend } from "../app-backend.mjs";
import { workspaceConfig } from "../config.mjs";
import { Operations } from "../operations.mjs";
import {
  gatewaySlotReader,
  observeSessions,
  slotStatus,
} from "../session-observer.mjs";
import { Store } from "../store.mjs";
import { tickHealth } from "../tick.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

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
  checks: ["npm test"],
  repository: "app",
});

function setup(t, tasks = [leaf("a")]) {
  const root = temporaryDirectory("avoozl-stock-"),
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
    localCheckout: fs.realpathSync.native(checkout),
  });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, delivery: { concurrency: 4, retries: 1 } }),
  );
  return { store, ops: new Operations(store, { workspaceRoot: root }) };
}

const cronTick = (ops) => ops.execute("workspace.tick", { cron: true });
const bind = (ops, taskId, slot, attempt = 1) =>
  ops.execute("session.bind", {
    taskId,
    slot,
    role: "worker",
    attempt,
    source: "tick",
    title: `avoozl:${taskId} worker`,
  });
const status = (ops, slot, value) =>
  ops.execute("session.status", { slot, status: value });

test("a cron tick without a roster dispatches, then holds until the backend observes", async (t) => {
  // Nearby inputs: the page's tick (no cron flag) and a roster tick.
  const { store, ops } = setup(t, [leaf("a"), leaf("b")]);
  const first = await cronTick(ops);
  assert.deepEqual(
    first.dispatch.map((d) => d.task),
    ["a", "b"],
  );
  assert.equal(tickHealth(store).lastRun.observer, "app");
  await bind(ops, "a", "avoozl_a");
  const held = await cronTick(ops);
  assert.deepEqual(held.held, { reason: "unobserved", slots: ["avoozl_a"] });
  assert.deepEqual(held.dispatch, []);
  await status(ops, "avoozl_a", "working");
  assert.deepEqual(
    (await cronTick(ops)).dispatch.map((d) => d.task),
    ["b"],
    "an observed session no longer holds dispatch",
  );
  // The page's plan-only tick keeps the cron's answer in the receipt.
  await ops.execute("workspace.tick", {});
  assert.equal(tickHealth(store).lastRun.observer, "app");
  await ops.execute("workspace.tick", { cron: true, sessions: [] });
  assert.equal(tickHealth(store).lastRun.observer, "roster");
});

test("a gone worker opens one decision and is never replaced on its own", async (t) => {
  // Nearby inputs: the same session reading live again, and the person's retry.
  const { store, ops } = setup(t);
  await bind(ops, "a", "avoozl_a");
  await status(ops, "avoozl_a", "gone");
  const first = await cronTick(ops);
  assert.deepEqual(first.dispatch, [], "no second worker");
  assert.equal(store.get("task_deliveries", "a").state, "decision");
  assert.equal(first.notify.length, 1);
  assert.match(first.notify[0].title, /its session is gone/);
  const again = await cronTick(ops);
  assert.deepEqual(again.notify, [], "one decision, not one per tick");
  assert.deepEqual(again.dispatch, []);

  await status(ops, "avoozl_a", "working");
  await cronTick(ops);
  const back = store.get("task_deliveries", "a");
  assert.equal(back.state, "running", "a session that reads live resumes");
  assert.equal(back.cause, undefined);

  await status(ops, "avoozl_a", "gone");
  await cronTick(ops);
  assert.equal(store.get("task_deliveries", "a").state, "decision");
  await ops.execute("delivery.retry", { taskId: "a" }, undefined, {
    local: true,
  });
  assert.equal(store.get("session_bindings", "avoozl_a").status, "lost");
  const retried = await cronTick(ops);
  assert.equal(
    store.get("task_deliveries", "a").attempts.at(-1).outcome,
    "failed",
  );
  assert.deepEqual(
    retried.dispatch.map((d) => [d.task, d.attempt]),
    [["a", 2]],
  );
});

test("the backend records what each live session it reads is doing", async (t) => {
  // Nearby inputs: a failed read, a finished attempt, a session not the tick's.
  const { store, ops } = setup(t, [leaf("a"), leaf("b"), leaf("c")]);
  await bind(ops, "a", "avoozl_a");
  await bind(ops, "b", "avoozl_b");
  await bind(ops, "c", "avoozl_c");
  await status(ops, "avoozl_c", "closed");
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "mine",
    role: "planner",
  });
  const reads = [];
  const result = await observeSessions(store, async (slot) => {
    reads.push(slot);
    if (slot === "avoozl_b") throw Error("refused (403)");
    return "idle";
  });
  assert.deepEqual(reads, ["avoozl_a", "avoozl_b"]);
  assert.deepEqual(result, {
    observed: 1,
    errors: [{ slot: "avoozl_b", error: "refused (403)" }],
  });
  assert.equal(store.get("session_bindings", "avoozl_a").status, "idle");
  assert.equal(
    store.get("session_bindings", "avoozl_b").status,
    undefined,
    "an unreadable session keeps its last status",
  );
});

test("a slot read maps Kiro Crew's answer and never reads a refusal as gone", async () => {
  // Nearby inputs: an expired token, a 403, and an untrusted origin.
  assert.equal(slotStatus({ running: true, queue: [] }), "working");
  assert.equal(slotStatus({ running: false, queue: [{ id: 1 }] }), "queued");
  assert.equal(slotStatus({ running: false, queue: [] }), "idle");
  const secret = "s".repeat(32),
    origin = "http://127.0.0.1:5999",
    env = {
      KIROCREW_GATEWAY_ORIGIN: origin,
      KIROCREW_PROXY_SECRET: secret,
      KIROCREW_GATEWAY_ORIGIN_PROOF: createHmac("sha256", secret)
        .update(origin)
        .digest("hex"),
    };
  assert.equal(
    gatewaySlotReader({
      ...env,
      KIROCREW_GATEWAY_ORIGIN_PROOF: "0".repeat(64),
    }),
    null,
  );
  const calls = [],
    answers = {
      avoozl_live: [401, { running: true, queue: [] }],
      avoozl_gone: [404, {}],
      avoozl_refused: [403, {}],
    };
  let tokens = 0;
  const read = gatewaySlotReader(env, async (url, init) => {
    calls.push([init.method, url.replace(origin, "")]);
    if (url.endsWith("/api/apps/avoozl/token"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ token: `t${++tokens}` }),
      };
    const slot = decodeURIComponent(url.match(/slots\/([^?]+)/)[1]),
      [code, body] = answers[slot];
    // The first read's token has expired; the next one is fresh.
    const status = code === 401 && url.includes("token=t2") ? 200 : code;
    return { ok: status === 200, status, json: async () => body };
  });
  assert.equal(await read("avoozl_live"), "working");
  assert.equal(await read("avoozl_gone"), "gone");
  await assert.rejects(read("avoozl_refused"), /403/);
  assert.deepEqual(calls.slice(0, 4), [
    ["POST", "/api/apps/avoozl/token"],
    ["GET", "/api/chat/slots/avoozl_live?limit=1&token=t1"],
    ["POST", "/api/apps/avoozl/token"],
    ["GET", "/api/chat/slots/avoozl_live?limit=1&token=t2"],
  ]);
});

// Mirrors kiro_crew/apps/proxy_auth.py `sign_proxy_principal_claim`.
function sign(body, secret) {
  const issuedAt = Math.floor(Date.now() / 1000),
    claim = {
      issuedAt,
      kind: "owner-session",
      ownerId: "owner",
      requestId: randomBytes(16).toString("hex"),
      version: 1,
    },
    encoded = Buffer.from(JSON.stringify(claim)).toString("base64url"),
    signature = createHmac("sha256", secret)
      .update(
        [
          "kirocrew-proxy-principal-v1",
          String(issuedAt),
          "POST",
          "/api/command",
          createHash("sha256").update(body).digest("hex"),
          encoded,
        ].join("\n"),
      )
      .digest("hex");
  return `${encoded}.${signature}`;
}

test("a backend that started before any workspace reads sessions once one is added", async (t) => {
  // Nearby inputs: a receipt from a roster tick, which the backend leaves alone.
  const root = temporaryDirectory("avoozl-stock-backend-"),
    workspace = path.join(root, "workspace"),
    secret = "test-proxy-secret";
  const target = workspaceConfig({ workspace, env: {} });
  fs.mkdirSync(path.dirname(target.dbPath), { recursive: true });
  const store = new Store(target.dbPath);
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [leaf("a")], edges: [] });
  await bind(
    new Operations(store, { workspaceRoot: workspace }),
    "a",
    "avoozl_a",
  );
  const reads = [];
  const server = startAppBackend({
    config: workspaceConfig({ workspace: path.join(root, "none"), env: {} }),
    secret,
    notifier: null,
    slotReader: async (slot) => (reads.push(slot), "working"),
    registryOptions: {
      configPath: path.join(root, "machine", "config.json"),
      catalogPath: path.join(root, "machine", "catalog.sqlite"),
    },
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const body = JSON.stringify({
    operation: "workspaces.add",
    input: { id: "w", root: workspace },
  });
  const added = await fetch(
    `http://127.0.0.1:${server.address().port}/api/command`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KiroCrew-Principal": sign(body, secret),
      },
      body,
    },
  );
  assert.equal(added.status, 200);
  const health = path.join(path.dirname(target.dbPath), "tick-health.json"),
    settle = async () => {
      for (let i = 0; i < 50 && !reads.length; i++)
        await new Promise((resolve) => setTimeout(resolve, 40));
    };
  fs.writeFileSync(
    health,
    JSON.stringify({ outcome: "ok", observer: "roster" }),
  );
  await settle();
  assert.deepEqual(reads, [], "a roster tick needs no backend read");
  fs.writeFileSync(health, JSON.stringify({ outcome: "ok", observer: "app" }));
  await settle();
  // Windows can report one write as two watch events; each reads the slot.
  assert.deepEqual([...new Set(reads)], ["avoozl_a"]);
  for (
    let i = 0;
    i < 50 && !store.get("session_bindings", "avoozl_a").status;
    i++
  )
    await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(store.get("session_bindings", "avoozl_a").status, "working");
});
