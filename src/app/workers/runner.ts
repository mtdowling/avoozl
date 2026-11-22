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
} from "../delivery/delivery.ts";
import {
  cacheClaim,
  claimBranch,
  claimFirst,
  claimOf,
  claimedTaskIds,
  type CreateGitHub,
  refreshClaims,
  taskSpec,
} from "./claims.ts";
import { manualTake } from "./manual-take.ts";
import { rankKeys } from "../specs/ranking.ts";
import { catchUp, integrationBase } from "../specs/integration-base.ts";
import { remoteGit } from "../git/git.ts";
import type { Store } from "../store/store.ts";
import type { SessionBinding } from "../sessions/session-bindings.ts";
import type { Task } from "../../types.ts";

// A configured checkout, as claims read it.
type RepositoryRow = {
  id: string;
  root: string;
  github?: string;
  baseBranch?: string;
  commitPrefix?: string;
};
// A task's delivery row, as the lists read it.
type DeliveryRow = {
  id: string;
  taskId: string;
  state?: string;
  cause?: string;
  attempts?: { cause?: string }[];
};
// readDeliveryPolicy's wrapper.
type Policy =
  | { status?: string; error?: string; delivery?: unknown }
  | null
  | undefined;
// One row of a list; a ready row names its task.
type Row = Record<string, unknown>;
// The GitHub calls a claim makes, and those claimNext adds to read the
// spec issues first.
type BranchClient = Parameters<typeof catchUp>[1] & CreateGitHub;
type ClaimClient = BranchClient &
  NonNullable<Parameters<typeof readLabelFilters>[1]> &
  NonNullable<Parameters<typeof readSpecAssignees>[1]> &
  NonNullable<Parameters<typeof readLabeledIssues>[1]>;
// One cached read per key.
const memo = <T>(seen: Map<string, T>, key: string, read: () => T): T => {
  const known = seen.get(key);
  if (known !== undefined) return known;
  const value = read();
  seen.set(key, value);
  return value;
};
const statusOf = (error: unknown) =>
  error && typeof error === "object" && "status" in error
    ? error.status
    : undefined;

// `origin/<branch>` once fetched, else null so the worktree starts from the
// local base.
const fetchedBase = (repository: RepositoryRow, branch: string) =>
  remoteGit(repository.root, ["fetch", "--quiet", "origin", branch]).then(
    () => `origin/${branch}`,
    () => null,
  );
import { sessionUrl } from "../tick/notifications.ts";
import { listSessionBindings } from "../sessions/session-bindings.ts";
import { scheduleHolds } from "../specs/spec-scheduler.ts";
import { isArchivedTask } from "../../browse-model.ts";
import { statusComplete } from "../../query.ts";
import { labelHolds, readLabelFilters } from "../specs/label-filters.ts";
import { assigneeHolds, readSpecAssignees } from "../specs/spec-assignee.ts";
import { readLabeledIssues } from "../specs/labeled-issues.ts";
import {
  completionReached,
  isManual,
  isRefused,
  taskKind,
  taskRepository,
} from "../../work-model.ts";

const BLOCKING = new Set(["requires", "sequence"]);
const NEEDS_YOU_STATUSES = new Set(["blocked", "review"]);

const effective = (policy: Policy) =>
  policy?.delivery || { ...DELIVERY_DEFAULTS, repositories: {} };

const title = (task: { id: string; title?: string }) => task.title || task.id;

// The newest worker binding per task, any source.
function newestWorkers(bindings: SessionBinding[]) {
  const newest = new Map<string, SessionBinding>();
  for (const binding of bindings)
    if (binding.role === "worker") {
      const seen = newest.get(binding.taskId);
      if (!seen || seen.attempt < binding.attempt)
        newest.set(binding.taskId, binding);
    }
  return newest;
}

