import { withGitHubReadSnapshots } from "../github/github-read-snapshot.ts";
import {
  enqueueSessionRequests,
  pendingSessionRequests,
} from "../sessions/session-requests.ts";
import {
  persistKirocrewConfiguration,
  kirocrewExplicitSession,
} from "../executors/kirocrew.ts";
import { kirocrewRequest } from "../executors/kirocrew.ts";
import { kirocrewSession, kirocrewDispatches } from "../executors/kirocrew.ts";
// workspace.tick: the one bounded, idempotent step a Kiro Crew script cron runs
// every minute. It returns intents for the script to carry out; it never opens
// sessions or sends messages itself. It takes the lock, loads policy, records
// the session statuses the script read, reconciles worker and verifier
// outcomes, integrates verified commits, completes parents from their
// children, and plans dispatches: one per open session request, ready local
// leaves when `.avoozl.json` turns delivery on, and one verifier per worker
// done report. On the cron it also reads and writes GitHub: completion,
// broad-issue publishing, re-projection and the Project board.
import { recordActivity, recordTickActivity } from "../store/activity-log.ts";
import fs from "node:fs";
import { crewSnapshot, machineFile } from "./crews.ts";
import { validateLanes } from "./lanes.ts";
import { observeLanes } from "../sessions/lane-sessions.ts";
import path from "node:path";
import { createHash } from "node:crypto";
import { git, type Repository, withWorkLock } from "../git/git.ts";
import {
  assertPortableRepositoryConfig,
  assertKnownKeys,
  assertSafeConfig,
} from "../settings/layered-config.ts";
import { flowPolicy, syncSpans } from "../flow/flow.ts";
import {
  blockedNaming,
  judgeBaseFailures,
  watchLine,
} from "../flow/flow-line.ts";
import { queueCheckRuns } from "../delivery/check-runs.ts";
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
  planReviewDispatches,
  reconcileDeliveries,
  reconcileVerifications,
  summaryLine,
} from "../delivery/delivery.ts";
import { fail, type Store } from "../store/store.ts";
import type { SessionRequest } from "../sessions/session-requests.ts";
import type { SessionBinding } from "../sessions/session-bindings.ts";
import type { Task } from "../../types.ts";
import type { GitHubClient } from "../github/github.ts";
import type { Message as WorkerMessage } from "../landing/pr-landing.ts";
import type { Notice } from "./notifications.ts";
import {
  FINAL_STATUSES,
  listSessionBindings,
  listSessionRequests,
  recordSessionStatus,
  sessionRequestHold,
} from "../sessions/session-bindings.ts";
import { workspaceRepositories } from "../workspace/workspace-repositories.ts";
import { queueNotifications, sessionUrl } from "./notifications.ts";
import {
  readGitHubPolicy,
  readGitHubPolicyOrNull,
} from "../github/github-policy.ts";
import { planningIdentity } from "../github/github-marker.ts";
import { respondStep } from "../github/github-respond.ts";
import { refreshOpenItems } from "../github/github-open-read.ts";
import { claimsDue, refreshClaims } from "../workers/claims.ts";
import { claimDispatches } from "../workers/runner.ts";
import { readLabelFilters } from "../specs/label-filters.ts";
import { readSpecAssignees } from "../specs/spec-assignee.ts";
import { readLabeledIssues } from "../specs/labeled-issues.ts";
import { postReviewOutput } from "../delivery/review-output.ts";
import {
  RATE_LIMIT_TEXT,
  githubGate,
  markGithubRun,
  rateLimitNotices,
  withSource,
} from "../github/github-rate.ts";
import { decideStep } from "../plugins/check-decide.ts";
import { queuePhaseChecks } from "../plugins/check-stages.ts";
import { validateRoles } from "../agents/role-table.ts";
import { syncStep, syncTargets } from "../epics/integration-sync.ts";
import { headStep } from "../epics/integration-head.ts";
import { repositoryPlugins } from "../plugins/plugins.ts";
import { purgeClosed, validateIntake } from "../intake/intake.ts";
import {
  findPlanningLeak,
  settleUnavailable,
  validateContentRules,
} from "../content/content-rules.ts";
import { scheduleHolds } from "../specs/spec-scheduler.ts";
import { landPullRequests } from "../landing/pr-landing.ts";
import { landDirect } from "../landing/direct-landing.ts";
import { retryLanded } from "../landing/landed-work.ts";
import { loopAllows, loopDue, machineLoop } from "./loop.ts";
import { storedLinks } from "../specs/order.ts";
import { specChain } from "../specs/integration-base.ts";
import {
  applyLandingModes,
  applyRunnerSettings,
  landingSettings,
} from "../landing/landing-config.ts";

