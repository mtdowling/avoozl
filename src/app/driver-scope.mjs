// Which specs this workspace may write for (design §6.10, R66). The tick's
// driver step reads each plan issue and records its verdict in the
// `drivers` table; every write loop asks here before it touches a task.
// Reads SQLite only: no GitHub call, so any loop can ask cheaply.
//
// - read-only: another machine, person or nobody drives the spec. Nothing
//   is dispatched, messaged, written to GitHub, integrated or merged for it.
// - held: no new work starts. Read-only specs, a spec being handed off
//   (drain: running chats still report, verify and integrate), and away
//   tasks (R66.11), which wait for GitHub facts or a person.

const memo = new WeakMap();

function rows(store) {
  // shortcut: one list per store revision and driver write; driver.mjs
  // calls forgetDriverScope after each write.
  const revision = store.initialized() ? store.read().revision : 0,
    cached = memo.get(store);
  if (cached && cached.revision === revision) return cached.rows;
  const value = new Map(store.list("drivers").map((row) => [row.id, row]));
  memo.set(store, { revision, rows: value });
  return value;
}

export function forgetDriverScope(store) {
  memo.delete(store);
}

export function driverRow(store, planId) {
  return planId ? rows(store).get(planId) || null : null;
}

// Plans this workspace does not drive.
export function readOnlyPlanIds(store) {
  return new Set(
    [...rows(store).values()]
      .filter((row) => row.state !== "driver")
      .map((row) => row.id),
  );
}

export function readOnlyTask(store, task) {
  const row = driverRow(store, task?.planId);
  return Boolean(row && row.state !== "driver");
}

// Task IDs that may not start new work here.
export function driverHeldTaskIds(store, data = store.read()) {
  const all = rows(store),
    held = new Set();
  if (!all.size) {
    for (const task of data.tasks) if (task.driverAway) held.add(task.id);
    return held;
  }
  for (const task of data.tasks) {
    const row = task.planId ? all.get(task.planId) : null;
    if (
      task.driverAway ||
      (row && (row.state !== "driver" || row.handoff?.state))
    )
      held.add(task.id);
  }
  return held;
}

// GitHub writes keyed by an issue: (repository, number, ...).
const ISSUE_WRITES = new Set([
  "updateIssue",
  "addLabels",
  "removeLabel",
  "addAssignees",
  "removeAssignees",
  "addIssueBlocker",
  "removeIssueBlocker",
  "createIssueComment",
  "addSubIssue",
  "removeSubIssue",
  "setIssueType",
]);
const repositoryOf = (value) =>
  String(
    typeof value === "string"
      ? value
      : value?.id ||
          (value?.owner && value?.repo ? `${value.owner}/${value.repo}` : ""),
  ).toLowerCase();

// The backstop for every tick step (R66.6): a GitHub write for a task of a
// spec this workspace does not drive is refused, whichever step makes it.
// Steps skip read-only specs first; this catches one that does not.
// shortcut: Project item writes (`updateProjectItem`) name an item ID, not
// an issue, so they pass here; the Project step reads only paused tasks of
// specs it already holds, and a read-only spec has no projected item here
// unless it was driven here before.
export function driverGuard(store, github) {
  if (!github || typeof github !== "object") return github;
  const planOf = (repository, number) => {
    const data = store.read();
    for (const task of data.tasks)
      if (
        task.github?.number === Number(number) &&
        String(task.github.repository || "").toLowerCase() === repository
      )
        return task.planId || null;
    return null;
  };
  const refuse = (planId) => {
    const error = Error(
      `This workspace reads only for spec ${planId}; nothing was written to GitHub.`,
    );
    error.status = 409;
    error.driverReadOnly = true;
    return Promise.reject(error);
  };
  return new Proxy(github, {
    get(target, name, receiver) {
      const value = Reflect.get(target, name, receiver);
      if (typeof value !== "function") return value;
      if (ISSUE_WRITES.has(name))
        return function guarded(...args) {
          const planId = planOf(repositoryOf(args[0]), args[1]);
          if (planId && readOnlyPlanIds(store).has(planId))
            return refuse(planId);
          return value.apply(target, args);
        };
      if (name === "createIssue")
        return function guarded(...args) {
          const taskId = /"taskId"\s*:\s*"([^"]+)"/.exec(
              String(args[1]?.body || ""),
            )?.[1],
            task = taskId && store.read().tasks.find((t) => t.id === taskId);
          if (task?.planId && readOnlyPlanIds(store).has(task.planId))
            return refuse(task.planId);
          return value.apply(target, args);
        };
      if (name === "createLinkedBranch")
        return function guarded(...args) {
          const task = store
            .read()
            .tasks.find((t) => t.github?.nodeId === args[0]?.issueId);
          if (task?.planId && readOnlyPlanIds(store).has(task.planId))
            return refuse(task.planId);
          return value.apply(target, args);
        };
      if (name === "addProjectItem")
        return function guarded(...args) {
          const { owner, repo, number } = args[1] || {},
            planId = planOf(`${owner}/${repo}`.toLowerCase(), number);
          if (planId && readOnlyPlanIds(store).has(planId))
            return refuse(planId);
          return value.apply(target, args);
        };
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
