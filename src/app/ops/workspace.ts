// Operations of one feature: name, class, MCP policy and handler.
import os from "node:os";
import { auditPlans } from "../../mcp.ts";
import {
  CHECKS_UNCONFINED,
  checksUnconfinedAllowed,
  isolationSetting,
} from "../workspace/check-isolation.ts";
import {
  detectCheckout,
  type Repository,
  repositoryConfig,
} from "../git/git.ts";
import type { SetupInput } from "../github/github-sync.ts";
import { expandHome } from "../workspace/folder-browse.ts";
import {
  machineIdentity,
  prepareGitHubRepository,
} from "../github/github-sync.ts";
import { requirePrivateRepository } from "../github/github.ts";
import { HARNESS_UNCONFINED } from "../executors/harness-definitions.ts";
import { machineAvoozlPaths } from "../settings/host-config.ts";
import { claimsOf, labelsOf } from "../settings/repository-settings.ts";
import { startTelemetry } from "../telemetry/index.ts";
import { startPluginUpdateChecks } from "../plugins/plugin-updates.ts";
import {
  ensureGlobalLocalIgnore,
  globalLocalIgnoreStatus,
} from "../workspace/local-ignore.ts";
import { loadLayeredConfig } from "../settings/layered-config.ts";
import { chatBrief } from "../workers/epic-context.ts";
import { fail } from "../store/store.ts";
import { recordReleased, tick, tickHealth, tickLog } from "../tick/tick.ts";
import { planPage, recentIntegrations } from "../api/views.ts";
import {
  assertRepositoryRemovable,
  removeWorkspaceRepositoryRecords,
  workspaceRepositories,
} from "../workspace/workspace-repositories.ts";
import {
  configureWorkspaceRepository,
  publishWorkspaceRepository,
  syncWorkspaceRepository,
  workspaceRepositoryStatus,
} from "../workspace/workspace-repository.ts";
import { person, notOnMcp, routed } from "../api/operation-policy.ts";
import type { OperationCall, Operations } from "../api/operations.ts";

