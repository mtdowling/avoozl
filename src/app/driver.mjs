// One driver per spec (design §6.10, Requirement 66). In a GitHub mode the
// driver is named by the spec's plan issue: its one assignee says which
// person, and the machine claim in Avoozl's marker says which of that
// person's machines. In Local only mode it is a `drivers` row in this
// workspace's SQLite. Every other workspace reads only for the spec
// (driver-scope.mjs answers that from SQLite). Nothing here moves the role
// because something is old: only a person's Take over, Hand off or Force
// take over does, and the only assignee change Avoozl makes is Force take
// over's.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { digest, statusComplete } from "../model.mjs";
import { completionReached, taskKind } from "../work-model.mjs";
import { forgetDriverScope } from "./driver-scope.mjs";
import {
  MACHINE_ID,
  parseMarker,
  planningIdentity,
  renderMarker,
  requireNamespace,
} from "./github-marker.mjs";
import { machineAvoozlPaths } from "./host-config.mjs";
import { check as contentCheck } from "./content-rules.mjs";
import { declaredPlugins, readPluginSettings } from "./plugins.mjs";
import { listSessionBindings } from "./session-bindings.mjs";
import { epicOfPlan } from "./epics.mjs";
import { retroMemory } from "./retro-memory.mjs";
import { fail } from "./store.mjs";

const TABLE = "drivers";
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
const MARKER_BLOCK = /<!--\s*avoozl-task\s*\n[\s\S]*?\n-->/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const FINAL_STATUSES = new Set(["closed", "lost"]);
const FINAL_REPORTS = new Set(["done", "blocked"]);
export const HEARTBEAT_MINUTES = 15;
export const TAKEOVER_WAIT_MS = 10_000;
export const EXPORT_FORMAT = "avoozl-driver-export";

// What a rebuild cannot bring back (§6.10 "Rebuild from GitHub"). Shown
// before a rebuild runs.
export const REBUILD_LOSSES = [
  "Flow timing and stop history, so lead time and time to fix restart",
  "Retros and proposals",
  "Notes and links not shown on GitHub",
  "The spec's local-authority tasks",
  "Answered decisions' local records",
  "Token usage",
  "The activity log",
];

// ---------------------------------------------------------------------------
// This computer: machine ID, label and heartbeat, in machine-local settings.

export function driverSettingsPath(options = {}) {
  return path.join(machineAvoozlPaths(options).configDirectory, "driver.json");
}

function newMachineId() {
  const bytes = randomBytes(10);
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  let text = "";
  for (let i = 15; i >= 0; i -= 1)
    text += BASE32[Number((bits >> BigInt(i * 5)) & 31n)];
  return "mch_" + text;
}

function readSettingsFile(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    fail(`Could not read this computer's driver settings: ${error.message}`);
  }
}

function writeSettingsFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + ".tmp-" + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
}

// {machine, label, heartbeatMinutes}. The machine ID is made once, on first
// use, and never filled from the host name.
export function machineSettings(file) {
  let value = readSettingsFile(file);
  if (!MACHINE_ID.test(value.machine || "")) {
    value = { ...value, machine: newMachineId() };
    writeSettingsFile(file, value);
  }
  const minutes = value.heartbeatMinutes;
  return {
    machine: value.machine,
    label: typeof value.label === "string" && value.label ? value.label : null,
    heartbeatMinutes:
      Number.isInteger(minutes) && minutes >= 5 && minutes <= 60
        ? minutes
        : HEARTBEAT_MINUTES,
    heartbeatSet: Number.isInteger(minutes),
  };
}

// Settings › General › This computer. The label lands in public plan
// issues, so it passes the `github` content-rule boundary first.
export function updateMachineSettings(store, file, input = {}) {
  const current = readSettingsFile(file),
    next = { ...current };
  if ("label" in input) {
    const label = input.label === null ? "" : input.label;
    if (
      typeof label !== "string" ||
      label.length > 40 ||
      /[\u0000-\u001f\u007f/\\]/.test(label)
    )
      fail(
        "Write a machine label of at most 40 characters, with no slash or control character.",
      );
    const trimmed = label.trim();
    if (trimmed) {
      const result = contentCheck(store, {
        boundary: "github",
        target: "driver:label",
        text: trimmed,
      });
      if (result.findings?.length || result.unavailable?.length)
        fail(
          "A content rule blocks that machine label for GitHub. Choose another.",
          422,
        );
      next.label = trimmed;
    } else delete next.label;
  }
  if ("heartbeatMinutes" in input) {
    const minutes = input.heartbeatMinutes;
    if (minutes === null || minutes === "") delete next.heartbeatMinutes;
    else if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60)
      fail("Heartbeat minutes must be a whole number from 5 to 60.");
    else next.heartbeatMinutes = minutes;
  }
  writeSettingsFile(file, next);
  return machineSettings(file);
}

// ---------------------------------------------------------------------------
// The binding: which settings file, clock and wait this store's driver uses.
// Operations binds it; a store with no binding keeps the old one-writer rule
// only (task 3.8), which is how tests that predate §6.10 run.

const bound = new WeakMap();

