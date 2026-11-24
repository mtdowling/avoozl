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
// not final: a gone worker is resumed once, and a second vanish opens a
// decision (delivery.mjs).
import { liveAttempt, previousAttemptEnded } from "../../delivery/delivery.ts";
import { ingestToolRows, toolCallsReadable } from "../../flow/flow.ts";
import {
  listSessionBindings,
  recordSessionStatus,
} from "../../sessions/session-bindings.ts";
import type { SessionBinding } from "../../sessions/session-bindings.ts";
import type { Store } from "../../store/store.ts";

// A slot read: its status, or {status, served} when the read names the
// model it served.
type SlotReading = string | { status: string; served?: unknown };

// One page of a worker's tool rows, and the cursor for the next read.
interface ToolRows {
  rows: unknown[];
  cursor?: unknown;
}

// sessions.observe: read every live session the tick opened and record what
// changed. Writes only a changed status. Returns {observed, errors}.
// shortcut: one read per live session per tick; batch once Kiro Crew offers
// an app-scoped roster.
export async function observeSessions(
  store: Store,
  read: (slot: string) => Promise<SlotReading>,
) {
  const errors: { slot: string; error: string }[] = [];
  let observed = 0;
  const now = Date.now();
  for (const binding of listSessionBindings(store)) {
    // Keep historical relay bindings untouched: this machine cannot read
    // the workers they opened on another crew. A finished attempt is still
    // read until a status confirms it ended, so the next attempt may open.
    if (
      binding.source !== "tick" ||
      binding.relay ||
      (!liveAttempt(binding) && previousAttemptEnded(binding, now))
    )
      continue;
    let reading;
    try {
      reading = await read(binding.slot);
    } catch (error) {
      errors.push({ slot: binding.slot, error: (error as Error).message });
      continue;
    }
    // A stock Kiro Crew names the served model only on the slot read; the
    // writer-model check of a plan review (§4.29) needs it.
    const { status, served }: { status: string; served?: unknown } =
      typeof reading === "string" ? { status: reading } : reading;
    recordSessionStatus(
      store,
      { slot: binding.slot, status },
      served ? { served } : {},
    );
    observed += 1;
  }
  return { observed, errors };
}

// Read each live worker session the tick opened and record its new tool
// rows as timing spans, and its provider errors as health marks. Writes only new spans. shortcut: one read per live
// session per tick, the same bound as the status read; batch it once Kiro
// Crew offers an app-scoped roster.
export async function observeToolRows(
  store: Store,
  readRows: (slot: string, cursor: unknown) => Promise<ToolRows>,
  { checksFor }: { checksFor?: (binding: SessionBinding) => unknown[] } = {},
) {
  const errors: { slot: string; error: string }[] = [];
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
      errors.push({ slot: binding.slot, error: (error as Error).message });
    }
  }
  return { rows, errors };
}

export {
  slotStatus,
  gatewaySlotReader,
  gatewaySessionStopper,
  gatewaySlotRows,
  gatewayUsageTurns,
} from "../kirocrew.ts";
