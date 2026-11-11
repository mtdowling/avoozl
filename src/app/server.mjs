import { viewSnapshot, compactEvent } from "./views.mjs";
import http from "node:http";
import { networkPolicy } from "./network.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store, fail } from "./store.mjs";
import { Operations } from "./operations.mjs";
import { RunManager } from "./manager.mjs";
import { handleMcp } from "./mcp.mjs";
import { planSummaries } from "../plan-model.mjs";
import { digest } from "../model.mjs";
import { watchSources } from "./source-sync.mjs";
import { randomUUID } from "node:crypto";
import { applicationRoot } from "./config.mjs";
import {
  installOpenHandsWebSocketProxy,
  mintOpenHandsSurface,
  proxyOpenHandsSurface,
} from "./openhands-surface.mjs";
import { RepositorySettings } from "./repository-settings.mjs";
export const appRoot = path.dirname(fileURLToPath(import.meta.url)),
  webRoot = path.join(appRoot, "ui-dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
export function flushOutbox(store, root) {
  fs.mkdirSync(root, { recursive: true });
  const report = [];
  for (const row of store.db
    .prepare("SELECT * FROM outbox WHERE state='pending' ORDER BY rowid")
    .all()) {
    const full = path.resolve(root, row.path);
    if (!full.startsWith(path.resolve(root) + path.sep))
      fail("Invalid document projection path.");
    let parent = path.dirname(full);
    while (parent !== path.resolve(root)) {
      if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink())
        fail("Document symlink refused.");
      parent = path.dirname(parent);
    }
    if (fs.existsSync(full) && fs.lstatSync(full).isSymbolicLink())
      fail("Document symlink refused.");
    const old = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
    if (
      old !== null &&
      digest(old) !== digest(row.text) &&
      (!row.expected_hash || digest(old) !== row.expected_hash)
    ) {
      report.push({ id: row.id, state: "conflict", path: row.path });
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full + ".workspace-pending", row.text);
    fs.renameSync(full + ".workspace-pending", full);
    store.db
      .prepare("UPDATE outbox SET state='published' WHERE id=?")
      .run(row.id);
    report.push({ id: row.id, state: "published", path: row.path });
  }
  if (report.length) store.setMeta("publication", report);
  return report;
}
export function startServer({
  dbPath = process.env.NUPP_WORKSPACE_DB ||
    path.join(appRoot, ".state/workspace.sqlite"),
  port = Number(process.env.PORT || 9428),
  projectionRoot = process.env.NUPP_WORKSPACE_DOCS ||
    path.join(appRoot, ".state/documents"),
  sourceRoot,
  workspaceName,
  operator,
  factories,
  manager: providedManager,
  mode,
  host = process.env.NUPP_WORKSPACE_HOST || "127.0.0.1",
  allowedHosts = [],
  canvasOrigins = [],
  githubPollMs = 30000,
  workspaceRoot,
  configFiles,
  configSources,
  configWithoutRepository,
} = {}) {
  const store = new Store(dbPath);
  if (!store.initialized()) fail("Initialize a workspace before serving.");
  const ownerKey = providedManager?.remote ? "webOwner" : "runtimeOwner",
    runtimeId = randomUUID();
  store.transaction(() => {
    const owner = store.getMeta(ownerKey);
    if (owner) {
      let alive = false;
      try {
        process.kill(owner.pid, 0);
        alive = true;
      } catch {}
      if (alive && !owner.draining)
        fail("Another workspace server owns this database.", 409);
    }
    store.setMeta(ownerKey, {
      id: runtimeId,
      pid: process.pid,
      at: new Date().toISOString(),
    });
  });
  if (mode) store.setMeta("mode", mode);
  const configuration = workspaceRoot
    ? new RepositorySettings(store, {
        workspaceRoot,
        files: configFiles,
        sources: configSources,
        baseConfig: configWithoutRepository,
      })
    : null;
  const manager =
      providedManager ||
      new RunManager(store, { factories, baseUrl: "http://127.0.0.1:" + port }),
    ops = new Operations(store, { manager, operator, configuration });
  let draining = false;
  const clients = new Set();
  const stopSourceWatch = sourceRoot
    ? watchSources(store, sourceRoot)
    : () => {};
  const stopConfigurationWatch = configuration
    ? configuration.watch()
    : () => {};
  let eventTimer = null;
  let githubTimer = null,
    githubSyncing = false;
  const json = (res, status, value, headers = {}) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    res.end(JSON.stringify(value));
  };
  const normalizedCanvasOrigins = new Set(
      canvasOrigins.map((value) => new URL(value).origin),
    ),
    access = networkPolicy({
      host,
      allowedHosts,
      allowedOrigins: [...normalizedCanvasOrigins],
    });
  const canvasOrigin = (req) =>
    req.headers.origin && normalizedCanvasOrigins.has(req.headers.origin)
      ? req.headers.origin
      : null;
  const allowCanvasRequest = (req, res) => {
    const origin = canvasOrigin(req);
    if (!origin) return false;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    return true;
  };
  const etag = () => '"workspace-' + store.read().revision + '"';
  async function body(req) {
    let size = 0,
      chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) fail("Request too large.", 413);
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      fail("JSON required.");
    }
  }
  function mutation(req) {
    if (req.headers["content-type"]?.split(";")[0] !== "application/json")
      fail("JSON required.", 415);
    if (
      req.headers.origin &&
      req.headers.origin !== "http://" + req.headers.host &&
      !canvasOrigin(req)
    )
      fail("Same-origin request required.", 403);
  }
  function revision(req) {
    if (req.headers["if-match"] !== etag())
      fail("Database changed. Reload and review before saving.", 409);
    return store.read().revision;
  }
  function pump() {
    const currentRevision = store.read().revision;
    for (const client of clients) {
      const events = store.events({ after: client.after, runId: client.runId });
      for (const event of events) {
        client.res.write(
          `id: ${event.seq}\ndata: ${JSON.stringify(client.compact ? compactEvent(event) : event)}\n\n`,
        );
        client.after = event.seq;
      }
      if (!client.runId && client.revision !== currentRevision) {
        client.res.write(
          `data: ${JSON.stringify({ kind: "workspace.revision", revision: currentRevision })}\n\n`,
        );
        client.revision = currentRevision;
      }
      if (Date.now() - client.ping > 15000) {
        client.res.write(": keepalive\n\n");
        client.ping = Date.now();
      }
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const denied = access(req, server.address().port);
      if (denied) fail(denied, 403);
      allowCanvasRequest(req, res);
      if (req.method === "OPTIONS") {
        if (!canvasOrigin(req)) fail("Same-origin request required.", 403);
        res.writeHead(204, {
          "Access-Control-Allow-Methods":
            "GET, HEAD, POST, PUT, PATCH, OPTIONS",
          "Access-Control-Allow-Headers":
            "Accept, Content-Type, If-Match, Last-Event-ID",
          "Access-Control-Max-Age": "600",
        });
        res.end();
        return;
      }
      const url = new URL(req.url, "http://" + req.headers.host),
        route = url.pathname,
        base = url.origin;
      if (route.startsWith("/openhands/")) {
        await proxyOpenHandsSurface(req, res, store, url);
        return;
      }
      if (draining && req.method !== "GET" && req.method !== "HEAD") {
        json(
          res,
          503,
          {
            error:
              "Web server is draining for an update. Retry after reconnecting.",
            retryable: true,
          },
          { "Retry-After": "2" },
        );
        return;
      }
      if (route === "/mcp") {
        if (req.method !== "POST") {
          res.writeHead(405, { Allow: "POST" });
          res.end();
          return;
        }
        mutation(req);
        const result = await handleMcp(await body(req), ops, {
          base,
          runId: url.searchParams.get("run"),
          runCapability: req.headers.authorization?.replace(/^Bearer\s+/i, ""),
          versionHeader: req.headers["mcp-protocol-version"],
        });
        flushOutbox(store, projectionRoot);
        res.writeHead(result.status, {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        });
        res.end(result.body === null ? "" : JSON.stringify(result.body));
        return;
      }
      if (
        req.method === "GET" &&
        ["/api/state", "/database.json", "/api/view-state"].includes(route)
      ) {
        const tag = etag();
        if (req.headers["if-none-match"] === tag) {
          res.writeHead(304, { ETag: tag });
          res.end();
        } else {
          const snapshot =
            route === "/api/view-state"
              ? viewSnapshot(store.read())
              : store.read();
          if (route === "/api/view-state" && workspaceName)
            snapshot.project = { ...snapshot.project, workspaceName };
          json(res, 200, snapshot, { ETag: tag });
        }
        return;
      }
      if (req.method === "GET" && route === "/api/document") {
        json(
          res,
          200,
          await ops.execute("document.get", { id: url.searchParams.get("id") }),
        );
        return;
      }
      if (req.method === "GET" && route === "/api/health") {
        json(res, 200, {
          ok: true,
          instanceId: runtimeId,
          pid: process.pid,
          application: "avoozl",
          applicationRoot,
          authority: dbPath,
          storage: "sqlite",
          mode: store.getMeta("mode"),
          listenHost: host,
          revision: store.read().revision,
          tasks: store.read().tasks.length,
          documents: Object.keys(store.read().documents).length,
        });
        return;
      }
      if (req.method === "GET" && route === "/api/workspace") {
        json(res, 200, await ops.execute("workspace"));
        return;
      }
      if (req.method === "GET" && route === "/api/queue") {
        json(
          res,
          200,
          await ops.execute("queue", Object.fromEntries(url.searchParams)),
        );
        return;
      }
      if (req.method === "GET" && route === "/api/query") {
        const tasks = await ops.execute(
          "query",
          Object.fromEntries(url.searchParams),
        );
        json(res, 200, {
          revision: store.read().revision,
          total: tasks.length,
          ...(url.searchParams.get("idsOnly") === "true"
            ? { ids: tasks.map((t) => t.id) }
            : { tasks }),
        });
        return;
      }
      if (req.method === "GET" && route === "/api/graph") {
        const nodes = await ops.execute(
            "query",
            Object.fromEntries(url.searchParams),
          ),
          ids = new Set(nodes.map((n) => n.id));
        json(res, 200, {
          revision: store.read().revision,
          nodes,
          tasks: nodes,
          edges: store
            .read()
            .edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
        });
        return;
      }
      if (req.method === "GET" && route === "/api/plan-summary") {
        json(res, 200, {
          revision: store.read().revision,
          plans: planSummaries(store.read())
            .filter(
              (p) =>
                url.searchParams.get("abandoned") === "true" ||
                p.status !== "abandoned",
            )
            .map(({ doc, tasks, ...p }) => ({
              ...p,
              id: doc.id,
              title: doc.title,
            })),
        });
        return;
      }
      if (req.method === "GET" && route === "/api/documents") {
        if (url.searchParams.get("idsOnly") === "true") {
          const q = (url.searchParams.get("q") || "").toLowerCase(),
            ids = Object.values(store.read().documents)
              .filter((d) =>
                (d.title + " " + d.path + " " + d.text)
                  .toLowerCase()
                  .includes(q),
              )
              .map((d) => d.id);
          json(res, 200, { ids, total: ids.length });
          return;
        }
        const data = store.read(),
          q = (url.searchParams.get("q") || "").toLowerCase(),
          include = url.searchParams.get("content") === "true",
          documents = Object.values(data.documents)
            .filter((d) =>
              (d.title + " " + d.path + " " + d.text).toLowerCase().includes(q),
            )
            .map((d) => ({
              ...d,
              text: include ? d.text : undefined,
              backlinks: Object.values(data.documents)
                .filter((other) => other.links?.includes(d.id))
                .map((other) => other.id),
              taskIds: data.tasks
                .filter(
                  (t) =>
                    t.source?.document === d.id ||
                    t.contextDocuments?.includes(d.id),
                )
                .map((t) => t.id),
            }));
        json(res, 200, {
          revision: data.revision,
          total: documents.length,
          documents,
        });
        return;
      }
      if (req.method === "GET" && route === "/api/events") {
        const after = Number(
          url.searchParams.get("after") || req.headers["last-event-id"] || 0,
        );
        if (!Number.isSafeInteger(after) || after < 0)
          fail("Invalid event cursor.");
        if (req.headers.accept !== "text/event-stream") {
          json(res, 200, {
            events: store.events({ after, runId: url.searchParams.get("run") }),
          });
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write(": connected\n\n");
        const client = {
          res,
          after,
          runId: url.searchParams.get("run"),
          compact: url.searchParams.get("compact") === "true",
          revision: store.read().revision,
          ping: Date.now(),
        };
        clients.add(client);
        pump();
        if (!eventTimer) eventTimer = setInterval(pump, 1000);
        res.on("close", () => {
          clients.delete(client);
          if (!clients.size) {
            clearInterval(eventTimer);
            eventTimer = null;
          }
        });
        return;
      }
      if (req.method === "POST" && route === "/api/command") {
        mutation(req);
        const { operation, input, expectedRevision } = await body(req);
        if (operation === "server.drain") {
          draining = true;
          store.setMeta(ownerKey, {
            ...store.getMeta(ownerKey),
            draining: true,
          });
          for (const client of clients) {
            client.res.write(
              "data: " + JSON.stringify({ kind: "server.draining" }) + "\n\n",
            );
            client.res.end();
          }
          clients.clear();
          json(res, 200, {
            ok: true,
            result: { draining: true },
            revision: store.read().revision,
          });
          setImmediate(() => server.close());
          return;
        }
        const result = await ops.execute(operation, input, expectedRevision);
        const publication = flushOutbox(store, projectionRoot);
        json(res, 200, {
          ok: true,
          revision: store.read().revision,
          result,
          publication,
        });
        return;
      }
      if (req.method === "POST" && route === "/api/openhands-surface") {
        mutation(req);
        const surface = mintOpenHandsSurface(store, (await body(req)).runId);
        json(res, 200, {
          host: base + "/openhands/" + encodeURIComponent(surface.runId),
          apiKey: surface.token,
          conversationId: surface.conversationId,
          expiresAt: surface.expiresAt,
        });
        return;
      }
      const compat = {
        "POST /api/task/prompt": "task.capture",
        "PATCH /api/task": "task.update",
        "POST /api/task": "task.update",
        "POST /api/activity": "activity",
        "PATCH /api/plan": "plan.classify",
        "PUT /api/document": "document.update",
      }[req.method + " " + route];
      if (compat) {
        mutation(req);
        const expected =
            compat === "document.update" ? undefined : revision(req),
          input = await body(req);
        if (req.method === "POST" && route === "/api/task") input.create = true;
        const result = await ops.execute(compat, input, expected);
        flushOutbox(store, projectionRoot);
        json(
          res,
          200,
          {
            ok: true,
            revision: store.read().revision,
            ...(compat === "task.capture"
              ? result
              : compat === "activity"
                ? result
                : { task: result }),
          },
          { ETag: etag() },
        );
        return;
      }
      if (!["GET", "HEAD"].includes(req.method))
        fail("Method not allowed.", 405);
      if (route.startsWith("/api/evidence/")) {
        const record = store.get(
          "evidence",
          decodeURIComponent(route.slice(14)),
        );
        if (!record) fail("Evidence not found.", 404);
        json(res, 200, record);
        return;
      }
      if (route === "/source") {
        const relative = url.searchParams.get("path") || "",
          doc = store.read().documents[relative];
        if (doc) {
          res.writeHead(200, { "Content-Type": MIME[".md"] });
          res.end(doc.text);
          return;
        }
        if (!relative.startsWith("evidence/")) fail("Source not found.", 404);
        const root = fs.realpathSync(sourceRoot || projectionRoot),
          candidate = path.resolve(root, relative),
          allowed = path.join(root, "evidence") + path.sep;
        if (!candidate.startsWith(allowed) || !fs.existsSync(candidate))
          fail("Source not found.", 404);
        const full = fs.realpathSync(candidate);
        if (!full.startsWith(allowed) || !fs.statSync(full).isFile())
          fail("Source not found.", 404);
        res.writeHead(200, {
          "Content-Type":
            path.extname(full) === ".json"
              ? MIME[".json"]
              : [".md", ".log", ".txt", ".lua", ".nupp", ".patch"].includes(
                    path.extname(full),
                  )
                ? "text/plain; charset=utf-8"
                : "application/octet-stream",
        });
        fs.createReadStream(full)
          .on("error", () => res.destroy())
          .pipe(res);
        return;
      }
      if (route.startsWith("/plans/")) {
        const id = decodeURIComponent(route.slice(7));
        if (!store.read().documents[id]) fail("Document not found.", 404);
        res.writeHead(302, {
          Location: "/?view=documents&document=" + encodeURIComponent(id),
        });
        res.end();
        return;
      }
      const reactIndex = path.join(webRoot, "index.html");
      if (
        (route === "/" || route === "/workspace") &&
        fs.existsSync(reactIndex)
      ) {
        const content = fs.readFileSync(reactIndex);
        res.writeHead(200, {
          "Content-Type": MIME[".html"],
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(req.method === "HEAD" ? "" : content);
        return;
      }
      if (route.startsWith("/assets/") && fs.existsSync(webRoot)) {
        const root = fs.realpathSync(webRoot),
          candidate = path.resolve(webRoot, "." + route);
        if (!candidate.startsWith(root + path.sep) || !fs.existsSync(candidate))
          fail("Not found.", 404);
        const full = fs.realpathSync(candidate);
        if (!full.startsWith(root + path.sep) || !fs.statSync(full).isFile())
          fail("Not found.", 404);
        res.writeHead(200, {
          "Content-Type":
            MIME[path.extname(full)] || "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        });
        if (req.method === "HEAD") res.end();
        else
          fs.createReadStream(full)
            .on("error", () => res.destroy())
            .pipe(res);
        return;
      }
      fail("Not found.", 404);
    } catch (error) {
      if (!res.headersSent)
        json(res, error.status || 400, {
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
      else res.end();
    }
  });
  installOpenHandsWebSocketProxy(server, store);
  server.listen(port, host, () => {
    manager.baseUrl = "http://127.0.0.1:" + server.address().port;
    console.log(
      "Avoozl: " + manager.baseUrl + " (SQLite " + store.getMeta("mode") + ")",
    );
  });
  if (githubPollMs > 0) {
    githubTimer = setInterval(async () => {
      if (
        draining ||
        githubSyncing ||
        (!store.list("github_repositories").length &&
          !store
            .list("receipts")
            .some(
              (receipt) =>
                receipt.id.startsWith("planning-pr:") &&
                !["projected", "closed"].includes(receipt.state),
            ))
      )
        return;
      githubSyncing = true;
      try {
        await ops.execute("planning.reconcile");
        await ops.execute("github.sync", { autoStart: true });
      } catch (error) {
        store.event(null, "github.sync.error", { message: error.message });
      } finally {
        githubSyncing = false;
      }
    }, githubPollMs);
    githubTimer.unref();
  }
  const release = () => {
    try {
      if (store.getMeta(ownerKey)?.id === runtimeId)
        store.setMeta(ownerKey, null);
    } finally {
      store.close();
    }
  };
  server.on("close", () => {
    stopSourceWatch();
    stopConfigurationWatch();
    clearInterval(eventTimer);
    clearInterval(githubTimer);
    for (const c of clients) c.res.end();
    manager.close().then(release);
  });
  server.on("error", () => {
    stopSourceWatch();
    stopConfigurationWatch();
    manager.close().then(release);
  });
  server.workspace = { store, ops, manager, configuration };
  server.drain = () => {
    draining = true;
    store.setMeta(ownerKey, { ...store.getMeta(ownerKey), draining: true });
    for (const client of clients) client.res.end();
    clients.clear();
    server.close();
  };
  flushOutbox(store, projectionRoot);
  return server;
}