export function bindDriver(
  store,
  {
    settingsFile,
    workspaceRoot,
    pluginSettingsFile = null,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  bound.set(store, {
    settingsFile,
    workspaceRoot,
    pluginSettingsFile,
    now,
    sleep,
  });
}

export function driverContext(store) {
  const ctx = bound.get(store);
  if (!ctx) return null;
  return {
    ...ctx,
    settings: () => machineSettings(ctx.settingsFile),
    identity: () => planningIdentity(ctx.workspaceRoot),
  };
}

const iso = (ms) => new Date(ms).toISOString();
const same = (a, b) =>
  String(a || "").toLowerCase() === String(b || "").toLowerCase();
const logins = (issue) =>
  (issue?.assignees || [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.login))
    .filter(Boolean);

function approvedPlans(store) {
  return store
    .list("plans")
    .filter(
      (plan) =>
        plan.state === "approved" && !plan.deletedAt && !plan.archivedAt,
    );
}

function requirePlan(store, planId) {
  const plan = typeof planId === "string" ? store.get("plans", planId) : null;
  if (!plan || plan.deletedAt) fail("Spec not found.", 404);
  if (plan.state !== "approved")
    fail("Only an approved spec has a driver.", 409);
  return plan;
}

export const specName = (plan) =>
  typeof plan?.spec === "string" && plan.spec ? plan.spec : plan?.id;

function putRow(store, row) {
  store.transaction(() => store.put(TABLE, row));
  forgetDriverScope(store);
  return row;
}

const planTasks = (data, planId) =>
  data.tasks.filter((task) => task.planId === planId);

// Live chats for the spec's tasks: not closed or lost, no done or blocked
// report. Elapsed time never changes this.
function liveChats(store, planId) {
  const ids = new Set(planTasks(store.read(), planId).map((task) => task.id));
  return listSessionBindings(store)
    .filter((binding) => ids.has(binding.taskId))
    .filter(
      (binding) =>
        !FINAL_STATUSES.has(binding.status) &&
        !FINAL_REPORTS.has(binding.report?.kind),
    )
    .map(({ slot, taskId, role, status }) => ({
      slot,
      taskId,
      role,
      status: status ?? null,
    }));
}

// ---------------------------------------------------------------------------
// The plan issue (GitHub modes).

// The repository the plan issue lives in: the one projection writes the
// spec's task issues to (the planning repository in plans-repo mode).
function planIssueConfig(store, plan, identity) {
  const task = planTasks(store.read(), plan.id).find(
      (entry) => entry.authority !== "local",
    ),
    projectId = task?.projectId || plan.context?.projectId,
    configs = store.list("github_repositories");
  const config =
    (identity.mode === "plans-repo"
      ? configs.find((entry) => same(entry.id, identity.planningRepository))
      : null) ||
    (projectId && configs.find((entry) => entry.projectId === projectId)) ||
    (configs.length === 1 ? configs[0] : null);
  if (!config)
    fail(`No GitHub repository is registered for spec ${plan.id}.`, 409);
  return config;
}

// The epic issue that stands in when the plan issue has no assignee: the
// epic folder's issue projection recorded (§6.9), else the plan issue's
// parent on GitHub, for a workspace that never projected the spec.
function epicIssue(store, plan) {
  const epic = epicOfPlan(store.read(), plan.id),
    receipt = epic && store.get("receipts", `github-parent:epic:${epic.id}`);
  return receipt?.number
    ? { repository: receipt.repository, number: receipt.number }
    : null;
}

// The plan issue projection keeps (github-projection.mjs `upsertParent`):
// marker task ID `plan.<id>`, the managed label, a parent receipt. Made
// here first so it holds the claim before any task issue exists; a spec
// plan's projection then writes its own title and section over this one.
const planTaskId = (plan) => `plan.${plan.id}`;
const planReceipt = (plan) => `github-parent:plan:${plan.id}`;

function planSection(plan) {
  return `<!-- avoozl:managed:start -->
This issue is the plan \`${plan.id}\`. Its one assignee drives it in Avoozl; reassign it to hand the plan to someone else.
<!-- avoozl:managed:end -->`;
}

const planTitle = (plan) => String(plan.title || plan.id).slice(0, 200);

function managedLabel(config, identity) {
  return (
    identity.repositories?.[config.id]?.managedLabels?.managed ||
    config.managedLabel ||
    null
  );
}

function planMarker(plan, namespace, claim, label) {
  return {
    version: 2,
    taskId: planTaskId(plan),
    namespace,
    kind: "plan",
    source: {
      commit: null,
      manifest: SHA256.test(plan.hash) ? plan.hash : digest(String(plan.hash)),
    },
    applied: {
      title: digest(planTitle(plan)),
      body: digest(planSection(plan)),
      labels: label ? [label] : [],
      blockers: [],
    },
    ...(claim ? { claim } : {}),
  };
}

function withClaimBody(body, marker, identity) {
  const rendered = renderMarker(marker, {
      planningRepository: identity.planningRepository,
    }),
    text = String(body || "");
  return MARKER_BLOCK.test(text)
    ? text.replace(MARKER_BLOCK, () => rendered)
    : rendered + "\n" + text;
}

function planMarkerOf(issue, namespace, planId) {
  const marker = parseMarker(issue?.body);
  return marker?.version === 2 &&
    marker.kind === "plan" &&
    marker.namespace === namespace &&
    marker.taskId === `plan.${planId}`
    ? marker
    : null;
}

// shortcut: the plan issue is found by listing the repository's issues and
// reading markers; a repository with thousands of issues needs a search by
// marker text instead. It runs only while this workspace has no row for it.
async function findPlanIssue(github, config, namespace, planId) {
  const issues = await github.listIssues(config, { state: "all" });
  const found = issues.filter((issue) =>
    planMarkerOf(issue, namespace, planId),
  );
  if (found.length > 1)
    fail(
      `Issues ${found.map((issue) => "#" + issue.number).join(", ")} all claim to be the plan issue for ${planId}.`,
      409,
    );
  return found[0] || null;
}

const claimFrom = (claim) =>
  claim
    ? {
        machine: claim.machine ?? null,
        label: claim.label ?? null,
        login: claim.login ?? null,
      }
    : null;

function newClaim(ctx, login, { from = null, forced = false } = {}) {
  const settings = ctx.settings(),
    at = iso(ctx.now());
  return {
    machine: settings.machine,
    label: settings.label,
    login,
    takenAt: at,
    heartbeatAt: at,
    from,
    forced,
    export: null,
  };
}

// The verdict for one read (design §6.10's table).
function verdictOf({ assignees, claim, login, machine, handoff }) {
  const forcedAway =
    claim?.forced &&
    claim.from?.machine === machine &&
    claim.machine !== machine;
  if (assignees.length !== 1)
    return {
      state: "read-only",
      reason: assignees.length ? "several" : "no-assignee",
    };
  if (!same(assignees[0], login))
    return {
      state: "read-only",
      reason: forcedAway ? "forced-away" : "other-person",
    };
  if (!claim) return { state: "read-only", reason: "no-claim" };
  if (claim.machine !== machine)
    return {
      state: "read-only",
      reason: forcedAway ? "forced-away" : "other-machine",
    };
  if (handoff?.state === "exported")
    return { state: "read-only", reason: "handed-off" };
  return { state: "driver", reason: "driver" };
}

async function currentLogin(github) {
  const user = await github.currentUser();
  if (!user?.login) fail("GitHub did not say which login this token is.", 502);
  return user.login;
}

// One read of the plan issue (and the epic issue when the plan issue has
// no assignee). Writes this workspace's cache row and returns it with any
// notices. `heartbeat` lets the sync step refresh the claim's heartbeat.
async function readGitHubDriver(
  store,
  github,
  ctx,
  plan,
  { login, heartbeat = false, find = true } = {},
) {
  const identity = ctx.identity(),
    namespace = requireNamespace(identity),
    settings = ctx.settings(),
    notify = [];
  let row = store.get(TABLE, plan.id) || { id: plan.id };
  const config = row.repository
    ? store.get("github_repositories", row.repository) ||
      planIssueConfig(store, plan, identity)
    : planIssueConfig(store, plan, identity);
  let issue = null;
  const receipt = store.get("receipts", planReceipt(plan));
  if (!row.number && receipt?.number && same(receipt.repository, config.id))
    row = { ...row, number: receipt.number };
  if (row.number) issue = await github.issue(config, row.number);
  else if (find)
    issue = await findPlanIssue(github, config, namespace, plan.id);
  login = login || (await currentLogin(github));
  const now = ctx.now();
  if (!issue) {
    const projected = planTasks(store.read(), plan.id).some(
      (task) => task.github?.number && task.github.origin === "design",
    );
    row = {
      ...row,
      id: plan.id,
      mode: "github",
      repository: config.id,
      number: null,
      url: null,
      assignees: [],
      decidedBy: null,
      claim: null,
      login,
      machine: settings.machine,
      state: "read-only",
      // A spec projected before §6.10 has no plan issue: it reads only
      // until a person presses Take over. One not yet projected waits for
      // its first projection, which makes the plan issue.
      reason: projected ? "no-plan-issue" : "not-projected",
      readAt: iso(now),
    };
    return { row: putRow(store, row), notify, issue: null, config };
  }
  const marker = planMarkerOf(issue, namespace, plan.id),
    claim = marker?.claim ?? null;
  let assignees = logins(issue),
    decidedBy = "plan",
    epic = null;
  if (!assignees.length) {
    // The epic issue: this workspace's own record of it, else the plan
    // issue's parent on GitHub (a workspace that never projected the spec).
    const ref = epicIssue(store, plan),
      epicConfig = ref && store.get("github_repositories", ref.repository),
      epicCurrent = epicConfig
        ? await github.issue(epicConfig, ref.number)
        : await github.parentIssue?.(config, issue.number);
    if (epicCurrent) {
      assignees = logins(epicCurrent);
      decidedBy = "epic";
      epic = {
        repository: ref?.repository ?? config.id,
        number: epicCurrent.number,
        url: epicCurrent.html_url ?? null,
      };
    }
  }
  const verdict = verdictOf({
    assignees,
    claim,
    login,
    machine: settings.machine,
    handoff: row.handoff,
  });
  let nextClaim = claim;
  // Heartbeat: at most once per interval, by the driver only. The claim is
  // outside the managed section, so `applied` never sees it (R66.3).
  if (
    heartbeat &&
    verdict.state === "driver" &&
    now - Date.parse(claim.heartbeatAt) >= settings.heartbeatMinutes * 60_000
  ) {
    nextClaim = { ...claim, heartbeatAt: iso(now) };
    await github.updateIssue(config, issue.number, {
      body: withClaimBody(
        issue.body,
        { ...marker, claim: nextClaim },
        identity,
      ),
    });
  }
  // Zero or several assignees: one decision naming the issue and what it
  // found, closed by itself once the issue has one.
  let decision = row.decision || null;
  if (assignees.length !== 1) {
    const text = `${decidedBy === "epic" ? "The epic issue" : "Plan issue"} #${decidedBy === "epic" ? epic.number : issue.number} for ${specName(plan)} has ${assignees.length ? `${assignees.length} assignees (${assignees.join(", ")})` : "no assignee"}. Assign exactly one person to choose who drives it; until then every workspace reads only for this spec.`;
    if (decision?.state !== "open" || decision.text !== text) {
      if (decision?.state !== "open")
        notify.push({
          channel: "decision",
          title: `No single driver for ${specName(plan)}`,
          text,
        });
      decision = {
        state: "open",
        text,
        openedAt: decision?.state === "open" ? decision.openedAt : iso(now),
      };
    }
  } else if (decision?.state === "open")
    decision = { ...decision, state: "closed", closedAt: iso(now) };
  row = {
    ...row,
    id: plan.id,
    mode: "github",
    repository: config.id,
    number: issue.number,
    url: issue.html_url ?? null,
    assignees,
    decidedBy,
    epic,
    claim: nextClaim,
    login,
    machine: settings.machine,
    state: verdict.state,
    reason: verdict.reason,
    decision,
    readAt: iso(now),
  };
  return { row: putRow(store, row), notify, issue, config, marker };
}

// Local only mode (R66.9): the row is the lock. The first workspace to see
// an approved spec drives it; a copy opened on another machine reads only
// until a person presses Take over.
function readLocalDriver(store, ctx, plan, { heartbeat = false } = {}) {
  const settings = ctx.settings(),
    now = ctx.now();
  let row = store.get(TABLE, plan.id);
  if (!row || row.mode !== "local")
    row = {
      id: plan.id,
      mode: "local",
      machine: settings.machine,
      label: settings.label,
      takenAt: iso(now),
      heartbeatAt: iso(now),
    };
  const mine = row.machine === settings.machine,
    exported = row.handoff?.state === "exported";
  row = {
    ...row,
    state: mine && !exported ? "driver" : "read-only",
    reason: !mine ? "local-other-machine" : exported ? "handed-off" : "driver",
    thisMachine: settings.machine,
    readAt: iso(now),
  };
  if (
    heartbeat &&
    row.state === "driver" &&
    now - Date.parse(row.heartbeatAt) >= settings.heartbeatMinutes * 60_000
  )
    row.heartbeatAt = iso(now);
  return { row: putRow(store, row), notify: [] };
}

export function githubModeOf(ctx) {
  return Boolean(ctx?.identity().mode);
}

// ---------------------------------------------------------------------------
// The tick (§6.10 "Reading it in the tick").

// Step 4: read every approved spec's driver, heartbeat, finish a drained
// hand-off, and settle away tasks. A read that fails leaves the spec read
// only for this tick: an unread lock is not a lock this machine holds.
export async function driverStep(store, github, { script }) {
  const ctx = driverContext(store),
    notify = [];
  if (!ctx) return { notify };
  const githubMode = githubModeOf(ctx);
  if (githubMode && (!script || !github)) return { notify };
  let login = null;
  for (const plan of approvedPlans(store)) {
    try {
      let result;
      if (githubMode) {
        login = login || (await currentLogin(github));
        result = await readGitHubDriver(store, github, ctx, plan, {
          login,
          heartbeat: true,
        });
      } else result = readLocalDriver(store, ctx, plan, { heartbeat: true });
      notify.push(...result.notify);
      if (result.row.state !== "driver") continue;
      const drained = result.row.handoff;
      if (
        drained?.state === "draining" &&
        drained.folder &&
        !liveChats(store, plan.id).length
      )
        notify.push(
          ...(await writeExport(store, github, ctx, plan, { auto: true }))
            .notify,
        );
      notify.push(...settleAway(store, ctx, plan));
    } catch (error) {
      const row = store.get(TABLE, plan.id);
      putRow(store, {
        ...(row || { id: plan.id, mode: githubMode ? "github" : "local" }),
        state: "read-only",
        reason: "unreadable",
        error: String(error.message || error).slice(0, 300),
        readAt: iso(ctx.now()),
      });
      notify.push({
        channel: "failure",
        title: `Avoozl could not read who drives ${specName(plan)}`,
        text: `${error.message} The spec reads only on this machine until the next tick reads it.`,
      });
    }
  }
  return { notify };
}

// Right before a dispatch, a projection or an integrate for these specs:
// read the plan issue again and return the specs this workspace no longer
// drives. Local only reads its row.
export async function recheckDrivers(store, github, planIds) {
  const ctx = driverContext(store),
    lost = new Set();
  if (!ctx || !planIds.size) return lost;
  const githubMode = githubModeOf(ctx);
  let login = null;
  for (const planId of planIds) {
    const plan = store.get("plans", planId);
    if (!plan || plan.state !== "approved") continue;
    try {
      if (githubMode) {
        if (!github) {
          lost.add(planId);
          continue;
        }
        login = login || (await currentLogin(github));
        const { row } = await readGitHubDriver(store, github, ctx, plan, {
          login,
          find: false,
        });
        if (row.state !== "driver") lost.add(planId);
      } else if (readLocalDriver(store, ctx, plan).row.state !== "driver")
        lost.add(planId);
    } catch {
      lost.add(planId);
    }
  }
  return lost;
}

// Projection's gate (§6.10 "First driver"): the plan issue comes first,
// assigned to the projecting person with this machine's claim, and no task
// issue is made until both read back. Afterwards, every projection reads
// it again and goes on only while this workspace drives the spec.
export async function ensurePlanIssue(store, github, plan) {
  const ctx = driverContext(store);
  if (!ctx || !githubModeOf(ctx)) return null;
  const identity = ctx.identity(),
    namespace = requireNamespace(identity),
    login = await currentLogin(github);
  let { row } = await readGitHubDriver(store, github, ctx, plan, { login });
  if (row.reason === "not-projected") {
    const config = planIssueConfig(store, plan, identity),
      epicRef = epicIssue(store, plan);
    let assignees = [login];
    if (epicRef) {
      const epicConfig = store.get("github_repositories", epicRef.repository),
        epicAssignees = epicConfig
          ? logins(await github.issue(epicConfig, epicRef.number))
          : [];
      // The epic issue's one assignee already decides.
      if (epicAssignees.length === 1) assignees = [];
    }
    const created = await createPlanIssue(store, github, ctx, plan, {
      config,
      claim: newClaim(ctx, login),
      assignees,
    });
    putRow(store, { ...row, repository: config.id, number: created.number });
    ({ row } = await readGitHubDriver(store, github, ctx, plan, { login }));
  }
  if (row.state !== "driver")
    fail(
      `This workspace reads only for spec ${specName(plan)}: ${reasonText(row)} Nothing was projected.`,
      409,
    );
  return row;
}

async function createPlanIssue(
  store,
  github,
  ctx,
  plan,
  { config, claim, assignees },
) {
  const identity = ctx.identity(),
    label = managedLabel(config, identity),
    created = await github.createIssue(config, {
      title: planTitle(plan),
      body: withClaimBody(
        planSection(plan),
        planMarker(plan, requireNamespace(identity), claim, label),
        identity,
      ),
      ...(label ? { labels: [label] } : {}),
      ...(assignees.length ? { assignees } : {}),
    });
  // The receipt projection reads to find its plan issue again.
  store.transaction(() =>
    store.put("receipts", {
      ...(store.get("receipts", planReceipt(plan)) || {}),
      id: planReceipt(plan),
      kind: "github-parent",
      level: "plan",
      parentId: plan.id,
      planId: plan.id,
      repository: config.id,
      number: created.number,
      nodeId: created.node_id ?? null,
      databaseId: Number(created.id) || null,
      url: created.html_url ?? null,
      updatedAt: new Date().toISOString(),
    }),
  );
  return created;
}

// Words for why a spec reads only here, shown in the banner and errors.
export function reasonText(row) {
  const who = row.claim
    ? `${row.claim.login}${row.claim.label ? " · " + row.claim.label : ""} (${row.claim.machine})`
    : null;
  switch (row.reason) {
    case "driver":
      return "This workspace drives it.";
    case "other-person":
      return `It is assigned to ${row.assignees?.[0]} on GitHub.`;
    case "other-machine":
      return `Your other machine drives it: ${who}.`;
    case "no-claim":
      return "Its plan issue has no machine claim yet. Press Take over on the machine that should drive it.";
    case "no-plan-issue":
      return "It was projected before plan issues existed. Press Take over on the machine that should drive it.";
    case "not-projected":
      return "It has no plan issue yet; projecting it makes one.";
    case "no-assignee":
      return "Its plan issue has no assignee.";
    case "several":
      return `Its plan issue has several assignees: ${(row.assignees || []).join(", ")}.`;
    case "handed-off":
      return "You handed it off. Reassign the plan issue on GitHub.";
    case "forced-away":
      return `${row.claim?.login} took it over by force on ${row.claim?.label || row.claim?.machine} at ${row.claim?.takenAt}.`;
    case "local-other-machine":
      return `Another machine (${row.label || row.machine}) holds it in this file. Press Take over to drive it here.`;
    case "unreadable":
      return `Avoozl could not read its plan issue: ${row.error || "unknown error"}.`;
    default:
      return "It is read-only here.";
  }
}

// ---------------------------------------------------------------------------
// Status (page, CLI, MCP). Reads SQLite and the settings file only.

export function driverStatus(store, { planId } = {}) {
  const ctx = driverContext(store);
  if (!ctx) return { enabled: false, specs: [] };
  const settings = ctx.settings(),
    now = ctx.now(),
    staleAfter = settings.heartbeatMinutes * 3 * 60_000,
    data = store.read(),
    plans = approvedPlans(store).filter(
      (plan) => !planId || plan.id === planId,
    );
  const specs = plans.map((plan) => {
    const row = store.get(TABLE, plan.id);
    if (!row)
      return {
        planId: plan.id,
        spec: specName(plan),
        state: "unknown",
        reason: "unread",
        you: false,
        text: "Not read yet; the next tick reads it.",
      };
    const seenAt =
        row.mode === "local" ? row.heartbeatAt : row.claim?.heartbeatAt,
      stale = seenAt ? now - Date.parse(seenAt) > staleAfter : false,
      away = planTasks(data, plan.id)
        .filter((task) => task.driverAway)
        .map((task) => ({
          taskId: task.id,
          reason: task.driverAway.reason,
          decision: row.away?.[task.id] ?? null,
        }));
    return {
      planId: plan.id,
      spec: specName(plan),
      mode: row.mode,
      state: row.state,
      reason: row.reason,
      you: row.state === "driver",
      text: reasonText(row),
      ...(row.mode === "github"
        ? {
            issue: row.number ? { number: row.number, url: row.url } : null,
            assignees: row.assignees || [],
            decidedBy: row.decidedBy ?? null,
            epic: row.epic ?? null,
            driver: row.claim
              ? {
                  login: row.claim.login,
                  label: row.claim.label ?? null,
                  machine: row.claim.machine,
                  forced: row.claim.forced,
                  from: row.claim.from,
                  takenAt: row.claim.takenAt,
                }
              : null,
            offer:
              row.state === "driver"
                ? "handoff"
                : row.assignees?.length === 1 &&
                    same(row.assignees[0], row.login)
                  ? "takeover"
                  : row.reason === "no-plan-issue"
                    ? "takeover"
                    : "force",
          }
        : {
            driver: { label: row.label ?? null, machine: row.machine },
            offer: row.state === "driver" ? "handoff" : "takeover",
          }),
      seenAt: seenAt ?? null,
      stale,
      decision: row.decision?.state === "open" ? row.decision : null,
      handoff: row.handoff
        ? {
            ...row.handoff,
            running: liveChats(store, plan.id),
          }
        : null,
      away,
      setup: row.setup || [],
      lastTakeover: row.takeover ?? null,
    };
  });
  return {
    enabled: true,
    machine: {
      id: settings.machine,
      label: settings.label,
      heartbeatMinutes: settings.heartbeatSet
        ? settings.heartbeatMinutes
        : null,
    },
    readOnly: specs.filter((spec) => spec.state !== "driver").length,
    specs,
  };
}

// ---------------------------------------------------------------------------
// Hand off (R66.10): drain, export, reassign.

function exportFolder(ctx, folder) {
  if (typeof folder !== "string" || !path.isAbsolute(folder))
    fail("Pick a folder for the export by its full path.");
  let stat;
  try {
    stat = fs.statSync(folder);
  } catch {
    fail("That export folder does not exist.", 404);
  }
  if (!stat.isDirectory()) fail("Pick a folder, not a file.");
  const real = fs.realpathSync(folder),
    root = ctx.workspaceRoot ? fs.realpathSync(ctx.workspaceRoot) : null;
  // The export may hold private notes: never inside the workspace's own
  // repository, so it cannot be committed or pushed by accident.
  if (root && (real === root || real.startsWith(root + path.sep)))
    fail(
      "Pick a folder outside the workspace repository, so the export is never committed.",
      409,
    );
  return real;
}

export async function handOffDriver(store, github, input = {}) {
  const ctx = driverContext(store);
  if (!ctx) fail("This workspace has no driver settings.", 409);
  const plan = requirePlan(store, input.planId),
    row = store.get(TABLE, plan.id),
    action = input.action ?? "start";
  if (action === "cancel") {
    if (row?.handoff?.state !== "draining")
      fail("Only a hand-off that has not exported can be cancelled.", 409);
    const { handoff: _handoff, ...rest } = row;
    putRow(store, rest);
    return driverStatus(store, { planId: plan.id });
  }
  if (row?.state !== "driver")
    fail(`This workspace does not drive ${specName(plan)}.`, 409);
  if (action === "start") {
    if (row.handoff) fail("This spec is already being handed off.", 409);
    putRow(store, {
      ...row,
      handoff: {
        state: "draining",
        startedAt: iso(ctx.now()),
        ...(input.folder ? { folder: exportFolder(ctx, input.folder) } : {}),
      },
    });
    return driverStatus(store, { planId: plan.id });
  }
  if (action === "export") {
    if (row.handoff?.state !== "draining")
      fail("Press Hand off driver first; it stops new work.", 409);
    const folder = input.folder
      ? exportFolder(ctx, input.folder)
      : row.handoff.folder;
    if (!folder) fail("Pick a folder for the export.");
    const running = liveChats(store, plan.id);
    if (running.length && input.unfinished !== true)
      fail(
        `${running.length} chat(s) still run for ${specName(plan)}: ${running.map((chat) => chat.taskId).join(", ")}. Wait, or Export with ${running.length} unfinished.`,
        409,
      );
    putRow(store, { ...row, handoff: { ...row.handoff, folder } });
    const written = await writeExport(store, github, ctx, plan, {
      unfinished: running.map((chat) => chat.taskId),
    });
    return { ...driverStatus(store, { planId: plan.id }), file: written.file };
  }
  fail("Choose hand-off action start, export or cancel.");
}

// The machine-local items in use (R66.16), by name only.
function machineLocalItems(store, ctx) {
  const items = [];
  try {
    const plugins = declaredPlugins({
      workspaceRoot: ctx.workspaceRoot,
      settingsFile: ctx.pluginSettingsFile,
    });
    const approvals = ctx.pluginSettingsFile
      ? readPluginSettings(ctx.pluginSettingsFile).approvals || {}
      : {};
    for (const { entry, source } of plugins)
      if (typeof entry?.id === "string")
        items.push({
          kind: "plugin",
          id: entry.id,
          source,
          approved: Boolean(approvals[entry.id]),
        });
  } catch {
    // An unreadable plugin list names nothing; the take-over lists the
    // plugins `.avoozl.json` names instead.
  }
  const configured = repositorySets(ctx);
  for (const id of configured.terms) items.push({ kind: "terms", id });
  if (store.getMeta("flow.retro.instructions"))
    items.push({ kind: "retro-instructions" });
  return items;
}

// Rule sets whose rules come from a terms file, named in `.avoozl.json`.
function repositorySets(ctx) {
  try {
    const value = JSON.parse(
      fs.readFileSync(path.join(ctx.workspaceRoot, ".avoozl.json"), "utf8"),
    );
    const sets = Array.isArray(value.contentRules?.sets)
      ? value.contentRules.sets
      : [];
    const plugins = Array.isArray(value.plugins)
      ? value.plugins.map((entry) => entry?.id).filter(Boolean)
      : [];
    return {
      terms: sets.filter((set) => set?.id && !set.plugin).map((set) => set.id),
      plugins: [
        ...plugins,
        ...sets.filter((set) => set?.plugin).map((set) => set.plugin),
      ],
    };
  } catch {
    return { terms: [], plugins: [] };
  }
}

// Tables that move with a spec, filtered to its tasks. Execution state tied
// to this machine (worktrees, live session bindings and requests,
// deliveries mid-flight) does not move: those tasks are listed unfinished
// and read as away on the new driver (R66.11).
const MOVED_TABLES = [
  "receipts",
  "flow_records",
  "flow_stops",
  "flow_retros",
  "flow_batches",
  "placement_decisions",
  "content_decisions",
  "github_issues",
  "github_linked_branches",
  "pr_feedback",
];
// Column tables: [table, the column naming its task, columns left behind].
const COLUMN_TABLES = [
  ["flow_spans", "task_id", []],
  ["flow_usage", "task_id", []],
  ["usage_samples", "task_id", []],
  // The activity log (§4.16): a new machine numbers its own rows.
  ["activity_log", "target_id", ["seq"]],
];

function belongs(row, ids, planId) {
  return (
    ids.has(row?.taskId) ||
    ids.has(row?.task) ||
    ids.has(row?.id) ||
    row?.planId === planId ||
    (Array.isArray(row?.tasks) && row.tasks.some((id) => ids.has(id)))
  );
}

// Keys that never leave a machine, wherever they sit in a row.
const SECRET_KEYS = new Set([
  "token",
  "host",
  "hostKey",
  "knownHosts",
  "instructions",
  "path",
  "worktree",
  "root",
  "checkout",
]);
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_KEYS.has(key))
      .map(([key, item]) => [key, scrub(item)]),
  );
}

