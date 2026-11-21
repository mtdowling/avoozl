import { resolveTaskId, taskSourceRefs } from "./task-identity.ts";
import { activityErrors } from "./activity.ts";
import { edgeErrors, workModelErrors } from "./work-model.ts";
import { createHash } from "node:crypto";
import type { Snapshot, Task } from "./types.ts";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
// Done, recorded, archived and superseded tasks are never sent back for
// review.
export function reviewSettled(data: Pick<Snapshot, "statuses">, task: Task) {
  const status = (data.statuses || []).find((s) => s.id === task.status);
  return (
    Boolean(status?.complete || status?.archived) ||
    ["recorded", "archived", "superseded"].includes(task.status)
  );
}
export { statusComplete, graphNeighbors, queryTasks } from "./query.ts";
export function validate(data: Snapshot) {
  const errors: string[] = [];
  if (data.schemaVersion !== 1) errors.push("Unsupported schemaVersion");
  const ids = new Set<string>(),
    statuses = new Set(data.statuses.map((s) => s.id));
  for (const task of data.tasks) {
    errors.push(...activityErrors(task), ...workModelErrors(task));
    if (ids.has(task.id)) errors.push("Repeated task " + task.id);
    ids.add(task.id);
    if (!statuses.has(task.status)) errors.push("Unknown status " + task.id);
    if (!task.title) errors.push("Missing title " + task.id);
    if (task.source && !data.documents[task.source.document])
      errors.push("Missing document " + task.id);
  }
  for (const [alias, target] of Object.entries(data.taskAliases || {})) {
    try {
      if (ids.has(alias) || !ids.has(resolveTaskId(data, target)))
        errors.push("Invalid task alias " + alias);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  for (const task of data.tasks)
    for (const ref of taskSourceRefs(task))
      if (!data.documents[ref.document])
        errors.push("Missing source reference " + task.id + " " + ref.document);
  const edgeIds = new Set();
  for (const e of data.edges) {
    if (e.id && edgeIds.has(e.id)) errors.push("Repeated edge " + e.id);
    if (e.id) edgeIds.add(e.id);
  }
  const graph = new Map<string, string[]>();
  for (const edge of data.edges) {
    errors.push(...edgeErrors(edge));
    if (!ids.has(edge.from) || !ids.has(edge.to))
      errors.push("Dangling edge " + edge.from + " → " + edge.to);
    if (edge.from === edge.to) errors.push("Self edge " + edge.from);
    if (edge.kind === "requires") {
      if (!graph.has(edge.from)) graph.set(edge.from, []);
      graph.get(edge.from)!.push(edge.to);
    }
  }
  const seen = new Set<string>(),
    active = new Set<string>();
  function walk(id: string) {
    if (active.has(id)) {
      errors.push("Dependency cycle " + id);
      return;
    }
    if (seen.has(id)) return;
    active.add(id);
    for (const x of graph.get(id) || []) walk(x);
    active.delete(id);
    seen.add(id);
  }
  for (const id of ids) walk(id);
  return errors;
}
// One line for a failed write: errors of one kind are counted, with the
// first as the example, so 140 repeated edges read as one clause.
export function summarizeErrors(errors: string[]) {
  const groups = new Map<string, string[]>();
  for (const error of errors) {
    const kind = error.split(" ").slice(0, 2).join(" ");
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind)!.push(error);
  }
  return [...groups]
    .map(([kind, list]) =>
      list.length === 1
        ? list[0]
        : `${kind} ×${list.length}, e.g. ${list[0].slice(kind.length + 1)}`,
    )
    .join("; ");
}
