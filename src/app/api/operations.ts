// @ts-nocheck: typing debt
import { frontMatter } from "../../front-matter.ts";
import { digest } from "../../model.ts";
import { resolveTaskId } from "../../task-identity.ts";
import { taskAuthority, taskRepository } from "../../work-model.ts";
import { recordActivity, recordOperation } from "../store/activity-log.ts";
import { statusComplete } from "../../query.ts";
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
} from "../content/content-rules.ts";
import {
  declaredDependencies,
  specDeclarations,
} from "../specs/cross-spec-dependencies.ts";
import { reviewRoles as deliveryReviewRoles } from "../delivery/delivery.ts";
import { claimedTaskIds, refreshClaims } from "../workers/claims.ts";
import {
  publishApproved,
  queuePublish,
  readSpecIssues,
} from "../specs/spec-publication.ts";
import { planningIdentity } from "../github/github-marker.ts";
import { linkedReader, storedLinks } from "../specs/order.ts";
import { taskEpic } from "../epics/epics.ts";
import {
  currentBranchSync,
  originRepositorySync,
  withWorkLock,
} from "../git/git.ts";
import { clampLimits, runView } from "../github/github-pacer.ts";
import {
  MODE_CHOICES,
  PERMISSIONS,
  readGitHubPolicy,
  readGitHubPolicyOrNull,
} from "../github/github-policy.ts";
import { asActor, currentActor } from "../github/github-posted.ts";
import {
  countFilePath,
  rateView,
  sourceOfOperation,
  withSource,
} from "../github/github-rate.ts";
import {
  DEFAULT_CACHE_SECONDS,
  GitHubClient,
  defaultGitHubClient,
  personOf,
  requirePrivateRepository,
} from "../github/github.ts";
import { sourceMap } from "../intake/intake.ts";
import { loadLayeredConfig } from "../settings/layered-config.ts";
import { telemetryHandle } from "../telemetry/index.ts";
import { mcpRefusal } from "../mcp/mcp-policy.ts";
import { queueNotifications } from "../tick/notifications.ts";
import {
  DIRECT_TASK_EDITS,
  refuseGitHubAuthority,
  retitledInput,
  reviewSettings,
  taskCodeChanges,
} from "./operation-support.ts";
import { OPERATIONS } from "./operation-table.ts";
import { flushOutbox } from "../store/outbox.ts";
import { processGrants, withJob } from "../github/github-jobs.ts";
import {
  credentialsNeedsYou,
  machineCredentials,
  pickCredentials,
  recordCredentialEvents,
  recordNoPerson,
} from "../github/github-credentials.ts";
import { approvePlan } from "../specs/spec-approval.ts";
import { SUPPORTED_CONTRACTS } from "../plugins/plugin-contract.ts";
import { pluginHealth } from "../plugins/plugin-session.ts";
import {
  addGitPlugin,
  addPlugin,
  approvePlugin,
  disablePlugin,
  inspectPlugins,
  pluginHost,
  pluginSettingsPath,
  readPluginSettings,
  previewPlugin,
  removePlugin,
  updateGitPlugin,
} from "../plugins/plugins.ts";
import {
  checkPluginUpdates,
  remoteHost,
  setUpdateChecks,
  updateChecksOn,
  updateFor,
} from "../plugins/plugin-updates.ts";
import { pluginChecksView } from "../plugins/plugin-checks.ts";
import { contextView } from "../context/plugin-context.ts";
import { contextChip, taskContext } from "../context/context-record.ts";
import { taskPluginChecks } from "../plugins/check-stages.ts";
import { RepositorySettings } from "../settings/repository-settings.ts";
import {
  approvalBase,
  approvalCommits,
  approverCheck,
  evidenceCache,
  commitApproval,
  gitAuthor,
  gitTop,
} from "../git/git-approvals.ts";
import { specsBranch, specsBranchSetting } from "../specs/specs-branch.ts";
import {
  createSpecPlan,
  findSpecFolder,
  lintSpec,
  listSpecFolders,
  readCritique,
  readSpecFolder,
  revisionFiles,
  saveSpecPlan,
  specFacts,
  specItems,
  specModifiedAt,
  specName,
  specRoots,
  specTitle,
} from "../specs/spec-plans.ts";
import {
  applyTicks,
  baseHead,
  baseTasks,
  tickCommits,
  tickOpenGroups,
} from "../specs/spec-ticks.ts";
import { canonical, fail, type Store } from "../store/store.ts";
import { WORKSPACE_LOCK, readDeliveryPolicy } from "../tick/tick.ts";
import { syncWorkspaceRepository } from "../workspace/workspace-repository.ts";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { specTasks, taskFile } from "../specs/spec-tasks.ts";

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

