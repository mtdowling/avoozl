// Avoozl's Kiro Crew app backend. Kiro Crew's gateway proxies the app page's
// API here and signs each request with a principal claim (`signedPrincipal`).
// The backend binds loopback only. Any local process can reach that socket,
// so every route except the gateway's unsigned health probe verifies the claim
// and refuses with 401 when it is missing, stale, replayed, or forged.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { machineAvoozlPaths } from "./host-config.mjs";
import { commandContext, dispatchCommand } from "./command-dispatch.mjs";

export { APP_OPERATIONS, principalAllows } from "./command-dispatch.mjs";
import { gatewayPusher } from "./notifications.mjs";
import {
  gatewaySessionStopper,
  gatewaySlotReader,
  gatewaySlotRows,
  gatewayUsageTurns,
  observeSessions,
  observeRetroReplies,
  observeToolRows,
} from "./session-observer.mjs";
import { declaredChecks, prepareWorktree } from "./delivery.mjs";
import { drainProcessRequests } from "./executors/process.mjs";
import { drainCheckRuns } from "./check-runs.mjs";
import { observeUsage } from "./flow-usage.mjs";
import { gatewayClient } from "./gateway-client.mjs";
import {
  applySwitches,
  gatewayModelList,
  gatewayModelSwitcher,
  healthContext,
  recordModelList,
  refreshHealth,
  switchModels,
} from "./provider-health.mjs";
import { taskRepository } from "../work-model.mjs";
import { issueRadarReader } from "./radar-handoff.mjs";
import { WORKSPACE_LOCK, tickHealth } from "./tick.mjs";
import { withWorkLock } from "./git.mjs";
import { launchSupervisor } from "./supervisor.mjs";
import { uiBundleProblem } from "./ui-bundle.mjs";
import { defaultDemoRoot } from "./demo.mjs";

const PRINCIPAL_HEADER = "x-kirocrew-principal";
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
const KEEP_ALIVE_MS = 65_000;
const KINDS = new Set(["owner-session", "app-token", "agent-tool", "none"]);
const CLAIM_KEYS = ["issuedAt", "kind", "ownerId", "requestId", "version"];
const REQUEST_ID = /^[0-9a-f]{32}$/;

// One cache per backend process: each accepted request ID is refused again
// until its freshness window closes. A full cache refuses rather than evicting
// a live ID, because eviction would make that request replayable.
class ReplayCache {
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

// The supervisor gets no gateway secret, so its children never inherit one.
function machineSupervisor() {
  const { stateDirectory, configDirectory } = machineAvoozlPaths();
  const env = { ...process.env };
  delete env.KIROCREW_PROXY_SECRET;
  delete env.KIROCREW_GATEWAY_ORIGIN_PROOF;
  return launchSupervisor({ stateDirectory, configDirectory, env });
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
  // Lists the models Kiro Crew offers (GET /api/models, F128), read on each
  // pass so a model list is never stale.
  modelReader = gatewayModelList(gatewayClient(process.env)),
  // Reads Issue Radar's crews for Send to Issue Radar (radar-handoff.mjs).
  crewReader = issueRadarReader(process.env),
  // Stops a session for Stop all agents (session-observer.mjs).
  sessionStopper = gatewaySessionStopper(process.env),
  // Where Demo mode keeps its sample workspace (demo.mjs).
  demoRoot = defaultDemoRoot(),
  // Starts this machine's supervisor for process children (R95.3). Only
  // under Kiro Crew's gateway, so tests and bare runs start none.
  supervisor = gatewayClient(process.env) ? machineSupervisor : null,
  // Where a typed `~` and the folder picker start.
  home = os.homedir(),
  // The installed app's ui folder (bin/avoozl.mjs passes it). A page built
  // from other source, or none, gets only a sentence saying to rebuild.
  uiDir = null,
}) {
  const uiProblem = uiDir ? uiBundleProblem(uiDir) : null;
  if (uiProblem) console.error(uiProblem);
  const replay = new ReplayCache();
  const context = commandContext({
    host: "kirocrew",
    config,
    home,
    registryOptions,
    demoRoot,
    readers: {
      notifier,
      slotReader,
      rowReader,
      usageReader,
      modelSwitcher,
      modelReader,
      crewReader,
      sessionStopper,
    },
    follow: () => follow(),
  });
  const { operations, workspaceFor, machine } = context;
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
      if (uiProblem) return send(res, 409, { error: uiProblem });
      if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
      let request;
      try {
        request = JSON.parse(body.toString("utf8") || "{}");
      } catch {
        return send(res, 400, { error: "Send a JSON object." });
      }
      const { status, body: reply } = await dispatchCommand({
        claim,
        request,
        context,
      });
      return send(res, status, reply);
    } catch (error) {
      console.error(error);
      return send(res, 500, { error: "Avoozl backend error." });
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
          // Checks in code (§5.2 Checks): the runs the tick queued, off the
          // tick's path and not awaited here; the next tick judges them.
          drainCheckRuns(store);
          // `process` sessions (R93.3): this machine's supervisor runs the
          // children; the requests the tick queued are handed to it here.
          if (supervisor) {
            const { errors } = await drainProcessRequests(store, {
              stateDirectory: machineAvoozlPaths().stateDirectory,
              prepareWorktree,
              ops,
            });
            if (errors.length) console.error(errors[0].error);
          }
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
          }
          if (usageReader) {
            const { errors } = await observeUsage(store, usageReader);
            if (errors.length) console.error(errors[0].error);
          }
          // Provider health (§4.20): marks from the reads above, then move
          // live chats off an out model, and apply a person's switches.
          refreshHealth(store);
          if (modelReader)
            try {
              recordModelList(store, await modelReader());
            } catch (error) {
              console.error(error.message);
            }
          if (modelSwitcher) {
            const data = store.read(),
              tasks = new Map(data.tasks.map((t) => [t.id, t]));
            await applySwitches(store, modelSwitcher, {
              ...ops.providerOptions(),
              health: healthContext(store),
              choicesFor: (binding) =>
                switchModels(store, tasks.get(binding.taskId)),
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
    if (
      !(
        notifier ||
        slotReader ||
        rowReader ||
        usageReader ||
        modelSwitcher ||
        modelReader
      )
    )
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
  server.once("listening", () => {
    try {
      supervisor?.();
    } catch (error) {
      console.error(`The supervisor did not start: ${error.message}`);
    }
  });
  server.on("close", () => {
    watcher?.close();
    context.close();
  });
  server.keepAliveTimeout = KEEP_ALIVE_MS;
  server.listen(port, HOST);
  return server;
}
