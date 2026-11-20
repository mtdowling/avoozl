// Operations of one feature: name, class, MCP policy and handler.
import {
  driverContext,
  driverStatus,
  updateMachineSettings,
} from "../workers/driver.mjs";
import { planningIdentity } from "../github/github-marker.mjs";
import { repositorySetup } from "../workspace/repository-setup.mjs";
import { publishSpec } from "../specs/spec-publication.mjs";
import { fail } from "../store/store.mjs";
import { publishPlanningPullRequest } from "../workspace/workspace-repository.mjs";
import { person, routed } from "../api/operation-policy.mjs";

export const entries = [
  // The spec driver (§6.10): the spec issue's assignee. Status reads
  // everywhere; changing this computer's settings is a person's.
  {
    name: "driver.status",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return driverStatus(store, input);
    },
  },

  {
    name: "driver.settings.update",
    class: "protect",
    github: "check-in",
    policy: person("Only a person changes this computer's driver settings."),
    handler({ input }) {
      const store = this.store;

      const ctx = driverContext(store);
      if (!ctx) fail("This workspace has no driver settings.", 409);
      updateMachineSettings(store, ctx.settingsFile, input);
      return driverStatus(store);
    },
  },

  // Publish issue (R102.2): a person's explicit act, never part of approval.
  {
    name: "spec.publish",
    class: "execute",
    github: "spec-issues",
    policy: person("Only a person publishes a spec issue."),
    async handler({ input, context }) {
      const store = this.store;

      if (context.caller || context.mcp)
        fail("Only a person publishes a spec issue.", 403);
      return publishSpec(store, {
        github: this.github,
        identity: planningIdentity(this.workspaceRoot),
        planId: input.planId,
        repository: input.repository,
      });
    },
  },
  // Set up a repository for landing (R89, task 42.7): a preview, applied
  // only with `confirm` (`--yes`) by a person.
  {
    name: "repository.setup",
    class: "execute",
    github: "check-in",
    policy: person("Only a person applies repository setup.", (input) =>
      Boolean(input?.confirm),
    ),
    handler({ input, context }) {
      const store = this.store;

      if (input.confirm && (context.caller || context.mcp))
        fail("Only a person applies repository setup.", 403);
      if (!this.github?.available?.())
        fail("Repository setup needs GitHub; run gh auth login.", 503);
      // The checks and the base branch are the repository's own settings.
      const wanted = this.githubPolicy().repositories?.[input.repository];
      return repositorySetup(
        store,
        this.github,
        {
          ...input,
          checks: wanted?.requiredChecks,
          base: wanted?.baseBranch ?? undefined,
        },
        {
          writeRepository: (repository) => {
            this.configuration?.assertWritable();
            this.configuration?.updateExecutionRepository(repository);
          },
          // The repository's landing block holds the mode (§4.25).
          writeLanding: (repository, mode) => {
            const file = this.settingsFile(),
              current = file.readGitHubSettings(),
              github = structuredClone(current.github),
              entry = github.repositories?.[repository] ?? {};
            github.repositories = {
              ...github.repositories,
              [repository]: {
                ...entry,
                landing: { ...(entry.landing ?? {}), mode },
              },
            };
            file.updateGitHubSettings({ github, expectedHash: current.hash });
            this.configuration?.reload();
          },
        },
      );
    },
  },
  {
    name: "planning.publish",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return publishPlanningPullRequest(store, this.github, input);
    },
  },

  {
    name: "planning.reconcile",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler({}) {
      return this.reconcilePlanningPullRequests();
    },
  },
];
