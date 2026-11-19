// Epics span plans (Requirement 59, design §6.9). A cross-plan epic is an
// approved epic folder's row in the snapshot's `epics`:
//
//   { id, title, planId, listed: [plan IDs], plans: [plan IDs] }
//
// `listed` is the member list of the epic's last approved revision, in its
// tasks.md order; `plans` is the part of it whose own approved front-matter
// names the epic back. Membership needs both sides, so a task's epic is
// always its plan's, and no task stores one.

// A row an approved epic folder wrote. Rows from before Requirement 59 (an
// Inbox, per-plan W1-W7 groups) have no `listed` and are not cross-plan
// epics; ownLegacyEpics gives each its plan.
const isCrossPlanEpic = (epic) =>
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

// Epic rows from before Requirement 59 have no planId: an Inbox, per-plan
// W1-W7 groups. Published tasks still name them in `epic`, so they stay,
// and each gets an owner (design §6.9, "Epics from before Requirement
// 59"):
//
// - a plan epic, `kind: "plan"`, when one plan owns it: the spec folder its
//   `context.document` is in, or else the one plan every task naming it
//   comes from;
// - a doc epic, `kind: "doc"`, standing for itself, `planId` its own ID,
//   when no single plan does.
//
// Rows that already have a planId are left alone, so a second run changes
// nothing. Returns the number of rows given an owner.
const SPEC_PATH = /^\.kiro\/specs\/([^/]+)\//;

export function ownLegacyEpics(data, plans) {
  const legacy = (data?.epics || []).filter(
    (epic) => epic && typeof epic.planId !== "string",
  );
  if (!legacy.length) return 0;
  const live = plans.filter((plan) => !plan.deletedAt),
    planOf = (document) => {
      const name = SPEC_PATH.exec(document ?? "")?.[1];
      return name
        ? (live.find((plan) => plan.spec === name)?.id ?? null)
        : null;
    },
    // The one plan a task comes from, or null when it names none or several.
    taskPlan = (task) => {
      if (task.planId) return task.planId;
      const found = new Set(
        [
          task.source?.document,
          ...(task.sourceReferences || []).map((ref) => ref?.document),
          ...(task.contextDocuments || []),
        ]
          .map(planOf)
          .filter(Boolean),
      );
      return found.size === 1 ? [...found][0] : null;
    };
  for (const epic of legacy) {
    let owner = planOf(epic.context?.document);
    if (!owner) {
      const owners = new Set(
        (data.tasks || [])
          .filter((task) => task.epic === epic.id)
          .map(taskPlan),
      );
      owner = owners.size === 1 ? [...owners][0] : null;
    }
    epic.kind = owner ? "plan" : "doc";
    epic.planId = owner ?? epic.id;
  }
  return legacy.length;
}

// No write drops an epic row a stored task still names. Each row of
// `sources` (the stored snapshot's rows, then the import baseline's) that
// `data` lacks and a task in `data` names is put back, once. The baseline
// brings back rows an approval dropped before this rule. Returns the IDs
// put back.
export function keepNamedEpics(data, ...sources) {
  const have = new Set((data.epics || []).map((epic) => epic.id)),
    named = new Set((data.tasks || []).map((task) => task.epic)),
    back = [];
  for (const epic of sources.flat())
    if (epic?.id && !have.has(epic.id) && named.has(epic.id)) {
      have.add(epic.id);
      back.push(structuredClone(epic));
    }
  if (back.length) data.epics = [...(data.epics || []), ...back];
  return back.map((epic) => epic.id);
}
