import { fail } from "../store.mjs";
import {
  startRequest,
  takeSessionRequest,
  releaseSessionRequest,
  completeSessionRequest,
} from "../session-requests.mjs";
import { gatewayClient } from "../gateway-client.mjs";
// Sidebar position and project inheritance belong to this executor alone.

const sidebarPath = (repository) => (repository ? `Avoozl/${repository}` : "");

export function kirocrewSession(repository, settings = {}) {
  return { folder: settings.folder || sidebarPath(repository) };
}

export function kirocrewDetachedSession(repository = null) {
  return { ...kirocrewSession(repository), project: false };
}

export function kirocrewSessionSettings(value, label, validateName) {
  return {
    folder: validateName(value.folder, `${label}.folder`, { optional: true }),
  };
}

const unset = (reading, folder) =>
  Boolean(reading && typeof reading === "object") && reading[folder] === false;

// Keep the planner's order. A dispatch whose chat folder has no project
// directory waits and produces one owner notice per folder.
export function kirocrewDispatches(store, dispatches, reading) {
  const pending = new Map();
  for (let i = dispatches.length - 1; i >= 0; i--) {
    const dispatch = dispatches[i];
    if (dispatch.executor !== "kirocrew") continue;
    const configuration = kirocrewConfiguration(store, dispatch);
    if (
      configuration.project === false ||
      !unset(reading, configuration.folder)
    )
      continue;
    pending.set(
      configuration.folder,
      configuration.folder === SPECS_FOLDER ? dispatch.worktree : null,
    );
    dispatches.splice(i, 1);
  }
  return [...pending].map(([folder, root]) => {
    const id = folder.split("/").pop(),
      checkout = root ?? store.get("repositories", id)?.root;
    return {
      channel: "decision",
      title: `Set the project directory of chat folder ${folder.replaceAll("/", " › ")}`,
      text: `Avoozl has work ready for ${id}, but its chat folder ${folder.replaceAll("/", " › ")} has no project directory, so no chat opens there. Only a person can set it.`,
      resume: `In the Kiro Crew sidebar, open the folder's settings and set its project directory${checkout ? ` to ${checkout}` : " to the checkout"}. The next tick starts the work.`,
    };
  });
}

// The status of one slot from its GET /api/chat/slots/<slot> body.
export function slotStatus(body) {
  if (body?.running === true) return "working";
  if (Array.isArray(body?.queue) && body.queue.length) return "queued";
  return "idle";
}

// What a slot read says about the session's model, in the tick's `served`
// shape, or null when Kiro Crew names no served model. The slot carries the
// pinned model, the model the live session resolved to, and whether the pin
// was withheld; it has no mid-session change flag.
export function slotServed(body) {
  const model = body?.served_model;
  if (typeof model !== "string" || !model.trim()) return null;
  return {
    requested: typeof body.model === "string" && body.model ? body.model : null,
    model,
    withheld: body.model_withheld === true,
    changed: false,
  };
}

// A function that reads one slot's status, or null without a gateway client.
// It throws on any answer but 200 and 404, so an unreadable session keeps its
// last status rather than reading as gone. A read that names the served
// model returns {status, served}; otherwise the status alone.
export function gatewaySlotReader(env = process.env, request = fetch) {
  const client = gatewayClient(env, request);
  if (!client) return null;
  return async (slot) => {
    const response = await client.call(
      `/api/chat/slots/${encodeURIComponent(slot)}?limit=1`,
      { method: "GET" },
    );
    if (response.status === 404) return "gone";
    if (!response.ok)
      throw Error(`Kiro Crew refused the session read (${response.status}).`);
    const body = await response.json(),
      status = slotStatus(body),
      served =
        slotServed(body) ??
        (status === "idle" ? await usageServed(client, slot) : null);
    return served ? { status, served } : status;
  };
}

// Kiro Crew 0.12.2.4's one-slot read names no model; the app's own usage rows
// do, one per finished turn. The last row is the model that ran last.
async function usageServed(client, slot) {
  const response = await client.call(
    `/api/usage/turns?slot=${encodeURIComponent(slot)}&days=30`,
    { method: "GET" },
  );
  if (!response.ok) return null;
  const turns = (await response.json())?.turns,
    model = Array.isArray(turns) ? turns.at(-1)?.model : null;
  return typeof model === "string" && model.trim()
    ? { requested: null, model, withheld: false, changed: false }
    : null;
}

