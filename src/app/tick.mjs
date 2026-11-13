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
import { recordTickActivity } from "./activity-log.mjs";
import fs from "node:fs";
import { validateTrackedRouting } from "./placement.mjs";
import { crewSnapshot } from "./crews.mjs";
import { closeNoFit, fetchAll, openNoFit, routingContext } from "./routing.mjs";
import { expireRouter, openRouter } from "./router.mjs";
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
import {
  claimedTaskIds,
  completeParents,
  deliveryPolicy,
  holdUnprovenReviews,
  integrateVerified,
  liveAttempt,
  planReadyDispatches,
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
import { plannerStep } from "./github-planner.mjs";
import { intakeNotices, syncGitHubIssues } from "./github-sync.mjs";
import { advanceGitHubBreakdowns } from "./github-breakdown.mjs";
import { blockerNotes } from "./github-close.mjs";
import { refreshUntriaged } from "./untriaged.mjs";
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
  taskRoute,
} from "../work-model.mjs";
import { routeResultNotes, routeStep } from "./routes.mjs";
import { heldByTrackers, trackerStep } from "./trackers.mjs";

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
    // Readiness changed by this tick's verdicts reaches GitHub now: the
    // ready label for Issue Radar, `dispatch.ready` for the runner.
    const projection = await refreshProjectedReadiness(store, github, {
      identity: planningIdentity(workspaceRoot),
    });
    const branches = await ensureLinkedBranches(store, github, {
      delivery,
      policy,
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

export async function tick(
  store,
  {
    workspaceRoot,
    memory,
    sessions,
    cron = false,
    github,
    breakdownHooks,
    plugins,
    placement = {},
  },
) {
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
        if (script)
          planned.notify.push(...(await integrateVerified(store)).notify);
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
        // Dependents are released by readiness below, in this same tick.
        completeParents(store);
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
      // Issue Radar's claim and needs-human labels (§6.4).
      const crew =
        script && github ? await crewStep(store, github, workspaceRoot) : null;
      if (crew) planned.notify.push(...crew.notify);
      // The Untriaged list (§8.5): one read-only search per repository per
      // interval, cached for the page.
      if (script && github)
        try {
          const policy = readGitHubPolicyOrNull(workspaceRoot);
          planned.notify.push(
            ...(
              await refreshUntriaged(store, github, policy, store.read().tasks)
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
          .filter((b) => b.source === "tick" && liveAttempt(b))
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
          });
          await fetchAll(store, routing, { fetch: script });
          routing.routerQueue = [];
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
      const requested = unobserved.length
          ? []
          : planDispatches(store, bindings),
        ready =
          unobserved.length || !delivery || delivery.runner !== "tick"
            ? []
            : planReadyDispatches(store, delivery, {
                skip: new Set([
                  ...requested.map((d) => d.task),
                  ...(pluginResult?.held || []),
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
      // One router session for the sessions waiting on a ranking (§4.10).
      const routerHome = store.list("projects").find((p) => p.root);
      const router =
        routing && script && routing.config.router.enabled
          ? openRouter(store, routing, {
              folder: routerHome ? `Avoozl/${routerHome.id}` : null,
              briefAllowed: (input) => briefAllowed(store, input),
            })
          : null;
      if (router) ready.push({ ...router, project: false });
      // No fit (R41.8): one decision per task; it closes when the task fits.
      for (const id of fits) closeNoFit(store, id);
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
        script && !unobserved.length ? reviewDispatches(store) : [];
      const notices = [...notify, ...planned.notify];
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
        dispatch: [
          ...requested,
          ...ready,
          ...verify,
          ...responders,
          ...planners,
          ...retro.dispatch,
          ...reviews,
        ],
        messages: planned.messages,
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
