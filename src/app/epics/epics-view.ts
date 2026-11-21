// The Epics screen's read (RC8, experience proposal): epic > spec > phase with
// Avoozl's own release state (phase gate, release count, held reason), the
// specs that are not on GitHub yet. Read only. The Release queue rows carry each held reason; this file only groups.
import { statusComplete } from "../../model.ts";
import { crossPlanEpics } from "./epics.ts";
import { stageResults } from "../plugins/check-stages.ts";
import { specTasks } from "../specs/spec-tasks.ts";
import type { Store } from "../store/store.ts";
import type { Snapshot, Task } from "../../types.ts";

// A task with the release fields this view reads.
type ViewTask = Task & {
  phase?: { id?: string; title?: string } | null;
  crewHold?: { number?: number } | null;
};
// One Release queue row.
type QueueRow = { taskId: string; state?: string; reason?: string | null };
type Plan = {
  id: string;
  title?: string;
  state?: string;
  files?: Record<string, string>;
};

const phaseOf = (task: ViewTask) => task.phase?.id ?? "";

function phasesOf(data: Snapshot, rows: QueueRow[], tasks: ViewTask[]) {
  const row = new Map(rows.map((entry) => [entry.taskId, entry]));
  const done = (task: ViewTask) => statusComplete(data, task.status);
  let before = true;
  return [...new Set(tasks.map(phaseOf))].map((id) => {
    const mine = tasks.filter((task) => phaseOf(task) === id),
      merged = mine.filter(done).length,
      released = mine.filter(
        (task) =>
          done(task) ||
          ["released", "claimed"].includes(String(row.get(task.id)?.state)),
      ).length,
      // A handback comes first: a person must answer before anything moves.
      handed = mine.find((task) => task.crewHold),
      held = handed
        ? `Handed back: answer issue #${handed.crewHold?.number} on GitHub.`
        : (mine
            .map((task) => row.get(task.id))
            .find((entry) => entry?.state === "held")?.reason ?? null),
      gate = merged === mine.length ? "passed" : before ? "open" : "closed";
    before = before && merged === mine.length;
    return {
      id,
      title: mine[0].phase?.title ?? (id || "No phase"),
      gate,
      total: mine.length,
      merged,
      released,
      held,
    };
  });
}

// A draft has no tasks in the graph yet: count the checkbox lines in its
// task list.
const listedTasks = (plan: Plan) =>
  (
    String(specTasks(plan.files ?? {})?.text ?? "").match(
      /^\s*- \[[ xX]\]\s+\S/gm,
    ) ?? []
  ).length;

// What stops a spec from being coded, in words for the page.
function whyUnprojected(plan: Plan, tasks: Task[]) {
  if (plan.state !== "approved")
    return "Draft spec. Not approved. Approve it in the Spec Builder chat or its side panel.";
  return tasks.some((task) => task.repository)
    ? "Approved, not on GitHub yet. Preview the issues to project it."
    : "Local-only spec. It cannot be coded until a GitHub repository is attached.";
}

export function epicsView(
  store: Store,
  queue: { repositories: { rows: QueueRow[] }[] },
) {
  const data = store.read(),
    epicsOf = crossPlanEpics(data),
    stages = stageResults(store),
    plans = new Map(store.list<Plan>("plans").map((plan) => [plan.id, plan])),
    rows = queue.repositories.flatMap((entry) => entry.rows),
    tasksOf = (planId: string): ViewTask[] =>
      data.tasks.filter((task) => task.planId === planId),
    onGitHub = (planId: string) =>
      tasksOf(planId).some((task) => task.github?.number),
    inEpic = new Set(epicsOf.flatMap((epic) => epic.plans ?? [])),
    epicPlans = new Set(epicsOf.map((epic) => epic.planId)),
    planView = (planId: string) => ({
      id: planId,
      title: plans.get(planId)?.title ?? planId,
      state: plans.get(planId)?.state ?? "approved",
      // Each phase's plugin checks on this machine (plugin-checks D10).
      phases: phasesOf(data, rows, tasksOf(planId)).map((phase) => ({
        ...phase,
        pluginChecks: stages.phases[`${planId}:${phase.id}`] ?? null,
      })),
    }),
    // A spec on GitHub with no epic is its own group.
    groups = [
      ...epicsOf.map((epic) => ({
        id: epic.id,
        title: epic.title ?? epic.id,
        planIds: epic.plans ?? [],
      })),
      ...[...plans.values()]
        .filter(
          (plan) =>
            !inEpic.has(plan.id) &&
            !epicPlans.has(plan.id) &&
            onGitHub(plan.id),
        )
        .map((plan) => ({
          id: plan.id,
          title: plan.title,
          planIds: [plan.id],
        })),
    ];
  const epics = groups.map((group) => {
    const tasks = group.planIds.flatMap(tasksOf);
    return {
      id: group.id,
      title: group.title,
      tasks: tasks.length,
      merged: tasks.filter((task) => statusComplete(data, task.status)).length,
      running: tasks.filter(
        (task) =>
          rows.find((row) => row.taskId === task.id)?.state === "claimed",
      ).length,
      plans: group.planIds.map(planView),
    };
  });
  const unprojected = [...plans.values()]
    .filter((plan) => !epicPlans.has(plan.id) && !onGitHub(plan.id))
    .map((plan) => ({
      id: plan.id,
      title: plan.title,
      state: plan.state,
      tasks: tasksOf(plan.id).length || listedTasks(plan),
      reason: whyUnprojected(plan, tasksOf(plan.id)),
    }));
  return { epics, unprojected };
}