// The raw lessons store (§4.18) moves with the export: this machine's
// lesson rows as they are, and on take-over each row this machine lacks.
// Tests may replace the hook.
export const lessonsHook = {
  export: (store) => {
    const lessons = retroMemory(store)?.lessons;
    return lessons ? lessons.list() : null;
  },
  import: (store, rows) => {
    const lessons = retroMemory(store)?.lessons;
    if (!lessons || !Array.isArray(rows)) return;
    for (const row of rows)
      if (typeof row?.id === "string" && !lessons.get(row.id)) lessons.put(row);
  },
};

export function buildExport(store, ctx, plan, { unfinished = [] } = {}) {
  const data = store.read(),
    tasks = planTasks(data, plan.id),
    ids = new Set(tasks.map((task) => task.id)),
    settings = ctx.settings(),
    identity = ctx.identity(),
    tables = {};
  for (const table of MOVED_TABLES) {
    let rows = [];
    try {
      rows = store.list(table);
    } catch {
      continue;
    }
    tables[table] = scrub(rows.filter((row) => belongs(row, ids, plan.id)));
  }
  const columns = {};
  for (const [table, column, dropped] of COLUMN_TABLES) {
    try {
      columns[table] = store.db
        .prepare(`SELECT * FROM ${table}`)
        .all()
        .filter((row) => ids.has(row[column]) || row[column] === plan.id)
        .map((row) =>
          Object.fromEntries(
            Object.entries(row).filter(([key]) => !dropped.includes(key)),
          ),
        );
    } catch {
      columns[table] = [];
    }
  }
  const bindings = listSessionBindings(store)
    .filter((binding) => ids.has(binding.taskId))
    .map(({ slot, taskId, role, attempt, status, report, crew, boundAt }) => ({
      slot,
      taskId,
      role,
      attempt: attempt ?? null,
      status: status ?? null,
      report: report?.kind ? { kind: report.kind } : null,
      crew: crew ?? null,
      boundAt: boundAt ?? null,
      machine: settings.machine,
    }));
  const activity = store
    .events({ latest: true, limit: 1000 })
    .filter((event) => ids.has(event.taskId) || event.planId === plan.id);
  return {
    format: EXPORT_FORMAT,
    version: 1,
    namespace: identity.namespace ?? null,
    spec: specName(plan),
    planId: plan.id,
    approved: {
      commit: plan.sourceCommit || plan.context?.github?.commit || null,
      hash: plan.hash,
    },
    from: { machine: settings.machine, label: settings.label },
    exportedAt: iso(ctx.now()),
    plan: scrub(plan),
    tasks: scrub(tasks),
    edges: data.edges.filter((edge) => ids.has(edge.from) || ids.has(edge.to)),
    tables,
    columns,
    bindings,
    activity: scrub(activity),
    unfinished,
    machineLocal: machineLocalItems(store, ctx),
    lessons: lessonsHook.export ? lessonsHook.export(store, plan) : null,
  };
}

