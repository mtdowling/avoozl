// Work model fields from design §3.2 and §4.3. Rows written before these
// fields existed are read through the defaults below; nothing rewrites them.
// An epic is a goal across plans, never a task (Requirement 59.7).
export const TASK_KINDS = ["package", "leaf"];
// Kinds stored before the work model. They read as leaves so that readiness
// and dispatch of existing workspaces do not change.
// "epic" is a row approved before Requirement 59 (see taskKind).
export const LEGACY_TASK_KINDS = ["task", "milestone", "epic"];
export const COMPLETIONS = [
  "merged-pr",
  "integrated",
  "released",
  "answered",
  "person",
];
const SOURCE = /^(?:local|github|plugin:[a-z][a-z0-9-]{0,60})$/;

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

// A github task whose first issue does not exist yet (§3.2). It does not
// dispatch until projection creates the issue.
export function pendingProjection(task) {
  const authority = taskAuthority(task);
  if (authority.startsWith("plugin:")) return !task?.tracker?.id;
  return (
    authority === "github" &&
    !(task?.github && (task.github.number || task.github.nodeId))
  );
}

// A tracker plugin owns a task's record, not its delivery: a plugin-authority
// task with no route of its own is delivered locally (§4.8).
export function taskRoute(task) {
  if (isSource(task?.route)) return task.route;
  return taskAuthority(task) === "github" ? "github" : "local";
}

// The plugin id in `plugin:<id>`, or null.
export const pluginId = (source) =>
  typeof source === "string" && source.startsWith("plugin:")
    ? source.slice(7)
    : null;

// A leaf only a person does (Requirement 61.9): never dispatched, marked
// done by a person, complete at every level once done.
export const isManual = (task) =>
  task?.manual === true && taskKind(task) === "leaf";

export function taskCompletion(task) {
  if (isManual(task)) return "person";
  if (COMPLETIONS.includes(task?.completion)) return task.completion;
  return taskRoute(task) === "github" ? "merged-pr" : "integrated";
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

// The one repository a leaf targets. `projectId` is the older name.
export function taskRepository(task) {
  return task?.repository ?? task?.projectId ?? null;
}

// Whether `task` has reached `level`. Without a level this is the task's own
// completion (§4.3). A row stored before the work model (no kind or completion
// of its own) keeps the old meaning: its complete status.
export function completionReached(task, level, complete) {
  const done = complete(task?.status);
  if (!task) return false;
  // Every edge condition on a manual leaf is met when it is done: there is
  // no merge or integration to wait for (R61.10).
  if (isManual(task)) return done || Boolean(task.manualDone);
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
  if (level === "integrated" && task.integration?.commit) return true;
  // A GitHub leaf's verdict (§6.5): verified by its one merged, passing
  // closer, or done by an allowed actor's order, which satisfies every level.
  const verdict = task.githubVerdict?.state;
  if (verdict === "order") return true;
  if (verdict === "verified" && level !== "released") return true;
  // A route plugin's completion is the remote leaf's verdict (R22.8).
  if (task.routeVerdict?.state === "done" && level !== "released") return true;
  // A tracker plugin's task: Avoozl's verdict as stored in its record, or an
  // allowed actor's close (R35.8, R35.9).
  const tracked = task.trackerVerdict?.state;
  if (tracked === "order") return true;
  // An allowed actor's close of the task's incoming item (R50.18): an
  // order, never a verified completion.
  if (task.intakeVerdict?.state === "order") return true;
  if (tracked === "verified" && level !== "released") return true;
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
