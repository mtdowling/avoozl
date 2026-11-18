// Batches the planner decided (design §4.37, Requirement 108; the run is
// §4.11, R46.5–R46.7). The planner groups leaves in the manifest's
// `batches`; approval stores the group on each member as
// `batch: {id, tasks, reason}`. The tick, with no model call, hands a group
// off as one worker session and one worktree once every open member is
// ready, and only while the group keeps the rules below, which live here in
// code and never in a setting. The worker makes one commit and one done
// report per task, in order; checks and review run once on the batch head;
// the batch integrates as one rebase. A failing batch splits, and each task
// retries alone at no attempt cost.
import { EDIT_ONLY_STEP, workerExecutor } from "./delivery.mjs";
import { briefCell } from "./worker-briefs.mjs";
import { cliCommand } from "./report-command.mjs";
import { issueReportToken } from "./report-match.mjs";
import { contentBinding } from "./content-rules.mjs";
import {
  isGate,
  isManual,
  taskAuthority,
  taskCompletion,
  taskKind,
  taskRepository,
  taskRoute,
} from "../work-model.mjs";
import { statusComplete } from "../query.mjs";

// The most tasks one handoff takes, whatever the manifest says.
export const MAX_BATCH = 5;
const BLOCKING = new Set(["requires", "sequence"]);

export const batchFinal = (binding) =>
  binding.batch?.tasks.every((id) =>
    ["done", "blocked"].includes(binding.reports?.[id]?.kind),
  );

// Why the group `task` belongs to may not run as one handoff, or null when
// it may. `members` are the group's tasks still open. Pure over the store's
// records; the tick and the views read the same answer.
function groupProblem(store, data, task, members, approved, harnesses) {
  const group = task.batch,
    same = (t) =>
      t?.batch?.id === group.id &&
      JSON.stringify(t.batch.tasks) === JSON.stringify(group.tasks);
  const byId = new Map(data.tasks.map((t) => [t.id, t]));
  if (!group.tasks.every((id) => same(byId.get(id))))
    return "the group changed; it runs alone until the spec is approved again";
  const all = group.tasks.map((id) => byId.get(id));
  if (
    all.some((t) => t.planId !== task.planId || t.planHash !== task.planHash) ||
    !task.planHash ||
    !approved(task.planId, task.planHash)
  )
    return "the group is not from the approved spec revision";
  if (all.some((t) => taskRepository(t) !== taskRepository(task)))
    return "its tasks are in different repositories";
  if (group.tasks.length > MAX_BATCH) return `more than ${MAX_BATCH} tasks`;
  const inside = new Set(group.tasks);
  const edge = data.edges.find(
    (e) => BLOCKING.has(e.kind) && inside.has(e.from) && inside.has(e.to),
  );
  if (edge) return `${edge.to} waits on ${edge.from}`;
  const odd = all.find(
    (t) =>
      taskKind(t) !== "leaf" ||
      isManual(t) ||
      isGate(t) ||
      ["person", "tracker"].includes(taskCompletion(t)) ||
      taskRoute(t) !== "local" ||
      taskAuthority(t) !== "local",
  );
  if (odd) return `${odd.id} is not a local automatic leaf`;
  // One session makes one commit per task; an executor whose worker makes no
  // commits (a `process` child) runs the group's tasks singly (WP3.3).
  for (const t of members) {
    const { declined } = briefCell(
      workerExecutor(t, store.get("projects", taskRepository(t)), harnesses)
        .executor,
      "batch",
    );
    if (declined) return declined;
  }
  for (const t of members) {
    const delivery = store.get("task_deliveries", t.id);
    if (delivery?.batchSplit) return "the batch was split after it failed";
    if (delivery?.attempts?.length) return `${t.id} already ran alone`;
  }
  return null;
}

// A reader over approval receipts: was plan `planId` approved at `hash`?
export function approvals(store) {
  let seen = null;
  return (planId, hash) => {
    seen ??= new Set(
      store.list("approvals").map((r) => `${r.planId}\0${r.hash}`),
    );
    return seen.has(`${planId}\0${hash}`);
  };
}

// The planner group of `task` as the tick sees it: `{group, members,
// problem}`, where `members` are the open tasks in the group's order and
// `problem` is the rule it breaks (it then runs alone), or null for a task
// in no group. A group with one open task left has nothing to batch.
export function batchRules(
  store,
  data,
  task,
  approved = approvals(store),
  { harnesses } = {},
) {
  if (!task?.batch?.id || !Array.isArray(task.batch.tasks)) return null;
  const byId = new Map(data.tasks.map((t) => [t.id, t])),
    members = task.batch.tasks
      .map((id) => byId.get(id))
      .filter((t) => t && !statusComplete(data, t.status));
  return {
    group: task.batch,
    members,
    problem:
      members.length > 1
        ? groupProblem(store, data, task, members, approved, harnesses)
        : null,
  };
}