export const entries = [
  // Rebuild the database from git and GitHub (design §4.42).
  {
    name: "workspace.rebuild",
    class: "protect",
    github: "check-in",
    policy: person("Only a person rebuilds the workspace, from the CLI."),
    handler(this: Operations, { context }: OperationCall) {
      if (context.caller || context.mcp)
        fail("Only a person rebuilds the workspace, from the CLI.", 403);
      return this.rebuild();
    },
  },

  {
    name: "workspace.tick",
    class: "execute",
    github: "check-in",
    policy: routed,
    async handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      // The exporter runs in the process that runs the tick (§D6).
      if (this.configDirectory)
        startTelemetry({
          store,
          configDirectory: this.configDirectory,
          stateDirectory: machineAvoozlPaths().stateDirectory,
        });

      // The daily plugin update check runs on its own timer (R34.17).
      startPluginUpdateChecks(store, this.pluginOptions, {
        countGit: this.countPluginGit(),
      });
      await this.applyBaseTicks();
      // An approver's spec commit that reached main approves it (§4.42).
      await this.applyMainApprovals();
      // An approval adopted or made here publishes its spec issue (rule 8.1).
      const publishErrors = await this.publishApproved();
      const result = await tick(store, {
        workspaceRoot: this.workspaceRoot,
        memory: this.tickPolicy,
        sessions: input.sessions,
        cron: input.cron === true,
        folders: input.folders ?? null,
        github: this.github,
        plugins: this.plugins,
        contextBrief: (entry: Parameters<typeof chatBrief>[2]) =>
          chatBrief(store, this, entry),
      });
      if (result.skipped) return result;
      // A cron or roster pass reads the layered config, so a bad file
      // refuses the pass naming its key (layered-config.mjs).
      if (
        this.workspaceRoot &&
        (input.cron === true || Array.isArray(input.sessions))
      )
        loadLayeredConfig({ workspaceRoot: this.workspaceRoot });
      if (input.cron === true) recordReleased(store, result);
      for (const failed of publishErrors)
        result.notify?.push({
          channel: "failure",
          title: `Avoozl could not publish a spec issue in ${failed.repository}`,
          text: failed.error,
        });
      return result;
    },
  },

  {
    name: "workspace.tick.health",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      const store = this.store;
      return tickHealth(store);
    },
  },

  {
    name: "workspace.tick.log",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;
      return tickLog(store, input);
    },
  },

  {
    name: "workspace",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      const store = this.store;

      const plans = planPage(store);
      return {
        mode: store.getMeta("mode"),
        revision: this.read().revision,
        publication: {
          pending: store.db
            .prepare(
              "SELECT id,path,state FROM outbox WHERE state<>'published' LIMIT 100",
            )
            .all(),
          last: store.getMeta("publication") || [],
        },
        plans: plans.items,
        planTotal: plans.total,
        batches: store.list("batches").slice(0, 40),
        integrations: store
          .list("integration")
          .filter((i) => i.state === "ready")
          .slice(0, 40),
        recentIntegrations: recentIntegrations(store),
        configuration: this.configuration?.metadata() || null,
        repositories: store.list("repositories"),
        github: {
          available: this.github.available(),
          machine: machineIdentity(store),
          repositories: store.list("github_repositories"),
        },
        workspaceRepository: workspaceRepositoryStatus(store),
        // Which machine drives each spec (§6.10), from SQLite only.
        audit: auditPlans(this.read()),
        lastEvent: Number(
          store.db.prepare("SELECT COALESCE(MAX(seq),0) seq FROM events").get()
            ?.seq,
        ),
      };
    },
  },

  {
    name: "configuration.get",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      return this.settingsFile().readConfiguration(input.scope ?? "repository");
    },
  },

  {
    name: "configuration.update",
    class: "protect",
    github: "check-in",
    policy: person("Only a person changes workspace settings."),
    async handler(this: Operations, { input }: OperationCall) {
      if (!this.configuration)
        fail("Configuration editing is unavailable from this server.", 404);
      return this.configuration.updateConfiguration(input);
    },
  },

  {
    name: "local.ignore.status",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      return globalLocalIgnoreStatus();
    },
  },

  {
    name: "local.ignore.fix",
    class: "protect",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      return ensureGlobalLocalIgnore();
    },
  },

  {
    name: "repositories.list",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      const store = this.store;
      return { items: workspaceRepositories(store) };
    },
  },
  // Read only: what Add repository would register for a folder: its root,
  // remote, GitHub repository and branch.
  {
    name: "repositories.detect",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, { input }: OperationCall) {
      return detectCheckout(input.folder);
    },
  },
  {
    name: "repositories.configure",
    class: "protect",
    github: "check-in",
    policy: person("Only a person adds or changes a repository."),
    async handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      this.configuration?.assertWritable();
      const id = String(input.id || "").trim();
      if (!/^[a-z][a-z0-9-]{1,60}$/.test(id))
        fail("Choose a stable repository ID.");
      const repositories = workspaceRepositories(store),
        existing = repositories.find((entry) => entry.id === id) || null,
        localCheckout = expandHome(input.localCheckout, os.homedir()),
        githubRepository = String(input.github || "").trim(),
        authorizeIssues = input.issueAuthorization === true;
      if (authorizeIssues && !githubRepository)
        fail("Choose a GitHub repository for remote capabilities.");
      if (input.planning === true && !localCheckout)
        fail("Planning documents require a local checkout.");
      if (authorizeIssues && !localCheckout)
        fail("Label-authorized work requires a local checkout.");
      let repository:
        | (Repository & {
            name?: string;
            planning?: boolean;
            editable?: boolean;
          })
        | null = null;
      if (localCheckout) {
        repository = await repositoryConfig({
          id,
          root: localCheckout,
          baseBranch: String(input.baseBranch || "main").trim() || "main",
          worktreeRoot:
            typeof input.worktreeRoot === "string"
              ? input.worktreeRoot || undefined
              : undefined,
          checks: input.checks ?? [],
        });
        repository = {
          ...repository,
          ...(String(input.name || "").trim()
            ? { name: String(input.name).trim() }
            : {}),
          planning: input.planning === true,
          editable: input.editable !== false,
        };
      }
      if (
        existing?.localCheckout &&
        (!repository || existing.localCheckout !== repository.root)
      )
        assertRepositoryRemovable(store, existing);
      const binding = this.repositoryBindingGuard?.({
        repositoryId: id,
        root: repository?.root || null,
        editable: Boolean(repository?.editable),
      });
      try {
        const issueIntake =
          githubRepository && authorizeIssues
            ? await prepareGitHubRepository(store, this.github, {
                repository: githubRepository,
                workspaceRepositoryId: id,
                // authorizeIssues needs a local checkout (refused above).
                repositoryId: repository?.id ?? id,
                registering: repository,
                // The request's fields; prepareGitHubRepository checks them.
                assignee: input.assignee as SetupInput["assignee"],
                provider: input.provider as SetupInput["provider"],
                model: input.model as SetupInput["model"],
                autoStart: input.autoStart as SetupInput["autoStart"],
              })
            : null;
        this.configuration?.updateUnifiedRepository({
          id,
          previousRepository: existing?.github,
          repository,
          issueIntake,
        });
        store.transaction(() => {
          if (existing?.github && existing.github !== githubRepository) {
            store.db
              .prepare("DELETE FROM github_repositories WHERE id=?")
              .run(existing.github);
          }
          if (repository) store.put("repositories", repository);
          else store.db.prepare("DELETE FROM repositories WHERE id=?").run(id);
          if (issueIntake) store.put("github_repositories", issueIntake);
          else if (existing?.github)
            store.db
              .prepare("DELETE FROM github_repositories WHERE id=?")
              .run(existing.github);
          store.event(null, "workspace.repository.configured", {
            repositoryId: id,
            github: githubRepository || null,
            planning: Boolean(repository?.planning),
            editable: Boolean(repository?.editable),
            issueAuthorization: authorizeIssues,
          });
        });
        await binding?.commit?.();
        this.configuration?.reload();
        return workspaceRepositories(store).find((entry) => entry.id === id);
      } finally {
        binding?.release?.();
      }
    },
  },

  {
    name: "repositories.remove",
    class: "protect",
    github: "check-in",
    policy: person("Only a person removes a repository."),
    async handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      this.configuration?.assertWritable();
      const id = String(input.id || "").trim(),
        repository = workspaceRepositories(store).find(
          (entry) => entry.id === id,
        );
      if (!repository) fail("Repository not found.", 404);
      assertRepositoryRemovable(store, repository);
      const binding = this.repositoryBindingGuard?.({
        repositoryId: id,
        root: null,
        editable: false,
      });
      try {
        this.configuration?.removeUnifiedRepository(repository);
        const removed = removeWorkspaceRepositoryRecords(store, repository);
        await binding?.commit?.();
        this.configuration?.reload();
        return removed;
      } finally {
        binding?.release?.();
      }
    },
  },

  {
    name: "workspace.repository.configure",
    class: "protect",
    github: "check-in",
    policy: person("Only a person sets the workspace repository."),
    async handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      this.configuration?.assertWritable();
      const configured = await configureWorkspaceRepository(
        store,
        input,
        this.github,
      );
      this.configuration?.updatePlanningRepository(configured);
      return configured;
    },
  },

  {
    name: "workspace.repository.status",
    class: "observe",
    github: "check-in",
    policy: routed,
    handler(this: Operations, {}: OperationCall) {
      const store = this.store;
      return workspaceRepositoryStatus(store);
    },
  },

  {
    name: "workspace.repository.publish",
    class: "protect",
    github: "workspace-publish",
    policy: person("Only a person publishes the workspace repository."),
    async handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      const config = store.getMeta<{ repository?: string }>(
        "workspaceRepository",
      );
      if (config?.repository)
        await requirePrivateRepository(this.github, config.repository);
      return publishWorkspaceRepository(store, input);
    },
  },

  {
    name: "workspace.repository.sync",
    class: "protect",
    github: "workspace-publish",
    policy: person("Only a person syncs the workspace repository."),
    async handler(this: Operations, {}: OperationCall) {
      const store = this.store;

      const config = store.getMeta<{ repository?: string }>(
        "workspaceRepository",
      );
      if (config?.repository)
        await requirePrivateRepository(this.github, config.repository);
      return syncWorkspaceRepository(store);
    },
  },

  {
    name: "repository.configure",
    class: "protect",
    github: "check-in",
    policy: person("Only a person adds or changes a repository."),
    async handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      // Unconfined checks need this machine's opt-in.
      const allowIsolation = <I>(isolation: I) => {
        const run =
          isolation && typeof isolation === "object" && "run" in isolation
            ? isolation.run
            : undefined;
        if (
          run === "unconfined" &&
          !checksUnconfinedAllowed(machineAvoozlPaths().configDirectory)
        )
          fail(
            `Unconfined checks need this machine's opt-in: "${CHECKS_UNCONFINED}": true in ${HARNESS_UNCONFINED}.`,
            409,
          );
        return isolation;
      };
      // {id} with isolation, labels or claims changes only those keys of a
      // registered repository (Settings > Repository setup): how its checks
      // run, its spec issue label filters, its claim stale hours. Null
      // clears labels or claims.
      const keys = Object.keys(input).filter((key) => input[key] !== undefined);
      if (
        keys.length > 1 &&
        keys.every((key) =>
          ["id", "isolation", "labels", "claims"].includes(key),
        )
      ) {
        const id = String(input.id || ""),
          existing = store.get<Repository>("repositories", id);
        if (!existing) return fail("Repository not found.", 404);
        const change: Record<string, unknown> = {};
        if (keys.includes("isolation"))
          change.isolation = allowIsolation(
            isolationSetting(input.isolation, "isolation"),
          );
        if (keys.includes("labels"))
          change.labels = input.labels && labelsOf(input.labels, id);
        if (keys.includes("claims"))
          change.claims = input.claims && claimsOf(input.claims, id);
        this.configuration?.assertWritable();
        const configured = store.put("repositories", {
          ...existing,
          ...change,
        });
        this.configuration?.updateExecutionRepository(configured);
        return configured;
      }
      const repository = await repositoryConfig(input);
      allowIsolation(repository.isolation);
      this.configuration?.assertWritable();
      const configured = store.put("repositories", repository);
      this.configuration?.updateExecutionRepository(configured);
      return configured;
    },
  },

  {
    name: "repository.remove",
    class: "protect",
    github: "check-in",
    policy: person("Only a person removes a repository."),
    handler(this: Operations, { input }: OperationCall) {
      const store = this.store;

      const id = String(input.id || "").trim(),
        repository = id ? store.get("repositories", id) : null;
      if (!repository) fail("Repository not found.", 404);
      const locked = store.db
        .prepare("SELECT id FROM work_locks WHERE repository_id=? LIMIT 1")
        .get(id);
      if (locked)
        fail(
          `Repository ${id} is currently locked by active work. Wait for it to finish before removing the repository.`,
          409,
        );
      const authorization = store
        .list("github_repositories")
        .find((entry) => entry.repositoryId === id);
      if (authorization)
        fail(
          `Repository ${id} is still connected to GitHub. Remove or reassign its label-authorized repositories first.`,
          409,
        );
      this.configuration?.assertWritable();
      this.configuration?.removeExecutionRepository(id);
      store.remove("repositories", id);
      this.configuration?.reload();
      store.event(null, "repository.removed", { repositoryId: id });
      return { ...repository, removed: true };
    },
  },
];
