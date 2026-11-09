import { activityState } from "./activity.mjs";
import { statusComplete } from "./query.mjs";

export const activeRunStates = new Set([
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
]);

// A prior run on the same task is not evidence that it owns a new check-in.
export function taskSession(runs, task) {
  const sessionId =
    task.activity?.connection?.runId || task.activity?.sessionId;
  const visible = runs.filter((run) => !run.deletedAt);
  const exact =
    sessionId &&
    visible.find(
      (run) => run.id === sessionId || run.providerSessionId === sessionId,
    );
  return (
    exact ||
    visible.find(
      (run) => run.taskId === task.id && activeRunStates.has(run.state),
    ) ||
    null
  );
}

const indexes = new WeakMap();
export function taskIndex(data) {
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
  const blockers = [...new Set(index.prerequisites.get(task.id) || [])].filter(
    (id) => !statusComplete(data, index.tasks.get(id)?.status),
  );
  const dependents = [...new Set(index.dependents.get(task.id) || [])].filter(
    (id) => !statusComplete(data, index.tasks.get(id)?.status),
  );
  const complete = statusComplete(data, task.status);
  const review =
    task.needsReview || task.source?.removed || task.status === "review";
  const ready =
    !complete &&
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
  const document =
    data.documents[task.source?.document || task.epic?.replace(/^doc:/, "")];
  return Boolean(
    task.tags?.some((tag) => ["historical", "plan-inventory"].includes(tag)) ||
      document?.historical ||
      document?.plan?.status === "abandoned",
  );
}

export function visibleWorkbenchTasks(
  data,
  tasks,
  { inventory = false, reported = false, now = Date.now() } = {},
) {
  return tasks.filter(
    (task) =>
      inventory ||
      !isPlanInventory(data, task) ||
      (reported &&
        ["active", "stale", "paused"].includes(activityState(task, now))),
  );
}

export function compareTasks(data, a, b) {
  return (
    Number(statusComplete(data, a.status)) -
      Number(statusComplete(data, b.status)) ||
    (a.timeline?.order ?? a.rank ?? 1000) -
      (b.timeline?.order ?? b.rank ?? 1000) ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id)
  );
}

// This is a navigation hierarchy, never an inferred prerequisite hierarchy.
export function taskTree(
  data,
  tasks,
  { group = "epic", completed = false, inventory = false } = {},
) {
  const roots = new Map();
  for (const task of visibleWorkbenchTasks(data, tasks, { inventory })) {
    const keys =
      group === "tag"
        ? task.tags?.length
          ? task.tags
          : ["untagged"]
        : [task[group] || "Unassigned"];
    for (const key of new Set(keys)) {
      if (!roots.has(key))
        roots.set(key, { key, tasks: [], children: [], total: 0, complete: 0 });
      const root = roots.get(key);
      root.total++;
      root.complete += Number(statusComplete(data, task.status));
      if (completed || !statusComplete(data, task.status))
        root.tasks.push(task);
    }
  }
  const order =
    group === "epic"
      ? data.epics
      : group === "track"
        ? data.tracks
        : group === "status"
          ? data.statuses
          : [];
  const ranks = new Map(order.map((item, index) => [item.id, index]));
  return [...roots.values()]
    .filter((root) => root.tasks.length)
    .sort(
      (a, b) =>
        (ranks.get(a.key) ?? 1000) - (ranks.get(b.key) ?? 1000) ||
        a.key.localeCompare(b.key),
    )
    .map((root) => {
      const children = new Map();
      for (const task of root.tasks) {
        const key =
          group === "track"
            ? task.epic || "Unassigned"
            : task.track || "Unassigned";
        if (!children.has(key)) children.set(key, []);
        children.get(key).push(task);
      }
      root.children = [...children].map(([key, tasks]) => ({
        key,
        tasks: tasks.sort((a, b) => compareTasks(data, a, b)),
      }));
      return root;
    });
}

