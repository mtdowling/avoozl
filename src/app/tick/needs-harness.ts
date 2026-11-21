// @ts-nocheck: typing debt
// A role whose harness cannot start on this machine's server (MS5.3). The
// headless tick finds each pending `process` start whose harness has a start
// problem and opens one Needs you item per role; the drain leaves those starts
// queued. The item goes when the harness can start.
import { rowFor } from "../agents/role-table.ts";
import { listHarnessDefinitions } from "../executors/harness-definitions.ts";
import { requestHarness } from "../executors/process.ts";
import { pendingSessionRequests } from "../sessions/session-requests.ts";
import { recordWaitingRoles } from "./waiting-roles.ts";

const ITEMS = "needs-harness.items";

// Harness name to its start problem, for every approved definition that has one.
export const blockedHarnesses = (configDirectory) =>
  new Map(
    listHarnessDefinitions(configDirectory)
      .filter((definition) => definition.approved && definition.startProblem)
      .map((definition) => [definition.name, definition.startProblem]),
  );

// Record one item per role with a start waiting on a blocked harness.
export function needsHarnessStep(store, blocked, now = Date.now()) {
  const entries = [];
  for (const request of pendingSessionRequests(store, "process")) {
    if (request.operation === "send") continue;
    const harness = requestHarness(store, request);
    const problem = blocked.get(harness);
    if (problem)
      entries.push({
        role: rowFor(request.role)?.setting ?? request.role,
        id: request.id,
        extra: { harness, problem },
      });
  }
  return recordWaitingRoles(store, ITEMS, entries, now);
}

export const needsHarnessItems = (store) =>
  Object.values(store.getMeta(ITEMS) ?? {}).map((item) => ({
    kind: "needs-harness",
    id: `needs-harness:${item.role}`,
    taskId: null,
    role: item.role,
    title: `${item.role} cannot start on ${item.harness}`,
    detail: `${item.requests.length} session${item.requests.length === 1 ? "" : "s"} for ${item.role} wait. ${item.problem}`,
    choices: [],
    openedAt: item.since,
  }));
