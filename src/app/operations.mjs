import { allowProtectedPaths } from "./verify.mjs";
import {
  ciSettingsView,
  ciFlowView,
  ciRepositoryPickerIds,
} from "./flow-ci-view.mjs";
import { readEffectiveCIConfig } from "./flow-ci.mjs";
import { currentPlanReview } from "./plan-review-tools.mjs";
import { chatModel, roleHarness, validatePlanReview } from "./chat-models.mjs";
import { listHarnessDefinitions } from "./harness-definitions.mjs";
import { completePlanReviewWriter } from "./plan-review-authorship.mjs";
import { sessionStartHold } from "./session-request-eligibility.mjs";
import {
  takeKirocrewRequest,
  releaseKirocrewRequest,
  completeKirocrewRequest,
  kirocrewConsumer,
} from "./executors/kirocrew.mjs";
import { approvedSpecDependency } from "../spec-dependencies.mjs";
import { approvalBatches, approveMany } from "./approval-batches.mjs";
import {
  approvalDelegation,
  delegationEvidence,
  grantDelegate,
  listDelegates,
  revokeDelegate,
} from "./approval-delegation.mjs";
import { planReviewSummary } from "./plan-review-summary.mjs";
import { addItemContext } from "./needs-you-context.mjs";
import {
  requestTaskSummary,
  submitTaskSummary,
  summaryFacts,
  taskSummaryView,
} from "./task-summary.mjs";
import {
  specDeclarations,
  declaredDependencies,
} from "./cross-spec-dependencies.mjs";
import { parseIssueReference } from "./issue-reference.mjs";
import { RepoFiles } from "./repo-files.mjs";
import { crossPlanEpics, epicOfPlan, taskEpic } from "./epics.mjs";
import path from "node:path";
import { applicationRoot } from "./config.mjs";
import { mcpRefusal } from "./mcp-policy.mjs";
import { taskDiff, taskFiles } from "./task-files.mjs";
import {
  bindDriver,
  decideAway,
  driverContext,
  driverStatus,
  forceTakeOver,
  handOffDriver,
  takeOver,
  takeoverPreview,
  updateMachineSettings,
} from "./driver.mjs";
import {
  resolveTaskId,
  requireDistinctTask,
  taskSourceRefs,
} from "../task-identity.mjs";
import {
  COMPLETIONS,
  pluginId,
  taskAuthority,
  taskKind,
  taskRepository,
  taskRoute,
} from "../work-model.mjs";
import {
  duplicateAudit,
  duplicateCandidates,
  mergeTasks,
} from "./task-dedup.mjs";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import {
  blocks,
  digest,
  matchSection,
  planOwned,
  queryTasks,
  reviewSettled,
  statusComplete,
  validate,
} from "../model.mjs";
import { captureTask } from "../capture.mjs";
import { applyActivity } from "../activity.mjs";
import { applyPlanMetadata, planSummaries } from "../plan-model.mjs";
import { auditPlans, dispatchMcp } from "../mcp.mjs";
import { fail, canonical } from "./store.mjs";
import { planPage, recentIntegrations } from "./views.mjs";
import {
  createPlan,
  savePlan,
  proposeWork,
  approvePlan,
  baselineItems,
  extractPlan,
} from "./plans.mjs";
import {
  projectConfig,
  originRepositorySync,
  projectGitHubRepository,
  integrateRun,
  withWorkLock,
  detectCheckout,
  git,
} from "./git.mjs";
import { workspaceIdentity } from "./identity.mjs";
import { taskSignals, isPlanInventory } from "../workbench-model.mjs";
import { listExamples, seedExample } from "./examples.mjs";
import { describeWorkspace } from "./client.mjs";
import {
  DEFAULT_CACHE_SECONDS,
  defaultGitHubClient,
  GitHubClient,
  parseRepository,
  requirePrivateRepository,
} from "./github.mjs";
import {
  configureGitHubRepository,
  machineIdentity,
  prepareGitHubRepository,
  syncGitHubIssues,
} from "./github-sync.mjs";
import {
  parseMarker,
  planningIdentity,
  requireNamespace,
} from "./github-marker.mjs";
import {
  claimsFresh,
  claimsView,
  RADAR_INTERVAL_MS,
  refreshClaims,
} from "./radar-claims.mjs";
import { mergePath, requireMergePath } from "./radar-merge-path.mjs";
import { instanceIdentity } from "./instance.mjs";
import { mirrorEntryKey, mirrorGit, mirrorSetup } from "./mirror-setup.mjs";
import { radarSetup } from "./radar-setup.mjs";
import { radarReread, radarValues } from "./radar-values.mjs";
import {
  armedPullRequests,
  disarmPullRequest,
  mergeMethodNeedsYou,
} from "./radar-arm.mjs";
import { approvalNeedsYou, releaseClaims } from "./approval-label.mjs";
import {
  crewLabelBackfill,
  crewLabelNeedsYou,
} from "./crew-label-backfill.mjs";
import { formatGapTable, gapProposals, parseGapReport } from "./gap-report.mjs";
import {
  integrationView,
  landBranch,
  landingNeedsYou,
} from "./integration-head.mjs";
import { releaseQueue, releaseStep } from "./radar-coder-queue.mjs";
import { landingView } from "./landing-view.mjs";
import { epicsView } from "./epics-view.mjs";
import {
  landingQueueView,
  landingWaitNeedsYou,
} from "./landing-queue-view.mjs";
import {
  checkIntegrationBranch,
  requireIntegrationBranch,
} from "./integration-branch.mjs";
import {
  checkConflictFix,
  conflictFixNeedsYou,
  decideConflictFix,
  reportConflictFix,
} from "./radar-conflict-fix.mjs";
import {
  countFilePath,
  rateNeedsYou,
  rateView,
  sourceOfOperation,
  withSource,
} from "./github-rate.mjs";
import { syncNeedsYou } from "./integration-sync.mjs";
import { namespaceOf, planThisRequest } from "./radar-plan-me.mjs";
import {
  CREW_LABEL_KEYS,
  FIELD_KEYS,
  CREW_LABEL_DEFAULTS,
  MANAGED_LABEL_KEYS,
  MODE_CHOICES,
  newTaskAuthority,
  normalizeGitHubPolicy,
  PERMISSIONS,
  actorAllowed,
  ISSUE_RADAR_PATH,
  policySection,
  readGitHubPolicy,
  readGitHubPolicyOrNull,
  requireDefaultBranches,
  RULE_ACTIONS,
  STATUS_VALUE_KEYS,
} from "./github-policy.mjs";
import {
  requireMirrorsPrivate,
  requirePlansBranches,
} from "./mirror-policy.mjs";
import { classifyOperation } from "./operation-kinds.mjs";
import {
  mergeHomes,
  mirrorOf,
  privateDependencies,
  readPrivateSpecs,
  locateLocalSpec,
} from "./spec-homes.mjs";
import {
  mirrorNeedsYou,
  refuseSourceAsExecution,
  writeRepo,
} from "./mirror-sync.mjs";
import { forwardAuditRows } from "./forward-audit.mjs";
import {
  publicCrewAuditRows,
  publicRepositories,
  stopPublicCrews,
} from "./public-crews.mjs";
import { publicCrewsView, signOff } from "./public-signoff.mjs";
import { publicBranchRows } from "./mirror-forward-batch.mjs";
import { mirrorForwardRows } from "./mirror-forward.mjs";
import { forwardRecord } from "./mirror-forward-run.mjs";
import { syncProject } from "./github-project.mjs";
import { cancelSetup, githubSetup } from "./github-setup.mjs";
import {
  archiveEnded,
  archiveTask,
  deletePlan,
  deletePreview,
  specFolderState,
} from "./plan-retire.mjs";
import { archivePlan, unarchivePlan } from "./plan-archive.mjs";
import {
  conversationSettings,
  RepositorySettings,
} from "./repository-settings.mjs";
import {
  projectPlanIssues,
  resolveProjectionConflict,
} from "./github-projection.mjs";
import { rebuildFromGitHub } from "./github-rebuild.mjs";
import { cancelSubmission, resubmit } from "./routes.mjs";
import {
  addGitPlugin,
  addPlugin,
  approvePlugin,
  disablePlugin,
  approvedTemplates,
  inspectPlugins,
  pickTemplate,
  pluginHost,
  importPluginPack,
  previewPlugin,
  previewPluginPack,
  pluginSettingsPath,
  removePlugin,
  repositoryPacks,
  updateGitPlugin,
} from "./plugins.mjs";
import { pluginHealth } from "./plugin-session.mjs";
import { queueSessionSend } from "./session-send.mjs";
import { openSession, viewOpened } from "./session-open.mjs";
import { kirocrewPinNeedsYou } from "./kirocrew-pin.mjs";
import { machineAvoozlPaths } from "./host-config.mjs";
import { rebuiltRows } from "./trackers.mjs";
import { SUPPORTED_CONTRACTS } from "./plugin-contract.mjs";
import {
  allowOnce,
  bindContentRules,
  check as checkContent,
  contentBinding,
  contentItems,
  describeSets,
  enforce as enforceContent,
  enforceDiff,
  enforceSpec,
  guardGitHub,
  loadRulePlugins,
  pushedCommits,
  readTermsFile,
  revision as gitRevision,
  rulePluginsStale,
  showDecisionLine,
  specContentDiagnostics,
  writeTermsFile,
} from "./content-rules.mjs";
import { triggerPreview } from "./issue-match.mjs";
import {
  handoffReceipts,
  radarNeedsYou,
  readCache,
  refreshUntriaged,
  untriagedView,
} from "./untriaged.mjs";
import {
  requestReviewChat,
  reviewChats,
  showReviewChat,
} from "./pr-review.mjs";
import {
  postReviewDraft,
  reviewDraftNeedsYou,
  reviewDraftsView,
} from "./review-draft.mjs";
import { clearGate, gateNeedsYou } from "./gate-clear.mjs";
import { gateRows } from "./gate-view.mjs";
import { handOff, readCrews } from "./radar-handoff.mjs";
import {
  adoptPull,
  mergeApprovedPulls,
  pullFor,
  pullSpecs,
  recordPullApproval,
  rejectPull,
  requestChanges,
  roleOf,
  specPullOf,
  specPullNeedsYou,
  specPullView,
  syncSpecPulls,
} from "./spec-pull-requests.mjs";
import { readCrewStrip } from "./radar-crews.mjs";
import { flowView, readFlowConfig, readFlowPolicy } from "./flow.mjs";
import { usageView } from "./flow-usage.mjs";
import {
  applyToConfig,
  decideProposal,
  retroPrompt,
  retroInstructions,
  runRetroAgain,
  setRetroInstructions,
} from "./flow-retro.mjs";
import { withRetroChats } from "./retro-chat.mjs";
import {
  lineBanner,
  pullCord,
  pullFullStop,
  resumeStop,
  runAnyway,
} from "./flow-line.mjs";
import { localCheckList, localPass, runLocalChecks } from "./flow-checks.mjs";
import { queueNotifications } from "./notifications.mjs";

import {
  RETRO_READS,
  RETRO_WRITES,
  retroOperation,
} from "./retro-operations.mjs";
import {
  bindRetroMemory,
  isSkillPath,
  roleTarget,
  promptVersions,
  skillHashes,
} from "./retro-memory.mjs";
import { deliverRetroRule, deliverRetroSkill } from "./intake.mjs";

const PLUGIN_OPERATIONS = new Set([
  "plugins.list",
  "plugin.add",
  "plugin.approve",
  "plugin.disable",
  "plugin.preview",
  "plugin.remove",
  "plugin.update",
  "plugin.pack.preview",
  "plugin.pack.import",
  "template.list",
  "template.preview",
]);
import {
  advanceGitHubBreakdowns,
  breakdownHold,
  classifyGitHubIssue,
  draftGitHubChildren,
} from "./github-breakdown.mjs";
import { previewProjection } from "./github-preview.mjs";
import {
  clampLimits,
  paceNeedsYou,
  refuseOtherRun,
  runView,
} from "./github-pacer.mjs";
import { planProjectionBatches } from "./radar-coder-batch.mjs";
import {
  applySpecChange,
  approvedBefore,
  changeIssues,
  planSpecChange,
  specTasks,
} from "./spec-changed.mjs";
import { inspectFolder, scanSpecs } from "./onboarding.mjs";
import {
  assertRepositoryRemovable,
  removeWorkspaceRepositoryRecords,
  workspaceRepositories,
} from "./workspace-repositories.mjs";
import {
  ensureGlobalLocalIgnore,
  globalLocalIgnoreStatus,
} from "./local-ignore.mjs";
import {
  bindSession,
  listSessionBindings,
  recordSessionStatus,
  rediscoverSessions,
  requestSession,
} from "./session-bindings.mjs";
import {
  readDeliveryPolicy,
  tick,
  tickHealth,
  tickLog,
  WORKSPACE_LOCK,
} from "./tick.mjs";
import { machineRoots, postReply } from "./github-respond.mjs";
import {
  activityView,
  chatContext,
  helpMessage,
  conflictsView,
  deliveryView,
  graphView,
  withGraphState,
  ownership,
  plansTableView,
  epicView,
  taskDetailView,
} from "./page-views.mjs";
import { frontMatter, frontMatterCategory } from "../front-matter.mjs";
import {
  branchReviewRule,
  ruleBranch,
  seenCheckNames,
} from "./github-branch-rules.mjs";
import { settleConflicts } from "./conflict-actions.mjs";
import {
  declaredSources,
  editSource,
  githubReads,
  intakeTab,
  listItems,
  pollSources,
  sourceCounts,
  sourceRow as sourceRowOf,
  sourceMap,
  startByPerson,
  confirmSnapshot,
  submitItems,
  viewItem,
} from "./intake.mjs";
import { startGitHubItem } from "./github-intake.mjs";
import { highlightLanguages } from "./highlight-languages.mjs";
import { importNewPlans, newPlanStarts, requestNewPlan } from "./new-plan.mjs";
import { decideInvestigation } from "./investigate.mjs";
import { taskEvidence } from "./evidence.mjs";
import { instanceView, renameInstance } from "./instance.mjs";
import { panelView, pullChecks } from "./panel-view.mjs";
import {
  claimedTaskIds,
  declaredChecks,
  prepareWorktree,
  reportSession,
  retryDelivery,
  approveIntegration,
  readyCandidates,
  reviewRoles as deliveryReviewRoles,
  startNow,
} from "./delivery.mjs";
import {
  clearMark,
  providersView,
  queueSwitch,
  switchDryRun,
  switchPreview,
  updateProviders,
} from "./provider-health.mjs";
import { claimTask, nextView } from "./runner.mjs";
import { manualClaim } from "./manual-claim.mjs";
import {
  claimWork,
  pullWork,
  readRunnerConfig,
  reportDone,
  runnerStatus,
  runnerTick,
  workerTick,
} from "./remote-runner.mjs";
import { previewWorker } from "./worker-setup.mjs";
import { supersedeTask } from "./supersede.mjs";

// Claimed leaves for a readiness query. A read-only database from before the
// session tables reads as having no claims.
function claimedOrNone(store) {
  try {
    return claimedTaskIds(store);
  } catch {
    return new Set();
  }
}
import { deliverNotifications } from "./notifications.mjs";
import {
  markKirocrewSeen,
  needsKirocrewItems,
  runOn,
} from "./needs-kirocrew.mjs";
import { flushOutbox } from "./outbox.mjs";
import {
  configureWorkspaceRepository,
  publishPlanningPullRequest,
  publishWorkspaceRepository,
  syncWorkspaceRepository,
  workspaceRepositoryStatus,
} from "./workspace-repository.mjs";
import {
  applyReviewSuggestion,
  bindSpecReviewRound,
  createReviewThreads,
  createSpecReviewFindings,
  disposeReview,
  listReviewThreads,
  listSpecReviewRounds,
  replyToReview,
} from "./plan-reviews.mjs";
import { recordFindingDecision } from "./review-findings.mjs";
import { planReviewView } from "./plan-review-view.mjs";
import { recordPlanReviewWriter } from "./plan-review-authorship.mjs";
import {
  assertPlanAnswerWrite,
  bindPlanAnswerSession,
  reviewFindings,
  answerReview,
} from "./plan-review-answers.mjs";
import {
  decidePlanReview,
  planReviewNeedsYou,
  planReviewStep,
} from "./plan-review-step.mjs";
import { loadLayeredConfig } from "./layered-config.mjs";
import { cliCommand } from "./report-command.mjs";
import { enqueueSessionRequests } from "./session-requests.mjs";
import {
  createExtraction,
  disposeFact,
  getExtraction,
  proposalsFromFacts,
  submitExtraction,
} from "./design-extraction.mjs";
import {
  DEFAULT_RETENTION_DAYS,
  listActivity,
  recordOperation,
} from "./activity-log.mjs";
import { lintPlan } from "./plan-quality.mjs";
import { flowView as radarFlowView } from "./radar-flow.mjs";
import {
  applyRetroRule,
  retroView,
  undoRetroRule,
} from "./radar-retro-rules.mjs";
import {
  createSpecPlan,
  epicMembers,
  findSpecFolder,
  lintSpec,
  sameSpecContent,
  specFacts,
  linkSpecPlan,
  listSpecFolders,
  parseSpec,
  proposeSpecWork,
  readCritique,
  readSpecFolder,
  saveSpecPlan,
  specCategory,
  specItems,
  specModifiedAt,
  specName,
  specRoots,
  specTitle,
  specEpic,
} from "./spec-plans.mjs";
import { publishSpec } from "./spec-publication.mjs";
import { specLinks } from "./scm-links.mjs";
import { specAuthority, takeOverSpec } from "./spec-takeover.mjs";
import { publishOffer, reserveClaims } from "./worker-claims.mjs";
import { workerResultsStep } from "./worker-result-step.mjs";
import {
  checkStaleClaims,
  claimStaleMs,
  claimStatus,
  reconcileClaims,
  releaseClaim,
} from "./worker-release.mjs";
import { driverIdOf, journalOf } from "./spec-scheduler.mjs";
import { taskDefinition } from "./task-outcomes.mjs";
import { repositorySetup } from "./repository-setup.mjs";
import { reanchorSpec, resumeSpec } from "./spec-reanchor.mjs";
import {
  applyRetirement,
  closeRetiredIssues,
  holdRetirement,
  previewRetirement,
  verifyRetirement,
} from "./task-issue-retirement.mjs";
import { applyExport, previewExport } from "./issue-export.mjs";
import {
  approvalChangedAtMerge,
  approvalEvidence,
  mayLinkSpecIssue,
  openApproval,
  reconcileApproval,
  reconcileOpenApprovals,
} from "./spec-approval.mjs";
import {
  matchingAgentInstructions,
  toggleAgentInstruction,
} from "./agent-instructions.mjs";
import { sessionUrl } from "./notifications.mjs";
import { completeManual, reopenManual } from "./manual-tasks.mjs";
import {
  checkInputs,
  fill,
  templateSeed,
  templateSummary,
} from "./templates.mjs";
import {
  addNote,
  editNote,
  noteAuthor,
  notesView,
  removeNote,
  showNote,
} from "./task-notes.mjs";

// Avoozl-recorded validation at a task's current commit (§5.2, R38.5): its
// integrated commit, else its delivery's, else the newest validated commit.
// Results come from validation records and checks-role verdicts at that
// commit; the newest result per check counts. Returns null unless every
// declared check passed there. With no declared checks, every check that ran
// at the commit must have passed.
function validationAt(store, data, task) {
  const own = (table) => {
      try {
        return store.list(table);
      } catch {
        return [];
      }
    },
    records = own("evidence").filter(
      (e) =>
        e.kind === "command" &&
        typeof e.commit === "string" &&
        resolveTaskId(data, e.taskId) === task.id,
    ),
    delivery = own("task_deliveries").find((d) => d.taskId === task.id),
    commit =
      task.integration?.commit || delivery?.commit || records.at(-1)?.commit;
  if (!commit) return null;
  const results = [];
  records.forEach((e, index) => {
    if (e.commit === commit && Array.isArray(e.argv))
      results.push({
        command: e.argv.join(" "),
        exitCode: e.exitCode,
        at: e.endedAt || e.startedAt || "",
        index,
        id: e.id,
      });
  });
  for (const v of delivery?.verifications || [])
    if (
      (v.commit ?? delivery.commit) === commit &&
      (!v.role || v.role === "checks")
    )
      for (const entry of Array.isArray(v.checks) ? v.checks : [])
        if (typeof entry?.command === "string")
          results.push({
            command: entry.command,
            exitCode: entry.notRun ? null : entry.exitCode,
            at: v.at || "",
            index: records.length,
          });
  results.sort((a, b) => a.at.localeCompare(b.at) || a.index - b.index);
  const latest = new Map();
  for (const result of results) latest.set(result.command, result);
  const declared = declaredChecks(
      task,
      store.get("projects", taskRepository(task) || ""),
    ),
    checks = declared.length ? declared : [...latest.keys()];
  if (!checks.length || checks.some((c) => latest.get(c)?.exitCode !== 0))
    return null;
  return {
    commit,
    checks,
    evidenceIds: checks.map((c) => latest.get(c).id).filter(Boolean),
    summary: (
      `${checks.length} configured check${checks.length === 1 ? "" : "s"} passed at commit ${commit.slice(0, 12)}: ` +
      checks.join("; ")
    ).slice(0, 2000),
  };
}