async function writeExport(
  store,
  github,
  ctx,
  plan,
  { unfinished = [], auto = false } = {},
) {
  const row = store.get(TABLE, plan.id),
    folder = row.handoff.folder,
    value = buildExport(store, ctx, plan, { unfinished }),
    text = JSON.stringify(value, null, 2) + "\n",
    sha256 = createHash("sha256").update(text).digest("hex"),
    file = path.join(folder, `${specName(plan)}.avoozl-driver.json`);
  fs.writeFileSync(file, text, { mode: 0o600 });
  let next = {
    ...row,
    handoff: {
      ...row.handoff,
      state: "exported",
      sha256,
      file,
      unfinished,
      exportedAt: value.exportedAt,
    },
  };
  // The claim records the file's hash, so only that file takes over.
  if (row.mode === "github") {
    const identity = ctx.identity(),
      config = store.get("github_repositories", row.repository),
      issue = await github.issue(config, row.number),
      marker = planMarkerOf(issue, identity.namespace, plan.id);
    if (!marker?.claim) fail("The plan issue lost its claim.", 409);
    const claim = { ...marker.claim, export: sha256 };
    await github.updateIssue(config, row.number, {
      body: withClaimBody(issue.body, { ...marker, claim }, identity),
    });
    next = { ...next, claim, state: "read-only", reason: "handed-off" };
  } else {
    next = {
      ...next,
      export: sha256,
      state: "read-only",
      reason: "handed-off",
    };
  }
  putRow(store, next);
  return {
    file,
    sha256,
    notify: auto
      ? [
          {
            channel: "decision",
            title: `${specName(plan)} is ready to hand off`,
            text: `Every chat finished and the export is written. ${row.url ? "Reassign the plan issue on GitHub." : "Move the file to the other machine and press Take over there."}`,
          },
        ]
      : [],
  };
}

