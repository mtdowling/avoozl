// The workspace scheduler for spec drivers (R86.2, R86.5, R86.9, R102.3,
// design §4.32, task 41.1). The tick asks it which ready leaves may start.
//
// - Ranking. Within one priority rank, a leaf that unblocks more open tasks
//   goes first (RC31's count). Pins and ranks a person set stay first.
// - Repository-wide path holds. A leaf whose declared paths overlap a task
//   in flight in the same repository waits, whichever spec either belongs
//   to. Among ready leaves that overlap each other, the first by rank goes
//   and the rest wait. A leaf with no declared paths holds nothing.
// - Release (R102.3). A prerequisite that is only verified on its spec's
//   working branch (integrated into a branch other than the repository's
//   base) releases only a successor in the same spec and repository, whose
//   work is prepared on that working head. Any other successor waits until
//   the prerequisite lands or a person records its outcome.
import { statusComplete } from "../../query.mjs";
import {
  isManual,
  supersedingTask,
  taskCompletion,
  taskRepository,
} from "../../work-model.mjs";
import {
  busyTaskIds,
  readyCandidates,
  startNowIds,
} from "../delivery/delivery.mjs";
import { lineFirstIds } from "../flow/flow.mjs";
import { listSessionBindings } from "../sessions/session-bindings.mjs";
import { pathsOverlap, unblockCounts } from "./release-ranking.mjs";
import { digest } from "../../model.mjs";
import { planningIdentity } from "../github/github-marker.mjs";

const BLOCKING = new Set(["requires", "sequence"]);

// Integrated into a branch other than its repository's base: verified on
// the spec's working branch, not landed.
export function branchOnly(task, baseBranch) {
  const into = task?.integration?.into;
  return Boolean(
    task?.integration?.commit &&
      into &&
      !isManual(task) &&
      taskCompletion(task) === "integrated" &&
      into !== (baseBranch || "main"),
  );
}

const rankOf = (task) => task.rank ?? task.labelRank ?? 1000;
const plural = (n) => `${n} task${n === 1 ? "" : "s"}`;

// `candidates`: ready tasks in dispatch order. `flight`: tasks in flight.
// `pinned`: ids a person put first. `baseOf(repository)`: its base branch.
// Returns {order, held: Map(id -> reason), notes: Map(id -> reason)}.
export function scheduleReady({
  data,
  candidates,
  flight = [],
  pinned = new Set(),
  baseOf = () => "main",
}) {
  const byId = new Map(data.tasks.map((task) => [task.id, task])),
    counts = unblockCounts(
      data.edges.filter((edge) => BLOCKING.has(edge.kind)),
      (id) => byId.has(id) && !statusComplete(data, byId.get(id).status),
    ),
    unblocks = (task) => counts.get(task.id) ?? 0,
    held = new Map(),
    notes = new Map();
  // Ranking: inside each run of equal rank, more unblocked first. Each
  // pinned task is a run of its own, so pins keep their order.
  const key = (task) => (pinned.has(task.id) ? `pin:${task.id}` : rankOf(task)),
    order = [];
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
  const prerequisites = (task) =>
    data.edges
      .filter((edge) => edge.to === task.id && BLOCKING.has(edge.kind))
      .map((edge) => supersedingTask(byId, edge.from))
      .filter(Boolean);
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
  // Path holds, repository-wide: tasks in flight, then earlier choices.
  const going = flight.filter((task) => task.paths?.length);
  for (const task of order) {
    if (held.has(task.id) || !task.paths?.length) continue;
    const repository = taskRepository(task),
      hits = going.filter(
        (other) =>
          other.id !== task.id &&
          taskRepository(other) === repository &&
          pathsOverlap(task.paths, other.paths),
      );
    if (hits.length) {
      held.set(
        task.id,
        `Held: paths overlap ${hits.map((t) => t.id).join(", ")} in ${repository}.`,
      );
      continue;
    }
    going.push(task);
  }
  return {
    order: order.filter((task) => !held.has(task.id)).map((task) => task.id),
    held,
    notes,
  };
}

// The scheduler over this workspace's ready leaves: what readyLeaves takes
// as `skip`, plus the reasons. In flight: claimed tasks not yet integrated
// or complete. Reads only.
export function scheduleHolds(store, { github = null, skip = new Set() } = {}) {
  const data = store.read(),
    repositories = new Map(store.list("repositories").map((p) => [p.id, p])),
    bindings = listSessionBindings(store),
    claimed = busyTaskIds(store, bindings),
    flight = data.tasks.filter(
      (task) =>
        claimed.has(task.id) &&
        !task.integration?.commit &&
        !statusComplete(data, task.status),
    ),
    result = scheduleReady({
      data,
      candidates: readyCandidates(store, {
        skip,
        github,
        data,
        repositories,
        bindings,
      }),
      flight,
      pinned: new Set([...lineFirstIds(store), ...startNowIds(store)]),
      baseOf: (id) => repositories.get(id)?.baseBranch || "main",
    });
  return { ...result, skip: new Set(result.held.keys()) };
}

// An opaque name for a task on a public surface: salted with the workspace
// namespace, else `fallback`, so another machine of the same workspace
// names it the same.
const opaqueTask = (salt, taskId) =>
  digest(`${salt}\0task\0${taskId}`).slice(0, 24);

// The name a private plan's task goes by on a public repository (design
// §4.32.4: public branches, titles and bodies use opaque identifiers), or
// null when the readable ID may show. A plan is private when its spec issue
// is not stored as public; a target is public unless stored as private.
export function publicTaskName(
  store,
  { workspaceRoot, planId, taskId, repository },
) {
  const stored = (name) =>
      store
        .list("github_repositories")
        .find(
          (row) => String(row.id).toLowerCase() === String(name).toLowerCase(),
        )?.private,
    issue = store.get("receipts", `github-parent:plan:${planId}`),
    planPrivate =
      Boolean(issue?.repository) && stored(issue.repository) !== false;
  if (!planId || !planPrivate || stored(repository) === true) return null;
  const salt =
    (workspaceRoot && planningIdentity(workspaceRoot).namespace) ||
    `${issue.repository}#${issue.number}`;
  return `t-${opaqueTask(salt, taskId)}`;
}
