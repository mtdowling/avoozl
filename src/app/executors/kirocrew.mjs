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
    if (dispatch.project === false || !unset(reading, dispatch.folder))
      continue;
    pending.add(dispatch.folder);
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
