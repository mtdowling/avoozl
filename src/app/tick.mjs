import { withGitHubReadSnapshots } from "./github-read-snapshot.mjs";
import {
  enqueueSessionRequests,
  pendingSessionRequests,
} from "./session-requests.mjs";
import {
  persistKirocrewConfiguration,
  kirocrewExplicitSession,
} from "./executors/kirocrew.mjs";
import { kirocrewRequest } from "./executors/kirocrew.mjs";
import { kirocrewSession, kirocrewDispatches } from "./executors/kirocrew.mjs";
// workspace.tick: the one bounded, idempotent step a Kiro Crew script cron runs
// every minute. It returns intents for the script to carry out; it never opens
// sessions or sends messages itself. It takes the lock, loads policy, records
// the session statuses the script read, reconciles worker and verifier
// outcomes, integrates verified commits, completes parents from their
// children, and plans dispatches: one per open session request, ready local
// leaves when `.avoozl.json` turns delivery on, and one verifier per worker
// done report. On the cron it also reads and writes GitHub: completion,
// issue intake, planner sessions for matched issues, broad-issue publishing,
// re-projection, crew labels and the Project board.
import { notesReprojectIds, notesReprojected } from "./task-notes.mjs";
import { recordActivity, recordTickActivity } from "./activity-log.mjs";
import fs from "node:fs";
import { refuseTrackedProviders } from "./provider-health.mjs";
import { crewSnapshot, machineFile } from "./crews.mjs";
import { validateLanes } from "./lanes.mjs";
import path from "node:path";
import { createHash } from "node:crypto";
import { git, withWorkLock } from "./git.mjs";
import {
  assertPortableRepositoryConfig,
  assertSafeConfig,
} from "./layered-config.mjs";
import { flowPolicy, syncSpans } from "./flow.mjs";
import { blockedNaming, judgeBaseFailures, watchLine } from "./flow-line.mjs";
import { retroStep } from "./flow-retro.mjs";
import { ciRepositories, ciStep, readEffectiveCIConfig } from "./flow-ci.mjs";
import { queueCheckRuns } from "./check-runs.mjs";
import {
  claimedTaskIds,
  completeParents,
  deliveryPolicy,
  holdUnprovenReviews,
  integrateVerified,
  liveAttempt,
  planCheckRuns,
  planReadyDispatches,
  asksForcePush,
  briefAllowed,
  planVerifierDispatches,
  reconcileDeliveries,
  reconcileVerifications,
} from "./delivery.mjs";
import { fail } from "./store.mjs";
import {
  FINAL_STATUSES,
  listSessionBindings,
  listSessionRequests,
  recordSessionStatus,
  sessionRequestHold,
} from "./session-bindings.mjs";
import { workspaceRepositories } from "./workspace-repositories.mjs";
import { queueNotifications, sessionUrl } from "./notifications.mjs";
import {
  closeGitHubParents,
  closePlanAndEpicIssues,
  reconcileGitHubCompletion,
} from "./github-close.mjs";
import { readGitHubPolicy, readGitHubPolicyOrNull } from "./github-policy.mjs";
import { ensureLinkedBranches } from "./github-linked-branches.mjs";
import { refreshProjectedReadiness } from "./github-projection.mjs";
import { planningIdentity } from "./github-marker.mjs";
import { syncProject } from "./github-project.mjs";
import { reviewDispatches } from "./pr-review.mjs";
import { publicCrewAudit } from "./public-crews.mjs";
import { respondStep } from "./github-respond.mjs";
import { steeringStep } from "./github-steering.mjs";
import { feedbackStep } from "./github-feedback.mjs";
import { investigationStep } from "./investigate.mjs";
import { revertCorrections } from "./corrections.mjs";
import { evidenceCommentStep } from "./evidence.mjs";
import { findPlanningLeak } from "./github-plans-repo.mjs";
import { plannerStep } from "./github-planner.mjs";
import { intakeNotices, syncGitHubIssues } from "./github-sync.mjs";
import { advanceGitHubBreakdowns } from "./github-breakdown.mjs";
import { blockerNotes } from "./github-close.mjs";
import { refreshUntriaged } from "./untriaged.mjs";
import {
  conflictFixDispatches,
  conflictFixStep,
} from "./radar-conflict-fix.mjs";
import {
  RATE_LIMIT_TEXT,
  githubGate,
  markGithubRun,
  rateLimitNotices,
  withSource,
} from "./github-rate.mjs";
import { reviewDraftDispatches, reviewDraftStep } from "./review-draft.mjs";
import { taskSummaryDispatches } from "./task-summary.mjs";
import {
  validateModels,
  validateRoles,
  validatePlanReview,
  withChatModels,
} from "./chat-models.mjs";
import { syncStep, syncTargets } from "./integration-sync.mjs";
import { mirrorSyncStep } from "./mirror-sync.mjs";
import { publishInstanceStep } from "./instance-publish.mjs";
import { mirrorForwardStep } from "./mirror-forward.mjs";
import { mirrorForwardRunStep } from "./mirror-forward-run.mjs";
import { RepoFiles } from "./repo-files.mjs";
import { mirrorForwardAuditStep } from "./forward-audit.mjs";
import { publicBranchesOf } from "./forward-epics.mjs";
import { mirrorBatchStep, publicBranchStep } from "./mirror-forward-batch.mjs";
import { mirrorPublicPollStep } from "./mirror-forward-poll.mjs";
import { headStep } from "./integration-head.mjs";
import { namespaceOf } from "./radar-plan-me.mjs";
import { pluginHealth, recordHealth } from "./plugin-session.mjs";
import { repositoryPlugins } from "./plugins.mjs";
import {
  pollSources,
  purgeClosed,
  sourceMap,
  validateIntake,
} from "./intake.mjs";
import { settleUnavailable, validateContentRules } from "./content-rules.mjs";
import { statusComplete } from "../query.mjs";
import {
  completionReached,
  isGate,
  pluginId,
  taskAuthority,
  taskKind,
  taskRepository,
  taskRoute,
} from "../work-model.mjs";
import { gateStep } from "./gate-step.mjs";
import { gateLabelStep } from "./gate-label.mjs";
import { routeResultNotes, routeStep } from "./routes.mjs";
import { heldByTrackers, trackerStep } from "./trackers.mjs";
import {
  driverStep,
  recheckDrivers,
  reprojected,
  takenOverPlanIds,
} from "./driver.mjs";
import {
  driverGuard,
  driverHeldTaskIds,
  readOnlyPlanIds,
} from "./driver-scope.mjs";
import { ticksHeld } from "./task-issue-retirement.mjs";
import { revalidateSpecs, scheduleHolds } from "./spec-scheduler.mjs";
import { landPullRequests } from "./pr-landing.mjs";
import { landDirect } from "./direct-landing.mjs";
import { applyLandingModes, landingSettings } from "./landing-config.mjs";

