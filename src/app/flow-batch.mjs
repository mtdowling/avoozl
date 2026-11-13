// Batching small tasks (design §4.11, Requirement 46): ready leaves the
// plan marks `size: "small"` that share a phase (the same parent package,
// otherwise the same plan phase; R59.11) or overlapping paths, a
// repository, a route, review roles and local authority, with no edge
// between them, run in one worker session and one worktree. The worker makes
// one commit and one done report per task, in order; checks and review run
// once on the batch head; the batch integrates as one rebase. A failing
// batch splits, and each task retries alone at no attempt cost.
import { readFlowPolicy } from "./flow.mjs";
import { taskAuthority, taskRepository, taskRoute } from "../work-model.mjs";
import { listSessionBindings, FINAL_STATUSES } from "./session-bindings.mjs";

const BLOCKING = new Set(["requires", "sequence"]);

// Batchable at all: marked small by the plan, local route and authority, and
// not split from a batch earlier in this delivery.
export function batchable(store, task) {
  if (task?.size !== "small") return false;
  if (taskRoute(task) !== "local" || taskAuthority(task) !== "local")
    return false;
  return !store.get("task_deliveries", task.id)?.batchSplit;
}

// The phase key: the same parent package, otherwise the same phase of the
// same plan. A task in no package and no phase batches with its plan's
// other phaseless tasks.
const keyOf = (task, by) =>
  by === "files"
    ? null
    : `${taskRepository(task)}|${task.parent ? `parent:${task.parent}` : `phase:${task.planId || ""}:${task.phase?.id ?? ""}`}`;

const overlaps = (a, b) => {
  const left = a.paths || a.resources || [],
    right = new Set(b.paths || b.resources || []);
  return left.some((p) => right.has(p));
};

// Live batches: the key each one holds, so a batchable leaf that would join
// a running batch waits for the next one instead of running alone.
function liveKeys(store, data, by) {
  const keys = new Set(),
    tasks = [];
  for (const binding of listSessionBindings(store))
    if (
      binding.batch &&
      !FINAL_STATUSES.has(binding.status) &&
      !batchFinal(binding)
    )
      for (const id of binding.batch.tasks) {
        const task = data.tasks.find((t) => t.id === id);
        if (task) {
          tasks.push(task);
          if (keyOf(task, by)) keys.add(keyOf(task, by));
        }
      }
  return { keys, tasks };
}

export const batchFinal = (binding) =>
  binding.batch?.tasks.every((id) =>
    ["done", "blocked"].includes(binding.reports?.[id]?.kind),
  );

// Fold ready leaves into batches. `leaves` are the slots readyLeaves filled
// (each {task, project, attempt, delivery}); `candidates` every ready task
// before capacity, so a batch may take small tasks no slot was left for.
// Returns the leaves to dispatch, a batch leader carrying `batch`.
export function planBatches(
  store,
  leaves,
  candidates,
  { workspaceRoot = null, data = store.read(), policy, fits = null } = {},
) {
  const flow = readFlowPolicy(workspaceRoot),
    edges = data.edges.filter((e) => BLOCKING.has(e.kind)),
    linked = (a, b) =>
      edges.some(
        (e) =>
          (e.from === a.id && e.to === b.id) ||
          (e.from === b.id && e.to === a.id),
      ),
    taken = new Set(),
    out = [];
  for (const leaf of leaves) {
    if (taken.has(leaf.task.id)) continue;
    const repo = leaf.project.id,
      { batch } = flow.for(repo),
      by = batch.by;
    if (
      batch.max <= 1 ||
      !batchable(store, leaf.task) ||
      leaf.attempt > 1 ||
      (fits && !fits(leaf, leaf.task))
    ) {
      out.push(leaf);
      taken.add(leaf.task.id);
      continue;
    }
    const live = liveKeys(store, data, by);
    if (
      (by === "phase" && live.keys.has(keyOf(leaf.task, by))) ||
      (by === "files" && live.tasks.some((t) => overlaps(t, leaf.task)))
    )
      continue;
    const roles = JSON.stringify(
        policy?.repositories?.[repo]?.reviewers ?? policy?.reviewers ?? null,
      ),
      group = [leaf.task];
    for (const task of candidates) {
      if (group.length >= batch.max) break;
      if (taken.has(task.id) || group.some((g) => g.id === task.id)) continue;
      if (!batchable(store, task) || taskRepository(task) !== repo) continue;
      if (store.get("task_deliveries", task.id)?.attempts?.length) continue;
      if (
        JSON.stringify(
          policy?.repositories?.[taskRepository(task)]?.reviewers ??
            policy?.reviewers ??
            null,
        ) !== roles
      )
        continue;
      if (
        by === "phase"
          ? keyOf(task, by) !== keyOf(leaf.task, by)
          : !group.some((g) => overlaps(g, task))
      )
        continue;
      if (group.some((g) => linked(g, task))) continue;
      // Every task in a batch runs on the leader's crew (R46.4).
      if (fits && !fits(leaf, task)) continue;
      group.push(task);
    }
    for (const task of group) taken.add(task.id);
    out.push(
      group.length > 1
        ? {
            ...leaf,
            batch: {
              id: `batch:${group.map((t) => t.id).join("+")}`,
              tasks: group.map((t) => t.id),
              by,
            },
          }
        : leaf,
    );
  }
  return out;
}