// Stop one session's turn for Stop all agents (R64.12): Kiro Crew's own
// session stop, on the app token. The app manifest grants
// /api/chat/slots/avoozl_*; any refusal throws, and the caller names it.
export function gatewaySessionStopper(env = process.env, request = fetch) {
  const client = gatewayClient(env, request);
  if (!client) return null;
  return async (slot) => {
    const response = await client.call(
      `/api/chat/slots/${encodeURIComponent(slot)}/stop`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    if (!response.ok)
      throw Error(`Kiro Crew refused the session stop (${response.status}).`);
  };
}

// Tool rows for timing (§4.11, F90, F91): the same per-slot read with the
// incremental cursor, so each read returns only rows from the last one on.
// Kiro Crew stores a tool call as a row with role "tool", its start `ts`, and
// `meta` {tool_call_id, kind, input}. Only `kind`, the command's first words
// and `ts` are kept (flow.mjs ingestToolRows). Inferred until a live read
// settles the row shape for app-owned slots (task 12.2's receipt).
export function gatewaySlotRows(env = process.env, request = fetch) {
  const client = gatewayClient(env, request);
  if (!client) return null;
  return async (slot, cursor = null) => {
    const query = new URLSearchParams({ limit: "200", cursor: "1" });
    if (
      cursor?.from !== undefined &&
      cursor?.since !== undefined &&
      cursor?.digest
    )
      for (const key of ["from", "since", "digest"])
        query.set(key, String(cursor[key]));
    const response = await client.call(
      `/api/chat/slots/${encodeURIComponent(slot)}?${query}`,
      { method: "GET" },
    );
    if (response.status === 404) return { rows: [], cursor: null, gone: true };
    if (!response.ok)
      throw Error(`Kiro Crew refused the session read (${response.status}).`);
    const body = await response.json();
    return {
      rows: Array.isArray(body?.messages) ? body.messages : [],
      cursor:
        body?.cursor && typeof body.cursor === "object" ? body.cursor : null,
    };
  };
}

// Per-turn token and credit rows of one session the app opened (§4.11):
// GET /api/usage/turns?slot=<slot>&days=30, granted in app.json. Kiro Crew
// returns only rows stamped with this app. Verified from source, not live.
export function gatewayUsageTurns(env = process.env, request = fetch) {
  const client = gatewayClient(env, request);
  if (!client) return null;
  return async (slot) => {
    const response = await client.call(
      `/api/usage/turns?slot=${encodeURIComponent(slot)}&days=30`,
      { method: "GET" },
    );
    if (!response.ok)
      throw Error(`Kiro Crew refused the usage read (${response.status}).`);
    const body = await response.json();
    return Array.isArray(body?.turns) ? body.turns : [];
  };
}

// Provider selection is kept outside neutral request objects and durable rows.
const prepared = new WeakMap();
const privateKey = (id) => `executor.kirocrew.${id}`;
const selections = (store) => {
  if (!prepared.has(store)) prepared.set(store, new Map());
  return prepared.get(store);
};
const ROLE_AGENTS = {
  worker: "kirocrew-worker",
  verifier: "avoozl-verifier",
  planner: "avoozl-planner",
  responder: "avoozl-responder",
  retro: "avoozl-retro",
  "pr-review": "avoozl-code-review",
  triage: "avoozl-triage",
  "review-draft": "avoozl-review-draft",
  falsifier: "avoozl-falsifier",
  "plan-review": "avoozl-plan-review",
  "plan-answer": "avoozl-planner",
  "task-summary": "avoozl-task-summary",
};

export function kirocrewRequest(store, legacy) {
  const { folder, project, agent, mode, ...portable } = legacy;
  // The caller names the executor (NK1.2: a role's settings choose it, so
  // nothing here may default a request to `kirocrew`).
  if (!portable.executor)
    fail(`The ${portable.role ?? "worker"} request names no executor.`, 500);
  const request = startRequest(portable);
  if (request.executor === "kirocrew")
    selections(store).set(request.id, {
      folder: folder ?? "",
      ...(project === undefined ? {} : { project }),
      agent:
        agent ??
        (request.role === "plan-answer" && request.permissionClass === "read"
          ? "avoozl-plan-answer-read"
          : ROLE_AGENTS[request.role]) ??
        "",
      ...(mode ? { mode } : {}),
    });
  return request;
}

// The planner agents may write only `.kiro/specs/**` under the chat's own
// project directory, so a planner that writes a workspace's spec folder opens
// in a folder whose project directory is that workspace.
// shortcut: one folder for every workspace on this Kiro Crew; name it per
// workspace once a gateway serves two planning workspaces.
const SPECS_FOLDER = "Avoozl/Specs";
const writesSpecs = (request) =>
  Boolean(request.worktree) &&
  !request.repository &&
  request.permissionClass === "write" &&
  ["planner", "plan-answer"].includes(request.role);

export function kirocrewConfiguration(store, request) {
  const queued = store.get("session_requests", request.id),
    active =
      queued?.kind === "start" && ["claimed", "bound"].includes(queued.state)
        ? queued.request
        : request,
    configuration = selections(store).get(request.id) ??
      store.getMeta(privateKey(request.id)) ?? {
        folder:
          active.worktree && active.repository
            ? sidebarPath(active.repository)
            : writesSpecs(active)
              ? SPECS_FOLDER
              : "",
        ...((active.worktree && active.repository) || writesSpecs(active)
          ? {}
          : { project: false }),
        agent: ROLE_AGENTS[active.role] ?? "",
      };
  // The answer's permission class determines its tool access, even when a
  // pending request retains folder settings from an earlier write version.
  return active.role === "plan-answer"
    ? {
        ...configuration,
        agent:
          active.permissionClass === "read"
            ? "avoozl-plan-answer-read"
            : ROLE_AGENTS["plan-answer"],
      }
    : configuration;
}

export function persistKirocrewConfiguration(store, request) {
  if (request.executor !== "kirocrew") return;
  const current = store.get("session_requests", request.id);
  if (
    current?.kind === "start" &&
    ["claimed", "bound"].includes(current.state)
  ) {
    selections(store).delete(request.id);
    return;
  }
  const configuration = kirocrewConfiguration(store, request),
    key = privateKey(request.id);
  if (JSON.stringify(store.getMeta(key)) !== JSON.stringify(configuration))
    store.setMeta(key, configuration);
  selections(store).delete(request.id);
}

export const kirocrewConsumer = (context = {}) =>
  context.caller?.sessionKey ?? context.caller?.slot ?? "local-executor";
function nativeConsumer(context) {
  const consumer = kirocrewConsumer(context);
  if (context.mcp && !consumer.startsWith("cron:"))
    fail("Only the native executor cron may consume session requests.", 403);
  return consumer;
}

export function takeKirocrewRequest(store, input, context = {}, eligible) {
  const taken = takeSessionRequest(store, input, {
    executor: "kirocrew",
    consumer: nativeConsumer(context),
    eligible,
  });
  return taken
    ? { ...taken, configuration: kirocrewConfiguration(store, taken.request) }
    : null;
}
export function releaseKirocrewRequest(store, input, context = {}) {
  return releaseSessionRequest(store, input, {
    executor: "kirocrew",
    consumer: nativeConsumer(context),
  });
}
export function completeKirocrewRequest(store, input, context = {}) {
  return completeSessionRequest(store, input, {
    executor: "kirocrew",
    consumer: nativeConsumer(context),
  });
}
export function kirocrewExplicitSession(store, request) {
  const old = store.getMeta(`executor.kirocrew.intent.${request.id}`);
  return {
    agent: old?.agent ?? request.agent ?? ROLE_AGENTS[request.role] ?? "",
  };
}
export function saveKirocrewIntent(store, id, input) {
  if (
    typeof input.agent !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.agent)
  )
    fail("Choose an agent name of letters, digits, '.', '_', ':', or '-'.");
  const before = store.getMeta(`executor.kirocrew.intent.${id}`);
  if (before && before.agent !== input.agent)
    fail("This task already requests a session on another agent.", 409);
  if (!before)
    store.setMeta(`executor.kirocrew.intent.${id}`, { agent: input.agent });
  return { agent: input.agent };
}
