// Recheck execution authority at consumption; unrelated writes do not fence work.
import { sessionRequestHold } from "./session-bindings.ts";
import { linePausedTaskIds } from "../flow/flow.ts";

import type { Store } from "../store/store.ts";

export function sessionStartHold(
  store: Store,
  request: { task: string; role: string },
  queued: { approval?: { planId: string; hash?: string } | null } = {},
) {
  const data = store.read();
  const hold = sessionRequestHold(data, request.task, request.role);
  if (hold) return hold;
  if (request.role === "worker") {
    if (linePausedTaskIds(store, data).has(request.task))
      return "Stop the line holds this task.";
    const approval = queued.approval;
    if (approval) {
      const plan = store.get<{
        id: string;
        archivedAt?: string;
        state?: string;
        hash?: string;
      }>("plans", approval.planId);
      if (
        !plan ||
        plan.archivedAt ||
        plan.state !== "approved" ||
        plan.hash !== approval.hash
      )
        return "The queued task's approved plan changed.";
    }
  }
  return null;
}
