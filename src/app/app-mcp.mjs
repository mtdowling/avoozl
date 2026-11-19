// The Kiro Crew app's stdio MCP server (`avoozl mcp --kirocrew`). Kiro Crew's
// gateway may share one process between many sessions, so nothing here comes
// from the process: every request resolves its own workspace from the caller
// block the gateway attaches (`_meta["kirocrew.caller"]`, kiro_crew/mcp_caller.py),
// never from the working directory.
//
//   1. A caller bound to a task (session_bindings) works in the workspace that
//      holds the binding. A binding in two workspaces is refused.
//   2. Any other request uses the workspace named at launch (--workspace, the
//      AVOOZL_WORKSPACE family, or the catalog default), or is refused.
//
// The caller block carries a session key, not a project directory, so an
// unbound session cannot pick a workspace of its own. A request without a caller
// block (a script cron spawns its own copy of this server) still runs. It takes
// the cron's key from KIROCREW_SESSION_KEY (withCronCaller); with neither, it
// has no caller, so tools that need an identity, such as plans_session report, refuse it.
import fs from "node:fs";
import { workspaceConfig } from "./config.mjs";
import { loadHostConfig, machineAvoozlPaths } from "./host-config.mjs";
import { complete, handleMcp, kiroCrewCaller } from "./mcp.mjs";
import { Operations } from "./operations.mjs";
import { driverSettingsPath } from "./driver.mjs";
import { Store } from "./store.mjs";
import { callerSlot } from "./delivery.mjs";
import { dispatchMcp } from "../mcp.mjs";

// kiro_crew/mcp_caller.py CALLER_CAPABILITY_KEY and caller_identity_capability().
const CALLER_CAPABILITY = "kirocrew.caller-identity";
// Methods answered without a workspace.
const STATIC = new Set([
  "initialize",
  "ping",
  "tools/list",
  "resources/list",
  "resources/templates/list",
]);

const rpcError = (id, message, code = -32603) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

// The avoozl-tick cron's call: plans_maintain tick marked cron.
function cronTick(message) {
  if (message.method !== "tools/call") return false;
  const { name, arguments: args } = message.params || {};
  const input = args?.input;
  return (
    input?.cron === true && name === "plans_maintain" && args.action === "tick"
  );
}

// A script cron spawns its own copy of this server and sends no caller block;
// Kiro Crew names the job only in KIROCREW_SESSION_KEY ("cron:<job id>",
// kiro_crew/cron_script_mcp.py), as Kiro Crew's own servers read it. Only a
// cron key is taken, and only when no block came, so a pooled process never
// lends one session's identity to another.
function withCronCaller(message, env) {
  const key = env.KIROCREW_SESSION_KEY;
  if (
    message.method !== "tools/call" ||
    typeof key !== "string" ||
    !/^cron:[\w-]{1,128}$/.test(key) ||
    message.params?._meta?.["kirocrew.caller"]
  )
    return message;
  const params = message.params ?? {};
  return {
    ...message,
    params: {
      ...params,
      _meta: {
        ...params._meta,
        "kirocrew.caller": { schemaVersion: 1, sessionKey: key },
      },
    },
  };
}

