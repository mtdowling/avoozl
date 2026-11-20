import { offeredTaskIds } from "../workers/worker-offer-step.mjs";
import { withGitHubReadSnapshots } from "../github/github-read-snapshot.mjs";
import {
  enqueueSessionRequests,
  pendingSessionRequests,
} from "../sessions/session-requests.mjs";
import {
  persistKirocrewConfiguration,
  kirocrewExplicitSession,
} from "../executors/kirocrew.mjs";
import { kirocrewRequest } from "../executors/kirocrew.mjs";
import { kirocrewSession, kirocrewDispatches } from "../executors/kirocrew.mjs";
// workspace.tick: the one bounded, idempotent step a Kiro Crew script cron runs
// every minute. It returns intents for the script to carry out; it never opens
// sessions or sends messages itself. It takes the lock, loads policy, records
// the session statuses the script read, reconciles worker and verifier
// outcomes, integrates verified commits, completes parents from their
// children, and plans dispatches: one per open session request, ready local
// leaves when `.avoozl.json` turns delivery on, and one verifier per worker
// done report. On the cron it also reads and writes GitHub: completion,
// the triage agent, broad-issue publishing, re-projection and the Project
// board.
import { recordActivity, recordTickActivity } from "../store/activity-log.mjs";
import fs from "node:fs";
import { refuseTrackedProviders } from "../flow/provider-health.mjs";
import { crewSnapshot, machineFile } from "./crews.mjs";
import { validateLanes } from "./lanes.mjs";
import path from "node:path";
import { createHash } from "node:crypto";
import { git, withWorkLock } from "../git/git.mjs";
import {
  assertPortableRepositoryConfig,
  assertKnownKeys,
  assertSafeConfig,
} from "../settings/layered-config.mjs";
import { flowPolicy, syncSpans } from "../flow/flow.mjs";
import {
  blockedNaming,
  judgeBaseFailures,
  watchLine,
} from "../flow/flow-line.mjs";
import { retroStep } from "../flow/flow-retro.mjs";
import {
  ciRepositories,
  ciStep,
  readEffectiveCIConfig,
} from "../flow/flow-ci.mjs";
import { queueCheckRuns } from "../delivery/check-runs.mjs";
import {
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
} from "../delivery/delivery.mjs";
import { fail } from "../store/store.mjs";
import {
  FINAL_STATUSES,
  listSessionBindings,
  listSessionRequests,
  recordSessionStatus,
  sessionRequestHold,
} from "../sessions/session-bindings.mjs";
import { workspaceRepositories } from "../workspace/workspace-repositories.mjs";
import { queueNotifications, sessionUrl } from "./notifications.mjs";
import {
  readGitHubPolicy,
  readGitHubPolicyOrNull,
} from "../github/github-policy.mjs";
import { planningIdentity } from "../github/github-marker.mjs";
import { respondStep } from "../github/github-respond.mjs";
import { refreshOpenItems } from "../github/github-open-read.mjs";
import { reviewDispatches } from "../reviews/pr-review.mjs";
import { investigationStep } from "../delivery/investigate.mjs";
import { revertCorrections } from "../flow/corrections.mjs";
import { evidenceCommentStep } from "../tasks/evidence.mjs";
import { triageStep } from "../intake/triage.mjs";
import {
  RATE_LIMIT_TEXT,
  githubGate,
  markGithubRun,
  rateLimitNotices,
  withSource,
} from "../github/github-rate.mjs";
import { taskSummaryDispatches } from "../tasks/task-summary.mjs";
import { decideStep } from "../plugins/check-decide.mjs";
import { queuePhaseChecks } from "../plugins/check-stages.mjs";
import { summaryLine } from "../tasks/title-repeat.mjs";
import {
  validateRoles,
  validatePlanReview,
  withChatModels,
} from "../settings/chat-models.mjs";
import { syncStep, syncTargets } from "../epics/integration-sync.mjs";
import { mirrorSyncStep } from "../mirror/mirror-sync.mjs";
import { publishInstanceStep } from "../workspace/instance-publish.mjs";
import { mirrorForwardStep } from "../mirror/mirror-forward.mjs";
import { mirrorForwardRunStep } from "../mirror/mirror-forward-run.mjs";
import { RepoFiles } from "../git/repo-files.mjs";
import { mirrorForwardAuditStep } from "../mirror/forward-audit.mjs";
import { publicBranchesOf } from "../mirror/forward-epics.mjs";
import {
  mirrorBatchStep,
  publicBranchStep,
} from "../mirror/mirror-forward-batch.mjs";
import { mirrorPublicPollStep } from "../mirror/mirror-forward-poll.mjs";
import { headStep } from "../epics/integration-head.mjs";
import { recordHealth } from "../plugins/plugin-session.mjs";
import { repositoryPlugins, triageBlock } from "../plugins/plugins.mjs";
import {
  pollSources,
  purgeClosed,
  sourceMap,
  validateIntake,
} from "../intake/intake.mjs";
import {
  findPlanningLeak,
  settleUnavailable,
  validateContentRules,
} from "../content/content-rules.mjs";
import { driverStep, recheckDrivers } from "../workers/driver.mjs";
import {
  driverGuard,
  driverHeldTaskIds,
  readOnlyPlanIds,
} from "../workers/driver-scope.mjs";
import { revalidateSpecs, scheduleHolds } from "../specs/spec-scheduler.mjs";
import { landPullRequests } from "../landing/pr-landing.mjs";
import { landDirect } from "../landing/direct-landing.mjs";
import {
  applyLandingModes,
  landingSettings,
} from "../landing/landing-config.mjs";

