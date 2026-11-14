// Plans-repo mode helpers shared by delivery, completion and the tick
// (design §6.6, tasks 4.7–4.9): which leaves are plans-repo leaves, the
// linked branch each one gets, and the leak screen that keeps the planning
// repository's name out of everything the code repository shows.
import { taskKind, taskRepository, taskRoute } from "../work-model.mjs";
import { check as contentCheck, findPlanningLeak } from "./content-rules.mjs";
import { radarIssueRepository } from "./github-marker.mjs";
import { fail } from "./store.mjs";

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

// The plans repository name a radar issue may show (radar-coder D4.1), or
// null when it shows none. `radar.showPlansRepo` decides; unset it follows
// the code repository: on when private, off when public. A public code
// repository with it off is refused, and a name that content rules block is
// refused, both before any write. Only plans-repo mode with `issue-radar`.
export function plansNameForIssue(store, identity, config, remote) {
  if (!radarIssueRepository(identity, config.id)) return null;
  const entry = Object.entries(identity.repositories || {}).find(
      ([id]) => id.toLowerCase() === config.id.toLowerCase(),
    )?.[1],
    isPrivate = remote?.private === true,
    shown = entry?.radar?.showPlansRepo ?? isPrivate;
  if (!shown) {
    if (!isPrivate)
      fail(
        `${config.id} is public, so its issues cannot name the plans repository. Turn on "Show the plans repository name in issues" for it, or move the spec into ${config.id}.`,
        409,
      );
    return null;
  }
  const name = identity.planningRepository,
    result = contentCheck(store, {
      boundary: "github",
      repository: config.id,
      target: "plans-repository-name",
      text: name,
    });
  if (result.findings.length || result.unavailable.length)
    fail(
      `A content rule blocks the plans repository name for ${config.id}. Turn off "Show the plans repository name in issues" or change the rule.`,
      422,
    );
  return name;
}