// Fold ready leaves into the planner's batches. `leaves` are the slots
// readyLeaves filled (each {task, project, attempt, delivery}); `candidates`
// every ready task before capacity, so a batch takes members no slot was
// left for. Returns the leaves to dispatch, a batch leader carrying `batch`
// and a task that runs alone because its group broke a rule carrying
// `alone` (the rule). `fits(leader, task)` says whether a member may run on
// the leader's crew.
export function planBatches(
  store,
  leaves,
  candidates,
  { data = store.read(), fits = null, harnesses } = {},
) {
  const ready = new Set(candidates.map((t) => t.id)),
    approved = approvals(store),
    taken = new Set(),
    out = [];
  for (const leaf of leaves) {
    if (taken.has(leaf.task.id)) continue;
    const rules = batchRules(store, data, leaf.task, approved, { harnesses });
    if (!rules || rules.members.length < 2 || leaf.attempt > 1) {
      taken.add(leaf.task.id);
      out.push(leaf);
      continue;
    }
    let alone = rules.problem;
    if (!alone && fits) {
      const misfit = rules.members.find((t) => !fits(leaf, t));
      if (misfit) alone = `${misfit.id} cannot run on this machine`;
    }
    if (alone) {
      taken.add(leaf.task.id);
      out.push({ ...leaf, alone });
      continue;
    }
    // Every open member must be ready; else the ready ones wait.
    if (
      !rules.members.every(
        (t) => ready.has(t.id) && (t.id === leaf.task.id || !taken.has(t.id)),
      )
    )
      continue;
    for (const t of rules.members) taken.add(t.id);
    // The first open member leads: its worktree and binding hold the batch.
    const leader = rules.members[0],
      lead =
        leader.id === leaf.task.id
          ? leaf
          : {
              ...leaf,
              task: leader,
              delivery: store.get("task_deliveries", leader.id),
            };
    out.push({
      ...lead,
      batch: {
        id: `batch:${rules.group.id}:${rules.members.map((t) => t.id).join("+")}`,
        tasks: rules.members.map((t) => t.id),
        reason: rules.group.reason,
        by: "planner",
      },
    });
  }
  return out;
}

// Ready tasks that wait for the rest of their planner group, so a slot is
// not spent on one of them alone.
export function waitingForBatch(
  store,
  candidates,
  { data = store.read(), harnesses } = {},
) {
  const ready = new Set(candidates.map((t) => t.id)),
    approved = approvals(store),
    out = new Set();
  for (const task of candidates) {
    const rules = batchRules(store, data, task, approved, { harnesses });
    if (!rules || rules.problem || rules.members.length < 2) continue;
    if (!rules.members.every((t) => ready.has(t.id))) out.add(task.id);
  }
  return out;
}

// The batch worker's brief: every task's own text, then the steps.
export function batchBrief(store, data, leaf, brief) {
  const tasks = leaf.batch.tasks.map((id) =>
      data.tasks.find((t) => t.id === id),
    ),
    lead = leaf.task.id,
    // The batch reports with the leader's token, once per task (WP4.1).
    token = store
      ? issueReportToken(store, { taskId: lead, attempt: leaf.attempt ?? 1 })
      : null,
    workspace = store ? contentBinding(store)?.workspaceRoot : null,
    where = workspace ? ` --workspace ${JSON.stringify(workspace)}` : "",
    run = token
      ? [
          `Work only in the worktree of ${lead}: run \`${cliCommand()} worktree prepare ${lead}${where}\` and use the worktree it prints, on its branch.`,
          `Do the tasks in this order. Make exactly one commit per task, and after each commit run exactly \`${cliCommand()} runner report <task ID> done --token ${token}${where}\` from inside that worktree, with that task's ID; Avoozl reads the commit from HEAD. If one task cannot be done, run the same command with blocked in place of done and --text "<why>", and stop.`,
        ]
      : [
          // shortcut: no report secret (every import makes one) falls back
          // to the MCP tools; drop it when none can lack one.
          `Work only in the worktree of ${lead} (call plans_prepare_worktree with {"input": {"taskId": "${lead}"}}), on its branch.`,
          'Do the tasks in this order. Make exactly one commit per task, and after each commit call plans_report for that task with kind "done"; Avoozl reads the commit from HEAD. If one task cannot be done, report it blocked with the reason and stop.',
        ],
    lines = [
      `Avoozl batch ${leaf.batch.id}: ${tasks.length} tasks the planner grouped for one session and one worktree.`,
      leaf.batch.reason ? `Why together: ${leaf.batch.reason}` : null,
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
      ...run,
      EDIT_ONLY_STEP,
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
