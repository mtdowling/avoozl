// What the Kiro Crew cron's `plans_maintain tick` call does (MS12.1, design
// D5): record the sessions it observed, then return the `kirocrew` starts and
// messages the machine server's tick released, and the chats to re-trust. It
// never reaches the planner: the machine server's loop owns that.
//
// F129 (branch `spec/node-tick`): a Node process cannot open or control a chat,
// because Kiro Crew refuses a session another cron job opened (not_creator),
// so the cron that opened a chat stays the one that sends to it and sets its
// trust mode. That is the only reason this call exists.
import { pendingSessionRequests } from "../../sessions/session-requests.mjs";
import {
  FINAL_STATUSES,
  listSessionBindings,
} from "../../sessions/session-bindings.mjs";
import { readReleased, recordRoster, sessionList } from "../../tick/tick.mjs";

export function cronIntents(store, input = {}) {
  const roster = sessionList(input.sessions);
  if (roster) recordRoster(store, roster);
  const released = readReleased(store);
  const pending = pendingSessionRequests(store, "kirocrew");
  return {
    observe: listSessionBindings(store)
      .filter((b) => !FINAL_STATUSES.has(b.status))
      .map(({ slot, taskId, role }) => ({ slot, taskId, role })),
    dispatch: pending.filter(
      (request) =>
        request.operation === "start" && released.starts.has(request.id),
    ),
    messages: pending.filter(
      (request) =>
        request.operation === "send" && released.sends.has(request.id),
    ),
    notify: [],
  };
}
