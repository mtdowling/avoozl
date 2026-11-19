import { frontMatter } from "../../front-matter.mjs";
import { digest } from "../../model.mjs";
import { resolveTaskId } from "../../task-identity.mjs";
import { taskAuthority, taskRepository } from "../../work-model.mjs";
import { recordActivity, recordOperation } from "../store/activity-log.mjs";
import { statusComplete } from "../../query.mjs";
import {
  bindContentRules,
  check as checkContent,
  enforceDiff,
  enforceSpec,
  revision as gitRevision,
  guardGitHub,
  loadRulePlugins,
  pushedCommits,
  rulePluginsStale,
  specContentDiagnostics,
} from "../content/content-rules.mjs";
import {
  declaredDependencies,
  specDeclarations,
} from "../specs/cross-spec-dependencies.mjs";
import { reviewRoles as deliveryReviewRoles } from "../delivery/delivery.mjs";
import {
  createExtraction,
  getExtraction,
  proposalsFromFacts,
} from "../specs/design-extraction.mjs";
import { bindDriver } from "../workers/driver.mjs";
import { taskEpic } from "../epics/epics.mjs";
import { putSpan, readFlowPolicy } from "../flow/flow.mjs";
import {
  formatGapTable,
  gapProposals,
  parseGapReport,
} from "../specs/gap-report.mjs";
import { originRepositorySync, withWorkLock } from "../git/git.mjs";
import { clampLimits, runView } from "../github/github-pacer.mjs";
import {
  MODE_CHOICES,
  PERMISSIONS,
  readGitHubPolicy,
  readGitHubPolicyOrNull,
} from "../github/github-policy.mjs";
import { asActor, currentActor } from "../github/github-posted.mjs";
import {
  countFilePath,
  rateView,
  sourceOfOperation,
  withSource,
} from "../github/github-rate.mjs";
import {
  DEFAULT_CACHE_SECONDS,
  GitHubClient,
  defaultGitHubClient,
  parseRepository,
  requirePrivateRepository,
} from "../github/github.mjs";
import { pollSources, sourceMap } from "../intake/intake.mjs";
import { parseIssueReference } from "../tasks/issue-reference.mjs";
import { loadLayeredConfig } from "../settings/layered-config.mjs";
import { mcpRefusal } from "../mcp/mcp-policy.mjs";
import { queueNotifications } from "../tick/notifications.mjs";
import {
  DIRECT_TASK_EDITS,
  refuseGitHubAuthority,
  retitledInput,
  reviewSettings,
  taskCodeChanges,
} from "./operation-support.mjs";
import { OPERATIONS, classifyOperation } from "./operation-table.mjs";
import { flushOutbox } from "../store/outbox.mjs";
import { lintPlan } from "../specs/plan-quality.mjs";
import { recordPlanReviewWriter } from "../reviews/plan-review-authorship.mjs";
import { planReviewSummary } from "../reviews/plan-review-summary.mjs";
import { approvePlan, createPlan } from "../specs/plans.mjs";
import { SUPPORTED_CONTRACTS } from "../plugins/plugin-contract.mjs";
import { pluginHealth } from "../plugins/plugin-session.mjs";
import {
  addGitPlugin,
  addPlugin,
  approvePlugin,
  approvedTemplates,
  disablePlugin,
  importPluginPack,
  inspectPlugins,
  pickTemplate,
  pluginHost,
  pluginSettingsPath,
  previewPlugin,
  previewPluginPack,
  removePlugin,
  repositoryPacks,
  updateGitPlugin,
} from "../plugins/plugins.mjs";
import { mergePath } from "../landing/merge-path.mjs";
import { RepoFiles } from "../git/repo-files.mjs";
import { RepositorySettings } from "../settings/repository-settings.mjs";
import { bindRetroMemory } from "../flow/retro-memory.mjs";
import {
  approvalChangedAtMerge,
  mayLinkSpecIssue,
  openApproval,
  reconcileApproval,
  reconcileOpenApprovals,
} from "../specs/spec-approval.mjs";
import {
  approvalBase,
  approvalCommits,
  approverCheck,
  commitApproval,
  gitAuthor,
  gitTop,
} from "../git/git-approvals.mjs";
import { landingsFromGit } from "../landing/landing-trailers.mjs";
import {
  readRetroFiles,
  retroText,
  writeRetroFiles,
} from "../flow/retro-files.mjs";
import {
  locateLocalSpec,
  mergeHomes,
  mirrorOf,
  privateDependencies,
  readPrivateSpecs,
} from "../specs/spec-homes.mjs";
import {
  createSpecPlan,
  epicMembers,
  findSpecFolder,
  lintSpec,
  listSpecFolders,
  readCritique,
  readSpecFolder,
  saveSpecPlan,
  specFacts,
  specItems,
  specModifiedAt,
  specName,
  specRoots,
  specTitle,
} from "../specs/spec-plans.mjs";
import {
  mergeApprovedPulls,
  pullFor,
  pullSpecs,
  recordPullApproval,
  syncSpecPulls,
} from "../specs/spec-pull-requests.mjs";
import { driverIdOf } from "../specs/spec-scheduler.mjs";
import { specAuthority } from "../specs/spec-takeover.mjs";
import { sameFolder } from "../workspace/onboarding.mjs";
import {
  applyTicks,
  baseHead,
  baseTasks,
  tickCommits,
} from "../specs/spec-ticks.mjs";
import { canonical, fail } from "../store/store.mjs";
import {
  checkInputs,
  fill,
  templateSeed,
  templateSummary,
} from "../specs/templates.mjs";
import { WORKSPACE_LOCK, readDeliveryPolicy } from "../tick/tick.mjs";
import { readCache } from "../github/github-open-read.mjs";
import {
  offerLogins,
  workerOffersStep,
} from "../workers/worker-offer-step.mjs";
import { workerResultsStep } from "../workers/worker-result-step.mjs";
import { syncWorkspaceRepository } from "../workspace/workspace-repository.mjs";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Who an operation's GitHub posts are for (github-posted.mjs), or null when
// the context does not say and an enclosing operation's actor holds. An
// agent, a plugin and the tick are marked; so is a caller nobody named. A
// review draft is the person's: it is a pending review under their login
// that GitHub publishes only when they submit it.
const AUTOMATION = new Set(["workspace.tick"]);
export function postingActor(name, context) {
  if (context.caller || context.mcp || context.plugin) return "agent";
  if (AUTOMATION.has(name)) return "avoozl";
  return context.person === true ? "person" : null;
}

