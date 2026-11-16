// Recheck execution authority at consumption; unrelated writes do not fence work.
import { sessionRequestHold } from "./session-bindings.mjs";
import { budgetHeldTaskIds } from "./budget.mjs";
import { linePausedTaskIds } from "./flow.mjs";
import { driverHeldTaskIds, readOnlyPlanIds } from "./driver-scope.mjs";
import { hasRemoteTask, runnerSessionHold } from "./remote-runner.mjs";

export function sessionStartHold(store, request, queued = {}) {
  const data = store.read();
  if (["plan-review", "plan-answer"].includes(request.role)) {
    const round = store.get("review_rounds", request.task),
      plan = round && store.get("plans", round.planId);
    if (!round || !plan || plan.archivedAt || plan.deletedAt)
      return "The review round or its plan is no longer available.";
    if (readOnlyPlanIds(store).has(plan.id))
      return "This workspace does not drive the review plan.";
    if (
      request.context?.revisionHash &&
      request.context.revisionHash !== plan.hash
    )
      return "The queued review revision changed.";
    if (request.role === "plan-review") {
      if (
        round.state !== "running" ||
        round.slot ||
        plan.hash !== round.revisionHash ||
        plan.state === "approved" ||
        request.model !== round.reviewerModel
      )
        return "The reviewer round, revision, or model changed.";
    } else {
      const answer = store.get("receipts", `plan-answer:${round.id}`);
      if (
        round.state !== "done" ||
        answer?.kind !== "plan-answer" ||
        answer.roundId !== round.id ||
        answer.planId !== plan.id ||
        answer.state !== "queued" ||
        answer.slot
      )
        return "The planner answer is no longer queued.";
      if (
        !store
          .list("review_threads")
          .some(
            (thread) =>
              thread.source === "plan-review" &&
              thread.roundId === round.id &&
              !thread.answer,
          )
      )
        return "No review findings still need an answer.";
      if (request.permissionClass === "write" && plan.state === "approved")
        return "An approved plan cannot start a queued write session.";
    }
    return null;
  }
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
    if (budgetHeldTaskIds(store).has(request.task))
      return "The task budget holds this start.";
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
