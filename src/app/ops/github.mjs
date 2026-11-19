// Operations of one feature: name, class, MCP policy and handler.
import { repositoryGitHubRemote } from "../git/git.mjs";
import {
  branchReviewRule,
  ruleBranch,
  seenCheckNames,
} from "../github/github-branch-rules.mjs";
import {
  normalizeGitHubPolicy,
  policySection,
  readGitHubPolicyOrNull,
  requireDefaultBranches,
} from "../github/github-policy.mjs";
import { cancelSetup, githubSetup } from "../github/github-setup.mjs";
import {
  configureGitHubRepository,
  machineIdentity,
} from "../github/github-sync.mjs";
import {
  requireMirrorsPrivate,
  requirePlansBranches,
} from "../mirror/mirror-policy.mjs";
import { refuseSourceAsExecution } from "../mirror/mirror-sync.mjs";
import { fail } from "../store/store.mjs";
import { person, routed } from "../api/operation-policy.mjs";

export const entries = [
  // Settings view (§8): the GitHub policy in `.avoozl.json`. Creates no
  // GitHub object; the Set up GitHub wizard (task 3.18) does that. With a
  // GitHub client, a validate or save also reads each repository's default
  // branch, because GitHub closes issues only from merges into it (R16.5).
  {
    name: "github.settings.get",
    class: "observe",
    policy: routed,
    handler({}) {
      return this.githubSettings();
    },
  },
  // A repository's label names (Edit labels on the GitHub pages). Read
  // only.
  {
    name: "github.repository.labels",
    class: "observe",
    policy: routed,
    async handler({ input }) {
      const repository = input.repository;
      if (
        typeof repository !== "string" ||
        !/^[\w.-]+\/[\w.-]+$/.test(repository)
      )
        fail("Name one repository as owner/repository.");
      if (!this.github?.available?.())
        return { repository, labels: null, error: "GitHub is not signed in." };
      try {
        const labels = await this.github.listLabels(repository);
        return {
          repository,
          labels: labels
            .map((label) => label.name)
            .sort((a, b) => a.localeCompare(b)),
          error: null,
        };
      } catch (error) {
        return {
          repository,
          labels: null,
          error: `GitHub could not be read: ${error.message}`,
        };
      }
    },
  },
  // Read only: a repository's base-branch review rule and the check names
  // GitHub shows for it, for the Settings Reviews and Checks tabs.
  {
    name: "github.repository.inspect",
    class: "observe",
    policy: routed,
    async handler({ input }) {
      const repository = input.repository;
      if (
        typeof repository !== "string" ||
        !/^[\w.-]+\/[\w.-]+$/.test(repository)
      )
        fail("Name one repository as owner/repository.");
      const signedIn = this.github?.signedIn
        ? this.github.signedIn()
        : this.github?.available?.();
      if (!signedIn)
        return {
          repository,
          branch: null,
          reviewRule: null,
          checks: null,
          error:
            "GitHub is not signed in for Avoozl (no GH_TOKEN, and gh auth token gave none), so its rules and checks cannot be read.",
        };
      try {
        const branch = await ruleBranch(this.github, repository, {
          baseBranch: input.baseBranch || null,
        });
        // Each part stands alone: a review rule GitHub refuses to show must
        // not hide the check names, or the other way round.
        const [reviewRule, checks] = await Promise.allSettled([
          branchReviewRule(this.github, repository, branch),
          seenCheckNames(this.github, repository, branch),
        ]);
        const why = (part) =>
          part.status === "rejected"
            ? `GitHub could not be read: ${part.reason?.message || part.reason}`
            : null;
        return {
          repository,
          branch,
          reviewRule:
            reviewRule.status === "fulfilled" ? reviewRule.value : null,
          checks: checks.status === "fulfilled" ? checks.value : null,
          error: why(reviewRule) && why(checks) ? why(checks) : null,
          reviewError: why(reviewRule),
          checksError: why(checks),
        };
      } catch (error) {
        return {
          repository,
          branch: null,
          reviewRule: null,
          checks: null,
          error: `GitHub could not be read: ${error.message}`,
        };
      }
    },
  },

  {
    name: "github.settings.validate",
    class: "observe",
    policy: routed,
    async handler({ input }) {
      try {
        const policy = normalizeGitHubPolicy(policySection(input.github));
        if (this.github?.available?.())
          await requireDefaultBranches(policy, this.github);
        await requireMirrorsPrivate(policy, this.github);
        await requirePlansBranches(policy, this.github);
        return { valid: true, error: null, policy };
      } catch (error) {
        return { valid: false, error: error.message, policy: null };
      }
    },
  },
  // Set up GitHub wizard (§8.2): a preview, or with {confirm, previewHash}
  // the writes it previewed. `.avoozl.json` is saved by settings.update.
  {
    name: "github.setup",
    class: "protect",
    policy: person("Only a person applies GitHub setup.", (input) =>
      Boolean(input?.confirm),
    ),
    handler({ input }) {
      return githubSetup(
        {
          github: this.github,
          settings: this.settingsFile().readGitHubSettings(),
        },
        input,
      );
    },
  },
  // Stop a running Set up GitHub apply before its next write.
  {
    name: "github.setup.cancel",
    class: "protect",
    policy: person("Only a person cancels a GitHub setup."),
    handler({ input }) {
      return cancelSetup(input.previewHash);
    },
  },

  {
    name: "github.settings.update",
    class: "protect",
    policy: person(
      "Only a person changes GitHub settings, including Who counts.",
    ),
    async handler({ input }) {
      const policy = normalizeGitHubPolicy(policySection(input.github));
      if (this.github?.available?.())
        await requireDefaultBranches(policy, this.github);
      await requireMirrorsPrivate(policy, this.github);
      await requirePlansBranches(policy, this.github, { create: true });
      this.settingsFile().updateGitHubSettings(input);
      this.cachePolicy = null;
      this.configuration?.reload();
      return this.githubSettings();
    },
  },

  {
    name: "github.repository.detect",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return repositoryGitHubRemote(store, input);
    },
  },

  {
    name: "github.repository.connect",
    class: "protect",
    policy: person("Only a person connects a repository to GitHub."),
    async handler({ input }) {
      const store = this.store;

      this.configuration?.assertWritable();
      const detected = input.repository
          ? { repositoryId: input.repositoryId, repository: input.repository }
          : await repositoryGitHubRemote(store, input),
        configuration = {
          ...input,
          repository: detected.repository,
          repositoryId: detected.repositoryId,
        },
        execution = await configureGitHubRepository(
          store,
          this.github,
          configuration,
        );
      this.configuration?.updateGitHubIssueIntake(execution);
      return { repository: detected.repository, execution };
    },
  },

  {
    name: "github.configure",
    class: "protect",
    policy: person("Only a person changes GitHub setup."),
    async handler({ input }) {
      const store = this.store;

      this.configuration?.assertWritable();
      refuseSourceAsExecution(
        readGitHubPolicyOrNull(this.workspaceRoot)?.repositories,
        input.repository,
      );
      const configured = await configureGitHubRepository(
        store,
        this.github,
        input,
      );
      this.configuration?.updateGitHubIssueIntake(configured);
      return configured;
    },
  },

  {
    name: "github.repositories",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;
      return {
        available: this.github.available(),
        machine: machineIdentity(store),
        items: store.list("github_repositories"),
      };
    },
  },
];
