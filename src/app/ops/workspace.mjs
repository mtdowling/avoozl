// Operations of one feature: name, class, MCP policy and handler.
import { auditPlans } from "../../mcp.mjs";
import { chatModel, roleHarness } from "../chat-models.mjs";
import {
  CHECKS_UNCONFINED,
  checksUnconfinedAllowed,
  isolationSetting,
} from "../check-isolation.mjs";
import { driverStatus } from "../driver.mjs";
import { listExamples, seedExample } from "../examples.mjs";
import { detectCheckout, repositoryConfig, withWorkLock } from "../git.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { machineIdentity, prepareGitHubRepository } from "../github-sync.mjs";
import { requirePrivateRepository } from "../github.mjs";
import { HARNESS_UNCONFINED } from "../harness-definitions.mjs";
import { machineAvoozlPaths } from "../host-config.mjs";
import { instanceView, renameInstance } from "../instance.mjs";
import { loadLayeredConfig } from "../layered-config.mjs";
import {
  ensureGlobalLocalIgnore,
  globalLocalIgnoreStatus,
} from "../local-ignore.mjs";
import {
  requireMirrorsPrivate,
  requirePlansBranches,
} from "../mirror-policy.mjs";
import { importNewPlans, newPlanStarts } from "../new-plan.mjs";
import { queueNotifications } from "../notifications.mjs";
import { inspectFolder, scanSpecs } from "../onboarding.mjs";
import { archiveEnded } from "../plan-retire.mjs";
import { planReviewStep } from "../plan-review-step.mjs";
import { runnerTick, workerTick } from "../remote-runner.mjs";
import { cliCommand } from "../report-command.mjs";
import { listSessionBindings } from "../session-bindings.mjs";
import { enqueueSessionRequests } from "../session-requests.mjs";
import { createSpecPlan, lintSpec, saveSpecPlan } from "../spec-plans.mjs";
import { journalOf } from "../spec-scheduler.mjs";
import { fail } from "../store.mjs";
import { WORKSPACE_LOCK, tick, tickHealth, tickLog } from "../tick.mjs";
import { planPage, recentIntegrations } from "../views.mjs";
import { checkStaleGrants } from "../worker-release.mjs";
import {
  assertRepositoryRemovable,
  removeWorkspaceRepositoryRecords,
  workspaceRepositories,
} from "../workspace-repositories.mjs";
import {
  configureWorkspaceRepository,
  publishWorkspaceRepository,
  syncWorkspaceRepository,
  workspaceRepositoryStatus,
} from "../workspace-repository.mjs";
import { person, notOnMcp, routed } from "../operation-policy.mjs";

