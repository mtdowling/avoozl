// Session statuses on a stock Kiro Crew. A script cron there has no
// ScriptContext.session_status (MC-2), and the kirocrew-dashboard
// session_status tool refuses cron callers, so the tick gets no roster. The
// app backend reads each session the cron opened instead: the cron's slots
// belong to the app (`_app`), so the app token may read them through
// GET /api/chat/slots/<slot>, the per-slot read Kiro Crew's own app SDK
// polls. app.json grants only `/api/chat/slots/avoozl_*`, the keys Kiro Crew
// folds `avoozl:<task-id> …` titles into, and the gateway still refuses any
// slot the app does not own.
//
// What it can tell: working, queued, idle, and "gone" (the gateway does not
// hold it). It cannot tell a closed session from a lost one, so "gone" is
// not final: a worker that is gone opens a decision (delivery.mjs).
import { liveAttempt } from "./delivery.mjs";
import { gatewayClient } from "./gateway-client.mjs";
import { ingestToolRows, toolCallsReadable } from "./flow.mjs";
import { recordRetroReply } from "./flow-retro.mjs";
import { recordRouterReply, routerBatch } from "./router.mjs";
import {
  listSessionBindings,
  recordSessionStatus,
} from "./session-bindings.mjs";

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

// sessions.observe: read every live session the tick opened and record what
// changed. Writes only a changed status. Returns {observed, errors}.
// shortcut: one read per live session per tick; batch once Kiro Crew offers
// an app-scoped roster.
export async function observeSessions(store, read) {
  const errors = [];
  let observed = 0;
  for (const binding of listSessionBindings(store)) {
    if (binding.source !== "tick" || !liveAttempt(binding)) continue;
    let status;
    try {
      status = await read(binding.slot);
    } catch (error) {
      errors.push({ slot: binding.slot, error: error.message });
      continue;
    }
    recordSessionStatus(store, { slot: binding.slot, status });
    observed += 1;
  }
  return { observed, errors };
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

// Read each live worker session the tick opened and record its new tool
// rows as timing spans. Writes only new spans. shortcut: one read per live
// session per tick, the same bound as the status read; batch it once Kiro
// Crew offers an app-scoped roster.
export async function observeToolRows(store, readRows, { checksFor } = {}) {
  const errors = [];
  let rows = 0;
  for (const binding of listSessionBindings(store)) {
    if (
      binding.role !== "worker" ||
      !toolCallsReadable(binding) ||
      !liveAttempt(binding)
    )
      continue;
    const key = "flow.toolCursor." + binding.slot;
    try {
      const read = await readRows(binding.slot, store.getMeta(key));
      rows += ingestToolRows(store, binding, read.rows, {
        checks: checksFor ? checksFor(binding) : [],
      });
      if (
        read.cursor &&
        JSON.stringify(read.cursor) !== JSON.stringify(store.getMeta(key))
      )
        store.setMeta(key, read.cursor);
    } catch (error) {
      errors.push({ slot: binding.slot, error: error.message });
    }
  }
  return { rows, errors };
}

// A retrospective's answer (§4.11): the tool-less avoozl-retro agent ends
// its turn with one JSON object, read from its last assistant row once the
// session is idle. Writes only when a reply is recorded.
export async function observeRetroReplies(store, readRows) {
  const errors = [];
  for (const binding of listSessionBindings(store)) {
    if (binding.role !== "retro" || binding.status !== "idle") continue;
    if (store.get("flow_retros", binding.taskId)?.state !== "running") continue;
    try {
      const { rows } = await readRows(binding.slot, null),
        reply = [...rows]
          .reverse()
          .find(
            (r) => r?.role === "assistant" && typeof r.content === "string",
          );
      if (reply) recordRetroReply(store, binding.taskId, reply.content);
    } catch (error) {
      errors.push({ slot: binding.slot, error: error.message });
    }
  }
  return { errors };
}

// The model router's answer (§4.10): like a retro, one JSON reply from the
// tool-less avoozl-router agent, read once the session is idle.
export async function observeRouterReplies(store, readRows) {
  const errors = [],
    batch = routerBatch(store);
  if (batch?.state !== "running") return { errors };
  for (const binding of listSessionBindings(store)) {
    if (
      binding.role !== "router" ||
      binding.taskId !== batch.id ||
      binding.status !== "idle"
    )
      continue;
    try {
      const { rows } = await readRows(binding.slot, null),
        reply = [...rows]
          .reverse()
          .find(
            (r) => r?.role === "assistant" && typeof r.content === "string",
          );
      if (reply) recordRouterReply(store, batch.id, reply.content);
    } catch (error) {
      errors.push({ slot: binding.slot, error: error.message });
    }
  }
  return { errors };
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