// Each repository's `conflicts.maxAttempts`, older keys folded in (R87.6).
const attemptsFor = (config) => (project) =>
  landingSettings(config || {}, project.repository, project).maxAttempts;
import { noteTickRun } from "./tick-activity.mjs";

// The colon keeps this lock out of every configured project's namespace.
// GitHub projection takes it too, so one workspace has one writer at a time.
export const WORKSPACE_LOCK = {
  id: "avoozl:workspace-tick",
  projectId: "avoozl:workspace",
  kind: "tick",
};
const MAX_POLICY_BYTES = 512 * 1024;

function parsePolicy(text) {
  if (Buffer.byteLength(text) > MAX_POLICY_BYTES)
    throw Error(".avoozl.json is too large.");
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(".avoozl.json must contain a JSON object.");
  if (value.version !== 1) throw Error("Unsupported .avoozl.json version.");
  assertSafeConfig(value, ".avoozl.json");
  assertPortableRepositoryConfig(value, ".avoozl.json");
  deliveryPolicy(value);
  flowPolicy(value);
  repositoryPlugins(value);
  refuseTrackedProviders(value);
  validateContentRules(value.contentRules);
  validateModels(value.models);
  validateRoles(value);
  validatePlanReview(value.planReview);
  validateIntake(value.intake);
  return value;
}

// This machine's lanes (R6.3): lanes.local in the machine file, or undefined
// when it sets none or cannot be read (loading the config reports a bad file).
export function machineLanes(file) {
  try {
    const lanes = machineFile(file).value.lanes;
    return lanes?.local === undefined ? undefined : validateLanes(lanes).local;
  } catch {
    return undefined;
  }
}

