// Avoozl's Kiro Crew app backend. Kiro Crew's gateway proxies the app page's
// API here and signs each request with a principal claim (`signedPrincipal`).
// The backend binds loopback only. Any local process can reach that socket,
// so every route except the gateway's unsigned health probe verifies the claim
// and refuses with 401 when it is missing, stale, replayed, or forged.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Store } from "./store.mjs";
import { Operations } from "./operations.mjs";
import { CLIENT_OPERATIONS } from "./client.mjs";
import { classifyOperation } from "./operation-kinds.mjs";
import { workspaceConfig } from "./config.mjs";
import { WorkspaceRegistry } from "./host-config.mjs";
import { initializeWorkspace } from "./workspace.mjs";
import { gatewayPusher } from "./notifications.mjs";
import {
  gatewaySlotReader,
  gatewaySlotRows,
  gatewayUsageTurns,
  observeSessions,
  observeRetroReplies,
  observeRouterReplies,
  observeToolRows,
} from "./session-observer.mjs";
import { declaredChecks } from "./delivery.mjs";
import { observeUsage } from "./flow-usage.mjs";
import { gatewayClient } from "./gateway-client.mjs";
import {
  applySwitches,
  gatewayModelSwitcher,
  refreshHealth,
} from "./provider-health.mjs";
import { choiceModels, routingContext } from "./routing.mjs";
import { taskRepository } from "../work-model.mjs";
import { issueRadarReader } from "./radar-handoff.mjs";
import { tickHealth } from "./tick.mjs";

export const PRINCIPAL_HEADER = "x-kirocrew-principal";
const HOST = "127.0.0.1";
const DOMAIN = "kirocrew-proxy-principal-v1";
const MAX_SKEW_SECONDS = 60;
const MAX_HEADER_BYTES = 4096;
const MAX_BODY_BYTES = 1024 * 1024;
// The gateway's proxy keeps idle connections in an aiohttp pool for 15 s
// (aiohttp's default) and does not retry a POST that fails on a reused one.
// Node closes an idle connection after 5 s, so a request sent as that close
// lands reads as a reset, and the page shows "backend unreachable". Idle
// connections outlive the pool, so the gateway is always the side that closes.
export const KEEP_ALIVE_MS = 65_000;
const KINDS = new Set(["owner-session", "app-token", "agent-tool", "none"]);
const CLAIM_KEYS = ["issuedAt", "kind", "ownerId", "requestId", "version"];
const REQUEST_ID = /^[0-9a-f]{32}$/;

// One cache per backend process: each accepted request ID is refused again
// until its freshness window closes. A full cache refuses rather than evicting
// a live ID, because eviction would make that request replayable.
export class ReplayCache {
  constructor(maxEntries = 4096) {
    this.maxEntries = maxEntries;
    this.seen = new Map();
  }
  accept(requestId, expiresAt, now) {
    for (const [id, expiry] of this.seen)
      if (expiry < now) this.seen.delete(id);
    if (this.seen.has(requestId) || this.seen.size >= this.maxEntries)
      return false;
    this.seen.set(requestId, expiresAt);
    return true;
  }
}

function decodeClaim(encoded) {
  let claim;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
    claim = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) return null;
  if (Object.keys(claim).sort().join() !== CLAIM_KEYS.join()) return null;
  const { version, kind, ownerId, issuedAt, requestId } = claim;
  if (version !== 1 || typeof kind !== "string" || !KINDS.has(kind))
    return null;
  if (!Number.isSafeInteger(issuedAt)) return null;
  if (
    typeof ownerId !== "string" ||
    ownerId.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(ownerId)
  )
    return null;
  // Only an owner session names an owner.
  if ((kind === "owner-session") !== Boolean(ownerId)) return null;
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) return null;
  return claim;
}

// Verify one X-KiroCrew-Principal value against Kiro Crew's contract
// (kiro_crew/apps/proxy_auth.py `verify_proxy_principal_claim`): base64url
// canonical JSON claim, a period, and an HMAC-SHA256 over the domain tag, issue
// time, method, request-target, body digest, and encoded claim. Returns the
// claim or null. Fails closed without a secret.
export function verifyPrincipal(
  header,
  { method, target, body = Buffer.alloc(0), secret, replay, now = Date.now() },
) {
  if (!secret || !replay || typeof header !== "string") return null;
  if (Buffer.byteLength(header) > MAX_HEADER_BYTES) return null;
  const dot = header.lastIndexOf(".");
  if (dot <= 0 || dot === header.length - 1) return null;
  const encoded = header.slice(0, dot),
    signature = header.slice(dot + 1),
    claim = decodeClaim(encoded);
  if (!claim) return null;
  const clock = now / 1000;
  if (Math.abs(clock - claim.issuedAt) > MAX_SKEW_SECONDS) return null;
  const expected = createHmac("sha256", secret)
    .update(
      [
        DOMAIN,
        String(claim.issuedAt),
        method,
        target,
        createHash("sha256").update(body).digest("hex"),
        encoded,
      ].join("\n"),
    )
    .digest("hex");
  const given = Buffer.from(signature, "utf8"),
    wanted = Buffer.from(expected, "utf8");
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted))
    return null;
  if (!replay.accept(claim.requestId, claim.issuedAt + MAX_SKEW_SECONDS, clock))
    return null;
  return claim;
}