export class Operations {
  constructor(
    store,
    {
      operator,
      github,
      configuration = null,
      workspaceRoot = configuration?.workspaceRoot || null,
      plansRoot = null,
      repositoryBindingGuard = null,
      notifier = null,
      // Stops one Kiro Crew session by slot (session-observer.mjs
      // gatewaySessionStopper); only the app backend has one.
      sessionStopper = null,
      // True on the standalone page: no Kiro Crew runs beside this server.
      kirocrewAbsent = false,
      // {now} for the code review chat (pr-review.mjs); tests fix the clock.
      reviewOptions = {},
      // Tests can delay isolated review-view preparation without opening chats.
      planReviewOptions = {},
      pluginSettingsFile = pluginSettingsPath(),
      // The spec driver lock (§6.10): {settingsFile, now?, sleep?}. The
      // CLI, app backend and app MCP server pass this machine's settings
      // file; without one the old one-writer rule (task 3.8) holds alone.
      driver = null,
      plugins = workspaceRoot
        ? pluginHost({ workspaceRoot, settingsFile: pluginSettingsFile })
        : null,
      // This machine's Avoozl settings folder for prompt overrides (design
      // §4.18). Unset (most tests) leaves retros as before Phase 28; the
      // app, MCP server and CLI pass it.
      configDirectory = null,
      // Tests replace the shipped prompts to model an Avoozl update.
      shippedPrompts = null,
      // The app backend's reads that go to GitHub answer from the last
      // read and refresh after replying, so no page request waits on the
      // network. The CLI and MCP keep
      // reading first.
      backgroundReads = false,
    } = {},
  ) {
    this.store = store;
    this.backgroundReads = backgroundReads;
    this.refreshing = new Map();
    // The plugin loader (plugins.mjs). It opens one plugin session per
    // tick, and runs nothing unless a plugin is declared and approved.
    this.plugins = plugins;
    this.pluginOptions = { workspaceRoot, settingsFile: pluginSettingsFile };
    // Pushes one notification to Kiro Crew (notifications.mjs gatewayPusher);
    // only the app backend has one.
    this.notifier = notifier;
    this.sessionStopper = sessionStopper;
    this.kirocrewAbsent = kirocrewAbsent;
    this.reviewOptions = reviewOptions;
    // Provenance for records this workspace mints; never an authorization.
    this.operator = operator || "";
    // Every GitHub text write passes content rules first (§4.9).
    const client = github || defaultGitHubClient();
    // Conditional reads and the rate-limit pause live in this workspace.
    if (client instanceof GitHubClient)
      client.bind(store, {
        cacheSeconds: () => this.cacheSeconds(),
        countFile: countFilePath(),
        writeLimits: () => this.writeLimits(),
      });
    this.github = guardGitHub(client, store);
    this.configuration = configuration;
    this.workspaceRoot = workspaceRoot;
    // Given a plans root, every operation publishes its pending Markdown
    // projections before it returns, so no caller writes the outbox itself.
    this.plansRoot = plansRoot;
    this.tickPolicy = {};
    this.planReviewOptions = planReviewOptions;
    this.configDirectory = configDirectory;
    // Specs read from the plans branch on the last tick (RC25.2).
    this.privateSpecs = [];
    this.privateSpecsAt = 0;
    this.privateSpecsHead = null;
    this.repositoryBindingGuard = repositoryBindingGuard;
    this.pendingIntents = new Map();
    if (workspaceRoot && driver?.settingsFile)
      bindDriver(store, { ...driver, workspaceRoot, pluginSettingsFile });
    // Content rules (§4.9) read this workspace's `.avoozl.json` and terms.
    if (workspaceRoot)
      bindContentRules(store, {
        workspaceRoot,
        pluginSettingsFile,
      });
    if (workspaceRoot && configDirectory)
      bindRetroMemory(store, {
        configDirectory,
        workspaceRoot,
        shipped: shippedPrompts,
        loadPluginFolders: () =>
          inspectPlugins(this.pluginOptions)
            .filter(
              (p) =>
                p.location && p.state !== "invalid" && p.state !== "missing",
            )
            .map((p) => ({
              id: p.id,
              location: p.location,
              provides: p.provides || [],
              state: p.state,
            })),
      });
  }
  read() {
    return this.store.read();
  }
  // Check now for plugin sources: one poll each, under the tick's lock.
  async pollNow() {
    const sources = sourceMap(this.pluginOptions, this.store);
    if (![...sources.values()].some((source) => source.plugin)) return;
    await withWorkLock(this.store, WORKSPACE_LOCK, async () => {
      const session = this.plugins.open();
      try {
        const polled = await pollSources(
          this.store,
          session,
          sources,
          readGitHubPolicyOrNull(this.workspaceRoot),
        );
        queueNotifications(this.store, polled.notify);
      } finally {
        await session.close();
      }
    });
  }
  // What the provider operations need: the clock and each session's review
  // roles, so a switch never breaks review distinctness (R72.9).
  providerOptions() {
    const policy = readDeliveryPolicy(this.workspaceRoot).delivery,
      tasks = new Map(this.read().tasks.map((t) => [t.id, t]));
    return {
      tasks,
      reviewRoles: (binding) =>
        policy
          ? deliveryReviewRoles(
              policy,
              taskRepository(tasks.get(binding.taskId)),
            )
          : [],
    };
  }
  // Settings' plugin list and actions (§4.8, R34.9). Approval is a person's
  // act in Settings or the CLI: an agent session cannot approve a plugin,
  // and no MCP tool offers it.
  async pluginOperation(name, input, context) {
    const options = {
      ...this.pluginOptions,
      screenPack: (pack) => this.screenPack(pack),
    };
    if (!options.workspaceRoot) fail("Plugins need a workspace root.", 409);
    if (name === "plugins.list") {
      const health = pluginHealth(this.store),
        packs = repositoryPacks(options.workspaceRoot),
        plugins = inspectPlugins(options).map(({ manifest, entry, ...p }) => ({
          ...p,
          // Templates by name only; template.list reads the rest.
          ...(p.templates
            ? {
                templates: p.templates.map((t) => ({
                  id: t.id,
                  title: t.title,
                  description: t.description,
                })),
              }
            : {}),
          // The pack's description and groups, and what was imported from
          // it; a newer version offers its diff again (R55.7).
          ...(p.pack
            ? {
                pack: {
                  description: p.pack.description ?? null,
                  groups: Object.keys(p.pack.settings),
                  imported: packs[p.id] ?? null,
                  offer: packs[p.id]?.version !== p.version,
                },
              }
            : {}),
          config: entry?.config ?? {},
          ...(entry?.git !== undefined
            ? {
                git: {
                  url: entry.git,
                  ref: entry.ref,
                  ...(entry.subdir !== undefined
                    ? { subdir: entry.subdir }
                    : {}),
                },
              }
            : {}),
          health: health.get(p.id) ?? null,
        }));
      return {
        supportedContracts: SUPPORTED_CONTRACTS,
        plugins,
      };
    }
    // What importing a plugin's pack would change. Reads only.
    if (name === "plugin.pack.preview")
      return previewPluginPack(options, input);
    // Workflow templates of approved plugins only (R61.1, R61.6). Reads only.
    if (name === "template.list")
      return {
        templates: approvedTemplates(options).map(({ plugin, template }) =>
          templateSummary(plugin, template),
        ),
      };
    if (name === "template.preview") {
      const { plugin, template } = pickTemplate(options, input),
        { text } = checkInputs(template, input.inputs ?? {});
      return {
        template: templateSummary(plugin, template),
        starter: Object.fromEntries(
          Object.entries(template.starterFiles).map(([file, body]) => [
            file,
            fill(body, text),
          ]),
        ),
        seed: templateSeed(template, text),
      };
    }
    if (context.caller)
      fail("Only a person changes plugins, in Settings or the CLI.", 403);
    const strip = (plugin) => {
      if (!plugin) return plugin;
      const { manifest, entry, pack, ...rest } = plugin;
      return rest;
    };
    if (name === "plugin.approve")
      return strip(approvePlugin(options, input, this.operator));
    if (name === "plugin.disable") return strip(disablePlugin(options, input));
    // Add plugin's first step: what the source holds, before anything is
    // declared. Reads only (a git source is resolved to a commit, not fetched).
    if (name === "plugin.preview") return previewPlugin(options, input);
    if (name === "plugin.add")
      return strip(
        input?.entry?.git !== undefined
          ? await addGitPlugin(options, input)
          : addPlugin(options, input),
      );
    if (name === "plugin.update")
      return strip(await updateGitPlugin(options, input));
    if (name === "plugin.remove") return removePlugin(options, input);
    if (name === "plugin.pack.import") {
      const result = importPluginPack(options, input, this.operator);
      this.configuration?.reload();
      return result;
    }
    fail("Unknown operation " + name, 404);
  }
  // Refuse a pack whose text a content rule blocks (RC7.4). It names the set
  // and rule, never the text. Only the crews section writes to GitHub.
  screenPack(pack) {
    const crews = pack?.settings?.crews;
    if (!crews) return;
    const text = [pack.description, Object.values(crews.labels ?? {})]
        .flat()
        .filter((entry) => typeof entry === "string")
        .join("\n"),
      result = checkContent(this.store, {
        boundary: "github",
        target: "pack-crews",
        text,
      }),
      blocked = [
        ...result.findings.map((f) => `${f.set}/${f.rule}`),
        ...result.unavailable.map((u) => `${u.set} unavailable`),
      ];
    if (blocked.length)
      fail(
        `A content rule blocks this pack's crews section (${blocked.join(", ")}). Nothing was changed.`,
        422,
      );
  }
  // The mode Settings > Content rules shows, or null when it can't be read.
  contentMode() {
    try {
      return this.githubMode();
    } catch {
      return null;
    }
  }
  // `github.mode` from .avoozl.json. Absent means no GitHub mode.
  githubMode() {
    return this.githubPolicy().mode;
  }
  // Spec folders live where the mode keeps them (Requirement 30.3). In
  // plans-repo mode `.avoozl.json` usually sits in the planning checkout
  // itself, so the workspace root is the planning root when its origin is
  // the policy's planning repository.
  specRoots(mode = this.githubMode()) {
    const repositories = this.store.list("repositories"),
      planningRoot =
        this.store.getMeta("workspaceRepository")?.root ||
        repositories.find(
          (repository) => repository.planning && repository.root,
        )?.root ||
        (mode === null || this.workspaceIsPlanningCheckout(mode)
          ? this.workspaceRoot
          : null);
    return specRoots({
      mode,
      planningRoot,
      codeRoots: repositories
        .filter((repository) => !repository.planning && repository.root)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((repository) => repository.root),
    });
  }
  // Repository files by git, with the API as the fallback (repo-files.mjs).
  // The cache lives in this workspace's git-ignored state folder.
  repoFiles() {
    this.files ??= new RepoFiles({
      github: this.github,
      root: this.workspaceRoot
        ? path.join(this.workspaceRoot, ".avoozl", "local", "git-cache")
        : null,
    });
    return this.files;
  }
  // Read the plans branch into `privateSpecs`. A failed read keeps the last
  // good list, so a network error never makes private specs vanish.
  // `cached` (a read): do nothing inside github.cacheSeconds of the last
  // check. Past it, one branch call decides whether the files are read
  // again. Without `cached` the head is still compared, so an unchanged
  // branch costs one call, not one per spec file.
  async refreshPrivateSpecs({ cached = false } = {}) {
    const policy = readGitHubPolicyOrNull(this.workspaceRoot),
      mirror =
        policy?.mode && policy.mode !== "local" ? mirrorOf(policy) : null;
    if (!mirror) {
      this.privateSpecs = [];
      return;
    }
    if (!this.github?.available?.()) return;
    const now = Date.now();
    if (
      cached &&
      this.privateSpecsAt &&
      now - this.privateSpecsAt < this.cacheSeconds() * 1000
    )
      return;
    try {
      let head = null;
      try {
        head = await this.repoFiles().head(mirror.mirror, mirror.plansBranch);
      } catch {
        // No head to compare: read the files.
      }
      if (!head || head !== this.privateSpecsHead) {
        this.privateSpecs = await readPrivateSpecs(
          this.repoFiles(),
          mirror,
          head,
        );
        this.privateSpecsHead = head;
      }
      this.privateSpecsAt = now;
    } catch {
      // Keep the last list.
    }
  }
  // A tick on a spec's base branch completes its task (spec-ticks.mjs). Read
  // again only when the branch head or the approved revision moved.
  // With `land`, a task that is done and ticked on the branch, and has no
  // landing yet, lands at the commit that ticked it (adopting a repository).
  async applyBaseTicks({ land = false } = {}) {
    this.ticksSeen ??= new Map();
    this.ticksFetched = new Set();
    const repositories = this.store.list("repositories");
    for (const plan of this.store.list("plans")) {
      if (
        !plan.spec ||
        plan.deletedAt ||
        !Object.keys(plan.mapping ?? {}).length
      )
        continue;
      try {
        if (pullFor(this.store, plan.spec)) continue;
        const spec = this.readSpec(plan.spec);
        if (!spec.exists) continue;
        const branch = spec.root
            ? spec.home === "plansBranch"
              ? spec.ref
              : repositories.find((p) => p.root === spec.root)?.baseBranch ||
                "main"
            : spec.ref,
          read = spec.root
            ? await baseTasks(spec.root, branch, plan.spec, {
                fetched: this.ticksFetched,
              })
            : { head: this.privateSpecsHead, text: spec.files["tasks.md"] };
        if (!read?.text) continue;
        const seen = `${read.head}:${plan.approvalId}`;
        if (read.head && this.ticksSeen.get(plan.id) === seen) continue;
        await applyTicks(this.store, plan, {
          ...read,
          branch,
          land,
          // shortcut: the plans branch is cached with no history, so a tick
          // there names the branch head it was first read at; use the
          // contents API's commit list for the exact commit if that matters.
          commits: spec.root
            ? () => tickCommits(spec.root, read.head, plan.spec)
            : async () => null,
        });
        this.ticksSeen.set(plan.id, seen);
      } catch {
        // Read again on the next tick.
      }
    }
  }
  // Every spec folder the mode reads, in both homes (RC25.2), each with its
  // root (null for a private spec). specList and graph.view read it.
  specHomes() {
    const roots = this.specRoots(),
      policy = readGitHubPolicyOrNull(this.workspaceRoot),
      mirror = mirrorOf(policy);
    // Both homes in one list (RC25.2). The plans branch is read on each tick
    // into `privateSpecs`; a name or task ID in both homes is refused.
    const publicSpecs = roots.flatMap((root) =>
        listSpecFolders(root).map((name) => ({
          root,
          spec: locateLocalSpec(
            { ...readSpecFolder(root, name), root },
            mirror,
            policy,
          ),
        })),
      ),
      merged = mirror
        ? mergeHomes(
            publicSpecs
              .filter((entry) => entry.spec.home !== "plansBranch")
              .map((entry) => entry.spec),
            [
              ...publicSpecs
                .filter((entry) => entry.spec.home === "plansBranch")
                .map((entry) => entry.spec),
              ...this.privateSpecs.filter(
                (spec) =>
                  !publicSpecs.some(
                    (entry) =>
                      entry.spec.home === "plansBranch" &&
                      entry.spec.name === spec.name,
                  ),
              ),
            ],
          )
        : {
            specs: publicSpecs.map((entry) => ({
              home: "main",
              spec: entry.spec,
            })),
            errors: [],
          };
    const adopted = pullSpecs(this.store, roots[0] ?? null);
    return {
      roots,
      mirror,
      errors: merged.errors,
      homes: [
        ...merged.specs
          .filter(
            ({ spec }) => !adopted.some((pull) => pull.name === spec.name),
          )
          .map(({ home, spec }) => ({
            home,
            spec,
            root:
              spec.root ??
              (home === "main"
                ? publicSpecs.find((entry) => entry.spec === spec).root
                : null),
          })),
        // An adopted spec pull request replaces the checkout's folder, or
        // adds the folder it proposes (R107.3).
        ...adopted.map((spec) => ({ home: "main", spec, root: spec.root })),
      ].sort((a, b) => a.spec.name.localeCompare(b.spec.name)),
    };
  }
  // Every spec folder the mode reads, linted, with its stored plan. Each
  // item carries its title, its front-matter category (Requirement 30.9),
  // and when its files last changed on disk.
  specList() {
    const store = this.store;
    const namespace = this.specNamespace();
    const data = {
        ...this.read(),
        repositories: store.list("repositories"),
      },
      plans = store
        .list("plans")
        .filter((plan) => plan.spec && !plan.deletedAt),
      approvals = store.list("approvals"),
      { roots, mirror, homes, errors: homeErrors } = this.specHomes(),
      declarations = specDeclarations(plans);
    return {
      root: roots[0],
      roots,
      items: homes.map(({ home, root, spec: disk }) => {
        const name = disk.name,
          plan = plans.find((entry) => entry.spec === name) || null,
          quality = this.withContentDiagnostics(
            lintSpec({
              spec: disk,
              plan: plan || { id: name },
              data,
              approved: plan && this.approvedSpec(plan),
              namespace,
              declaredTasks: declarations.filter(
                (task) => task.planId !== plan?.id,
              ),
            }),
            disk,
          );
        const front = frontMatter(
          disk.files["requirements.md"] ?? disk.files["bugfix.md"],
        );
        return {
          name,
          root,
          ...(mirror ? { home } : {}),
          title: specTitle(disk),
          category: front.category,
          categoryProblem: front.problem?.message ?? null,
          modifiedAt: root
            ? specModifiedAt(root, name, Object.keys(disk.files))
            : null,
          folder: disk.folder,
          type: quality.type,
          kind: quality.kind,
          epic: quality.epic,
          ...(quality.members ? { members: quality.members } : {}),
          hash: disk.hash,
          ...(disk.pull ? { pull: disk.pull } : {}),
          files: Object.keys(disk.files),
          counts: quality.counts,
          taskCount: quality.taskCount,
          critique: readCritique(disk.critique, disk.hash),
          plan: plan && {
            id: plan.id,
            state: plan.state,
            hash: plan.hash,
            revision: plan.revision,
            changed: plan.hash !== disk.hash,
            approved: approvals.some(
              (a) => a.planId === plan.id && a.hash === plan.hash,
            ),
          },
        };
      }),
      ...(homeErrors.length ? { homeErrors } : {}),
    };
  }
  // Store a spec folder as a draft plan: `plan.create` with a spec, and
  // each folder of a spec-folder example. It approves nothing.
  createSpecDraft(input, context = {}) {
    const store = this.store,
      spec = this.readSpec(input.spec);
    if (spec.exists && (context.caller || context.mcp))
      enforceSpec(store, spec, { mode: "refuse" });
    const previousHash = store.get("plans", input.id || input.spec)?.hash;
    const created = createSpecPlan(
      store,
      { ...input, ...(spec.home ? { home: spec.home } : {}) },
      spec,
    );
    recordPlanReviewWriter(store, created, {
      previousHash,
      caller: context.caller,
    });
    return created;
  }
  // Where a spec-folder example is written: the workspace's own folder, and
  // only when that is where this workspace reads its specs. An example never
  // writes into a code repository or a separate planning checkout.
  exampleSpecRoot() {
    const roots = this.specRoots();
    if (
      !this.workspaceRoot ||
      roots.length !== 1 ||
      path.resolve(roots[0]) !== path.resolve(this.workspaceRoot)
    )
      fail(
        "This example installs spec folders in the workspace's own .kiro/specs/, and this workspace reads its specs from a repository. Nothing was installed.",
        409,
      );
    return roots[0];
  }
  // A folder on disk, or else a private spec read from the plans branch
  // (RC25.2). A private spec has no `root`, so nothing writes it to disk.
  // shortcut: spec edits that write files (manifest, status) refuse a private
  // spec for now; they move to a contents write when Spec Builder needs them.
  readSpec(name) {
    // An adopted spec pull request's files stand for the folder (R107.3).
    const adopted = pullFor(this.store, name);
    if (adopted) return this.pullSpec(adopted);
    const policy = readGitHubPolicyOrNull(this.workspaceRoot),
      mirror = mirrorOf(policy),
      local = locateLocalSpec(
        findSpecFolder(this.specRoots(), specName(name)),
        mirror,
        policy,
      ),
      privateSpec = (this.privateSpecs || []).find(
        (entry) => entry.name === name,
      );
    if (local.exists && local.home === "plansBranch") return local;
    if (local.exists && privateSpec)
      fail(
        `Spec ${name} exists in both homes: main and plansBranch. Rename one.`,
        409,
      );
    return privateSpec
      ? {
          ...privateSpec,
          home: "plansBranch",
          repository: privateSpec.repository ?? privateSpec.specRepository,
          ref: privateSpec.ref ?? privateSpec.plansRef,
        }
      : local;
  }
  // The folder an adopted spec pull request holds. Its root is the planning
  // checkout when there is one, which the review chat reads beside it.
  pullSpec(receipt) {
    let root = null;
    try {
      root = this.specRoots()[0] ?? null;
    } catch {
      root = null;
    }
    return pullSpecs(this.store, root).find(
      (spec) => spec.name === receipt.spec,
    );
  }
  // One folder of the mode's spec roots by name, for the checks that read
  // another folder: an epic's members, a plan's epic (Requirement 59.3).
  specNamespace() {
    const cache = new Map();
    return (name) => {
      if (!cache.has(name)) {
        let folder = null;
        try {
          folder = this.readSpec(name);
        } catch {
          folder = null;
        }
        cache.set(name, folder);
      }
      return cache.get(name);
    };
  }
  workspaceIsPlanningCheckout(mode) {
    if (mode !== "plans-repo" || !this.workspaceRoot) return false;
    let wanted = null;
    try {
      wanted = this.githubPolicy().planningRepository;
    } catch {
      return false;
    }
    const origin = originRepositorySync(this.workspaceRoot);
    return Boolean(
      wanted && origin && origin.toLowerCase() === wanted.toLowerCase(),
    );
  }
  // Where a spec's approval pull request opens (D5.2, RC3.6, R86.8): only a
  // spec whose home is a mirror's protected plans branch. Every other spec
  // keeps the plain approval, the local hash receipt.
  approvalPullRequestTarget(plan) {
    const policy = readGitHubPolicyOrNull(this.workspaceRoot);
    if (!policy?.mode || !plan.spec) return null;
    const spec = this.readSpec(plan.spec);
    if (spec.approvalBlocked)
      fail(
        "Publish the private spec revision on the configured plans branch before requesting approval.",
        409,
      );
    const entries = Object.entries(policy.repositories || {}),
      home = spec.home ?? plan.home,
      hidden =
        home === "plansBranch"
          ? []
          : privateDependencies(
              { name: plan.spec, files: plan.files ?? spec.files },
              this.privateSpecs || [],
            ),
      repository =
        spec.repository ?? spec.specRepository ?? plan.specRepository;
    if (hidden.length)
      fail(
        `This public spec names private tasks (${hidden.join(", ")}) as dependencies, and its approval would publish them. Remove it there and list the public task in the private task's unblocks list instead.`,
        409,
      );
    // Source-home validation runs before the private shortcut. A task-branch
    // draft must never use stored home metadata to bypass its publication hold.
    if (home === "plansBranch") {
      const mirror = repository
        ? entries
            .map(([, entry]) => entry.mirror)
            .find(
              (entry) =>
                entry?.mirror.toLowerCase() === repository.toLowerCase(),
            )
        : mirrorOf(policy);
      if (!mirror)
        fail("The private spec home does not match a configured mirror.", 409);
      const ref =
        spec.ref ??
        spec.plansRef ??
        plan.ref ??
        plan.plansRef ??
        mirror.plansBranch;
      if (ref !== mirror.plansBranch)
        fail(
          "The private spec branch no longer matches its configured mirror.",
          409,
        );
      return {
        repository: parseRepository(mirror.mirror),
        ref,
      };
    }
    return null;
  }
  // Approve ends in a commit a crew can read: open the approval pull request,
  // and approve in Avoozl only once it has merged. Returns null when no pull
  // request applies, `{ pending }` while it is open, `{ merged }` after.
  // The approval pull request target when approving this plan needs one,
  // else null.
  approvalGateTarget(plan) {
    // An adopted spec pull request is the approval's commit (R107.6).
    if (
      !this.planApproved(plan) &&
      pullFor(this.store, plan.spec)?.hash === plan.hash
    )
      return { pull: true };
    const target = this.approvalPullRequestTarget(plan);
    if (!target || this.planApproved(plan)) return null;
    return target;
  }
  // Who approves a spec. GitHub records the approver as a login (the approval
  // pull request checks it, and the issue write-back names it), so with
  // GitHub in play it is the caller's login, else the signed-in GitHub login,
  // cached for this workspace. git user.name is display provenance and may
  // hold spaces. Only an approval pull request requires the login; without
  // one a missing login keeps the operator, as before.
  async specApprover(plan, approvedBy) {
    const given = approvedBy?.trim();
    if (given) return given;
    const gated = Boolean(this.approvalGateTarget(plan));
    if (
      !gated &&
      !(
        readGitHubPolicyOrNull(this.workspaceRoot)?.mode &&
        this.github?.available?.()
      )
    )
      return this.operator;
    if (!this.approverLogin)
      try {
        this.approverLogin =
          (this.github?.available?.() &&
            (await this.github.currentUser())?.login) ||
          null;
      } catch {}
    if (this.approverLogin) return this.approverLogin;
    if (!gated) return this.operator;
    fail(
      "Approving a spec needs your GitHub login, and Avoozl could not find one. Run `gh auth login`, then approve again.",
      401,
    );
  }
  // The person a grant names: the signed-in GitHub login when GitHub is in
  // play, since a gated approval records a login, else the operator.
  async personLogin() {
    if (
      readGitHubPolicyOrNull(this.workspaceRoot)?.mode &&
      this.github?.available?.()
    ) {
      if (!this.approverLogin)
        try {
          this.approverLogin = (await this.github.currentUser())?.login || null;
        } catch {}
      if (this.approverLogin) return this.approverLogin;
    }
    return this.operator;
  }
  async approvalPullRequest(plan, { approvedBy, quality, delegation = null }) {
    const target = this.approvalGateTarget(plan);
    if (!target) return null;
    if (target.pull) {
      const state = recordPullApproval(this.store, plan, approvedBy);
      if (!state) return null;
      const merged = await reconcileApproval(this.store, {
        github: this.github,
        repository: state.repository,
        planId: plan.id,
        hash: plan.hash,
        mayApprove: this.approverFor(state.repository),
      });
      if (merged?.state === "merged") return { merged };
      approvalChangedAtMerge(merged);
      return { pending: { ...merged, repository: state.repository } };
    }
    const ids = {
        github: this.github,
        repository: target.repository,
        ...(target.ref ? { ref: target.ref } : {}),
      },
      key = { planId: plan.id, hash: plan.hash };
    let state = await reconcileApproval(this.store, {
      ...ids,
      ...key,
      mayApprove: this.approverFor(target.repository),
    });
    if (state?.state === "merged") return { merged: state };
    approvalChangedAtMerge(state);
    if (state?.state !== "open")
      state = await openApproval(this.store, {
        ...ids,
        ...key,
        spec: plan.spec,
        files: plan.files || {},
        diagnostics: quality.diagnostics,
        approvedBy,
        ...(target.ref ? { ref: target.ref } : {}),
        reviewers: this.specReviewers(plan),
        specIssue: await this.linkableSpecIssue(plan, target.repository),
        delegation,
      });
    return { pending: state };
  }
  // The logins `github.specReviewers` names for a spec (R102.18).
  specReviewers(plan) {
    return (
      readGitHubPolicyOrNull(this.workspaceRoot)?.specReviewers?.[plan.spec] ??
      []
    );
  }
  // The spec issue a pull request in `repository` may name, or null: only
  // when the issue is published and visibility permits (R102.18).
  async linkableSpecIssue(plan, repository) {
    const issue = this.store.get("receipts", `github-parent:plan:${plan.id}`);
    if (!issue?.number || !issue.repository) return null;
    try {
      const [owner, repo] = issue.repository.split("/"),
        [pull, home] = await Promise.all([
          this.github.repository(repository),
          this.github.repository({ owner, repo }),
        ]);
      return mayLinkSpecIssue({
        pullPrivate: pull?.private,
        issuePrivate: home?.private,
      })
        ? `${issue.repository}#${issue.number}`
        : null;
    } catch {
      return null;
    }
  }
  // An approval pull request that merged is the person's approval (they
  // merged it): record it under the login that asked for it, with no second
  // command. One read per open approval pull request.
  // shortcut: a merged spec that fails its checks is tried again each tick
  // and says nothing; surface it in Needs you if that turns out to happen.
  async recordMergedApprovals() {
    const merged = await reconcileOpenApprovals(this.store, {
      github: this.github,
      approverFor: (repository) => this.approverFor(repository),
    });
    for (const pull of merged)
      await this.perform("plan.approveMany", {
        items: pull.specs.map(({ planId, hash }) => ({
          id: planId,
          expectedHash: hash,
        })),
        approvedBy: pull.approvedBy,
      }).then(
        (r) => console.error("AM", JSON.stringify(r)),
        (e) => console.error("AMERR", e.message),
      );
  }
  // The tick's pass over spec pull requests (design §4.36): adopt, refresh,
  // and merge the ones a person approved once their checks pass. It reads the
  // Triage cache and calls GitHub only as spec-pull-requests.mjs says.
  async specPullTick(policy) {
    const owners = [];
    try {
      const login = (await this.github.currentUser())?.login;
      if (login) owners.push(login);
    } catch {
      // Without a login only the working branch counts as own.
    }
    await syncSpecPulls(
      this.store,
      this.github,
      policy,
      readCache(this.store),
      {
        owners,
      },
    );
    await mergeApprovedPulls(this.store, this.github, policy);
  }
  // The tick's pass over spec pull requests and merged approval pull
  // requests.
  async approvalTick() {
    const policy = readGitHubPolicyOrNull(this.workspaceRoot);
    if (!policy?.mode || !this.github?.available?.()) return;
    await this.specPullTick(policy).catch(() => {});
    await this.recordMergedApprovals().catch(() => {});
  }
  // A gap report (RC17.6): read from a local file a person names, or from an
  // issue body, parsed into a table, and turned into one proposal per failing
  // cell for the sub-specs of a parent spec. Reads only.
  async gapPreview(input = {}, { local = false } = {}) {
    let text;
    if (typeof input.path === "string") {
      if (!local)
        fail("Name an issue; only the page and the CLI read a path.", 403);
      const file = path.resolve(input.path);
      let stat = null;
      try {
        stat = fs.statSync(file);
      } catch {
        fail("The gap report path cannot be read.", 404);
      }
      if (!stat.isFile() || stat.size > 200 * 1024)
        fail("The gap report must be a file of at most 200 KB.", 422);
      text = fs.readFileSync(file, "utf8");
    } else if (typeof input.issue === "string") {
      if (!this.github?.available?.()) fail("GitHub is not available.", 409);
      const { owner, repo, number } = parseIssueReference(input.issue),
        issue = await this.github.issue(
          { owner, repo, id: `${owner}/${repo}` },
          number,
        );
      text = issue?.body ?? "";
    } else fail("Name the gap report as a path or an issue.", 422);
    const parent = this.readSpec(input.parent);
    if (!parent.exists)
      fail(`No spec folder .kiro/specs/${input.parent}/.`, 404);
    const members = epicMembers(parent.files).map((name) => {
      const folder = this.readSpec(name);
      let repositories = [];
      try {
        repositories = [
          ...new Set(
            Object.values(specFacts(folder.files).tasks)
              .map((entry) => entry?.repository)
              .filter((value) => typeof value === "string"),
          ),
        ];
      } catch {
        repositories = [];
      }
      return { name, repositories };
    });
    const report = parseGapReport(text),
      subSpecOf = (repository) =>
        members.find(
          (member) =>
            member.repositories.includes(repository) ||
            member.name === repository.split("/").at(-1),
        )?.name ?? null,
      proposals = gapProposals(report, subSpecOf);
    return { report, table: formatGapTable(report), proposals };
  }
  // Whether a plan's current text is the one last approved.
  // Every check plan.approve makes before it writes, shared with
  // plan.approveMany so a batch keeps each one. Throws on the first failure.
  approvalChecks(input) {
    const plan = this.store.get("plans", input.id);
    if (!plan) fail("Plan not found.", 404);
    // New tasks from an archived plan would start; unarchive it first.
    if (plan.archivedAt)
      fail("This spec is archived. Unarchive it before approving.", 409);
    if (plan.hash !== input.expectedHash)
      fail("The reviewed document hash changed.", 409);
    // Approval is of the stored revision, and only while the folder on
    // disk still matches it.
    if (plan.spec && this.readSpec(plan.spec).hash !== plan.hash)
      fail("The spec folder changed on disk. Reload it before approving.", 409);
    const extraction = input.extractionId
      ? getExtraction(this.store, input.extractionId)
      : null;
    // Every spec file and the manifest at the approved hash (§4.9): a
    // match refuses approval and opens a decision; an allowance for the
    // exact content passes once.
    if (plan.spec && !extraction) {
      const spec = { ...this.readSpec(plan.spec), files: plan.files || {} },
        content = enforceSpec(this.store, spec, { mode: "decide" });
      queueNotifications(this.store, content.notify);
      if (!content.ok) {
        const first = this.withContentDiagnostics(
          { diagnostics: [], counts: {} },
          spec,
        ).diagnostics[0];
        fail(
          `Resolve plan diagnostic ${first?.code || "content.match"} before approval: ${first?.message || "a content rule blocks this plan."}`,
          409,
        );
      }
    }
    const specQuality =
        plan.spec && !extraction
          ? this.lintSpecPlan(plan, retitledInput(input.retitled), {
              content: false,
            })
          : null,
      proposals = extraction
        ? proposalsFromFacts(this.store, extraction.id)
        : specQuality?.proposals,
      quality =
        specQuality ||
        lintPlan({
          text: plan.text,
          plan,
          data: {
            ...this.read(),
            repositories: this.store.list("repositories"),
          },
          ...(extraction ? { proposals } : {}),
        });
    if (extraction && !proposals.length)
      fail("The extraction contains no accepted task facts to approve.", 409);
    const blocking = quality.diagnostics.find(
      (diagnostic) => diagnostic.severity === "error",
    );
    if (blocking)
      fail(
        `Resolve plan diagnostic ${blocking.code} before approval: ${blocking.message}`,
        409,
      );
    return {
      plan,
      extraction,
      specQuality,
      proposals,
      quality,
      review: planReviewSummary(this.store, plan.id),
    };
  }
  // The driver's offers and claim answers for worker machines (WP5).
  async workerOffers(store, driving) {
    const config = loadLayeredConfig({
        workspaceRoot: this.workspaceRoot,
      }).config,
      logins = offerLogins(config.workers?.offerTo);
    if (!logins.length) return null;
    return workerOffersStep(store, {
      driving,
      logins,
      authorityFor: async (spec) => {
        const driver = driverIdOf(store, spec);
        if (!driver) return null;
        const authority = await specAuthority(
          store,
          {
            github: this.github,
            workspaceRoot: this.workspaceRoot,
            actor: this.operator,
          },
          spec,
        );
        return { ...authority, driver, github: this.github };
      },
    });
  }