// A parsed .avoozl.json.
type Config = Record<string, unknown>;
// What the tick keeps between runs in this process: the last valid policy.
export interface PolicyMemory {
  value?: Config | null;
  valid?: { hash: string; commit: string | null } | null;
  reportedInvalid?: string | null;
}
// A message for a bound session, and the executor that carries it.
type Message = WorkerMessage & { executor?: string };
// One row of the script's session roster.
interface RosterRow {
  target: string;
  status: string;
  served_model?: string | null;
  model_requested?: string | null;
  model_withheld?: boolean;
  model_changed?: boolean;
}
// One tick's receipt, as tick-health.json and tick-log.jsonl keep it.
interface Run {
  at?: string;
  outcome?: string;
  policy?: string;
  observer?: string;
  error?: string;
  held?: { reason: string; slots?: string[] };
}
// What one tick is given: its workspace, the policy memory, the script's
// roster and folders, the GitHub client, and the epic context brief.
interface TickOptions {
  workspaceRoot?: string | null;
  memory: PolicyMemory;
  sessions?: unknown;
  cron?: boolean;
  github?: GitHubClient | null;
  plugins?: unknown;
  folders?: unknown;
  // `contextBrief(entry)`: the epic context section for a Kiro Crew
  // worker's brief, or "" (epic-context EC8).
  contextBrief?:
    | ((entry: {
        task: string;
        role: string;
        attempt?: number;
      }) => Promise<string>)
    | null;
}
// One own field of a value, or undefined.
const fieldOf = (value: unknown, key: string): unknown =>
  value && typeof value === "object"
    ? Object.entries(value).find(([name]) => name === key)?.[1]
    : undefined;
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const codeOf = (error: unknown) =>
  error && typeof error === "object" && "code" in error ? error.code : null;

// Each repository's `conflicts.maxAttempts`, older keys folded in (R87.6).
const attemptsFor =
  (config: Config | null | undefined) =>
  (repository: Pick<Repository, "github" | "landing">) =>
    landingSettings(config || {}, repository.github ?? "", repository)
      .maxAttempts;
import { noteTickRun } from "./tick-activity.ts";
import { withJob } from "../github/github-jobs.ts";

// The colon keeps this lock out of every configured repository's namespace.
// GitHub projection takes it too, so one workspace has one writer at a time.
export const WORKSPACE_LOCK = {
  id: "avoozl:workspace-tick",
  repositoryId: "avoozl:workspace",
  kind: "tick",
};
const MAX_POLICY_BYTES = 512 * 1024;

function parsePolicy(text: string): Config {
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
  validateContentRules(value.contentRules);
  validateRoles(value);
  validateIntake(value.intake);
  return value;
}

// The stable workspace name a lane's header and folder carry.
// Registered workspaces often live in folders literally named `workspace`, so
// the root basename cannot distinguish their Kiro Crew session folders.
export const laneWorkspace = (
  workspaceRoot: string | null | undefined,
  workspaceId?: unknown,
) =>
  typeof workspaceId === "string" && workspaceId
    ? workspaceId
    : workspaceRoot
      ? path.basename(path.resolve(workspaceRoot))
      : null;

