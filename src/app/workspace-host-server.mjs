import http from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { networkPolicy } from "./network.mjs";
import { handleMcp } from "./mcp.mjs";
import { ingestGitHubSnapshot } from "./github-intake.mjs";
import { viewSnapshot } from "./views.mjs";
import { fail } from "./store.mjs";
import { planSummaries } from "../plan-model.mjs";
import {
  installOpenHandsWebSocketProxy,
  mintOpenHandsSurface,
  proxyOpenHandsSurface,
} from "./openhands-surface.mjs";
import { flushOutbox } from "./server.mjs";

const JSON_LIMIT = 16 * 1024 * 1024;
const MCP_SESSION_TTL = 24 * 60 * 60 * 1000;
const MCP_SESSION_LIMIT = 10000;

function workspacePath(pathname) {
  const match = pathname.match(/^\/api\/workspaces\/([^/]+)(\/.*)?$/);
  if (!match) return null;
  let id;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    fail("Invalid workspace ID.", 400);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id))
    fail("Invalid workspace ID.", 400);
  return { id, tail: match[2] || "/" };
}

function runtimeParts(runtime) {
  const store = runtime?.store || runtime?.workspace?.store,
    ops = runtime?.ops || runtime?.workspace?.ops,
    manager = runtime?.manager || runtime?.workspace?.manager;
  if (!runtime || !store || !ops)
    fail("Workspace runtime is unavailable.", 503);
  return { store, ops, manager };
}

function workspaceEpoch(runtime, store) {
  return (
    runtime.instanceEpoch ||
    store.getMeta("instanceEpoch") ||
    store.getMeta("workspaceInstanceEpoch") ||
    1
  );
}

function workspaceHeaders(hostInstanceId, runtime, store) {
  return {
    "X-Avoozl-Host-Instance": hostInstanceId,
    "X-Avoozl-Workspace": runtime.id,
    "X-Avoozl-Workspace-Epoch": String(workspaceEpoch(runtime, store)),
  };
}

function responseMetadata(hostInstanceId, runtime, store) {
  return {
    workspaceId: runtime.id,
    hostInstanceId,
    workspaceInstanceEpoch: workspaceEpoch(runtime, store),
  };
}

function cursorFor(workspaceId, sequence) {
  return `${workspaceId}:${sequence}`;
}

function eventCursor(value, workspaceId) {
  if (value === undefined || value === null || value === "") return 0;
  if (/^\d+$/.test(String(value))) {
    const sequence = Number(value);
    if (!Number.isSafeInteger(sequence)) fail("Invalid event cursor.");
    return sequence;
  }
  const separator = String(value).lastIndexOf(":");
  if (separator < 1) fail("Invalid event cursor.");
  let encodedWorkspace;
  try {
    encodedWorkspace = decodeURIComponent(String(value).slice(0, separator));
  } catch {
    fail("Invalid event cursor.");
  }
  if (encodedWorkspace !== workspaceId)
    fail("Event cursor belongs to another workspace.", 409);
  const sequence = Number(String(value).slice(separator + 1));
  if (!Number.isSafeInteger(sequence) || sequence < 0)
    fail("Invalid event cursor.");
  return sequence;
}

async function requestBody(req, limit = JSON_LIMIT) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fail("Request too large.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    fail("JSON required.", 400);
  }
}

function requireJsonMutation(req, canvasOrigins) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    fail("JSON required.", 415);
  if (!req.headers.origin) return;
  const own = `http://${req.headers.host}`;
  if (req.headers.origin !== own && !canvasOrigins.has(req.headers.origin))
    fail("Same-origin request required.", 403);
}

function decorate(value, metadata) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ...metadata, result: value };
  return { ...value, ...metadata };
}

