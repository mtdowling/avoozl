import { hasPendingSpecDependencies } from "./spec-dependencies.mjs";
// Work model fields from design §3.2 and §4.3. Rows written before these
// fields existed are read through the defaults below; nothing rewrites them.
// An epic is a goal across plans, never a task (Requirement 59.7).
export const TASK_KINDS = ["package", "leaf"];
// Kinds stored before the work model. They read as leaves so that readiness
// and dispatch of existing workspaces do not change.
// "epic" is a row approved before Requirement 59 (see taskKind).
const LEGACY_TASK_KINDS = ["task", "milestone", "epic"];
export const COMPLETIONS = [
  "merged-pr",
  "integrated",
  "released",
  "answered",
  "person",
];
const SOURCE = /^(?:local|github)$/;

export const isSource = (value) =>
  typeof value === "string" && SOURCE.test(value);

// shortcut: a row approved before Requirement 59 may still say "epic"; it
// reads as the package it now is until its plan's next approval rewrites
// it. No manifest or proposal can write "epic" any more.
export function taskKind(task) {
  if (task?.kind === "epic") return "package";
  return TASK_KINDS.includes(task?.kind) ? task.kind : "leaf";
}

// A row linked to a GitHub issue is a cache of that issue (§3.2).
export function taskAuthority(task) {
  if (isSource(task?.authority)) return task.authority;
  return task?.github && (task.github.number || task.github.nodeId)
    ? "github"
    : "local";
}

// Every task Avoozl codes is delivered locally and lands through the queue;
// an old `route: github` means the same (R102.20).
export function taskRoute() {
  return "local";
}

// A leaf only a person does (Requirement 61.9): never dispatched, marked
// done by a person, complete at every level once done. A row stored with
// completion "person" and no manual flag reads as manual.
export const isManual = (task) =>
  (task?.manual === true || task?.completion === "person") &&
  taskKind(task) === "leaf";

// A manual leaf a person settled as refused (a no-go): it never completes,
// so its dependents stay held until a person reopens it.
export const isRefused = (task) =>
  isManual(task) && task.manualDone?.choice === "refused";

export function taskCompletion(task) {
  if (isManual(task)) return "person";
  if (COMPLETIONS.includes(task?.completion)) return task.completion;
  return "integrated";
}

// The newest task in `id`'s supersede chain (§5.2, R39.2). Readiness judges
// an edge from a replaced task by its replacement; edges are never rewritten,
// because plan approval rebuilds plan edges. A broken or cyclic chain stops
// at the last task it reached.
export function supersedingTask(byId, id) {
  let task = byId.get(id);
  const seen = new Set();
  while (task?.supersededBy && !seen.has(task.id)) {
    seen.add(task.id);
    const next = byId.get(task.supersededBy);
    if (!next) break;
    task = next;
  }
  return task;
}

// The one repository a leaf targets: its `repository` fact, else the
// `repositoryId` its plan gave it.
export function taskRepository(task) {
  return task?.repository ?? task?.repositoryId ?? null;
}

// Whether `task` has reached `level`. Without a level this is the task's own
// completion (§4.3). A row stored before the work model (no kind or completion
// of its own) keeps the old meaning: its complete status.
export function completionReached(task, level, complete) {
  if (hasPendingSpecDependencies(task)) return false;
  const done = complete(task?.status);
  if (!task) return false;
  // Every edge condition on a manual leaf is met when it is done: there is
  // no merge or integration to wait for (R61.10). A refusal is never done.
  if (isManual(task))
    return !isRefused(task) && (done || Boolean(task.manualDone));
  if (!level) {
    if (
      task.kind !== "epic" &&
      !TASK_KINDS.includes(task.kind) &&
      !COMPLETIONS.includes(task.completion)
    )
      return done;
    level = taskCompletion(task);
  }
  // Packages complete from their children (the tick records it).
  if (task.childrenComplete && taskKind(task) === "package") return true;
  // `merged-pr` is an old value for landed (R102.20).
  if (["integrated", "merged-pr"].includes(level) && task.integration?.commit)
    return true;
  // An allowed actor's close of the task's incoming item (R50.18): an
  // order, never a verified completion.
  if (task.intakeVerdict?.state === "order") return true;
  if (!done) return false;
  const own = taskCompletion(task);
  return (
    own === level ||
    (own === "released" && ["integrated", "merged-pr"].includes(level))
  );
}

// Errors for explicitly stored work-model values. Absent values are defaults.
export function workModelErrors(task) {
  const errors = [];
  if (
    task.kind !== undefined &&
    ![...TASK_KINDS, ...LEGACY_TASK_KINDS].includes(task.kind)
  )
    errors.push("Unknown kind " + task.id);
  for (const key of ["authority", "route"])
    if (task[key] !== undefined && !isSource(task[key]))
      errors.push("Unknown " + key + " " + task.id);
  if (task.completion !== undefined && !COMPLETIONS.includes(task.completion))
    errors.push("Unknown completion " + task.id);
  for (const field of ["specDependencies", "pendingSpecDependencies"]) {
    if (task[field] === undefined) continue;
    if (!Array.isArray(task[field])) {
      errors.push("Invalid spec dependencies " + task.id);
      continue;
    }
    for (const ref of task[field])
      if (
        !ref ||
        typeof ref !== "object" ||
        !["requires", "sequence", "supports"].includes(ref.kind) ||
        !["taskId", "spec", "planId"].every(
          (key) => typeof ref[key] === "string" && ref[key].length,
        ) ||
        (ref.condition !== undefined &&
          (ref.kind !== "requires" || !COMPLETIONS.includes(ref.condition)))
      )
        errors.push("Invalid spec dependency " + task.id);
  }
  if (task.pendingSpecDependencies?.length && !task.specDependencies?.length)
    errors.push("Pending spec dependency has no declaration " + task.id);
  return errors;
}

export function edgeErrors(edge) {
  if (edge.condition === undefined) return [];
  if (edge.kind !== "requires")
    return ["Only requires edges name a condition " + edge.from];
  return COMPLETIONS.includes(edge.condition)
    ? []
    : ["Unknown edge condition " + edge.from + " → " + edge.to];
}

// Notes for a dependent whose blocker's incoming item an allowed actor
// closed without merged code (R33.9, R50.18).
export function blockerNotes(data, task) {
  const notes = [];
  for (const edge of data.edges) {
    if (edge.to !== task.id || !["requires", "sequence"].includes(edge.kind))
      continue;
    const blocker = data.tasks.find((candidate) => candidate.id === edge.from),
      order =
        blocker?.intakeVerdict?.state === "order" && blocker.intakeVerdict;
    if (!order) continue;
    const name = order.issue
      ? `${blocker.id} (${order.issue})`
      : `${blocker.id} "${blocker.title || blocker.id}"`;
    notes.push(
      `Blocker ${name} closed without merged code: ${order.order.actor} closed it as ${order.order.reason.toLowerCase()} at ${order.order.closedAt}. Check whether its code exists before relying on it.`,
    );
  }
  return notes;
}