export function nowBoard(
  data,
  tasks,
  { inventory = false, now = Date.now() } = {},
) {
  const lanes = {
    reported: [],
    attention: [],
    blocked: [],
    ready: [],
    completed: [],
  };
  for (const task of visibleWorkbenchTasks(data, tasks, {
    inventory,
    reported: true,
    now,
  })) {
    const signals = taskSignals(data, task, now);
    // A check-in is reported activity, not proof that an agent process is alive.
    if (signals.activity === "active") lanes.reported.push(task);
    else if (signals.complete) lanes.completed.push(task);
    else if (["stale", "paused"].includes(signals.activity) || signals.review)
      lanes.attention.push(task);
    else if (task.status === "blocked" || signals.blockers.length)
      lanes.blocked.push(task);
    else if (signals.ready) lanes.ready.push(task);
  }
  for (const [key, tasks] of Object.entries(lanes)) {
    if (key === "completed")
      tasks.sort(
        (a, b) =>
          (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) ||
          a.id.localeCompare(b.id),
      );
    else tasks.sort((a, b) => compareTasks(data, a, b));
  }
  return lanes;
}

// Completion and recently edited notes are not landing receipts. Keep the
// actual integration timestamp stable when later evidence or prose changes.
export function recentLandings(
  data,
  tasks,
  integrations = [],
  { now = Date.now(), days = 30 } = {},
) {
  const visible = new Map(
    visibleWorkbenchTasks(data, tasks).map((task) => [task.id, task]),
  );
  const receipts = new Map();
  const add = (task, receipt) => {
    const at = Date.parse(receipt?.at),
      commit = receipt?.commit;
    if (
      !task ||
      typeof commit !== "string" ||
      !/^[a-f0-9]{7,64}$/i.test(commit) ||
      !Number.isFinite(at) ||
      at > now ||
      at < now - days * 86400000
    )
      return;
    const accepted = task.acceptanceEvidence;
    const acceptance =
      accepted?.evidence?.trim() && Date.parse(accepted.at) >= at
        ? accepted.componentOnly
          ? "component"
          : "accepted"
        : "pending";
    const row = {
      task,
      ...receipt,
      at: new Date(at).toISOString(),
      acceptance,
    };
    const old = receipts.get(task.id);
    if (!old || Date.parse(old.at) < at) receipts.set(task.id, row);
    else if (old.at === row.at && old.commit === row.commit && row.runId)
      receipts.set(task.id, { ...old, runId: row.runId });
  };
  for (const task of visible.values()) add(task, task.integration);
  for (const entry of integrations)
    if (entry.state === "integrated")
      add(visible.get(entry.taskId), {
        commit: entry.integratedCommit,
        at: entry.integratedAt,
        branch: entry.branch,
        runId: entry.runId,
      });
  return [...receipts.values()].sort(
    (a, b) => b.at.localeCompare(a.at) || a.task.id.localeCompare(b.task.id),
  );
}

export function focusedNeighborhood(data, id) {
  if (!taskIndex(data).tasks.has(id)) return [];
  const ids = new Set([id]);
  for (const edge of data.edges) {
    if (edge.from === id) ids.add(edge.to);
    if (edge.to === id) ids.add(edge.from);
  }
  return [...ids];
}

export function conversationSignal(run, seen) {
  const kind =
    run.state === "observing"
      ? "external"
      : run.state === "waiting-input"
        ? "input"
        : run.state === "waiting-approval"
          ? "approval"
          : ["starting", "running"].includes(run.state)
            ? "working"
            : run.state === "failed"
              ? "failed"
              : run.state === "disconnected"
                ? "disconnected"
                : run.state === "interrupted"
                  ? "stopped"
                  : run.state === "completed" &&
                      seen !== (run.updatedAt || run.createdAt)
                    ? "unread"
                    : "read";
  const labels = {
    external: "External transcript; live turn status unavailable",
    input: "Waiting for your input",
    approval: "Waiting for your approval",
    working: "In progress",
    unread: "Unread reply",
    failed: "Failed",
    disconnected: "Disconnected",
    stopped: "Stopped",
    read: "Read",
  };
  return { kind, label: labels[kind] };
}