// ---------------------------------------------------------------------------
// Take over (R66.8, R66.12, R66.13) and Force take over (R66.14).

function readExportFile(file) {
  if (typeof file !== "string" || !path.isAbsolute(file))
    fail("Name the export file by its full path.");
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    fail(`Could not read ${path.basename(file)}.`, 404);
  }
  const sha256 = createHash("sha256").update(text).digest("hex");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(`${path.basename(file)} is not an Avoozl driver export.`, 422);
  }
  if (value?.format !== EXPORT_FORMAT || value.version !== 1)
    fail(`${path.basename(file)} is not an Avoozl driver export.`, 422);
  return { value, sha256, name: path.basename(file) };
}

function commitPresent(root, commit) {
  const run = (args) =>
    execFileSync("git", ["-C", root, ...args], {
      stdio: ["ignore", "ignore", "ignore"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  try {
    run(["cat-file", "-e", commit + "^{commit}"]);
    return true;
  } catch {
    try {
      run(["fetch", "--quiet", "origin"]);
      run(["cat-file", "-e", commit + "^{commit}"]);
      return true;
    } catch {
      return false;
    }
  }
}

// Every check before anything changes; a mismatch is refused by name.
function verifyExport(ctx, plan, file, expectedSha) {
  const { value, sha256, name } = readExportFile(file),
    identity = ctx.identity();
  if (value.namespace !== (identity.namespace ?? null))
    fail(
      `${name} is for namespace ${value.namespace}, not this workspace's.`,
      409,
    );
  if (value.planId !== plan.id || value.spec !== specName(plan))
    fail(`${name} is for spec ${value.spec}, not ${specName(plan)}.`, 409);
  if (expectedSha !== undefined && sha256 !== expectedSha)
    fail(
      `${name} does not match the export its driver recorded (sha256 ${String(expectedSha || "none").slice(0, 12)}). Nothing changed.`,
      409,
    );
  const commit = value.approved?.commit;
  if (commit && COMMIT.test(commit) && ctx.workspaceRoot)
    if (!commitPresent(ctx.workspaceRoot, commit))
      fail(
        `${name} was exported at commit ${commit.slice(0, 12)}, which this workspace's spec checkout does not have.`,
        409,
      );
  if (value.approved?.hash !== plan.hash)
    fail(
      `${name} was exported for another revision of ${specName(plan)}. Approve the same revision here first.`,
      409,
    );
  return value;
}

// One SQLite transaction: rows replace this workspace's for the spec's
// tasks; session bindings come over as away markers, never as sessions.
function importExport(store, value, now) {
  const ids = new Set(value.tasks.map((task) => task.id)),
    away = new Map();
  for (const id of value.unfinished || [])
    away.set(id, { reason: "unfinished", machine: value.from.machine });
  for (const binding of value.bindings || [])
    if (
      !FINAL_STATUSES.has(binding.status) &&
      !FINAL_REPORTS.has(binding.report?.kind)
    )
      away.set(binding.taskId, {
        reason: "session",
        machine: binding.machine,
        slot: binding.slot,
      });
  // mutate is the one transaction: the snapshot and every row commit or
  // none does.
  store.mutate("Take over spec " + value.spec, (data) => {
    data.tasks = data.tasks.filter((task) => !ids.has(task.id));
    for (const task of value.tasks) {
      const next = { ...task };
      if (away.has(task.id))
        next.driverAway = { ...away.get(task.id), since: iso(now) };
      data.tasks.push(next);
    }
    const edgeIds = new Set(value.edges.map((edge) => edge.id));
    data.edges = [
      ...data.edges.filter((edge) => !edgeIds.has(edge.id)),
      ...value.edges,
    ];
    for (const [table, rows] of Object.entries(value.tables || {}))
      if (MOVED_TABLES.includes(table))
        for (const row of rows) if (row?.id) store.put(table, row);
    for (const [table, rows] of Object.entries(value.columns || {})) {
      if (!COLUMN_TABLES.some(([name]) => name === table) || !rows.length)
        continue;
      const columns = Object.keys(rows[0]);
      if (!columns.every((column) => /^[a-z_]+$/.test(column))) continue;
      const insert = store.db.prepare(
        `INSERT OR REPLACE INTO ${table}(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
      );
      for (const row of rows)
        insert.run(...columns.map((column) => row[column]));
    }
    if (lessonsHook.import && value.lessons)
      lessonsHook.import(store, value.lessons);
  });
  return [...away.keys()];
}

// A task with an open linked branch or pull request and no session here is
// away too (R66.11): its old chat may still be working on it.
async function markOpenWork(store, github, plan) {
  const data = store.read(),
    complete = (status) => statusComplete(data, status),
    here = new Set(
      listSessionBindings(store)
        .filter(
          (binding) =>
            !FINAL_STATUSES.has(binding.status) &&
            !FINAL_REPORTS.has(binding.report?.kind),
        )
        .map((binding) => binding.taskId),
    ),
    marked = [];
  for (const task of planTasks(data, plan.id)) {
    if (
      taskKind(task) !== "leaf" ||
      task.driverAway ||
      here.has(task.id) ||
      !task.github?.number ||
      completionReached(task, null, complete)
    )
      continue;
    let links;
    try {
      links = await github.issueLinks?.(
        task.github.repository,
        task.github.number,
      );
    } catch {
      links = null;
    }
    if (links?.linkedBranches?.length) marked.push(task.id);
  }
  if (marked.length)
    store.mutate("Mark away tasks", (next) => {
      for (const task of next.tasks)
        if (marked.includes(task.id))
          task.driverAway = {
            reason: "open-work",
            since: new Date().toISOString(),
          };
    });
  return marked;
}

// After a take-over: what to set up again on this machine (R66.16).
function setupList(ctx, value) {
  if (value?.machineLocal)
    return value.machineLocal.map(({ kind, id }) => ({
      kind,
      ...(id ? { id } : {}),
    }));
  const sets = repositorySets(ctx);
  return [
    ...sets.plugins.map((id) => ({ kind: "plugin", id })),
    ...sets.terms.map((id) => ({ kind: "terms", id })),
  ];
}

async function writeClaim(store, github, ctx, row, claim) {
  const identity = ctx.identity(),
    config = store.get("github_repositories", row.repository),
    issue = await github.issue(config, row.number),
    marker =
      planMarkerOf(issue, identity.namespace, row.id) ||
      planMarker(
        store.get("plans", row.id),
        identity.namespace,
        null,
        managedLabel(config, identity),
      );
  await github.updateIssue(config, row.number, {
    body: withClaimBody(issue.body, { ...marker, claim }, identity),
  });
}

// The loss list and setup list a dialog shows before anything runs.
export function takeoverPreview(store, input = {}) {
  const ctx = driverContext(store);
  if (!ctx) fail("This workspace has no driver settings.", 409);
  const plan = requirePlan(store, input.planId),
    row = store.get(TABLE, plan.id) || {};
  return {
    planId: plan.id,
    spec: specName(plan),
    lost: input.rebuild ? REBUILD_LOSSES : [],
    reraised: input.rebuild
      ? [
          "Conflicts",
          "Disallowed closes",
          "Leak hits",
          "Quarantined snapshots",
          "A zero-or-several assignee decision",
        ]
      : [],
    current: {
      assignees: row.assignees || [],
      driver: row.claim ? claimFrom(row.claim) : null,
      seenAt: row.claim?.heartbeatAt ?? row.heartbeatAt ?? null,
    },
    setup: setupList(ctx, null),
  };
}

export async function takeOver(store, github, input = {}, hooks = {}) {
  const ctx = driverContext(store);
  if (!ctx) fail("This workspace has no driver settings.", 409);
  const plan = requirePlan(store, input.planId);
  if (input.file && input.rebuild)
    fail("Take over from an export or rebuild from GitHub, not both.");
  if (!githubModeOf(ctx)) return localTakeOver(store, ctx, plan, input);
  const login = await currentLogin(github);
  let { row } = await readGitHubDriver(store, github, ctx, plan, { login });
  if (row.state === "driver") fail(`You already drive ${specName(plan)}.`, 409);
  const legacy = row.reason === "no-plan-issue";
  if (!legacy && !(row.assignees.length === 1 && same(row.assignees[0], login)))
    fail(
      `${reasonText(row)} Take over needs the plan issue assigned to ${login}; use Force take over instead.`,
      409,
    );
  const value = input.file
    ? verifyExport(ctx, plan, input.file, row.claim?.export ?? null)
    : null;
  if (input.rebuild && input.acknowledgeLoss !== true)
    return {
      needs: "acknowledge",
      ...takeoverPreview(store, { ...input, planId: plan.id }),
    };
  const away = value ? importExport(store, value, ctx.now()) : [];
  if (input.rebuild) await hooks.rebuild?.(row.repository);
  const claim = newClaim(ctx, login, { from: claimFrom(row.claim) });
  if (legacy) {
    const config = planIssueConfig(store, plan, ctx.identity()),
      created = await createPlanIssue(store, github, ctx, plan, {
        config,
        claim,
        assignees: [login],
      });
    row = putRow(store, {
      ...row,
      repository: config.id,
      number: created.number,
    });
  } else await writeClaim(store, github, ctx, row, claim);
  return settleTakeover(store, github, ctx, plan, {
    login,
    claim,
    value,
    away,
    kind: value ? "export" : input.rebuild ? "rebuild" : "claim",
  });
}

// Wait, read again, and drive only if this claim is still the one GitHub
// kept (R66.8): two machines of one login that press at once both write,
// and both then read the same winner.
async function settleTakeover(
  store,
  github,
  ctx,
  plan,
  { login, claim, value, away, kind, forced = false },
) {
  await ctx.sleep(TAKEOVER_WAIT_MS);
  const before = store.get(TABLE, plan.id),
    { row } = await readGitHubDriver(store, github, ctx, plan, { login });
  const { handoff: _handoff, ...rest } = row,
    won =
      row.claim?.machine === claim.machine &&
      row.claim?.takenAt === claim.takenAt;
  const marked = won ? await markOpenWork(store, github, plan) : [];
  const next = putRow(store, {
    ...rest,
    ...(won
      ? { reproject: true }
      : before?.handoff
        ? { handoff: before.handoff }
        : {}),
    setup: won ? setupList(ctx, value) : before?.setup || [],
    takeover: {
      kind,
      forced,
      at: claim.takenAt,
      won,
      away: [...away, ...marked],
      ...(won ? {} : { winner: claimFrom(row.claim) }),
    },
  });
  return {
    ...driverStatus(store, { planId: plan.id }),
    won,
    ...(won ? {} : { winner: claimFrom(next.claim) }),
  };
}

function localTakeOver(store, ctx, plan, input) {
  const settings = ctx.settings(),
    row = store.get(TABLE, plan.id);
  if (
    row?.mode === "local" &&
    row.machine === settings.machine &&
    row.state === "driver"
  )
    fail(`You already drive ${specName(plan)}.`, 409);
  if (input.rebuild)
    fail("Local only mode has no GitHub to rebuild from.", 409);
  const value = input.file
    ? verifyExport(ctx, plan, input.file, row?.export ?? undefined)
    : null;
  const away = value ? importExport(store, value, ctx.now()) : [];
  const now = iso(ctx.now());
  putRow(store, {
    id: plan.id,
    mode: "local",
    machine: settings.machine,
    label: settings.label,
    takenAt: now,
    heartbeatAt: now,
    from: row
      ? { machine: row.machine ?? null, label: row.label ?? null }
      : null,
    state: "driver",
    reason: "driver",
    setup: setupList(ctx, value),
    takeover: {
      kind: value ? "export" : "claim",
      forced: false,
      at: now,
      won: true,
      away,
    },
  });
  return { ...driverStatus(store, { planId: plan.id }), won: true };
}

export async function forceTakeOver(store, github, input = {}, hooks = {}) {
  const ctx = driverContext(store);
  if (!ctx) fail("This workspace has no driver settings.", 409);
  const plan = requirePlan(store, input.planId);
  if (!githubModeOf(ctx))
    fail(
      "Local only mode has no forced take-over between machines: there is nothing shared to write to. Export on the old machine, or press Take over on a copy.",
      409,
    );
  const login = await currentLogin(github);
  let { row, issue, config } = await readGitHubDriver(
    store,
    github,
    ctx,
    plan,
    { login },
  );
  if (row.state === "driver") fail(`You already drive ${specName(plan)}.`, 409);
  if (!row.number) fail("This spec has no plan issue to take over.", 409);
  if (input.confirm !== specName(plan))
    fail(`Type the spec name ${specName(plan)} to confirm.`, 409);
  const value = input.file ? verifyExport(ctx, plan, input.file) : null;
  if (!value && input.acknowledgeLoss !== true)
    return {
      needs: "acknowledge",
      ...takeoverPreview(store, { planId: plan.id, rebuild: true }),
    };
  // 1. The plan issue's assignees, exactly this login, read back. GitHub
  // silently ignores the change for a token without push access.
  const current = logins(issue);
  if (!(current.length === 1 && same(current[0], login))) {
    await github.updateIssue(config, row.number, { assignees: [login] });
    const kept = logins(await github.issue(config, row.number));
    if (!(kept.length === 1 && same(kept[0], login)))
      fail(
        `GitHub kept the plan issue's assignees as ${kept.join(", ") || "nobody"}: this token likely has no push access to ${config.id}. Nothing else changed.`,
        409,
      );
  }
  // 2. Rebuild from GitHub, or import a matching export.
  const away = value ? importExport(store, value, ctx.now()) : [];
  if (!value) await hooks.rebuild?.(row.repository);
  // 3. A forced claim naming the old driver.
  const from = claimFrom(row.claim) || {
      machine: null,
      label: null,
      login: current[0] || null,
    },
    claim = newClaim(ctx, login, { from, forced: true });
  await writeClaim(store, github, ctx, row, claim);
  const result = await settleTakeover(store, github, ctx, plan, {
    login,
    claim,
    value,
    away,
    kind: value ? "export" : "rebuild",
    forced: true,
  });
  store.event(null, "driver.forced", {
    planId: plan.id,
    login,
    machine: claim.machine,
    from,
    at: claim.takenAt,
  });
  hooks.notify?.([
    {
      channel: "decision",
      title: `You took over ${specName(plan)} by force`,
      text: `The old driver ${from.login || "nobody"}${from.label ? " · " + from.label : ""} may still run chats for it; their local results do not come here.`,
    },
  ]);
  return result;
}

// Specs taken over here and not yet projected again: the next tick projects
// each once, which raises again every conflict still on GitHub.
export function takenOverPlanIds(store) {
  let rows;
  try {
    rows = store.list(TABLE);
  } catch {
    return new Set();
  }
  return new Set(
    rows
      .filter(
        (row) =>
          row.reproject && row.state === "driver" && row.mode === "github",
      )
      .map((row) => row.id),
  );
}

export function reprojected(store, planId) {
  const row = store.get(TABLE, planId);
  if (!row?.reproject) return;
  const { reproject: _reproject, ...rest } = row;
  putRow(store, rest);
}

// ---------------------------------------------------------------------------
// Away tasks (R66.11): never started again because a lease expired. One
// completes from GitHub facts when they show it done; otherwise one decision
// asks a person whether to start it here.

function settleAway(store, ctx, plan) {
  const data = store.read(),
    complete = (status) => statusComplete(data, status),
    row = store.get(TABLE, plan.id),
    away = { ...(row.away || {}) },
    done = [],
    notify = [];
  for (const task of planTasks(data, plan.id)) {
    if (!task.driverAway) continue;
    if (completionReached(task, null, complete)) {
      done.push(task.id);
      delete away[task.id];
      continue;
    }
    if (!away[task.id]) {
      away[task.id] = { state: "open", openedAt: iso(ctx.now()) };
      notify.push({
        channel: "decision",
        task: task.id,
        title: `${task.id} was running on the old driver`,
        text: `Avoozl will not start ${task.id} again because its old chat went quiet. Start it here, or wait for its pull request.`,
      });
    }
  }
  if (done.length)
    store.mutate("Away tasks completed from GitHub", (next) => {
      for (const task of next.tasks)
        if (done.includes(task.id)) delete task.driverAway;
    });
  if (JSON.stringify(away) !== JSON.stringify(row.away || {}))
    putRow(store, { ...store.get(TABLE, plan.id), away });
  return notify;
}

// A person's answer to an away task's decision: start it here, or wait.
export function decideAway(store, { taskId, choice } = {}) {
  const task = store.read().tasks.find((item) => item.id === taskId);
  if (!task?.driverAway) fail("That task is not away.", 404);
  if (!["start", "wait"].includes(choice)) fail("Choose start or wait.");
  const row = store.get(TABLE, task.planId);
  if (row?.state !== "driver")
    fail("Only the spec's driver decides its away tasks.", 409);
  const away = { ...(row.away || {}) };
  away[taskId] = {
    ...(away[taskId] || {}),
    state: choice === "start" ? "closed" : "answered",
    choice,
    answeredAt: new Date().toISOString(),
  };
  if (choice === "start") {
    delete away[taskId];
    store.mutate("Start away task " + taskId + " here", (data) => {
      for (const item of data.tasks)
        if (item.id === taskId) delete item.driverAway;
    });
  }
  putRow(store, { ...row, away });
  return driverStatus(store, { planId: task.planId });
}

// Open driver decisions for the Decisions view.
export function driverDecisions(store) {
  const items = [];
  let rows;
  try {
    rows = store.list(TABLE);
  } catch {
    return items;
  }
  for (const row of rows) {
    if (row.decision?.state === "open")
      items.push({
        kind: "driver",
        id: "driver:" + row.id,
        planId: row.id,
        title: `No single driver for ${row.id}`,
        detail: row.decision.text,
        link: row.url ?? null,
        openedAt: row.decision.openedAt,
      });
    for (const [taskId, decision] of Object.entries(row.away || {}))
      if (decision.state === "open")
        items.push({
          kind: "driver-away",
          id: "driver-away:" + taskId,
          planId: row.id,
          taskId,
          title: `${taskId} was running on the old driver`,
          detail: "Start it here, or wait for its pull request.",
          openedAt: decision.openedAt,
        });
  }
  return items;
}
