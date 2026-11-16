// Read-only presentation of stored CI facts. Views never fetch GitHub data.
import { ciFacts, ciRepositories, CLASS_GLOBS } from "./flow-ci.mjs";
import { flowPolicy } from "./flow.mjs";

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
  return {
    repositories: ciRepositories(policy)
      .filter(
        (repository) => !input.repository || repository === input.repository,
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