  // The driver's step for worker machines' pushed results (WP5.3).
  async workerResults(store, driving, journalFor) {
    const config = loadLayeredConfig({
        workspaceRoot: this.workspaceRoot,
      }).config,
      result = await workerResultsStep(store, {
        driving,
        journalFor,
        github: this.github,
        sources: config.runner?.sources ?? {},
        protectedPaths:
          readFlowPolicy(this.workspaceRoot).workspace.verify?.protectedPaths ??
          [],
      });
    queueNotifications(store, result.notify);
    return result;
  }

  // This workspace's saved config, which names each role's executor
  // (Settings › Models); none when there is no file or it does not load.
  savedConfig() {
    if (!this.workspaceRoot) return undefined;
    try {
      return loadLayeredConfig({ workspaceRoot: this.workspaceRoot }).config;
    } catch {
      return undefined;
    }
  }

  planApproved(plan) {
    return this.store
      .list("approvals")
      .some((a) => a.planId === plan.id && a.hash === plan.hash);
  }
  // The git checkout a spec's approval commit goes in (§4.42): the top of
  // the work tree that holds its folder. Null for a spec read from GitHub (a
  // private plans branch or an adopted pull request, which approve through
  // their pull request) and for a folder outside git.
  // shortcut: a spec folder outside git keeps only the database receipt and
  // is not rebuilt; require git once every workspace is a checkout.
  async approvalCheckout(plan) {
    if (!plan?.spec || pullFor(this.store, plan.spec)) return null;
    let spec;
    try {
      spec = this.readSpec(plan.spec);
    } catch {
      return null;
    }
    if (!spec?.exists || spec.home === "plansBranch" || !spec.root) return null;
    const top = await gitTop(spec.root);
    if (!top) return null;
    try {
      return fs.realpathSync.native(top) === fs.realpathSync.native(spec.root)
        ? spec.root
        : null;
    } catch {
      return null;
    }
  }
  // Who approves in a checkout (git-approvals.mjs approverCheck): its
  // repository's allowedActors under the GitHub policy, else this
  // checkout's own git user.email.
  async approverOf(root) {
    const policy = readGitHubPolicyOrNull(this.workspaceRoot),
      name = originRepositorySync(root);
    if (policy?.mode && name) return this.approverFor(name);
    return approverCheck({
      localEmail: (await gitAuthor(root).catch(() => null))?.email,
    });
  }
  // A GitHub repository's approvers: its allowedActors, or people with
  // write access when the policy does not name it (R10.2).
  approverFor(repository) {
    if (!repository) return null;
    const name =
        typeof repository === "string"
          ? repository
          : `${repository.owner}/${repository.repo}`,
      policy = readGitHubPolicyOrNull(this.workspaceRoot),
      entry = Object.entries(policy?.repositories || {}).find(
        ([id, value]) =>
          id.toLowerCase() === name.toLowerCase() ||
          value.mirror?.mirror?.toLowerCase() === name.toLowerCase(),
      )?.[1] ?? { allowedActors: [], minimumPermission: "write" };
    return approverCheck({
      repository: entry,
      github: this.github,
      repositoryName: name,
    });
  }
  // The approval commit for these spec plans, one per checkout, made by the
  // person git names there. A spec whose current text an approver already
  // committed needs no new commit. `trial()` runs the database approval on
  // a scratch copy first, so nothing is committed that the receipt would
  // refuse. Returns plan ID -> {commit, email, evidence}, or null when no
  // spec has a checkout.
  async approveInGit(plans, trial) {
    const roots = new Map();
    for (const plan of plans) {
      const root = await this.approvalCheckout(plan);
      if (!root) continue;
      if (!roots.has(root)) roots.set(root, []);
      roots.get(root).push(plan);
    }
    if (!roots.size) return null;
    const login = readGitHubPolicyOrNull(this.workspaceRoot)?.mode
      ? await this.personLogin()
      : null;
    const work = [];
    for (const [root, group] of roots) {
      const allowed = await this.approverOf(root),
        author = await gitAuthor(root);
      if (!(await allowed(author.email, null, login)))
        fail(
          `${author.email} is not on this repository's approvers list (github.repositories allowedActors), so a commit by it approves nothing.`,
          403,
        );
      const base = await approvalBase(root),
        committed = await approvalCommits(root, {
          allowed,
          ref: base.head,
          specs: group.map((plan) => plan.spec),
        }),
        open = group.filter(
          (plan) =>
            !committed.some(
              (entry) => entry.spec === plan.spec && entry.hash === plan.hash,
            ),
        );
      work.push({ root, author, open, committed, group });
    }
    trial();
    const result = new Map();
    for (const { root, author, open, committed, group } of work) {
      const made = open.length
        ? await commitApproval(
            root,
            Object.fromEntries(
              open.map((plan) => [plan.spec, plan.files || {}]),
            ),
          )
        : null;
      for (const plan of group) {
        const earlier = open.includes(plan)
            ? null
            : committed.find(
                (entry) => entry.spec === plan.spec && entry.hash === plan.hash,
              ),
          commit = earlier?.commit ?? made.commit,
          email = earlier?.email ?? made?.author.email ?? author.email;
        result.set(plan.id, {
          commit,
          email,
          evidence: `Approval commit ${commit} by ${email}.`,
        });
      }
    }
    return result;
  }
  // `avoozl rebuild` (design §4.42): SQLite is a cache of git and GitHub.
  // From an empty database: every spec folder becomes a plan; each plan
  // whose current text an approver committed on main (or whose text differs
  // from it only in layout) is approved again as that commit's author, which
  // also makes its ticked tasks done; and each landing commit's trailers become the
  // Activity rows of what landed.
  // The checkout that holds retro files (retro-files.mjs): the git work
  // tree of this workspace's first spec root, or null.
  async retroRoot() {
    let roots = [];
    try {
      roots = this.specRoots();
    } catch {
      return null;
    }
    for (const root of roots.filter(Boolean)) {
      const top = await gitTop(root);
      if (top) return top;
    }
    return null;
  }
  // Commit the retros that finished since the last write (§4.42).
  async writeRetroFiles() {
    const root = await this.retroRoot();
    return root ? writeRetroFiles(this.store, root) : null;
  }
  async rebuild() {
    if (this.store.list("plans").length)
      fail(
        "Rebuild starts from an empty database. Move workspace.sqlite aside, then run it again.",
        409,
      );
    return this.readFromGit();
  }
  // Approve each plan as its approval commit names it: `found` is plan ID
  // -> an approvalCommits entry whose hash is the plan's. Owners first: a
  // spec whose checked tasks need another spec's waits for it, so approve
  // until a pass approves nothing more. A plan that fails a check is left a
  // draft. Returns the plan IDs approved.
  adoptApprovals(found) {
    const store = this.store,
      left = new Map(found),
      approved = [];
    for (let moved = true; moved && left.size; ) {
      moved = false;
      for (const [id, match] of left) {
        const plan = store.get("plans", id);
        try {
          const input = {
              id: plan.id,
              expectedHash: plan.hash,
              expectedRevision: store.read().revision,
            },
            { specQuality, proposals } = this.approvalChecks(input);
          approvePlan(store, {
            ...input,
            approvedBy: match.email,
            evidence: `Approval commit ${match.commit} by ${match.email}.`,
            operator: this.operator,
            githubPolicy: this.githubPolicy(),
            ...(specQuality
              ? {
                  proposals,
                  baseline: true,
                  declaredDependencies: specQuality.declaredDependencies,
                }
              : {}),
          });
          approved.push(id);
          left.delete(id);
          moved = true;
        } catch {}
      }
    }
    return approved;
  }
  // Approvals that reach main with no click (§4.42): a spec pull request an
  // approver authored, merged on GitHub, or a push. On a tick, each checkout's
  // base branch is read as `applyBaseTicks` fetched it; when it moved, or a
  // spec's text did, the rebuild reader runs over the specs whose text on
  // disk has no approval. A spec an approver committed with exactly that
  // text is approved as that commit's author. Writes nothing to git.
  // shortcut: specs read only from GitHub (plans branch, adopted pull
  // requests) keep their approval pull request; a spec folder with no plan
  // waits for import.
  async applyMainApprovals() {
    this.approvalsSeen ??= new Map();
    this.mainApprovers ??= new Map();
    const store = this.store,
      approved = new Set(
        store.list("approvals").map((a) => `${a.planId}:${a.hash}`),
      ),
      roots = new Map();
    for (const plan of store.list("plans")) {
      if (!plan.spec || plan.deletedAt || plan.archivedAt) continue;
      try {
        const disk = this.readSpec(plan.spec).hash;
        if (disk === plan.hash && approved.has(`${plan.id}:${disk}`)) continue;
        const root = await this.approvalCheckout(plan);
        if (!root) continue;
        if (!roots.has(root)) roots.set(root, []);
        roots.get(root).push({ plan, disk });
      } catch {}
    }
    const repositories = store.list("repositories");
    for (const [root, group] of roots)
      try {
        const branch =
            repositories.find((p) => p.root === root)?.baseBranch || "main",
          { head } = await baseHead(root, branch, {
            fetched: (this.ticksFetched ??= new Set()),
          }),
          seen = JSON.stringify([
            head,
            group.map(({ plan, disk }) => [plan.id, plan.hash, disk]),
          ]);
        if (this.approvalsSeen.get(root) === seen) continue;
        // One check per checkout and approvers list, so each author is
        // decided once and no tick asks GitHub about the same email again.
        const list = `${root}\n${JSON.stringify(readGitHubPolicyOrNull(this.workspaceRoot)?.repositories ?? null)}`;
        if (!this.mainApprovers.has(list))
          this.mainApprovers.set(list, await this.approverOf(root));
        const commits = await approvalCommits(root, {
            allowed: this.mainApprovers.get(list),
            ref: head,
            specs: group.map(({ plan }) => plan.spec),
          }),
          found = new Map();
        for (const { plan, disk } of group) {
          const match = commits.find(
            (entry) => entry.spec === plan.spec && entry.hash === disk,
          );
          if (!match) continue;
          // The approved text is on disk as a newer revision: read it in.
          if (plan.hash !== disk)
            saveSpecPlan(
              store,
              { id: plan.id, expectedHash: plan.hash },
              this.readSpec(plan.spec),
            );
          found.set(plan.id, match);
        }
        for (const id of this.adoptApprovals(found)) {
          const match = found.get(id);
          recordActivity(store, {
            source: "tick",
            actor: match.email,
            kind: "plan.approved",
            summary: `${match.spec} approved by ${match.email} in commit ${match.commit.slice(0, 12)} on ${branch}`,
            targetId: id,
            key: `approved:${id}:${match.commit}`,
          });
        }
        this.approvalsSeen.set(root, seen);
      } catch {
        // Read again on the next tick.
      }
  }
  // The one reader behind `avoozl rebuild` and adopting a repository in
  // Settings > Repository setup (onboarding.adopt): the same steps over the
  // named specs, with `allowed` (an approverCheck) in place of the
  // repository's own approvers list and `root` limiting landings and retros
  // to one checkout. A spec that already has a plan is left alone.
  async readFromGit({
    names: only = null,
    allowed: given = null,
    root: only_root = null,
  } = {}) {
    const store = this.store,
      names = (only ?? this.specList().items.map((item) => item.name)).filter(
        (name) => !store.get("plans", name),
      );
    for (const name of names)
      createSpecPlan(store, { id: name }, this.readSpec(name));
    const approvers = new Map(),
      found = new Map();
    for (const name of names) {
      const plan = store.get("plans", name),
        root = await this.approvalCheckout(plan);
      if (!root) continue;
      if (!approvers.has(root)) {
        const base = await approvalBase(root).catch(() => null);
        approvers.set(root, {
          allowed: given ?? (await this.approverOf(root)),
          ref: base?.head ?? "HEAD",
        });
      }
      const { allowed, ref } = approvers.get(root),
        commits = await approvalCommits(root, { allowed, ref, specs: [name] }),
        match = commits.find((entry) => entry.hash === plan.hash);
      if (match) found.set(name, match);
    }
    const approved = this.adoptApprovals(found);
    // Ticked tasks keep their tick commit as the landing commit.
    await this.applyBaseTicks({ land: true });
    const landed = [];
    for (const project of store
      .list("repositories")
      .filter((p) => p.root && (!only_root || sameFolder(p.root, only_root))))
      for (const landing of await landingsFromGit(
        project.root,
        project.baseBranch || "HEAD",
      ).catch(() => []))
        for (const { spans = [], ...task } of landing.tasks) {
          landed.push({ ...task, commit: landing.commit });
          // Flow's spans for the task, as its landing commit carried them.
          for (const span of spans)
            try {
              putSpan(store, { ...span, taskId: task.task });
            } catch {}
          recordActivity(store, {
            source: "tick",
            kind: "task.landed",
            summary: `${task.task} landed at ${landing.commit.slice(0, 12)}${task.tries ? ` after ${task.tries} tries` : ""}${task.cost ? `, ${task.cost} credits` : ""}`,
            targetId: task.task,
            at: landing.at,
            key: `landed:${task.task}:${landing.commit}`,
          });
        }
    // Retros, from their committed files.
    const retros = [],
      retroRoot = only_root ?? (await this.retroRoot());
    if (retroRoot) {
      const base = await approvalBase(retroRoot).catch(() => null);
      for (const retro of await readRetroFiles(
        retroRoot,
        base?.head ?? "HEAD",
      )) {
        if (store.get("flow_retros", retro.id)) continue;
        store.put("flow_retros", retro);
        retros.push(retro.id);
      }
      store.setMeta("retro.files", {
        ...(store.getMeta("retro.files") || {}),
        ...Object.fromEntries(
          store
            .list("flow_retros")
            .filter((retro) => retros.includes(retro.id))
            .map((retro) => [retro.id, digest(retroText(retro))]),
        ),
      });
    }
    return {
      plans: names.length,
      approved,
      retros,
      drafts: names.filter((name) => !approved.includes(name)),
      // The adopted specs' tasks that came in done (statusComplete takes a status id).
      done: ((data) =>
        data.tasks
          .filter(
            (task) =>
              names.includes(task.planId) && statusComplete(data, task.status),
          )
          .map((task) => task.id))(store.read()),
      landed,
    };
  }
  // One spec folder's documents for the Plans tab to read. readSpecFolder
  // reads only regular files inside a planning root, so a symlink out of it
  // reads as missing, and specName refuses a name with a path in it.
  readSpecDocuments({ name } = {}) {
    const spec = this.readSpec(name);
    if (!spec.exists) fail(`No spec folder .kiro/specs/${name}/.`, 404);
    const documents = {};
    for (const file of [
      "requirements.md",
      "bugfix.md",
      "design.md",
      "tasks.md",
    ])
      if (typeof spec.files[file] === "string")
        documents[file] = spec.files[file];
    return { name: spec.name, folder: spec.folder, hash: spec.hash, documents };
  }
  // The plan change a page edit becomes when the page must not write the
  // row: GitHub or a plugin owns it, or its approved plan does. Preview only:
  // it writes nothing, and the owner approves the plan change as before.
  previewTaskChange(input = {}) {
    const data = this.read(),
      task = data.tasks.find((t) => t.id === resolveTaskId(data, input.id));
    if (!task) fail("Task not found.", 404);
    const authority = taskAuthority(task),
      plan = task.planId ? this.store.get("plans", task.planId) : null,
      change = {};
    for (const key of ["title", "summary", "acceptance", "requires"])
      if (Object.hasOwn(input, key)) change[key] = input[key];
    if (typeof change.title === "string" && /[\r\n]/.test(change.title))
      fail("A title is one line.");
    if (authority === "github" && task.github?.origin !== "design")
      return {
        route: "github",
        message:
          "GitHub owns this task. Edit the issue on GitHub; the next sync reads it.",
        link: task.github?.url ?? null,
        change,
      };
    if (!plan || plan.deletedAt)
      return {
        route: "none",
        message: `${authority} owns this task and no plan here stands for it. Change it where ${authority} keeps it.`,
        change,
      };
    if (!plan.spec)
      return {
        route: "plan",
        planId: plan.id,
        message:
          "Edit this plan's text in Plans and approve it; the tick applies the change.",
        change,
      };
    const spec = this.readSpec(plan.spec),
      tasks = spec.files["tasks.md"] ?? "",
      lines = tasks.split("\n"),
      item = specItems(plan.spec, tasks).find(
        (entry) =>
          entry.id === task.id || (task.specKey && entry.key === task.specKey),
      );
    const entry = item?.key
        ? (specFacts(spec.files).tasks[item.key] ?? {})
        : {},
      { title, ...fields } = change,
      before = item ? lines[item.line - 1].replace(/\r$/, "") : null;
    return {
      route: "spec",
      planId: plan.id,
      spec: plan.spec,
      folder: spec.folder,
      message:
        "Apply this change to the spec folder, then approve the plan. Only this task needs review again.",
      tasks: item && {
        line: item.line,
        before,
        after:
          title === undefined || title === item.title
            ? before
            : before.replace(
                /^(\s*[-*]\s+\[.\]\s+\S+\s+).*$/,
                (_, head) => head + title,
              ),
      },
      facts: item?.key
        ? { key: item.key, before: entry, after: { ...entry, ...fields } }
        : null,
      change,
    };
  }
  // The receipt of the plan's last approval, whose tasks.md item text the
  // current revision must keep for every approved ID.
  approvedSpec(plan) {
    const receipt = plan.approvalId
      ? this.store.get("approvals", plan.approvalId)
      : null;
    return receipt?.files ? receipt : null;
  }
  // The namespace, or none when the mode has no spec roots yet.
  safeSpecNamespace() {
    try {
      this.specRoots();
    } catch {
      return null;
    }
    return this.specNamespace();
  }
  lintSpecPlan(plan, retitled = [], { content = true } = {}) {
    const spec = { name: plan.spec, exists: true, files: plan.files || {} },
      declarations = specDeclarations(this.store.list("plans")),
      quality = lintSpec({
        spec,
        plan,
        data: {
          ...this.read(),
          repositories: this.store.list("repositories"),
        },
        approved: this.approvedSpec(plan),
        retitled,
        namespace: this.safeSpecNamespace(),
        declaredTasks: declarations.filter((task) => task.planId !== plan.id),
      });
    // A reverse edge (RC25.9): another spec's task lists this spec's task in
    // `unblocks`, so this task requires it. A private spec declares an edge
    // into a public one this way, and the public files never name it.
    // shortcut: the edge is read when this plan is linted; a private plan
    // created after the public one is approved needs a new public revision.
    for (const declaration of declarations)
      if (declaration.planId !== plan.id)
        for (const id of declaration.unblocks || []) {
          const proposal = quality.proposals?.find((entry) => entry.id === id);
          if (proposal && !(proposal.requires || []).includes(declaration.id))
            proposal.requires = [...(proposal.requires || []), declaration.id];
        }
    quality.declaredDependencies = declaredDependencies(
      plan,
      quality.proposals,
      declarations,
      this.read().tasks,
      this.store.list("plans"),
    );
    return content ? this.withContentDiagnostics(quality, spec) : quality;
  }
  // content.check (§4.9 `diff`): the pre-push hook's check. Each pushed
  // commit's added lines over the task's base; a match refuses (exit 1 in
  // the hook) and records the refusal, opening no decision.
  async contentCheck(input = {}) {
    const store = this.store,
      task = store.read().tasks.find((t) => t.id === input.taskId);
    if (!task) fail("Task not found.", 404);
    const worktree = store.get("task_worktrees", task.id),
      repository = store.get(
        "repositories",
        worktree?.repository || taskRepository(task),
      );
    if (!repository?.root)
      fail(`Task ${task.id} names no local checkout.`, 409);
    const heads = input.push
      ? pushedCommits(input.stdin).map((p) => p.local)
      : [input.head || "HEAD"];
    const checked = [];
    for (const head of heads) {
      gitRevision(head);
      enforceDiff(store, {
        repository: { ...repository, root: worktree?.path || repository.root },
        head,
        taskId: task.id,
        mode: "refuse",
      });
      checked.push(head);
    }
    return { ok: true, checked };
  }
  // `content.match` diagnostics (§4.9): what content rules would block.
  withContentDiagnostics(quality, spec) {
    const extra = specContentDiagnostics(this.store, spec);
    if (!extra.length) return quality;
    const diagnostics = [...quality.diagnostics, ...extra],
      counts = { error: 0, warning: 0, info: 0 };
    for (const item of diagnostics) counts[item.severity]++;
    return { ...quality, diagnostics, counts, canApprove: counts.error === 0 };
  }
  // The folder on disk beside the stored revision: its hash, and the critique
  // a planner session wrote for it.
  specOnDisk(plan) {
    const disk = this.readSpec(plan.spec);
    return {
      folder: disk.folder,
      exists: disk.exists,
      hash: disk.hash,
      changed: disk.hash !== plan.hash,
      critique: readCritique(disk.critique, plan.hash),
    };
  }
  detail(id) {
    const data = this.read(),
      requestedId = id;
    id = resolveTaskId(data, id);
    const task = data.tasks.find((t) => t.id === id);
    if (!task) fail("Task not found.", 404);
    const doc = data.documents[task.source?.document],
      evidenceRecords = this.store
        .list("evidence")
        .filter((e) => resolveTaskId(data, e.taskId) === id);
    return {
      ...task,
      // Its plan's epic; a task never stores one (Requirement 59.2).
      epic: taskEpic(data, task),
      ...(requestedId !== id ? { requestedId } : {}),
      context:
        task.approvedSource?.text ||
        (doc
          ? doc.text
              .split("\n")
              .slice(task.source.lineStart - 1, task.source.lineEnd)
              .join("\n")
          : ""),
      relationships: data.edges.filter((e) => e.from === id || e.to === id),
      documents: (task.contextDocuments || [])
        .map((id) => data.documents[id])
        .filter(Boolean),
      evidenceRecords,
      executionLocation: {
        branch: task.activity?.branch || task.integration?.branch || null,
        worktree: task.activity?.worktree || null,
      },
      codeChanges: taskCodeChanges(this.store, data, task, evidenceRecords),
    };
  }
  startExtractionPipeline(input) {
    const plan = this.store.get("plans", input.planId);
    if (!plan) fail("Plan not found.", 404);
    // A Kiro Crew planner session submits the rounds with
    // plan.extraction.submit; Avoozl starts no extraction agent.
    return createExtraction(this.store, {
      planId: plan.id,
      revisionHash: input.revisionHash || plan.hash,
      repositoryId: input.repositoryId || plan.context?.repositoryId || null,
      sequence: [],
      parentRunId: input.parentRunId || null,
    });
  }
  // The repository `.avoozl.json`. The app backend runs without a settings
  // watcher, so it writes through a RepositorySettings of its own.
  settingsFile() {
    if (this.configuration) return this.configuration;
    if (!this.workspaceRoot)
      fail("GitHub settings need a workspace root.", 404);
    return new RepositorySettings(this.store, {
      workspaceRoot: this.workspaceRoot,
    });
  }
  // The file's policy keys, the policy all layers produce, and the choices
  // each setting accepts.
  githubSettings() {
    let effective = null,
      error = null;
    try {
      effective = this.githubPolicy();
    } catch (failure) {
      error = failure.message;
    }
    return {
      ...this.settingsFile().readGitHubSettings(),
      effective,
      error,
      // The last GitHub rate-limit numbers, for Settings > GitHub.
      rate: {
        ...rateView(this.store, Date.now(), { countFile: countFilePath() }),
        cacheSeconds: this.cacheSeconds(),
        // The write pace and the projection that waits on it, if any.
        writes: {
          ...clampLimits(this.writeLimits()),
          run: runView(this.store),
        },
      },
      // Review roles from `delivery` in the same file, shown beside each
      // repository's pull-request review settings. Read only here.
      review: reviewSettings(readDeliveryPolicy(this.workspaceRoot)),
      choices: {
        modes: MODE_CHOICES,
        authorities: ["github", "local"],
        permissions: PERMISSIONS,
      },
    };
  }
  // The `.avoozl.json` GitHub policy, read on each use so an edit applies
  // without a restart. Invalid policy refuses the operation that needs it.
  githubPolicy() {
    return readGitHubPolicy(this.workspaceRoot);
  }
  // Runs `read` after the reply unless one under `key` is running; returns
  // true. A failed read leaves the last value, and the next request tries
  // again (backgroundReads).
  refreshLater(key, read) {
    if (!this.refreshing.has(key))
      this.refreshing.set(
        key,
        // After this reply is written: a read's first steps can block
        // (gh auth token runs once, synchronously).
        new Promise((resolve) => setImmediate(resolve))
          .then(read)
          .catch((error) =>
            console.error(`${key} refresh failed: ${error.message}`),
          )
          .finally(() => this.refreshing.delete(key)),
      );
    return true;
  }
  // github.writesPerMinute and github.writesPerHour; blank means the built-in
  // pace. Read like cacheSeconds, so an edit applies without a restart.
  writeLimits() {
    this.cacheSeconds();
    const policy = this.cachePolicy.policy;
    return {
      perMinute: policy?.writesPerMinute ?? undefined,
      perHour: policy?.writesPerHour ?? undefined,
    };
  }
  // github.cacheSeconds, one value for the workspace. The files are read at
  // most every five seconds; an unreadable file means the default.
  cacheSeconds() {
    const at = Date.now();
    if (!this.cachePolicy || at - this.cachePolicy.at > 5000)
      this.cachePolicy = {
        at,
        policy: readGitHubPolicyOrNull(this.workspaceRoot),
      };
    const policy = this.cachePolicy.policy;
    return policy?.cacheSeconds ?? DEFAULT_CACHE_SECONDS;
  }
  // The merge path of the named repository; none without a name.
  async mergePaths(only) {
    const policy = readGitHubPolicyOrNull(this.workspaceRoot);
    if (!only || !policy?.mode || !this.github?.available?.()) return [];
    return Promise.all(
      Object.entries(policy.repositories || {})
        .filter(([id]) => id === only)
        .map(([id, entry]) => mergePath(this.github, id, entry)),
    );
  }
  async reconcilePlanningPullRequests() {
    const receipts = this.store
      .list("receipts")
      .filter(
        (receipt) =>
          receipt.id.startsWith("planning-pr:") &&
          !["projected", "closed"].includes(receipt.state),
      );
    const result = [];
    for (const receipt of receipts) {
      await requirePrivateRepository(this.github, receipt.repository);
      const pull = await this.github.pullRequest(
        receipt.repository,
        receipt.number,
      );
      receipt.observedAt = new Date().toISOString();
      if (!pull.merged_at) {
        receipt.state = pull.state;
        this.store.put("receipts", receipt);
        result.push(receipt);
        continue;
      }
      receipt.state = "merged";
      receipt.mergedAt = pull.merged_at;
      receipt.mergeCommit = pull.merge_commit_sha;
      this.store.put("receipts", receipt);
      await syncWorkspaceRepository(this.store);
      const plan = this.store.get("plans", receipt.planId);
      if (!plan || plan.hash !== receipt.planHash || plan.state !== "approved")
        fail(
          "Merged planning revision did not hydrate as the approved design.",
          409,
        );
      this.store.put("receipts", receipt);
      result.push(receipt);
    }
    return { items: result };
  }
  intentResult(receipt) {
    const plan = receipt.planId
        ? this.store.get("plans", receipt.planId)
        : null,
      task = receipt.taskId
        ? this.read().tasks.find(
            (t) => t.id === resolveTaskId(this.read(), receipt.taskId),
          )
        : null;
    return {
      ...(plan ? { plan } : {}),
      ...(task ? { task } : {}),
    };
  }
  async submitIntent(input, expectedRevision) {
    if (
      typeof input.prompt !== "string" ||
      !input.prompt.trim() ||
      input.prompt.length > 20000
    )
      fail("Write a message.");
    const action = input.action || "task";
    if (!["task", "draft", "ask", "run"].includes(action))
      fail("Choose task, draft, ask or run.");
    const submissionId = input.submissionId || randomUUID(),
      id = "intent:" + submissionId,
      requestHash = digest(
        canonical({
          action,
          prompt: input.prompt,
          provider: input.provider,
          repositoryId: input.repositoryId,
          model: input.model,
          approvalMode: input.approvalMode,
          parentRunId: input.parentRunId,
        }),
      );
    let receipt = this.store.get("receipts", id);
    if (receipt && receipt.requestHash !== requestHash)
      fail(
        "This submission belongs to a different message. Start a new message.",
        409,
      );
    if (receipt) return this.intentResult(receipt);
    if (action === "ask" || action === "run")
      fail("Ask or run an agent in a Kiro Crew session.", 400);
    if (this.pendingIntents.has(id)) return this.pendingIntents.get(id);
    const execute = async () => {
      if (!receipt) {
        receipt = {
          id,
          submissionId,
          requestHash,
          input: structuredClone({ ...input, submissionId }),
          createdAt: new Date().toISOString(),
        };
        this.store.put("receipts", receipt);
      }
      const saved = receipt.input;
      if (action === "task") {
        const { task } = await this.execute(
          "task.capture",
          saved,
          expectedRevision,
        );
        receipt.taskId = task.id;
        this.store.put("receipts", receipt);
        return { task };
      }
      if (action === "draft") {
        const plan = createPlan(this.store, {
          ...saved,
          id: "plan-" + digest(submissionId).slice(0, 12),
        });
        receipt.planId = plan.id;
        this.store.put("receipts", receipt);
        return { plan };
      }
      fail("Choose task or draft.");
    };
    const pending = execute();
    this.pendingIntents.set(id, pending);
    try {
      return await pending;
    } finally {
      if (this.pendingIntents.get(id) === pending)
        this.pendingIntents.delete(id);
    }
  }
  // The one SQLite write path for the app backend, the stdio MCP server, the
  // tick cron (through that MCP server), and the CLI. Callers hold a store
  // only to open it, read it, or close it.
  // `context.caller` is the gateway-attested Kiro Crew session calling through
  // the app's stdio MCP server, and nothing else sets it (see mcp.mjs).
  // `context.person` is a person's own call: the page's owner session or a
  // CLI command outside any agent. Their GitHub posts go out as written.
  async execute(name, input = {}, expectedRevision, context = {}) {
    const actor = postingActor(name, context) ?? currentActor() ?? "unknown";
    const result = await asActor(actor, () =>
      withSource(sourceOfOperation(name), () =>
        this.perform(name, input, expectedRevision, context),
      ),
    );
    // One activity row for a listed local action (§4.19); never fails it.
    recordOperation(this.store, name, input, result, {
      context,
      operator: this.operator,
    });
    if (this.plansRoot) flushOutbox(this.store, this.plansRoot);
    return result;
  }
  // Create the first snapshot of a new workspace database.
  initialize(snapshot) {
    this.store.initialize(snapshot);
  }
  async perform(name, input = {}, expectedRevision, context = {}) {
    const store = this.store;
    // A person-only operation is refused for any MCP call, under any tool
    // name (mcp-policy.mjs, R56.2).
    if (context.caller || context.mcp) {
      const refusal = mcpRefusal(name, input);
      if (refusal) fail(refusal, 403);
    }
    // CLI/MCP spec operations must not depend on a prior app tick. This is
    // read-only, and refreshPrivateSpecs does nothing outside a GitHub mirror.
    // plan.list reads stored plans only. Reads may use the list checked within
    // the cache window; a change re-reads the branch.
    if (name.startsWith("plan.") && name !== "plan.list")
      await this.refreshPrivateSpecs({
        cached: classifyOperation(name) === "observe",
      });
    // Rules plugins' sets live in memory (§4.9); reload them when stale so a
    // boundary in this process never checks with sets it has not loaded.
    if (this.workspaceRoot && rulePluginsStale(store))
      await loadRulePlugins(store, this.plugins);

    if (
      [
        "task.update",
        "activity",
        "task.accept",
        "task.archive",
        "task.unarchive",
        "task.sessions",
      ].includes(name)
    )
      input = { ...input, id: resolveTaskId(this.read(), input.id) };

    if (input.taskId)
      input = { ...input, taskId: resolveTaskId(this.read(), input.taskId) };

    if (DIRECT_TASK_EDITS.has(name) && store.initialized())
      refuseGitHubAuthority(this.read(), name, input);

    if (
      [
        "flow.settings.update",
        "flow.instructions.update",
        "flow.retro.decide",
        "flow.retro.start",
        "flow.retro.again",
      ].includes(name) &&
      (context.caller || context.mcp)
    )
      fail(
        "Only a person changes flow settings and decides retro proposals, in the Avoozl page.",
        403,
      );

    if (
      [
        "driver.settings.update",
        "driver.handoff",
        "driver.takeover",
        "driver.forceTakeover",
        "driver.away.decide",
      ].includes(name) &&
      (context.caller || context.mcp || context.plugin)
    )
      fail(
        "Only a person hands off, takes over or changes this computer's driver settings, in the Avoozl page or CLI.",
        403,
      );
    // Plan this and Deliver this (R50.15), and source settings: a person's.
    if (
      [
        "intake.deliver",
        "intake.plan",
        "intake.confirm",
        "intake.source.add",
        "intake.source.remove",
      ].includes(name) &&
      (context.caller || context.mcp)
    )
      fail(
        name.startsWith("intake.source")
          ? "Only a person changes intake sources, in Settings or the CLI."
          : "Only a person starts work from an incoming item, in the Intake tab or the CLI.",
        403,
      );
    const operation = OPERATIONS.get(name);
    if (!operation) fail("Unknown operation " + name, 404);
    return operation.handler.call(this, {
      name,
      input,
      expectedRevision,
      context,
    });
  }
}
