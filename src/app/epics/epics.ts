// Epics span plans (Requirement 59, design §6.9). A cross-plan epic is an
// approved epic folder's row in the snapshot's `epics`:
//
//   { id, title, planId, listed: [plan IDs], plans: [plan IDs] }
//
// `listed` is the member list of the epic's last approved revision, in its
// tasks.md order; `plans` is the part of it whose own approved front-matter
// names the epic back. Membership needs both sides, so a task's epic is
// always its plan's, and no task stores one.

import type { Task } from "../../types.ts";

// A cross-plan epic row.
export interface Epic {
  id: string;
  title?: string;
  planId: string;
  listed: string[];
  plans?: string[];
  [key: string]: unknown;
}
// An epic row from before Requirement 59, until ownLegacyEpics gives it one.
type LegacyEpic = {
  id: string;
  planId?: unknown;
  kind?: string;
  context?: { document?: string } | null;
  [key: string]: unknown;
};
// The snapshot fields these read: its epic rows and tasks.
type EpicData =
  | {
      epics?: readonly unknown[];
      tasks?: readonly Task[];
      [key: string]: unknown;
    }
  | null
  | undefined;
type PlanRecord = {
  id: string;
  spec?: string;
  epic?: string;
  deletedAt?: string;
};

// A row an approved epic folder wrote. Rows from before Requirement 59 (an
// Inbox, per-plan W1-W7 groups) have no `listed` and are not cross-plan
// epics; ownLegacyEpics gives each its plan.
const isCrossPlanEpic = (epic: unknown): epic is Epic =>
  Boolean(
    epic &&
      typeof (epic as Epic).planId === "string" &&
      Array.isArray((epic as Epic).listed),
  );

export function crossPlanEpics(data: EpicData): Epic[] {
  return (data?.epics || []).filter(isCrossPlanEpic);
}

// The epic that holds a plan, or null.
export function epicOfPlan(data: EpicData, planId: unknown) {
  if (!planId) return null;
  return (
    crossPlanEpics(data).find((epic) =>
      (epic.plans || []).includes(planId as string),
    ) || null
  );
}

export const taskEpic = (
  data: EpicData,
  task: { planId?: unknown; [key: string]: unknown } | null | undefined,
) => epicOfPlan(data, task?.planId)?.id ?? null;

// Recompute each epic's confirmed members from the plans' approved epic
// key. `plans` maps plan ID to its record; a deleted or archived-away plan
// is no member.
export function refreshEpicMembers(
  data: EpicData,
  plans: Map<string, PlanRecord>,
) {
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

export function ownLegacyEpics(data: EpicData, plans: PlanRecord[]) {
  const legacy = (data?.epics || []).filter(
    (epic): epic is LegacyEpic =>
      Boolean(epic) && typeof (epic as LegacyEpic).planId !== "string",
  );
  if (!legacy.length) return 0;
  const live = plans.filter((plan) => !plan.deletedAt),
    planOf = (document: string | null | undefined) => {
      const name = SPEC_PATH.exec(document ?? "")?.[1];
      return name
        ? (live.find((plan) => plan.spec === name)?.id ?? null)
        : null;
    },
    // The one plan a task comes from, or null when it names none or several.
    taskPlan = (task: Task) => {
      if (task.planId) return task.planId;
      const found = new Set(
        [
          task.source?.document,
          ...(task.sourceReferences || []).map((ref) => ref?.document),
          ...((task.contextDocuments as string[] | undefined) || []),
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
        (data?.tasks || [])
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
// `sources` (the stored snapshot's rows) that `data` lacks and a task in
// `data` names is put back, once. Returns the IDs put back.
export function keepNamedEpics(
  data: { epics?: { id?: string }[]; tasks?: readonly Task[] },
  ...sources: (readonly ({ id?: string } | null)[] | undefined)[]
) {
  const have = new Set((data.epics || []).map((epic) => epic.id)),
    named = new Set((data.tasks || []).map((task) => task.epic)),
    back: { id: string }[] = [];
  for (const epic of sources.flat())
    if (epic?.id && !have.has(epic.id) && named.has(epic.id)) {
      have.add(epic.id);
      back.push(structuredClone(epic as { id: string }));
    }
  if (back.length) data.epics = [...(data.epics || []), ...back];
  return back.map((epic) => epic.id);
}