function normalizedWorkspaceList(raw, defaultWorkspace) {
  const items = Array.isArray(raw) ? raw : raw?.items || [];
  const result = {
    defaultWorkspace: raw?.defaultWorkspace || defaultWorkspace || null,
    items: items.map((item) => ({
      id: item.id,
      name: item.name || item.id,
      state: item.state || (item.enabled === false ? "stopped" : "closed"),
      enabled: item.enabled !== false,
      revision: item.revision ?? null,
      instanceEpoch: item.instanceEpoch ?? null,
      counts: {
        running: item.counts?.running || 0,
        blocked: item.counts?.blocked || 0,
        review: item.counts?.review || 0,
        queue: item.counts?.queue || 0,
      },
      concurrency: {
        limit: item.concurrency?.limit ?? item.concurrencyLimit ?? null,
        active: item.concurrency?.active || item.activeRuns || 0,
        queued:
          item.concurrency?.queued ??
          item.concurrency?.waiting ??
          item.queuedRuns ??
          0,
      },
      ...(item.error ? { error: item.error } : {}),
    })),
  };
  const hostConcurrency = raw?.hostConcurrency;
  if (hostConcurrency)
    result.hostConcurrency = {
      limit: hostConcurrency.limit ?? hostConcurrency.maxConcurrentRuns,
      active: hostConcurrency.active ?? hostConcurrency.running ?? 0,
    };
  return result;
}

async function hostWorkspaceList(workspaceManager) {
  const listed = normalizedWorkspaceList(
    await workspaceManager.list(),
    workspaceManager.defaultWorkspaceId,
  );
  if (
    !listed.hostConcurrency &&
    typeof workspaceManager.scheduler?.status === "function"
  ) {
    const status = workspaceManager.scheduler.status();
    listed.hostConcurrency = {
      limit: status.maxConcurrentRuns,
      active: status.running,
    };
  }
  return listed;
}

async function openWorkspace(workspaceManager, id) {
  try {
    return await workspaceManager.open(id);
  } catch (error) {
    if (
      !error.status &&
      /not (?:found|registered)|unknown workspace/i.test(error.message)
    )
      error.status = 404;
    throw error;
  }
}

function workspaceHealth(runtime, store, hostInstanceId) {
  const snapshot = store.read();
  return {
    ok: runtime.state !== "quarantined",
    application: "avoozl",
    mode: store.getMeta("mode"),
    state: runtime.state || "ready",
    revision: snapshot.revision,
    tasks: snapshot.tasks.length,
    documents: Object.keys(snapshot.documents).length,
    ...responseMetadata(hostInstanceId, runtime, store),
  };
}

function sourceRoot(runtime) {
  return (
    runtime.sourceRoot ||
    runtime.projectionRoot ||
    runtime.config?.plansRoot ||
    runtime.config?.documentsRoot ||
    null
  );
}

function publishOutbox(runtime, store) {
  const root = runtime.projectionRoot || runtime.config?.plansRoot;
  return root ? flushOutbox(store, root) : [];
}