// Each repository's `conflicts.maxAttempts`, older keys folded in (R87.6).
const attemptsFor = (config) => (repository) =>
  landingSettings(config || {}, repository.github, repository).maxAttempts;
import { noteTickRun } from "./tick-activity.mjs";
import { withJob } from "../github/github-jobs.mjs";

// The colon keeps this lock out of every configured repository's namespace.
// GitHub projection takes it too, so one workspace has one writer at a time.
export const WORKSPACE_LOCK = {
  id: "avoozl:workspace-tick",
  repositoryId: "avoozl:workspace",
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
  assertKnownKeys(value, ".avoozl.json");
  assertPortableRepositoryConfig(value, ".avoozl.json");
  deliveryPolicy(value);
  flowPolicy(value);
  repositoryPlugins(value);
  refuseTrackedProviders(value);
  validateContentRules(value.contentRules);
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
      : run.outcome === "locked" || run.outcome === "held" || run.held
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
    summaryLine(task),
    task.acceptance?.length
      ? `Acceptance: ${[].concat(task.acceptance).join("; ")}`
      : null,
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

// The specs of these task IDs.
function plansOf(store, taskIds) {
  const wanted = new Set(taskIds),
    plans = new Set();
  for (const task of store.read().tasks)
    if (wanted.has(task.id) && task.planId) plans.add(task.planId);
  return plans;
}

// Runs a step with its GitHub calls counted under `source`, as the GitHub
// job `job` (plugin-credentials §D6). The tick holds no grant, so a
// high-risk job fails here as person-only (PC8.4).
const under =
  (source, job, step) =>
  (...args) =>
    withSource(source, () => withJob(job, () => step(...args), []));

async function runTick(
  store,
  {
    workspaceRoot,
    memory,
    sessions,
    cron = false,
    github: client,
    plugins,
    folders = null,
  },
) {
  const at = new Date().toISOString();
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
      notify.push(
        ...(
          await under("tick", "spec-issues", driverStep)(store, live, {
            script,
          })
        ).notify,
      );
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
      // Each repository's `landing.mode` onto its checkouts' repository rows,
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
          const integrated = await integrateVerified(store, {
            policy: delivery,
            skip: new Set(
              store
                .read()
                .tasks.filter(
                  (t) =>
                    t.planId && (readOnly.has(t.planId) || lost.has(t.planId)),
                )
                .map((t) => t.id),
            ),
          });
          planned.notify.push(...integrated.notify);
          // A conflict at integration goes back to the worker chat.
          planned.messages.push(...(integrated.messages ?? []));
          // `pr` repositories land through pull requests (task 42.6).
          const landed = await under(
            "tick",
            "land",
            landPullRequests,
          )(store, {
            github,
            workspaceRoot,
            rounds: attemptsFor(memory.value),
          });
          planned.notify.push(...landed.notify);
          planned.messages.push(...landed.messages);
          // `direct` repositories push to their remote from the tick (41.9).
          const pushed = await under(
            "tick",
            "land",
            landDirect,
          )(store, {
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
              await under("forward", "check-in", mirrorForwardStep)(
                store,
                github,
                {
                  policy,
                  publicBranches,
                },
              )
            ).errors,
            ...(await mirrorBatchStep(store, github, { policy })).errors,
            ...(
              await under("forward", "check-in", mirrorForwardRunStep)(
                store,
                github,
                {
                  policy,
                  files: new RepoFiles({
                    github,
                    root: workspaceRoot
                      ? path.join(
                          workspaceRoot,
                          ".avoozl",
                          "local",
                          "git-cache",
                        )
                      : null,
                  }),
                },
              )
            ).errors,
            ...(
              await under("forward", "check-in", mirrorPublicPollStep)(
                store,
                github,
                {
                  policy,
                },
              )
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
              step = await under("tick", "integration", syncStep)(
                store,
                github,
                mine,
                {
                  policy,
                  problems: found.problems,
                },
              );
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
            for (const text of (
              await under("tick", "integration", headStep)(
                store,
                github,
                mine,
                {
                  policy,
                },
              )
            ).errors)
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
      // The open items read (github-open-read.mjs): one read-only search per
      // repository per interval, for spec pull requests and closed inputs.
      if (script && github)
        try {
          await under("tick", "check-in", refreshOpenItems)(
            store,
            github,
            readGitHubPolicyOrNull(workspaceRoot),
          );
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not read open GitHub items",
            text: error.message,
          });
        }
      // The triage agent (triage-agent §D2): read what changed, queue one
      // run per new item, and carry out finished runs' writes.
      let triage = { dispatch: [], notify: [] };
      if (script && github)
        try {
          triage = await under("triage", "triage", triageStep)(store, github, {
            policy: readGitHubPolicyOrNull(workspaceRoot),
            config: memory.value || {},
            workspaceRoot,
            block: triageBlock(plugins?.options),
          });
          planned.notify.push(...triage.notify);
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not run the triage agent",
            text: error.message,
          });
        }
      // The evidence comment on each open pull request (§4.22, R76.4).
      if (script && github && delivery)
        try {
          const policy = readGitHubPolicy(workspaceRoot);
          planned.notify.push(
            ...(
              await under("tick", "evidence", evidenceCommentStep)(
                store,
                github,
                {
                  leak: (text) =>
                    policy.mode === "plans-repo" &&
                    findPlanningLeak(
                      [["evidence", text]],
                      policy.planningRepository,
                    ),
                },
              )
            ).notify,
          );
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not update evidence comments",
            text: error.message,
          });
        }
      // CI per pull request for the retro (§4.30).
      if (script)
        try {
          const step = await under("tick", "ci-receipts", ciStep)(
            store,
            github,
            {
              policy: readGitHubPolicyOrNull(workspaceRoot),
              config: ciConfig,
            },
          );
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
      // Discussions answering (R27.13): one responder per discussion
      // snapshot. Cleanup runs even while new dispatch is held.
      let responders = [];
      if (script && github)
        try {
          responders = (
            await under("tick", "respond", respondStep)(
              store,
              github,
              workspaceRoot,
              {
                open: !unobserved.length,
                config: memory.value || {},
              },
            )
          ).dispatch;
        } catch (error) {
          planned.notify.push({
            channel: "failure",
            title: "Avoozl could not run the respond step",
            text: error.message,
          });
        }
      // No new work for a spec driven elsewhere or being handed off, and
      // none for an away task (R66.6, R66.10, R66.11).
      // A task offered to worker machines runs there, not here (WP5).
      const held = new Set([
          ...driverHeldTaskIds(store),
          ...offeredTaskIds(store),
        ]),
        readOnly = readOnlyPlanIds(store);
      const requested = unobserved.length
          ? []
          : planDispatches(store, bindings).filter((d) => !held.has(d.task)),
        readySkip = new Set([...requested.map((d) => d.task), ...held]),
        // Ranking, release and repository-wide path holds (spec-scheduler.mjs).
        schedule =
          unobserved.length || !delivery || delivery.crewModeHeld
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
      if (script && delivery) {
        queueCheckRuns(
          store,
          planCheckRuns(store, delivery).filter(
            (run) => !readOnly.has(run.task.planId),
          ),
        );
        // A landed phase's plugin checks (plugin-checks D7), queued the
        // same way; they hold no task.
        queuePhaseChecks(store);
      }
      // Timing (§4.11): queued, attempt starts, verifier and review
      // sessions, and merge. Always on; writes only what changed.
      syncSpans(store);
      // Retrospectives (§4.11): one at a time, on the cron only.
      const home = store.list("repositories").find((p) => p.root),
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
                ...taskSummaryDispatches(store, { config: roleConfig }),
                // Plugin checks' decide calls (plugin-checks D5).
                ...decideStep(store, { config: roleConfig }).dispatch,
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
        ...retro.dispatch,
        ...reviews.filter((d) => !heldTask(d.task)),
        ...triage.dispatch,
      ];
      // Settings › Models: the planner and retro chats open on
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
            .map((d) => taskPlan.get(d.task))
            .filter(Boolean),
        }),
        generationHeld = (d) =>
          d.role === "worker" &&
          (generations.tasks.has(d.task) ||
            generations.plans.has(taskPlan.get(d.task)));
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
      };
    });
    recordRun(store, {
      at,
      outcome: "ok",
      policy: result.policy.status,
      ...observerOf(store, script, roster),
      ...(result.policy.error ? { error: result.policy.error } : {}),
      ...(result.held ? { held: result.held } : {}),
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

// Every other GitHub read of the tick runs as check-in.
export const tick = (store, options) =>
  withSource("tick", () =>
    withJob(
      "check-in",
      () => withGitHubReadSnapshots(() => runTick(store, options)),
      [],
    ),
  );
