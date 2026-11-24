// What the Kiro Crew cron's `plans_maintain tick` call returns after the tick
// pass it runs (MS12.1, design D5): record the sessions it observed, then
// return the `kirocrew` starts and messages the pass released, and the chats
// to re-trust. This step itself never reaches the planner.
//
// F129 (branch `spec/node-tick`): a Node process cannot open or control a chat,
// because Kiro Crew refuses a session another cron job opened (not_creator),
// so the cron that opened a chat stays the one that sends to it and sets its
// trust mode. That is the only reason this call exists.
import {
  pendingSessionRequests,
  type SessionRequest,
} from "../../sessions/session-requests.ts";
import {
  FINAL_STATUSES,
  listSessionBindings,
} from "../../sessions/session-bindings.ts";
import { readReleased, recordRoster, sessionList } from "../../tick/tick.ts";
import type { Store } from "../../store/store.ts";

// The script cron serves every enabled workspace in one run. This private
// transport field keeps an intent on its originating workspace until the
// opened chat is bound there; it is never stored in the session request.
export const KIROCREW_WORKSPACE_FIELD = "_avoozlWorkspaceId";
const fromWorkspace = (request: SessionRequest, workspaceId?: string | null) =>
  workspaceId
    ? { ...request, [KIROCREW_WORKSPACE_FIELD]: workspaceId }
    : request;

export function cronIntents(
  store: Store,
  input: { sessions?: unknown } = {},
  workspaceId: string | null = null,
) {
  const roster = sessionList(input.sessions);
  if (roster) recordRoster(store, roster);
  const released = readReleased(store);
  const pending = pendingSessionRequests(store, "kirocrew");
  return {
    observe: listSessionBindings(store)
      .filter((b) => !FINAL_STATUSES.has(String(b.status)))
      .map(({ id, slot, taskId, role, lane, title }) => ({
        slot,
        taskId,
        role,
        // A lane chat's current binding names its lane and fixed header, so
        // the cron keeps its trust and title.
        ...(lane && id === slot ? { lane, header: title } : {}),
      })),
    dispatch: pending
      .filter(
        (request) =>
          request.operation === "start" && released.starts.has(request.id),
      )
      .map((request) => fromWorkspace(request, workspaceId)),
    messages: pending
      .filter(
        (request) =>
          request.operation === "send" && released.sends.has(request.id),
      )
      .map((request) => fromWorkspace(request, workspaceId)),
    notify: [],
  };
}
