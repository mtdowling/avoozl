// Batch planner for projection (RC2.5, design D4.2): a pure function over the
// plan that groups small ready tasks into batches. Grouping keys come from
// flow-batch.mjs, so a projected batch and a dispatched batch agree.
import { FLOW_DEFAULTS, FLOW_KEYS } from "./flow.mjs";
import { keyOf, overlaps } from "./flow-batch.mjs";
import { taskCompletion } from "../work-model.mjs";

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
