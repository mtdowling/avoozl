import { hasPendingSpecDependencies } from "./spec-dependencies.mjs";
import { activityState } from "./activity.mjs";
import { statusComplete } from "./query.mjs";

const indexes = new WeakMap();
function taskIndex(data) {
  if (indexes.has(data)) return indexes.get(data);
  const tasks = new Map(data.tasks.map((task) => [task.id, task]));
  const prerequisites = new Map(),
    dependents = new Map();
  for (const edge of data.edges) {
    if (!["requires", "sequence"].includes(edge.kind)) continue;
    if (!prerequisites.has(edge.to)) prerequisites.set(edge.to, []);
    if (!dependents.has(edge.from)) dependents.set(edge.from, []);
    prerequisites.get(edge.to).push(edge.from);
    dependents.get(edge.from).push(edge.to);
  }
  const index = { tasks, prerequisites, dependents };
  indexes.set(data, index);
  return index;
}

export function taskSignals(data, task, now = Date.now()) {
  const index = taskIndex(data);
  const pending = new Set(
    (task.pendingSpecDependencies || [])
      .filter((entry) => ["requires", "sequence"].includes(entry.kind))
      .map((entry) => entry.taskId),
  );
  const blockers = [
    ...new Set([...(index.prerequisites.get(task.id) || []), ...pending]),
  ].filter(
    (id) =>
      pending.has(id) || !statusComplete(data, index.tasks.get(id)?.status),
  );
  const dependents = [...new Set(index.dependents.get(task.id) || [])].filter(
    (id) => !statusComplete(data, index.tasks.get(id)?.status),
  );
  const complete =
    !hasPendingSpecDependencies(task) && statusComplete(data, task.status);
  const review =
    task.needsReview || task.source?.removed || task.status === "review";
  const ready =
    !complete &&
    !hasPendingSpecDependencies(task) &&
    !review &&
    !["blocked", "deferred"].includes(task.status) &&
    blockers.length === 0;
  return {
    blockers,
    dependents,
    complete,
    review: Boolean(review),
    ready,
    activity: activityState(task, now),
  };
}

export function isPlanInventory(data, task) {
  const document = data.documents[task.source?.document];
  return Boolean(
    task.tags?.some((tag) => ["historical", "plan-inventory"].includes(tag)) ||
      document?.historical ||
      document?.plan?.status === "abandoned",
  );
}
