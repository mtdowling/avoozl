// The workspace scheduler for spec drivers (R86.2, R86.5, R86.9, R102.3,
// design §4.32, task 41.1). The tick asks it which ready leaves may start.
//
// - Ranking. Within one priority rank, a leaf that unblocks more open tasks
//   goes first (ranking.mjs). Pins and ranks a person set stay first. Two
//   tasks that change one file meet at landing's merge, not here.
// - Release (R102.3). A prerequisite that is only verified on its spec's
//   working branch (integrated into a branch other than the repository's
//   base) releases only a successor in the same spec and repository, whose
//   work is prepared on that working head. Any other successor waits until
//   the prerequisite lands or a person records its outcome.
import { statusComplete } from "../../query.ts";
import { isManual, taskCompletion, taskRepository } from "../../work-model.ts";
import { readyCandidates, startNowIds } from "../delivery/delivery.ts";
import { lineFirstIds } from "../flow/flow.ts";
import { listSessionBindings } from "../sessions/session-bindings.ts";
import { unblockCounts } from "./ranking.ts";
import { digest } from "../../model.ts";
import { planningIdentity } from "../github/github-marker.ts";
import type { Store } from "../store/store.ts";
import type { Snapshot, Task } from "../../types.ts";

const BLOCKING = new Set(["requires", "sequence"]);

// Integrated into a branch other than its repository's base: verified on
// the spec's working branch, not landed.
export function branchOnly(
  task: Task | null | undefined,
  baseBranch: string | null | undefined,
) {
  const into = task?.integration?.into;
  return Boolean(
    task?.integration?.commit &&
      into &&
      !isManual(task) &&
      taskCompletion(task) === "integrated" &&
      into !== (baseBranch || "main"),
  );
}

const rankOf = (task: Task) => task.rank ?? task.labelRank ?? 1000;
const plural = (n: number) => `${n} task${n === 1 ? "" : "s"}`;

// `candidates`: ready tasks in dispatch order. `pinned`: ids a person put first. `baseOf(repository)`: its base branch.
// Returns {order, held: Map(id -> reason), notes: Map(id -> reason)}.
export function scheduleReady({
  data,
  candidates,
  pinned = new Set(),
  baseOf = () => "main",
}: {
  data: Snapshot;
  candidates: Task[];
  pinned?: Set<string>;
  baseOf?: (repository: string | null) => string;
}) {
  const byId = new Map(data.tasks.map((task) => [task.id, task])),
    counts = unblockCounts(
      data.edges
        .filter((edge) => BLOCKING.has(String(edge.kind)))
        .map((edge) => ({ from: edge.from, to: edge.to })),
      (id) => byId.has(id) && !statusComplete(data, byId.get(id)?.status),
    ),
    unblocks = (task: Task) => counts.get(task.id) ?? 0,
    held = new Map<string, string>(),
    notes = new Map<string, string>();
  // Ranking: inside each run of equal rank, more unblocked first. Each
  // pinned task is a run of its own, so pins keep their order.
  const key = (task: Task) =>
      pinned.has(task.id) ? `pin:${task.id}` : rankOf(task),
    order: Task[] = [];
  for (let start = 0; start < candidates.length; ) {
    let end = start;
    while (
      end < candidates.length &&
      key(candidates[end]) === key(candidates[start])
    )
      end += 1;
    order.push(
      ...candidates
        .slice(start, end)
        .map((task, index) => ({ task, index }))
        .sort(
          (x, y) => unblocks(y.task) - unblocks(x.task) || x.index - y.index,
        )
        .map((entry) => entry.task),
    );
    start = end;
  }
  for (const task of order)
    if (unblocks(task) > 0)
      notes.set(task.id, `Next: unblocks ${plural(unblocks(task))}.`);
  // Release: a branch-only prerequisite frees its own spec's successors only.
  const prerequisites = (task: Task) =>
    data.edges
      .filter((edge) => edge.to === task.id && BLOCKING.has(String(edge.kind)))
      .map((edge) => byId.get(edge.from))
      .filter((before): before is Task => Boolean(before));
  for (const task of order) {
    const waits = prerequisites(task).filter(
      (before) =>
        branchOnly(before, baseOf(taskRepository(before))) &&
        (before.planId !== task.planId ||
          !task.planId ||
          taskRepository(before) !== taskRepository(task)),
    );
    if (waits.length)
      held.set(
        task.id,
        `Waits for ${waits.map((t) => t.id).join(", ")} to land: verified on a working branch this task does not build on.`,
      );
  }
  return {
    order: order.filter((task) => !held.has(task.id)).map((task) => task.id),
    held,
    notes,
  };
}

// The scheduler over this workspace's ready leaves: what readyLeaves takes
// as `skip`, plus the reasons. Reads only.
export function scheduleHolds(
  store: Store,
  {
    github = null,
    skip = new Set(),
  }: { github?: unknown; skip?: Set<string> } = {},
) {
  const data = store.read(),
    repositories = new Map(
      store
        .list<{ id: string; baseBranch?: string }>("repositories")
        .map((p) => [p.id, p]),
    ),
    bindings = listSessionBindings(store),
    result = scheduleReady({
      data,
      candidates: readyCandidates(store, {
        skip,
        data,
        repositories,
        bindings,
      }),
      pinned: new Set([...lineFirstIds(store), ...startNowIds(store)]),
      baseOf: (id) => (id && repositories.get(id)?.baseBranch) || "main",
    });
  return { ...result, skip: new Set(result.held.keys()) };
}

// An opaque name for a task on a public surface: salted with the workspace
// namespace, else `fallback`, so another machine of the same workspace
// names it the same.
const opaqueTask = (salt: string, taskId: string) =>
  digest(`${salt}\0task\0${taskId}`).slice(0, 24);

// The name a private plan's task goes by on a public repository (design
// §4.32.4: public branches, titles and bodies use opaque identifiers), or
// null when the readable ID may show. A plan is private when its spec issue
// is not stored as public; a target is public unless stored as private.
export function publicTaskName(
  store: Store,
  {
    workspaceRoot,
    planId,
    taskId,
    repository,
  }: {
    workspaceRoot?: string | null;
    planId?: string | null;
    taskId: string;
    repository: string;
  },
) {
  const stored = (name: unknown) =>
      store
        .list<{ id: string; private?: boolean }>("github_repositories")
        .find(
          (row) => String(row.id).toLowerCase() === String(name).toLowerCase(),
        )?.private,
    issue = store.get<{ id: string; repository?: string; number?: number }>(
      "receipts",
      `github-parent:plan:${planId}`,
    ),
    planPrivate =
      Boolean(issue?.repository) && stored(issue?.repository) !== false;
  if (!planId || !planPrivate || stored(repository) === true) return null;
  const salt =
    (workspaceRoot && planningIdentity(workspaceRoot).namespace) ||
    `${issue?.repository}#${issue?.number}`;
  return `t-${opaqueTask(salt, taskId)}`;
}