// The page also runs the tick, reads its health, reads the Graph,
// Delivery and Conflicts views, edits the GitHub settings, and runs Set up GitHub. The cron and agents reach `workspace.tick`
// through the MCP server instead.
const APP_OPERATIONS = new Set([
  ...CLIENT_OPERATIONS,
  "workspace.tick",
  "workspace.tick.health",
  "workspace.tick.log",
  "highlight.languages",
  "activity.recent",
  "activity.list",
  "activity.settings.get",
  "activity.settings.update",
  "chat.context",
  "graph.view",
  "delivery.view",
  "conflicts.view",
  "untriaged.view",
  "intake.list",
  "intake.view",
  "intake.sources",
  "intake.deliver",
  "intake.confirm",
  "intake.plan",
  "intake.source.add",
  "intake.source.remove",
  "flow.view",
  "untriaged.crews",
  "untriaged.handoff",
  "review.chat",
  "github.repository.labels",
  "task.detail",
  "plan.spec.read",
  "plan.table",
  "plan.new",
  "github.repository.inspect",
  "task.change.preview",
  "plugins.list",
  "plugin.preview",
  "plugin.add",
  "plugin.approve",
  "plugin.disable",
  "plugin.remove",
  "plugin.update",
  "plugin.pack.preview",
  "plugin.pack.import",
  "route.cancel",
  "route.resubmit",
  "tracker.takeBack",
  // Owner actions the Conflicts and Delivery views offer.
  "content.rules",
  "content.allow",
  "content.show",
  "content.terms.get",
  "content.terms.update",
  "content.sets.update",
  "github.conflict.resolve",
  "conflicts.settle",
  "delivery.retry",
  "task.start",
  "flow.runAnyway",
  "flow.stop",
  "flow.resume",
  "flow.settings.get",
  "flow.settings.update",
  "routing.view",
  "routing.preview",
  "routing.update",
  "crews.update",
  "providers.view",
  "provider.switch.preview",
  "provider.switch",
  "provider.health.clear",
  "providers.settings.update",
  "delivery.pickAgain",
  "delivery.settings.get",
  "delivery.settings.update",
  "flow.instructions.update",
  "flow.retro.decide",
  "flow.retro.start",
  "github.settings.get",
  "github.trigger.preview",
  "github.settings.validate",
  "github.settings.update",
  "github.setup",
  "github.setup.cancel",
  // The Onboard flow's reads; its writes are the operations above.
  "onboarding.inspect",
  "onboarding.scan",
  "plan.issues.preview",
  "plan.delete",
  "plan.delete.preview",
  "plan.archive",
  "plan.unarchive",
]);
// Machine-catalog operations, served by this backend rather than a workspace.
const MACHINE_OPERATIONS = new Map([
  ["workspaces.list", "observe"],
  ["workspaces.add", "write"],
  ["workspaces.init", "write"],
]);

// Action-level authorization. The dashboard owner may call any app operation.
// App tokens and agent tools are authenticated but act for no person, so they
// may only observe; their writes go through the MCP server.
export function principalAllows(claim, operation) {
  const kind =
    MACHINE_OPERATIONS.get(operation) ||
    (APP_OPERATIONS.has(operation) ? classifyOperation(operation) : null);
  if (!kind) return false;
  if (claim.kind === "owner-session") return true;
  if (claim.kind === "app-token" || claim.kind === "agent-tool")
    return kind === "observe";
  return false;
}

const offered = (operation) =>
  MACHINE_OPERATIONS.has(operation) || APP_OPERATIONS.has(operation);

function badRequest(message, status = 400) {
  const error = Error(message);
  error.status = status;
  return error;
}

function sameDirectory(a, b) {
  try {
    return fs.realpathSync.native(a) === fs.realpathSync.native(b);
  } catch {
    return false;
  }
}

