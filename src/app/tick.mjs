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
import {
  releaseChangedPlanIds,
  releaseRecorded,
} from "./radar-coder-queue.mjs";
import { recordActivity, recordTickActivity } from "./activity-log.mjs";
import fs from "node:fs";
import { validateTrackedRouting } from "./placement.mjs";
import { crewSnapshot } from "./crews.mjs";
import {
  closeNoFit,
  fetchAll,
  openNoFit,
  routingContext,
  routingFacts,
} from "./routing.mjs";
import { expireRouter, openRouter, spendRouter } from "./router.mjs";
import { setRoutingMarks } from "./routing-health.mjs";
import { dropQueued, relayHeldTasks, relayStep } from "./relay.mjs";
import path from "node:path";
import { createHash } from "node:crypto";
import { git, withWorkLock } from "./git.mjs";
import {
  assertPortableRepositoryConfig,
  assertSafeConfig,
} from "./layered-config.mjs";
import { flowPolicy, syncSpans } from "./flow.mjs";
import {
  budgetHeldTaskIds,
  budgetStep,
  validateTrackedBudgets,
} from "./budget.mjs";
import { blockedNaming, judgeBaseFailures, watchLine } from "./flow-line.mjs";
import { retroStep } from "./flow-retro.mjs";
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
import { crewStep } from "./github-crew.mjs";
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
import { mergeStep } from "./radar-merge.mjs";
import { reviewDraftDispatches, reviewDraftStep } from "./review-draft.mjs";
import { syncStep, syncTargets } from "./integration-sync.mjs";
import { armStep } from "./radar-arm.mjs";
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
  pluginId,
  taskAuthority,
  taskKind,
  taskRepository,
  taskRoute,
} from "../work-model.mjs";
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
  validateTrackedRouting(value);
  validateContentRules(value.contentRules);
  validateIntake(value.intake);
  validateTrackedBudgets(value);
  return value;
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
    return { status: "loaded", delivery: deliveryPolicy(parsePolicy(text)) };
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
export const TICK_LOG_KEEP = 200;

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
      : run.outcome === "locked" || run.held || run.project?.status === "error"
        ? "warn"
        : "info";
  const text =
    run.outcome === "locked"
      ? "Skipped: another tick held the lock."
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
    if (!task || !repository?.localCheckout) continue;
    const title = `avoozl:${task.id} ${task.title || ""}`.trim().slice(0, 200);
    dispatch.push({
      task: task.id,
      role: request.role,
      title,
      folder: `Avoozl/${repository.id}`,
      agent: request.agent,
      checkout: repository.localCheckout,
      brief: brief(task, repository),
    });
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
    await closeGitHubParents(store, github);
    await closePlanAndEpicIssues(store, github);
    // Readiness changed by this tick's verdicts reaches GitHub now: the
    // ready label for Issue Radar, `dispatch.ready` for the runner.
    // A taken-over spec, and one whose shown links and notes changed
    // (R61.23), are projected once more.
    const identity = planningIdentity(workspaceRoot),
      reproject = takenOverPlanIds(store),
      noted = notesReprojectIds(store),
      // A changed capacity, scope, release mode or Step click (RC4.5).
      released = releaseChangedPlanIds(store, identity),
      projection = await refreshProjectedReadiness(store, github, {
        identity,
        skipPlans: readOnlyPlanIds(store),
        forcePlans: new Set([...reproject, ...noted, ...released]),
      });
    releaseRecorded(
      store,
      identity,
      projection.projected.filter((planId) => released.has(planId)),
    );
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

