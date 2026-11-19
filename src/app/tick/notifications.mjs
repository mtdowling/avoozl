// Decisions and failures reach the person through the Avoozl app's own Kiro
// Crew notification channels (app.json `notifications.channels`), each with a
// link to the session it concerns (design §4.2, Requirements 9 and 26.10).
//
// The tick queues one row per notice in `app_notifications`; the app backend,
// the only Avoozl process that holds the app secret, pushes queued rows to the
// gateway's `POST /api/notifications/push` and marks them sent. Nothing here
// schedules anything: the backend drains when it starts and when the tick
// writes its health receipt.
import { createHash } from "node:crypto";
import { gatewayClient } from "../executors/kirocrew/gateway-client.mjs";
import { fail } from "../store/store.mjs";

// app.json notifications.channels ids. The Intake tab's channel keeps its
// first id, `untriaged`, so a person's channel settings carry over; `intake`
// is accepted as its other name.
export const CHANNELS = new Set(["decision", "failure", "untriaged"]);
const CHANNEL_ALIASES = new Map([["intake", "untriaged"]]);
const MAX_TITLE = 200;
const MAX_BODY = 2000;

// The dashboard path that opens one session (Kiro Crew `/chat?sid=<slot>`),
// or the Avoozl page when a notice names no session.
export function sessionUrl(slot) {
  if (typeof slot !== "string" || !slot) return "/apps/avoozl";
  const key = slot.startsWith("dashboard:")
    ? slot.slice("dashboard:".length)
    : slot;
  return "/chat?sid=" + encodeURIComponent(key);
}

const clip = (text, max) => {
  const value = String(text ?? "").trim();
  return value.length > max ? value.slice(0, max - 1).trimEnd() + "…" : value;
};

// The push body for one tick notice {channel, task?, slot?, title, text,
// resume}: what stopped, why, the action that resumes work, and the link.
export function notificationPayload(notice) {
  const channel = CHANNEL_ALIASES.get(notice?.channel) ?? notice?.channel;
  if (!CHANNELS.has(channel))
    fail("Choose notification channel decision, failure or untriaged.");
  const body = [notice.text, notice.resume].filter(Boolean).join("\n\n");
  return {
    channel,
    title: clip(notice.title || notice.text, MAX_TITLE),
    body: clip(body, MAX_BODY),
    url: sessionUrl(notice.slot),
    group_key: "avoozl:" + (notice.task || "workspace"),
  };
}

// Queue notices for the backend. The same notice twice is one row, so a
// repeated tick cannot notify twice. Returns the number of new rows.
export function queueNotifications(store, notices, now = Date.now()) {
  if (!notices?.length) return 0;
  const at = new Date(now).toISOString();
  return store.transaction(() => {
    let added = 0;
    for (const notice of notices) {
      const payload = notificationPayload(notice),
        id = createHash("sha256")
          .update(JSON.stringify(payload))
          .digest("hex")
          .slice(0, 32);
      if (store.get("app_notifications", id)) continue;
      store.put("app_notifications", {
        id,
        task: notice.task ?? null,
        slot: notice.slot ?? null,
        payload,
        queuedAt: at,
      });
      added += 1;
    }
    return added;
  });
}

// notifications.deliver: push every queued notice with `push(payload)` and
// mark each one sent. A failed push leaves its row queued for the next drain.
// `push` may instead be a list of sinks, [{id, push}], as the headless tick
// gives (deliverToSinks); the app backend's one Kiro Crew push is unchanged.
export async function deliverNotifications(store, push, now = Date.now()) {
  if (Array.isArray(push)) return deliverToSinks(store, push, now);
  if (!push) return { sent: 0, queued: queued(store).length, dormant: true };
  let sent = 0;
  const failures = [];
  for (const row of queued(store)) {
    try {
      await push(row.payload);
    } catch (error) {
      failures.push({ id: row.id, error: error.message });
      continue;
    }
    store.transaction(() =>
      store.put("app_notifications", {
        ...row,
        sentAt: new Date(now).toISOString(),
      }),
    );
    sent += 1;
  }
  return { sent, queued: queued(store).length, failures };
}

const queued = (store) =>
  store
    .list("app_notifications")
    .filter((row) => !row.sentAt)
    .reverse();

