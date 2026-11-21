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
import {
  type WorkspaceConfig,
  workspaceConfig,
} from "../../settings/config.ts";
import {
  loadHostConfig,
  machineAvoozlPaths,
} from "../../settings/host-config.ts";
import { complete, handleMcp, kiroCrewCaller } from "../../mcp/mcp.ts";
import { Operations } from "../../api/operations.ts";
import { Store } from "../../store/store.ts";
import { callerSlot } from "../../delivery/delivery.ts";
import { dispatchMcp, type McpMessage } from "../../../mcp.ts";
import { cronIntents, KIROCREW_WORKSPACE_FIELD } from "./cron-intents.ts";
import { passReply, tickCall, toolReply } from "../../mcp/mcp-tick.ts";
import { runPass } from "../../tick/tick-pass.ts";
import { workspaceIdentity } from "../../store/identity.ts";
import { startTickPass } from "../../tick/tick-runner.ts";

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

// A workspace this server may open, and its configuration error if any.
type Launch = Partial<WorkspaceConfig> & {
  workspaceRoot: string;
  configError?: string;
  workspaceId?: string;
};
// A workspace whose database is on disk.
type Ready = Launch & { dbPath: string };
// One opened workspace.
interface Opened {
  config: Ready;
  store: Store;
  ops: Operations;
  workspaceId: string;
}

const rpcError = (id: unknown, message: string, code = -32603) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

