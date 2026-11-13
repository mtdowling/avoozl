// Epics span plans (Requirement 59, design §6.9). The snapshot's `epics`
// rows are cross-plan epics only: each is an approved epic folder with
//
//   { id, title, planId, listed: [plan IDs], plans: [plan IDs] }
//
// `listed` is the member list of the epic's last approved revision, in its
// tasks.md order; `plans` is the part of it whose own approved front-matter
// names the epic back. Membership needs both sides, so a task's epic is
// always its plan's, and no task stores one.

// A row an approved epic folder wrote. Rows from before Requirement 59 (an
// Inbox, per-plan W1-W7 groups, `doc:` groups) have no planId and are read
// by nothing.
export const isCrossPlanEpic = (epic) =>
  Boolean(
    epic && typeof epic.planId === "string" && Array.isArray(epic.listed),
  );

export function crossPlanEpics(data) {
  return (data?.epics || []).filter(isCrossPlanEpic);
}

// The epic that holds a plan, or null.
export function epicOfPlan(data, planId) {
  if (!planId) return null;
  return (
    crossPlanEpics(data).find((epic) => (epic.plans || []).includes(planId)) ||
    null
  );
}

export const taskEpic = (data, task) =>
  epicOfPlan(data, task?.planId)?.id ?? null;

// Recompute each epic's confirmed members from the plans' approved epic
// key. `plans` maps plan ID to its record; a deleted or archived-away plan
// is no member.
export function refreshEpicMembers(data, plans) {
  for (const epic of crossPlanEpics(data))
    epic.plans = epic.listed.filter((id) => {
      const plan = plans.get(id);
      return plan && !plan.deletedAt && plan.epic === epic.id;
    });
}
