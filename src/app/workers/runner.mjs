// `avoozl next` (worker-paths WP2.5): a read of the ready, running, waiting,
// Needs you and done lists. The tick starts the work; a person takes one task
// with `avoozl take` (manual-take.mjs).
import {
  busyTaskIds,
  DELIVERY_DEFAULTS,
  leafBrief,
  liveAttempt,
  readyCandidates,
  readyLeaves,
} from "../delivery/delivery.mjs";
import {
  cacheClaim,
  claimBranch,
  claimedTaskIds,
  claimFirst,
  refreshClaims,
  taskSpec,
} from "./claims.mjs";
import { manualTake } from "./manual-take.mjs";
import { rankKeys } from "../specs/ranking.mjs";
import { catchUp, integrationBase } from "../specs/integration-base.mjs";
import { remoteGit } from "../git/git.mjs";

// `origin/<branch>` once fetched, else null so the worktree starts from the
// local base.
const fetchedBase = (repository, branch) =>
  remoteGit(repository.root, ["fetch", "--quiet", "origin", branch]).then(
    () => `origin/${branch}`,
    () => null,
  );
import { sessionUrl } from "../tick/notifications.mjs";
import { listSessionBindings } from "../sessions/session-bindings.mjs";
import { scheduleHolds } from "../specs/spec-scheduler.mjs";
import { isArchivedTask } from "../../browse-model.mjs";
import { statusComplete } from "../../query.mjs";
import { labelHolds, readLabelFilters } from "../specs/label-filters.mjs";
import {
  completionReached,
  isManual,
  isRefused,
  taskKind,
  taskRepository,
  taskRoute,
} from "../../work-model.mjs";

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
        : binding || delivery
          ? "recording"
          : "claimed";

// plans_next / `avoozl next`: every local leaf, in exactly one bucket.
export function nextView(store, { policy, github = null }) {
  const data = store.read(),
    delivery = effective(policy),
    bindings = listSessionBindings(store),
    newest = newestWorkers(bindings),
    claimed = busyTaskIds(store, bindings),
    branches = claimedTaskIds(store),
    labels = labelHolds(store),
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
    complete = (status) => statusComplete(data, status),
    // The three ranking keys each ready task is shown with (§D3.1).
    keysOf = rankKeys(
      data.edges.filter((edge) => BLOCKING.has(edge.kind)),
      (id) => byId.has(id) && !complete(byId.get(id).status),
    );
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
          !completionReached(byId.get(edge.from), edge.condition, complete),
      )
      .map((edge) => {
        const from = byId.get(edge.from);
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
        ...(branches.has(task.id) ? { branch: claimBranch(task) } : {}),
        ...session,
      });
      continue;
    }
    const leaf = startable.get(task.id);
    if (leaf) {
      result.ready.push({
        ...item,
        rank: { ...keysOf(task.id), line: task.source?.lineStart ?? null },
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
                : labels.has(task.planId)
                  ? labels.get(task.planId)
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

// `avoozl next --claim` / plans_next with claim (simplify §D3): read the claim
// branches, then claim the best ready task by creating its branch on origin
// at the base head, and make its worktree on that branch. A task whose
// repository has no GitHub name is not claimable this way.
export async function claimNext(
  store,
  { policy, github = null, client, workspaceRoot, linked = null },
) {
  const errors = [
      ...(await refreshClaims(store, client)),
      ...(await readLabelFilters(store, client)),
    ],
    view = nextView(store, { policy, github }),
    ready = new Set(view.ready.map((item) => item.id)),
    repositories = new Map(store.list("repositories").map((p) => [p.id, p])),
    candidates = readyCandidates(store)
      .filter((task) => ready.has(task.id))
      .map((task) => ({
        task,
        repository: repositories.get(taskRepository(task)),
      }))
      .filter(({ repository }) => repository?.github);
  // The base: a branch on origin named for the spec or a spec that links
  // it, caught up with the default branch first (simplify §D21), else the
  // default branch. Each branch is read and merged once per call.
  const seen = new Map(),
    once = (key, read) => {
      if (!seen.has(key)) seen.set(key, read());
      return seen.get(key);
    },
    exists = (repository) => (name) =>
      once(`branch:${repository}:${name}`, () =>
        client.branch(repository, name).then(Boolean, (error) => {
          if (error.status === 404) return false;
          throw error;
        }),
      );
  const claim = await claimFirst(client, candidates, {
    baseOf: async ({ task, repository }) => {
      const fallback = repository.baseBranch || "main",
        base = await integrationBase(taskSpec(task), {
          linked,
          exists: exists(repository.github),
          fallback,
        });
      if (base === fallback) return base;
      const done = await once(`catch-up:${repository.github}:${base}`, () =>
        catchUp(store, client, {
          repository: repository.github,
          branch: base,
          base: fallback,
          prefix: repository.commitPrefix,
        }),
      );
      return done.conflict ? null : base;
    },
  });
  if (!claim) return { ...view, claimed: null, errors };
  // The take binds this caller's session before the claim is cached, so its
  // guard still sees the task as ready.
  const take = await manualTake(
    store,
    {
      taskId: claim.task.id,
      claim: true,
      workspaceRoot,
      // An integration branch is fetched so the worktree starts on it.
      ...(claim.base !== (claim.repository.baseBranch || "main")
        ? { start: await fetchedBase(claim.repository, claim.base) }
        : {}),
    },
    { github },
  );
  // `own`: this runner created it, so it deletes it once the task lands.
  cacheClaim(store, claim.repository.github, {
    spec: taskSpec(claim.task),
    task: claim.task.id,
    branch: claim.branch,
    sha: claim.head,
    own: true,
  });
  const data = store.read(),
    brief = leafBrief(store, data, {
      task: data.tasks.find((t) => t.id === claim.task.id),
      repository: claim.repository,
      attempt: take.binding.attempt,
      delivery: store.get("task_deliveries", claim.task.id),
    });
  return {
    claimed: {
      id: claim.task.id,
      title: title(claim.task),
      repository: claim.repository.id,
      branch: claim.branch,
      base: claim.base,
      head: claim.head,
      lease: claim.lease,
      refusals: claim.refusals,
    },
    worktree: take.worktree,
    ...(take.worktreeError ? { worktreeError: take.worktreeError } : {}),
    report: take.report,
    brief,
    errors,
  };
}