// This machine's lanes (R6.3): lanes.local or, with `key`,
// lanes.reviewers in the machine file, or undefined when it sets none or
// cannot be read (loading the config reports a bad file).
export function machineLanes(
  file?: string,
  key: "local" | "reviewers" = "local",
) {
  try {
    const lanes = machineFile(file).value.lanes;
    return fieldOf(lanes, key) === undefined
      ? undefined
      : validateLanes(lanes)[key];
  } catch {
    return undefined;
  }
}
const machinePolicyLanes = () => ({
  machineLanes: machineLanes(),
  machineReviewers: machineLanes(undefined, "reviewers"),
});

// The delivery settings in .avoozl.json for a read that must not touch the
// tick's memory: {status: absent|loaded|invalid|unavailable, delivery}.
export function readDeliveryPolicy(workspaceRoot: string | null | undefined) {
  if (!workspaceRoot) return { status: "unavailable", delivery: null };
  let text: string;
  try {
    text = fs.readFileSync(path.join(workspaceRoot, ".avoozl.json"), "utf8");
  } catch (error) {
    if (codeOf(error) !== "ENOENT") throw error;
    return { status: "absent", delivery: null };
  }
  try {
    return {
      status: "loaded",
      delivery: deliveryPolicy(parsePolicy(text), machinePolicyLanes()),
    };
  } catch (error) {
    return { status: "invalid", delivery: null, error: messageOf(error) };
  }
}