// Batchable ready tasks that wait for a running batch of their key, so the
// next batch takes them instead of a slot running each alone.
export function waitingForBatch(
  store,
  candidates,
  { workspaceRoot = null, data = store.read() } = {},
) {
  const flow = readFlowPolicy(workspaceRoot),
    out = new Set();
  for (const task of candidates) {
    const { batch } = flow.for(taskRepository(task));
    if (batch.max <= 1 || !batchable(store, task)) continue;
    if (store.get("task_deliveries", task.id)?.attempts?.length) continue;
    const live = liveKeys(store, data, batch.by);
    if (
      (batch.by === "phase" && live.keys.has(keyOf(task, batch.by))) ||
      (batch.by === "files" && live.tasks.some((t) => overlaps(t, task)))
    )
      out.add(task.id);
  }
  return out;
}

// The batch worker's brief: every task's own text, then the steps.
export function batchBrief(store, data, leaf, brief) {
  const tasks = leaf.batch.tasks.map((id) =>
      data.tasks.find((t) => t.id === id),
    ),
    lines = [
      `Avoozl batch ${leaf.batch.id}: ${tasks.length} small tasks in one session and one worktree.`,
      "",
      ...tasks.flatMap((task, i) => [
        `${i + 1}. Task ${task.id}: ${task.title || task.id}`,
        task.acceptance?.length
          ? `   Acceptance: ${[].concat(task.acceptance).join("; ")}`
          : null,
        task.checks?.length ? `   Checks: ${task.checks.join("; ")}` : null,
        task.summary ? `   Summary: ${task.summary}` : null,
      ]),
      "",
      `Work only in the worktree of ${leaf.task.id} (call plans_prepare_worktree with {"input": {"taskId": "${leaf.task.id}"}}), on its branch.`,
      'Do the tasks in this order. Make exactly one commit per task, and after each commit call plans_report for that task with kind "done" and that commit\'s full SHA. If one task cannot be done, report it blocked with the reason and stop.',
      "Avoozl runs the checks and review once, on the last commit.",
    ].filter((line) => line !== null);
  void brief;
  return lines.join("\n");
}

// Split a failing batch (R46.6): every task's delivery goes back to failed
// with a fresh budget, so the split costs nobody an attempt, and none of
// them is batched again in this delivery.
export function splitBatch(store, batchId, cause, at) {
  for (const delivery of store.list("task_deliveries")) {
    if (delivery.batch !== batchId) continue;
    const attempts = delivery.attempts.map((a, i, all) =>
      i === all.length - 1 && a.outcome !== "split"
        ? { ...a, outcome: "split", cause }
        : a,
    );
    store.put("task_deliveries", {
      ...delivery,
      attempts,
      state: "failed",
      batchSplit: true,
      updatedAt: at,
    });
  }
  const record = store.get("flow_batches", batchId);
  if (record)
    store.put("flow_batches", {
      ...record,
      state: "split",
      cause,
      splitAt: at,
    });
}
