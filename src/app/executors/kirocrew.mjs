import { fail } from "../store.mjs";
import {
  startRequest,
  takeSessionRequest,
  releaseSessionRequest,
  completeSessionRequest,
} from "../session-requests.mjs";
import { gatewayClient } from "../gateway-client.mjs";
// Sidebar placement and project inheritance belong to this executor alone.
import { taskRepository } from "../../work-model.mjs";

const sidebarPath = (repository) => (repository ? `Avoozl/${repository}` : "");

export function kirocrewSession(repository, settings = {}) {
  return { folder: settings.folder || sidebarPath(repository) };
}

export function kirocrewDetachedSession(repository = null) {
  return { ...kirocrewSession(repository), project: false };
}

export function kirocrewRemoteSession(crew) {
  return { crew: crew.id, project: false };
}

export function kirocrewSessionSettings(value, label, validateName) {
  return {
    folder: validateName(value.folder, `${label}.folder`, { optional: true }),
  };
}

const unset = (reading, folder) =>
  Boolean(reading && typeof reading === "object") && reading[folder] === false;

export function kirocrewReadiness(reading) {
  return (task) => ({
    available: !unset(reading, sidebarPath(taskRepository(task))),
    hold: {
      wait: true,
      noFit: false,
      folder: true,
      why: "its chat folder has no project directory",
    },
  });
}

// Keep the planner's order, including its remote-placement fallback. A local
// dispatch with no inherited project waits and produces the same owner notice.
export function kirocrewDispatches(store, dispatches, waits, reading) {
  const pending = new Set(
    waits
      .filter(({ result }) => result.folder)
      .map(({ task }) => sidebarPath(taskRepository(task))),
  );
  for (let i = dispatches.length - 1; i >= 0; i--) {
    const dispatch = dispatches[i];
    if (dispatch.executor !== "kirocrew") continue;
    const configuration = kirocrewConfiguration(store, dispatch);
    if (
      configuration.project === false ||
      !unset(reading, configuration.folder)
    )
      continue;
    pending.add(configuration.folder);
    dispatches.splice(i, 1);
  }
  return [...pending].map((folder) => {
    const id = folder.split("/").pop(),
      checkout = store.get("projects", id)?.root;
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

// A function that reads one slot's status, or null without a gateway client.
// It throws on any answer but 200 and 404, so an unreadable session keeps its
// last status rather than reading as gone.
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
    return slotStatus(await response.json());
  };
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
  "review-draft": "avoozl-review-draft",
  "conflict-fix": "avoozl-conflict-fix",
  falsifier: "avoozl-falsifier",
  "plan-review": "avoozl-plan-review",
  "plan-answer": "avoozl-planner",
};

export function kirocrewRequest(store, legacy) {
  const { folder, project, agent, mode, ...portable } = legacy;
  const request = startRequest({
    ...portable,
    executor: portable.executor ?? "kirocrew",
  });
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
            : "",
        ...(active.worktree && active.repository ? {} : { project: false }),
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

export function kirocrewAgentNames(list, files) {
  const materialized = /^[^/\\]+--(.+)\.json$/;
  return Array.isArray(list)
    ? list
    : Array.isArray(files)
      ? files.map((file) => materialized.exec(String(file))?.[1] ?? null)
      : null;
}
