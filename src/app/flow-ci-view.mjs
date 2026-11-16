// Read-only presentation of stored CI facts. Views never fetch GitHub data.
import { ciFacts, ciRepositories, CLASS_GLOBS } from "./flow-ci.mjs";
import { flowPolicy, listOr } from "./flow.mjs";

const lower = (value) => String(value || "").toLowerCase();

function repositoryNames(store) {
  const projects = listOr(store, "projects"),
    observed = listOr(store, "github_repositories");
  return {
    matches(repository, value) {
      if (lower(repository) === lower(value)) return true;
      const project = projects.find((row) => row.id === value);
      if (project?.repository)
        return lower(project.repository) === lower(repository);
      return observed.some(
        (row) => row.projectId === value && lower(row.id) === lower(repository),
      );
    },
    pickerId(repository) {
      return (
        projects.find((row) => lower(row.repository) === lower(repository))
          ?.id ??
        observed.find(
          (row) =>
            lower(row.id) === lower(repository) &&
            row.projectId &&
            !projects.some(
              (project) => project.id === row.projectId && project.repository,
            ),
        )?.projectId ??
        repository
      );
    },
  };
}

// Add CI-only repositories without renaming the task filter's existing values
// or adding a GitHub-name alias for a project already in the picker.
export function ciRepositoryPickerIds(store, policy, existing = []) {
  const names = repositoryNames(store);
  return [
    ...new Set(
      ciRepositories(policy)
        .filter(
          (repository) =>
            !existing.some((value) => names.matches(repository, value)),
        )
        .map((repository) => names.pickerId(repository)),
    ),
  ];
}

export function ciClassGlobs(config = {}) {
  return { ...CLASS_GLOBS, ...flowPolicy(config).workspace.ci.classes };
}

export function ciSettingsView(config = {}) {
  const { windowDays, docsOnlyMinutes, waitShare, minPullRequests } =
    flowPolicy(config).workspace.ci;
  return {
    ciClassGlobs: ciClassGlobs(config),
    ciEffective: { windowDays, docsOnlyMinutes, waitShare, minPullRequests },
  };
}

export function ciFlowView(store, config, policy, input = {}, options = {}) {
  const names = repositoryNames(store);
  return {
    repositories: ciRepositories(policy)
      .filter(
        (repository) =>
          !input.repository || names.matches(repository, input.repository),
      )
      .map((repository) => {
        const facts = ciFacts(store, config, repository, options),
          workflows = new Map();
        for (const repeat of facts.repeats) {
          const row = workflows.get(repeat.workflow) || {
            workflow: repeat.workflow,
            commits: 0,
            extraRuns: 0,
            extraMinutes: 0,
          };
          row.commits++;
          row.extraRuns += repeat.runs - 1;
          row.extraMinutes += repeat.extraMinutes;
          workflows.set(row.workflow, row);
        }
        return {
          repository,
          windowDays: facts.settings.windowDays,
          byClass: facts.byClass,
          waitShare: facts.waitShare,
          waitLimit: facts.settings.waitShare,
          closedPullRequests: facts.closed,
          repeats: [...workflows.values()]
            .map((row) => ({
              ...row,
              extraMinutes: Math.round(row.extraMinutes * 10) / 10,
            }))
            .sort((a, b) => a.workflow.localeCompare(b.workflow)),
        };
      }),
  };
}