export const entries = [
  {
    name: "workspace.examples",
    class: "observe",
    policy: routed,
    handler({}) {
      return listExamples();
    },
  },

  {
    name: "workspace.seed",
    class: "protect",
    policy: routed,
    handler({ input, expectedRevision, context }) {
      const store = this.store;
      return seedExample(store, input, expectedRevision, {
        specRoot: () => this.exampleSpecRoot(),
        createDraft: (spec) => this.createSpecDraft({ spec }, context),
      });
    },
  },

  {
    name: "instance.view",
    class: "observe",
    policy: notOnMcp(
      "The app page shows and renames this install's display name; a chat has no use for it.",
    ),
    handler({}) {
      const store = this.store;
      return instanceView(store);
    },
  },

  {
    name: "instance.rename",
    class: "execute",
    policy: notOnMcp(
      "The app page shows and renames this install's display name; a chat has no use for it.",
    ),
    handler({ input }) {
      const store = this.store;

      renameInstance(store, input.name);
      return instanceView(store);
    },
  },

  {
    name: "workspace.tick",
    class: "execute",
    policy: routed,
    async handler({ input }) {
      const store = this.store;

      // A worker machine pulls and accepts before it runs what it was given.
      await workerTick(store, this.workspaceRoot, this.github);
      // A runner holds no plans, so its tick only runs handed tasks.
      const remote = await runnerTick(store, this.workspaceRoot, {
        roster: Array.isArray(input.sessions) ? input.sessions : null,
        bindings: listSessionBindings(store),
        command: `AVOOZL_WORKSPACE=${JSON.stringify(this.workspaceRoot)} ${cliCommand()}`,
      });
      if (remote) return remote;
      await this.refreshPrivateSpecs();
      await this.applyBaseTicks();
      if (input.cron === true) {
        const driving = Object.keys(store.getMeta("specDrivers") ?? {}),
          journalFor = async (planId) => {
            const journal = journalOf(
              store,
              { github: this.github, workspaceRoot: this.workspaceRoot },
              planId,
            );
            return journal && !journal.unreadable
              ? {
                  journal,
                  options: {
                    visibility: await journal.visibility(),
                    publicRepositories: journal.publicRepositories ?? [],
                    names: journal.names,
                  },
                }
              : null;
          };
        // Stale worker accepts reach Needs you; nothing releases them (R90.6).
        await checkStaleGrants(store, {
          workspaceRoot: this.workspaceRoot,
          driving,
          journalFor,
        }).catch(() => 0);
        // Worker machines get the driven specs' ready tasks, and their
        // grants are answered, when workers.offerTo names them (WP5).
        if (driving.length)
          await this.workerOffers(store, driving).catch((error) =>
            store.event(null, "worker.offers", { error: error.message }),
          );
        // What worker machines pushed is fetched, checked and landed here
        // (R90.2, worker-paths WP5.3); a result that fails is a failed attempt.
        if (driving.length)
          await this.workerResults(store, driving, journalFor).catch(
            () => null,
          );
      }
      const result = await tick(store, {
        workspaceRoot: this.workspaceRoot,
        memory: this.tickPolicy,
        sessions: input.sessions,
        cron: input.cron === true,
        folders: input.folders ?? null,
        github: this.github,
        plugins: this.plugins,
      });
      if (result.skipped) return result;
      if (Array.isArray(input.sessions) || input.cron === true)
        await this.approvalTick().catch(() => {});
      // A deleted plan's tasks whose chats have ended are archived now.
      archiveEnded(store);
      try {
        await withWorkLock(store, WORKSPACE_LOCK, async () => {
          // New plan folders that lint clean become draft plans (never approved).
          importNewPlans(store, {
            // A picked epic's folder comes back as its own draft revision.
            saveEpic: (epic) => {
              const folder = this.readSpec(epic),
                stored = store.get("plans", epic);
              if (!folder.exists) return;
              if (!stored) createSpecPlan(store, { id: epic }, folder);
              else if (stored.hash !== folder.hash)
                saveSpecPlan(
                  store,
                  { id: epic, expectedHash: stored.hash },
                  folder,
                );
            },
            readSpec: (spec) => this.readSpec(spec),
            lint: (spec) =>
              this.withContentDiagnostics(
                lintSpec({
                  spec,
                  plan: { id: spec.name },
                  data: {
                    ...this.read(),
                    repositories: store.list("repositories"),
                  },
                }),
                spec,
              ),
          });
          if (
            this.workspaceRoot &&
            (input.cron === true || Array.isArray(input.sessions))
          ) {
            const config = loadLayeredConfig({
                workspaceRoot: this.workspaceRoot,
              }).config,
              // New plan's planner chat, opened here so it is bound and its
              // served model read; on the planner's saved model.
              planners = result.held
                ? []
                : newPlanStarts(store, {
                    model: chatModel(config, "planner"),
                    harness: roleHarness(config, "planner"),
                  }),
              review = await planReviewStep(store, {
                workspaceRoot: this.workspaceRoot,
                config,
                readSpec: (spec) => this.readSpec(spec),
                otherSpecs: () => this.specList().items,
                open: !result.held,
                prepare: this.planReviewOptions.prepare,
                remove: this.planReviewOptions.remove,
              }),
              opened = enqueueSessionRequests(
                store,
                { starts: planners },
                { source: "new-plan" },
              ),
              queued = enqueueSessionRequests(
                store,
                { starts: review.requests, sends: review.messages },
                { source: "plan-review" },
              );
            for (const request of [...opened.starts, ...queued.starts]) {
              const index = result.dispatch.findIndex(
                (entry) => entry.id === request.id,
              );
              if (index < 0) result.dispatch.push(request);
              else result.dispatch[index] = request;
            }
            result.messages.push(...queued.sends);
            result.notify.push(...review.notify);
            queueNotifications(store, review.notify);
          }
        });
      } catch (error) {
        if (!error.contention) throw error;
        // Another tick owns the post-import work; its next pass will finish it.
      }
      return result;
    },
  },

  {
    name: "workspace.tick.health",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;
      return tickHealth(store);
    },
  },

  {
    name: "workspace.tick.log",
    class: "observe",
    policy: routed,
    handler({ input }) {
      const store = this.store;
      return tickLog(store, input);
    },
  },

  {
    name: "workspace",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;

      const plans = planPage(store);
      return {
        mode: store.getMeta("mode"),
        import: store.getMeta("import"),
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
          issues: store.list("github_issues").slice(0, 100),
          lastSync: store.getMeta("githubSync"),
        },
        workspaceRepository: workspaceRepositoryStatus(store),
        // Which machine drives each spec (§6.10), from SQLite only.
        driver: driverStatus(store),
        audit: auditPlans(this.read()),
        lastEvent: store.db
          .prepare("SELECT COALESCE(MAX(seq),0) seq FROM events")
          .get().seq,
      };
    },
  },

  {
    name: "configuration.get",
    class: "observe",
    policy: routed,
    handler({ input }) {
      return this.settingsFile().readConfiguration(input.scope ?? "repository");
    },
  },

  {
    name: "configuration.update",
    class: "protect",
    policy: person("Only a person changes workspace settings."),
    async handler({ input }) {
      if (!this.configuration)
        fail("Configuration editing is unavailable from this server.", 404);
      // The raw file is held to the same private-mirror rule as the form.
      let raw = null;
      try {
        raw = normalizeGitHubPolicy(JSON.parse(input.text).github);
      } catch {
        // An unparsable or invalid file is refused by the update itself.
      }
      await requireMirrorsPrivate(raw, this.github);
      await requirePlansBranches(raw, this.github, { create: true });
      return this.configuration.updateConfiguration(input);
    },
  },

  {
    name: "local.ignore.status",
    class: "observe",
    policy: routed,
    handler({}) {
      return globalLocalIgnoreStatus();
    },
  },

  {
    name: "local.ignore.fix",
    class: "protect",
    policy: routed,
    handler({}) {
      return ensureGlobalLocalIgnore();
    },
  },

  {
    name: "repositories.list",
    class: "observe",
    policy: routed,
    handler({}) {
      const store = this.store;
      return { items: workspaceRepositories(store) };
    },
  },
  // Read only: what the Add repository form would register for a folder.
  {
    name: "repositories.detect",
    class: "observe",
    policy: routed,
    handler({ input }) {
      return detectCheckout(input.folder);
    },
  },
  // Onboard flow reads (onboarding.mjs): the folder as a whole, and the
  // leak scan of the specs a public repository's issues would show.
  {
    name: "onboarding.inspect",
    class: "observe",
    policy: notOnMcp("App page rendering only."),
    handler({ input }) {
      const store = this.store;
      return inspectFolder({
        store,
        github: this.github,
        folder: input.folder,
      });
    },
  },

  {
    name: "onboarding.scan",
    class: "observe",
    policy: notOnMcp("App page rendering only."),
    handler({ input }) {
      const store = this.store;
      return scanSpecs(store, (spec) => this.readSpec(spec), input.specs);
    },
  },

  {
    name: "repositories.configure",
    class: "protect",
    policy: person("Only a person adds or changes a repository."),
    async handler({ input }) {
      const store = this.store;

      this.configuration?.assertWritable();
      const id = String(input.id || "").trim();
      if (!/^[a-z][a-z0-9-]{1,60}$/.test(id))
        fail("Choose a stable repository ID.");
      const repositories = workspaceRepositories(store),
        existing = repositories.find((entry) => entry.id === id) || null,
        localCheckout = String(input.localCheckout || "").trim(),
        githubRepository = String(input.github || "").trim(),
        authorizeIssues = input.issueAuthorization === true;
      if (authorizeIssues && !githubRepository)
        fail("Choose a GitHub repository for remote capabilities.");
      if (input.planning === true && !localCheckout)
        fail("Planning documents require a local checkout.");
      if (authorizeIssues && !localCheckout)
        fail("Label-authorized work requires a local checkout.");
      let repository = null;
      if (localCheckout) {
        repository = await repositoryConfig({
          id,
          root: localCheckout,
          baseBranch: String(input.baseBranch || "main").trim() || "main",
          worktreeRoot: input.worktreeRoot || undefined,
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
                repositoryId: repository.id,
                registering: repository,
                assignee: input.assignee,
                provider: input.provider,
                model: input.model,
                autoStart: input.autoStart,
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
    policy: person("Only a person removes a repository."),
    async handler({ input }) {
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
    policy: person("Only a person sets the workspace repository."),
    async handler({ input }) {
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
    policy: routed,
    handler({}) {
      const store = this.store;
      return workspaceRepositoryStatus(store);
    },
  },

  {
    name: "workspace.repository.publish",
    class: "protect",
    policy: person("Only a person publishes the workspace repository."),
    async handler({ input }) {
      const store = this.store;

      const config = store.getMeta("workspaceRepository");
      if (config?.repository)
        await requirePrivateRepository(this.github, config.repository);
      return publishWorkspaceRepository(store, input);
    },
  },

  {
    name: "workspace.repository.sync",
    class: "protect",
    policy: person("Only a person syncs the workspace repository."),
    async handler({}) {
      const store = this.store;

      const config = store.getMeta("workspaceRepository");
      if (config?.repository)
        await requirePrivateRepository(this.github, config.repository);
      return syncWorkspaceRepository(store);
    },
  },

  {
    name: "repository.configure",
    class: "protect",
    policy: person("Only a person adds or changes a repository."),
    async handler({ input }) {
      const store = this.store;

      // Unconfined checks need this machine's opt-in.
      const allowIsolation = (isolation) => {
        if (
          isolation?.run === "unconfined" &&
          !checksUnconfinedAllowed(machineAvoozlPaths().configDirectory)
        )
          fail(
            `Unconfined checks need this machine's opt-in: "${CHECKS_UNCONFINED}": true in ${HARNESS_UNCONFINED}.`,
            409,
          );
        return isolation;
      };
      // {id, isolation} alone changes only how a registered repository's
      // checks run (Settings > Repository setup > Landing).
      const keys = Object.keys(input).filter((key) => input[key] !== undefined);
      if (
        keys.includes("isolation") &&
        keys.every((key) => ["id", "isolation"].includes(key))
      ) {
        const existing = store.get("repositories", String(input.id || ""));
        if (!existing) fail("Repository not found.", 404);
        const isolation = allowIsolation(
          isolationSetting(input.isolation, "isolation"),
        );
        this.configuration?.assertWritable();
        const configured = store.put("repositories", {
          ...existing,
          isolation,
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
    policy: person("Only a person removes a repository."),
    handler({ input }) {
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