// Workspace list, add, and init over the machine catalog. Registry errors are
// path and identity validation for the owner's own input, so they return 400.
function machineOperation(registry, config, operation, input) {
  try {
    registry.reload();
    if (operation === "workspaces.list")
      return {
        defaultWorkspace: registry.config.defaultWorkspace || null,
        items: registry.list().map((workspace) => ({
          ...workspace,
          served: sameDirectory(workspace.root, config.workspaceRoot),
        })),
      };
    const id = String(input.id || "").trim(),
      root = String(input.root || "").trim(),
      name = String(input.name || "").trim() || undefined;
    if (!path.isAbsolute(root))
      throw badRequest("Choose an absolute workspace directory.");
    if (registry.config.workspaces[id])
      throw badRequest(`Workspace ${id} is already registered.`, 409);
    if (operation === "workspaces.init") initializeWorkspace(root, { name });
    return registry.add(id, { root, name });
  } catch (error) {
    if (!Number.isInteger(error.status)) error.status = 400;
    throw error;
  }
}

function send(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Start the backend on 127.0.0.1. There is no host option: the gateway is the
// only intended caller, and it reaches the backend over loopback.
export function startAppBackend({
  config,
  port = 0,
  secret = process.env.KIROCREW_PROXY_SECRET || "",
  registryOptions = {},
  now = () => Date.now(),
  // Pushes notices to the app's Kiro Crew channels; null leaves them queued.
  notifier = gatewayPusher(process.env),
  // Reads session statuses when the tick has no roster (session-observer.mjs).
  slotReader = gatewaySlotReader(process.env),
  // Reads worker sessions' tool rows for timing (session-observer.mjs).
  rowReader = gatewaySlotRows(process.env),
  // Reads per-turn tokens and credits for timing (flow-usage.mjs).
  usageReader = gatewayUsageTurns(process.env),
  // Changes a running chat's model (provider-health.mjs, F126).
  modelSwitcher = gatewayModelSwitcher(gatewayClient(process.env)),
  // Reads Issue Radar's crews for Send to Issue Radar (radar-handoff.mjs).
  crewReader = issueRadarReader(process.env),
}) {
  const replay = new ReplayCache();
  // One store and Operations per workspace root, opened on first use.
  const opened = new Map();
  let registry = null;
  const machine = () => (registry ||= new WorkspaceRegistry(registryOptions));
  // A request names a catalog workspace by ID, or uses the served workspace.
  // Only registered roots are opened; the caller never supplies a path here.
  const workspaceFor = (workspaceId) => {
    if (workspaceId === undefined || workspaceId === null) return config;
    if (typeof workspaceId !== "string")
      throw badRequest("Choose a workspace ID.");
    let root;
    try {
      machine().reload();
      root = machine().get(workspaceId).root;
    } catch (error) {
      throw badRequest(error.message, 404);
    }
    return workspaceConfig({
      workspace: root,
      env: { ...process.env, AVOOZL_WORKSPACE: root },
    });
  };
  const operations = (target) => {
    let entry = opened.get(target.dbPath);
    if (!entry) {
      const store = new Store(target.dbPath);
      if (!store.initialized()) {
        store.close();
        throw badRequest("Initialize this Avoozl workspace first.", 503);
      }
      entry = {
        store,
        ops: new Operations(store, {
          operator: target.operator,
          workspaceRoot: target.workspaceRoot,
          plansRoot: target.plansRoot,
          notifier,
          crewReader,
        }),
      };
      opened.set(target.dbPath, entry);
    }
    return entry;
  };
  const server = http.createServer(async (req, res) => {
    try {
      const target = req.url || "/";
      if (target === "/health") {
        if (req.method !== "GET" && req.method !== "HEAD")
          return send(res, 405, { error: "Use GET." });
        return send(res, 200, { ok: true, app: "avoozl" });
      }
      const body = await readBody(req);
      if (body === null) return send(res, 413, { error: "Request too large." });
      const claim = verifyPrincipal(req.headers[PRINCIPAL_HEADER], {
        method: req.method,
        target,
        body,
        secret,
        replay,
        now: now(),
      });
      if (!claim || claim.kind === "none")
        return send(res, 401, {
          error: "A valid Kiro Crew gateway-signed principal is required.",
        });
      if (target !== "/api/command")
        return send(res, 404, { error: "Not found." });
      if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
      let request;
      try {
        request = JSON.parse(body.toString("utf8") || "{}");
      } catch {
        return send(res, 400, { error: "Send a JSON object." });
      }
      const {
        operation,
        input = {},
        expectedRevision,
        workspaceId,
      } = request || {};
      if (typeof operation !== "string" || !principalAllows(claim, operation))
        return send(res, 403, {
          error: offered(operation)
            ? "This caller may not run that operation."
            : // A page newer than its backend sends operations this build
              // lacks; the installed app copies bin/lib as last built.
              `This Avoozl backend does not offer ${String(operation).slice(0, 80)}. The installed backend may be older than its page: run npm run build:kirocrew-app, then kirocrew app update avoozl.`,
        });
      if (!input || typeof input !== "object" || Array.isArray(input))
        return send(res, 400, { error: "Send input as a JSON object." });
      if (MACHINE_OPERATIONS.has(operation)) {
        const result = machineOperation(machine(), config, operation, input);
        if (operation !== "workspaces.list") follow();
        return send(res, 200, { result });
      }
      const { ops } = operations(workspaceFor(workspaceId));
      const result = await ops.execute(operation, input, expectedRevision);
      return send(res, 200, { result });
    } catch (error) {
      const status =
        Number.isInteger(error.status) && error.status >= 400
          ? error.status
          : 500;
      if (status === 500) console.error(error);
      return send(res, status, {
        error: status === 500 ? "Avoozl backend error." : error.message,
      });
    }
  });
  // Queued notices go out when the backend starts and whenever the tick
  // writes its health receipt beside the drained database: an event from the
  // tick the cron runs, not a schedule of the backend's own. Only outbound
  // loopback calls to the gateway; no listener is added. The drained
  // workspace is the served one, or, when the backend started before any
  // workspace existed, the catalog default the Workspace view adds; the
  // cron's MCP server follows that default too.
  // shortcut: one workspace drains; drain each opened one once ticks run there.
  let draining = null,
    again = false,
    watcher = null,
    drained = null;
  const drain = () => {
    if (!drained) return null;
    if (draining) {
      again = true;
      return draining;
    }
    draining = (async () => {
      do {
        again = false;
        try {
          const { ops, store } = operations(drained);
          await ops.execute("notifications.deliver", {});
          // A stock Kiro Crew hands the cron no roster; the tick's receipt
          // says so, and the backend reads the sessions for the next tick.
          if (slotReader && tickHealth(store).lastRun?.observer === "app") {
            const { errors } = await observeSessions(store, slotReader);
            if (errors.length) console.error(errors[0].error);
          }
          // Timing (§4.11): tool rows of the worker sessions the tick opened.
          if (rowReader) {
            const { errors } = await observeToolRows(store, rowReader, {
              checksFor: (binding) => {
                const task = store
                  .read()
                  .tasks.find((t) => t.id === binding.taskId);
                return declaredChecks(
                  task,
                  store.get("projects", taskRepository(task) || ""),
                );
              },
            });
            if (errors.length) console.error(errors[0].error);
          }
          if (rowReader) {
            const { errors } = await observeRetroReplies(store, rowReader);
            if (errors.length) console.error(errors[0].error);
            const routed = await observeRouterReplies(store, rowReader);
            if (routed.errors.length) console.error(routed.errors[0].error);
          }
          if (usageReader) {
            const { errors } = await observeUsage(store, usageReader);
            if (errors.length) console.error(errors[0].error);
          }
          // Provider health (§4.20): marks from the reads above, then move
          // live chats off an out model, and apply a person's switches.
          refreshHealth(store);
          if (modelSwitcher) {
            const data = store.read(),
              tasks = new Map(data.tasks.map((t) => [t.id, t])),
              ctx = routingContext(store, { workspaceRoot: ops.workspaceRoot });
            await applySwitches(store, modelSwitcher, {
              ...ops.providerOptions(),
              health: ctx.health,
              choicesFor: (binding) =>
                tasks.has(binding.taskId)
                  ? choiceModels(
                      ctx,
                      data,
                      tasks.get(binding.taskId),
                      binding.role,
                    )
                  : [],
            });
          }
        } catch (error) {
          if (error.status !== 503) console.error(error);
        }
      } while (again);
      draining = null;
    })();
    return draining;
  };
  const drainable = (target) =>
    target?.dbPath &&
    target.dbPath !== ":memory:" &&
    fs.existsSync(target.dbPath);
  const follow = () => {
    if (!(notifier || slotReader || rowReader || usageReader || modelSwitcher))
      return;
    let target = drainable(config) ? config : null;
    if (!target)
      try {
        machine().reload();
        const id = machine().config.defaultWorkspace;
        target = id ? workspaceFor(id) : null;
      } catch {
        target = null;
      }
    if (!drainable(target) || target.dbPath === drained?.dbPath) return;
    drained = target;
    watcher?.close();
    try {
      watcher = fs.watch(
        path.dirname(path.resolve(target.dbPath)),
        (_, name) => {
          if (name === "tick-health.json") drain();
        },
      );
      watcher.on("error", () => watcher?.close());
    } catch {
      // No watch support: notices still go out when the backend restarts.
    }
    drain();
  };
  server.drainNotifications = () => drain();
  server.once("listening", follow);
  server.on("close", () => {
    watcher?.close();
    for (const { store } of opened.values()) store.close();
    registry?.close();
  });
  server.keepAliveTimeout = KEEP_ALIVE_MS;
  server.listen(port, HOST);
  return server;
}
