// Batch planner for projection (RC2.5, design D4.2): a pure function over the
// plan that groups small ready tasks into batches. Grouping keys come from
// flow-batch.mjs, so a projected batch and a dispatched batch agree.
import { FLOW_DEFAULTS, FLOW_KEYS } from "./flow.mjs";
import { keyOf, overlaps } from "./flow-batch.mjs";
import { taskCompletion, taskKind } from "../work-model.mjs";
import { fail } from "./store.mjs";

export const BATCH_MODES = Object.freeze(["off", "suggest", "auto"]);
const BLOCKING = new Set(["requires", "sequence"]);

// `tasks` and `edges` are the plan's (an edge runs from blocker to blocked).
// `complete` says whether a status counts as done. Returns the batches, the
// plain tasks, and whether the batches apply with no edit (Auto) or are only
// proposed (Suggest). A batch of one is never returned.
export function planProjectionBatches({
  tasks,
  edges = [],
  mode = "suggest",
  max = FLOW_DEFAULTS.batch.max,
  by = FLOW_DEFAULTS.batch.by,
  complete = (status) => status === "done",
}) {
  if (!BATCH_MODES.includes(mode))
    throw new Error(`batch mode must be one of ${BATCH_MODES.join(", ")}`);
  const bad = FLOW_KEYS["batch.max"](max);
  if (bad !== true) throw new Error(`flow.batch.max must be ${bad}`);
  const byId = new Map(tasks.map((task) => [task.id, task])),
    // An unknown blocker counts as open: fail closed.
    blocked = (task) =>
      edges.some(
        (e) =>
          e.to === task.id &&
          BLOCKING.has(e.kind) &&
          !complete(byId.get(e.from)?.status),
      ),
    linked = (a, b) =>
      edges.some(
        (e) =>
          (e.from === a.id && e.to === b.id) ||
          (e.from === b.id && e.to === a.id),
      ),
    open = tasks.filter((task) => !complete(task.status)),
    candidates = open.filter(
      (task) =>
        task.size === "small" &&
        taskCompletion(task) !== "person" &&
        task.completion !== "human" &&
        !blocked(task),
    ),
    taken = new Set(),
    batches = [];
  if (mode !== "off" && max > 1)
    for (const lead of candidates) {
      if (taken.has(lead.id)) continue;
      const group = [lead];
      for (const task of candidates) {
        if (group.length >= max) break;
        if (taken.has(task.id) || group.includes(task)) continue;
        if (
          by === "phase"
            ? keyOf(task, by) !== keyOf(lead, by)
            : !group.some((g) => overlaps(g, task))
        )
          continue;
        if (group.some((g) => linked(g, task))) continue;
        group.push(task);
      }
      if (group.length < 2) continue;
      for (const task of group) taken.add(task.id);
      batches.push({
        key: keyOf(lead, by),
        tasks: group.map((task) => task.id),
      });
    }
  return {
    mode,
    applied: mode === "auto",
    batches,
    plain: open.filter((task) => !taken.has(task.id)).map((task) => task.id),
  };
}

const MAX_BATCH = 5;

// The batches a projection writes (D4.2): those already stored on a task as
// `github.batch` plus the `requested` ones, each a list of task IDs. Returns
// groups of IDs in plan order, the first being the lead whose managed marker
// the batch issue carries. A group of one stays plain and is dropped. Refuses
// with 409 a group that is over the cap, names an unknown task, shares a task
// with another group, holds a task that is not an automatic leaf, joins two
// tasks by an edge, has an open blocker outside it, or holds a task that
// already has its own issue. Pure: reads nothing but its arguments.
export function resolveBatchGroups({
  tasks,
  edges = [],
  requested = [],
  complete = (status) => status === "done",
}) {
  const order = new Map(tasks.map((task, index) => [task.id, index])),
    byId = new Map(tasks.map((task) => [task.id, task])),
    sorted = (ids) => [...ids].sort((a, b) => order.get(a) - order.get(b)),
    stored = new Map(),
    groups = [];
  for (const task of tasks) {
    const members = task.github?.batch?.members;
    if (Array.isArray(members) && !stored.has(task.id)) {
      const group = sorted(members.filter((id) => order.has(id)));
      if (group.length > 1) {
        for (const id of group) stored.set(id, group);
        groups.push(group);
      }
    }
  }
  const taken = new Map([...stored].map(([id, group]) => [id, group[0]]));
  if (!Array.isArray(requested)) fail("batches must be a list of lists.", 409);
  for (const input of requested) {
    if (!Array.isArray(input)) fail("Each batch must be a list of IDs.", 409);
    const ids = [...new Set(input)];
    if (ids.length < 2) continue;
    if (ids.length > MAX_BATCH)
      fail(`A batch holds at most ${MAX_BATCH} tasks.`, 409);
    for (const id of ids)
      if (!byId.has(id)) fail(`Task ${id} is not in this plan.`, 409);
    const group = sorted(ids);
    if (group.every((id) => stored.get(id)?.join() === group.join())) continue;
    for (const id of group) {
      if (taken.has(id)) fail(`Task ${id} is in more than one batch.`, 409);
      const task = byId.get(id);
      if (
        taskKind(task) !== "leaf" ||
        taskCompletion(task) === "person" ||
        task.completion === "human"
      )
        fail(`Task ${id} is not an automatic leaf, so it cannot batch.`, 409);
      if (task.github?.number)
        fail(
          `Task ${id} already has its own issue; it cannot join a batch.`,
          409,
        );
    }
    const inside = new Set(group);
    for (const edge of edges) {
      if (inside.has(edge.from) && inside.has(edge.to))
        fail(
          `Tasks ${edge.from} and ${edge.to} have an edge, so they cannot share a batch.`,
          409,
        );
      if (
        inside.has(edge.to) &&
        BLOCKING.has(edge.kind) &&
        !complete(byId.get(edge.from)?.status)
      )
        fail(
          `Task ${edge.to} has an open blocker (${edge.from}), so it cannot batch.`,
          409,
        );
    }
    for (const id of group) taken.set(id, group[0]);
    groups.push(group);
  }
  return groups;
}