// Who is calling an operation (the dispatcher reads it, never the caller's
// input): an attested Kiro Crew session, any MCP transport, or the person at
// the command line or on the page.
export interface OperationContext {
  caller?: { sessionKey: string } | null;
  mcp?: boolean;
  local?: boolean;
  person?: boolean;
  [key: string]: unknown;
}

// What a handler gets besides the Operations instance as `this`.
export interface OperationCall {
  name: string;
  input: Record<string, unknown>;
  expectedRevision?: number;
  context: OperationContext;
}

export interface OperationsOptions {
  operator?: string;
  github?: unknown;
  configuration?: { workspaceRoot?: string; [key: string]: unknown } | null;
  workspaceRoot?: string | null;
  plansRoot?: string | null;
  repositoryBindingGuard?: unknown;
  notifier?: unknown;
  sessionStopper?: unknown;
  kirocrewAbsent?: boolean;
  pluginSettingsFile?: string;
  plugins?: unknown;
  configDirectory?: string | null;
  shippedPrompts?: unknown;
  backgroundReads?: boolean;
}

export class Operations {
  // shortcut: only the fields typed callers read are declared; the rest of
  // this class is still typing debt.
  store: Store;
  operator: string;
  workspaceRoot: string | null;
  plansRoot: string | null;
  configDirectory: string | null;
  // The served workspace's settings watcher, when there is one.
  configuration: RepositorySettings | null;
  github: GitHubClient;
  pluginOptions: { workspaceRoot: string | null; settingsFile: string };
  // The plugin loader (plugins.ts).
  plugins: unknown;
  constructor(
    store: Store,
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
      pluginSettingsFile = pluginSettingsPath(),
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
    }: OperationsOptions = {},
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
    // Provenance for records this workspace mints; never an authorization.
    this.operator = operator || "";
    // Every GitHub text write passes content rules first (§4.9).
    const client =
      github ||
      defaultGitHubClient({
        credentials: machineCredentials({ settingsFile: pluginSettingsFile }),
      });
    // A person's Allows for high-risk GitHub steps (plugin-credentials §D7),
    // in this process's memory only.
    this.grants = processGrants;
    // Conditional reads and the rate-limit pause live in this workspace.
    if (client instanceof GitHubClient) {
      client.bind(store, {
        cacheSeconds: () => this.cacheSeconds(),
        countFile: countFilePath(),
        writeLimits: () => this.writeLimits(),
      });
      // Failures raise Needs you rows; each new token gets an Activity row.
      recordCredentialEvents(store, client.credentials);
      client.onNoPerson = (provider, owner) =>
        recordNoPerson(store, { provider, owner });
    }
    this.githubClient = client;
    this.github = guardGitHub(client, store);
    this.configuration = configuration;
    this.workspaceRoot = workspaceRoot;
    // Given a plans root, every operation publishes its pending Markdown
    // projections before it returns, so no caller writes the outbox itself.
    this.plansRoot = plansRoot;
    this.tickPolicy = {};
    this.configDirectory = configDirectory;
    this.repositoryBindingGuard = repositoryBindingGuard;
    this.pendingIntents = new Map();
    // Content rules (§4.9) read this workspace's `.avoozl.json` and terms.
    if (workspaceRoot)
      bindContentRules(store, {
        workspaceRoot,
        pluginSettingsFile,
      });
  }
  read() {
    return this.store.read();
  }
  // Settings' plugin list and actions (§4.8, R34.9). Approval is a person's
  // act in Settings or the CLI: an agent session cannot approve a plugin,
  // and no MCP tool offers it.
  async pluginOperation(name, input, context) {
    const options = this.pluginOptions;
    if (!options.workspaceRoot) fail("Plugins need a workspace root.", 409);
    if (name === "plugins.list") {
      const health = pluginHealth(this.store),
        plugins = inspectPlugins(options).map(({ manifest, entry, ...p }) => ({
          ...p,
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
          // The newest update check's result (R34.17), or null.
          update: entry ? updateFor(this.store, { ...p, entry }) : null,
          // A checks plugin's checks, prompts and servers (plugin-checks
          // PK7.2), shown before approval too.
          ...(manifest?.checks
            ? {
                checks: pluginChecksView(
                  this.store,
                  { ...p, manifest },
                  options,
                ),
              }
            : {}),
          // A context part's repositories, skills, reads, asks and servers,
          // shown before approval too (epic-context EC4.1).
          ...(p.context
            ? {
                context: contextView(
                  p,
                  readPluginSettings(options.settingsFile),
                ),
              }
            : {}),
        }));
      return {
        supportedContracts: SUPPORTED_CONTRACTS,
        plugins,
        // Which credentials plugin serves a host where two claim one owner.
        credentialsPick:
          readPluginSettings(options.settingsFile).credentialsPick ?? {},
        updateChecks: { enabled: updateChecksOn(options.settingsFile) },
      };
    }
    if (context.caller)
      fail("Only a person changes plugins, in Settings or the CLI.", 403);
    const strip = (plugin) => {
      if (!plugin) return plugin;
      const { manifest, entry, ...rest } = plugin;
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
    if (name === "plugin.credentials.pick")
      return pickCredentials(options, input);
    // Check now (R34.17): the check itself, for one plugin or all. It
    // fetches nothing; Update stays the person's next step.
    if (name === "plugin.updates.check")
      return checkPluginUpdates(this.store, options, {
        ids: input?.id ? [String(input.id)] : null,
        force: true,
        countGit: this.countPluginGit(),
      });
    if (name === "plugin.updates.configure")
      return setUpdateChecks(options.settingsFile, input?.enabled);
    fail("Unknown operation " + name, 404);
  }
  // A plugin update check's ls-remote to the GitHub git host counts under
  // git in Settings › GitHub, like Avoozl's own fetches.
  countPluginGit() {
    const client = this.githubClient,
      host = client?.gitUrl ? remoteHost(client.gitUrl) : null;
    return (remote) => {
      if (!host || remoteHost(remote) !== host) return;
      client.countGit();
      client.rate?.flush();
    };
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
  // A tick on a spec's base branch completes its task (spec-ticks.mjs). Read
  // again only when the branch head or the approved revision moved.
  // With `land`, a task that is done and ticked on the branch, and has no
  // landing yet, lands at the commit that ticked it (adopting a repository).
  async applyBaseTicks({ land = false } = {}) {
    this.ticksSeen ??= new Map();
    this.ticksFetched = new Set();
    for (const plan of this.store.list("plans")) {
      if (
        !plan.spec ||
        plan.deletedAt ||
        !Object.keys(plan.mapping ?? {}).length
      )
        continue;
      try {
        const spec = this.readSpec(plan.spec);
        if (!spec.exists || !spec.root) continue;
        const branch = specsBranch(this.store, this.workspaceRoot, spec.root),
          read = await baseTasks(spec.root, branch, plan.spec, {
            fetched: this.ticksFetched,
            files: plan.files,
          });
        if (!read?.text) continue;
        const seen = `${read.head}:${plan.approvalId}`;
        if (read.head && this.ticksSeen.get(plan.id) === seen) continue;
        await applyTicks(this.store, plan, {
          ...read,
          branch,
          land,
          commits: () =>
            tickCommits(spec.root, read.head, plan.spec, plan.files),
        });
        await tickOpenGroups(spec.root, {
          branch,
          spec: plan.spec,
          files: plan.files,
          text: read.text,
          commitPrefix: this.store
            .list("repositories")
            .find((repository) => repository.root === spec.root)?.commitPrefix,
        }).catch(() => {
          // Refused or raced: tried again when the branch head moves.
        });
        this.ticksSeen.set(plan.id, seen);
      } catch {
        // Read again on the next tick.
      }
    }
  }
  // Every spec folder the mode reads, each with its root. specList and
  // graph.view read it. With `specs.branch` set, a checkout on another
  // branch is named in `errors`: its folders are not the specs Avoozl
  // approves and ticks.
  specHomes() {
    const roots = this.specRoots(),
      wanted = specsBranchSetting(this.workspaceRoot),
      errors = [];
    for (const root of roots) {
      const branch = wanted && currentBranchSync(root);
      if (branch && branch !== wanted)
        errors.push(
          `Specs live on ${wanted}, but ${root} has ${branch} checked out. Check out ${wanted} there.`,
        );
    }
    return {
      roots,
      errors,
      homes: [
        ...roots.flatMap((root) =>
          listSpecFolders(root).map((name) => ({
            root,
            spec: { ...readSpecFolder(root, name), root },
          })),
        ),
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
      { roots, homes, errors: homeErrors } = this.specHomes(),
      declarations = specDeclarations(plans),
      // Specs on disk, so each spec group reaches into what it links.
      linked = linkedReader(
        homes.map(({ spec }) => ({
          name: spec.name,
          text: specTasks(spec.files ?? {})?.text ?? "",
        })),
      );
    return {
      root: roots[0],
      roots,
      items: homes.map(({ root, spec: disk }) => {
        const name = disk.name,
          plan = plans.find((entry) => entry.spec === name) || null,
          quality = this.withContentDiagnostics(
            lintSpec({
              spec: { ...disk, linked },
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
  // Store a spec folder as a draft plan: `plan.create` with a spec. It
  // approves nothing.
  createSpecDraft(input, context = {}) {
    const store = this.store,
      spec = this.readSpec(input.spec);
    if (spec.exists && (context.caller || context.mcp))
      enforceSpec(store, spec, { mode: "refuse" });
    return createSpecPlan(store, input, spec);
  }
  // A folder on disk by name.
  readSpec(name) {
    return findSpecFolder(this.specRoots(), specName(name));
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
  // The person a commit names: the signed-in GitHub login when GitHub is in
  // play, cached for this workspace, else the operator.
  async personLogin() {
    if (
      readGitHubPolicyOrNull(this.workspaceRoot)?.mode &&
      this.github?.available?.()
    ) {
      if (!this.approverLogin)
        try {
          this.approverLogin = (await personOf(this.github)) || null;
        } catch {}
      if (this.approverLogin) return this.approverLogin;
    }
    return this.operator;
  }
  // Every check an approval makes before it writes, shared by plan.approve
  // and the approvals the tick reads from git (adoptApprovals). Throws on
  // the first failure.
  approvalChecks(input) {
    const plan = this.store.get("plans", input.id);
    if (!plan) fail("Plan not found.", 404);
    if (!plan.spec) fail("Only a spec folder is approved.", 409);
    if (plan.hash !== input.expectedHash)
      fail("The reviewed document hash changed.", 409);
    // Approval is of the stored revision, and only while the folder on
    // disk still matches it.
    if (this.readSpec(plan.spec).hash !== plan.hash)
      fail("The spec folder changed on disk. Reload it before approving.", 409);
    // Every spec file and the manifest at the approved hash (§4.9): a
    // match refuses approval and opens a decision; an allowance for the
    // exact content passes once.
    {
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
    const specQuality = this.lintSpecPlan(plan, retitledInput(input.retitled), {
        content: false,
      }),
      proposals = specQuality.proposals,
      quality = specQuality;
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
      specQuality,
      proposals,
      quality,
    };
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
  // the work tree that holds its folder. Null for a folder outside git.
  // shortcut: a spec folder outside git keeps only the database receipt and
  // is not rebuilt; require git once every workspace is a checkout.
  async approvalCheckout(plan) {
    if (!plan?.spec) return null;
    let spec;
    try {
      spec = this.readSpec(plan.spec);
    } catch {
      return null;
    }
    if (!spec?.exists || !spec.root) return null;
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
        ([id]) => id.toLowerCase() === name.toLowerCase(),
      )?.[1] ?? { allowedActors: [], minimumPermission: "write" };
    return approverCheck({
      repository: entry,
      github: this.github,
      repositoryName: name,
      trust: entry.approvalTrust ?? "github",
      cache: evidenceCache(this.workspaceRoot),
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
      const base = await approvalBase(root, {
          branch: specsBranchSetting(this.workspaceRoot),
        }),
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
            { branch: specsBranchSetting(this.workspaceRoot) },
          )
        : null;
      if (made && login)
        evidenceCache(this.workspaceRoot).set(made.commit, {
          mergedBy: null,
          signer: null,
          pushedBy: login,
        });
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
  // Send what the OTLP exporter has queued, for a process about to end.
  async flushTelemetry() {
    await telemetryHandle(this.store)?.flush();
  }
  async rebuild() {
    if (this.store.list("plans").length)
      fail(
        "Rebuild starts from an empty database. Move workspace.sqlite aside, then run it again.",
        409,
      );
    const result = await this.readFromGit();
    // Claims come back from the claim branches on origin (simplify §D3).
    const claimErrors = await refreshClaims(this.store, this.github),
      issues = await readSpecIssues(this.store, this.github);
    return {
      ...result,
      claims: [...claimedTaskIds(this.store)],
      specIssues: issues.found,
      ...(claimErrors.length || issues.errors.length
        ? { githubErrors: [...claimErrors, ...issues.errors] }
        : {}),
    };
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
            approvalCommit: match.commit,
            evidence: `Approval commit ${match.commit} by ${match.email}${match.evidence ? `, ${match.evidence}` : ""}.`,
            operator: this.operator,
            githubPolicy: this.githubPolicy(),
            proposals,
            baseline: true,
            declaredDependencies: specQuality.declaredDependencies,
          });
          approved.push(id);
          left.delete(id);
          moved = true;
        } catch {}
      }
    }
    return approved;
  }
  // Approve each spec of `group` ({plan, disk}) that an approver committed
  // with exactly its current text: `commits` are approvalCommits entries.
  // One commit may approve any number of specs (an epic's pull request);
  // their order comes from their $after links (adoptApprovals). Each one
  // approved gets an Activity row naming the commit and `branch`.
  adoptCommitted(group, commits, branch) {
    const store = this.store,
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
      queuePublish(store, id, match.commit);
      recordActivity(store, {
        source: "tick",
        actor: match.email,
        kind: "plan.approved",
        summary: `${match.spec} approved by ${match.email} in commit ${match.commit.slice(0, 12)} on ${branch}`,
        targetId: id,
        key: `approved:${id}:${match.commit}`,
      });
    }
  }
  // Each live spec plan whose text has no approval, as {plan, disk}, grouped
  // by `homeOf(plan)` (a key, or null to skip the plan).
  async unapprovedSpecs(homeOf) {
    const approved = new Set(
        this.store.list("approvals").map((a) => `${a.planId}:${a.hash}`),
      ),
      groups = new Map();
    for (const plan of this.store.list("plans")) {
      if (!plan.spec || plan.deletedAt || plan.archivedAt) continue;
      try {
        const disk = this.readSpec(plan.spec).hash;
        if (disk === plan.hash && approved.has(`${plan.id}:${disk}`)) continue;
        const home = await homeOf(plan);
        if (!home) continue;
        if (!groups.has(home)) groups.set(home, []);
        groups.get(home).push({ plan, disk });
      } catch {}
    }
    return groups;
  }
  // Approvals that reach main with no click (§4.42): a spec pull request an
  // approver authored, merged on GitHub, or a push. On a tick, each checkout's
  // base branch is read as `applyBaseTicks` fetched it; when it moved, or a
  // spec's text did, the rebuild reader runs over the specs whose text on
  // disk has no approval. A spec an approver committed with exactly that
  // text is approved as that commit's author. Writes nothing to git.
  // shortcut: a spec folder with no plan waits for import.
  async applyMainApprovals() {
    this.approvalsSeen ??= new Map();
    this.mainApprovers ??= new Map();
    const roots = await this.unapprovedSpecs((plan) =>
        this.approvalCheckout(plan),
      ),
      store = this.store;
    for (const [root, group] of roots)
      try {
        const branch = specsBranch(store, this.workspaceRoot, root),
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
        });
        this.adoptCommitted(group, commits, branch);
        this.approvalsSeen.set(root, seen);
      } catch {
        // Read again on the next tick.
      }
  }
  // Publish the spec issue of each approval this workspace adopted or made
  // (workflow v1 rule 8.1), in the GitHub repository that holds the spec.
  // Returns the GitHub errors; a failed spec is tried again next tick.
  async publishApproved() {
    return publishApproved(this.store, {
      github: this.github,
      identity: () => planningIdentity(this.workspaceRoot),
      evidence: {
        get: (commit) => evidenceCache(this.workspaceRoot).get(commit),
      },
      homeOf: async (plan) => {
        const root = await this.approvalCheckout(plan);
        return root ? originRepositorySync(root) : null;
      },
    });
  }
  // The one reader behind `avoozl rebuild`: the same steps over the
  // named specs, with `allowed` (an approverCheck) in place of the
  // repository's own approvers list and `root` limiting landings and retros
  // to one checkout. A spec that already has a plan is left alone.
  async readFromGit({ names: only = null, allowed: given = null } = {}) {
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
        const base = await approvalBase(root, {
          branch: specsBranchSetting(this.workspaceRoot),
        }).catch(() => null);
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
    return {
      plans: names.length,
      approved,
      drafts: names.filter((name) => !approved.includes(name)),
      // The adopted specs' tasks that came in done (statusComplete takes a status id).
      done: ((data) =>
        data.tasks
          .filter(
            (task) =>
              names.includes(task.planId) && statusComplete(data, task.status),
          )
          .map((task) => task.id))(store.read()),
    };
  }
  // One spec folder's documents for the Plans tab to read. readSpecFolder
  // reads only regular files inside a planning root, so a symlink out of it
  // reads as missing, and specName refuses a name with a path in it.
  readSpecDocuments({ name } = {}) {
    const spec = this.readSpec(name);
    if (!spec.exists) fail(`No spec folder ${spec.folder}.`, 404);
    const documents = {};
    for (const file of revisionFiles(spec.files))
      if (typeof spec.files[file] === "string")
        documents[file] = spec.files[file];
    return {
      name: spec.name,
      folder: spec.folder,
      hash: spec.hash,
      documents,
      tasksFile: taskFile(spec.files),
    };
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
      tasks = specTasks(spec.files)?.text ?? "",
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
  // The receipt of the plan's last approval, whose task item text the
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
  // The stored specs, with `current` read as given, so a spec group reaches
  // into the spec it links (§D19.2).
  linkedSpecs(
    current: { name?: string; files?: Record<string, string> } | null = null,
  ) {
    return storedLinks(this.store, current);
  }
  lintSpecPlan(plan, retitled = [], { content = true } = {}) {
    const files = plan.files || {},
      spec = {
        name: plan.spec,
        exists: true,
        files,
        linked: this.linkedSpecs({ name: plan.spec, files }),
      },
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
      // Its plugin checks and decide answers (plugin-checks PK8.2).
      pluginChecks: taskPluginChecks(this.store, id),
      // The three tests and what epic context gave its last session: names
      // only, never a path's contents (epic-context EC9.5).
      epicContext: taskContext(this.store, id)
        ? { ...taskContext(this.store, id), chip: contextChip(this.store, id) }
        : null,
      executionLocation: {
        branch: task.activity?.branch || task.integration?.branch || null,
        worktree: task.activity?.worktree || null,
      },
      codeChanges: taskCodeChanges(this.store, data, task, evidenceRecords),
    };
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
        // Who signs Avoozl in, per host and owner group (plugin-credentials
        // §D11), never the token.
        signIns:
          this.githubClient instanceof GitHubClient
            ? (this.githubClient.credentials.signIns?.() ?? [])
            : [],
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
    if (!["task", "ask", "run"].includes(action))
      fail("Choose task, ask or run.");
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
      fail("Choose task.");
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
  // The result's shape depends on the operation: a typed caller names it.
  async execute<T = unknown>(
    name: string,
    input: Record<string, unknown> = {},
    expectedRevision?: number,
    context: OperationContext = {},
  ): Promise<T> {
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
      ["flow.settings.update"].includes(name) &&
      (context.caller || context.mcp)
    )
      fail("Only a person changes flow settings, in the Avoozl page.", 403);

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
    // Every GitHub call runs inside the entry's job (plugin-credentials §D6).
    // A person's confirmed apply carries the grants its Allow made; the
    // page sends their ids, and only a person reaches github.job.confirm.
    const grants =
      Array.isArray(input?.allow) && !context.caller && !context.mcp
        ? this.grants.get(input.allow)
        : [];
    return withJob(
      operation.github ?? null,
      () =>
        operation.handler.call(this, {
          name,
          input,
          expectedRevision,
          context,
        }),
      grants,
    );
  }
}
