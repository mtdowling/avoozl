// An epic's lifecycle rows (Requirement 59.1, 102.18, design §4.32.6). Each
// row names a member plan and a step; whether it is done is derived from the
// member's current state, never from a checkbox in the epic's tasks.md, and
// a row is never dispatched.
//
// | Step      | Done when                                                   |
// | design    | the member exists and approval of its current revision was  |
// |           | requested (an approval pull request), or it is approved     |
// | review    | an approval of the member's current revision with verified  |
// |           | evidence: a merged approval whose re-hash matched, or an    |
// |           | explicit local approval                                     |
// | implement | the member's current revision is approved and every leaf    |
// |           | and person task is complete; none refused                   |
//
// shortcut: implement reads today's task completion; it moves to the
// journal's accepted outcomes (task-outcomes.mjs) once replay feeds
// readiness.
import { statusComplete } from "../../model.mjs";
import { completionReached, isRefused, taskKind } from "../../work-model.mjs";
import { epicRowsOf } from "../specs/spec-plans.mjs";

const approvalRequest = (store, plan) =>
  store.getMeta?.(`spec-approval:${plan.id}:${plan.hash}`) ?? null;

const currentApproval = (store, plan) =>
  store
    .list("approvals")
    .find((entry) => entry.planId === plan.id && entry.hash === plan.hash) ??
  null;

// Whether an approval receipt carries verified evidence (§4.32.6).
function verifiedApproval(receipt) {
  const evidence = receipt?.approval;
  if (!evidence) return false;
  if (evidence.kind === "local") return true;
  return evidence.kind === "pull-request" && evidence.verified === true;
}

function rowState(store, data, plan, step) {
  if (!plan) return { done: false, reason: "No plan for this spec yet." };
  const approval = currentApproval(store, plan);
  if (step === "design") {
    const request = approvalRequest(store, plan);
    return approval || ["open", "merged"].includes(request?.state)
      ? { done: true }
      : { done: false, reason: "Draft; approval not requested yet." };
  }
  if (!approval)
    return {
      done: false,
      reason:
        plan.state === "approved"
          ? "The spec changed since its approval."
          : "Not approved yet.",
    };
  if (step === "review")
    return verifiedApproval(approval)
      ? { done: true }
      : { done: false, reason: "The approval has no verified evidence." };
  const tasks = data.tasks.filter(
    (task) =>
      task.planId === plan.id &&
      taskKind(task) === "leaf" &&
      !task.archivedAt &&
      task.status !== "superseded",
  );
  if (tasks.some(isRefused))
    return { done: false, reason: "A person task was refused." };
  const complete = (status) => statusComplete(data, status),
    open = tasks.filter((task) => !completionReached(task, null, complete));
  return open.length
    ? { done: false, reason: `${open.length} of ${tasks.length} tasks open.` }
    : { done: true };
}

// The rows of an epic folder's files: [{key, plan, step, title, summary,
// planId, done, reason}].
export function epicRows(store, data, files) {
  const plans = store.list("plans").filter((plan) => !plan.deletedAt);
  return epicRowsOf(files).map((row) => {
    const plan = plans.find((entry) => entry.spec === row.plan) ?? null,
      { done, reason = null } = rowState(store, data, plan, row.step);
    return { ...row, planId: plan?.id ?? null, done, reason };
  });
}
