// Linked-branch dispatch (design §6.6, task 4.7): before a ready linked-branch
// leaf's brief goes out, the tick creates the leaf's linked branch
// `avoozl/<task-id>` in its code repository from the head of `baseBranch`
// with createLinkedBranch, or reuses the one the planning issue already
// lists. GitHub then closes the planning issue when that branch's pull
// request merges into the default branch (F51). Untested inside an
// organization: proof P25 is unproven (F52).
//
// Stacked pull requests (task 8.2, R27.13), only where a code repository's
// policy sets `stackedPullRequests`: a leaf whose one unmet blocker is a
// linked-branch leaf with an open pull request gets its branch cut from that
// blocker's branch head instead, and its brief keeps its pull request on the
// blocker's branch until the blocker merges.
import { leafBrief, readyLeaves } from "./delivery.mjs";
import {
  codeRepository,
  findPlanningLeak,
  isLinkedBranchLeaf,
  LINKED_BRANCHES,
  linkedBranch,
  linkedBranchName,
} from "./github-plans-repo.mjs";
import { statusComplete } from "../query.mjs";
import { completionReached, supersedingTask } from "../work-model.mjs";

const lower = (value) => String(value || "").toLowerCase();

// Record a failure once per distinct cause; the next tick tries again.
function failed(store, task, error, notify) {
  const previous = store.get(LINKED_BRANCHES, task.id);
  if (previous?.error === error) return;
  store.put(LINKED_BRANCHES, {
    id: task.id,
    taskId: task.id,
    error,
    at: new Date().toISOString(),
  });
  notify.push({
    channel: "decision",
    task: task.id,
    title: `${task.id} cannot start`,
    text: error,
    resume: "Fix the cause; the next tick tries again.",
  });
}

// Leaves that could stack: task ID -> blocker ID, for each linked-branch
// leaf with no branch yet, in a code repository with stacking on, whose only
// unmet requires or sequence blocker is a linked-branch leaf in the same code
// repository that already has its branch and no open decision. Whether that
// blocker's pull request is open is GitHub's to say, below. Reads only.
export function stackCandidates(store, policy) {
  const candidates = new Map();
  if (
    !Object.values(policy?.repositories || {}).some(
      (entry) => entry.stackedPullRequests,
    )
  )
    return candidates;
  const data = store.read(),
    byId = new Map(data.tasks.map((task) => [task.id, task])),
    complete = (status) => statusComplete(data, status);
  for (const task of data.tasks) {
    if (
      !isLinkedBranchLeaf(task, policy) ||
      store.get(LINKED_BRANCHES, task.id)
    )
      continue;
    const code = codeRepository(store, task, policy.mode),
      entry = Object.entries(policy.repositories).find(
        ([id]) => lower(id) === lower(code),
      )?.[1];
    if (!entry?.stackedPullRequests) continue;
    const unmet = data.edges.filter((edge) => {
      if (edge.to !== task.id || !["requires", "sequence"].includes(edge.kind))
        return false;
      const from = supersedingTask(byId, edge.from);
      return !completionReached(from, edge.condition, complete);
    });
    if (unmet.length !== 1) continue;
    const blocker = supersedingTask(byId, unmet[0].from),
      branch = blocker && linkedBranch(store, blocker.id);
    if (
      !blocker ||
      blocker.decision ||
      !isLinkedBranchLeaf(blocker, policy) ||
      !branch ||
      lower(branch.repository) !== lower(code)
    )
      continue;
    candidates.set(task.id, blocker.id);
  }
  return candidates;
}

// One pass over the ready linked-branch leaves that have no linked branch yet,
// within dispatch capacity. Writes GitHub only to create a missing branch.
// Returns notices for the cron.
export async function ensureLinkedBranches(
  store,
  github,
  { delivery, policy },
) {
  const notify = [];
  if (!delivery || !policy?.mode) return { notify };
  const data = store.read(),
    stack = stackCandidates(store, policy),
    // shortcut: a stack candidate whose blocker has no open pull request
    // still takes a capacity slot in this pass and is then skipped; it
    // starts on a later tick once a slot is free and the pull request opens.
    leaves = readyLeaves(store, delivery, {
      github: policy,
      unbranched: true,
      stack,
    }).filter(
      ({ task }) =>
        task.github?.number && !store.get(LINKED_BRANCHES, task.id)?.name,
    );
  for (const leaf of leaves) {
    const { task, project } = leaf,
      name = linkedBranchName(task.id),
      code = codeRepository(store, task, policy.mode),
      finalBase =
        (code && policy.repositories[code]?.baseBranch) ||
        project.baseBranch ||
        "main";
    if (!code) {
      failed(
        store,
        task,
        `${task.id} names no registered GitHub code repository.`,
        notify,
      );
      continue;
    }
    let stacked = null;
    if (stack.has(task.id)) {
      const blocker = linkedBranch(store, stack.get(task.id));
      try {
        const pulls = await github.branchPullRequests(code, blocker.name);
        if (
          !pulls.some(
            (pull) =>
              pull.state === "OPEN" &&
              !pull.merged &&
              pull.headRefName === blocker.name,
          )
        )
          continue;
      } catch {
        // Unreadable now; the next tick asks again.
        continue;
      }
      stacked = {
        stackedOn: blocker.taskId,
        branch: blocker.name,
        finalBase: blocker.finalBase || blocker.baseBranch || finalBase,
      };
    }
    // Nothing that names the planning repository reaches the code
    // repository: not the branch name, not the brief (R28.7).
    const leak = findPlanningLeak(
      [
        ["branch name", name],
        ["brief", leafBrief(store, data, leaf)],
      ],
      policy.planningRepository,
    );
    if (leak) {
      failed(
        store,
        task,
        `The ${leak.field} for ${task.id} names the planning repository (${leak.form}). Edit the task's title, acceptance, or checks.`,
        notify,
      );
      continue;
    }
    try {
      const links = await github.issueLinks(
          task.github.repository,
          task.github.number,
        ),
        existing = links.linkedBranches.find(
          (branch) =>
            branch.name === name && lower(branch.repository) === lower(code),
        ),
        // A stacked branch records the blocker head it was cut from.
        head =
          !existing || stacked
            ? await github.branchHead(
                code,
                stacked ? stacked.branch : finalBase,
              )
            : null;
      // shortcut: a branch of this name that exists but is not linked (the
      // issue closed and reopened, F52) makes createLinkedBranch fail; the
      // failure is a decision rather than a guess at reuse.
      const branch =
        existing ||
        (await github.createLinkedBranch({
          issueId: links.nodeId,
          ...head,
          name,
        }));
      store.put(LINKED_BRANCHES, {
        id: task.id,
        taskId: task.id,
        repository: code,
        name,
        baseBranch: stacked ? stacked.branch : finalBase,
        linkedBranchId: branch.id,
        reused: Boolean(existing),
        ...(stacked
          ? {
              stackedOn: stacked.stackedOn,
              stackedAt: head.oid,
              finalBase: stacked.finalBase,
            }
          : {}),
        at: new Date().toISOString(),
      });
    } catch (error) {
      failed(
        store,
        task,
        `Avoozl could not create linked branch ${name} in ${code}: ${error.message}`,
        notify,
      );
    }
  }
  return { notify };
}
