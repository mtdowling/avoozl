// Plans-repo mode helpers shared by delivery, completion and the tick
// (design §6.6, tasks 4.7–4.9): which leaves are plans-repo leaves, the
// linked branch each one gets, and the leak screen that keeps the planning
// repository's name out of everything the code repository shows.
import { taskKind, taskRepository, taskRoute } from "../work-model.mjs";
import { findPlanningLeak } from "./content-rules.mjs";

// One record per leaf whose linked branch the tick created or reused:
// {id: taskId, taskId, repository, name, baseBranch, linkedBranchId} or,
// when it could not, {id, taskId, error}.
export const LINKED_BRANCHES = "github_linked_branches";

export const linkedBranchName = (taskId) => `avoozl/${taskId}`;

const lower = (value) => String(value || "").toLowerCase();

// A GitHub leaf an Avoozl worker codes on a linked branch (§6.6): a leaf
// whose issue lives in the planning repository, or in single-repo mode a
// leaf in a repository whose `coder` is `worker`. Issue Radar codes the rest.
export function isLinkedBranchLeaf(task, github) {
  if (
    taskKind(task) !== "leaf" ||
    taskRoute(task) !== "github" ||
    !task.github?.number
  )
    return false;
  const repository = lower(task.github.repository);
  if (github?.mode === "plans-repo")
    return (
      Boolean(github.planningRepository) &&
      repository === lower(github.planningRepository)
    );
  if (github?.mode !== "single-repo") return false;
  const entry = Object.entries(github.repositories || {}).find(
    ([id]) => lower(id) === repository,
  );
  return entry?.[1].coder === "worker";
}

// The leaf's code repository: the issue's own repository, except in
// plans-repo mode, where it is the GitHub repository of the task's project.
export function codeRepository(store, task, mode) {
  if (mode !== "plans-repo") return task.github.repository;
  const project = taskRepository(task);
  return (
    store
      .list("github_repositories")
      .find((entry) => entry.projectId === project)?.id ||
    store.get("projects", project)?.repository ||
    null
  );
}

// A recorded linked branch a worker may be sent to, or null.
export function linkedBranch(store, taskId) {
  const record = store.get(LINKED_BRANCHES, taskId);
  return record && !record.error ? record : null;
}

// The leak screen is the built-in rule set builtin:planning-repository of
// content-rules.mjs (design §4.9); its decoding is the shared decoder.
export { findPlanningLeak };

// The first pull request whose title, body or a commit message names the
// planning repository: {url, number, field, form} or null.
export function pullRequestLeak(pulls, planningRepository) {
  for (const pull of pulls || []) {
    const leak = findPlanningLeak(
      [
        ["title", pull.title],
        ["body", pull.body],
        ...(pull.commits || []).map((commit) => [
          commit.oid
            ? `commit ${commit.oid.slice(0, 12)} message`
            : "commit message",
          commit.message,
        ]),
      ],
      planningRepository,
    );
    if (leak) return { url: pull.url, number: pull.number, ...leak };
  }
  return null;
}