function hostMcpResult(message, list, base) {
  const id = message?.id,
    ok = (result) => ({
      status: 200,
      body: { jsonrpc: "2.0", id, result },
    }),
    tools = [
      {
        name: "avoozl_list_workspaces",
        description:
          "List registered Avoozl workspaces. This discovery operation is read-only.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
      },
      {
        name: "avoozl_select_workspace",
        description:
          "Resolve a registered workspace to its immutable MCP endpoint. This does not grant access or change another connection.",
        inputSchema: {
          type: "object",
          properties: { workspaceId: { type: "string" } },
          required: ["workspaceId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
      },
    ];
  if (message?.method === "initialize")
    return ok({
      protocolVersion: "2025-11-25",
      capabilities: { tools: {} },
      serverInfo: { name: "avoozl-host", version: "1.0.0" },
    });
  if (message?.method === "notifications/initialized")
    return { status: 202, body: null };
  if (message?.method === "tools/list") return ok({ tools });
  if (message?.method === "tools/call") {
    const name = message.params?.name;
    if (name === "avoozl_list_workspaces")
      return ok({
        content: [{ type: "text", text: JSON.stringify(list) }],
        structuredContent: list,
      });
    if (name === "avoozl_select_workspace") {
      const workspaceId = message.params?.arguments?.workspaceId,
        exists = list.items.some((item) => item.id === workspaceId);
      if (!exists)
        return ok({
          isError: true,
          content: [{ type: "text", text: "Workspace not found." }],
        });
      const selected = {
        workspaceId,
        mcpUrl:
          base + "/api/workspaces/" + encodeURIComponent(workspaceId) + "/mcp",
      };
      return ok({
        content: [{ type: "text", text: JSON.stringify(selected) }],
        structuredContent: selected,
      });
    }
  }
  return ok({
    isError: true,
    content: [{ type: "text", text: "Unsupported host MCP operation." }],
  });
}

export function startWorkspaceHostServer({
  workspaceManager,
  port = 9428,
  host = "127.0.0.1",
  allowedHosts = [],
  canvasOrigins = [],
  hostInstanceId = randomUUID(),
} = {}) {
  if (!workspaceManager?.open || !workspaceManager?.list)
    fail("A WorkspaceManager is required.");
  const origins = new Set(canvasOrigins.map((value) => new URL(value).origin)),
    access = networkPolicy({
      host,
      allowedHosts,
      allowedOrigins: [...origins],
    }),
    eventClients = new Set(),
    openedRuntimes = new Map(),
    mcpSessions = new Map();

  const sendJson = (res, status, value, headers = {}) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    res.end(JSON.stringify(value));
  };

  const server = http.createServer(async (req, res) => {
    try {
      const denied = access(req, server.address().port);
      if (denied) fail(denied, 403);
      if (req.headers.origin && origins.has(req.headers.origin)) {
        res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
        res.setHeader(
          "Access-Control-Expose-Headers",
          "MCP-Session-Id, X-Avoozl-Host-Instance, X-Avoozl-Workspace, X-Avoozl-Workspace-Epoch",
        );
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        if (!req.headers.origin || !origins.has(req.headers.origin))
          fail("Same-origin request required.", 403);
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Accept, Authorization, Content-Type, If-Match, Last-Event-ID, MCP-Protocol-Version, MCP-Session-Id, X-Avoozl-Intake-Version, X-Session-API-Key",
          "Access-Control-Max-Age": "600",
        });
        res.end();
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host}`),
        requested = workspacePath(url.pathname);
      if (req.method === "GET" && url.pathname === "/api/workspaces") {
        const listed = await hostWorkspaceList(workspaceManager);
        sendJson(res, 200, { hostInstanceId, ...listed });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/workspaces") {
        requireJsonMutation(req, origins);
        if (typeof workspaceManager.add !== "function")
          fail("Workspace registration is unavailable.", 503);
        const result = await workspaceManager.add(await requestBody(req));
        sendJson(res, 201, {
          ok: true,
          hostInstanceId,
          workspaceId: result.id,
          result,
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/workspaces/default") {
        requireJsonMutation(req, origins);
        const { workspaceId } = await requestBody(req),
          result = await workspaceManager.setDefault(workspaceId);
        sendJson(res, 200, {
          ok: true,
          hostInstanceId,
          defaultWorkspace: workspaceManager.defaultWorkspaceId,
          result,
        });
        return;
      }
      if (req.method === "POST" && requested?.tail === "/lifecycle") {
        requireJsonMutation(req, origins);
        const { action } = await requestBody(req),
          method = {
            start: "start",
            drain: "drain",
            resume: "resume",
            stop: "stop",
            remove: "remove",
          }[action];
        if (!method || typeof workspaceManager[method] !== "function")
          fail("Choose start, drain, resume, stop or remove.", 400);
        const result = await workspaceManager[method](requested.id);
        sendJson(res, 200, {
          ok: true,
          hostInstanceId,
          workspaceId: requested.id,
          result,
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/mcp/host") {
        requireJsonMutation(req, origins);
        const listed = await hostWorkspaceList(workspaceManager),
          result = hostMcpResult(
            await requestBody(req),
            { hostInstanceId, ...listed },
            url.origin,
          );
        sendJson(res, result.status, result.body);
        return;
      }
      if (req.method === "GET" && requested?.tail === "/") {
        if (typeof workspaceManager.describe !== "function")
          fail("Workspace details are unavailable.", 503);
        const detail = await workspaceManager.describe(requested.id);
        sendJson(
          res,
          200,
          {
            ...detail,
            hostInstanceId,
            workspaceId: requested.id,
            workspaceInstanceEpoch: detail.instanceEpoch ?? null,
          },
          {
            "X-Avoozl-Host-Instance": hostInstanceId,
            "X-Avoozl-Workspace": requested.id,
            ...(detail.instanceEpoch
              ? {
                  "X-Avoozl-Workspace-Epoch": String(detail.instanceEpoch),
                }
              : {}),
          },
        );
        return;
      }

      const route = requested?.tail || url.pathname,
        mcpRequest =
          req.method === "POST" && ["/mcp", "/api/mcp"].includes(route),
        sessionHeader = req.headers["mcp-session-id"];
      if (
        Array.isArray(sessionHeader) ||
        String(sessionHeader || "").length > 256
      )
        fail("Invalid MCP session.", 400);
      const session =
        mcpRequest && sessionHeader
          ? mcpSessions.get(String(sessionHeader))
          : null;
      if (mcpRequest && sessionHeader && !session)
        fail("MCP session not found.", 404);
      if (session && requested?.id && requested.id !== session.workspaceId)
        fail("MCP session belongs to another workspace.", 409);
      const workspaceId =
        session?.workspaceId ||
        requested?.id ||
        workspaceManager.defaultWorkspaceId;
      if (!workspaceId) fail("No default workspace is configured.", 503);
      const runtime = await openWorkspace(workspaceManager, workspaceId),
        { store, ops, manager } = runtimeParts(runtime),
        metadata = responseMetadata(hostInstanceId, runtime, store),
        headers = workspaceHeaders(hostInstanceId, runtime, store),
        qualified = Boolean(requested);
      openedRuntimes.set(workspaceId, runtime);

      if (
        requested?.tail.startsWith("/openhands/") ||
        requested?.tail.startsWith("/api/openhands/")
      ) {
        const upstreamUrl = new URL(url);
        upstreamUrl.pathname = requested.tail.replace(/^\/api/, "");
        await proxyOpenHandsSurface(req, res, store, upstreamUrl, {
          mountPath:
            "/api/workspaces/" + encodeURIComponent(workspaceId) + "/openhands",
        });
        return;
      }

      if (
        req.method === "GET" &&
        ["/health", "/api/health"].includes(requested?.tail || url.pathname)
      ) {
        sendJson(
          res,
          200,
          workspaceHealth(runtime, store, hostInstanceId),
          headers,
        );
        return;
      }
      if (
        req.method === "GET" &&
        ["/workspace", "/api/workspace"].includes(
          requested?.tail || url.pathname,
        )
      ) {
        const result = await ops.execute("workspace");
        sendJson(
          res,
          200,
          qualified ? decorate(result, metadata) : result,
          headers,
        );
        return;
      }
      if (
        req.method === "GET" &&
        ["/view-state", "/api/view-state"].includes(
          requested?.tail || url.pathname,
        )
      ) {
        const result = viewSnapshot(store.read());
        if (runtime.name)
          result.project = { ...result.project, workspaceName: runtime.name };
        sendJson(
          res,
          200,
          qualified ? decorate(result, metadata) : result,
          headers,
        );
        return;
      }
      if (
        req.method === "GET" &&
        ["/state", "/database.json", "/api/state"].includes(
          requested?.tail || url.pathname,
        )
      ) {
        const result = structuredClone(store.read());
        sendJson(
          res,
          200,
          qualified ? decorate(result, metadata) : result,
          headers,
        );
        return;
      }

      if (
        req.method === "GET" &&
        ["/document", "/api/document"].includes(requested?.tail || url.pathname)
      ) {
        const result = await ops.execute("document.get", {
          id: url.searchParams.get("id"),
        });
        sendJson(
          res,
          200,
          qualified ? decorate(result, metadata) : result,
          headers,
        );
        return;
      }
      if (
        req.method === "GET" &&
        ["/queue", "/api/queue"].includes(requested?.tail || url.pathname)
      ) {
        const result = await ops.execute(
          "queue",
          Object.fromEntries(url.searchParams),
        );
        sendJson(
          res,
          200,
          qualified ? decorate(result, metadata) : result,
          headers,
        );
        return;
      }
      if (
        req.method === "GET" &&
        ["/query", "/api/query"].includes(requested?.tail || url.pathname)
      ) {
        const tasks = await ops.execute(
            "query",
            Object.fromEntries(url.searchParams),
          ),
          result = {
            revision: store.read().revision,
            total: tasks.length,
            ...(url.searchParams.get("idsOnly") === "true"
              ? { ids: tasks.map((task) => task.id) }
              : { tasks }),
          };
        sendJson(
          res,
          200,
          qualified ? decorate(result, metadata) : result,
          headers,
        );
        return;
      }
      if (
        req.method === "GET" &&
        ["/graph", "/api/graph"].includes(requested?.tail || url.pathname)
      ) {
        const nodes = await ops.execute(
            "query",
            Object.fromEntries(url.searchParams),
          ),
          ids = new Set(nodes.map((node) => node.id)),
          result = {
            revision: store.read().revision,
            nodes,
            tasks: nodes,
            edges: store
              .read()
              .edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
          };
        sendJson(
          res,
          200,
          qualified ? decorate(result, metadata) : result,
          headers,
        );
        return;
      }
      if (
        req.method === "GET" &&
        ["/plan-summary", "/api/plan-summary"].includes(
          requested?.tail || url.pathname,
        )
      ) {
        const result = {
          revision: store.read().revision,
          plans: planSummaries(store.read())
            .filter(
              (plan) =>
                url.searchParams.get("abandoned") === "true" ||
                plan.status !== "abandoned",
            )
            .map(({ doc, tasks, ...plan }) => ({
              ...plan,
              id: doc.id,
              title: doc.title,
            })),
        };
        sendJson(
          res,
          200,
          qualified ? decorate(result, metadata) : result,
          headers,
        );
        return;
      }
      if (
        req.method === "GET" &&
        ["/documents", "/api/documents"].includes(
          requested?.tail || url.pathname,
        )
      ) {
        const data = store.read(),
          q = (url.searchParams.get("q") || "").toLowerCase();
        if (url.searchParams.get("idsOnly") === "true") {
          const ids = Object.values(data.documents)
            .filter((document) =>
              (document.title + " " + document.path + " " + document.text)
                .toLowerCase()
                .includes(q),
            )
            .map((document) => document.id);
          const result = { ids, total: ids.length };
          sendJson(
            res,
            200,
            qualified ? decorate(result, metadata) : result,
            headers,
          );
          return;
        }
        const include = url.searchParams.get("content") === "true",
          documents = Object.values(data.documents)
            .filter((document) =>
              (document.title + " " + document.path + " " + document.text)
                .toLowerCase()
                .includes(q),
            )
            .map((document) => ({
              ...document,
              text: include ? document.text : undefined,
              backlinks: Object.values(data.documents)
                .filter((other) => other.links?.includes(document.id))
                .map((other) => other.id),
              taskIds: data.tasks
                .filter(
                  (task) =>
                    task.source?.document === document.id ||
                    task.contextDocuments?.includes(document.id),
                )
                .map((task) => task.id),
            })),
          result = {
            revision: data.revision,
            total: documents.length,
            documents,
          };
        sendJson(
          res,
          200,
          qualified ? decorate(result, metadata) : result,
          headers,
        );
        return;
      }

      const evidenceMatch = (requested?.tail || url.pathname).match(
        /^\/(?:api\/)?evidence\/([^/]+)$/,
      );
      if (req.method === "GET" && evidenceMatch) {
        const record = store.get(
          "evidence",
          decodeURIComponent(evidenceMatch[1]),
        );
        if (!record) fail("Evidence not found.", 404);
        sendJson(
          res,
          200,
          qualified ? decorate(record, metadata) : record,
          headers,
        );
        return;
      }
      if (
        req.method === "GET" &&
        ["/source", "/api/source"].includes(requested?.tail || url.pathname)
      ) {
        const relative = url.searchParams.get("path") || "",
          document = store.read().documents[relative];
        if (document) {
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            ...headers,
          });
          res.end(document.text);
          return;
        }
        const root = sourceRoot(runtime);
        if (!root || !relative.startsWith("evidence/"))
          fail("Source not found.", 404);
        const realRoot = fs.realpathSync(root),
          candidate = path.resolve(realRoot, relative),
          allowed = path.join(realRoot, "evidence") + path.sep;
        if (!candidate.startsWith(allowed) || !fs.existsSync(candidate))
          fail("Source not found.", 404);
        const full = fs.realpathSync(candidate);
        if (!full.startsWith(allowed) || !fs.statSync(full).isFile())
          fail("Source not found.", 404);
        res.writeHead(200, {
          "Content-Type":
            path.extname(full) === ".json"
              ? "application/json; charset=utf-8"
              : "text/plain; charset=utf-8",
          ...headers,
        });
        fs.createReadStream(full)
          .on("error", () => res.destroy())
          .pipe(res);
        return;
      }

      const operationMatch = requested?.tail.match(/^\/operations\/([^/]+)$/);
      if (req.method === "POST" && operationMatch) {
        requireJsonMutation(req, origins);
        const operation = decodeURIComponent(operationMatch[1]),
          payload = await requestBody(req),
          input = Object.hasOwn(payload, "input") ? payload.input : payload;
        const result =
          operation === "workspace.concurrency.configure"
            ? await workspaceManager.setConcurrency(workspaceId, input.limit)
            : await ops.execute(
                operation,
                input || {},
                payload.expectedRevision,
              );
        const publication = publishOutbox(runtime, store);
        sendJson(
          res,
          200,
          {
            ok: true,
            revision: store.read().revision,
            result,
            publication,
            ...metadata,
          },
          headers,
        );
        return;
      }
      if (
        req.method === "POST" &&
        ["/command", "/api/command"].includes(requested?.tail || url.pathname)
      ) {
        requireJsonMutation(req, origins);
        const input = await requestBody(req),
          result =
            input.operation === "workspace.concurrency.configure"
              ? await workspaceManager.setConcurrency(
                  workspaceId,
                  input.input?.limit,
                )
              : await ops.execute(
                  input.operation,
                  input.input || {},
                  input.expectedRevision,
                ),
          publication = publishOutbox(runtime, store);
        sendJson(
          res,
          200,
          {
            ok: true,
            revision: store.read().revision,
            result,
            publication,
            ...(qualified ? metadata : {}),
          },
          headers,
        );
        return;
      }
      if (
        req.method === "POST" &&
        ["/openhands-surface", "/api/openhands-surface"].includes(
          requested?.tail || url.pathname,
        )
      ) {
        requireJsonMutation(req, origins);
        const surface = mintOpenHandsSurface(
          store,
          (await requestBody(req)).runId,
        );
        const mount =
          url.origin +
          "/api/workspaces/" +
          encodeURIComponent(workspaceId) +
          "/openhands/" +
          encodeURIComponent(surface.runId);
        sendJson(
          res,
          200,
          {
            host: mount,
            apiKey: surface.token,
            conversationId: surface.conversationId,
            expiresAt: surface.expiresAt,
            ...(qualified ? metadata : {}),
          },
          headers,
        );
        return;
      }

      const compat = {
        "POST /task/prompt": "task.capture",
        "POST /api/task/prompt": "task.capture",
        "PATCH /task": "task.update",
        "PATCH /api/task": "task.update",
        "POST /task": "task.update",
        "POST /api/task": "task.update",
        "POST /activity": "activity",
        "POST /api/activity": "activity",
        "PATCH /plan": "plan.classify",
        "PATCH /api/plan": "plan.classify",
        "PUT /document": "document.update",
        "PUT /api/document": "document.update",
      }[req.method + " " + (requested?.tail || url.pathname)];
      if (compat) {
        requireJsonMutation(req, origins);
        const expected =
            compat === "document.update"
              ? undefined
              : (() => {
                  const etag = `"workspace-${store.read().revision}"`;
                  if (req.headers["if-match"] !== etag)
                    fail(
                      "Database changed. Reload and review before saving.",
                      409,
                    );
                  return store.read().revision;
                })(),
          input = await requestBody(req);
        if (
          req.method === "POST" &&
          ["/task", "/api/task"].includes(requested?.tail || url.pathname)
        )
          input.create = true;
        const result = await ops.execute(compat, input, expected),
          publication = publishOutbox(runtime, store),
          response =
            compat === "task.capture" || compat === "activity"
              ? result
              : { task: result };
        sendJson(
          res,
          200,
          {
            ok: true,
            revision: store.read().revision,
            ...response,
            publication,
            ...(qualified ? metadata : {}),
          },
          {
            ...headers,
            ETag: `"workspace-${store.read().revision}"`,
          },
        );
        return;
      }
      if (
        req.method === "POST" &&
        ["/mcp", "/api/mcp"].includes(requested?.tail || url.pathname)
      ) {
        requireJsonMutation(req, origins);
        const message = await requestBody(req),
          result = await handleMcp(message, ops, {
            base: qualified
              ? url.origin +
                "/api/workspaces/" +
                encodeURIComponent(workspaceId)
              : url.origin,
            runId: url.searchParams.get("run"),
            runCapability: req.headers.authorization?.replace(
              /^Bearer\s+/i,
              "",
            ),
            versionHeader: req.headers["mcp-protocol-version"],
            workspaceId,
          });
        let mcpSessionId = sessionHeader ? String(sessionHeader) : null;
        if (
          !mcpSessionId &&
          message?.method === "initialize" &&
          result.status === 200
        ) {
          const cutoff = Date.now() - MCP_SESSION_TTL;
          for (const [id, candidate] of mcpSessions)
            if (candidate.updatedAt < cutoff) mcpSessions.delete(id);
          if (mcpSessions.size >= MCP_SESSION_LIMIT)
            fail("Too many active MCP sessions.", 503);
          mcpSessionId = randomUUID();
          mcpSessions.set(mcpSessionId, {
            workspaceId,
            updatedAt: Date.now(),
          });
        } else if (mcpSessionId) {
          session.updatedAt = Date.now();
        }
        res.writeHead(result.status, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-cache",
          ...(mcpSessionId ? { "MCP-Session-Id": mcpSessionId } : {}),
          ...headers,
        });
        res.end(result.body === null ? "" : JSON.stringify(result.body));
        return;
      }
      if (
        req.method === "POST" &&
        ["/github-intake", "/api/github-intake"].includes(
          requested?.tail || url.pathname,
        )
      ) {
        requireJsonMutation(req, origins);
        if (req.headers["x-avoozl-intake-version"] !== "2")
          fail("Unsupported GitHub intake protocol version.", 400);
        const result = await ingestGitHubSnapshot(
          store,
          ops.github,
          req.headers.authorization?.replace(/^Bearer\s+/i, ""),
          await requestBody(req, 2 * 1024 * 1024),
        );
        sendJson(
          res,
          200,
          qualified ? decorate(result, metadata) : result,
          headers,
        );
        return;
      }
      if (
        req.method === "GET" &&
        ["/events", "/api/events"].includes(requested?.tail || url.pathname)
      ) {
        const after = eventCursor(
            url.searchParams.get("after") || req.headers["last-event-id"],
            workspaceId,
          ),
          runId = url.searchParams.get("run");
        if (req.headers.accept !== "text/event-stream") {
          const events = store
              .events({ after, runId })
              .map((event) => ({ workspaceId, ...event })),
            last = events.at(-1)?.seq || after;
          sendJson(
            res,
            200,
            {
              events,
              cursor: cursorFor(workspaceId, last),
              ...(qualified ? metadata : {}),
            },
            headers,
          );
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
          ...headers,
        });
        res.write(": connected\n\n");
        const client = {
          res,
          runtime,
          store,
          workspaceId,
          runId,
          after,
          revision: store.read().revision,
          ping: Date.now(),
          releaseWorkspace: workspaceManager.retain?.(workspaceId),
        };
        eventClients.add(client);
        req.on("close", () => {
          eventClients.delete(client);
          client.releaseWorkspace?.();
        });
        return;
      }
      fail("Not found.", 404);
    } catch (error) {
      if (!res.headersSent)
        sendJson(res, error.status || 400, {
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
      else res.end();
    }
  });

  const pump = setInterval(() => {
    for (const client of eventClients) {
      try {
        const events = client.store.events({
          after: client.after,
          runId: client.runId,
        });
        for (const event of events) {
          client.res.write(
            `id: ${cursorFor(client.workspaceId, event.seq)}\ndata: ${JSON.stringify({ workspaceId: client.workspaceId, ...event })}\n\n`,
          );
          client.after = event.seq;
        }
        const revision = client.store.read().revision;
        if (!client.runId && revision !== client.revision) {
          client.res.write(
            `data: ${JSON.stringify({ kind: "workspace.revision", workspaceId: client.workspaceId, revision })}\n\n`,
          );
          client.revision = revision;
        }
        if (Date.now() - client.ping > 15000) {
          client.res.write(": keepalive\n\n");
          client.ping = Date.now();
        }
      } catch {
        client.res.end();
        client.releaseWorkspace?.();
        eventClients.delete(client);
      }
    }
  }, 1000);
  pump.unref();

  installOpenHandsWebSocketProxy(server, null, {
    resolve(url) {
      const requested = workspacePath(url.pathname);
      if (!requested?.tail.startsWith("/openhands/")) return null;
      const runtime = openedRuntimes.get(requested.id);
      if (!runtime) return null;
      const rewritten = new URL(url);
      rewritten.pathname = requested.tail;
      return { store: runtimeParts(runtime).store, url: rewritten };
    },
  });

  server.listen(port, host, () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    if (typeof workspaceManager.setHostBaseUrl === "function")
      workspaceManager.setHostBaseUrl(base);
    else
      for (const runtime of workspaceManager.runtimes?.values?.() || []) {
        const parts = runtimeParts(runtime);
        if (parts.manager)
          parts.manager.baseUrl =
            base + "/api/workspaces/" + encodeURIComponent(runtime.id);
      }
  });
  server.hostInstanceId = hostInstanceId;
  server.workspaceManager = workspaceManager;
  server.on("close", () => {
    clearInterval(pump);
    for (const client of eventClients) client.res.end();
    eventClients.clear();
    mcpSessions.clear();
  });
  return server;
}