export function createAppMcp({ fallback = null, env = process.env } = {}) {
  // One Store and Operations per database, opened on first use and kept, so
  // tick memory and caches stay per workspace.
  const opened = new Map();
  const open = (config) => {
    const key = fs.realpathSync.native(config.dbPath);
    let entry = opened.get(key);
    if (!entry) {
      const store = new Store(config.dbPath);
      entry = {
        config,
        store,
        ops: new Operations(store, {
          operator: config.operator,
          workspaceRoot: config.workspaceRoot,
          plansRoot: config.plansRoot,
          configDirectory: machineAvoozlPaths().configDirectory,
          driver: { settingsFile: driverSettingsPath() },
          workspaceName: config.name,
        }),
      };
      opened.set(key, entry);
    }
    return entry;
  };
  const existing = (config) =>
    config && fs.existsSync(config.dbPath) ? config : null;
  // Every initialized workspace this process may serve: the catalog's enabled
  // workspaces and the launch workspace. Read again on each call.
  const candidates = () => {
    const configs = [];
    let workspaces = {};
    try {
      workspaces = loadHostConfig({ env }).config.workspaces || {};
    } catch {
      workspaces = {};
    }
    for (const entry of Object.values(workspaces))
      if (entry?.root && entry.enabled !== false)
        try {
          const config = existing(
            workspaceConfig({ workspace: entry.root, env }),
          );
          if (config) configs.push(config);
        } catch {
          // An unreadable catalog entry is not a workspace this call can use.
        }
    if (existing(fallback)) configs.push(fallback);
    const seen = new Set();
    return configs.filter((config) => {
      const key = fs.realpathSync.native(config.dbPath);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const boundIn = (slot) =>
    candidates()
      .map(open)
      .filter(({ store }) =>
        [slot, "dashboard:" + slot].some((id) =>
          store.get("session_bindings", id),
        ),
      );

  // Which workspace serves this request, or an error message.
  function resolve(message) {
    const caller = kiroCrewCaller(message),
      slot = callerSlot(caller);
    if (slot) {
      const bound = boundIn(slot);
      if (bound.length > 1)
        return {
          error: `Session ${slot} is bound in more than one Avoozl workspace; Avoozl will not choose one.`,
        };
      if (bound.length === 1) return { entry: bound[0] };
    }
    const launch = existing(fallback);
    if (!launch)
      return {
        noWorkspace: true,
        error:
          "Avoozl has no workspace for this session. Choose a default workspace in the Avoozl Workspace view.",
      };
    return { entry: open(launch) };
  }

  async function handle(message) {
    if (!message || typeof message !== "object" || Array.isArray(message))
      return rpcError(null, "Send one JSON-RPC request object.", -32600);
    // Notifications get no reply.
    if (!Object.hasOwn(message, "id")) return null;
    message = withCronCaller(message, env);
    // Refused as Kiro Crew's own servers refuse it (mcp_shared_dispatch.py).
    // A client that gets an answer speaks the 2026-07-28 revision and never
    // sends initialize, so the gateway never sees CALLER_CAPABILITY and
    // forwards every call without a caller block.
    if (message.method === "server/discover")
      return rpcError(message.id, "Method not found", -32601);
    // A view's HTML needs no workspace either.
    if (
      STATIC.has(message.method) ||
      (message.method === "resources/read" &&
        String(message.params?.uri).startsWith("ui://"))
    ) {
      if (message.method === "tools/list")
        return (await handleMcp(message, null)).body;
      const reply = dispatchMcp(message, {}).body;
      // Pooled operation: the gateway injects the caller block only into a
      // backend that advertises this (kiro_crew/mcp_gateway/backend_handshake.py
      // _parse_initialize_response).
      if (message.method === "initialize" && reply?.result)
        reply.result.capabilities = {
          ...reply.result.capabilities,
          experimental: {
            ...reply.result.capabilities?.experimental,
            [CALLER_CAPABILITY]: { schemaVersion: 1 },
          },
        };
      return reply;
    }
    const target = resolve(message);
    // Before any workspace exists the cron's tick has nothing to do. An
    // error here would count toward Kiro Crew's cron auto-pause (five in a
    // row), and a paused tick stays off after the person adds a workspace.
    if (target.noWorkspace && cronTick(message))
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: complete(message, {
          content: [
            {
              type: "text",
              text: JSON.stringify({ skipped: true, reason: target.error }),
            },
          ],
        }),
      };
    if (target.error) {
      if (message.method === "tools/call")
        return {
          jsonrpc: "2.0",
          id: message.id,
          result: complete(message, {
            isError: true,
            content: [{ type: "text", text: target.error }],
          }),
        };
      return rpcError(message.id, target.error);
    }
    return (
      await handleMcp(message, target.entry.ops, { attestedCaller: true })
    ).body;
  }

  return {
    handle,
    close() {
      for (const { store } of opened.values()) store.close();
      opened.clear();
    },
  };
}