// The delivery settings in .avoozl.json for a read that must not touch the
// tick's memory: {status: absent|loaded|invalid|unavailable, delivery}.
export function readDeliveryPolicy(workspaceRoot) {
  if (!workspaceRoot) return { status: "unavailable", delivery: null };
  let text;
  try {
    text = fs.readFileSync(path.join(workspaceRoot, ".avoozl.json"), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { status: "absent", delivery: null };
  }
  try {
    return {
      status: "loaded",
      delivery: deliveryPolicy(parsePolicy(text), {
        machineLanes: machineLanes(),
      }),
    };
  } catch (error) {
    return { status: "invalid", delivery: null, error: error.message };
  }
}

async function checkedOutCommit(root) {
  try {
    return await git(root, ["rev-parse", "--verify", "HEAD"]);
  } catch {
    return null;
  }
}

// Reads .avoozl.json from the workspace checkout. An invalid file keeps the
// last valid policy this process loaded and raises one decision per distinct
// invalid file. shortcut: the last valid policy and the reported-invalid hash
// live in memory, so a restarted MCP server reports an invalid file once more
// and has no last valid policy; persist them once policy drives decisions (§4.4).
async function loadPolicy(workspaceRoot, memory) {
  if (!workspaceRoot) return { policy: { status: "unavailable" }, notify: [] };
  const filename = path.join(workspaceRoot, ".avoozl.json");
  let text;
  try {
    text = fs.readFileSync(filename, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { policy: { status: "absent" }, notify: [] };
  }
  const hash = createHash("sha256").update(text).digest("hex"),
    commit = await checkedOutCommit(workspaceRoot);
  try {
    memory.value = parsePolicy(text);
    memory.valid = { hash, commit };
    memory.reportedInvalid = null;
    return { policy: { status: "loaded", hash, commit }, notify: [] };
  } catch (error) {
    const notify =
      memory.reportedInvalid === hash
        ? []
        : [
            {
              channel: "decision",
              title: "Avoozl kept its last valid policy",
              text: `.avoozl.json is invalid: ${error.message}`,
              resume: "Fix .avoozl.json; the next tick loads it.",
            },
          ];
    memory.reportedInvalid = hash;
    return {
      policy: {
        status: "invalid",
        hash,
        commit,
        error: error.message,
        using: memory.valid?.hash || null,
      },
      notify,
    };
  }
}

// The tick's last-run receipt sits beside the database, outside SQLite, so a
// tick that changes nothing still leaves every table untouched. The cron, the
// MCP server, and the app backend are separate processes; a file is what they
// share.
export function tickHealthPath(store) {
  return store.filename && store.filename !== ":memory:"
    ? path.join(path.dirname(path.resolve(store.filename)), "tick-health.json")
    : null;
}

function recordRun(store, run) {
  const filename = tickHealthPath(store);
  let previousAt = null;
  try {
    if (filename)
      previousAt = JSON.parse(fs.readFileSync(filename, "utf8")).at ?? null;
  } catch {}
  noteTickRun(store, run, previousAt);
  if (!filename) return;
  const temporary = `${filename}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(run) + "\n", { mode: 0o600 });
    fs.renameSync(temporary, filename);
  } catch {
    // Health is advisory; a failed receipt must not fail the tick.
    fs.rmSync(temporary, { force: true });
  }
  appendTickLog(filename, run);
}

// Every tick's receipt also goes on one line of tick-log.jsonl beside it,
// for the page's Tick health card. The file keeps the newest TICK_LOG_KEEP
// lines. shortcut: the trim rewrites the whole file each tick, which is fine
// at this size; switch to rotation if TICK_LOG_KEEP grows large.
const TICK_LOG_KEEP = 200;

const tickLogPath = (healthFile) =>
  path.join(path.dirname(healthFile), "tick-log.jsonl");

function appendTickLog(healthFile, run) {
  const filename = tickLogPath(healthFile),
    temporary = `${filename}.${process.pid}.tmp`;
  try {
    let lines = [];
    try {
      lines = fs.readFileSync(filename, "utf8").split("\n").filter(Boolean);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    lines.push(JSON.stringify(run));
    fs.writeFileSync(temporary, lines.slice(-TICK_LOG_KEEP).join("\n") + "\n", {
      mode: 0o600,
    });
    fs.renameSync(temporary, filename);
  } catch {
    fs.rmSync(temporary, { force: true });
  }
}

// One readable line per receipt: when, how bad, and what happened.
export function tickLogEntry(run) {
  const level =
    run.outcome === "error" ||
    run.outcome === "unreadable" ||
    run.policy === "invalid"
      ? "error"
      : run.outcome === "locked" ||
          run.outcome === "held" ||
          run.held ||
          run.project?.status === "error"
        ? "warn"
        : "info";
  const text =
    run.outcome === "locked"
      ? "Skipped: another tick held the lock."
      : run.outcome === "held"
        ? "Skipped: a task-issue retirement holds this workspace."
        : run.outcome === "error"
          ? `Failed: ${run.error || "unknown error"}`
          : [
              "Ran",
              run.policy ? `policy ${run.policy}` : null,
              run.project?.status ? `Project ${run.project.status}` : null,
              run.held ? `held: ${run.held.reason}` : null,
              run.error ? run.error : null,
            ]
              .filter(Boolean)
              .join("; ") + ".";
  return { at: run.at ?? null, level, text };
}

// workspace.tick.log: the newest `limit` receipts, newest first. Reads only.
export function tickLog(store, { limit = 20 } = {}) {
  const health = tickHealthPath(store),
    max = Math.max(1, Math.min(Number(limit) || 20, TICK_LOG_KEEP));
  if (!health) return { items: [] };
  let lines = [];
  try {
    lines = fs
      .readFileSync(tickLogPath(health), "utf8")
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const items = [];
  for (const line of lines.slice(-max).reverse()) {
    try {
      items.push(tickLogEntry(JSON.parse(line)));
    } catch {
      items.push({ at: null, level: "error", text: "An unreadable log line." });
    }
  }
  return { items };
}

// Who reads session statuses, for the receipt: "roster" when the cron hands
// the tick Kiro Crew's roster, "app" when the app backend must read them
// (session-observer.mjs). The page's plan-only tick keeps the cron's answer.
function observerOf(store, script, roster) {
  if (script) return { observer: roster ? "roster" : "app" };
  const previous = tickHealth(store).lastRun?.observer;
  return previous ? { observer: previous } : {};
}

// Last run, lock holder, and last error, for the Workspace view. Reads only.
export function tickHealth(store) {
  const filename = tickHealthPath(store);
  let lastRun = null;
  try {
    if (filename) lastRun = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") lastRun = { outcome: "unreadable" };
  }
  const row = store.db
    .prepare("SELECT pid FROM work_locks WHERE id=?")
    .get(WORKSPACE_LOCK.id);
  let lock = null;
  if (row) {
    let live = true;
    try {
      process.kill(row.pid, 0);
    } catch (error) {
      live = error.code !== "ESRCH";
    }
    lock = { pid: row.pid, live };
  }
  return { lastRun, lock };
}

// One dispatch intent per session request that has no bound session for its task
// and role yet. The script binds the new slot before it sends the brief, so the
// next tick sees the binding and plans nothing again. Reads only.
// shortcut: two ticks can only overlap through the lock, and the cron never
// runs two wakes of one job at once; a second dispatcher would need a claim.
function planDispatches(store, bindings) {
  const requests = listSessionRequests(store);
  if (!requests.length) return [];
  const data = store.read(),
    repositories = new Map(
      workspaceRepositories(store).map((entry) => [entry.id, entry]),
    );
  const dispatch = [];
  for (const request of requests) {
    if (
      bindings.some(
        (b) => b.taskId === request.taskId && b.role === request.role,
      )
    )
      continue;
    const task = data.tasks.find((t) => t.id === request.taskId),
      repository = repositories.get(request.repository);
    if (
      !task ||
      !repository?.localCheckout ||
      sessionRequestHold(data, task.id, request.role)
    )
      continue;
    const title = `avoozl:${task.id} ${task.title || ""}`.trim().slice(0, 200);
    dispatch.push(
      kirocrewRequest(store, {
        task: task.id,
        role: request.role,
        title,
        ...kirocrewSession(repository.id),
        id: request.id,
        executor: request.executor,
        ...kirocrewExplicitSession(store, request),
        ...(request.model ? { model: request.model } : {}),
        ...(request.permissionClass
          ? { permissionClass: request.permissionClass }
          : {}),
        checkout: repository.localCheckout,
        brief: brief(task, repository),
      }),
    );
  }
  return dispatch;
}

function brief(task, repository) {
  return [
    `Avoozl task ${task.id}: ${task.title || task.id}`,
    "",
    `Repository: ${repository.id}, checkout ${repository.localCheckout}, base branch ${repository.baseBranch || "main"}.`,
    "Before changing anything, confirm `git rev-parse --show-toplevel` is that checkout.",
    task.acceptance?.length
      ? `Acceptance: ${[].concat(task.acceptance).join("; ")}`
      : null,
    task.summary ? `Summary: ${task.summary}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

// The script's one read of the sessions its cron opened: [{target, status}],
// plus, from a Kiro Crew that reports them, model_requested, served_model,
// model_withheld and model_changed.
const NAME = (value) =>
  value === null || (typeof value === "string" && value.length <= 128);
function sessionList(value) {
  if (value === undefined) return null;
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    value.some(
      (row) =>
        !row ||
        typeof row.target !== "string" ||
        typeof row.status !== "string" ||
        ("served_model" in row &&
          (!NAME(row.served_model) ||
            !NAME(row.model_requested ?? null) ||
            typeof (row.model_withheld ?? false) !== "boolean" ||
            typeof (row.model_changed ?? false) !== "boolean")),
    )
  )
    fail(
      "Provide sessions as a list of up to 1000 {target, status} rows; model_requested and served_model are model names or null, model_withheld and model_changed are booleans.",
    );
  return value;
}

// What Kiro Crew said about a row's model, or undefined when it said nothing.
function servedOf(row) {
  if (!("served_model" in row)) return undefined;
  return {
    requested: row.model_requested ?? null,
    model: row.served_model,
    withheld: row.model_withheld === true,
    changed: row.model_changed === true,
  };
}

// The GitHub step (§6.5): verdicts for GitHub leaves, then parents complete
// and their issues close. Dependents are released by readiness in the same
// tick. A GitHub failure is reported, not thrown: local work keeps moving.
// Last, plans-repo leaves about to be dispatched get their linked branch,
// so the dispatch below can send their briefs (§6.6). Between the two,
// plans whose readiness changed are projected again (§4.5 step 10).
async function githubStep(store, github, workspaceRoot, delivery) {
  try {
    const policy = readGitHubPolicy(workspaceRoot),
      { notify, messages } = await reconcileGitHubCompletion(store, github, {
        policy,
      });
    completeParents(store);
    await closeGitHubParents(store, github, { policy });
    await closePlanAndEpicIssues(store, github, { policy });
    // Readiness changed by this tick's verdicts reaches GitHub now:
    // `dispatch.ready` for the runner.
    // A taken-over spec, and one whose shown links changed
    // (R61.23), are projected once more.
    const identity = planningIdentity(workspaceRoot),
      reproject = takenOverPlanIds(store),
      noted = notesReprojectIds(store),
      projection = await refreshProjectedReadiness(store, github, {
        identity,
        skipPlans: readOnlyPlanIds(store),
        forcePlans: new Set([...reproject, ...noted]),
      });
    for (const planId of projection.projected)
      if (reproject.has(planId)) reprojected(store, planId);
    notesReprojected(
      store,
      projection.projected.filter((planId) => noted.has(planId)),
    );
    // A linked branch is the start of new work: none for a held spec.
    const branches = await ensureLinkedBranches(store, github, {
      delivery,
      policy,
      skip: driverHeldTaskIds(store),
    });
    return {
      status: "ok",
      notify: [...notify, ...branches.notify],
      messages,
      ...(projection.projected.length || projection.errors.length
        ? { projection }
        : {}),
    };
  } catch (error) {
    return { status: "error", error: error.message, notify: [], messages: [] };
  }
}

// Issue intake (§4.5 steps 4 and 5). Rules are evaluated on every registered
// repository and broad issues advance through preview and publishing.
// Readiness changes reach GitHub through the GitHub step's re-projection.
// Like the GitHub step, a failure is reported, not thrown.
async function intakeStep(store, github, workspaceRoot, breakdownHooks) {
  try {
    const policy = readGitHubPolicy(workspaceRoot),
      notify = [];
    if (Object.values(policy.repositories || {}).some((r) => r.rules?.length)) {
      const previous = store.getMeta("githubSync");
      notify.push(
        ...intakeNotices(
          previous,
          await syncGitHubIssues(store, github, {
            policy,
            pace: { now: Date.now() },
          }),
        ),
      );
    }
    if (breakdownHooks && store.list("github_issues").some((r) => r.breakdown))
      await advanceGitHubBreakdowns(store, github, breakdownHooks());
    return { notify };
  } catch (error) {
    return {
      notify: [
        {
          channel: "failure",
          title: "Avoozl could not read GitHub issue intake",
          text: error.message,
        },
      ],
    };
  }
}

// Project sync after completion (§6.7). Its failure is reported, not
// raised: issue delivery keeps working without the Project.
async function projectStep(store, github, workspaceRoot) {
  try {
    const policy = readGitHubPolicy(workspaceRoot);
    if (!policy.project) return { result: null, notify: [] };
    const result = await syncProject(store, github, {
      policy,
      identity: planningIdentity(workspaceRoot),
      claimed: claimedTaskIds(store),
    });
    return {
      result: {
        status: result.status,
        ...(result.reason ? { reason: result.reason } : {}),
      },
      notify: result.notify,
    };
  } catch (error) {
    return { result: { status: "error", reason: error.message }, notify: [] };
  }
}

// Plugin intake sources (§4.12). A failed poll shows on its source and
// stops nothing else; closed items no task holds go after 30 days.
async function pollStep(store, plugins, planned, workspaceRoot) {
  let sources;
  try {
    sources = sourceMap(
      { workspaceRoot, settingsFile: plugins.options?.settingsFile },
      store,
    );
  } catch (error) {
    planned.notify.push({
      channel: "failure",
      title: "Avoozl could not read its intake sources",
      text: error.message,
    });
    return;
  }
  if ([...sources.values()].some((source) => source.plugin)) {
    const session = plugins.open();
    try {
      const polled = await pollSources(
        store,
        session,
        sources,
        readGitHubPolicyOrNull(workspaceRoot),
      );
      planned.notify.push(...polled.notify);
    } finally {
      await session.close();
    }
    recordHealth(store, session.report());
  }
  purgeClosed(store);
}

// [id, kind] for each plugin an unfinished task names as its route or its
// authority.
function referencedPlugins(data) {
  const found = new Map(),
    complete = (status) => statusComplete(data, status);
  for (const task of data.tasks) {
    if (completionReached(task, undefined, complete)) continue;
    const route = pluginId(taskRoute(task)),
      authority = pluginId(taskAuthority(task));
    if (route && taskKind(task) === "leaf")
      found.set(`${route}\0route`, [route, "route"]);
    if (authority) found.set(`${authority}\0tracker`, [authority, "tracker"]);
  }
  // A gate's plugin, until its gate is done or cleared (RC23.6).
  for (const task of data.tasks)
    if (
      isGate(task) &&
      task.gate?.plugin &&
      !completionReached(task, undefined, complete)
    )
      found.set(`${task.gate.plugin}\0gate`, [task.gate.plugin, "gate"]);
  return [...found.values()];
}

// Route plugins (§4.8): only the cron submits remote leaves and reads their
// status. A plugin failure parks its own leaves and is reported once.
// Order: a health check of every plugin an unfinished task names (so a
// missing or unapproved one shows on its tasks before anything calls it),
// then route submissions and statuses, then tracker reads, projection and
// closes. Returns the report and the tasks held from dispatch this tick.
async function pluginStep(store, plugins, planned, workspaceRoot) {
  const session = plugins.open();
  let held;
  try {
    for (const [id, kind] of referencedPlugins(store.read()))
      await session.use(id, kind);
    const routes = await routeStep(store, session, {
      skip: heldByTrackers(store.read(), session),
      notes: (data, task) => [
        ...blockerNotes(data, task),
        ...routeResultNotes(data, task),
      ],
    });
    planned.notify.push(...routes.notify);
    const trackers = await trackerStep(store, session, {
      namespace: planningIdentity(workspaceRoot).namespace,
    });
    planned.notify.push(...trackers.notify);
    // Tracker gates, before release: a done gate frees its dependents in
    // this same pass (RC23.7).
    const gates = await gateStep(store, session);
    planned.notify.push(...gates.notify);
    held = heldByTrackers(store.read(), session);
  } finally {
    await session.close();
  }
  const report = session.report(),
    before = pluginHealth(store);
  for (const row of report)
    if (
      row.state === "unavailable" &&
      before.get(row.id)?.reason !== row.reason
    )
      planned.notify.push({
        channel: "failure",
        title: `Avoozl parked plugin ${row.id}`,
        text: `${row.reason} Its tasks wait as "needs you"; every other task keeps moving. The next tick tries again.`,
      });
  recordHealth(store, report);
  return { report, held };
}

// The specs of these task IDs.
function plansOf(store, taskIds) {
  const wanted = new Set(taskIds),
    plans = new Set();
  for (const task of store.read().tasks)
    if (wanted.has(task.id) && task.planId) plans.add(task.planId);
  return plans;
}

// Runs a step with its GitHub calls counted under `source`.
const under =
  (source, step) =>
  (...args) =>
    withSource(source, () => step(...args));

async function runTick(
  store,
  {
    workspaceRoot,
    memory,
    sessions,
    cron = false,
    github: client,
    breakdownHooks,
    plugins,
    folders = null,
  },
) {
  const at = new Date().toISOString();
  // A task-issue retirement stops ticks from its hold until its one
  // verifying tick (R102.20, §4.32.13).
  if (ticksHeld(store)) {
    recordRun(store, { at, outcome: "held" });
    return { skipped: "retirement" };
  }
  const roster = sessionList(sessions),
    // The script cron, which carries out intents, as opposed to the page's
    // plan-only tick. A Kiro Crew with ScriptContext.session_status (MC-2)
    // also hands the cron a roster; a stock one does not, and the app backend
    // records each session's status instead (session-observer.mjs).
    script = Boolean(roster) || cron === true,
    // While GitHub's rate limit holds calls back, or the budget is low and
    // reads are spaced out, no GitHub step runs: the steps reconcile from
    // state, so the first tick after the wait does each pending write once.
    gate = client && script ? githubGate(store) : { skip: false },
    live = gate.skip ? null : client,
    // Every GitHub write of every step passes the driver backstop (§6.10).
    github = live ? driverGuard(store, live) : live;
  if (gate.low) markGithubRun(store);
  try {
    const result = await withWorkLock(store, WORKSPACE_LOCK, async () => {
      const { policy, notify } = await loadPolicy(workspaceRoot, memory);
      const ciConfig = readEffectiveCIConfig(store, {
        workspaceRoot,
        fallback: memory.value || {},
        persist: cron === true,
      });
      // A content rule set that is available again settles its decision.
      settleUnavailable(store);
      // Who drives each spec (§6.10): read before anything plans or writes,
      // so a spec driven elsewhere is read-only for this whole tick.
      // Its own plan-issue writes (claim, heartbeat, epic link) are the
      // lock itself, so it holds the unguarded client.
      notify.push(...(await driverStep(store, live, { script })).notify);
      // Observe first: statuses the script read land before any planning.
      if (roster) {
        const bound = new Set(listSessionBindings(store).map((b) => b.slot));
        for (const row of roster)
          if (bound.has(row.target))
            recordSessionStatus(
              store,
              { slot: row.target, status: row.status },
              { served: servedOf(row) },
            );
      }
      // An invalid file keeps the last valid policy's delivery settings.
      const bindings = listSessionBindings(store),
        delivery = ["loaded", "invalid"].includes(policy.status)
          ? deliveryPolicy(memory.value, { machineLanes: machineLanes() })
          : null;
      // Each repository's `landing.mode` onto its checkouts' project rows,
      // which the landing code reads (§4.25).
      if (memory.value) applyLandingModes(store, memory.value);
      const planned = { messages: [], notify: [] };
      if (delivery) {
        // Verdicts first, so a rejection is retried or decided below.
        const verifying = reconcileVerifications(store, delivery, {
          script,
        });
        Object.assign(
          planned,
          reconcileDeliveries(store, delivery, { script }),
        );
        planned.messages.unshift(...verifying.messages);
        planned.notify.push(...verifying.notify);
        planned.notify.push(
          ...holdUnprovenReviews(store, delivery, { script }).notify,
        );
        // Integration moves branches and may raise a decision, so only the
        // cron, which carries out notifications, runs it.
        if (script) {
          // Read the plan issue again before each integrate (R66.6).
          const verified = store
              .list("task_deliveries")
              .filter((d) => d.state === "verified")
              .map((d) => d.taskId),
            lost = await recheckDrivers(
              store,
              github,
              plansOf(store, verified),
            ),
            readOnly = readOnlyPlanIds(store);
          planned.notify.push(
            ...(
              await integrateVerified(store, {
                policy: delivery,
                skip: new Set(
                  store
                    .read()
                    .tasks.filter(
                      (t) =>
                        t.planId &&
                        (readOnly.has(t.planId) || lost.has(t.planId)),
                    )
                    .map((t) => t.id),
                ),
              })
            ).notify,
          );
          // `pr` projects land through pull requests (task 42.6).
          const landed = await landPullRequests(store, {
            github,
            workspaceRoot,
            rounds: attemptsFor(memory.value),
          });
          planned.notify.push(...landed.notify);
          planned.messages.push(...landed.messages);
          // `direct` projects push to their remote from the tick (41.9).
          const pushed = await landDirect(store, {
            github,
            workspaceRoot,
            rounds: attemptsFor(memory.value),
            config: memory.value,
          });
          planned.notify.push(...pushed.notify);
          planned.messages.push(...pushed.messages);
        }
        // Stop the line (§4.11): a failure on the task's own base, a worker
        // that names its cause, and the landing branch's checks. Pauses new
        // dispatch only; running sessions are left alone.
        if (script) {
          const config = memory.value || {};
          planned.notify.push(
            ...(await judgeBaseFailures(store, config)).notify,
            ...blockedNaming(store, config).notify,
            ...(await watchLine(store, config)).notify,
          );
        }
        // A person reverting an integrated agent commit is a correction
        // (§4.24, R78.1); a repository that cannot be read waits a tick.
        if (script) await revertCorrections(store).catch(() => []);
        // Dependents are released by readiness below, in this same tick.
        completeParents(store);
      }
      // The private mirror follows its source before anything is projected
      // (RC24.4): fast-forward only, one row for a divergence.
      if (script && github)
        try {
          const policy = readGitHubPolicyOrNull(workspaceRoot),
            publicBranches = (repository, mirror) =>
              publicBranchesOf(store, policy, repository, mirror),
            step = await mirrorSyncStep(store, github, {
              policy,
              publicBranches,
            });
          planned.notify.push(...step.notify);
          for (const text of [
            ...step.errors,
            ...(await publishInstanceStep(store, github, { policy })).errors,
            ...(
              await under("forward", mirrorForwardStep)(store, github, {
                policy,
                publicBranches,
              })
            ).errors,
            ...(await mirrorBatchStep(store, github, { policy })).errors,
            ...(
              await under("forward", mirrorForwardRunStep)(store, github, {
                policy,
                files: new RepoFiles({
                  github,
                  root: workspaceRoot
                    ? path.join(workspaceRoot, ".avoozl", "local", "git-cache")
                    : null,
                }),
              })
            ).errors,
            ...(
              await under("forward", mirrorPublicPollStep)(store, github, {
                policy,
              })
            ).errors,
            ...(await mirrorForwardAuditStep(store, github, { policy })).errors,
            ...(await publicBranchStep(store, github, { policy })).errors,
          ])
            planned.notify.push({
              channel: "failure",
              title: "Avoozl could not sync a mirror",
              text,
            });
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not sync a mirror",
            text: error.message,
          });
        }
      // Only the cron reads and writes GitHub; the page's tick plans only.
      const githubResult =
        script && github
          ? await githubStep(store, github, workspaceRoot, delivery)
          : null;
      if (githubResult) {
        planned.notify.push(...githubResult.notify);
        planned.messages.push(...githubResult.messages);
      }
      if (script && github)
        planned.notify.push(
          ...(await intakeStep(store, github, workspaceRoot, breakdownHooks))
            .notify,
        );
      // The public crew audit (R85.6, R85.7, §6.14): what a crew wrote on a
      // public repository since the last pass, checked with content rules.
      if (script && github)
        try {
          const step = await publicCrewAudit(store, github, {
            policy: readGitHubPolicyOrNull(workspaceRoot),
          });
          planned.notify.push(...step.notify);
          for (const text of step.errors)
            planned.notify.push({
              channel: "failure",
              title: "Avoozl could not audit a public crew",
              text,
            });
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not audit a public crew",
            text: error.message,
          });
        }
      // The waiting label on tracker gates and their gate-only dependents
      // (RC23.4): written from state, so a quiet tick makes no call.
      if (script && github)
        try {
          const step = await gateLabelStep(
            store,
            github,
            readGitHubPolicyOrNull(workspaceRoot),
          );
          for (const text of step.errors)
            planned.notify.push({
              channel: "failure",
              title: "Avoozl could not label a tracker gate",
              text,
            });
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not label a tracker gate",
            text: error.message,
          });
        }
      // A resolver chat that is already running is finished (RC28).
      if (script && github)
        try {
          const step = await conflictFixStep(store, github, {
            policy: readGitHubPolicyOrNull(workspaceRoot),
            delivery: delivery || {},
          });
          planned.notify.push(...step.notify);
          for (const text of step.errors)
            planned.notify.push({
              channel: "failure",
              title: "Avoozl could not fix a source conflict",
              text,
            });
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not fix a source conflict",
            text: error.message,
          });
        }
      // Review drafts by label (RC20): new labels, and drafts waiting on a
      // person. Dispatch of the chats waits for the roster check below. A
      // read that fails keeps the last state and is tried next tick (design
      // D25), so it raises no notice each minute.
      if (script && github)
        try {
          const step = await under(
            "review",
            reviewDraftStep,
          )({
            store,
            github,
            policy: readGitHubPolicyOrNull(workspaceRoot),
          });
          planned.notify.push(...step.notify);
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not check review drafts",
            text: error.message,
          });
        }
      // Main into each epic's integration branch (RC16.6): one merge commit
      // per schedule, from the machine that holds the repository.
      if (script && github)
        try {
          const policy = readGitHubPolicyOrNull(workspaceRoot),
            machine = store.getMeta("machineIdentity")?.id,
            found = policy?.mode ? syncTargets(store, policy) : null;
          if (found) {
            const mine = found.targets.filter(
                (target) =>
                  machine &&
                  store.get("github_repositories", target.repository)
                    ?.activeMachine === machine,
              ),
              step = await syncStep(store, github, mine, {
                policy,
                problems: found.problems,
              });
            planned.notify.push(...step.notify);
            for (const text of step.errors)
              planned.notify.push({
                channel: "failure",
                title: "Avoozl could not sync an integration branch",
                text,
              });
            // The branch head's checks, acceptance for it, and the stop that
            // holds the epic's line while it is red or the sync conflicts
            // (RC16.3, RC16.7).
            for (const text of (await headStep(store, github, mine, { policy }))
              .errors)
              planned.notify.push({
                channel: "failure",
                title: "Avoozl could not read an integration branch head",
                text,
              });
          }
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not sync an integration branch",
            text: error.message,
          });
        }
      // The Untriaged list (§8.5): one read-only search per repository per
      // interval, cached for the page.
      if (script && github)
        try {
          const policy = readGitHubPolicyOrNull(workspaceRoot);
          planned.notify.push(
            ...(
              await refreshUntriaged(
                store,
                github,
                policy,
                store.read().tasks,
                {
                  namespace: namespaceOf(workspaceRoot),
                },
              )
            ).notify,
          );
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not read untriaged GitHub items",
            text: error.message,
          });
        }
      // Comment-mention steering (task 8.2), off unless a repository sets it.
      if (script && github)
        try {
          const steer = await steeringStep(
            store,
            github,
            readGitHubPolicy(workspaceRoot),
          );
          planned.messages.push(...steer.messages);
          planned.notify.push(...steer.notify);
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not read steering comments",
            text: error.message,
          });
        }
      // Pull request feedback (§4.13): before dispatch, so a resume brief
      // in this same tick carries it.
      if (script && github && delivery)
        try {
          const feedback = await feedbackStep(store, github, {
            policy: readGitHubPolicy(workspaceRoot),
            delivery,
          });
          planned.messages.push(...feedback.messages);
          planned.notify.push(...feedback.notify);
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not read pull request feedback",
            text: error.message,
          });
        }
      // The evidence comment on each open pull request (§4.22, R76.4),
      // after feedback read the pull requests this tick.
      if (script && github && delivery)
        try {
          const policy = readGitHubPolicy(workspaceRoot);
          planned.notify.push(
            ...(
              await evidenceCommentStep(store, github, {
                leak: (text) =>
                  policy.mode === "plans-repo" &&
                  findPlanningLeak(
                    [["evidence", text]],
                    policy.planningRepository,
                  ),
              })
            ).notify,
          );
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not update evidence comments",
            text: error.message,
          });
        }
      // CI per pull request for the retro (§4.30): after feedback, so the
      // open pull request read is the one this tick already made.
      if (script)
        try {
          const step = await ciStep(store, github, {
            policy: readGitHubPolicyOrNull(workspaceRoot),
            config: ciConfig,
          });
          for (const { repository, error } of step.errors)
            planned.notify.push({
              channel: "failure",
              title: `Avoozl could not read CI runs for ${repository}`,
              text: error,
            });
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not count CI time",
            text: error.message,
          });
        }
      // The board is read after this tick's completion and state changes, and
      // before dispatch, so a Deferred card stops dispatch in this same tick.
      // Only the cron, which carries out notifications, runs it.
      const project =
        script && github
          ? await projectStep(store, github, workspaceRoot)
          : { result: null, notify: [] };
      planned.notify.push(...project.notify);
      // Remote leaves, after this tick's completions released them and
      // before local dispatch, so a route's result reaches its dependents'
      // briefs in this same tick.
      const pluginResult =
          script && delivery && plugins
            ? await pluginStep(store, plugins, planned, workspaceRoot)
            : null,
        pluginReport = pluginResult?.report;
      // Incoming items from plugin sources (§4.12): one poll per source,
      // before dispatch, so a delivered item's leaf can start this tick.
      if (script && plugins)
        await pollStep(store, plugins, planned, workspaceRoot);
      // After a restart, and on every tick, nothing new is dispatched until
      // every live session this cron opened has been observed in the roster.
      // Without a roster (a stock Kiro Crew), a session counts as observed
      // once the app backend has recorded any status for it; a stale reading
      // only keeps its task claimed, so it never causes a second dispatch.
      const listed = new Set((roster || []).map((row) => row.target)),
        observed = (b) =>
          roster || !script ? listed.has(b.slot) : Boolean(b.status),
        // A session on a crew that stopped answering stays bound and is not
        // waited on (R41.10); when the crew answers again its roster lists
        // it, so it is observed before anything new opens.
        unreachable = new Set(
          (crewSnapshot(store)?.instances || [])
            .filter((i) => i.reachable === false)
            .map((i) => i.id),
        ),
        unobserved = bindings
          // Historical relay bindings live on another crew; leave them alone.
          .filter((b) => b.source === "tick" && !b.relay && liveAttempt(b))
          .filter((b) => !(b.crew && unreachable.has(b.crew)))
          .filter((b) => !observed(b))
          .map((b) => b.slot);
      // Respond (§6.2): label, one responder per snapshot, label removed
      // when it ends. Cleanup runs even while new dispatch is held.
      let responders = [];
      if (script && github)
        try {
          responders = (
            await respondStep(store, github, workspaceRoot, {
              open: !unobserved.length,
              config: memory.value || {},
            })
          ).dispatch;
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not run the respond step",
            text: error.message,
          });
        }
      // Planner sessions for matched issues: one to classify and draft, one
      // isolated critique per drafted revision.
      let planners = [];
      if (script && github)
        try {
          const step = plannerStep(store, workspaceRoot, {
            open: !unobserved.length,
            config: memory.value || {},
          });
          planners = step.dispatch;
          planned.notify.push(...step.notify);
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not start planner sessions",
            text: error.message,
          });
        }
      // No new work for a spec driven elsewhere or being handed off, and
      // none for an away task (R66.6, R66.10, R66.11).
      const held = driverHeldTaskIds(store),
        readOnly = readOnlyPlanIds(store);
      const requested = unobserved.length
          ? []
          : planDispatches(store, bindings).filter((d) => !held.has(d.task)),
        readySkip = new Set([
          ...requested.map((d) => d.task),
          ...(pluginResult?.held || []),
          ...held,
        ]),
        // Ranking, release and repository-wide path holds (spec-scheduler.mjs).
        schedule =
          unobserved.length || !delivery || delivery.runner !== "tick"
            ? null
            : scheduleHolds(store, {
                github: readGitHubPolicyOrNull(workspaceRoot),
                skip: readySkip,
              }),
        ready = !schedule
          ? []
          : planReadyDispatches(store, delivery, {
              skip: new Set([...readySkip, ...schedule.skip]),
              // Settings › Models' worker harness (R98.3, R98.6).
              config: memory.value || {},
              github: readGitHubPolicyOrNull(workspaceRoot),
            }),
        verify =
          unobserved.length || !delivery
            ? []
            : planVerifierDispatches(store, delivery, {
                config: memory.value || {},
              });
      // Investigate first (§4.21): a falsifier per round of findings, and
      // the Go ahead, Investigate again or Stop each decision owes.
      const investigation =
        unobserved.length || !delivery
          ? { dispatch: [], messages: [], notify: [] }
          : investigationStep(store, delivery, {
              script,
              briefAllowed: (input) => briefAllowed(store, input),
              writerModel: (b) => b.model || delivery.model || null,
              config: memory.value || {},
            });
      planned.messages.push(...investigation.messages);
      planned.notify.push(...investigation.notify);
      // Command-only bars are checked by Avoozl itself, off this path: the
      // cron queues each run here and the app backend runs the queue
      // (check-runs.mjs). A spec driven elsewhere queues nothing.
      if (script && delivery)
        queueCheckRuns(
          store,
          planCheckRuns(store, delivery).filter(
            (run) => !readOnly.has(run.task.planId),
          ),
        );
      // Timing (§4.11): queued, attempt starts, verifier and review
      // sessions, and merge. Always on; writes only what changed.
      syncSpans(store);
      // Retrospectives (§4.11): one at a time, on the cron only.
      const home = store.list("projects").find((p) => p.root),
        retro =
          script && !unobserved.length
            ? retroStep(store, memory.value || {}, {
                repository: home?.id ?? null,
                ciConfig,
                ciRepositories: ciRepositories(
                  readGitHubPolicyOrNull(workspaceRoot),
                ),
              })
            : { dispatch: [] };
      // Code review chats a person asked for (pr-review.mjs), cron only.
      const roleConfig = memory.value || {},
        reviews =
          script && !unobserved.length
            ? [
                ...reviewDispatches(store, { config: roleConfig }),
                ...reviewDraftDispatches(store, { config: roleConfig }),
                ...taskSummaryDispatches(store, { config: roleConfig }),
                ...conflictFixDispatches(store),
              ]
            : [];
      // Read each spec's plan issue again right before its dispatches; a
      // spec reassigned since the sync read dispatches nothing (R66.6).
      const taskPlan = new Map(
          store
            .read()
            .tasks.filter((t) => t.planId)
            .map((t) => [t.id, t.planId]),
        ),
        readOnlyTask = (id) => readOnly.has(taskPlan.get(id)),
        heldTask = (id) => held.has(id) || readOnlyTask(id);
      let dispatch = [
        ...requested,
        ...ready,
        // A verifier judges work already done: it runs while a spec drains.
        ...verify.filter((d) => !readOnlyTask(d.task)),
        ...investigation.dispatch.filter((d) => !heldTask(d.task)),
        ...responders.filter((d) => !heldTask(d.task)),
        ...planners.filter((d) => !heldTask(d.task)),
        ...retro.dispatch,
        ...reviews.filter((d) => !heldTask(d.task)),
      ];
      // Settings › Models: the planner, retro and review-draft chats open on
      // the saved model.
      dispatch = withChatModels(dispatch, memory.value || {});
      const pending = cron ? pendingSessionRequests(store) : [],
        lostDispatchPlans = script
          ? await recheckDrivers(
              store,
              live,
              new Set(
                [...dispatch, ...pending]
                  .map((d) => taskPlan.get(d.task))
                  .filter(Boolean),
              ),
            )
          : new Set(),
        // Each spec's journal again right before its worker dispatches: a
        // displaced generation, a stop or a held journal holds the spec's
        // new work, and an outstanding landing intent holds its tasks
        // (§4.32.7). Verifiers and messages to running chats go on.
        generations = await revalidateSpecs(store, {
          github: live,
          workspaceRoot,
          planIds: [...ready, ...pending]
            .filter((d) => d.role === "worker" && d.operation !== "send")
            .flatMap((d) => [d.task, ...(d.batch?.tasks || [])])
            .map((id) => taskPlan.get(id))
            .filter(Boolean),
        }),
        generationHeld = (d) =>
          d.role === "worker" &&
          [d.task, ...(d.batch?.tasks || [])].some(
            (id) =>
              generations.tasks.has(id) ||
              generations.plans.has(taskPlan.get(id)),
          );
      if (lostDispatchPlans.size)
        dispatch = dispatch.filter(
          (d) => !lostDispatchPlans.has(taskPlan.get(d.task)),
        );
      dispatch = dispatch.filter((d) => !generationHeld(d));
      // No message reaches a session of a read-only spec.
      planned.messages = planned.messages.filter(
        (m) => !readOnly.has(taskPlan.get(m.task)),
      );
      // Avoozl never asks for a force push (R77.3): such a brief or
      // message is dropped here, whichever step wrote it, and said once.
      const forced = [
        ...dispatch.filter((d) => asksForcePush(d.brief)),
        ...planned.messages.filter((m) => asksForcePush(m.text)),
      ];
      if (forced.length) {
        dispatch = dispatch.filter((d) => !asksForcePush(d.brief));
        planned.messages = planned.messages.filter(
          (m) => !asksForcePush(m.text),
        );
        for (const id of new Set(forced.map((f) => f.task)))
          planned.notify.push({
            channel: "failure",
            task: id,
            title: `Avoozl did not send a force push request for ${id}`,
            text: "A brief or message asked for a force push, so it was not sent. Writers bring the base branch in with a merge commit instead.",
          });
      }
      // One notice per rate-limit window; a step that failed on the limit
      // adds nothing of its own.
      const notices = [
        ...notify,
        ...planned.notify,
        ...(script ? rateLimitNotices(store) : []),
      ].filter(
        (n) =>
          n.title === "GitHub rate limit reached" ||
          !RATE_LIMIT_TEXT.test(n.text || ""),
      );
      const dispatched = dispatch,
        messages = planned.messages;
      notices.push(...kirocrewDispatches(store, dispatched, folders));
      const sends = messages.map((message) => ({
        ...message,
        executor:
          message.executor ??
          bindings.find((binding) => binding.slot === message.slot)?.executor ??
          "kirocrew",
      }));
      const transport = cron
        ? store.transaction(() => {
            const requests = enqueueSessionRequests(store, {
              starts: dispatched,
              sends,
            });
            for (const request of requests.starts)
              persistKirocrewConfiguration(store, request);
            // A crash before the consumer took a request must not strand it.
            const pending = pendingSessionRequests(store, undefined, [
              ...requests.starts,
              ...requests.sends,
            ]);
            return {
              starts: unobserved.length
                ? []
                : pending.filter(
                    (request) =>
                      request.operation === "start" &&
                      !readOnlyTask(request.task) &&
                      !lostDispatchPlans.has(taskPlan.get(request.task)) &&
                      !generationHeld(request) &&
                      (request.role === "verifier" ||
                        !heldTask(request.task)) &&
                      !asksForcePush(request.brief),
                  ),
              sends: pending.filter(
                (request) =>
                  request.operation === "send" &&
                  !readOnlyTask(request.task) &&
                  !lostDispatchPlans.has(taskPlan.get(request.task)) &&
                  !asksForcePush(request.text),
              ),
            };
          })
        : { starts: dispatched, sends };
      // The cron's tick queues each notice once for the app's notification
      // channels; the app backend pushes it (notifications.mjs).
      if (script) queueNotifications(store, notices);
      // The activity log (§4.19): what GitHub and plugin sync changed since
      // the last tick, once each, then rows past the retention go.
      recordTickActivity(store, memory.value || {});
      return {
        policy,
        ...(githubResult
          ? {
              github: {
                status: githubResult.status,
                ...(githubResult.error ? { error: githubResult.error } : {}),
                ...(githubResult.projection
                  ? { projection: githubResult.projection }
                  : {}),
              },
            }
          : {}),
        // A closed or lost session is final; it is read once and not again.
        observe: bindings
          .filter((b) => !FINAL_STATUSES.has(b.status))
          .map(({ slot, taskId, role }) => ({ slot, taskId, role })),
        dispatch: transport.starts,
        messages: transport.sends,
        notify: notices.map((notice) => ({
          ...notice,
          link: sessionUrl(notice.slot),
        })),
        ...(unobserved.length
          ? { held: { reason: "unobserved", slots: unobserved } }
          : {}),
        ...(project.result ? { project: project.result } : {}),
        ...(pluginReport?.length ? { plugins: pluginReport } : {}),
      };
    });
    recordRun(store, {
      at,
      outcome: "ok",
      policy: result.policy.status,
      ...observerOf(store, script, roster),
      ...(result.policy.error ? { error: result.policy.error } : {}),
      ...(result.held ? { held: result.held } : {}),
      ...(result.project ? { project: result.project } : {}),
    });
    return result;
  } catch (error) {
    if (error.contention) {
      recordRun(store, {
        at,
        outcome: "locked",
        ...observerOf(store, script, roster),
      });
      return { skipped: "locked" };
    }
    recordRun(store, {
      at,
      outcome: "error",
      error: error.message,
      ...observerOf(store, script, roster),
    });
    throw error;
  }
}

export const tick = (store, options) =>
  withSource("tick", () =>
    withGitHubReadSnapshots(() => runTick(store, options)),
  );
