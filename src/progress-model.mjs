import { crossPlanEpics, taskEpic } from "./app/epics.mjs";
import { statusComplete } from "./query.mjs";
import { isArchivedTask } from "./browse-model.mjs";

export function taskProgress(data, task) {
  if (statusComplete(data, task.status)) return 1;
  const value = task.progressPercent;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(99, value)) / 100
    : 0;
}

// Explicit order/date wins; undated tasks keep their source/JSON plan order.
// updatedAt is an edit timestamp, never a historical completion date.
export function chronologicalTasks(tasks) {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const x = a.task.timeline || {},
        y = b.task.timeline || {};
      if (Number.isFinite(x.order) || Number.isFinite(y.order))
        return (
          (x.order ?? Infinity) - (y.order ?? Infinity) || a.index - b.index
        );
      const xd = Date.parse(x.at || a.task.createdAt || ""),
        yd = Date.parse(y.at || b.task.createdAt || "");
      if (Number.isFinite(xd) && Number.isFinite(yd))
        return xd - yd || a.index - b.index;
      if (Number.isFinite(xd) !== Number.isFinite(yd))
        return Number.isFinite(xd) ? -1 : 1;
      if (
        a.task.source?.document &&
        a.task.source.document === b.task.source?.document
      )
        return (
          a.task.source.lineStart - b.task.source.lineStart || a.index - b.index
        );
      return a.index - b.index;
    })
    .map((item) => item.task);
}

export function epicProgress(data, { scope = "all", matchingIds = null } = {}) {
  const tasks = data.tasks.filter(
    (t) =>
      (scope === "all" || t.scope === scope) &&
      (!isArchivedTask(data, t) || matchingIds?.has(t.id)),
  );
  const byEpic = new Map();
  // Epics span plans (Requirement 59): a task's epic is its plan's, and a
  // task in no epic is under No epic, never a document or path.
  for (const task of tasks) {
    const key = taskEpic(data, task) || "unassigned";
    if (!byEpic.has(key)) byEpic.set(key, []);
    byEpic.get(key).push(task);
  }
  const palette = data.project.presentation?.epicPalette || [
    "#a7b8ff",
    "#71cfbd",
    "#e5b979",
    "#cbabef",
    "#81bed5",
    "#91d79b",
    "#e4a0c0",
  ];
  const epicById = new Map(crossPlanEpics(data).map((e) => [e.id, e])),
    ordered = [...new Set([...epicById.keys(), ...byEpic.keys()])].filter(
      (id) => byEpic.has(id),
    );
  return ordered.map((id, index) => {
    const epic = epicById.get(id);
    const items = chronologicalTasks(byEpic.get(id));
    const complete = items.filter((t) => statusComplete(data, t.status)).length;
    const matches = matchingIds
      ? items.filter((t) => matchingIds.has(t.id)).length
      : items.length;
    return {
      id,
      title: epic?.title || (id === "unassigned" ? "No epic" : id),
      summary: epic?.summary || "",
      color: epic?.color || palette[index % palette.length],
      tasks: items,
      complete,
      total: items.length,
      percent: Math.round((complete / items.length) * 100),
      matches,
    };
  });
}
