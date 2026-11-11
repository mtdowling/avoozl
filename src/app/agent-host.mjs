import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store, fail } from "./store.mjs";
import { RunManager } from "./manager.mjs";
import { Operations } from "./operations.mjs";
import { handleMcp } from "./mcp.mjs";

const ACTIVE_STATES = new Set([
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
]);

export function startAgentHost({
  dbPath,
  manifestPath,
  port = 0,
  factories,
  operator,
} = {}) {
  const store = new Store(dbPath),
    instanceId = randomUUID(),
    secret = randomUUID();
  let draining = false;
  store.transaction(() => {
    const owner = store.getMeta("runtimeOwner");
    if (owner) {
      let alive = false;
      try {
        process.kill(owner.pid, 0);
        alive = true;
      } catch {}
      if (alive) fail("An agent host already owns this database.", 409);
    }
    store.setMeta("runtimeOwner", {
      id: instanceId,
      pid: process.pid,
      at: new Date().toISOString(),
    });
  });
  const manager = new RunManager(store, { factories }),
    ops = new Operations(store, { manager, operator });
  const activeRuns = () =>
    store
      .list("runs")
      .filter((run) => ACTIVE_STATES.has(run.state))
      .map((run) => ({
        id: run.id,
        taskId: run.taskId,
        projectId: run.projectId,
        provider: run.provider,
        state: run.state,
        title: run.title,
        startedAt: run.createdAt,
        updatedAt: run.updatedAt || run.lastObservedAt || run.createdAt,
      }));
  const protectedOperations = () =>
    store.db
      .prepare("SELECT COUNT(*) count FROM work_locks WHERE pid=?")
      .get(process.pid).count;
  const json = (res, status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    });
    res.end(JSON.stringify(value));
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || ""))
        fail("Local host required.", 403);
      if (
        req.headers.origin &&
        req.headers.origin !== "http://" + req.headers.host
      )
        fail("Same-origin request required.", 403);
      const url = new URL(req.url, "http://" + req.headers.host);
      if (req.method === "GET" && url.pathname === "/health") {
        const active = activeRuns();
        json(res, 200, {
          ok: true,
          instanceId,
          pid: process.pid,
          dbPath,
          draining,
          active: active.length,
          activeRuns: active,
          protectedOperations: protectedOperations(),
        });
        return;
      }
      if (
        req.method !== "POST" ||
        req.headers["content-type"]?.split(";")[0] !== "application/json"
      )
        fail("JSON POST required.", 405);
      let length = 0,
        chunks = [];
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 16 * 1024 * 1024) fail("Request too large.", 413);
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString());
      if (url.pathname === "/mcp") {
        const result = await handleMcp(input, ops, {
          base: "http://" + req.headers.host,
          runId: url.searchParams.get("run"),
          runCapability: req.headers.authorization?.replace(/^Bearer\s+/i, ""),
          versionHeader: req.headers["mcp-protocol-version"],
        });
        res.writeHead(result.status, { "Content-Type": "application/json" });
        res.end(result.body === null ? "" : JSON.stringify(result.body));
        return;
      }
      if (req.headers.authorization !== "Bearer " + secret)
        fail("Agent-host capability required.", 403);
      if (url.pathname === "/rpc") {
        if (
          draining &&
          ["driver.open", "run.start", "batch.start"].includes(input.operation)
        ) {
          json(res, 503, {
            error:
              "Agent host is draining. Existing work continues; retry later.",
            retryable: true,
          });
          return;
        }
        if (
          ![
            "providers",
            "models",
            "usage.limits",
            "driver.open",
            "driver.context",
            "run.start",
            "run.send",
            "run.interrupt",
            "run.resume",
            "run.approvals",
            "run.answer",
            "run.model",
            "run.unsend",
            "run.queue",
            "run.validate",
            "integration.merge",
            "batch.start",
            "batch.control",
          ].includes(input.operation)
        )
          fail("Unsupported agent-host operation.");
        const result =
          input.operation === "providers"
            ? await manager.providers()
            : await ops.execute(input.operation, input.input || {});
        json(res, 200, { result });
        return;
      }
      if (url.pathname === "/control") {
        if (input.action === "drain") {
          draining = true;
          manager.draining = true;
          const batches = store
            .list("batches")
            .filter((b) => b.state === "running");
          store.setMeta(
            "hostDrainBatches",
            batches.map((b) => b.id),
          );
          for (const b of batches)
            await ops.execute("batch.control", { id: b.id, action: "pause" });
          const state = {
            draining: true,
            activeRuns: activeRuns(),
            pausedBatchIds: batches.map((batch) => batch.id),
            protectedOperations: protectedOperations(),
          };
          store.event(null, "host.draining", { instanceId, ...state });
          json(res, 200, state);
          return;
        }
        if (input.action === "resume") {
          draining = false;
          manager.draining = false;
          for (const id of store.getMeta("hostDrainBatches") || [])
            await ops.execute("batch.control", { id, action: "resume" });
          store.setMeta("hostDrainBatches", []);
          for (const run of store.list("runs")) manager.drain(run.id);
          json(res, 200, { draining: false });
          return;
        }
        if (input.action === "stop") {
          const active = activeRuns();
          if (protectedOperations())
            fail(
              "Wait for validation or integration to finish before stopping the host.",
              409,
            );
          if (active.length)
            fail(
              "Drain and finish or interrupt active runs before stopping the agent host.",
              409,
            );
          json(res, 200, { stopping: true });
          setImmediate(() => server.close());
          return;
        }
      }
      fail("Not found.", 404);
    } catch (error) {
      json(res, error.status || 400, { error: error.message });
    }
  });
  server.listen(port, "127.0.0.1", () => {
    const origin = "http://127.0.0.1:" + server.address().port;
    manager.baseUrl = origin;
    const manifest = {
      instanceId,
      pid: process.pid,
      dbPath: path.resolve(dbPath),
      url: origin,
      secret,
      startedAt: new Date().toISOString(),
    };
    if (manifestPath) {
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      fs.writeFileSync(manifestPath + ".pending", JSON.stringify(manifest), {
        mode: 0o600,
      });
      fs.renameSync(manifestPath + ".pending", manifestPath);
    }
    console.log("Avoozl agent host: " + origin);
  });
  server.on("close", () => {
    manager.close().then(() => {
      if (store.getMeta("runtimeOwner")?.id === instanceId)
        store.setMeta("runtimeOwner", null);
      store.close();
    });
  });
  server.agentHost = { store, manager, ops, instanceId };
  return server;
}