// Operations that write a task row directly. A row whose authority is GitHub
// is a cache (design §3.2): its change goes to the issue through projection,
// and the next sync overwrites the row.
const DIRECT_TASK_EDITS = new Set([
  "task.update",
  "task.archive",
  "task.unarchive",
  "task.accept",
  "task.merge",
  "task.supersede",
]);
function refuseGitHubAuthority(data, name, input) {
  const ids =
    name === "task.merge"
      ? [input.targetId, ...(input.duplicateIds || [])]
      : [input.id];
  for (const id of ids) {
    const task = data.tasks.find((t) => t.id === resolveTaskId(data, id));
    if (task && taskAuthority(task).startsWith("plugin:")) {
      const error = Error(
        `Task ${task.id} is owned by its record in ${taskAuthority(task)}${task.tracker?.link ? ` (${task.tracker.link})` : ""}. Change it through its plan: amend and approve the plan, and the tick projects it.`,
      );
      error.status = 409;
      error.code = "authority-plugin";
      error.route = "projection";
      throw error;
    }
    if (!task || taskAuthority(task) !== "github") continue;
    const issue = task.github?.number
      ? ` issue ${task.github.repository}#${task.github.number}`
      : " its GitHub issue";
    const error = Error(
      `Task ${task.id} is owned by${issue}. Change the issue through projection: ` +
        (task.github?.origin === "design"
          ? "amend and approve its plan, then project it."
          : "edit the issue on GitHub, then sync."),
    );
    error.status = 409;
    error.code = "authority-github";
    error.route = "projection";
    throw error;
  }
}

// Refuse prerequisites that make `id` wait on itself through other tasks,
// naming the path, so a page or agent sees which link to drop. The store's
// validator still refuses a self edge and any cycle; this adds the path.
// Only blocking kinds count.
function refuseCycle(data, id) {
  const next = new Map();
  for (const edge of data.edges) {
    if (edge.kind !== "requires" && edge.kind !== "sequence") continue;
    if (edge.from === edge.to) continue;
    if (!next.has(edge.from)) next.set(edge.from, []);
    next.get(edge.from).push(edge.to);
  }
  // Breadth-first from id along "runs before"; reaching id again is a cycle.
  const back = new Map(),
    queue = [id];
  while (queue.length) {
    const at = queue.shift();
    for (const to of next.get(at) || []) {
      if (to === id) {
        const path = [id];
        for (let step = at; step !== id; step = back.get(step)) path.push(step);
        path.push(id);
        path.reverse();
        const error = Error(
          `That prerequisite makes a cycle: ${path.join(" → ")}. Drop one of these links.`,
        );
        error.status = 409;
        error.code = "cycle";
        error.path = path;
        throw error;
      }
      if (!back.has(to)) {
        back.set(to, at);
        queue.push(to);
      }
    }
  }
}

// Which repositories have review roles (§5.2 Policy, task 9.1): a repository's
// own `reviewers` list replaces the workspace's. Takes readDeliveryPolicy's
// {status, delivery} wrapper and returns a predicate over repository names.
// Not delivery.mjs's reviewRoles(delivery, repository), which returns the list.
function reviewRoles(policy) {
  const delivery = policy?.delivery;
  return (repository) => {
    const own = repository
        ? delivery?.repositories?.[repository]?.reviewers
        : undefined,
      list = own ?? delivery?.reviewers;
    return Array.isArray(list) && list.length > 0;
  };
}

// task.update must not skip the gates of §5.2 (R36.11, R38.4): a typed
// integration receipt or a complete status would meet completion with no
// verifier, review, or merge (F60).
function refuseGateBypass(data, task, input, hasReviewers) {
  if (Object.hasOwn(input, "acceptFrom"))
    fail("acceptFrom changes only through plan approval.", 409);
  const typedIntegration = Object.hasOwn(input, "integration"),
    completes =
      Object.hasOwn(input, "status") &&
      input.status !== task.status &&
      statusComplete(data, input.status);
  if (task.acceptFrom === "validation") {
    if (typedIntegration || completes)
      fail(
        `Task ${task.id} completes only through Avoozl's validation and integration; a typed integration or complete status is refused.`,
        409,
      );
    if (
      Object.hasOwn(input, "checks") &&
      JSON.stringify(input.checks) !== JSON.stringify(task.checks)
    )
      fail(
        `Task ${task.id} takes its checks from its approved plan; change them there.`,
        409,
      );
  }
  const leaf =
      taskKind(Object.hasOwn(input, "kind") ? { kind: input.kind } : task) ===
      "leaf",
    repository = Object.hasOwn(input, "repository")
      ? input.repository
      : taskRepository(task);
  if (leaf && (typedIntegration || completes) && hasReviewers(repository))
    fail(
      `Repository ${repository} has review roles; task ${task.id} completes only after its reviews and integration, not by a typed integration or complete status.`,
      409,
    );
}

function repositoryBase(store, task, projectId) {
  if (typeof task.github?.url === "string") {
    try {
      const url = new URL(task.github.url);
      const marker = url.pathname.match(/\/(?:issues|pull)\/\d+(?:\/|$)/);
      if (marker) {
        url.pathname = url.pathname.slice(0, marker.index);
        url.search = "";
        url.hash = "";
        return url.href.replace(/\/$/, "");
      }
    } catch {}
  }
  const repository =
    task.github?.repository ||
    store
      .list("github_repositories")
      .find((entry) => entry.projectId === projectId)?.id ||
    store.get("projects", projectId)?.repository ||
    "";
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    ? `https://github.com/${repository}`
    : "";
}

function taskLocalChanges(store, task, projectId, repositoryUrl) {
  const project = store.get("projects", projectId);
  if (!project) return null;
  return {
    projectId,
    root: project.root || "",
    branch: task.integration?.branch || "",
    repositoryUrl,
  };
}

function taskCodeChanges(store, data, task, evidenceRecords) {
  const projectId = task.projectId || "",
    base = repositoryBase(store, task, projectId),
    commits = new Map(),
    pulls = new Map();
  const addCommit = (sha, source) => {
    if (typeof sha !== "string" || !/^[a-f0-9]{7,64}$/i.test(sha)) return;
    const existing = commits.get(sha);
    commits.set(sha, {
      sha,
      source: existing?.source || source,
      url: existing?.url || (base ? `${base}/commit/${sha}` : ""),
    });
  };
  const addPull = (value) => {
    if (typeof value === "string") value = { url: value };
    if (!value || typeof value.url !== "string" || !value.url) return;
    pulls.set(value.nodeId || value.url, {
      nodeId: value.nodeId || null,
      number: Number(value.number) || null,
      url: value.url,
      title: typeof value.title === "string" ? value.title : "",
      state: typeof value.state === "string" ? value.state : "",
      repository:
        typeof value.repository === "string"
          ? value.repository
          : task.github?.repository || "",
    });
  };
  addCommit(task.integration?.commit, "Integrated");
  for (const evidence of evidenceRecords)
    addCommit(
      evidence.commit,
      evidence.kind === "command" ? "Validated" : "Evidence",
    );
  for (const pull of task.github?.pullRequests || []) addPull(pull);
  for (const pull of task.pullRequests || []) addPull(pull);
  for (const receipt of store.list("receipts")) {
    if (
      typeof receipt.taskId === "string" &&
      resolveTaskId(data, receipt.taskId) === task.id &&
      typeof receipt.url === "string" &&
      /\/pull\/\d+(?:\/|$)/.test(receipt.url)
    )
      addPull(receipt);
  }
  const issueNumber = Number(task.github?.number) || null,
    issue = issueNumber
      ? {
          number: issueNumber,
          repository: task.github?.repository || "",
          url:
            task.github?.url || (base ? `${base}/issues/${issueNumber}` : ""),
        }
      : null;
  return {
    issue,
    commits: [...commits.values()],
    pullRequests: [...pulls.values()],
    local: taskLocalChanges(store, task, projectId, base),
  };
}

// The IDs an approval accepts new item text for (task.changed-text).
function retitledInput(value) {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    value.some((id) => typeof id !== "string" || id.length > 200)
  )
    fail("retitled is a list of task IDs.");
  return value;
}

