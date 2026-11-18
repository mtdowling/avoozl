// The workspace scheduler for spec drivers (R86.2, R86.5, R86.9, R102.4,
// design §4.32, task 41.1). The tick asks it which ready leaves may start.
//
// - Ranking. Within one priority rank, a leaf that unblocks more open tasks
//   goes first (RC31's count). Pins and ranks a person set stay first.
// - Repository-wide path holds. A leaf whose declared paths overlap a task
//   in flight in the same repository waits, whichever spec either belongs
//   to. Among ready leaves that overlap each other, the first by rank goes
//   and the rest wait. A leaf with no declared paths holds nothing.
// - Release (R102.4). A prerequisite that is only verified on its spec's
//   working branch (integrated into a branch other than the repository's
//   base) releases only a successor in the same spec and repository, whose
//   work is prepared on that working head. Any other successor waits until
//   the prerequisite lands or a person records its outcome.
// - Authority and generation (§4.32.7). Right before dispatch the driver
//   replays each dispatching spec's journal: a held journal, an open hold or
//   stop control, or a newer generation whose driver is not this
//   workspace's holds the spec, and the tasks of an outstanding landing
//   intent wait. A spec with no journal, or none taken over yet, keeps the
//   plan-issue driver rule (driver.mjs, R66). A journal that cannot be read
//   holds its spec.
import { statusComplete } from "../query.mjs";
import {
  isManual,
  supersedingTask,
  taskCompletion,
  taskRepository,
} from "../work-model.mjs";
import { claimedTaskIds, readyCandidates, startNowIds } from "./delivery.mjs";
import { driverState, heldTasks } from "./driver-generations.mjs";
import { lineFirstIds } from "./flow.mjs";
import { listSessionBindings } from "./session-bindings.mjs";
import { pathsOverlap, unblockCounts } from "./release-ranking.mjs";
import { localJournalFile } from "./spec-publication.mjs";
import { githubJournal, localJournal, replayJournal } from "./spec-journal.mjs";

const BLOCKING = new Set(["requires", "sequence"]);
const DRIVERS = "specDrivers";
const STOPPING = new Set(["hold", "stop"]);

// The driver id this workspace holds for a spec after a take over.
export const driverIdOf = (store, planId) =>
  store.getMeta(DRIVERS)?.[planId] ?? null;
export function rememberDriver(store, planId, driver) {
  store.setMeta(DRIVERS, {
    ...(store.getMeta(DRIVERS) ?? {}),
    [planId]: driver,
  });
}

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
    projects = new Map(store.list("projects").map((p) => [p.id, p])),
    bindings = listSessionBindings(store),
    claimed = claimedTaskIds(store, bindings),
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
        projects,
        bindings,
      }),
      flight,
      pinned: new Set([...lineFirstIds(store), ...startNowIds(store)]),
      baseOf: (id) => projects.get(id)?.baseBranch || "main",
    });
  return { ...result, skip: new Set(result.held.keys()) };
}

// The journal a spec was published with, or null. A local file is this
// workspace's own, so its author is the operator. `actor` writes a local
// file; a GitHub journal writes as the signed-in login. `issue` names a
// GitHub journal's spec issue.
export function journalOf(store, { github, workspaceRoot, actor }, planId) {
  if (store.get("receipts", `spec-journal:${planId}`) && workspaceRoot)
    return {
      ...localJournal(localJournalFile(workspaceRoot, planId), actor ?? ""),
      permission: async () => "admin",
      visibility: async () => "private",
      local: true,
    };
  const issue = store.get("receipts", `github-parent:plan:${planId}`);
  if (!issue?.number) return null;
  if (!github) return { unreadable: true };
  // The client reads owner and repo; a receipt whose repository has no
  // configuration row names it as owner/name, which the client parses.
  const row = store.get("github_repositories", issue.repository),
    config = row?.owner && row?.repo ? row : issue.repository;
  const id = row?.id ?? issue.repository;
  return {
    ...githubJournal(github, config, issue.number),
    // A public issue's records must be opaque; one whose visibility cannot
    // be read is judged as public, the stricter rule.
    visibility: async () =>
      (await github.repository(config).catch(() => null))?.private === true
        ? "private"
        : "public",
    // The home, and every repository stored as public: a public record may
    // name those (its Radar sources, radar-backlinks.mjs).
    publicRepositories: [
      id,
      ...store
        .list("github_repositories")
        .filter((entry) => entry.private === false && entry.id !== id)
        .map((entry) => entry.id),
    ],
    issue: { repository: id, number: issue.number },
  };
}

// Specs that lost authority, and tasks an outstanding intent holds, for the
// specs about to dispatch. {plans: Set, tasks: Set, reasons: Map}.
export async function revalidateSpecs(
  store,
  { github = null, workspaceRoot = null, planIds = [] } = {},
) {
  const plans = new Set(),
    tasks = new Set(),
    reasons = new Map(),
    lose = (planId, reason) => {
      plans.add(planId);
      reasons.set(planId, reason);
    };
  for (const planId of new Set(planIds)) {
    const journal = journalOf(store, { github, workspaceRoot }, planId);
    if (!journal) continue;
    if (journal.unreadable) {
      lose(planId, "journal-unreadable");
      continue;
    }
    let state;
    try {
      state = driverState(
        await replayJournal(await journal.list(), {
          permission: journal.permission,
          visibility: await journal.visibility(),
          publicRepositories: journal.publicRepositories ?? [],
        }),
      );
    } catch {
      lose(planId, "journal-unreadable");
      continue;
    }
    if (state.held) lose(planId, "journal-held");
    else if ([...state.controls.values()].some((flag) => STOPPING.has(flag)))
      lose(planId, "stopped");
    else if (state.generation > 0 && state.driver !== driverIdOf(store, planId))
      lose(planId, "displaced");
    for (const id of heldTasks(state)) tasks.add(id);
  }
  return { plans, tasks, reasons };
}