const phase = (
  binding: SessionBinding | undefined,
  delivery: DeliveryRow | undefined,
) =>
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
export function nextView(
  store: Store,
  { policy, github = null }: { policy: Policy; github?: unknown },
) {
  const data = store.read(),
    delivery = effective(policy),
    bindings = listSessionBindings(store),
    newest = newestWorkers(bindings),
    claimed = busyTaskIds(store, bindings),
    branches = claimedTaskIds(store),
    labels = new Map([...labelHolds(store), ...assigneeHolds(store)]),
    deliveries = new Map(
      store.list<DeliveryRow>("task_deliveries").map((d) => [d.taskId, d]),
    ),
    schedule = scheduleHolds(store, { github }),
    startable = new Map(
      readyLeaves(store, delivery, { skip: schedule.skip }).map((leaf) => [
        leaf.task.id,
        leaf,
      ]),
    ),
    byId = new Map(data.tasks.map((task) => [task.id, task])),
    complete = (status: string | undefined) => statusComplete(data, status),
    // The three ranking keys each ready task is shown with (§D3.1).
    keysOf = rankKeys(
      data.edges.filter((edge) => BLOCKING.has(edge.kind)),
      (id: string) => byId.has(id) && !complete(byId.get(id)?.status),
    );
  const result: {
    policy: string;
    ready: (Row & { id: string })[];
    running: Row[];
    waiting: Row[];
    needsYou: Row[];
    done: Row[];
    finished?: boolean;
  } = {
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
  const blockersOf = (task: Task) =>
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
        ? [
            "failed",
            record.cause || record.attempts?.at(-1)?.cause || "stopped",
          ]
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
                : labels.has(task.planId ?? "")
                  ? labels.get(task.planId ?? "")
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

// The base a claim starts from: a branch on origin named for the spec or a
// spec that links it, caught up with the default branch first (simplify
// §D21), else the default branch. Each branch is read and merged once per
// call of the function this returns.
type Linked = Parameters<typeof integrationBase>[1]["linked"];

function claimBase(store: Store, client: BranchClient, linked: Linked) {
  const branches = new Map<string, Promise<boolean>>(),
    caughtUp = new Map<string, ReturnType<typeof catchUp>>(),
    exists = (repository: string) => (name: string) =>
      memo(branches, `${repository}:${name}`, () =>
        client.branch(repository, name).then(Boolean, (error) => {
          if (statusOf(error) === 404) return false;
          throw error;
        }),
      );
  return async ({
    task,
    repository,
  }: {
    task: Task;
    repository: RepositoryRow;
  }) => {
    const fallback = repository.baseBranch || "main",
      base = await integrationBase(taskSpec(task), {
        linked,
        exists: exists(repository.github ?? ""),
        fallback,
      });
    if (base === fallback) return base;
    const done = await memo(caughtUp, `${repository.github}:${base}`, () =>
      catchUp(store, client, {
        repository: repository.github ?? "",
        branch: base,
        base: fallback,
        prefix: repository.commitPrefix,
      }),
    );
    return done.conflict ? null : base;
  };
}

// The loop pass's claims (simplify §D6): a worker start on a repository with
// a GitHub name first creates its task's claim branch on origin, as
// `avoozl next --claim` does, and the worktree is made on that branch. A
// start whose claim another runner made first is dropped, so two machines
// never start one task, and so is one whose claim GitHub could not make: it
// is tried again next pass. A task this runner already claimed keeps its
// start. Returns {dispatches, errors}.
export async function claimDispatches<
  D extends { task?: string; role?: string },
>(
  store: Store,
  client: BranchClient,
  dispatches: D[],
  { linked = null }: { linked?: Linked } = {},
) {
  const repositories = new Map(
      store.list<RepositoryRow>("repositories").map((r) => [r.id, r]),
    ),
    tasks = new Map(store.read().tasks.map((task) => [task.id, task])),
    baseOf = claimBase(store, client, linked),
    kept: D[] = [],
    errors: { repository: string; error: string }[] = [];
  for (const dispatch of dispatches) {
    const task = tasks.get(dispatch.task ?? ""),
      repository = task && repositories.get(taskRepository(task) ?? "");
    if (
      dispatch.role !== "worker" ||
      !task ||
      !repository?.github ||
      claimOf(store, repository.github, task.id)?.own
    ) {
      kept.push(dispatch);
      continue;
    }
    let claim = null;
    try {
      claim = await claimFirst(
        client,
        [{ task, repository: { ...repository, github: repository.github } }],
        { baseOf },
      );
    } catch (error) {
      if (statusOf(error) !== 409)
        errors.push({
          repository: repository.github,
          error: error instanceof Error ? error.message : String(error),
        });
    }
    if (!claim) continue;
    cacheClaim(store, repository.github, {
      spec: taskSpec(task),
      task: task.id,
      branch: claim.branch,
      sha: claim.head,
      own: true,
    });
    kept.push(dispatch);
  }
  return { dispatches: kept, errors };
}

// `avoozl next --claim` / plans_next with claim (simplify §D3): read the claim
// branches, then claim the best ready task by creating its branch on origin
// at the base head, and make its worktree on that branch. A task whose
// repository has no GitHub name is not claimable this way.
export async function claimNext(
  store: Store,
  {
    policy,
    github = null,
    client,
    workspaceRoot,
    linked = null,
  }: {
    policy: Policy;
    github?: unknown;
    client: ClaimClient;
    workspaceRoot?: string | null;
    linked?: Linked;
  },
) {
  const errors = [
      ...(await refreshClaims(store, client)),
      ...(await readLabelFilters(store, client)),
      ...(await readSpecAssignees(store, client)),
      ...(await readLabeledIssues(store, client)),
    ],
    view = nextView(store, { policy, github }),
    ready = new Set(view.ready.map((item) => item.id)),
    repositories = new Map(
      store.list<RepositoryRow>("repositories").map((p) => [p.id, p]),
    ),
    candidates = readyCandidates(store)
      .filter((task) => ready.has(task.id))
      .map((task) => ({
        task,
        repository: repositories.get(taskRepository(task) ?? ""),
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          task: (typeof candidate)["task"];
          repository: RepositoryRow & { github: string };
        } => Boolean(candidate.repository?.github),
      );
  const claim = await claimFirst(client, candidates, {
    baseOf: claimBase(store, client, linked),
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
  if (!("binding" in take))
    throw Error("The claim's take released a session instead of binding one.");
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