// Sent nowhere yet: not pushed to Kiro Crew and to no sink.
const unsent = (row) => !row.sentAt && !Object.keys(row.sentTo ?? {}).length;

// More than this many waiting at a sink's first send, or after an outage,
// go as one notice that counts them (NK7.7).
export const BACKLOG = 5;
// A failing sink waits 1, 2, 4 ... minutes before its next try, at most an
// hour (NK7.8).
const RETRY_BASE = 60_000;
const RETRY_MAX = 3_600_000;
const sinkKey = (id) => "notifications.sink." + id;

// One sink's record: when it was first seen, its failures in a row, and
// when it may be tried again.
function sinkState(store, id) {
  const saved = store.getMeta(sinkKey(id));
  return saved && typeof saved === "object" ? saved : null;
}

// The notice a backlog becomes: a count, on the most urgent channel.
function backlogPayload(rows) {
  const channel = rows.some((row) => row.payload.channel === "decision")
    ? "decision"
    : rows.some((row) => row.payload.channel === "failure")
      ? "failure"
      : "untriaged";
  return {
    channel,
    title: `${rows.length} Avoozl notifications waited`,
    body: "",
    url: sessionUrl(null),
    group_key: "avoozl:backlog",
  };
}

// Deliver to each sink on its own: each row records the sinks it reached in
// `sentTo`, so a sink that fails resends to none of the others, and never
// holds up the tick or another sink. A sink sees the rows queued since it
// first appeared and any row sent nowhere yet.
export async function deliverToSinks(store, sinks, now = Date.now()) {
  const at = new Date(now).toISOString(),
    results = [];
  for (const sink of sinks) {
    const state = sinkState(store, sink.id),
      since = state?.since ?? at;
    if (state?.retryAt && Date.parse(state.retryAt) > now) {
      results.push({ sink: sink.id, waiting: true, retryAt: state.retryAt });
      continue;
    }
    const pending = store
      .list("app_notifications")
      .reverse()
      .filter(
        (row) =>
          !row.sentTo?.[sink.id] &&
          (unsent(row) || (row.queuedAt ?? "") >= since),
      );
    const mark = (rows) =>
      store.transaction(() => {
        for (const row of rows) {
          const current = store.get("app_notifications", row.id) ?? row;
          store.put("app_notifications", {
            ...current,
            sentTo: { ...current.sentTo, [sink.id]: at },
          });
        }
      });
    let sent = 0,
      error = null;
    try {
      if ((!state || state.failures > 0) && pending.length > BACKLOG) {
        await sink.push(backlogPayload(pending), { row: null, store });
        mark(pending);
        sent = 1;
      } else
        for (const row of pending) {
          await sink.push(row.payload, { row, store });
          mark([row]);
          sent += 1;
        }
    } catch (caught) {
      error = caught?.message ?? String(caught);
    }
    const failures = error ? (state?.failures ?? 0) + 1 : 0;
    store.setMeta(sinkKey(sink.id), {
      since,
      failures,
      ...(error
        ? {
            error,
            retryAt: new Date(
              now + Math.min(RETRY_BASE * 2 ** (failures - 1), RETRY_MAX),
            ).toISOString(),
          }
        : {}),
    });
    results.push({ sink: sink.id, sent, ...(error ? { error } : {}) });
  }
  return { sinks: results, waiting: waitingNotifications(store, now) };
}

// What waits with no sink to take it: how many rows were sent nowhere, and
// the oldest one's age in seconds (NK7.6).
export function waitingNotifications(store, now = Date.now()) {
  const rows = store.list("app_notifications").filter(unsent);
  const oldest = rows
    .map((row) => row.queuedAt)
    .filter(Boolean)
    .sort()[0];
  return {
    count: rows.length,
    oldestAt: oldest ?? null,
    oldestAgeSeconds: oldest
      ? Math.max(0, Math.round((now - Date.parse(oldest)) / 1000))
      : null,
  };
}

// A push function for the app backend, or null when the gateway gave it no
// trusted callback origin (gateway-client.mjs).
export function gatewayPusher(env = process.env, request = fetch) {
  const client = gatewayClient(env, request);
  if (!client) return null;
  return async (payload) => {
    const response = await client.call("/api/notifications/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok)
      throw Error(`Kiro Crew refused the notification (${response.status}).`);
  };
}
