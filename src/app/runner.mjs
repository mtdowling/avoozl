// `avoozl next` (worker-paths WP2.5): a read of the ready, running, waiting,
// Needs you and done lists. The tick starts the work; a person takes one task
// with `avoozl claim` (manual-claim.mjs).
import {
  claimedTaskIds,
  DELIVERY_DEFAULTS,
  liveAttempt,
  readyLeaves,
} from "./delivery.mjs";
import { sessionUrl } from "./notifications.mjs";
import { listSessionBindings } from "./session-bindings.mjs";
import { scheduleHolds } from "./spec-scheduler.mjs";
import { isArchivedTask } from "../browse-model.mjs";
import { statusComplete } from "../query.mjs";
import {
  completionReached,
  isManual,
  isRefused,
  supersedingTask,
  taskKind,
  taskRepository,
  taskRoute,
} from "../work-model.mjs";

const BLOCKING = new Set(["requires", "sequence"]);
const NEEDS_YOU_STATUSES = new Set(["blocked", "review"]);

const effective = (policy) =>
  policy?.delivery || { ...DELIVERY_DEFAULTS, repositories: {} };

const title = (task) => task.title || task.id;

// The newest worker binding per task, any source.
function newestWorkers(bindings) {
  const newest = new Map();
  for (const binding of bindings)
    if (binding.role === "worker") {
      const seen = newest.get(binding.taskId);
      if (!seen || seen.attempt < binding.attempt)
        newest.set(binding.taskId, binding);
    }
  return newest;
}

const phase = (binding, delivery) =>
  delivery?.state === "done"
    ? "verifying"
    : delivery?.state === "verified"
      ? "integrating"
      : binding && liveAttempt(binding)
        ? "working"
        : "recording";

// plans_next / `avoozl next`: every local leaf, in exactly one bucket.
export function nextView(store, { policy, github = null }) {
  const data = store.read(),
    delivery = effective(policy),
    bindings = listSessionBindings(store),
    newest = newestWorkers(bindings),
    claimed = claimedTaskIds(store, bindings),
    deliveries = new Map(
      store.list("task_deliveries").map((d) => [d.taskId, d]),
    ),
    schedule = scheduleHolds(store, { github }),
    startable = new Map(
      readyLeaves(store, delivery, { skip: schedule.skip }).map((leaf) => [
        leaf.task.id,
        leaf,
      ]),
    ),
    byId = new Map(data.tasks.map((task) => [task.id, task])),
    complete = (status) => statusComplete(data, status);
  const result = {
    policy: policy?.status || "absent",
    ready: [],
    running: [],
    waiting: [],
    needsYou: [],
    done: [],
  };
  if (policy?.status === "invalid")
    result.needsYou.push({
      reason: "policy",
      detail: `.avoozl.json is invalid: ${policy.error}`,
      link: sessionUrl(null),
    });
  const blockersOf = (task) =>
    data.edges
      .filter(
        (edge) =>
          edge.to === task.id &&
          BLOCKING.has(edge.kind) &&
          !completionReached(
            supersedingTask(byId, edge.from),
            edge.condition,
            complete,
          ),
      )
      .map((edge) => {
        const from = supersedingTask(byId, edge.from);
        return {
          id: from?.id ?? edge.from,
          title: from ? title(from) : edge.from,
          ...(edge.condition ? { condition: edge.condition } : {}),
        };
      });
  const leaves = data.tasks.filter(
    (task) =>
      taskKind(task) === "leaf" &&
      taskRoute(task) === "local" &&
      !isArchivedTask(data, task) &&
      !task.source?.removed,
  );
  for (const task of leaves) {
    const binding = newest.get(task.id),
      record = deliveries.get(task.id),
      item = { id: task.id, title: title(task) },
      session = binding
        ? {
            slot: binding.slot,
            attempt: binding.attempt,
            link: sessionUrl(binding.slot),
          }
        : {};
    if (complete(task.status) || completionReached(task, undefined, complete)) {
      result.done.push(item);
      continue;
    }
    const question =
      binding &&
      liveAttempt(binding) &&
      binding.report?.kind === "question" &&
      binding.report.text;
    const reason = task.decision
      ? ["decision", String(task.decision)]
      : record?.state === "decision"
        ? ["failed", record.cause || record.attempts.at(-1)?.cause || "stopped"]
        : question
          ? ["question", question]
          : isRefused(task)
            ? ["blocked", `Refused by a person: ${title(task)}`]
            : NEEDS_YOU_STATUSES.has(task.status) || task.needsReview
              ? [task.status === "blocked" ? "blocked" : "review", task.status]
              : null;
    if (reason) {
      result.needsYou.push({
        ...item,
        reason: reason[0],
        detail: reason[1],
        ...session,
      });
      continue;
    }
    // A manual leaf is never started (R61.10): once its blockers hold it
    // waits for a person, never in ready.
    if (isManual(task) && !blockersOf(task).length) {
      result.needsYou.push({
        ...item,
        reason: "manual",
        detail: `Waiting for a person: ${title(task)}`,
      });
      continue;
    }
    if (claimed.has(task.id)) {
      result.running.push({
        ...item,
        phase: phase(binding, record),
        ...session,
      });
      continue;
    }
    const leaf = startable.get(task.id);
    if (leaf) {
      result.ready.push({
        ...item,
        attempt: leaf.attempt,
        repository: leaf.repository.id,
        checkout: leaf.repository.root,
      });
      continue;
    }
    const blockedBy = blockersOf(task);
    result.waiting.push({
      ...item,
      blockedBy,
      ...(blockedBy.length
        ? {}
        : {
            reason: ["draft", "deferred"].includes(task.status)
              ? task.status
              : schedule.held.has(task.id)
                ? schedule.held.get(task.id)
                : task.planArchived
                  ? "plan archived"
                  : !taskRepository(task)
                    ? "no repository"
                    : "capacity",
          }),
    });
  }
  result.finished = leaves.length > 0 && result.done.length === leaves.length;
  return result;
}