// A script cron spawns its own copy of this server and sends no caller block;
// Kiro Crew names the job only in KIROCREW_SESSION_KEY ("cron:<job id>",
// kiro_crew/cron_script_mcp.py), as Kiro Crew's own servers read it. Only a
// cron key is taken, and only when no block came, so a pooled process never
// lends one session's identity to another.
function withCronCaller(message: McpMessage, env: NodeJS.ProcessEnv) {
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

function withoutCaller(message: McpMessage): McpMessage {
  if (!message.params?._meta?.["kirocrew.caller"]) return message;
  const { "kirocrew.caller": _dropped, ...meta } = message.params._meta;
  return { ...message, params: { ...message.params, _meta: meta } };
}

export function createAppMcp({
  fallback = null,
  env = process.env,
  startPass = startTickPass,
  // Whether a caller block in a message is the gateway's (`avoozl mcp
  // --kirocrew`). Any other front end's block is dropped: it could come from
  // any client (MS10.2).
  attested = true,
}: {
  fallback?: Launch | null;
  env?: NodeJS.ProcessEnv;
  attested?: boolean;
  startPass?: typeof startTickPass;
} = {}) {
  // One Store and Operations per database, opened on first use and kept, so
  // tick memory and caches stay per workspace.
  const opened = new Map<string, Opened>();
  const open = (config: Ready) => {
    const key = fs.realpathSync.native(config.dbPath);
    let entry = opened.get(key);
    if (!entry) {
      const store = new Store(config.dbPath);
      entry = {
        config,
        store,
        workspaceId: config.workspaceId ?? workspaceIdentity(store),
        ops: new Operations(store, {
          operator: config.operator,
          workspaceRoot: config.workspaceRoot,
          plansRoot: config.plansRoot,
          configDirectory: machineAvoozlPaths().configDirectory,
        }),
      };
      opened.set(key, entry);
    }
    // A pooled process may have opened the fallback before the catalog entry.
    // The catalog's ID is authoritative once that same database is found there.
    if (config.workspaceId) entry.workspaceId = config.workspaceId;
    return entry;
  };
  const existing = (config: Launch | null | undefined): Ready | null => {
    const dbPath = config?.dbPath;
    return config && dbPath && fs.existsSync(dbPath)
      ? { ...config, dbPath }
      : null;
  };
  // Every initialized workspace this process may serve: the catalog's enabled
  // workspaces and the launch workspace. Read again on each call.
  const candidates = () => {
    const configs: Ready[] = [];
    let workspaces: Record<string, { root?: string; enabled?: boolean }> = {};
    try {
      workspaces = loadHostConfig({ env }).config.workspaces || {};
    } catch {
      workspaces = {};
    }
    for (const [workspaceId, entry] of Object.entries(workspaces))
      if (entry?.root && entry.enabled !== false)
        try {
          const config = existing(
            workspaceConfig({ workspace: entry.root, env }),
          );
          if (config) configs.push({ ...config, workspaceId });
        } catch {
          // An unreadable catalog entry is not a workspace this call can use.
        }
    const launched = existing(fallback);
    if (launched) configs.push(launched);
    const seen = new Set<string>();
    return configs.filter((config) => {
      const key = fs.realpathSync.native(config.dbPath);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const boundIn = (slot: string) =>
    candidates()
      .map(open)
      .filter(({ store }) =>
        [slot, "dashboard:" + slot].some((id) =>
          store.get("session_bindings", id),
        ),
      );

  const selectedWorkspace = (message: McpMessage) => {
    const caller = kiroCrewCaller(message),
      input = (
        message.params?.arguments as
          | { input?: Record<string, unknown> }
          | undefined
      )?.input,
      selected = input?.[KIROCREW_WORKSPACE_FIELD];
    return caller?.sessionKey?.startsWith("cron:") &&
      typeof selected === "string" &&
      selected
      ? selected
      : null;
  };

  // Which workspace serves this request, or an error message.
  function resolve(message: McpMessage): {
    entry?: Opened;
    error?: string;
    noWorkspace?: boolean;
  } {
    const caller = kiroCrewCaller(message),
      slot = callerSlot(caller);
    const selected = selectedWorkspace(message);
    if (selected) {
      const matches = candidates()
        .map(open)
        .filter(({ workspaceId }) => workspaceId === selected);
      if (matches.length === 1) return { entry: matches[0] };
      return {
        error:
          matches.length > 1
            ? `Workspace ${selected} is registered more than once; Avoozl will not choose one.`
            : `Workspace ${selected} is no longer enabled on this Avoozl machine.`,
      };
    }
    if (slot) {
      const bound = boundIn(slot);
      if (bound.length > 1)
        return {
          error: `Session ${slot} is bound in more than one Avoozl workspace; Avoozl will not choose one.`,
        };
      if (bound.length === 1) return { entry: bound[0] };
    }
    if (fallback?.configError) return { error: fallback.configError };
    const launch = existing(fallback);
    if (!launch)
      return {
        noWorkspace: true,
        error:
          "Avoozl has no workspace for this session. Choose a default workspace in the Avoozl Workspace view.",
      };
    return { entry: open(launch) };
  }

  const passOptions = (roots?: string[]) => {
    const machine = machineAvoozlPaths({ env });
    // The pass gets no gateway secret, so nothing it starts inherits one.
    const clean = { ...env };
    delete clean.KIROCREW_PROXY_SECRET;
    delete clean.KIROCREW_GATEWAY_ORIGIN_PROOF;
    return {
      stateDirectory: machine.stateDirectory,
      configDirectory: machine.configDirectory,
      roots,
      env: clean,
    };
  };
  const pass = async (roots: string[]) => runPass(passOptions(roots));

  const machineCronIntents = (
    entries: Opened[],
    input: { sessions?: unknown } | undefined,
    consumer?: string,
  ) => {
    const combined: Record<string, unknown[]> = {
      observe: [],
      dispatch: [],
      messages: [],
      notify: [],
    };
    for (const entry of entries) {
      const intents = cronIntents(
        entry.store,
        input,
        entry.workspaceId,
        consumer,
      );
      for (const key of Object.keys(combined))
        combined[key]?.push(...(intents[key as keyof typeof intents] ?? []));
    }
    return combined;
  };

  async function handle(message: McpMessage | null) {
    if (!message || typeof message !== "object" || Array.isArray(message))
      return rpcError(null, "Send one JSON-RPC request object.", -32600);
    // Notifications get no reply.
    if (!Object.hasOwn(message, "id")) return null;
    message = attested ? withCronCaller(message, env) : withoutCaller(message);
    // Refused as Kiro Crew's own servers refuse it (mcp_shared_dispatch.py).
    // A client that gets an answer speaks the 2026-07-28 revision and never
    // sends initialize, so the gateway never sees CALLER_CAPABILITY and
    // forwards every call without a caller block.
    if (message.method === "server/discover")
      return rpcError(message.id, "Method not found", -32601);
    if (typeof message.method === "string" && STATIC.has(message.method)) {
      if (message.method === "tools/list")
        return (await handleMcp(message, null)).body;
      const reply = dispatchMcp(message).body as {
        result?: { capabilities?: { experimental?: object } };
      } | null;
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
    const tick = tickCall(message);
    if (tick?.cron) {
      const entries = candidates().map(open);
      // Before any workspace exists the cron's tick has nothing to do. An
      // error here would count toward Kiro Crew's cron auto-pause (five in a
      // row), and a paused tick stays off after the person adds a workspace.
      if (!entries.length)
        return toolReply(message, {
          skipped: true,
          reason:
            "Avoozl has no workspace on this machine. Add one in the Avoozl Workspace view.",
        });
      // Record the roster and take the previous pass's released intents
      // before starting the next one. Repository work may outlive Kiro
      // Crew's cron deadline; a later cron carries its released intents.
      const input = (
        message.params?.arguments as
          | { input?: { sessions?: unknown } }
          | undefined
      )?.input;
      const intents = machineCronIntents(
        entries,
        input,
        kiroCrewCaller(message)?.sessionKey,
      );
      startPass(passOptions(undefined));
      return toolReply(message, intents);
    }
    const target = resolve(message);
    if (!target.entry) {
      if (message.method === "tools/call")
        return {
          jsonrpc: "2.0",
          id: message.id,
          result: complete(message, {
            isError: true,
            content: [{ type: "text", text: String(target.error) }],
          }),
        };
      return rpcError(message.id, String(target.error));
    }
    // A non-cron tick call runs one pass for its own workspace and waits for
    // the result. The cron path above launches the machine pass separately.
    if (tick) {
      const results = await pass([target.entry.config.workspaceRoot]);
      return passReply(message, results);
    }
    return (
      await handleMcp(message, target.entry.ops, { attestedCaller: attested })
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
