// Recheck execution authority at consumption; unrelated writes do not fence work.
import { sessionRequestHold } from "./session-bindings.mjs";
import { linePausedTaskIds } from "../flow/flow.mjs";
import {
  driverHeldTaskIds,
  readOnlyPlanIds,
} from "../workers/driver-scope.mjs";
import { hasRemoteTask, runnerSessionHold } from "../workers/remote-runner.mjs";

export function sessionStartHold(store, request, queued = {}) {
  const data = store.read();
  if (
    request.remote &&
    request.role === "worker" &&
    hasRemoteTask(store, request.task)
  )
    return runnerSessionHold(store, request.task);
  const task = data.tasks.find((task) => task.id === request.task);
  if (
    readOnlyPlanIds(store).has(task?.planId) ||
    (request.role !== "verifier" &&
      driverHeldTaskIds(store, data).has(request.task))
  )
    return "The task's driver holds this start.";
  const hold = sessionRequestHold(data, request.task, request.role);
  if (hold) return hold;
  if (request.role === "worker") {
    if (linePausedTaskIds(store, data).has(request.task))
      return "Stop the line holds this task.";
    const approval = queued.approval;
    if (approval) {
      const plan = store.get("plans", approval.planId);
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
