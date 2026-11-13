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
import { gatewayClient } from "./gateway-client.mjs";
import { fail } from "./store.mjs";

// app.json notifications.channels ids.
export const CHANNELS = new Set(["decision", "failure", "untriaged"]);
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
  if (!CHANNELS.has(notice?.channel))
    fail("Choose notification channel decision or failure.");
  const body = [notice.text, notice.resume].filter(Boolean).join("\n\n");
  return {
    channel: notice.channel,
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
export async function deliverNotifications(store, push, now = Date.now()) {
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