// Review roles for the Settings page: the writer's model and each role, for
// the workspace and per repository. An invalid `delivery` block reads as its
// error, since Settings shows it rather than failing the page.
function reviewSettings({ delivery, error = null } = {}) {
  const role = ({ id, focus, agent, model, distinctFrom }) => ({
    id,
    focus,
    agent,
    model: model ?? null,
    distinctFrom,
  });
  return {
    error,
    writerModel: delivery?.model ?? null,
    reviewers: (delivery?.reviewers || []).map(role),
    repositories: Object.fromEntries(
      Object.entries(delivery?.repositories || {})
        .filter(([, entry]) => entry.reviewers)
        .map(([id, entry]) => [id, entry.reviewers.map(role)]),
    ),
  };
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
      crewReader = null,
      sessionsReader = null,
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
      // The app backend's reads that go to GitHub or Kiro Crew (radar.crews,
      // radar.armed) answer from the last read and refresh after replying,
      // so no page request waits on the network. The CLI and MCP keep
      // reading first.
      backgroundReads = false,
    } = {},
  ) {
    this.store = store;
    this.backgroundReads = backgroundReads;
    this.refreshing = new Map();
    this.crewStrip = null;
    this.armedRead = null;
    // The plugin loader (plugins.mjs). It opens one plugin session per
    // tick, and runs nothing unless a plugin is declared and approved.
    this.plugins = plugins;
    this.pluginOptions = { workspaceRoot, settingsFile: pluginSettingsFile };
    // Pushes one notification to Kiro Crew (notifications.mjs gatewayPusher);
    // only the app backend has one.
    this.notifier = notifier;
    // Reads Issue Radar's crews through the gateway (radar-handoff.mjs);
    // only the app backend has one.
    this.crewReader = crewReader;
    this.sessionsReader = sessionsReader;
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
        cacheSeconds: (repo) => this.cacheSeconds(repo),
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
  // Tracker plugin tasks rebuilt from each approved tracker's `list` and the
  // approved spec folders the records pin (§3.3, R35.7). A plan row is
  // recreated only from a folder whose revision equals the pinned hash, the
  // revision that was approved before. A second run writes nothing.
  async rebuildTrackers() {
    if (!this.plugins) return [];
    const trackers = this.plugins
      .inspect()
      // An intake-only plugin is never asked to list (R50.7).
      .filter((p) => p.state === "approved" && p.provides?.includes("tracker"));
    if (!trackers.length) return [];
    const namespace = requireNamespace(planningIdentity(this.workspaceRoot)),
      session = this.plugins.open(),
      results = [];
    try {
      for (const plugin of trackers) {
        const notes = [];
        let records;
        try {
          ({ records } = await session.call(plugin.id, "tracker", "list", {
            namespace,
          }));
        } catch (error) {
          results.push({
            plugin: plugin.id,
            error: error.reason || error.message,
          });
          continue;
        }
        const rows = rebuiltRows(plugin.id, records, namespace),
          plans = new Map();
        for (const row of rows)
          plans.set(row.planId, [...(plans.get(row.planId) || []), row]);
        for (const [planId, list] of plans) {
          if (!planId) continue;
          if (this.store.get("plans", planId)?.state === "approved") continue;
          const hashes = new Set(list.map((row) => row.hash));
          if (hashes.size !== 1) {
            notes.push(
              `Plan ${planId} is not rebuilt: its records pin more than one revision.`,
            );
            continue;
          }
          try {
            await this.perform("plan.create", {
              id: planId,
              spec: list[0].spec,
            });
            const preview = await this.perform("plan.preview", { id: planId });
            if (preview.reviewedHash !== list[0].hash) {
              notes.push(
                `Plan ${planId} is not rebuilt: its folder is at ${String(preview.reviewedHash).slice(0, 12)}, but its records pin ${String(list[0].hash).slice(0, 12)}. Reload and approve the folder.`,
              );
              continue;
            }
            await this.perform("plan.approve", {
              id: planId,
              expectedHash: preview.reviewedHash,
              expectedRevision: preview.expectedRevision,
              evidence: `Rebuilt from plugin:${plugin.id}: ${list.length} records pin this revision.`,
            });
          } catch (error) {
            notes.push(`Plan ${planId} is not rebuilt: ${error.message}`);
          }
        }
        const data = this.read(),
          changes = [];
        for (const row of rows) {
          const task = data.tasks.find((t) => t.id === row.taskId);
          if (!task) {
            notes.push(
              `Record ${row.tracker.id} names task ${row.taskId}, which no approved plan has.`,
            );
            continue;
          }
          if (taskAuthority(task) !== `plugin:${plugin.id}`) {
            notes.push(
              `Task ${row.taskId} is not owned by plugin:${plugin.id}; skipped.`,
            );
            continue;
          }
          // Conflicts are the tick's judgment; rebuild keeps them.
          const next = {
            ...task,
            tracker: {
              ...row.tracker,
              conflicts: task.tracker?.conflicts ?? [],
            },
          };
          if (row.verdict) {
            next.trackerVerdict = row.verdict;
            if (row.verdict.status) next.status = row.verdict.status;
          }
          if (canonical(next) !== canonical(task)) changes.push(next);
        }
        if (changes.length)
          this.store.mutate(
            `Rebuild ${changes.length} tasks from plugin:${plugin.id}`,
            (draft) => {
              for (const next of changes)
                draft.tasks[draft.tasks.findIndex((t) => t.id === next.id)] =
                  next;
            },
          );
        results.push({
          plugin: plugin.id,
          tasks: rows.map((row) => row.taskId),
          written: changes.length > 0,
          notes,
        });
      }
    } finally {
      await session.close();
    }
    return results;
  }
  // "Take back local" (§3.2, R35.10): close the record as not planned and
  // make SQLite the task's authority again. shortcut: the plan still names
  // the plugin authority, so its next approval projects the task again;
  // drop the authority from the manifest before re-approving.
  async takeBackLocal(input) {
    if (!input.taskId) fail("Choose a task ID.");
    const data = this.read(),
      task = data.tasks.find((t) => t.id === resolveTaskId(data, input.taskId));
    if (!task) fail(`Task ${input.taskId} was not found.`, 404);
    const id = pluginId(taskAuthority(task));
    if (!id) fail(`Task ${task.id} is not owned by a tracker plugin.`, 409);
    if (!this.plugins) fail("No plugin can run in this process.", 409);
    if (task.tracker?.id && task.tracker.state === "open") {
      const session = this.plugins.open();
      try {
        await session.call(id, "tracker", "close", {
          id: task.tracker.id,
          reason: "not_planned",
        });
      } finally {
        await session.close();
      }
    }
    this.store.mutate(
      `Take ${task.id} back local from plugin:${id}`,
      (draft) => {
        const row = draft.tasks.find((t) => t.id === task.id);
        row.authority = "local";
        row.takenBack = {
          from: `plugin:${id}`,
          record: task.tracker ?? null,
          at: new Date().toISOString(),
        };
        delete row.tracker;
        delete row.trackerVerdict;
        delete row.trackerHold;
        delete row.trackerPaused;
      },
    );
    return this.read().tasks.find((t) => t.id === task.id);
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
        // Local and GitHub are built in; every other route is a plugin's.
        routes: [
          "local",
          "github",
          ...plugins
            .filter((p) => p.kinds?.includes("route"))
            .map((p) => `plugin:${p.id}`),
        ],
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
    const text = [
        pack.description,
        Object.values(crews.labels ?? {}),
        crews.models,
        crews.reviewRules,
        crews.template,
        crews.prompt,
      ]
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
    const projects = this.store.list("projects"),
      planningRoot =
        this.store.getMeta("workspaceRepository")?.root ||
        projects.find((project) => project.planning && project.root)?.root ||
        (mode === null || this.workspaceIsPlanningCheckout(mode)
          ? this.workspaceRoot
          : null);
    return specRoots({
      mode,
      planningRoot,
      codeRoots: projects
        .filter((project) => !project.planning && project.root)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((project) => project.root),
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
      now - this.privateSpecsAt < this.cacheSeconds(mirror.mirror) * 1000
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
        projects: store.list("projects"),
        pluginIds: () => this.gatePluginIds(),
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
        decisionRecord: false,
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
    // A revision with no recorded approval always opens one, even when its
    // files already say Approved (an edit after an earlier approval): the
    // pull request then adds the approval marker (spec-approval.mjs).
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
    let state = await reconcileApproval(this.store, { ...ids, ...key });
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
        decisionRecord: target.decisionRecord,
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
    });
    for (const pull of merged)
      await this.perform("plan.approveMany", {
        items: pull.specs.map(({ planId, hash }) => ({
          id: planId,
          expectedHash: hash,
        })),
        approvedBy: pull.approvedBy,
      }).catch(() => {});
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
  // The tick's pass over merged approval pull requests and Avoozl's own
  // older claims (RC19.5). Approving on a Radar source issue went with Who
  // codes (R91.6).
  async approvalTick() {
    const policy = readGitHubPolicyOrNull(this.workspaceRoot);
    if (!policy?.mode || !this.github?.available?.()) return;
    await this.specPullTick(policy).catch(() => {});
    await this.recordMergedApprovals().catch(() => {});
    const plans = this.store.list("plans");
    await releaseClaims({
      store: this.store,
      github: this.github,
      policy,
      plans: new Map(plans.map((plan) => [plan.id, plan])),
    });
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
  // A revision with the same content as the approved one it replaces, such
  // as a spec moved from avoozl/manifest.json to Facts bullets, keeps that
  // approval (design §4.40): a new receipt names the hash it was carried
  // from. No approval pull request opens and no issue changes. Any
  // difference, or a check that refuses it, leaves a draft to approve as
  // usual. Returns the approved plan, or null.
  carryApproval(previous, saved) {
    if (
      !previous?.spec ||
      previous.state !== "approved" ||
      !saved ||
      saved.hash === previous.hash ||
      saved.state !== "draft"
    )
      return null;
    const receipt = this.store.get("approvals", previous.approvalId);
    if (
      receipt?.hash !== previous.hash ||
      !receipt.files ||
      !sameSpecContent(previous.spec, receipt.files, saved.files || {})
    )
      return null;
    try {
      const expectedRevision = this.store.read().revision,
        input = { id: saved.id, expectedHash: saved.hash, expectedRevision },
        { specQuality, proposals } = this.approvalChecks(input);
      approvePlan(this.store, {
        ...input,
        approvedBy: receipt.approvedBy,
        operator: this.operator,
        evidence: `Carried from ${previous.hash}: the same content in another layout.`,
        carriedFrom: previous.hash,
        githubPolicy: this.githubPolicy(),
        ...(specQuality
          ? {
              proposals,
              declaredDependencies: specQuality.declaredDependencies,
            }
          : {}),
      });
    } catch {
      return null;
    }
    return this.store.get("plans", saved.id);
  }
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
            projects: this.store.list("projects"),
            pluginIds: () => this.gatePluginIds(),
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
    for (const key of ["title", "summary", "acceptance", "checks", "requires"])
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
  // Plugins a gate may name (RC23.1): declared, readable, and providing the
  // `gate` part. Read only when a plan holds a gate.
  gatePluginIds() {
    return inspectPlugins(this.pluginOptions)
      .filter(
        (p) =>
          p.id &&
          p.state !== "invalid" &&
          p.state !== "missing" &&
          p.provides?.includes("gate"),
      )
      .map((p) => p.id);
  }
  lintSpecPlan(plan, retitled = [], { content = true } = {}) {
    const spec = { name: plan.spec, exists: true, files: plan.files || {} },
      declarations = specDeclarations(this.store.list("plans")),
      quality = lintSpec({
        spec,
        plan,
        data: {
          ...this.read(),
          projects: this.store.list("projects"),
          pluginIds: () => this.gatePluginIds(),
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
      project = store.get(
        "projects",
        worktree?.repository || taskRepository(task),
      );
    if (!project?.root) fail(`Task ${task.id} names no local checkout.`, 409);
    const heads = input.push
      ? pushedCommits(input.stdin).map((p) => p.local)
      : [input.head || "HEAD"];
    const checked = [],
      local =
        input.push &&
        taskRoute(task) === "github" &&
        localCheckList(project).length > 0 &&
        readFlowPolicy(this.workspaceRoot).for(project.id).localChecksFirst;
    for (const head of heads) {
      gitRevision(head);
      // Local checks first (R45.4): a recorded local pass, not a rerun.
      if (local) {
        const sha = /^[0-9a-f]{40}$/.test(head)
          ? head
          : await git(worktree?.path || project.root, ["rev-parse", head]);
        const pass = await localPass(
          project.root,
          sha,
          localCheckList(project),
        );
        if (!pass.ok)
          fail(
            `Local checks first: ${pass.cause}. Run \`avoozl checks run --task ${task.id}\` in this worktree, then push again.`,
            409,
          );
      }
      enforceDiff(store, {
        project: { ...project, root: worktree?.path || project.root },
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
      projectId: input.projectId || plan.context?.projectId || null,
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
        actions: RULE_ACTIONS,
        fields: FIELD_KEYS,
        statusValues: STATUS_VALUE_KEYS,
        managedLabels: MANAGED_LABEL_KEYS,
        crewLabels: CREW_LABEL_KEYS,
      },
    };
  }
  // Release options for the wizard: milestones in the mode's spec folders,
  // then those of tasks already in the workspace, first seen first.
  setupMilestones(mode) {
    const names = [];
    let roots = [];
    try {
      roots = this.specRoots(mode ?? undefined);
    } catch {
      // In plans-repo mode `.avoozl.json` sits in the planning checkout.
      roots = this.workspaceRoot ? [this.workspaceRoot] : [];
    }
    for (const root of roots)
      for (const spec of listSpecFolders(root))
        for (const proposal of parseSpec(readSpecFolder(root, spec)).proposals)
          if (proposal.milestone) names.push(proposal.milestone);
    for (const task of this.store.read().tasks)
      if (task.milestone) names.push(task.milestone);
    return [...new Set(names)];
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
  // github.cacheSeconds, with a repository's own value first. The files are
  // read at most every five seconds; an unreadable file means the default.
  cacheSeconds(repo = "") {
    const at = Date.now();
    if (!this.cachePolicy || at - this.cachePolicy.at > 5000)
      this.cachePolicy = {
        at,
        policy: readGitHubPolicyOrNull(this.workspaceRoot),
      };
    const policy = this.cachePolicy.policy;
    return (
      policy?.repositories?.[repo]?.cacheSeconds ??
      policy?.cacheSeconds ??
      DEFAULT_CACHE_SECONDS
    );
  }
  // Broad issues (§6.2): the child graph is a spec folder; approval stores it
  // as an approved plan, without its root epic, which is the source issue.
  // `locked`: the caller already holds the workspace tick lock.
  breakdownHooks({ locked = false } = {}) {
    const store = this.store,
      policy = this.githubPolicy(),
      identity = planningIdentity(this.workspaceRoot);
    return {
      policy,
      identity,
      readSpec: (name) => this.readSpec(name),
      lint: (spec) =>
        this.withContentDiagnostics(
          lintSpec({
            spec,
            plan: { id: spec.name },
            data: {
              ...this.read(),
              projects: store.list("projects"),
              pluginIds: () => this.gatePluginIds(),
            },
          }),
          spec,
        ),
      approveChildren: ({ spec, children, row, actor }) => {
        const config = store.get("github_repositories", row.repository);
        let plan = createSpecPlan(
          store,
          {
            id: spec.name,
            prompt: `Children of ${row.repository}#${row.number}`,
            context: {
              projectId: config.projectId,
              issue: { repository: row.repository, number: row.number },
            },
          },
          spec,
        );
        if (plan.hash !== spec.hash)
          plan = saveSpecPlan(
            store,
            { id: plan.id, expectedHash: plan.hash },
            spec,
          );
        approvePlan(store, {
          id: plan.id,
          expectedHash: plan.hash,
          expectedRevision: store.read().revision,
          approvedBy: actor,
          operator: this.operator,
          proposals: children.map(({ topLevel: _top, ...child }) => child),
          githubPolicy: policy,
        });
        return store.get("plans", plan.id);
      },
      project: async (planId, repository) =>
        this.withProjectSync(
          await projectPlanIssues(store, this.github, {
            planId,
            repository,
            identity,
            locked,
          }),
        ),
    };
  }
  // The merge path of the named repository; none without a name.
  async mergePaths(only) {
    const policy = readGitHubPolicyOrNull(this.workspaceRoot),
      delivery = readDeliveryPolicy(this.workspaceRoot).delivery || {};
    if (!only || !policy?.mode || !this.github?.available?.()) return [];
    return Promise.all(
      Object.entries(policy.repositories || {})
        .filter(([id]) => id === only)
        .map(([id, entry]) => mergePath(this.github, id, entry, { delivery })),
    );
  }
  // Projection adds its issues to the Project with the tick's own sync, so
  // the two agree (§6.7). A Project failure never fails issue projection.
  async withProjectSync(projection) {
    try {
      const policy = this.githubPolicy();
      if (!policy.project) return projection;
      // The tick's lock: one Project writer at a time.
      const result = await withWorkLock(this.store, WORKSPACE_LOCK, () =>
        syncProject(this.store, this.github, {
          policy,
          identity: planningIdentity(this.workspaceRoot),
          claimed: claimedTaskIds(this.store),
        }),
      );
      return {
        ...projection,
        project: {
          status: result.status,
          writes: result.writes,
          problems: result.problems || [],
          ...(result.reason ? { reason: result.reason, fix: result.fix } : {}),
        },
      };
    } catch (error) {
      // A tick holding the lock syncs the board itself.
      return {
        ...projection,
        project: error.contention
          ? { status: "locked" }
          : { status: "error", reason: error.message },
      };
    }
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
      const projection = await this.withProjectSync(
        await projectPlanIssues(this.store, this.github, {
          planId: receipt.planId,
          identity: planningIdentity(this.workspaceRoot),
        }),
      );
      receipt.state = "projected";
      receipt.projectedAt = new Date().toISOString();
      receipt.issueIds = projection.issues.map((issue) => issue.id);
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
          projectId: input.projectId,
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
  async execute(name, input = {}, expectedRevision, context = {}) {
    const result = await withSource(sourceOfOperation(name), () =>
      this.perform(name, input, expectedRevision, context),
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
    this.store.transaction(() => {
      this.store.write(snapshot);
      this.store.setMeta("mode", "active");
    });
  }
  // Local-only maintenance: replace or check the database from a snapshot.
  importSnapshot(snapshot, options) {
    return this.store.importSnapshot(snapshot, options);
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
    // A run start is a dispatch request, and an extraction opens a record
    // for a planner session to fill.
    if (name === "run.start") {
      if (
        !input.taskId ||
        !input.repository ||
        !(input.agent || input.executor)
      )
        fail("run.start needs taskId, repository and agent.", 400);
      return requestSession(
        store,
        {
          taskId: resolveTaskId(this.read(), input.taskId),
          repository: input.repository,
          agent: input.agent,
          role: input.role,
          executor: input.executor,
          model: input.model,
          permissionClass: input.permissionClass,
        },
        workspaceRepositories(store),
      );
    }
    if (name === "plan.extract") {
      if (
        input.provider ||
        (Array.isArray(input.sequence) && input.sequence.length)
      )
        fail(
          "plan.extract takes no provider; a planner session fills it.",
          400,
        );
      return this.startExtractionPipeline(input);
    }
    if (name === "client.describe") return describeWorkspace(store);
    if (name === "workspace.examples") return listExamples();
    if (name === "workspace.seed")
      return seedExample(store, input, expectedRevision, {
        specRoot: () => this.exampleSpecRoot(),
        createDraft: (spec) => this.createSpecDraft({ spec }, context),
      });
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
    if (name === "task.duplicates")
      return input.title
        ? {
            items: duplicateCandidates(this.read(), input, {
              similar: true,
              limit: input.limit,
            }),
          }
        : duplicateAudit(this.read(), input);
    if (name === "task.merge")
      return mergeTasks(store, input, expectedRevision);
    if (name === "task.supersede")
      return store.mutate(
        "Supersede " + input.id,
        (data) => supersedeTask(data, input, { operator: this.operator }),
        expectedRevision,
      );
    if (name === "task.merge.get") {
      const receipt = store.get("evidence", input.id);
      if (receipt?.kind !== "task-merge") fail("Merge receipt not found.", 404);
      return receipt;
    }
    if (name === "session.bind")
      return store.transaction(() => {
        const result = bindSession(store, input, {
          consumer: kirocrewConsumer(context),
        });
        if (result.changed && result.binding.role === "plan-review") {
          bindSpecReviewRound(store, {
            roundId: result.binding.taskId,
            slot: result.binding.slot,
          });
          result.binding = store.get("session_bindings", result.binding.slot);
        }
        if (result.changed && result.binding.role === "plan-answer") {
          bindPlanAnswerSession(store, {
            roundId: result.binding.taskId,
            slot: result.binding.slot,
          });
          result.binding = store.get("session_bindings", result.binding.slot);
        }
        return stampPrompts(store, result);
      });
    if (name === "executor.kirocrew.take") markKirocrewSeen(store);
    if (name === "executor.kirocrew.take")
      return takeKirocrewRequest(store, input, context, (request, queued) =>
        sessionStartHold(store, request, queued, {
          planReviewMode:
            request.role === "plan-review"
              ? validatePlanReview(
                  this.workspaceRoot
                    ? loadLayeredConfig({ workspaceRoot: this.workspaceRoot })
                        .config.planReview
                    : undefined,
                ).mode
              : undefined,
        }),
      );
    if (name === "executor.kirocrew.release")
      return releaseKirocrewRequest(store, input, context);
    if (name === "executor.kirocrew.complete")
      return completeKirocrewRequest(store, input, context);
    if (name === "session.rediscover") return rediscoverSessions(store, input);
    if (name === "session.request")
      return requestSession(store, input, workspaceRepositories(store));
    if (name === "session.status") return recordSessionStatus(store, input);
    // Send message on a `process` session (R98.2): a person's message,
    // queued for the supervisor. An agent or MCP caller cannot steer a child.
    if (name === "session.send") {
      if (context.caller || context.mcp)
        fail(
          "Only a person sends a message to a process session, in the Avoozl page.",
          403,
        );
      return queueSessionSend(store, input);
    }
    // Open chat on the standalone page (SW7): a person starts a read-only
    // `process` session from a message; `session.view` reads it back.
    if (name === "session.open") {
      if (context.caller || context.mcp)
        fail("Only a person opens a session, in the Avoozl page.", 403);
      return openSession(store, input, {
        config: loadLayeredConfig({ workspaceRoot: this.workspaceRoot }).config,
        configDirectory: this.configDirectory,
        workspaceRoot: this.workspaceRoot,
      });
    }
    if (name === "session.view")
      return viewOpened(store, input, {
        ...machineAvoozlPaths(),
        configDirectory: this.configDirectory,
      });
    if (name === "reply.post")
      return postReply(store, this.github, input, context.caller, {
        roots: machineRoots(store, this.workspaceRoot),
      });
    // Review drafts by label (RC20): the bound chat's one pending review, and
    // the list of drafts. Avoozl never submits a review.
    if (name === "reviewdraft.post")
      return postReviewDraft(
        store,
        this.github,
        readGitHubPolicyOrNull(this.workspaceRoot),
        input,
        context.caller,
        { roots: machineRoots(store, this.workspaceRoot) },
      );
    if (name === "gate.list") return { gates: gateRows(store) };
    if (name === "gate.clear")
      return clearGate(
        store,
        this.github,
        readGitHubPolicyOrNull(this.workspaceRoot),
        {
          taskId: input?.taskId,
          reason: input?.reason,
          how:
            context.caller || context.mcp
              ? "mcp"
              : context.local
                ? "command"
                : "control",
          local: context.local ? "cli" : "dashboard",
        },
      );
    if (name === "review.drafts")
      return reviewDraftsView(
        store,
        readGitHubPolicyOrNull(this.workspaceRoot),
        input,
      );
    if (name === "session.report") {
      // The skill files a session says it loaded (R68.12): absolute paths,
      // hashed here; skills read through tool calls win.
      const { skills, ...report } = input || {};
      if (
        skills !== undefined &&
        (!Array.isArray(skills) ||
          skills.length > 20 ||
          !skills.every(
            (f) =>
              typeof f === "string" &&
              f.length <= 1000 &&
              path.isAbsolute(f) &&
              isSkillPath(f),
          ))
      )
        fail(
          "skills lists up to 20 absolute paths of SKILL.md files you loaded.",
        );
      const result = await reportSession(store, report, context.caller, {
        local: context.local === true,
        flow: readFlowPolicy(this.workspaceRoot),
        policy: readDeliveryPolicy(this.workspaceRoot).delivery,
      });
      if (skills?.length && result.binding) {
        const hashes = skillHashes(store, skills, result.binding.taskId),
          current = store.get("session_bindings", result.binding.slot);
        if (current && Object.keys(hashes).length)
          store.put("session_bindings", {
            ...current,
            skills: { ...hashes, ...(current.skills || {}) },
          });
      }
      return result;
    }
    // Local checks first (R45): run the declared checks in a worktree and
    // record the pass the pre-push hook and the done report read.
    if (name === "flow.checks.run") {
      const task = this.read().tasks.find((t) => t.id === input.taskId);
      if (!task) fail("Task not found.", 404);
      const project = store.get("projects", taskRepository(task) || "");
      if (!project?.root) fail(`Task ${task.id} names no local checkout.`, 409);
      if (typeof input.cwd !== "string" || !path.isAbsolute(input.cwd))
        fail("Name the worktree folder to run the checks in.");
      return runLocalChecks({
        cwd: input.cwd,
        root: project.root,
        env: project.checksEnv,
        checks:
          taskRoute(task) === "github"
            ? localCheckList(project)
            : declaredChecks(task, project),
      });
    }
    // Runner mode over SSH (R84): off unless .avoozl.json has `runner`.
    // shortcut: no machine reports remote workers to a driver now, so the
    // list is always empty. The page's In flight and Delivery still read it;
    // remove it with their remote rows, which need new screenshots.
    if (name === "remote.view") return { workers: [] };
    if (name === "remote.status")
      return runnerStatus(store, this.workspaceRoot);
    if (name === "remote.report")
      return reportDone(store, this.workspaceRoot, input);
    if (name === "worker.claim")
      return claimWork(store, this.workspaceRoot, this.github);
    if (name === "worker.setup") {
      const config = readRunnerConfig(this.workspaceRoot);
      if (config?.role !== "worker")
        fail('This workspace is not a worker (runner.role "worker").');
      return previewWorker({ config, github: this.github });
    }
    if (name === "worker.pull")
      return pullWork(store, this.workspaceRoot, this.github);
    if (name === "instance.view") return instanceView(store);
    if (name === "instance.rename") {
      renameInstance(store, input.name);
      return instanceView(store);
    }
    if (name === "runner.next")
      return nextView(store, {
        policy: readDeliveryPolicy(this.workspaceRoot),
        github: readGitHubPolicyOrNull(this.workspaceRoot),
      });
    if (name === "runner.claim") {
      const policy = readDeliveryPolicy(this.workspaceRoot),
        github = readGitHubPolicyOrNull(this.workspaceRoot);
      // A manual claim is the person's at this machine's command line.
      if (context.local === true)
        return stampPrompts(
          store,
          await manualClaim(
            store,
            { ...input, workspaceRoot: this.workspaceRoot },
            { github },
          ),
        );
      // shortcut: a Crew Mode conductor's claim stays until wp-2.2 removes
      // Crew Mode; nothing else may claim.
      if (policy.delivery?.runner !== "crew-mode")
        fail(
          "A claim is a person's: run avoozl claim TASK from the command line.",
          403,
        );
      return stampPrompts(
        store,
        await claimTask(store, input, {
          caller: context.caller,
          local: false,
          policy,
          github,
        }),
      );
    }
    // Provider health and model switches (§4.20, R72). The writes are a
    // person's: mcp-policy.mjs refuses them for MCP, the backend for tokens.
    if (name === "providers.view")
      return providersView(store, this.providerOptions());
    if (name === "provider.switch.preview")
      return switchPreview(store, input, this.providerOptions());
    // Switch model's step 2 (R72.12): what Switch would do, with the ready
    // tasks Also new tasks moves. Person-only; writes nothing.
    if (name === "provider.switch.dryRun") {
      const github = readGitHubPolicyOrNull(this.workspaceRoot);
      let ready = [];
      // Each ready task with the model its worker would open on.
      if (input.alsoNewTasks === true)
        try {
          const model = readDeliveryPolicy(this.workspaceRoot).delivery?.model;
          ready = readyCandidates(store, { github }).map((task) => ({
            taskId: task.id,
            model: task.session?.model ?? model ?? null,
          }));
        } catch {
          // The dry run still answers; the page says the list is unread.
          ready = null;
        }
      return switchDryRun(store, input, { ...this.providerOptions(), ready });
    }
    if (name === "provider.switch")
      return queueSwitch(store, input, this.providerOptions());
    if (name === "provider.health.clear") return clearMark(store, input);
    if (name === "providers.settings.update")
      return updateProviders(store, input);
    // The task's evidence bundle (§4.22): read only.
    if (name === "task.evidence")
      return taskEvidence(store, {
        ...input,
        taskId: resolveTaskId(this.read(), String(input.taskId ?? "")),
      });
    // Ship mode manual in Local only (§4.25, R80.4): a person's Integrate.
    if (name === "delivery.integrate") {
      if (context.caller || context.mcp)
        fail(
          "Only a person presses Integrate, in the Avoozl page or the CLI.",
          403,
        );
      return approveIntegration(store, input, {
        by: context.local ? "cli" : this.operator || "dashboard",
      });
    }
    // Investigate first (§4.21): Go ahead, Investigate again or Stop.
    if (name === "investigation.decide") {
      if (context.caller || context.mcp)
        fail(
          "Only a person decides on a task's findings, in the Avoozl page or the CLI.",
          403,
        );
      return decideInvestigation(
        store,
        this.read(),
        {
          ...input,
          taskId:
            typeof input.taskId === "string"
              ? resolveTaskId(this.read(), input.taskId)
              : input.taskId,
        },
        { by: context.local ? "cli" : this.operator || "dashboard" },
      );
    }
    if (name === "delivery.settings.get")
      return this.settingsFile().readDeliverySettings();
    if (name === "delivery.settings.update") {
      if (context.caller || context.mcp)
        fail(
          "Only a person changes delivery settings, in the Avoozl page.",
          403,
        );
      const written = this.settingsFile().updateDeliverySettings(input);
      this.configuration?.reload();
      return written;
    }
    if (name === "verify.allow")
      return allowProtectedPaths(store, input, {
        caller: context.caller,
        mcp: context.mcp === true,
        local: context.local === true,
      });
    if (name === "delivery.retry")
      return retryDelivery(store, input, {
        caller: context.caller,
        mcp: context.mcp === true,
        local: context.local === true,
      });
    if (name === "notifications.deliver")
      return deliverNotifications(store, this.notifier);
    if (name === "worktree.prepare") return prepareWorktree(store, input);
    if (name === "workspace.tick") {
      // A worker machine pulls and claims before it runs what it was given.
      await workerTick(store, this.workspaceRoot, this.github);
      // A runner holds no plans, so its tick only runs handed tasks.
      const remote = await runnerTick(store, this.workspaceRoot, {
        roster: Array.isArray(input.sessions) ? input.sessions : null,
        bindings: listSessionBindings(store),
        command: `AVOOZL_WORKSPACE=${JSON.stringify(this.workspaceRoot)} ${cliCommand()}`,
      });
      if (remote) return remote;
      await this.refreshPrivateSpecs();
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
        // Stale worker claims reach Needs you; nothing releases them (R90.6).
        await checkStaleClaims(store, {
          workspaceRoot: this.workspaceRoot,
          driving,
          journalFor,
        }).catch(() => 0);
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
        breakdownHooks: () => this.breakdownHooks({ locked: true }),
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
                    projects: store.list("projects"),
                    pluginIds: () => this.gatePluginIds(),
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
    }
    if (name === "route.cancel") {
      if (!this.plugins) fail("No plugin can run in this process.", 409);
      return cancelSubmission(store, this.plugins.open(), input);
    }
    if (name === "route.resubmit") return resubmit(store, input);
    // Proposals and prompt overrides (design §4.18).
    if (RETRO_READS.has(name) || RETRO_WRITES.has(name))
      return retroOperation(store, name, input, context, {
        by: context.local ? "cli" : this.operator || "dashboard",
      });
    if (PLUGIN_OPERATIONS.has(name)) {
      const result = await this.pluginOperation(name, input, context);
      // A plugin change reloads rules plugins on the next operation.
      if (
        !["plugins.list", "plugin.preview", "plugin.pack.preview"].includes(
          name,
        )
      )
        contentBinding(store)?.plugins.clear();
      return result;
    }
    if (name === "workspace.tick.health") return tickHealth(store);
    if (name === "workspace.tick.log") return tickLog(store, input);
    if (name === "highlight.languages")
      return highlightLanguages(this.workspaceRoot);
    if (name === "activity.recent")
      return activityView(store, this.read(), input);
    // The activity log (§4.19).
    if (name === "activity.list") {
      const page = listActivity(store, input);
      let tasks = new Set();
      try {
        tasks = new Set(this.read().tasks.map((task) => task.id));
      } catch {}
      return {
        ...page,
        items: page.items.map((row) =>
          row.targetId && tasks.has(row.targetId)
            ? { ...row, task: true }
            : row,
        ),
        retentionDays: this.workspaceRoot
          ? this.settingsFile().readActivitySettings().retentionDays
          : DEFAULT_RETENTION_DAYS,
      };
    }
    if (name === "activity.settings.get")
      return this.settingsFile().readActivitySettings();
    if (name === "activity.settings.update") {
      if (context.caller || context.mcp)
        fail("Only a person changes how long activity is kept.", 403);
      const written = this.settingsFile().updateActivitySettings(input);
      this.configuration?.reload();
      return written;
    }
    if (name === "task.start")
      return startNow(store, input, {
        policy: readDeliveryPolicy(this.workspaceRoot),
        github: readGitHubPolicyOrNull(this.workspaceRoot),
      });
    if (name === "chat.context") {
      // Ask for help (§8.9): the page's own words and settings.
      if (input.purpose === "help") return { message: helpMessage(input) };
      // A plan's seed carries its row and its spec documents.
      let planRow = null,
        documents = null;
      if (typeof input.plan === "string" && input.plan) {
        const table = await this.perform("plan.table", {}, undefined, context);
        planRow = table.items.find((row) => row.key === input.plan) || null;
        if (!planRow) fail("Plan not found.", 404);
        if (planRow.spec)
          try {
            documents = this.readSpecDocuments({ name: planRow.spec });
          } catch {
            documents = null;
          }
        else if (planRow.planId) {
          const stored = store.get("plans", planRow.planId);
          documents = stored?.text
            ? { documents: { "plan.md": stored.text } }
            : null;
        }
      }
      return chatContext(store, this.read(), input, { planRow, documents });
    }
    if (name === "content.rules") {
      let configHash = null;
      try {
        configHash = this.settingsFile().readFile().hash;
      } catch {}
      return {
        ...describeSets(store),
        ...contentItems(store),
        configHash,
        mode: this.contentMode(),
      };
    }
    // Settings > Content rules editing: a person only. Terms are private, so
    // a session can neither read nor write them.
    if (
      name === "content.terms.get" ||
      name === "content.terms.update" ||
      name === "content.sets.update"
    ) {
      if (context.caller || context.mcp)
        fail("Only a person edits content rules, in the Avoozl page.", 403);
      if (name === "content.terms.get") return readTermsFile(store, input);
      if (name === "content.terms.update") return writeTermsFile(store, input);
      const written = this.settingsFile().updateContentRules(input, {
        pluginIds: inspectPlugins(this.pluginOptions)
          .map((p) => p.id)
          .filter(Boolean),
      });
      this.configuration?.reload();
      return {
        ...describeSets(store),
        ...contentItems(store),
        configHash: written.hash,
        mode: this.contentMode(),
      };
    }
    if (name === "content.allow")
      return allowOnce(store, input, {
        operator: this.operator,
        caller: context.caller || context.mcp ? context.caller || "mcp" : null,
      });
    if (name === "content.show") {
      if (context.caller || context.mcp)
        fail(
          "Only a person reads a matched line, in the Avoozl page or the CLI.",
          403,
        );
      return showDecisionLine(store, input.id);
    }
    if (name === "content.check") return this.contentCheck(input, context);
    if (name === "graph.view") {
      // Draft spec folders, display only; none when specs cannot be read.
      let folders = [];
      try {
        folders = this.specHomes().homes.map(({ spec }) => ({
          name: spec.name,
          spec,
        }));
      } catch {
        // No spec roots in this mode.
      }
      return graphView(store, this.read(), input, folders);
    }
    if (name === "delivery.view")
      return {
        ...deliveryView(store, this.read(), { config: this.savedConfig() }),
        // How many chats this Mac runs at once (R88.5); null when delivery is off.
        laneLimit:
          readDeliveryPolicy(this.workspaceRoot).delivery?.concurrency ?? null,
      };
    // Dashboards › Landing queue: per base, in order, with hold reasons;
    // from the store only, so Refresh never calls GitHub (44.5).
    if (name === "landing.queue")
      return landingQueueView(store, this.read(), {
        config: this.workspaceRoot
          ? loadLayeredConfig({ workspaceRoot: this.workspaceRoot }).config
          : null,
      });
    if (name === "conflicts.view") {
      const data = this.read(),
        view = conflictsView(store, data),
        policy = readGitHubPolicyOrNull(this.workspaceRoot);
      // Crews that asked for a person on issues no task owns (R52.10).
      view.items.push(...conflictFixNeedsYou(store));
      view.items.push(...mergeMethodNeedsYou(store));
      view.items.push(...approvalNeedsYou(store));
      view.items.push(...crewLabelNeedsYou(store));
      view.items.push(...reviewDraftNeedsYou(store));
      view.items.push(...planReviewNeedsYou(store));
      view.items.push(...specPullNeedsYou(store));
      view.items.push(...gateNeedsYou(store));
      if (this.kirocrewAbsent) view.items.push(...kirocrewPinNeedsYou(store));
      view.items.push(...landingNeedsYou(store));
      view.items.push(...landingWaitNeedsYou(store, this.read()));
      view.items.push(...syncNeedsYou(store));
      view.items.push(...rateNeedsYou(store));
      view.items.push(...paceNeedsYou(store));
      view.items.push(...mirrorNeedsYou(store));
      view.items.push(...mirrorForwardRows(store, policy));
      view.items.push(...forwardAuditRows(store));
      view.items.push(...publicCrewAuditRows(store));
      view.items.push(...publicBranchRows(store));
      // A role waiting on Kiro Crew on a machine with none, with this
      // machine's approved harnesses for Run on (NK8.2).
      view.items.push(
        ...needsKirocrewItems(
          store,
          listHarnessDefinitions(this.configDirectory)
            .filter((d) => d.approved)
            .map((d) => d.name),
        ),
      );
      view.items.push(
        ...radarNeedsYou(
          untriagedView(
            policy,
            data.tasks,
            readCache(store),
            Date.now(),
            handoffReceipts(store),
          ),
        ),
      );
      addItemContext(store, data, view.items);
      return view;
    }
    // The chat side panel in one read: every part it shows, each null when its
    // own read fails (panel-view.mjs).
    if (name === "panel.view") {
      const sub = (op, args = {}) => this.perform(op, args, undefined, context),
        data = this.read(),
        crews = sub("radar.crews").catch(() => null);
      return panelView({
        conflicts: async () => (await sub("conflicts.view")).items,
        crews: () => crews,
        remote: async () => (await sub("remote.view")).workers,
        queue: () => sub("radar.releasequeue"),
        flow: () => ({
          tasks: flowView(store, data, { window: "10" }).tasks,
          line: lineBanner(store, data),
        }),
        specs: async () => (await sub("plan.specs")).items,
        instance: () => instanceView(store),
        checks: async () => pullChecks(this.github, await crews),
      });
    }
    if (name === "flow.view") {
      const data = this.read(),
        config = readEffectiveCIConfig(store, {
          workspaceRoot: this.workspaceRoot,
          persist: false,
        }),
        policy = this.workspaceRoot
          ? readGitHubPolicyOrNull(this.workspaceRoot)
          : null,
        view = flowView(store, data, input),
        filtered = input.repository || input.epic || input.plan || input.phase;
      return {
        ...view,
        retros: withRetroChats(store, view.retros),
        repositories: [
          ...new Set([
            ...view.repositories,
            ...ciRepositoryPickerIds(store, policy, view.repositories),
          ]),
        ].sort(),
        ci: ciFlowView(store, config, policy, input),
        line: lineBanner(store, data),
        // Tokens and credits per task, plan, stage and model (§4.11).
        usage: usageView(store, data, {
          tasks: filtered ? view.tasks.map((t) => t.taskId) : null,
        }),
      };
    }
    // Settings > Flow (§8.4) and the retros (§4.11).
    // Settings › Models: Avoozl's own chats' models, in .avoozl.json.
    if (name === "models.settings.get")
      return {
        ...this.settingsFile().readModelSettings(),
        // This machine's harness definitions a role may pick (R98.3).
        harnessDefinitions: listHarnessDefinitions(this.configDirectory),
      };
    // Run on (NK8.2): a person moves a role that waits on Kiro Crew to one
    // of this machine's approved harnesses.
    if (name === "needskirocrew.runon") {
      if (context.caller || context.mcp)
        fail(
          "Only a person chooses where a role runs, in the Avoozl app.",
          403,
        );
      return runOn(store, input, {
        settings: this.settingsFile(),
        approved: listHarnessDefinitions(this.configDirectory)
          .filter((d) => d.approved)
          .map((d) => d.name),
      });
    }
    if (name === "models.settings.update") {
      if (context.caller || context.mcp)
        fail("Only a person changes chat models, in Settings.", 403);
      const written = this.settingsFile().updateModelSettings(input);
      this.configuration?.reload();
      return written;
    }
    if (name === "flow.settings.get")
      return {
        ...this.settingsFile().readFlowSettings(),
        ...ciSettingsView(
          readEffectiveCIConfig(store, {
            workspaceRoot: this.workspaceRoot,
            persist: false,
          }),
        ),
        // The built-in retro prompt, shown read-only above the owner's own.
        retroPrompt: retroPrompt(),
        instructions:
          context.caller || context.mcp ? null : retroInstructions(store),
      };
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
    // The spec driver (§6.10). Status reads everywhere; moving the role or
    // changing this computer's settings is a person's, on the page or CLI.
    if (name === "driver.status") return driverStatus(store, input);
    if (name === "driver.takeover.preview")
      return takeoverPreview(store, input);
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
    if (name === "driver.settings.update") {
      const ctx = driverContext(store);
      if (!ctx) fail("This workspace has no driver settings.", 409);
      updateMachineSettings(store, ctx.settingsFile, input);
      return driverStatus(store);
    }
    if (name === "driver.handoff")
      return handOffDriver(store, this.github, input);
    if (name === "driver.away.decide") return decideAway(store, input);
    if (name === "driver.takeover" || name === "driver.forceTakeover") {
      const hooks = {
        rebuild: (repository) =>
          rebuildFromGitHub(store, this.github, {
            repository,
            identity: planningIdentity(this.workspaceRoot),
            policy: this.githubPolicy(),
            readSpec: (spec) => this.readSpec(spec),
          }),
        notify: (notices) => queueNotifications(store, notices),
      };
      return name === "driver.takeover"
        ? takeOver(store, this.github, input, hooks)
        : forceTakeOver(store, this.github, input, hooks);
    }
    if (name === "flow.settings.update") {
      const written = this.settingsFile().updateFlowSettings(input);
      this.configuration?.reload();
      return written;
    }
    if (name === "flow.instructions.update")
      return setRetroInstructions(store, input.instructions);
    if (name === "flow.retro.start") {
      const s = store.getMeta("flow.retro.state") || {
        seen: [],
        pending: [],
        reverts: [],
      };
      if (!s.pending.some((t) => t.kind === "manual"))
        store.setMeta("flow.retro.state", {
          ...s,
          pending: [
            ...s.pending,
            {
              kind: "manual",
              key: "manual:" + Date.now(),
              detail: "started by hand",
              at: new Date().toISOString(),
            },
          ],
        });
      return { queued: true };
    }
    if (name === "flow.retro.again") return runRetroAgain(store, input.id);
    if (name === "flow.retro.decide") {
      const settings = this.settingsFile(),
        config = readFlowConfig(this.workspaceRoot);
      return decideProposal(store, input, {
        config,
        ciConfig: readEffectiveCIConfig(store, {
          workspaceRoot: this.workspaceRoot,
          fallback: config,
          persist: false,
        }),
        by: context.local ? "cli" : "dashboard",
        // A repository skill change is one leaf through Deliver this
        // (R68.10, R50.15).
        skill: async (change) =>
          withWorkLock(store, WORKSPACE_LOCK, async () =>
            deliverRetroSkill(
              store,
              readGitHubPolicyOrNull(this.workspaceRoot),
              change,
            ),
          ),
        // A rule from repeated corrections is one leaf too (R78.3).
        rule: async (change) =>
          withWorkLock(store, WORKSPACE_LOCK, async () =>
            deliverRetroRule(
              store,
              readGitHubPolicyOrNull(this.workspaceRoot),
              change,
            ),
          ),
        apply: async (proposal, expectedHash) => {
          if (proposal.key.startsWith("delivery."))
            return settings.updateDeliveryKey({
              key: proposal.key,
              from: proposal.from,
              to: proposal.to,
              expectedHash,
            });
          const file = settings.readFlowSettings(),
            flow = applyToConfig(file, proposal);
          return settings.updateFlowSettings({
            flow,
            repository:
              proposal.file === "repository" ? proposal.repository : null,
            expectedHash,
          });
        },
        draft: async (proposal) =>
          createPlan(store, {
            // A CI change names its workflow file (§4.30): one new task.
            prompt: `Retro ${input.retroId} proposal for spec ${proposal.spec}: ${proposal.change}${proposal.workflow ? `\n\nOne new task in ${proposal.repository} that changes ${proposal.workflow}.` : ""}\n\nWhy: ${proposal.evidence}`,
            context: {
              retro: input.retroId,
              spec: proposal.spec,
              ...(proposal.workflow
                ? {
                    repository: proposal.repository,
                    workflow: proposal.workflow,
                  }
                : {}),
            },
          }).id,
      });
    }
    // Run anyway (R44.10): a person only, confirmed and recorded.
    if (name === "flow.runAnyway") {
      if (context.caller || context.mcp)
        fail(
          "Only a person presses Run anyway, in the Avoozl page or the CLI.",
          403,
        );
      return runAnyway(store, input, {
        operator: context.local ? "cli" : this.operator || "dashboard",
      });
    }
    // Stop all agents (R64.12): a person only, through the app backend,
    // which alone can stop Kiro Crew sessions.
    if (name === "flow.stop" && input.full === true) {
      if (context.caller || context.mcp)
        fail("Only a person stops all agents. Do it in the Avoozl app.", 403);
      return pullFullStop(store, input, {
        by: {
          kind: "person",
          name: context.local ? "cli" : this.operator || "dashboard",
        },
        stopSession: this.sessionStopper,
      });
    }
    // Pull the Andon cord (R64): a person or an agent session stops new
    // dispatch in a scope; only a person resumes.
    if (name === "flow.stop")
      return pullCord(store, input, {
        by:
          context.caller || context.mcp
            ? {
                kind: "agent",
                name: `session:${context.caller?.sessionKey || context.caller || "mcp"}`,
              }
            : {
                kind: "person",
                name: context.local ? "cli" : this.operator || "dashboard",
              },
      });
    if (name === "flow.resume") {
      if (context.caller || context.mcp)
        fail(
          "Only a person resumes a pulled stop, in the Avoozl page or the CLI.",
          403,
        );
      return resumeStop(store, input, {
        by: context.local ? "cli" : this.operator || "dashboard",
      });
    }
    // Stop public crews (R85.9): the cord for every public repository, and
    // the crews to pause in Kiro Crew. An agent may stop; only a person
    // resumes (flow.resume).
    if (name === "publiccrews.stop") {
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        crews = await Promise.all(
          publicRepositories(store, policy).map((repository) =>
            readCrews(this.crewReader, repository),
          ),
        ),
        result = stopPublicCrews(
          store,
          { policy, crews },
          {
            by:
              context.caller || context.mcp
                ? {
                    kind: "agent",
                    name: `session:${context.caller?.sessionKey || context.caller || "mcp"}`,
                  }
                : {
                    kind: "person",
                    name: context.local ? "cli" : this.operator || "dashboard",
                  },
            link: ISSUE_RADAR_PATH,
          },
        );
      const changed = result.stops.filter((s) => s.changed);
      if (changed.length)
        queueNotifications(store, [
          {
            channel: "failure",
            title: `Public crews stopped on ${changed.length} ${changed.length === 1 ? "repository" : "repositories"}`,
            text: `${changed.map((s) => s.repository).join(", ")}. ${result.note}`,
            resume: "Press Resume on the Dashboard banner when it is safe.",
          },
        ]);
      return result;
    }
    // Issue Radar's live claims on every registered repository, read from
    // GitHub only (radar-claims.mjs). `refresh` reads GitHub first.
    // The merge path of each Issue Radar repository (RC5.1): three items,
    // read from GitHub; nothing is written.
    // The Release queue (RC4.5): what is released, claimed, next or held, and
    // why. Read only. A Step click is a person's.
    if (name === "radar.releasequeue")
      return releaseQueue(store, planningIdentity(this.workspaceRoot));
    // The Epics screen (read only).
    if (name === "epics.view")
      return epicsView(
        store,
        releaseQueue(store, planningIdentity(this.workspaceRoot)),
      );
    if (name === "radar.releasestep") {
      if (context.caller || context.mcp)
        fail("Only a person releases a phase, in the Avoozl page.", 403);
      return releaseStep(store, input, {
        by: context.local ? "cli" : this.operator || "dashboard",
      });
    }
    // Pull requests Avoozl armed that are still open, and the person-only
    // Disarm (RC5.4).
    if (name === "radar.armed") {
      if (!this.github?.available?.()) return { pullRequests: [] };
      if (!this.backgroundReads) return armedPullRequests(store, this.github);
      const refreshing =
        (!this.armedRead ||
          Date.now() - this.armedRead.at >= RADAR_INTERVAL_MS) &&
        this.refreshLater("radar.armed", async () => {
          const at = Date.now();
          this.armedRead = {
            at,
            value: await armedPullRequests(store, this.github),
          };
        });
      return {
        ...(this.armedRead?.value ?? { pullRequests: [] }),
        ...(refreshing ? { refreshing: true } : {}),
      };
    }
    if (name === "radar.disarm") {
      if (context.caller || context.mcp)
        fail("Only a person disarms auto-merge, in the Avoozl page.", 403);
      this.armedRead = null;
      return disarmPullRequest(store, this.github, input);
    }
    // A person's choice on a source conflict Avoozl asked about (RC28.3).
    if (name === "conflictfix.decide") {
      if (context.caller || context.mcp)
        fail(
          "Only a person decides a source conflict, in the Avoozl page.",
          403,
        );
      return decideConflictFix(store, input);
    }
    // The bound resolver chat's drop check and its one report (RC28.2, RC28.3).
    if (name === "conflictfix.check")
      return checkConflictFix(store, input, context.caller);
    if (name === "conflictfix.report")
      return reportConflictFix(
        store,
        this.github,
        {
          policy: readGitHubPolicyOrNull(this.workspaceRoot),
          delivery: readDeliveryPolicy(this.workspaceRoot).delivery || {},
        },
        input,
        context.caller,
      );
    // The Create and release preflight (RC2.9) was Issue Radar's; no
    // repository is Radar-coded any more (R91.6).
    if (name === "radar.preflight") {
      const plan = store.get("plans", input.planId);
      if (!plan) fail("Plan not found.", 404);
      return { preflight: null };
    }
    // Flow from GitHub data (RC8.5): stage times of Radar issues read before
    // Who codes was removed (R91.6), and every stored build observation.
    // Nothing is read from GitHub here any more.
    if (name === "radar.flow") return radarFlowView(store);
    // Retro rule targets (RC8.6): applied rules with their check, and the
    // apply (a pull request, or the full prompt text to copy) or undo.
    if (name === "radar.retro")
      return {
        rules: retroView(
          store,
          Object.entries(
            store.getMeta("radarFlow")?.repositories ?? {},
          ).flatMap(([repository, entry]) =>
            entry.rows.map((row) => ({ ...row, repository })),
          ),
        ),
      };
    if (name === "radar.retro.apply") {
      if (input.undo) {
        if (!this.github?.available?.()) fail("GitHub is not available.", 503);
        return undoRetroRule(store, this.github, input.id);
      }
      const policy = readGitHubPolicyOrNull(this.workspaceRoot);
      if (!policy?.repositories?.[input.repository])
        fail(`${input.repository} is not a registered repository.`, 404);
      if (input.target !== "prompt" && !this.github?.available?.())
        fail("GitHub is not available.", 503);
      return applyRetroRule(store, this.github, input, {
        check: (text) => {
          const result = checkContent(this.store, {
            boundary: "github",
            repository: input.repository,
            target: "pull-request-text",
            text,
          });
          return [
            ...result.findings.map((f) => `${f.set}/${f.rule}`),
            ...result.unavailable.map((u) => `${u.set} unavailable`),
          ];
        },
      });
    }
    // Integration branches (RC16.3, RC16.8): tasks merged, distance behind the
    // default branch, head checks, acceptance. Landing is a person's approval
    // of one head; Avoozl never merges the branch.
    if (name === "integration.view") return integrationView(store);
    // The landing queues and recent landings, from the store only (Home).
    if (name === "landing.view") return landingView(store, this.read());
    if (name === "integration.land") {
      if (context.caller || context.mcp)
        fail(
          "Only a person approves landing a branch, in the Avoozl page.",
          403,
        );
      return landBranch(store, input, {
        by: context.local ? "cli" : this.operator || "dashboard",
      });
    }
    // An external gap report becomes proposed tasks in the sub-specs; nothing is
    // added until a person accepts (RC17.6).
    if (name === "gap.preview")
      return this.gapPreview(input, {
        local: !(context.caller || context.mcp),
      });
    if (name === "gap.accept") {
      if (context.caller || context.mcp)
        fail("Only a person accepts gap report proposals.", 403);
      const found = await this.gapPreview(input, { local: true }),
        chosen = Array.isArray(input.ids)
          ? found.proposals.filter((p) =>
              input.ids.includes(`${p.spec}:${p.id}`),
            )
          : found.proposals,
        added = [];
      for (const proposal of chosen) {
        const plan = store
          .list("plans")
          .find((entry) => entry.spec === proposal.spec && !entry.deletedAt);
        if (!plan) fail(`Sub-spec ${proposal.spec} is not a plan yet.`, 409);
        const current = store.get("plans", plan.id);
        proposeSpecWork(
          store,
          {
            id: plan.id,
            expectedHash: current.hash,
            proposal: {
              id: proposal.id,
              title: proposal.title,
              kind: "leaf",
              summary: `Gap report: ${proposal.repository} fails ${proposal.requirement}.`,
              acceptance: proposal.acceptance,
            },
          },
          (spec) => this.readSpec(spec),
        );
        added.push(`${proposal.spec}:${proposal.id}`);
      }
      return { added };
    }
    if (name === "radar.mergepath")
      return { repositories: await this.mergePaths(input.repository) };
    // An epic's integration branch (RC16.1): exists, not the default,
    // protected. Read only; refuses a branch that is not ready.
    // Radar's set up steps through gh (RC7.1): a preview of each, or one
    // confirmed step with {step, confirm, previewHash}.
    // The mirror setup buttons (RC27): a dry run, or a confirmed apply with
    // {confirm, previewHash, ticked}. `this.mirrorGit` is a test seam.
    if (name === "mirror.adopt" || name === "mirror.create") {
      if (!input.repository) fail("Name the mirror repository.", 400);
      if (!this.github?.available?.()) fail("GitHub is not available.", 503);
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        key = mirrorEntryKey(policy?.repositories, input);
      return mirrorSetup(
        name === "mirror.adopt" ? "adopt" : "create",
        {
          github: this.github,
          entry: policy?.repositories?.[key] ?? null,
          git: this.mirrorGit ?? mirrorGit,
          identity: instanceIdentity(this.store),
          saveSetting: (_mirror, value, baseBranch) => {
            const file = this.settingsFile(),
              current = file.readGitHubSettings(),
              github = structuredClone(current.github),
              entry = github.repositories?.[key] ?? { baseBranch };
            github.repositories = {
              ...github.repositories,
              [key]: { ...entry, mirror: value },
            };
            file.updateGitHubSettings({ github, expectedHash: current.hash });
            this.configuration?.reload();
          },
          saveMergeMethod: (method) => {
            const file = this.settingsFile(),
              current = file.readGitHubSettings(),
              github = structuredClone(current.github),
              { merge: _old, ...entry } = github.repositories?.[key] ?? {};
            // The landing block holds the method (§4.25); the older
            // `merge.method` is dropped when it is written.
            github.repositories = {
              ...github.repositories,
              [key]: {
                ...entry,
                landing: { ...(entry.landing ?? {}), method },
              },
            };
            file.updateGitHubSettings({ github, expectedHash: current.hash });
            this.configuration?.reload();
          },
        },
        input,
      );
    }
    // Forward one merged mirror change (RC24.9): the Forward button. The
    // person is the signed-in GitHub user, who must pass the actor check.
    if (name === "mirror.forward" || name === "mirror.forward.review") {
      if (!this.github?.available?.()) fail("GitHub is not available.", 503);
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        record = this.store.get("mirror_forward", String(input.id ?? "")),
        entry = record && policy?.repositories?.[record.repository];
      if (!entry?.mirror) fail("That mirror change is not known.", 404);
      const person = (await this.github.currentUser())?.login;
      if (!person) fail("Sign in to GitHub first.", 401);
      const held = await this.github.permission(
          parseRepository(entry.mirror.source),
          person,
        ),
        check = actorAllowed(entry, person, held?.permission ?? held);
      if (!check.allowed) fail(check.reason, 403);
      // The Forward screen's read shows the exact public diff, title and body
      // and pushes nothing; the Forward button pushes only the hash it saw.
      const look = name === "mirror.forward.review",
        result = await forwardRecord(this.store, this.github, record.id, {
          policy,
          person,
          push: !look,
          review: true,
          seenHash: input.seenHash ?? null,
          files: this.repoFiles(),
          ...(this.forwardGit ? { git: this.forwardGit } : {}),
        });
      if (!result.ok && !result.blocked && !result.changed)
        fail(result.reason, 409);
      return result;
    }
    if (name === "radar.setup") {
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        entry = policy?.repositories?.[input.repository];
      if (!input.repository) fail("Name the repository to set up.", 400);
      if (!entry)
        fail(`${input.repository} is not a registered repository.`, 404);
      if (!this.github?.available?.()) fail("GitHub is not available.", 503);
      return radarSetup(this.github, input.repository, entry, input, {
        project: policy.project ?? null,
        // The pull request text goes through content rules before any write.
        check: (text) => {
          const result = checkContent(this.store, {
            boundary: "github",
            repository: input.repository,
            target: "pull-request-text",
            text,
          });
          return [
            ...result.findings.map((f) => `${f.set}/${f.rule}`),
            ...result.unavailable.map((u) => `${u.set} unavailable`),
          ];
        },
      });
    }
    // The public sign-off for one registered repository (R85.8, RC10.1):
    // person only. `radar.signoff` is the older name of the same operation.
    if (name === "publiccrews.signoff" || name === "radar.signoff")
      return signOff(store, readGitHubPolicyOrNull(this.workspaceRoot), input, {
        by: this.operator,
      });
    if (name === "radar.integrationbranch") {
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        entry = policy?.repositories?.[input.repository];
      if (!input.repository || !input.branch)
        fail("Name the repository and the integration branch.", 400);
      if (!entry)
        fail(`${input.repository} is not a registered repository.`, 404);
      if (!this.github?.available?.()) fail("GitHub is not available.", 503);
      return requireIntegrationBranch(
        await checkIntegrationBranch(
          this.github,
          input.repository,
          input.branch,
          entry,
        ),
      );
    }
    // The values only the owner can enter in Issue Radar, with a re-read
    // when Radar's own read is available (RC7.2, RC7.3). Writes nothing.
    if (name === "radar.values") {
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        entry = policy?.repositories?.[input.repository];
      if (!input.repository) fail("Name the repository to set up.", 400);
      if (!entry)
        fail(`${input.repository} is not a registered repository.`, 404);
      const values = radarValues({
        repository: input.repository,
        settings: entry,
        crew: input.crew ?? entry.radar?.crew,
      });
      // Radar's crew list, read through the gateway grant when there is one.
      const crews = await readCrews(this.crewReader, input.repository),
        read = crews.available
          ? {
              connected: [input.repository],
              crews: crews.crews,
              needsHumanLabel: crews.needsHumanLabel,
              claimTtlHours: crews.claimTtlHours,
            }
          : null;
      return {
        repository: input.repository,
        ...radarReread(values, read, crews.reason),
      };
    }
    if (name === "radar.crews") {
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        repositories = Object.keys(policy?.repositories || {}),
        github = policy?.mode && this.github?.available?.();
      const shaped = (view, strip) =>
        // Behind the grant only: without it the view is the GitHub-only one.
        strip
          ? {
              ...view,
              unseen: view.unseen.filter((name) => name !== "paused"),
              crewStrip: strip,
            }
          : view;
      if (this.backgroundReads && input.refresh !== true) {
        const now = Date.now(),
          stale =
            (github && !claimsFresh(store, now)) ||
            (this.crewReader &&
              repositories.length > 0 &&
              (!this.crewStrip ||
                now - this.crewStrip.at >= RADAR_INTERVAL_MS));
        const refreshing =
          (stale || this.refreshing.has("radar.crews")) &&
          this.refreshLater("radar.crews", async () => {
            // Side by side: a slow GitHub does not hold the crew strip. The
            // strip's costs are for the claims read last.
            await Promise.all([
              github && refreshClaims(store, this.github, policy),
              readCrewStrip({
                crewReader: this.crewReader,
                sessionsReader: this.sessionsReader,
                repositories,
                rows: claimsView(store).rows,
              }).then((value) => {
                this.crewStrip = { at: Date.now(), value };
              }),
            ]);
          });
        const view = shaped(claimsView(store), this.crewStrip?.value ?? null);
        return refreshing ? { ...view, refreshing: true } : view;
      }
      // Read at most every 2 minutes, however often the Dashboard asks.
      if (github)
        await refreshClaims(store, this.github, policy, {
          force: input.refresh === true,
        });
      const view = claimsView(store),
        strip = await readCrewStrip({
          crewReader: this.crewReader,
          sessionsReader: this.sessionsReader,
          repositories,
          rows: view.rows,
        });
      this.crewStrip = { at: Date.now(), value: strip };
      return shaped(view, strip);
    }
    // The Untriaged list (§8.5): cached GitHub items no rule, triage label,
    // or task covers. `refresh` reads GitHub first (Check now); read only.
    if (name === "untriaged.view") {
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        tasks = this.read().tasks;
      if (input.refresh === true && policy?.mode && this.github?.available?.())
        await refreshUntriaged(store, this.github, policy, tasks, {
          force: true,
          namespace: namespaceOf(this.workspaceRoot),
        });
      // Check now also polls each plugin source once (R50.16).
      if (input.refresh === true && this.plugins) await this.pollNow();
      // The Intake tab: GitHub's Untriaged list plus every other source's
      // items (design §4.12, §8.5).
      const tab = intakeTab(
        untriagedView(
          policy,
          tasks,
          readCache(store),
          Date.now(),
          handoffReceipts(store),
          reviewChats(store),
        ),
        store,
        declaredSources(this.pluginOptions, store),
      );
      // The Public crews card (R85.8): each public repository's checklist.
      return { ...tab, publicCrews: publicCrewsView(store, policy) };
    }
    // Incoming items (§4.12). Submit runs the pipeline at once, under the
    // tick's lock; list and view only read.
    if (name === "intake.submit")
      return withWorkLock(store, WORKSPACE_LOCK, async () => {
        const { notify, ...result } = submitItems(
          store,
          sourceMap(this.pluginOptions, store),
          readGitHubPolicyOrNull(this.workspaceRoot),
          input,
        );
        queueNotifications(store, notify);
        return result;
      });
    if (name === "intake.list") return listItems(store, input);
    // Manual tasks and task links (§4.16, R61.12–R61.22).
    if (name === "task.manual.complete" || name === "task.manual.reopen") {
      if (context.caller || context.mcp)
        fail(
          "Only a person marks a manual task done or reopens it, in the Avoozl page or the CLI.",
          403,
        );
      const taskId = resolveTaskId(this.read(), input.taskId),
        by = context.local ? "cli" : this.operator || "person",
        github = this.github,
        policy = this.workspaceRoot
          ? readGitHubPolicyOrNull(this.workspaceRoot)
          : null;
      return name === "task.manual.complete"
        ? completeManual(store, { ...input, taskId }, { by, github, policy })
        : reopenManual(store, { taskId }, { by, github });
    }
    if (name.startsWith("task.notes.")) {
      if (typeof input.taskId !== "string" || !input.taskId)
        fail("Name the task: taskId.");
      const data = this.read(),
        task = data.tasks.find(
          (t) => t.id === resolveTaskId(data, input.taskId),
        );
      if (!task) fail(`No task ${input.taskId}.`, 404);
      if (name === "task.notes.list") return notesView(store, task.id);
      if (name === "task.notes.add")
        return addNote(store, task, input, {
          author: noteAuthor(store, task.id, context, this.operator),
        });
      if (context.caller || context.mcp)
        fail(
          "Only a person edits, removes or shows a link, in the Avoozl page or the CLI.",
          403,
        );
      if (name === "task.notes.edit") return editNote(store, task, input);
      if (name === "task.notes.remove") return removeNote(store, task, input);
      if (name === "task.notes.show") return showNote(store, task, input);
    }
    if (name === "intake.view") return viewItem(store, input);
    if (name === "intake.sources") {
      const counts = sourceCounts(store),
        none = { total: 0, untriaged: 0, lastAt: null },
        policy = readGitHubPolicyOrNull(this.workspaceRoot),
        reads = githubReads(store),
        same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
      return {
        sources: declaredSources(this.pluginOptions, store).map(
          ({ id, scope, entry, error, source }) => {
            // A GitHub source (§4.39): its repository's read, and the Issue
            // Radar escalation label its Triage rows open first with.
            if (source?.via === "github") {
              const read = reads.find((r) =>
                  same(r.repository, source.repository),
                ),
                configured = Object.entries(policy?.repositories || {}).find(
                  ([repository]) => same(repository, source.repository),
                )?.[1];
              return {
                id,
                scope,
                entry,
                error,
                state: read
                  ? { cursor: null, readAt: read.checkedAt, error: read.error }
                  : null,
                items: null,
                escalationLabel: configured?.crewLabels?.needsHuman ?? null,
              };
            }
            return {
              id,
              scope,
              entry,
              error,
              state: id ? sourceRowOf(store, `source:${id}`) : null,
              items: (id && counts.get(id)) || none,
            };
          },
        ),
        github: {
          mode: policy?.mode ?? null,
          repositories: reads,
          items: counts.get("github") || none,
        },
      };
    }
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
    if (name === "intake.confirm")
      return withWorkLock(store, WORKSPACE_LOCK, async () =>
        confirmSnapshot(store, input),
      );
    if (name === "intake.deliver" || name === "intake.plan") {
      const action = name === "intake.deliver" ? "deliver" : "plan",
        policy = readGitHubPolicyOrNull(this.workspaceRoot);
      // A GitHub item (R102.19): its two writes need the GitHub client.
      if (input.source === "github")
        return withWorkLock(store, WORKSPACE_LOCK, async () =>
          startGitHubItem(store, this.github, policy, { ...input, action }),
        );
      return withWorkLock(store, WORKSPACE_LOCK, async () =>
        startByPerson(store, sourceMap(this.pluginOptions, store), policy, {
          ...input,
          action,
        }),
      );
    }
    if (name === "intake.source.add" || name === "intake.source.remove") {
      if (!this.pluginOptions.workspaceRoot)
        fail("Intake sources need a workspace root.", 409);
      return {
        sources: editSource(this.pluginOptions, {
          ...input,
          remove: name === "intake.source.remove",
        }).map(({ id, scope, entry, error }) => ({ id, scope, entry, error })),
      };
    }
    // Code review (§8.5): queue one review chat for a pull request; the
    // tick cron opens it. Person-only, like Send to Issue Radar.
    if (name === "review.chat.show") return showReviewChat(store, input.id);
    if (name === "review.chat") {
      if (context.caller || context.mcp)
        fail(
          "Only a person starts a code review chat, from the Avoozl page.",
          403,
        );
      return requestReviewChat(
        store,
        readGitHubPolicyOrNull(this.workspaceRoot),
        this.read().tasks,
        input,
        this.reviewOptions,
      );
    }
    // Send to Issue Radar (§8.5, R52): the repository's crews, then the
    // label write. The app backend lets only an owner session hand off.
    if (name === "untriaged.crews") {
      if (!input.repository) fail("Name one repository as owner/repository.");
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        repository = Object.keys(policy?.repositories || {}).find(
          (entry) => entry === input.repository,
        );
      if (!repository)
        fail(`${input.repository} is not a registered repository.`, 404);
      return readCrews(this.crewReader, repository);
    }
    // Plan this on a GitHub Intake row of a Radar-coded repository: the
    // planner chat's seed, with the issue recorded as the plan's source.
    if (name === "untriaged.plan") {
      if (context.caller || context.mcp)
        fail("Only a person starts planning, from the Avoozl page.", 403);
      const policy = readGitHubPolicyOrNull(this.workspaceRoot),
        { fields, source } = await planThisRequest(
          this.github,
          policy,
          untriagedView(
            policy,
            this.read().tasks,
            readCache(store),
            Date.now(),
            handoffReceipts(store),
          ),
          input,
        );
      const repositories = workspaceRepositories(store).filter(
          (repo) => !repo.planning,
        ),
        // The issue names its GitHub repository; the plan names the
        // workspace repository that holds it, whose id is its own.
        workspaceId = (github) =>
          repositories.find(
            (repo) =>
              repo.id === github ||
              String(repo.github ?? "").toLowerCase() === github.toLowerCase(),
          )?.id ?? github;
      return requestNewPlan(
        store,
        { ...fields, repositories: fields.repositories.map(workspaceId) },
        {
          readSpec: (spec) => this.readSpec(spec),
          repositories,
          specRoot: this.specRoots()[0] || null,
          template: (ref) => pickTemplate(this.pluginOptions, ref),
        },
        source,
      );
    }
    // R103.5: one previewed, paced crew:avoozl backfill on old task issues.
    if (name === "github.crewlabel.backfill") {
      if (context.caller || context.mcp)
        fail(
          "Only a person adds crew:avoozl to old task issues, from the Avoozl page.",
          403,
        );
      return crewLabelBackfill(store, this.github, input);
    }
    // Spec pull requests (R107): the view reads the store only.
    if (name === "specpr.view") return { items: specPullView(store) };
    if (name.startsWith("specpr.") && name !== "specpr.view") {
      if (context.caller || context.mcp)
        fail("Only a person acts on a spec pull request, from the page.", 403);
      const policy = readGitHubPolicyOrNull(this.workspaceRoot);
      if (name === "specpr.adopt") {
        const repository = String(input.repository ?? ""),
          entry = (
            readCache(store).repositories?.[repository]?.items || []
          ).find((item) => item.number === input.number),
          found = entry && specPullOf(entry, roleOf(policy, repository));
        if (!found)
          fail("That pull request is not a spec-only pull request.", 404);
        const receipt = await adoptPull(store, this.github, {
          repository,
          entry,
          spec: found.spec,
          link: "person",
          actor: this.operator,
        });
        if (!receipt)
          fail("The pull request holds no spec files to review.", 409);
        return { id: receipt.id, spec: receipt.spec };
      }
      if (name === "specpr.reject")
        return rejectPull(store, this.github, input);
      if (name === "specpr.requestChanges")
        return requestChanges(store, this.github, input);
      fail(`Unknown operation ${name}.`, 404);
    }
    if (name === "untriaged.handoff") {
      if (context.caller || context.mcp)
        fail(
          "Only a person sends issues to Issue Radar, from the Avoozl page.",
          403,
        );
      return handOff(
        store,
        this.github,
        readGitHubPolicyOrNull(this.workspaceRoot),
        this.read().tasks,
        input,
        { reader: this.crewReader },
      );
    }
    if (name === "task.detail") {
      const data = this.read(),
        detail = this.detail(input.id),
        plan = detail.planId ? store.get("plans", detail.planId) : null;
      const view = taskDetailView(store, data, detail, {
        plan: plan && !plan.deletedAt ? plan : null,
        approved: Boolean(plan && this.planApproved(plan)),
        config: this.savedConfig(),
      });
      return {
        ...view,
        summary: taskSummaryView(store, view.task.id, summaryFacts(view)),
      };
    }
    // The page asks for the AI summary of the inputs it shows; the same
    // inputs never write a second one (task-summary.mjs).
    if (name === "task.summary.request") {
      const data = this.read(),
        detail = this.detail(input.id),
        plan = detail.planId ? store.get("plans", detail.planId) : null,
        view = taskDetailView(store, data, detail, {
          plan: plan && !plan.deletedAt ? plan : null,
          approved: Boolean(plan && this.planApproved(plan)),
        });
      return requestTaskSummary(store, view.task.id, summaryFacts(view), {
        retry: input.retry === true,
      });
    }
    if (name === "tasksummary.submit")
      return submitTaskSummary(store, input, context.caller);
    if (name === "plan.spec.read") return this.readSpecDocuments(input);
    if (name === "task.files") return taskFiles(store, this.read(), input);
    if (name === "task.diff") return taskDiff(store, this.read(), input);
    if (name === "task.change.preview") return this.previewTaskChange(input);
    if (name === "conflicts.settle")
      return settleConflicts(store, input, expectedRevision);
    if (name === "state") return this.read();
    // The one conversation setting still in effect: auto-archive on acceptance.
    if (name === "conversations.settings.get")
      return conversationSettings(store);
    if (name === "conversations.settings.update")
      return this.configuration
        ? this.configuration.updateConversationSettings(input).settings
        : store.transaction(() => {
            if (typeof input.autoArchiveCompleted !== "boolean")
              fail("Choose whether completed conversations auto-archive.");
            const settings = {
              autoArchiveCompleted: input.autoArchiveCompleted,
            };
            store.setMeta("conversationSettings", settings);
            return settings;
          });
    if (name === "query") {
      // Each row says the state the page shows for it, beside its status.
      const data = this.read();
      return queryTasks(data, {
        scope: "all",
        ...input,
        claimed: claimedOrNone(store),
      }).map(withGraphState(store, data));
    }
    if (name === "task.get")
      return withGraphState(store, this.read())(this.detail(input.id));
    if (name === "report.save")
      return store.mutate(
        "Save report " + (input.title || ""),
        (data) => {
          if (
            input.id !== undefined &&
            (typeof input.id !== "string" ||
              !/^report-[a-z0-9-]{4,80}$/.test(input.id))
          )
            fail("Invalid report id.");
          if (
            typeof input.title !== "string" ||
            !input.title.trim() ||
            input.title.length > 160
          )
            fail("Report title must contain 1–160 characters.");
          if (
            input.view !== undefined &&
            !["overview", "tasks", "epics", "graph", "documents"].includes(
              input.view,
            )
          )
            fail("Unknown report view.");
          if (
            input.filters !== undefined &&
            (!input.filters ||
              typeof input.filters !== "object" ||
              Array.isArray(input.filters))
          )
            fail("Report filters must be an object.");
          const filters = {};
          for (const key of [
            "query",
            "scopes",
            "work",
            "statuses",
            "epics",
            "tracks",
            "tags",
            "activity",
            "historical",
          ]) {
            if (!Object.hasOwn(input.filters || {}, key)) continue;
            const value = input.filters[key];
            if (
              key === "historical"
                ? typeof value !== "boolean"
                : key === "query"
                  ? typeof value !== "string" || value.length > 2000
                  : !Array.isArray(value) ||
                    value.length > 500 ||
                    value.some(
                      (item) => typeof item !== "string" || item.length > 2000,
                    )
            )
              fail("Invalid report filter " + key + ".");
            filters[key] = structuredClone(value);
          }
          data.savedSearches ??= [];
          const now = new Date().toISOString(),
            existing = input.id
              ? data.savedSearches.find((item) => item.id === input.id)
              : null,
            record = {
              id: existing?.id || "report-" + randomUUID().slice(0, 12),
              title: input.title.trim(),
              view: input.view || existing?.view || "tasks",
              filters,
              createdAt: existing?.createdAt || now,
              updatedAt: now,
            };
          if (input.id && !existing) fail("Saved report not found.", 404);
          if (existing)
            data.savedSearches[data.savedSearches.indexOf(existing)] = record;
          else data.savedSearches.push(record);
          return record;
        },
        expectedRevision,
      );
    if (name === "report.delete")
      return store.mutate(
        "Delete report " + input.id,
        (data) => {
          if (typeof input.id !== "string") fail("Invalid report id.");
          const existing = data.savedSearches?.find(
            (item) => item.id === input.id,
          );
          if (!existing) fail("Saved report not found.", 404);
          data.savedSearches = data.savedSearches.filter(
            (item) => item.id !== input.id,
          );
          return existing;
        },
        expectedRevision,
      );
    if (name === "agent.instructions.source") {
      const source = store.read().agentInstructionSource,
        snapshot = store.getMeta("agentInstructionSourceSnapshot");
      if (!source)
        fail("No .avoozl.json instructions have been synchronized.", 404);
      if (
        !snapshot ||
        snapshot.path !== source.path ||
        snapshot.hash !== source.hash
      )
        fail(
          "The synchronized .avoozl.json snapshot is unavailable. Sync it again.",
          409,
        );
      if (input.repositoryId !== undefined) {
        const selected = snapshot.sources?.find(
          (entry) => entry.repositoryId === input.repositoryId,
        );
        if (!selected)
          fail(
            "No .avoozl.json instructions were synchronized for that repository.",
            404,
          );
        return selected;
      }
      return snapshot;
    }
    if (name === "agent.instructions.toggle")
      return store.mutate(
        (input.enabled ? "Enable " : "Disable ") +
          "agent instruction " +
          input.id,
        (data) =>
          toggleAgentInstruction(data, input.id, Boolean(input.enabled)),
        expectedRevision,
      );
    if (["task.archive", "task.unarchive"].includes(name))
      return store.mutate(
        (name === "task.archive" ? "Archive " : "Restore ") + input.id,
        (data) => {
          const task = data.tasks.find((item) => item.id === input.id);
          if (!task) fail("Task not found.", 404);
          if (name === "task.archive") {
            // Why it was archived, such as "plan removed" (Requirement 59.4:
            // a plan is done when each task is done or archived with a reason).
            if (input.reason !== undefined) {
              if (
                typeof input.reason !== "string" ||
                !input.reason.trim() ||
                input.reason.length > 200 ||
                /[\r\n]/.test(input.reason)
              )
                fail("reason is one line of 1–200 characters.");
              task.archivedReason = input.reason.trim();
            }
            return archiveTask(task);
          }
          delete task.archivedReason;
          task.archivedAt = null;
          task.updatedAt = new Date().toISOString();
          return task;
        },
        expectedRevision,
      );
    // Archive or unarchive a plan (plan-archive.mjs): a session may too
    // (R56.4), and either one undoes the other. Delete below is the one-way path.
    if (name === "plan.archive" || name === "plan.unarchive") {
      const plan = store.get("plans", input.id);
      if (!plan || plan.deletedAt) fail("Plan not found.", 404);
      return (name === "plan.archive" ? archivePlan : unarchivePlan)(
        store,
        plan,
        {
          // A session is recorded as itself, never as the operator.
          by:
            context.caller || context.mcp
              ? `session:${context.caller?.sessionKey || context.caller || "mcp"}`
              : this.operator || null,
        },
      );
    }
    // Delete a plan (plan-retire.mjs): only a person, from the page or the
    // CLI. A plan with an approved revision needs {retire: true}.
    if (name === "plan.delete.preview" || name === "plan.delete") {
      if (name === "plan.delete" && (context.caller || context.mcp))
        fail(
          "Only a person deletes a plan, from the Avoozl page or the CLI.",
          403,
        );
      // The id, or a spec name (the CLI passes either); a name shared by
      // two plans is refused instead of guessed.
      let plan = store.get("plans", input.id);
      if (!plan && typeof input.id === "string") {
        const named = store
          .list("plans")
          .filter((row) => row.spec === input.id && !row.deletedAt);
        if (named.length > 1)
          fail(
            "More than one plan uses spec " +
              input.id +
              ". Use a plan id: " +
              named.map((row) => row.id).join(", "),
            409,
          );
        plan = named[0];
      }
      if (!plan || plan.deletedAt) fail("Plan not found.", 404);
      let folder = null;
      if (plan.spec)
        try {
          const spec = this.readSpec(plan.spec);
          folder = spec.exists ? specFolderState(spec.root, plan.spec) : null;
        } catch {
          folder = null;
        }
      if (name === "plan.delete.preview")
        return deletePreview(store, this.read(), plan, folder);
      return deletePlan(store, plan, {
        retire: input.retire === true,
        deleteSpecFolder: input.deleteSpecFolder === true,
        folder,
      });
    }
    if (name === "plan.restore")
      return store.transaction(() => {
        const row = store.get("plans", input.id);
        if (!row) fail("Record not found.", 404);
        if (row.state === "approved" || Object.keys(row.mapping || {}).length)
          fail(
            "Approved plans keep their task and approval history. Abandon the linked work instead.",
            409,
          );
        delete row.deletedAt;
        store.put("plans", row);
        store.event(null, name, { id: row.id });
        return { id: row.id, deletedAt: null };
      });
    // Saved views and presentations are display configuration. Deleting one
    // removes that configuration only: tasks, plans and evidence are untouched.
    if (name === "visualization.delete") {
      if (typeof input.id !== "string" || !input.id)
        fail("Name the saved view to delete.");
      const tours = input.kind === "tour",
        list = tours ? "tours" : "views",
        label = tours ? "presentation" : "view";
      let removed = null;
      store.mutate(
        "Delete saved " + label,
        (data) => {
          data.presentation ??= {};
          data.presentation[list] ??= [];
          removed =
            data.presentation[list].find((v) => v.id === input.id) || null;
          if (!removed) fail("Saved " + label + " not found.", 404);
          data.presentation[list] = data.presentation[list].filter(
            (v) => v.id !== input.id,
          );
          if (data.presentation.activeVisualization?.id === input.id)
            delete data.presentation.activeVisualization;
          if (data.presentation.activeTour?.id === input.id)
            delete data.presentation.activeTour;
          // A presentation step cannot point at a view that no longer exists.
          if (!tours) {
            const kept = [];
            for (const tour of data.presentation.tours || []) {
              tour.steps = (tour.steps || []).filter(
                (step) => step.viewId !== input.id,
              );
              if (tour.steps.length) kept.push(tour);
              else if (data.presentation.activeTour?.id === tour.id)
                delete data.presentation.activeTour;
            }
            if (data.presentation.tours) data.presentation.tours = kept;
          }
        },
        expectedRevision,
      );
      return { id: input.id, kind: label, title: removed?.title || input.id };
    }
    if (name === "trash")
      return {
        plans: store
          .list("plans")
          .filter((p) => p.deletedAt)
          .slice(-100)
          .map((p) => ({ id: p.id, title: p.title })),
      };
    if (name === "task.sessions") {
      const task = this.read().tasks.find((t) => t.id === input.id);
      if (!task) fail("Task not found.", 404);
      return kiroCrewSessions(store, task.id).map((session) => ({
        id: session.slot,
        taskId: task.id,
        title: `${session.role} attempt ${session.attempt}`,
        state: session.status,
        provider: "kiro-crew",
        url: session.url,
      }));
    }
    if (name === "plan.list") return planPage(store, input);
    if (name === "plan.specs") return this.specList();
    // Epics span plans (Requirement 59): every approved epic and every epic
    // folder on disk not yet approved, each with computed progress.
    if (name === "epic.list" || name === "epic.get") {
      const data = this.read(),
        folders = (() => {
          try {
            return this.specList().items.filter((item) => item.kind === "epic");
          } catch {
            return [];
          }
        })(),
        approved = crossPlanEpics(data),
        ids = [
          ...approved.map((epic) => epic.id),
          ...folders
            .map((item) => item.name)
            .filter((id) => !approved.some((epic) => epic.id === id)),
        ],
        view = (id) => {
          const folder = folders.find((item) => item.name === id);
          return epicView(store, data, {
            id,
            spec: folder ? this.readSpec(id) : null,
            members: folder?.members
              ? [...new Set(folder.members.map((member) => member.plan))]
              : null,
          });
        };
      if (name === "epic.get") {
        if (typeof input.id !== "string" || !input.id)
          fail(
            "Name the epic: {id}, its spec folder name. plans_plan epics lists them.",
          );
        if (!ids.includes(input.id)) fail(`No epic ${input.id}.`, 404);
        return view(input.id);
      }
      return {
        revision: data.revision,
        items: ids.map((id) => {
          const { requirements, design, ...summary } = view(id);
          return summary;
        }),
      };
    }
    if (name === "plan.table") {
      const specs = (() => {
        // A workspace with no spec folders for its mode still has stored
        // plans; the table shows those, and the folder problem with them.
        try {
          const list = this.specList();
          return { ...list, problem: list.homeErrors?.join(" ") || null };
        } catch (error) {
          return { root: null, items: [], problem: error.message };
        }
      })();
      const stored = store
        .list("plans")
        .filter(
          (plan) => !plan.deletedAt && (plan.kind || "plan") !== "conversation",
        );
      return {
        root: specs.root,
        problem: specs.problem,
        // The folders' own summaries, for the detail a row opens.
        specs: specs.items,
        ...plansTableView(store, this.read(), {
          specs: specs.items,
          stored,
          categoryOf: (plan) =>
            plan.spec
              ? specCategory(plan.files)
              : frontMatterCategory(plan.text),
        }),
      };
    }
    if (name === "document.get") {
      const doc = this.read().documents[input.id];
      if (!doc) fail("Document not found.", 404);
      return doc;
    }
    if (name === "workspace") {
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
        projects: store.list("projects"),
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
    }
    // Settings view (§8): the GitHub policy in `.avoozl.json`. Creates no
    // GitHub object; the Set up GitHub wizard (task 3.18) does that. With a
    // GitHub client, a validate or save also reads each repository's default
    // branch, because GitHub closes issues only from merges into it (R16.5).
    if (name === "github.settings.get") return this.githubSettings();
    // Settings > Triggers: what one `match` line means, and the open issues
    // it matches now. Read only.
    if (name === "github.trigger.preview")
      return triggerPreview(this.github, input);
    // Settings > Untriaged: the repository's label names, for the triage
    // label checkboxes. Read only.
    if (name === "github.repository.labels") {
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
    }
    // Read only: a repository's base-branch review rule and the check names
    // GitHub shows for it, for the Settings Reviews and Checks tabs.
    if (name === "github.repository.inspect") {
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
    }
    if (name === "github.settings.validate") {
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
    }
    // Set up GitHub wizard (§8.2): a preview, or with {confirm, previewHash}
    // the writes it previewed. `.avoozl.json` is saved by settings.update.
    if (name === "github.setup")
      return githubSetup(
        {
          github: this.github,
          settings: this.settingsFile().readGitHubSettings(),
          milestones: this.setupMilestones(input.mode),
        },
        input,
      );
    // Stop a running Set up GitHub apply before its next write.
    if (name === "github.setup.cancel") return cancelSetup(input.previewHash);
    if (name === "github.settings.update") {
      const policy = normalizeGitHubPolicy(policySection(input.github));
      if (this.github?.available?.())
        await requireDefaultBranches(policy, this.github);
      await requireMirrorsPrivate(policy, this.github);
      await requirePlansBranches(policy, this.github, { create: true });
      this.settingsFile().updateGitHubSettings(input);
      this.cachePolicy = null;
      this.configuration?.reload();
      return this.githubSettings();
    }
    if (name === "configuration.get")
      return this.settingsFile().readConfiguration(input.scope ?? "repository");
    if (name === "configuration.update") {
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
    }
    if (name === "local.ignore.status") return globalLocalIgnoreStatus();
    if (name === "local.ignore.fix") return ensureGlobalLocalIgnore();
    if (name === "task.capture")
      return store.mutate(
        "Capture prompt",
        (data) => captureTask(data, input),
        expectedRevision,
      );
    if (name === "intent.submit")
      return this.submitIntent(input, expectedRevision);
    if (name === "intent.get") {
      const receipt = store.get("receipts", "intent:" + input.submissionId);
      if (!receipt) fail("Submission not found.", 404);
      return this.intentResult(receipt);
    }
    if (name === "task.update") {
      const reviewers = reviewRoles(readDeliveryPolicy(this.workspaceRoot));
      return store.mutate(
        "Update " + input.id,
        (data) => {
          let task = data.tasks.find((t) => t.id === input.id);
          if (!task) {
            if (!input.create || !/^[a-z][a-z0-9-]{2,80}$/.test(input.id || ""))
              fail("Task not found.", 404);
            requireDistinctTask(data, { ...input, id: input.id });
            task = {
              id: input.id,
              scope: "catalog",
              kind: "task",
              status: "planned",
              track: "catalog",
              tags: [],
            };
            data.tasks.push(task);
          }
          refuseGateBypass(data, task, input, reviewers);
          if (
            input.title &&
            (input.title !== task.title || input.distinctReason)
          ) {
            const candidates = requireDistinctTask(data, {
              ...input,
              id: task.id,
            });
            if (input.distinctReason?.trim())
              task.distinctFrom = {
                ...task.distinctFrom,
                ...Object.fromEntries(
                  candidates.map((t) => [t.id, input.distinctReason.trim()]),
                ),
              };
          }
          for (const key of [
            "title",
            "summary",
            "status",
            "phase",
            "track",
            "tags",
            "notes",
            "nextAction",
            "acceptance",
            "owner",
            "overview",
            "rank",
            "needsReview",
            "evidence",
            "resources",
            "kind",
            "route",
            "completion",
            "repository",
            "checks",
            "parent",
          ])
            if (Object.hasOwn(input, key)) task[key] = input[key];
          // A task's epic is its plan's (Requirement 59.2): only a stale
          // value from before that rule may be cleared, with epic: null.
          if (Object.hasOwn(input, "epic")) {
            if (input.epic !== null)
              fail(
                "A task names no epic: its plan does. Send epic: null to clear an old value.",
              );
            delete task.epic;
          }
          if (input.kind === "epic")
            fail('kind "epic" is not a task kind: write "package".');
          if (task.phase === null) delete task.phase;
          else if (
            task.phase !== undefined &&
            (!task.phase ||
              typeof task.phase !== "object" ||
              typeof task.phase.id !== "string" ||
              !/^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/.test(task.phase.id) ||
              typeof task.phase.title !== "string" ||
              !task.phase.title.trim() ||
              task.phase.title.length > 240 ||
              Object.keys(task.phase).some(
                (key) => !["id", "title"].includes(key),
              ))
          )
            fail("phase is {id, title}, or null for No phase.");
          // Authority changes only through projection or taking a task back.
          if (Object.hasOwn(input, "authority"))
            fail("Authority changes only through projection.", 409);
          // A title is checked when it is set. A row imported before the
          // limit keeps its long title through edits of other fields.
          if (
            (Object.hasOwn(input, "title") || input.create) &&
            (typeof task.title !== "string" ||
              !task.title.trim() ||
              task.title.length > 240)
          )
            fail("Title must contain 1–240 characters.");
          for (const key of [
            "summary",
            "notes",
            "nextAction",
            "owner",
            "repository",
            "parent",
          ])
            if (task[key] !== undefined && typeof task[key] !== "string")
              fail(key + " must be text.");
          for (const key of [
            "tags",
            "acceptance",
            "evidence",
            "resources",
            "checks",
          ])
            if (
              task[key] !== undefined &&
              (!Array.isArray(task[key]) ||
                task[key].some((v) => typeof v !== "string"))
            )
              fail(key + " must be a list of strings.");
          if (!data.tracks.some((t) => t.id === task.track))
            fail("Unknown track.");
          if (input.requires !== undefined) {
            // Each entry is a task ID, or {task, condition} naming the
            // completion level the dependency must reach (design §4.3).
            if (
              !Array.isArray(input.requires) ||
              input.requires.some(
                (x) =>
                  typeof x !== "string" &&
                  (typeof x?.task !== "string" ||
                    !COMPLETIONS.includes(x.condition)),
              )
            )
              fail(
                "Requires must contain task IDs or {task, condition} with a known completion.",
              );
            data.edges = data.edges.filter(
              (e) => e.to !== task.id || e.kind !== "requires",
            );
            const conditions = new Map();
            for (const entry of input.requires) {
              const from = resolveTaskId(
                data,
                typeof entry === "string" ? entry : entry.task,
              );
              if (!conditions.has(from) || typeof entry !== "string")
                conditions.set(
                  from,
                  typeof entry === "string" ? undefined : entry.condition,
                );
            }
            for (const [from, condition] of conditions)
              data.edges.push({
                id: `${from}:requires:${task.id}`,
                from,
                to: task.id,
                kind: "requires",
                ...(condition ? { condition } : {}),
                reason: "Authored task dependency.",
              });
          }
          if (input.sequence !== undefined) {
            // Order-only prerequisites: task IDs this task runs after.
            if (
              !Array.isArray(input.sequence) ||
              input.sequence.some((x) => typeof x !== "string")
            )
              fail("Sequence must contain task IDs.");
            data.edges = data.edges.filter(
              (e) => e.to !== task.id || e.kind !== "sequence",
            );
            for (const from of new Set(
              input.sequence.map((x) => resolveTaskId(data, x)),
            ))
              data.edges.push({
                id: `${from}:sequence:${task.id}`,
                from,
                to: task.id,
                kind: "sequence",
                reason: "Authored task order.",
              });
          }
          if (input.requires !== undefined || input.sequence !== undefined)
            refuseCycle(data, task.id);
          if (Object.hasOwn(input, "integration")) {
            const receipt = input.integration;
            if (
              !receipt ||
              typeof receipt !== "object" ||
              Array.isArray(receipt) ||
              typeof receipt.commit !== "string" ||
              typeof receipt.at !== "string" ||
              !/^[a-f0-9]{7,64}$/i.test(receipt.commit || "") ||
              !Number.isFinite(Date.parse(receipt.at)) ||
              Date.parse(receipt.at) > Date.now() + 60000 ||
              typeof receipt.branch !== "string" ||
              !receipt.branch.trim() ||
              receipt.branch.length > 240 ||
              typeof receipt.repo !== "string" ||
              !receipt.repo.trim() ||
              receipt.repo.length > 1000 ||
              !Array.isArray(receipt.evidence) ||
              !receipt.evidence.length ||
              receipt.evidence.some(
                (e) => typeof e !== "string" || !e.trim() || e.length > 2000,
              )
            )
              fail(
                "Integration requires a commit, landing time, branch, repository and evidence.",
              );
            task.integration = {
              commit: receipt.commit,
              at: new Date(receipt.at).toISOString(),
              branch: receipt.branch,
              repo: receipt.repo,
              evidence: [...new Set(receipt.evidence)],
              recordedAt: new Date().toISOString(),
            };
            task.evidence = [
              ...new Set([...(task.evidence || []), ...receipt.evidence]),
            ];
          }
          task.statusAuthority = "database";
          task.updatedAt = new Date().toISOString();
          task.needsReview = input.needsReview ?? false;
          return task;
        },
        expectedRevision,
      );
    }
    if (name === "activity")
      return store.mutate(
        "Report activity",
        (data) => applyActivity(data, input),
        expectedRevision,
      );
    if (name === "plan.classify")
      return store.mutate(
        "Classify " + input.id,
        (data) => {
          applyPlanMetadata(data, input.id, input);
          return data.documents[input.id];
        },
        expectedRevision,
      );
    if (name === "document.update")
      return store.mutate(
        "Edit " + input.id,
        (data) => {
          const doc = data.documents[input.id];
          if (!doc) fail("Document not found.", 404);
          if (doc.hash !== input.expectedHash) fail("Document changed.", 409);
          if (typeof input.text !== "string" || input.text.length > 1000000)
            fail("Document text is required.");
          const oldHash = doc.hash,
            before = blocks(doc.text || ""),
            after = blocks(input.text);
          doc.text = input.text;
          doc.hash = digest(input.text);
          doc.modifiedAt = new Date().toISOString();
          // Only tasks whose own section changed need review.
          for (const task of data.tasks.filter(
            (t) =>
              !reviewSettled(data, t) &&
              taskSourceRefs(t).some(
                (ref) =>
                  ref.document === doc.id &&
                  !planOwned(t, ref) &&
                  matchSection(ref, before, after).changed,
              ),
          ))
            task.needsReview = true;
          store.db
            .prepare(
              "INSERT INTO outbox(id,path,text,expected_hash) VALUES (?,?,?,?)",
            )
            .run(randomUUID(), doc.path, doc.text, oldHash);
          return doc;
        },
        expectedRevision,
      );
    // A session's draft is checked before it is stored; a match refuses the
    // call in-call, naming set, rule, file and line (§4.9 `plan`). A
    // person's save is checked at approval, which opens a decision.
    const agent = Boolean(context.caller || context.mcp);
    // New plan: only a person asks, from the Avoozl page. It records the
    // request and returns the planner chat's seed; it approves nothing.
    if (name === "plan.new") {
      if (context.caller || context.mcp)
        fail("Only a person starts a new plan, from the Avoozl page.", 403);
      const result = requestNewPlan(store, input, {
        readSpec: (spec) => this.readSpec(spec),
        repositories: workspaceRepositories(store).filter(
          (repo) => !repo.planning,
        ),
        specRoot: this.specRoots()[0] || null,
        template: (ref) => pickTemplate(this.pluginOptions, ref),
      });
      return result;
    }
    if (name === "plan.create") {
      assertPlanAnswerWrite(store, { id: input.id || input.spec }, context);
      if (input.spec === undefined) return createPlan(store, input);
      return this.createSpecDraft(input, context);
    }
    if (name === "plan.save") {
      assertPlanAnswerWrite(store, { id: input.id }, context);
      const plan = store.get("plans", input.id);
      if (plan?.spec && input.text === undefined) {
        const spec = this.readSpec(plan.spec);
        if (spec.exists && agent) enforceSpec(store, spec, { mode: "refuse" });
        const saved = saveSpecPlan(store, input, spec);
        recordPlanReviewWriter(store, saved, {
          previousHash: plan.hash,
          caller: context.caller,
        });
        return this.carryApproval(plan, saved) ?? saved;
      }
      // An old-style plan whose spec folder now exists: link it as a draft.
      if (plan && !plan.spec && input.spec !== undefined) {
        const spec = this.readSpec(input.spec);
        if (spec.exists && agent) enforceSpec(store, spec, { mode: "refuse" });
        const linked = linkSpecPlan(store, input, spec);
        recordPlanReviewWriter(store, linked, {
          previousHash: plan.hash,
          caller: context.caller,
        });
        return linked;
      }
      return savePlan(store, input);
    }
    if (name === "plan.propose") {
      const plan = store.get("plans", input.id);
      if (plan?.spec && !input.fact) {
        if (agent && input.proposal && typeof input.proposal === "object")
          enforceContent(
            store,
            {
              boundary: "plan",
              target: `${plan.spec}/tasks.md`,
              text: JSON.stringify(input.proposal, null, 1),
            },
            { mode: "refuse" },
          );
        return proposeSpecWork(store, input, (spec) => this.readSpec(spec));
      }
      return proposeWork(store, input);
    }
    if (name === "plan.get") {
      const plan = store.get("plans", input.id);
      if (!plan) fail("Plan not found.", 404);
      const data = this.read(),
        epic = epicOfPlan(data, plan.id),
        phases = new Map();
      for (const task of data.tasks)
        if (task.planId === plan.id && task.phase && !phases.has(task.phase.id))
          phases.set(task.phase.id, task.phase);
      return {
        ...plan,
        // The epic both sides agree on, and the one this revision's
        // front-matter names (Requirement 59.2); its phases, in task order.
        epic: epic?.id ?? null,
        epicTitle: epic?.title ?? null,
        epicNamed: plan.spec ? specEpic(plan.files) : null,
        phases: [...phases.values()],
        quality: plan.spec
          ? this.lintSpecPlan(plan)
          : lintPlan({
              text: plan.text,
              plan,
              data: {
                ...this.read(),
                projects: store.list("projects"),
                pluginIds: () => this.gatePluginIds(),
              },
            }),
        ...(plan.spec ? { disk: this.specOnDisk(plan) } : {}),
        // The spec's Links box (R92.4): stored records only, no GitHub
        // call. A local read, so a private spec issue shows only here.
        ...(plan.spec ? { links: specLinks(store, plan.id) } : {}),
        approvals: store.list("approvals").filter((a) => a.planId === plan.id),
        reviews: listReviewThreads(store, { planId: plan.id }).items,
        review: planReviewSummary(store, plan.id),
        reviewPipelines: store
          .list("review_rounds")
          .filter((round) => round.planId === plan.id),
        extractions: store
          .list("extractions")
          .filter((extraction) => extraction.planId === plan.id)
          .map((extraction) => getExtraction(store, extraction.id)),
      };
    }
    if (name === "plan.lint") {
      const plan = store.get("plans", input.id);
      if (!plan) fail("Plan not found.", 404);
      if (plan.spec) return this.lintSpecPlan(plan);
      const text = input.text ?? plan.text;
      if (typeof text !== "string" || text.length > 1000000)
        fail("Plan text is required.");
      return lintPlan({
        text,
        plan,
        data: {
          ...this.read(),
          projects: store.list("projects"),
          pluginIds: () => this.gatePluginIds(),
        },
      });
    }
    if (name === "plan.preview") {
      const plan = store.get("plans", input.id);
      if (!plan) fail("Plan not found.", 404);
      if (plan.spec && input.text !== undefined)
        fail("A spec plan is previewed from its stored revision.");
      const text = input.text ?? plan.text,
        specQuality = plan.spec ? this.lintSpecPlan(plan) : null;
      // Read-only: show exactly what approving this revision would extract,
      // without creating anything. Approval remains a separate operation.
      const data = this.read(),
        extraction = input.extractionId
          ? getExtraction(store, input.extractionId)
          : null,
        proposals = extraction
          ? proposalsFromFacts(store, extraction.id)
          : specQuality
            ? specQuality.proposals
            : extractPlan(text),
        mapping = Object.fromEntries(
          proposals.map((p) => [
            p.id,
            resolveTaskId(
              data,
              p.taskId ||
                plan.mapping?.[p.id] ||
                (plan.spec ? p.id : `${plan.id}-${p.id}`),
            ),
          ]),
        );
      const existing = new Set(data.tasks.map((t) => t.id));
      const rows = new Map(data.tasks.map((t) => [t.id, t]));
      const githubPolicy = this.githubPolicy();
      const quality =
        specQuality ||
        lintPlan({
          text,
          plan,
          data: {
            ...data,
            projects: store.list("projects"),
            pluginIds: () => this.gatePluginIds(),
          },
          ...(extraction ? { proposals } : {}),
        });
      return {
        planId: plan.id,
        reviewedHash: plan.spec ? plan.hash : digest(text),
        review: planReviewSummary(store, plan.id),
        currentHash: plan.hash,
        state: plan.state,
        quality,
        // Send this back as expectedRevision when approving.
        expectedRevision: data.revision,
        approved: store
          .list("approvals")
          .some(
            (a) =>
              a.planId === plan.id &&
              a.hash === (plan.spec ? plan.hash : digest(text)),
          ),
        tasks: proposals.map((p) => ({
          localId: p.id,
          taskId: mapping[p.id],
          title: p.title,
          acceptance: p.acceptance,
          existing: existing.has(mapping[p.id]),
          // The stored row's owner, else the one approval would give it.
          ...(rows.has(mapping[p.id])
            ? ownership(rows.get(mapping[p.id]))
            : {
                authority: newTaskAuthority(githubPolicy, p.authority),
                issue: null,
              }),
          lineStart: p.lineStart,
          lineEnd: p.lineEnd,
        })),
        dependencies: proposals.flatMap((p) =>
          ["requires", "sequence", "supports"].flatMap((kind) =>
            (p[kind] || []).map((ref) => ({
              kind,
              from: mapping[ref] || ref,
              to: mapping[p.id],
              known: existing.has(mapping[ref] || ref) || Boolean(mapping[ref]),
              ...(specQuality?.declaredDependencies.find(
                (entry) => entry.taskId === ref,
              )
                ? {
                    declaredBy: specQuality.declaredDependencies.find(
                      (entry) => entry.taskId === ref,
                    ).spec,
                    pending: (() => {
                      const declaration = specQuality.declaredDependencies.find(
                          (entry) => entry.taskId === ref,
                        ),
                        owner = store.get("plans", declaration.planId),
                        receipt =
                          owner?.approvalId &&
                          store.get("approvals", owner.approvalId);
                      return !approvedSpecDependency(
                        declaration,
                        rows.get(mapping[ref] || ref),
                        owner,
                        receipt,
                      );
                    })(),
                  }
                : {}),
            })),
          ),
        ),
        retiring: Object.keys(plan.mapping || {}).filter((id) => !mapping[id]),
        // Checked [x] items approval creates as accepted (plans.mjs).
        baseline: (() => {
          if (!specQuality) return { count: 0, taskIds: [], text: "" };
          const checked = baselineItems(plan.spec, plan.text, proposals),
            taskIds = proposals
              .filter((p) => checked.has(p.id) && !existing.has(mapping[p.id]))
              .map((p) => mapping[p.id]);
          return {
            count: taskIds.length,
            taskIds,
            text: taskIds.length
              ? `${taskIds.length} ${taskIds.length === 1 ? "task starts" : "tasks start"} as done from tasks.md marks`
              : "",
          };
        })(),
        extractionId: extraction?.id || null,
        facts: extraction?.facts || [],
        gaps: extraction?.gaps || [],
      };
    }
    if (name === "plan.approve") {
      // A named delegate approves as the person who granted it (R109).
      let delegation = approvalDelegation(store, {
        delegate: input.delegate,
        approvedBy: input.approvedBy,
      });
      const { plan, extraction, specQuality, proposals, quality } =
        this.approvalChecks(input);
      const approvedBy = delegation?.onBehalfOf ?? input.approvedBy;
      let approver =
          plan.spec && !extraction
            ? await this.specApprover(plan, approvedBy)
            : approvedBy?.trim() || this.operator,
        evidence = input.evidence;
      if (plan.spec && !extraction) {
        const gate = await this.approvalPullRequest(plan, {
          approvedBy: approver,
          quality,
          delegation,
        });
        if (gate?.pending)
          return {
            id: plan.id,
            hash: plan.hash,
            pending: true,
            approvalPullRequest: {
              repository: gate.pending.repository,
              number: gate.pending.number,
              branch: gate.pending.branch,
              // The adopted pull request merges itself once checks pass.
              ...(gate.pending.pull ? { adopted: true } : {}),
            },
          };
        if (gate?.merged) {
          approver = gate.merged.approvedBy;
          evidence = evidence || approvalEvidence(gate.merged);
          delegation ??= approvalDelegation(store, { state: gate.merged });
        }
      }
      const { delegate: _delegate, ...rest } = input;
      const approved = approvePlan(store, {
        ...rest,
        evidence:
          evidence || (delegation ? delegationEvidence(delegation) : evidence),
        delegation,
        githubPolicy: this.githubPolicy(),
        ...(extraction ? { extraction, proposals } : {}),
        ...(specQuality
          ? {
              proposals,
              baseline: true,
              declaredDependencies: specQuality.declaredDependencies,
            }
          : {}),
        approvedBy: approver,
        operator: input.operator || this.operator,
        expectedRevision: input.expectedRevision ?? expectedRevision,
      });
      return approved;
    }
    // Several specs at once, all or none (approval-batches.mjs).
    if (name === "plan.approveMany") return approveMany(this, input);
    // Who may approve on a person's behalf (approval-delegation.mjs, R109).
    if (name === "approval.delegates") return listDelegates(store);
    if (name === "approval.delegate.grant")
      return grantDelegate(store, {
        identity: input.identity,
        onBehalfOf: input.onBehalfOf?.trim() || (await this.personLogin()),
        note: input.note,
      });
    if (name === "approval.delegate.revoke")
      return revokeDelegate(store, {
        identity: input.identity,
        revokedBy: await this.personLogin(),
      });
    if (name === "plan.approvalBatches") return approvalBatches(this, input);
    if (name === "plan.extract.get")
      return getExtraction(store, input.id || input.extractionId);
    if (name === "plan.extraction.submit") {
      return submitExtraction(store, input);
    }
    if (name === "plan.extraction.dispose") return disposeFact(store, input);
    if (name === "plan.review.get") return currentPlanReview(store, input);
    if (name === "plan.review.list") return listReviewThreads(store, input);
    if (name === "plan.reviewSummary")
      return planReviewSummary(store, input.planId || input.id);
    if (name === "plan.review.findings") return reviewFindings(store, input);
    if (name === "plan.review.view") return planReviewView(store, input);
    if (name === "plan.review.answer")
      return answerReview(store, input, context);
    if (name === "plan.review.decide") {
      if (context.caller || context.mcp)
        fail("Only a person starts or skips a draft review.", 403);
      if (input.action === "review") {
        const plan = store.get("plans", input.planId),
          existing =
            plan?.hash === input.revisionHash &&
            listSpecReviewRounds(store, {
              planId: input.planId,
              revisionHash: input.revisionHash,
            }).items.at(-1);
        if (
          existing &&
          (existing.slot || ["running", "done"].includes(existing.state))
        )
          return {
            existing: true,
            state: existing.state,
            roundId: existing.id,
          };
        const config = loadLayeredConfig({
            workspaceRoot: this.workspaceRoot,
          }).config,
          reviewer = chatModel(config, "planReviewer"),
          writer = completePlanReviewWriter(
            store,
            input.planId,
            input.revisionHash,
          )?.actualModel;
        if (validatePlanReview(config.planReview).mode === "off")
          fail(
            "Plan reviews are off. Enable them in Settings before starting a review.",
            409,
          );
        if (!reviewer)
          fail("Pick a Plan reviewer model in Settings › Models.", 409);
        if (reviewer === writer)
          fail(
            "The reviewer model is the same as the model that wrote this revision.",
            409,
          );
      }
      return decidePlanReview(store, input, context);
    }
    if (name === "plan.review.submit") {
      if (store.get("plans", input.planId)?.spec)
        return createSpecReviewFindings(store, input, {
          caller: context.caller,
          mcp: context.mcp,
        });
      return createReviewThreads(store, {
        ...input,
        author: input.author || this.operator,
      });
    }
    if (name === "plan.review.reply")
      return replyToReview(store, {
        ...input,
        author: input.author || this.operator,
      });
    // A person's action on a spec review finding (R104.5). Person-only:
    // perform refuses MCP and agent sessions before this runs.
    // Without a revision (the CLI) it is the spec's current one.
    if (name === "plan.review.finding.decide") {
      const thread = store.get("review_threads", input.id);
      return recordFindingDecision(store, {
        id: input.id,
        action: input.action,
        revisionHash:
          input.revisionHash || store.get("plans", thread?.planId)?.hash,
        note: input.note,
        by: this.operator,
      });
    }
    if (name === "plan.review.dispose") {
      const thread = store.get("review_threads", input.id);
      if (thread?.source !== "plan-review")
        return disposeReview(store, {
          ...input,
          author: input.author || this.operator,
        });
      // The four old dispositions, as decisions at the named or current
      // revision (R104.6).
      const action = {
        resolved: "resolve",
        accepted: "accept",
        rejected: "reject",
        deferred: "defer",
      }[input.disposition];
      if (!action) fail("Choose resolved, accepted, rejected, or deferred.");
      return recordFindingDecision(store, {
        id: input.id,
        action,
        revisionHash:
          input.revisionHash || store.get("plans", thread.planId)?.hash,
        note: input.note,
        by: this.operator,
      });
    }
    if (name === "plan.review.apply")
      return applyReviewSuggestion(store, {
        ...input,
        author: input.author || this.operator,
      });
    if (name === "plan.review.pipeline.get") {
      const round = store.get("review_rounds", input.id);
      if (!round) fail("Review pipeline not found.", 404);
      return round;
    }
    if (name === "github.project.detect")
      return projectGitHubRepository(store, input);
    if (name === "repositories.list")
      return { items: workspaceRepositories(store) };
    // Read only: what the Add repository form would register for a folder.
    if (name === "repositories.detect") return detectCheckout(input.folder);
    // Onboard flow reads (onboarding.mjs): the folder as a whole, and the
    // leak scan of the specs a public repository's issues would show.
    if (name === "onboarding.inspect")
      return inspectFolder({
        store,
        github: this.github,
        folder: input.folder,
      });
    if (name === "onboarding.scan")
      return scanSpecs(store, (spec) => this.readSpec(spec), input.specs);
    if (name === "repositories.configure") {
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
      let project = null;
      if (localCheckout) {
        project = await projectConfig({
          id,
          root: localCheckout,
          baseBranch: String(input.baseBranch || "main").trim() || "main",
          worktreeRoot: input.worktreeRoot || undefined,
          checks: Array.isArray(input.checks) ? input.checks : [],
        });
        project = {
          ...project,
          ...(String(input.name || "").trim()
            ? { name: String(input.name).trim() }
            : {}),
          planning: input.planning === true,
          editable: input.editable !== false,
        };
      }
      if (
        existing?.localCheckout &&
        (!project || existing.localCheckout !== project.root)
      )
        assertRepositoryRemovable(store, existing);
      const binding = this.repositoryBindingGuard?.({
        repositoryId: id,
        root: project?.root || null,
        editable: Boolean(project?.editable),
      });
      try {
        const labels = input.labelBehaviors,
          issueIntake =
            githubRepository && authorizeIssues
              ? await prepareGitHubRepository(store, this.github, {
                  repository: githubRepository,
                  workspaceRepositoryId: id,
                  projectId: project.id,
                  project,
                  assignee: input.assignee,
                  label:
                    input.readyLabel || labels?.ready?.[0] || "avoozl:ready",
                  managedLabel: input.managedLabel,
                  allowedActors: input.allowedActors,
                  minimumPermission: input.minimumPermission,
                  provider: input.provider,
                  model: input.model,
                  autoStart: input.autoStart,
                })
              : null;
        this.configuration?.updateUnifiedRepository({
          id,
          previousRepository: existing?.github,
          project,
          issueIntake,
        });
        store.transaction(() => {
          if (existing?.github && existing.github !== githubRepository) {
            store.db
              .prepare("DELETE FROM github_repositories WHERE id=?")
              .run(existing.github);
          }
          if (project) store.put("projects", project);
          else store.db.prepare("DELETE FROM projects WHERE id=?").run(id);
          if (issueIntake) store.put("github_repositories", issueIntake);
          else if (existing?.github)
            store.db
              .prepare("DELETE FROM github_repositories WHERE id=?")
              .run(existing.github);
          store.event(null, "workspace.repository.configured", {
            repositoryId: id,
            github: githubRepository || null,
            planning: Boolean(project?.planning),
            editable: Boolean(project?.editable),
            issueAuthorization: authorizeIssues,
          });
        });
        await binding?.commit?.();
        this.configuration?.reload();
        return workspaceRepositories(store).find((entry) => entry.id === id);
      } finally {
        binding?.release?.();
      }
    }
    if (name === "repositories.remove") {
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
    }
    if (name === "github.project.connect") {
      this.configuration?.assertWritable();
      const detected = input.repository
          ? { projectId: input.projectId, repository: input.repository }
          : await projectGitHubRepository(store, input),
        configuration = {
          ...input,
          repository: detected.repository,
          projectId: detected.projectId,
        },
        execution = await configureGitHubRepository(
          store,
          this.github,
          configuration,
        );
      this.configuration?.updateGitHubIssueIntake(execution);
      return { repository: detected.repository, execution };
    }
    if (name === "github.configure") {
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
    }
    if (name === "github.repositories")
      return {
        available: this.github.available(),
        machine: machineIdentity(store),
        items: store.list("github_repositories"),
      };
    if (name === "github.issues")
      return {
        items: store.list("github_issues"),
        lastSync: store.getMeta("githubSync"),
      };
    if (name === "queue.design.triage") {
      const plan = store.get("plans", input.planId);
      if (!plan) fail("Plan not found.", 404);
      if (!["extract", "context"].includes(input.action))
        fail("Choose extract or context.");
      if (input.action === "context") {
        plan.triage = {
          state: "context",
          at: new Date().toISOString(),
          by: this.operator || null,
        };
        store.put("plans", plan);
        store.event(null, "queue.design.triaged", {
          planId: plan.id,
          action: "context",
        });
        return { plan, extraction: null };
      }
      const extraction = this.startExtractionPipeline({
        ...input,
        planId: plan.id,
        revisionHash: plan.hash,
      });
      plan.triage = {
        state: "extracting",
        extractionId: extraction.id,
        at: new Date().toISOString(),
        by: this.operator || null,
      };
      store.put("plans", plan);
      store.event(null, "queue.design.triaged", {
        planId: plan.id,
        action: "extract",
        extractionId: extraction.id,
      });
      return { plan, extraction };
    }
    if (name === "work.release") {
      const task = this.read().tasks.find(
          (candidate) =>
            candidate.id === resolveTaskId(this.read(), input.taskId),
        ),
        claim = task?.githubClaim;
      if (!task) fail("Task not found.", 404);
      if (!claim?.repository || !claim.number || !claim.login)
        fail("This task is not owned through a GitHub claim.", 409);
      await this.github.removeAssignees(
        parseRepository(claim.repository),
        claim.number,
        [claim.login],
      );
      return store.mutate(`Release ${task.id}`, (data) => {
        const current = data.tasks.find(
          (candidate) => candidate.id === task.id,
        );
        current.owner = "";
        current.githubClaim = {
          ...current.githubClaim,
          releasedAt: new Date().toISOString(),
        };
        current.updatedAt = new Date().toISOString();
        return current;
      });
    }
    if (name === "github.sync") {
      const result = await syncGitHubIssues(store, this.github, {
        ...input,
        policy: this.githubPolicy(),
      });
      // Previews, approvals and publishing for issues with a proposal.
      if (store.list("github_issues").some((row) => row.breakdown))
        result.breakdown = await advanceGitHubBreakdowns(
          store,
          this.github,
          this.breakdownHooks(),
        );
      // Kiro Crew sessions start from the tick; a sync starts nothing.
      return { ...result, starts: [] };
    }
    if (name === "github.breakdown.classify")
      return classifyGitHubIssue(
        store,
        this.githubPolicy(),
        input,
        context.caller,
      );
    if (name === "github.breakdown.draft")
      return draftGitHubChildren(
        store,
        input,
        this.breakdownHooks(),
        context.caller,
      );
    if (name === "github.breakdown.advance")
      return advanceGitHubBreakdowns(store, this.github, this.breakdownHooks());
    if (name === "github.authorize")
      return syncGitHubIssues(store, this.github, {
        policy: this.githubPolicy(),
        repository: input.repository,
        authorize: {
          id: input.id,
          bodyHash: input.bodyHash,
          labelEventId: input.labelEventId,
        },
      });
    if (name === "github.conflict.resolve")
      return resolveProjectionConflict(store, input);
    // `avoozl rebuild`: GitHub tasks from their issues when repositories are
    // registered, and tracker plugin tasks from their records (§3.3).
    if (name === "workspace.rebuild") {
      const github = store.list("github_repositories").length
        ? await this.perform("github.rebuild", input, undefined, context)
        : null;
      return { ...(github || {}), trackers: await this.rebuildTrackers() };
    }
    if (name === "tracker.takeBack") return this.takeBackLocal(input);
    if (name === "github.rebuild")
      return rebuildFromGitHub(store, this.github, {
        repository: input.repository,
        identity: planningIdentity(this.workspaceRoot),
        policy: this.githubPolicy(),
        readSpec: (spec) => this.readSpec(spec),
      });
    // Create and release (RC5.1): refused for auto-merge until the merge
    // path is ready. `release` is set only by that action.
    if (name === "github.project" && input.release === true) {
      requireMergePath(await this.mergePaths(input.repository));
    }
    if (name === "github.project") {
      if (!input.dryRun) refuseOtherRun(store, input.planId);
      return this.withProjectSync(
        await projectPlanIssues(store, this.github, {
          ...input,
          identity: planningIdentity(this.workspaceRoot),
        }),
      );
    }
    // The issues approving a draft spec plan would make, without approving
    // it: approval runs on a scratch copy of the store that is thrown away,
    // then the projection preview reads that copy. Nothing is written here
    // or on GitHub.
    if (name === "plan.issues.preview") {
      const plan = store.get("plans", input.planId);
      if (!plan) fail("Plan not found.", 404);
      if (!plan.spec) fail("Only a spec plan is previewed this way.", 409);
      let policy = null;
      try {
        policy = this.githubPolicy();
      } catch {
        policy = null;
      }
      // Lint implies a leaf's repository when only one is registered;
      // the preview does the same for the issue repository.
      const configured = store.list("github_repositories"),
        repository =
          input.repository ||
          (configured.length === 1 ? configured[0].id : undefined);
      const withChecks = (value) => value;
      const projection = (target) =>
        previewProjection(target, this.github, {
          planId: plan.id,
          repository,
          identity: planningIdentity(this.workspaceRoot),
          policy,
          claimed: claimedTaskIds(target),
          batches: input.batches,
        });
      // The planner's batch groups (§4.37), for the preview's batch edit.
      const grouped = (target) =>
          planProjectionBatches({
            tasks: target
              .read()
              .tasks.filter((task) => task.planId === plan.id),
            edges: target.read().edges,
            mode: "suggest",
            complete: (status) => statusComplete(target.read(), status),
          }),
        suggested = (target) =>
          grouped(target).batches.map((batch) => batch.tasks);
      if (plan.state === "approved")
        return withChecks({
          ...(await projection(store)),
          simulated: false,
          suggestedBatches: suggested(store),
        });
      const quality = this.lintSpecPlan(plan, [], { content: false }),
        blocking = quality.diagnostics.filter((d) => d.severity === "error");
      if (blocking.length)
        return withChecks({
          planId: plan.id,
          writes: [],
          blocked: blocking,
          simulated: true,
        });
      const scratch = store.scratch();
      try {
        approvePlan(scratch, {
          id: plan.id,
          expectedHash: plan.hash,
          expectedRevision: scratch.read().revision,
          githubPolicy: policy,
          proposals: quality.proposals,
          baseline: true,
          // As plan.approve does: another spec's task IDs resolve.
          declaredDependencies: quality.declaredDependencies,
          approvedBy: this.operator,
          operator: this.operator,
        });
        // Projection refuses a task whose referenced owner is unapproved, so
        // the preview says which approvals come first.
        const waiting = scratch
          .read()
          .tasks.filter(
            (task) =>
              task.planId === plan.id && task.pendingSpecDependencies?.length,
          );
        if (waiting.length)
          return withChecks({
            planId: plan.id,
            writes: [],
            blocked: waiting.map((task) => ({
              code: "spec.pending-owner",
              severity: "error",
              taskId: task.id,
              message: `Approve ${[...new Set(task.pendingSpecDependencies.map((ref) => ref.spec))].join(", ")} first: ${task.id} needs ${task.pendingSpecDependencies.map((ref) => ref.taskId).join(", ")}.`,
            })),
            simulated: true,
          });
        return withChecks({
          ...(await projection(scratch)),
          simulated: true,
          suggestedBatches: suggested(scratch),
        });
      } finally {
        scratch.close();
      }
    }
    // Publish issue (R102.2): a person's explicit act, never part of approval.
    if (name === "spec.publish") {
      if (context.caller || context.mcp)
        fail("Only a person publishes a spec issue.", 403);
      const { journal: _journal, ...published } = await publishSpec(store, {
        github: this.github,
        workspaceRoot: this.workspaceRoot,
        identity: planningIdentity(this.workspaceRoot),
        planId: input.planId,
        repository: input.repository,
        actor: this.operator,
      });
      return published;
    }
    // Take over a published spec's journal (R102.13, task 42.5): a person's
    // own act; it writes the next generation and keeps the driver id here.
    // Set up a repository for landing (R89, task 42.7): a preview, applied
    // only with `confirm` (`--yes`) by a person.
    if (name === "repository.setup") {
      if (input.confirm && (context.caller || context.mcp))
        fail("Only a person applies repository setup.", 403);
      if (!this.github?.available?.())
        fail("Repository setup needs GitHub; run gh auth login.", 503);
      return repositorySetup(
        store,
        this.github,
        {
          ...input,
        },
        {
          writeProject: (project) => {
            this.configuration?.assertWritable();
            this.configuration?.updateExecutionProject(project);
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
    }
    // The driver's side of worker claims (R90.4): offer a task to a worker
    // login, and reserve and acknowledge the requests. A person's own act at
    // this machine; no session or MCP caller.
    if (
      [
        "spec.offer",
        "spec.claims",
        "spec.claims.release",
        "spec.claims.status",
      ].includes(name)
    ) {
      if (context.caller || context.mcp)
        fail("Only a person drives worker offers and claims.", 403);
      const authority = await specAuthority(
          store,
          {
            github: this.github,
            workspaceRoot: this.workspaceRoot,
            actor: this.operator,
          },
          input.planId,
        ),
        driver = driverIdOf(store, input.planId);
      if (!driver) fail("Take over the spec first.", 409);
      const driving = {
        driver,
        owner: authority.owner,
        login: authority.login,
        spec: input.planId,
      };
      const held = {
        ...driving,
        github: this.github,
        journal: authority.journal,
        options: authority.options,
        claims: input.claims,
      };
      if (name === "spec.claims.status")
        return claimStatus(authority.journal, authority.options, {
          staleAfter: claimStaleMs(
            loadLayeredConfig({ workspaceRoot: this.workspaceRoot }).config
              ?.workers?.claimStaleAfter,
          ),
        });
      if (name === "spec.claims.release")
        return releaseClaim({
          ...held,
          task: input.task,
          by: { kind: "person" },
        });
      if (name === "spec.claims") {
        // Carry or settle what exists first, then answer new requests.
        const reconciled = await reconcileClaims(held);
        return {
          reconciled,
          ...(await reserveClaims({
            ...held,
            base: input.base,
            ...(input.cap ? { cap: input.cap } : {}),
          })),
        };
      }
      const task = store.read().tasks.find((t) => t.id === input.task);
      if (!task) fail("Task not found.", 404);
      return publishOffer(
        authority.journal,
        {
          ...driving,
          task: task.id,
          definition: taskDefinition({
            id: task.id,
            title: task.title,
            acceptance: task.acceptance ?? null,
          }),
          worker: input.worker,
          ref: {
            repository: input.repository,
            branch: input.branch,
            commit: input.commit,
          },
          base: input.base,
        },
        authority.options,
      );
    }
    if (name === "spec.takeover") {
      if (context.caller || context.mcp)
        fail("Only a person takes over a spec.", 403);
      return takeOverSpec(
        store,
        {
          github: this.github,
          workspaceRoot: this.workspaceRoot,
          actor: this.operator,
        },
        input.planId,
      );
    }
    // Reanchor a held journal and Resume after it (R102.26, task 56.15):
    // each a person's own act; reanchor previews unless `apply`.
    if (name === "spec.journal.reanchor" || name === "spec.journal.resume") {
      if (context.caller || context.mcp)
        fail("Only a person reanchors or resumes a spec journal.", 403);
      const authority = {
        github: this.github,
        workspaceRoot: this.workspaceRoot,
        actor: this.operator,
      };
      return name === "spec.journal.reanchor"
        ? reanchorSpec(store, authority, {
            planId: input.planId,
            held: input.held,
            tail: input.tail,
            apply: input.apply === true,
          })
        : resumeSpec(store, authority, {
            planId: input.planId,
            tail: input.tail,
          });
    }
    // Retire task-issue bindings (R102.20, §4.32.13): preview, hold, apply,
    // one verifying tick, then close. Each step is a person's own act.
    // Export issues (R102.19): preview, or with confirm create the spec's
    // unfinished task issues and stop driving it. A person's own act.
    if (name === "spec.exportIssues") {
      if (context.caller || context.mcp)
        fail("Only a person exports a spec's task issues.", 403);
      const options = { planId: input.planId, repository: input.repository };
      return input.confirm
        ? applyExport(store, {
            ...options,
            github: this.github,
            actor: this.operator,
          })
        : previewExport(store, options);
    }
    if (name === "github.retireTaskIssues") {
      if (context.caller || context.mcp)
        fail("Only a person retires task-issue bindings.", 403);
      const step = input.step || "preview";
      if (step === "preview") return previewRetirement(store);
      if (step === "hold")
        return holdRetirement(store, { actor: this.operator });
      if (step === "apply") return applyRetirement(store);
      if (step === "verify") {
        const github = this.github;
        try {
          return await verifyRetirement(store, {
            github,
            runTick: async (client) => {
              this.github = client;
              return this.execute("workspace.tick", { cron: true });
            },
          });
        } finally {
          this.github = github;
        }
      }
      if (step === "close")
        return closeRetiredIssues(store, {
          github: this.github,
          reason: input.reason,
        });
      fail("Choose preview, hold, apply, verify, or close.", 400);
    }
    // Spec changed (RC2.8): what an edited spec would do to each issue, and
    // the write once the spec is approved again. A person applies it.
    if (name === "spec.changed.preview" || name === "spec.changed.apply") {
      const plan = store.get("plans", input.planId);
      if (!plan?.spec) fail("Spec plan not found.", 404);
      const before = approvedBefore(plan) ?? plan.files,
        after = plan.files,
        identity = planningIdentity(this.workspaceRoot),
        remaining = new Set(specTasks(plan.spec, after).keys()),
        issues = await changeIssues({
          tasks: store.read().tasks.filter((task) => task.planId === plan.id),
          github: this.github,
          claimLabel: (repository) =>
            (
              identity.repositories?.[repository]?.crewLabels ||
              CREW_LABEL_DEFAULTS
            ).claim,
          localClaimed: claimedTaskIds(store),
          remaining,
        }),
        rows = planSpecChange({ name: plan.spec, before, after, issues }),
        receipt = `spec-changed:${plan.id}:${plan.hash}`,
        approved = plan.state === "approved";
      if (name === "spec.changed.preview")
        return {
          planId: plan.id,
          hash: plan.hash,
          approved,
          applied: store.getMeta(receipt) ?? null,
          rows,
        };
      if (context.caller || context.mcp)
        fail("Only a person applies a spec change.", 403);
      if (store.getMeta(receipt)) fail("This change was already applied.", 409);
      const done = await applySpecChange(this.github, {
        rows,
        approved,
        archive: (id) =>
          store.mutate("Archive " + id, (data) => {
            const task = data.tasks.find((item) => item.id === id);
            task.archivedReason = "removed from the spec";
            return archiveTask(task);
          }),
        project: () =>
          projectPlanIssues(store, this.github, {
            planId: plan.id,
            identity,
            holdClaimed: true,
          }),
      });
      store.setMeta(receipt, done);
      return { planId: plan.id, done };
    }
    if (name === "github.project.preview") {
      // Like `withProjectSync`, a bad Project policy never hides the issue
      // preview; the projection reads its own identity.
      let policy = null;
      try {
        policy = this.githubPolicy();
      } catch {
        policy = null;
      }
      return previewProjection(store, this.github, {
        planId: input.planId,
        repository: input.repository,
        identity: planningIdentity(this.workspaceRoot),
        policy,
        claimed: claimedTaskIds(store),
      });
    }
    if (name === "workspace.repository.configure") {
      this.configuration?.assertWritable();
      const configured = await configureWorkspaceRepository(
        store,
        input,
        this.github,
      );
      this.configuration?.updatePlanningRepository(configured);
      return configured;
    }
    if (name === "workspace.repository.status")
      return workspaceRepositoryStatus(store);
    if (name === "workspace.repository.publish") {
      const config = store.getMeta("workspaceRepository");
      if (config?.repository)
        await requirePrivateRepository(this.github, config.repository);
      return publishWorkspaceRepository(store, input);
    }
    if (name === "workspace.repository.sync") {
      const config = store.getMeta("workspaceRepository");
      if (config?.repository)
        await requirePrivateRepository(this.github, config.repository);
      return syncWorkspaceRepository(store);
    }
    if (name === "planning.publish") {
      const plan = input.planId ? store.get("plans", input.planId) : null;
      if (plan?.extractionId)
        return this.withProjectSync(
          await projectPlanIssues(store, this.github, {
            ...input,
            identity: planningIdentity(this.workspaceRoot),
          }),
        );
      return publishPlanningPullRequest(store, this.github, input);
    }
    if (name === "planning.reconcile")
      return this.reconcilePlanningPullRequests();
    if (name === "project.configure") {
      const project = await projectConfig(input);
      this.configuration?.assertWritable();
      const configured = store.put("projects", project);
      this.configuration?.updateExecutionProject(configured);
      return configured;
    }
    if (name === "project.remove") {
      const id = String(input.id || "").trim(),
        project = id ? store.get("projects", id) : null;
      if (!project) fail("Project not found.", 404);
      const locked = store.db
        .prepare("SELECT id FROM work_locks WHERE project_id=? LIMIT 1")
        .get(id);
      if (locked)
        fail(
          `Project ${id} is currently locked by active work. Wait for it to finish before removing the project.`,
          409,
        );
      const authorization = store
        .list("github_repositories")
        .find((entry) => entry.projectId === id);
      if (authorization)
        fail(
          `Project ${id} is still connected to GitHub. Remove or reassign its label-authorized repositories first.`,
          409,
        );
      this.configuration?.assertWritable();
      this.configuration?.removeExecutionProject(id);
      store.remove("projects", id);
      this.configuration?.reload();
      store.event(null, "project.removed", { projectId: id });
      return { ...project, removed: true };
    }
    if (name === "integration.merge") {
      return integrateRun(store, input);
    }
    if (name === "task.accept") {
      // Acceptance evidence that already exists should not have to be retyped:
      // a validated run recorded what ran, against which commit, and with
      // what exit code. A caller with something further to say still can.
      const autoArchive = conversationSettings(store).autoArchiveCompleted,
        task = store.mutate(
          "Accept " + input.id,
          (data) => {
            const task = data.tasks.find((t) => t.id === input.id);
            if (!task) fail("Task not found.", 404);
            // A validation-gated leaf is accepted only from checks Avoozl
            // recorded at its integrated commit, never from typed text (R38.4).
            if (task.acceptFrom === "validation") {
              if (input.evidence?.trim() || input.componentOnly)
                fail(
                  `Task ${task.id} is accepted only from validation Avoozl recorded; typed evidence and component-only acceptance are refused.`,
                  409,
                );
              if (!task.integration?.commit)
                fail(
                  `Task ${task.id} has no integrated commit; it is accepted after Avoozl integrates it.`,
                  409,
                );
            }
            if (!task.integration && !input.componentOnly)
              fail("Record integration before whole-head acceptance.");
            const recorded = input.evidence?.trim()
              ? null
              : validationAt(store, data, task);
            if (task.acceptFrom === "validation" && !recorded)
              fail(
                `Task ${task.id} has no passing validation of every declared check at commit ${task.integration.commit.slice(0, 12)}.`,
                409,
              );
            task.acceptanceEvidence = {
              at: new Date().toISOString(),
              evidence: input.evidence?.trim() || recorded?.summary || "",
              ...(recorded?.evidenceIds.length
                ? { derivedFrom: recorded.evidenceIds }
                : {}),
              ...(this.operator ? { acceptedBy: this.operator } : {}),
              componentOnly: Boolean(input.componentOnly),
            };
            task.status = input.componentOnly ? "implemented" : "accepted";
            if (!input.componentOnly && autoArchive)
              task.archivedAt = task.archivedAt || task.acceptanceEvidence.at;
            return task;
          },
          expectedRevision,
        );
      return task;
    }
    if (name === "handoff") {
      const task = this.detail(input.id);
      return {
        task,
        design: task.documents,
        prerequisites: task.relationships
          .filter((e) => e.to === task.id)
          .map((e) => this.read().tasks.find((t) => t.id === e.from)),
        evidence: task.evidenceRecords,
        nextAction: task.nextAction,
        agentInstructions: matchingAgentInstructions(
          this.read(),
          "task.implement",
          task,
        ),
        policy:
          "Task evidence, integration and acceptance are separate. Preserve existing worktrees and do not open GitHub issues. Work discovered while implementing has three dispositions: in scope for this task, do it and record the evidence here, which is the normal case; related to this plan but out of scope, record one cited proposed fact with plan.propose for extraction review; needing a different design, write a new plan draft and tell the user. Filing anything is the exception; do not capture discoveries as new request tasks.",
      };
    }
    if (name === "queue") {
      const data = this.read(),
        ready = queryTasks(data, {
          scope: "all",
          ...input,
          repositories: workspaceRepositories(store).map((entry) => entry.id),
          claimed: claimedOrNone(store),
          q: [input.q, "ready:true"].filter(Boolean).join(" "),
        });
      const ranked = ready
        .map((t) => ({
          ...t,
          unblocks: data.edges.filter(
            (e) =>
              ["requires", "sequence"].includes(e.kind) &&
              e.from === t.id &&
              !statusComplete(
                data,
                data.tasks.find((x) => x.id === e.to)?.status,
              ),
          ).length,
        }))
        .sort((a, b) => b.unblocks - a.unblocks);
      const visible = data.tasks.filter((t) => !isPlanInventory(data, t)),
        blocked = visible
          .map((t) => ({ task: t, signals: taskSignals(data, t) }))
          .filter(
            ({ task, signals }) =>
              !signals.complete &&
              (task.status === "blocked" || signals.blockers.length),
          ),
        taskMap = new Map(data.tasks.map((t) => [t.id, t]));
      return {
        summary: {
          ready: ranked.length,
          blocked: blocked.length,
        },
        blocked: blocked.slice(0, 40).map(({ task, signals }) => ({
          id: task.id,
          title: task.title,
          nextAction: task.nextAction,
          summary: task.summary,
          blockers: signals.blockers.map((id) => ({
            id,
            title: taskMap.get(id)?.title || id,
            status: taskMap.get(id)?.status,
          })),
        })),
        ready: ranked.slice(
          0,
          Math.max(1, Math.min(100, Number(input.limit) || 40)),
        ),
        readyTotal: ranked.length,
        integrations: store
          .list("integration")
          .filter((i) => i.state === "ready"),
      };
    }
    if (name === "legacy.mcp")
      return dispatchMcp(input.message, { versionHeader: input.versionHeader });
    fail("Unknown operation " + name, 404);
  }
}

// The built-in prompt version a newly bound session runs on (R68.12), kept
// on its binding so its attempt records it.
function stampPrompts(store, result) {
  const binding = result?.binding,
    target = binding && roleTarget(binding.role);
  if (!target || !result.changed || binding.prompts) return result;
  const version = promptVersions(store)[target],
    next = { ...binding, prompts: { [target]: version } };
  store.put("session_bindings", next);
  return { ...result, binding: next };
}

// The Kiro Crew sessions bound to one task, with a link to each.
function kiroCrewSessions(store, taskId) {
  return listSessionBindings(store)
    .filter((binding) => binding.taskId === taskId)
    .map((binding) => ({
      slot: binding.slot,
      role: binding.role,
      attempt: binding.attempt,
      status: binding.status || null,
      url: sessionUrl(binding.slot),
    }));
}
