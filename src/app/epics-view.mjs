// The Epics screen's read (RC8, experience proposal): epic > spec > phase with
// Avoozl's own release state (phase gate, release count, held reason), the
// specs that are not on GitHub yet, and where Issue Radar's graph is. Read
// only. The Release queue rows carry each held reason; this file only groups.
import { statusComplete } from "../model.mjs";

// Issue Radar's page. Its Graph view and the issue it focuses on are kept in
// the browser's local storage and have no address, so the link is the tab.
export const RADAR_GRAPH = Object.freeze({ url: "/issue-radar", focus: false });

const phaseOf = (task) => task.phase?.id ?? "";

function phasesOf(data, rows, tasks) {
  const row = new Map(rows.map((entry) => [entry.taskId, entry]));
  const done = (task) => statusComplete(data, task.status);
  let before = true;
  return [...new Set(tasks.map(phaseOf))].map((id) => {
    const mine = tasks.filter((task) => phaseOf(task) === id),
      merged = mine.filter(done).length,
      released = mine.filter(
        (task) =>
          done(task) ||
          ["released", "claimed"].includes(row.get(task.id)?.state),
      ).length,
      // A handback comes first: a person must answer before anything moves.
      handed = mine.find((task) => task.crewHold),
      held = handed
        ? `Handed back: answer issue #${handed.crewHold.number} on GitHub.`
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
// tasks.md.
const listedTasks = (plan) =>
  (String(plan.files?.["tasks.md"] ?? "").match(/^\s*- \[[ xX]\]\s+\S/gm) ?? [])
    .length;

// What stops a spec from being coded, in words for the page.
function whyUnprojected(plan, tasks) {
  if (plan.state !== "approved")
    return "Draft spec. Not approved. Approve it in the Spec Builder chat or its side panel.";
  return tasks.some((task) => task.repository)
    ? "Approved, not on GitHub yet. Preview the issues to project it."
    : "Local-only spec. It cannot be coded until a GitHub repository is attached.";
}

export function epicsView(store, queue) {
  const data = store.read(),
    epicsOf = data.epics ?? [],
    plans = new Map(store.list("plans").map((plan) => [plan.id, plan])),
    rows = queue.repositories.flatMap((entry) => entry.rows),
    tasksOf = (planId) => data.tasks.filter((task) => task.planId === planId),
    onGitHub = (planId) => tasksOf(planId).some((task) => task.github?.number),
    inEpic = new Set(epicsOf.flatMap((epic) => epic.plans ?? [])),
    epicPlans = new Set(epicsOf.map((epic) => epic.planId)),
    planView = (planId) => ({
      id: planId,
      title: plans.get(planId)?.title ?? planId,
      state: plans.get(planId)?.state ?? "approved",
      phases: phasesOf(data, rows, tasksOf(planId)),
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
  return { epics, unprojected, radarGraph: RADAR_GRAPH };
}