async function checkedOutCommit(root: string) {
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
// The policy a tick loaded: its state, file hash and commit.
interface LoadedPolicy {
  status: string;
  hash?: string;
  commit?: string | null;
  error?: string;
  using?: string | null;
}
async function loadPolicy(
  workspaceRoot: string | null | undefined,
  memory: PolicyMemory,
): Promise<{ policy: LoadedPolicy; notify: Notice[] }> {
  if (!workspaceRoot) return { policy: { status: "unavailable" }, notify: [] };
  const filename = path.join(workspaceRoot, ".avoozl.json");
  let text: string;
  try {
    text = fs.readFileSync(filename, "utf8");
  } catch (error) {
    if (codeOf(error) !== "ENOENT") throw error;
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
              text: `.avoozl.json is invalid: ${messageOf(error)}`,
              resume: "Fix .avoozl.json; the next tick loads it.",
            },
          ];
    memory.reportedInvalid = hash;
    return {
      policy: {
        status: "invalid",
        hash,
        commit,
        error: messageOf(error),
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
export function tickHealthPath(store: Pick<Store, "filename">) {
  return store.filename && store.filename !== ":memory:"
    ? path.join(path.dirname(path.resolve(store.filename)), "tick-health.json")
    : null;
}

// Statuses the script read land before any planning (the tick's first step)
// and when the cron's call records its observations (cron-intents.mjs).
export function recordRoster(store: Store, roster: RosterRow[]) {
  const bound = new Set(listSessionBindings(store).map((b) => b.slot));
  for (const row of roster)
    if (bound.has(row.target))
      recordSessionStatus(
        store,
        { slot: row.target, status: row.status },
        { served: servedOf(row) },
      );
}

// The requests the last cron tick released, beside the health receipt: the
// cron's call carries out these and no others (MS12.1).
const releasedPath = (store: Pick<Store, "filename">) => {
  const health = tickHealthPath(store);
  return health ? path.join(path.dirname(health), "tick-released.json") : null;
};

export function recordReleased(
  store: Pick<Store, "filename">,
  { dispatch = [], messages = [] }: Pick<TickResult, "dispatch" | "messages">,
) {
  const file = releasedPath(store);
  if (!file) return;
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporary,
    JSON.stringify({
      starts: dispatch.map((request) => request.id),
      sends: messages.map((request) => fieldOf(request, "id")),
    }) + "\n",
    { mode: 0o600 },
  );
  fs.renameSync(temporary, file);
}

export function readReleased(store: Pick<Store, "filename">) {
  const file = releasedPath(store);
  try {
    if (!file) throw Error("No released file.");
    // The file recordReleased wrote.
    const found: { starts?: string[]; sends?: string[] } = JSON.parse(
      fs.readFileSync(file, "utf8"),
    );
    return { starts: new Set(found.starts), sends: new Set(found.sends) };
  } catch {
    return { starts: new Set<string>(), sends: new Set<string>() };
  }
}

function recordRun(store: Store, run: Run) {
  const filename = tickHealthPath(store);
  let previousAt: string | null = null;
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

const tickLogPath = (healthFile: string) =>
  path.join(path.dirname(healthFile), "tick-log.jsonl");

function appendTickLog(healthFile: string, run: Run) {
  const filename = tickLogPath(healthFile),
    temporary = `${filename}.${process.pid}.tmp`;
  try {
    let lines: string[] = [];
    try {
      lines = fs.readFileSync(filename, "utf8").split("\n").filter(Boolean);
    } catch (error) {
      if (codeOf(error) !== "ENOENT") throw error;
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
export function tickLogEntry(run: Run) {
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
export function tickLog(
  store: Pick<Store, "filename">,
  { limit = 20 }: { limit?: unknown } = {},
) {
  const health = tickHealthPath(store),
    max = Math.max(1, Math.min(Number(limit) || 20, TICK_LOG_KEEP));
  if (!health) return { items: [] };
  let lines: string[] = [];
  try {
    lines = fs
      .readFileSync(tickLogPath(health), "utf8")
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    if (codeOf(error) !== "ENOENT") throw error;
  }
  const items: ReturnType<typeof tickLogEntry>[] = [];
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
function observerOf(store: Store, script: boolean, roster: unknown) {
  if (script) return { observer: roster ? "roster" : "app" };
  const previous = tickHealth(store).lastRun?.observer;
  return previous ? { observer: previous } : {};
}

// Last run, lock holder, and last error, for the Workspace view. Reads only.
export function tickHealth(store: Pick<Store, "filename" | "db">) {
  const filename = tickHealthPath(store);
  let lastRun: Run | null = null;
  try {
    if (filename) lastRun = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    if (codeOf(error) !== "ENOENT") lastRun = { outcome: "unreadable" };
  }
  // A work_locks row, as withWorkLock writes it.
  const row = store.db
    .prepare("SELECT pid FROM work_locks WHERE id=?")
    .get(WORKSPACE_LOCK.id) as { pid: number } | undefined;
  let lock = null;
  if (row) {
    let live = true;
    try {
      process.kill(row.pid, 0);
    } catch (error) {
      live = codeOf(error) !== "ESRCH";
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
// A stored session request intent, as planDispatches reads it.
type Intent = {
  id: string;
  taskId?: string;
  role?: string;
  repository?: string;
  executor: string;
  model?: string;
  permissionClass?: string;
};
function planDispatches(store: Store, bindings: SessionBinding[]) {
  // The session_requests rows and intents, as the table holds them.
  const requests = listSessionRequests(store) as Intent[];
  if (!requests.length) return [];
  const data = store.read(),
    repositories = new Map(
      workspaceRepositories(store).map((entry) => [entry.id, entry]),
    );
  const dispatch: SessionRequest[] = [];
  for (const request of requests) {
    if (
      bindings.some(
        (b) => b.taskId === request.taskId && b.role === request.role,
      )
    )
      continue;
    const task = data.tasks.find((t) => t.id === request.taskId),
      repository = repositories.get(request.repository ?? "");
    if (
      !task ||
      !repository?.localCheckout ||
      sessionRequestHold(data, task.id, request.role ?? "")
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

function brief(
  task: Task,
  repository: {
    id: string;
    localCheckout?: string | null;
    baseBranch?: string | null;
  },
) {
  const given = task.acceptance,
    acceptance = Array.isArray(given)
      ? given
      : typeof given === "string" && given
        ? [given]
        : [];
  return [
    `Avoozl task ${task.id}: ${task.title || task.id}`,
    "",
    `Repository: ${repository.id}, checkout ${repository.localCheckout}, base branch ${repository.baseBranch || "main"}.`,
    "Before changing anything, confirm `git rev-parse --show-toplevel` is that checkout.",
    summaryLine(task),
    acceptance.length ? `Acceptance: ${acceptance.join("; ")}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

// The script's one read of the sessions its cron opened: [{target, status}],
// plus, from a Kiro Crew that reports them, model_requested, served_model,
// model_withheld and model_changed.
const NAME = (value: unknown) =>
  value === null || (typeof value === "string" && value.length <= 128);
export function sessionList(value: unknown): RosterRow[] | null {
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
function servedOf(row: RosterRow) {
  if (!("served_model" in row)) return undefined;
  return {
    requested: row.model_requested ?? null,
    model: row.served_model,
    withheld: row.model_withheld === true,
    changed: row.model_changed === true,
  };
}

// Runs a step with its GitHub calls counted under `source`, as the GitHub
// job `job` (plugin-credentials §D6). The tick holds no grant, so a
// high-risk job fails here as person-only (PC8.4).
const under =
  <A extends unknown[], R>(
    source: string,
    job: string,
    step: (...args: A) => Promise<R>,
  ) =>
  (...args: A) =>
    withSource(source, () => withJob(job, () => step(...args), []));

async function runTick(
  store: Store,
  {
    workspaceRoot,
    memory,
    sessions,
    cron = false,
    github: client,
    folders = null,
    contextBrief = null,
  }: TickOptions,
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
    gate = client && script ? githubGate(store) : { skip: false, low: null },
    live = gate.skip ? null : client,
    github = live;
  if (gate.low) markGithubRun(store);
  try {
    const result = await withWorkLock(store, WORKSPACE_LOCK, async () => {
      const { policy, notify } = await loadPolicy(workspaceRoot, memory);
      // A content rule set that is available again settles its decision.
      settleUnavailable(store);
      // Observe first: statuses the script read land before any planning.
      if (roster) recordRoster(store, roster);
      // This machine's server loop: with none, or between
      // passes, the tick starts and lands nothing. `outOfLoop` holds the
      // tasks of every kind the loop does not run.
      const loop = machineLoop(),
        looping = loop !== null && loopDue(store, loop),
        links = storedLinks(store),
        outOfLoop = new Set(
          store
            .read()
            .tasks.filter(
              (task) =>
                !looping ||
                !loopAllows(loop, task, (spec) => specChain(spec, links)),
            )
            .map((task) => task.id),
        );
      // An invalid file keeps the last valid policy's delivery settings.
      const bindings = listSessionBindings(store),
        laneWorkspaceId = laneWorkspace(
          workspaceRoot,
          store.getMeta("workspaceId"),
        ),
        delivery = ["loaded", "invalid"].includes(policy.status)
          ? deliveryPolicy(memory.value, machinePolicyLanes())
          : null;
      // Each repository's `landing.mode` onto its checkouts' repository rows,
      // which the landing code reads (§4.25).
      if (memory.value) {
        applyLandingModes(store, memory.value);
        applyRunnerSettings(store, memory.value);
      }
      const planned: { messages: Message[]; notify: Notice[] } = {
        messages: [],
        notify: [],
      };
      // A lane whose session a person closed pauses until Resume.
      if (delivery && workspaceRoot && laneWorkspaceId)
        for (const lane of observeLanes(store, delivery, laneWorkspaceId))
          planned.notify.push({
            channel: "decision",
            title: `Avoozl paused lane ${lane.id}`,
            text: `${lane.header} was closed, so the lane takes no task.`,
            resume: `Press Resume on the lane's row in Needs you, or run avoozl lane resume ${lane.id}.`,
          });
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
          const integrated = await integrateVerified(store, {
            skip: outOfLoop,
          });
          planned.notify.push(...integrated.notify);
          // A conflict at integration goes back to the worker chat.
          planned.messages.push(...(integrated.messages ?? []));
          // `pr` repositories land through pull requests (task 42.6), only
          // while the loop runs.
          const landed = !looping
            ? { notify: [], messages: [] }
            : await under(
                "tick",
                "land",
                landPullRequests,
              )(store, {
                github,
                workspaceRoot,
                rounds: attemptsFor(memory.value),
                config: memory.value,
              });
          planned.notify.push(...landed.notify);
          planned.messages.push(...landed.messages);
          // `direct` repositories push to their remote from the tick (41.9).
          const pushed = !looping
            ? { notify: [], messages: [] }
            : await under(
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
          // Landed work whose tick or claim branch delete did not go
          // through is finished again (rule 16.5).
          if (github)
            await under("tick", "land", retryLanded)(store, github, {
              workspaceRoot,
            });
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
        // Dependents are released by readiness below, in this same tick.
        completeParents(store);
      }
      // Main into each epic's integration branch (RC16.6): one merge commit
      // per schedule, from the machine that holds the repository.
      if (script && github)
        try {
          const policy = readGitHubPolicyOrNull(workspaceRoot),
            machine = store.getMeta<{ id?: string }>("machineIdentity")?.id,
            found = policy?.mode ? syncTargets(store, policy) : null;
          if (found) {
            const mine = found.targets.filter(
                (target) =>
                  machine &&
                  store.get<{ activeMachine?: string }>(
                    "github_repositories",
                    target.repository,
                  )?.activeMachine === machine,
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
            text: messageOf(error),
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
            text: messageOf(error),
          });
        }
      // The claim branches and their head times, for stale claims in Needs
      // you. Reads only: Avoozl deletes no claim branch here.
      if (script && github && (looping || claimsDue(store)))
        for (const failed of await under(
          "tick",
          "check-in",
          refreshClaims,
        )(store, github))
          planned.notify.push({
            channel: "failure",
            title: `Avoozl could not read the claim branches of ${failed.repository}`,
            text: failed.error,
          });
      // The label filters and assignees (workflow v1 rule
      // 8.3) of the spec issues, once per pass.
      if (script && github)
        for (const failed of [
          ...(await under("tick", "check-in", readLabelFilters)(store, github)),
          ...(await under(
            "tick",
            "check-in",
            readSpecAssignees,
          )(store, github)),
          ...(await under(
            "tick",
            "check-in",
            readLabeledIssues,
          )(store, github)),
        ])
          planned.notify.push({
            channel: "failure",
            title: `Avoozl could not read the spec issues in ${failed.repository}`,
            text: failed.error,
          });
      // Review rounds and failing checks as comments (workflow v1 rule 19).
      if (script && github)
        for (const failed of await under(
          "tick",
          "review-output",
          postReviewOutput,
        )(store, github))
          planned.notify.push({
            channel: "failure",
            title: `Avoozl could not post review output in ${failed.repository}`,
            text: failed.error,
          });
      // Closed intake items no task holds go after 30 days.
      if (script) purgeClosed(store);
      // After a restart, and on every tick, nothing new is dispatched until
      // every live session this cron opened has been observed in the roster.
      // Without a roster (a stock Kiro Crew), a session counts as observed
      // once the app backend has recorded any status for it; a stale reading
      // only keeps its task claimed, so it never causes a second dispatch.
      const listed = new Set((roster || []).map((row) => row.target)),
        observed = (b: SessionBinding) =>
          roster || !script ? listed.has(b.slot) : Boolean(b.status),
        // A session on a crew that stopped answering stays bound and is not
        // waited on (R41.10); when the crew answers again its roster lists
        // it, so it is observed before anything new opens.
        instances = crewSnapshot(store)?.instances,
        unreachable = new Set(
          (Array.isArray(instances) ? instances : [])
            .filter((i) => fieldOf(i, "reachable") === false)
            .map((i) => fieldOf(i, "id")),
        ),
        unobserved = bindings
          // Historical relay bindings live on another crew; leave them alone.
          .filter((b) => b.source === "tick" && !b.relay && liveAttempt(b))
          .filter((b) => !(b.crew && unreachable.has(b.crew)))
          .filter((b) => !observed(b))
          .map((b) => b.slot);
      // Discussions answering (R27.13): one responder per discussion
      // snapshot. Cleanup runs even while new dispatch is held.
      let responders: SessionRequest[] = [];
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
            text: messageOf(error),
          });
        }
      const requested = unobserved.length
          ? []
          : planDispatches(store, bindings),
        readySkip = new Set(requested.flatMap((d) => (d.task ? [d.task] : []))),
        // Ranking, release and repository-wide path holds (spec-scheduler.mjs).
        schedule =
          unobserved.length || !delivery || delivery.crewModeHeld
            ? null
            : scheduleHolds(store, {
                github: readGitHubPolicyOrNull(workspaceRoot),
                skip: readySkip,
              }),
        plannedReady =
          !schedule || !delivery
            ? []
            : planReadyDispatches(store, delivery, {
                workspace: laneWorkspaceId,
                skip: new Set([...readySkip, ...schedule.skip, ...outOfLoop]),
                // Settings › Models' worker harness (R98.3, R98.6).
                config: memory.value || {},
                github: readGitHubPolicyOrNull(workspaceRoot),
              }),
        verify =
          unobserved.length || !delivery
            ? []
            : planReviewDispatches(store, delivery, {
                workspace: laneWorkspaceId,
                config: memory.value || {},
              });
      // The loop pass claims each start on origin first.
      const claimed =
          script && github && looping && plannedReady.length
            ? await under("tick", "worker-grants", claimDispatches)(
                store,
                github,
                plannedReady,
                { linked: links },
              )
            : { dispatches: plannedReady, errors: [] },
        ready = claimed.dispatches;
      for (const failed of claimed.errors)
        planned.notify.push({
          channel: "failure",
          title: `Avoozl could not claim a task in ${failed.repository}`,
          text: failed.error,
        });
      // Command-only bars are checked by Avoozl itself, off this path: the
      // cron queues each run here and the app backend runs the queue
      // (check-runs.mjs).
      if (script && delivery) {
        queueCheckRuns(store, planCheckRuns(store, delivery));
        // A landed phase's plugin checks (plugin-checks D7), queued the
        // same way; they hold no task.
        queuePhaseChecks(store);
      }
      // Timing (§4.11): queued, attempt starts, verifier and review
      // sessions, and merge. Always on; writes only what changed.
      syncSpans(store);
      // Plugin checks' decide calls (plugin-checks D5), cron only.
      const roleConfig = memory.value || {},
        reviews =
          script && !unobserved.length
            ? decideStep(store, { config: roleConfig }).dispatch
            : [];
      let dispatch = [
        ...requested,
        ...ready,
        ...verify,
        ...responders,
        ...reviews,
      ];
      if (contextBrief)
        dispatch = await Promise.all(
          dispatch.map(async (d) => {
            const section =
              d.role === "worker" && d.executor === "kirocrew" && d.task
                ? await contextBrief({
                    task: d.task,
                    role: d.role,
                    attempt: d.attempt,
                  }).catch(() => "")
                : "";
            return section ? { ...d, brief: `${d.brief}\n\n${section}` } : d;
          }),
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
      const notices: Notice[] = [
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
                      !asksForcePush(request.brief),
                  ),
              sends: pending.filter(
                (request) =>
                  request.operation === "send" && !asksForcePush(request.text),
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
          .filter((b) => !FINAL_STATUSES.has(b.status ?? ""))
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
    if (fieldOf(error, "contention")) {
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
      error: messageOf(error),
      ...observerOf(store, script, roster),
    });
    throw error;
  }
}

// What one tick pass returns: its notices, chat messages and dispatches.
export interface TickResult {
  skipped?: string;
  notify?: (Notice & { link?: string })[];
  messages?: (Message | SessionRequest)[];
  dispatch?: { id: string }[];
  [key: string]: unknown;
}

// Every other GitHub read of the tick runs as check-in.
export const tick = (store: Store, options: TickOptions): Promise<TickResult> =>
  withSource("tick", () =>
    withJob(
      "check-in",
      () => withGitHubReadSnapshots(() => runTick(store, options)),
      [],
    ),
  );