export async function tick(
  store,
  {
    workspaceRoot,
    memory,
    sessions,
    cron = false,
    github: client,
    breakdownHooks,
    plugins,
    placement = {},
    folders = null,
    issueVerify,
  },
) {
  // Every GitHub write of every step passes the driver backstop (§6.10).
  const github = client ? driverGuard(store, client) : client;
  const at = new Date().toISOString(),
    roster = sessionList(sessions),
    // The script cron, which carries out intents, as opposed to the page's
    // plan-only tick. A Kiro Crew with ScriptContext.session_status (MC-2)
    // also hands the cron a roster; a stock one does not, and the app backend
    // records each session's status instead (session-observer.mjs).
    script = Boolean(roster) || cron === true;
  try {
    const result = await withWorkLock(store, WORKSPACE_LOCK, async () => {
      const { policy, notify } = await loadPolicy(workspaceRoot, memory);
      // A content rule set that is available again settles its decision.
      settleUnavailable(store);
      // Who drives each spec (§6.10): read before anything plans or writes,
      // so a spec driven elsewhere is read-only for this whole tick.
      // Its own plan-issue writes (claim, heartbeat, epic link) are the
      // lock itself, so it holds the unguarded client.
      notify.push(...(await driverStep(store, client, { script })).notify);
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
          ? deliveryPolicy(memory.value)
          : null;
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
      // Budgets (§4.17): the check before any dispatch for a task. A stop
      // queues one message per live session; nothing is closed.
      const budget = budgetStep(store, store.read(), {
        script,
        tracked: memory.value || {},
      });
      planned.messages.push(...budget.messages);
      planned.notify.push(...budget.notify);
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
      // Issue Radar's claim and needs-human labels (§6.4).
      const crew =
        script && github ? await crewStep(store, github, workspaceRoot) : null;
      if (crew) planned.notify.push(...crew.notify);
      // Ready to merge rows and the conflict label on Issue Radar pull
      // requests (RC5.3, RC5.6): one read per repository per interval.
      if (script && github)
        try {
          const step = await mergeStep(
            store,
            github,
            readGitHubPolicyOrNull(workspaceRoot),
            delivery || {},
          );
          planned.notify.push(...step.notify);
          for (const text of step.errors)
            planned.notify.push({
              channel: "failure",
              title: "Avoozl could not check pull requests for merging",
              text,
            });
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not check pull requests for merging",
            text: error.message,
          });
        }
      // Review drafts by label (RC20): new labels, and drafts waiting on a
      // person. Dispatch of the chats waits for the roster check below. A
      // read that fails keeps the last state and is tried next tick (design
      // D25), so it raises no notice each minute.
      if (script && github)
        try {
          const step = await reviewDraftStep({
            store,
            github,
            policy: readGitHubPolicyOrNull(workspaceRoot),
            tasks: store.read().tasks,
          });
          planned.notify.push(...step.notify);
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not check review drafts",
            text: error.message,
          });
        }
      // Arm auto-merge on crew pull requests (RC5.2, RC5.8).
      if (script && github && delivery)
        try {
          planned.notify.push(
            ...(
              await armStep(store, github, {
                policy: readGitHubPolicy(workspaceRoot),
                delivery,
                identity: planningIdentity(workspaceRoot),
                ...(issueVerify ? { verify: issueVerify } : {}),
              })
            ).notify,
          );
        } catch {
          // An unreadable policy is reported by the steps above.
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
          // A relayed worker is on a crew no roster here lists (relay.mjs).
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
      // Placement (§4.10): crews, rules, and readings for this tick. A
      // broken machine settings file keeps every session local.
      let routing = null;
      if (delivery && !unobserved.length)
        try {
          routing = routingContext(store, {
            workspaceRoot,
            tracked: memory.value || {},
            ...(placement.localReading
              ? { local: placement.localReading() }
              : {}),
            ...(placement.now ? { now: placement.now() } : {}),
            script,
          });
          await fetchAll(store, routing, { fetch: script });
          routing.routerQueue = [];
          routing.onlyOne = [];
          expireRouter(store, routing, bindings);
        } catch (error) {
          routing = null;
          planned.notify.push({
            channel: "failure",
            title: "Avoozl placed every session on this machine",
            text: `Placement settings could not be read: ${error.message}`,
          });
        }
      const waits = [],
        fits = [],
        placementState = { crews: new Map(), choices: new Map() };
      // No new work for a spec driven elsewhere or being handed off, and
      // none for an away task (R66.6, R66.10, R66.11).
      const held = driverHeldTaskIds(store),
        readOnly = readOnlyPlanIds(store);
      // MC-1: a session takes its project from its chat folder, and only a
      // person can set a folder's project directory. The cron reads its
      // folders first. Placement leaves local out for a leaf whose folder
      // has none, so it asks no routing chat each tick while it cannot start.
      const folderUnset = (folder) =>
        Boolean(folders && typeof folders === "object") &&
        folders[folder] === false;
      if (routing)
        routing.localFolderUnset = (task) =>
          folderUnset(`Avoozl/${taskRepository(task)}`);
      const requested = unobserved.length
          ? []
          : planDispatches(store, bindings).filter((d) => !held.has(d.task)),
        ready =
          unobserved.length || !delivery || delivery.runner !== "tick"
            ? []
            : planReadyDispatches(store, delivery, {
                skip: new Set([
                  ...requested.map((d) => d.task),
                  ...(pluginResult?.held || []),
                  ...held,
                  // A request queued for the Remote relay holds its task.
                  ...relayHeldTasks(store),
                ]),
                github: readGitHubPolicyOrNull(workspaceRoot),
                routing,
                placementState,
                waits,
                fits,
              }),
        verify =
          unobserved.length || !delivery
            ? []
            : planVerifierDispatches(store, delivery, {
                routing,
                placementState,
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
      // One routing call for every worker waiting on a pick (§4.10). An
      // answer read this tick is spent first, so the next call carries this
      // tick's facts, not the last one's.
      const routerHome = store.list("projects").find((p) => p.root);
      if (routing && script) spendRouter(store);
      const router =
        routing && script && routing.config.enabled
          ? openRouter(store, routing, {
              folder: routerHome ? `Avoozl/${routerHome.id}` : null,
              briefAllowed: (input) => briefAllowed(store, input),
              facts: routingFacts(store, routing),
            })
          : null;
      if (router) ready.push({ ...router, project: false });
      // No fit (R41.8): one decision per task; it closes when the task fits.
      for (const id of fits) closeNoFit(store, id);
      // Marks for tasks routing holds, shown on each task (routing-health.mjs).
      if (routing && script)
        setRoutingMarks(
          store,
          Object.fromEntries(
            waits
              .filter(
                ({ result }) =>
                  result.routingFailed ||
                  (result.noFit && routing.config.enabled),
              )
              .map(({ task, result }) => [
                task.id,
                { why: result.why, retryAt: result.retryAt ?? null },
              ]),
          ),
        );
      for (const { task, result } of waits)
        if (result.noFit)
          planned.notify.push(...openNoFit(store, task, result, { script }));
        else closeNoFit(store, task.id);
      // Timing (§4.11): queued, attempt starts, verifier and review
      // sessions, and merge. Always on; writes only what changed.
      syncSpans(store);
      // Retrospectives (§4.11): one at a time, on the cron only.
      const home = store.list("projects").find((p) => p.root),
        retro =
          script && !unobserved.length
            ? retroStep(store, memory.value || {}, {
                folder: home ? `Avoozl/${home.id}` : null,
              })
            : { dispatch: [] };
      // Code review chats a person asked for (pr-review.mjs), cron only.
      const reviews =
        script && !unobserved.length
          ? [...reviewDispatches(store), ...reviewDraftDispatches(store)]
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
      if (script) {
        const lost = await recheckDrivers(
          store,
          client,
          new Set(dispatch.map((d) => taskPlan.get(d.task)).filter(Boolean)),
        );
        if (lost.size)
          dispatch = dispatch.filter((d) => !lost.has(taskPlan.get(d.task)));
      }
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
      const notices = [...notify, ...planned.notify];
      // Nothing new starts for a task at its budget, and its sessions get
      // only the budget's own messages until a person acts (R67.8).
      const budgetHeld = budgetHeldTaskIds(store),
        heldSlots = new Set(
          bindings
            .filter((b) =>
              [b.taskId, ...(b.batch?.tasks || [])].some((id) =>
                budgetHeld.has(id),
              ),
            )
            .map((b) => b.slot),
        ),
        open = (d) =>
          ![d.task, ...(d.batch?.tasks || [])].some((id) => budgetHeld.has(id)),
        allDispatches = dispatch.filter(open),
        sendable = planned.messages.filter(
          (m) => m.budget || !heldSlots.has(m.slot),
        );
      // The Remote relay (relay.mjs, R41.17): a remote pick and any message
      // for a relayed worker are queued for the relay chat, which only the
      // person's turn wakes. Off, or MC-10 landed: queued requests go.
      const relayed = allDispatches.filter((d) => d.relay),
        dispatched = allDispatches.filter((d) => !d.relay);
      if (routing && !routing.relayActive) dropQueued(store);
      const messages = relayStep(store, {
        dispatches: relayed,
        messages: sendable,
        now: routing?.now ?? Date.now(),
      });
      // A dispatch whose folder has no project directory waits too, and the
      // person hears once what to set (the same notice is queued once).
      const unset = new Set(
        waits
          .filter(({ result }) => result.folder)
          .map(({ task }) => `Avoozl/${taskRepository(task)}`),
      );
      for (let i = dispatched.length - 1; i >= 0; i--) {
        const d = dispatched[i];
        if (d.project === false || !folderUnset(d.folder)) continue;
        unset.add(d.folder);
        dispatched.splice(i, 1);
      }
      for (const folder of unset) {
        const id = folder.split("/").pop(),
          checkout = store.get("projects", id)?.root;
        notices.push({
          channel: "decision",
          title: `Set the project directory of chat folder ${folder.replaceAll("/", " › ")}`,
          text: `Avoozl has work ready for ${id}, but its chat folder ${folder.replaceAll("/", " › ")} has no project directory, so no chat opens there. Only a person can set it.`,
          resume: `In the Kiro Crew sidebar, open the folder's settings and set its project directory${checkout ? ` to ${checkout}` : " to the checkout"}. The next tick starts the work.`,
        });
      }
      // The cron's tick queues each notice once for the app's notification
      // channels; the app backend pushes it (notifications.mjs).
      if (script) queueNotifications(store, notices);
      // A worker the router did not judge, because one choice was left.
      if (script)
        for (const one of routing?.onlyOne || [])
          if (dispatched.some((d) => d.task === one.taskId))
            recordActivity(store, {
              source: "local",
              actor: "avoozl",
              kind: "routing.only-one",
              summary: `Only one choice for ${one.taskId}: ${one.crew}${one.model ? " on " + one.model : ""}; no router call`,
              targetId: one.taskId,
              key: `routing.only-one:${one.taskId}:${one.attempt}`,
            });
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
        dispatch: dispatched,
        messages,
        notify: notices.map((notice) => ({
          ...notice,
          link: sessionUrl(notice.slot),
        })),
        ...(unobserved.length
          ? { held: { reason: "unobserved", slots: unobserved } }
          : {}),
        ...(project.result ? { project: project.result } : {}),
        ...(pluginReport?.length ? { plugins: pluginReport } : {}),
        ...(crew?.status === "error"
          ? { crew: { status: crew.status, error: crew.error } }
          : {}),
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
