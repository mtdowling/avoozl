// One driver per spec (design §6.10, Requirement 66): the spec issue's one
// assignee. The Avoozl signed in as that GitHub login drives it; every other
// workspace reads only (driver-scope.mjs answers that from SQLite). Handing
// a spec to someone else is reassigning its issue on GitHub, and
// unassigning releases it (§4.44, §4.46); Avoozl never writes the assignee.
// A spec with no spec issue is not shared and drives here. In Local only
// mode it is a `drivers` row in this workspace's SQLite.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { statusComplete } from "../../model.mjs";
import { completionReached, taskKind } from "../../work-model.mjs";
import { forgetDriverScope } from "./driver-scope.mjs";
import {
  parseMarker,
  planningIdentity,
  requireNamespace,
} from "../github/github-marker.mjs";
import { machineAvoozlPaths } from "../settings/host-config.mjs";
import { check as contentCheck } from "../content/content-rules.mjs";
import { epicOfPlan } from "../epics/epics.mjs";
import { fail } from "../store/store.mjs";
import { personOf } from "../github/github.mjs";
import { asJob } from "../github/github-jobs.mjs";

const TABLE = "drivers";
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
const MACHINE_ID = /^mch_[a-z2-7]{16}$/;
// ---------------------------------------------------------------------------
// This computer: machine ID and label, in machine-local settings.

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

// {machine, label}. The machine ID is made once, on first
// use, and never filled from the host name.
function machineSettings(file) {
  let value = readSettingsFile(file);
  if (!MACHINE_ID.test(value.machine || "")) {
    value = { ...value, machine: newMachineId() };
    writeSettingsFile(file, value);
  }
  return {
    machine: value.machine,
    label: typeof value.label === "string" && value.label ? value.label : null,
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
  writeSettingsFile(file, next);
  return machineSettings(file);
}

// ---------------------------------------------------------------------------
// The binding: which settings file and clock this store's driver uses.
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
  },
) {
  bound.set(store, {
    settingsFile,
    workspaceRoot,
    pluginSettingsFile,
    now,
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

export const specName = (plan) =>
  typeof plan?.spec === "string" && plan.spec ? plan.spec : plan?.id;

function putRow(store, row) {
  store.transaction(() => store.put(TABLE, row));
  forgetDriverScope(store);
  return row;
}

const planTasks = (data, planId) =>
  data.tasks.filter((task) => task.planId === planId);

// ---------------------------------------------------------------------------
// The plan issue (GitHub modes).

// The repository the plan issue lives in: the one projection writes the
// spec's task issues to (the planning repository in plans-repo mode).
function planIssueConfig(store, plan, identity) {
  const task = planTasks(store.read(), plan.id).find(
      (entry) => entry.authority !== "local",
    ),
    repositoryId = task?.repositoryId || plan.context?.repositoryId,
    configs = store.list("github_repositories");
  const own =
      repositoryId &&
      configs.find((entry) => entry.repositoryId === repositoryId),
    config =
      (identity.mode === "plans-repo"
        ? configs.find((entry) => same(entry.id, identity.planningRepository))
        : null) ||
      own ||
      (configs.length === 1 ? configs[0] : null);
  if (!config)
    fail(`No GitHub repository is registered for spec ${plan.id}.`, 409);
  return config;
}

// The registered entry for a stored repository ID.
function configById(store, id) {
  return (
    store.get("github_repositories", id) ??
    store.list("github_repositories").find((entry) => same(entry.id, id)) ??
    null
  );
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

const planReceipt = (plan) => `github-parent:plan:${plan.id}`;

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

// The verdict for one read (design §6.10's table, changed by §4.44 and
// §4.46): the one assignee drives; nobody or several hold every machine.
function verdictOf({ assignees, login }) {
  if (assignees.length > 1) return { state: "read-only", reason: "several" };
  if (!assignees.length) return { state: "read-only", reason: "no-assignee" };
  if (!same(assignees[0], login))
    return { state: "read-only", reason: "other-person" };
  return { state: "driver", reason: "driver" };
}

// This machine's person on GitHub (§D12): the spec issue's assignee and
// the driver claim name the person, never a provider's bot login.
async function currentLogin(github, value) {
  const login = await personOf(github, value);
  if (!login)
    fail(
      "The GitHub sign-in names no person, so driver claims wait. See Needs you.",
      409,
    );
  return login;
}

// One read of the plan issue (and the epic issue when the plan issue has
// no assignee). Writes this workspace's cache row and returns it with any
// notices.
async function readGitHubDriver(
  store,
  github,
  ctx,
  plan,
  { login, find = true } = {},
) {
  const identity = ctx.identity(),
    namespace = requireNamespace(identity),
    notify = [];
  let row = store.get(TABLE, plan.id) || { id: plan.id };
  const config = row.repository
    ? configById(store, row.repository) ||
      planIssueConfig(store, plan, identity)
    : planIssueConfig(store, plan, identity);
  let issue = null;
  const receipt = store.get("receipts", planReceipt(plan));
  if (!row.number && receipt?.number && same(receipt.repository, config.id))
    row = { ...row, number: receipt.number };
  if (row.number) issue = await github.issue(config, row.number);
  else if (find)
    issue = await findPlanIssue(github, config, namespace, plan.id);
  login = login || (await currentLogin(github, config));
  const now = ctx.now();
  if (!issue) {
    // No spec issue: nothing is shared, so this workspace drives the spec
    // and says so (R116.5). Avoozl makes no issue for it.
    row = {
      ...row,
      id: plan.id,
      mode: "github",
      repository: config.id,
      number: null,
      url: null,
      assignees: [],
      decidedBy: null,
      login,
      state: "driver",
      reason: "not-shared",
      readAt: iso(now),
    };
    return { row: putRow(store, row), notify, issue: null, config };
  }
  let assignees = logins(issue),
    decidedBy = "plan",
    epic = null;
  if (!assignees.length) {
    // The epic issue: this workspace's own record of it, else the plan
    // issue's parent on GitHub (a workspace that never projected the spec).
    const ref = epicIssue(store, plan),
      epicConfig = ref && configById(store, ref.repository),
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
  const verdict = verdictOf({ assignees, login });
  // Two or more assignees: one decision naming the issue and every
  // assignee, closed by itself once one is left. None raises nothing: the
  // spec waits for someone to be assigned (R116.3).
  let decision = row.decision || null;
  if (assignees.length > 1) {
    const text = `${decidedBy === "epic" ? "The epic issue" : "Spec issue"} #${decidedBy === "epic" ? epic.number : issue.number} for ${specName(plan)} has ${assignees.length} assignees: ${assignees.join(", ")}. Remove all but one on GitHub; until then no machine starts new tasks for this spec.`;
    if (decision?.state !== "open" || decision.text !== text) {
      if (decision?.state !== "open")
        notify.push({
          channel: "decision",
          record: "driver:" + plan.id,
          title: `${specName(plan)} has several assignees`,
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
    login,
    state: verdict.state,
    reason: verdict.reason,
    decision,
    readAt: iso(now),
  };
  return { row: putRow(store, row), notify, issue, config };
}

// Local only mode (R66.7): there is no spec issue, so this workspace drives
// every approved spec. The row names this machine for the chip.
function readLocalDriver(store, ctx, plan) {
  const settings = ctx.settings(),
    now = ctx.now(),
    row = {
      ...(store.get(TABLE, plan.id) ?? { takenAt: iso(now) }),
      id: plan.id,
      mode: "local",
      machine: settings.machine,
      label: settings.label,
      state: "driver",
      reason: "driver",
      thisMachine: settings.machine,
      readAt: iso(now),
    };
  return { row: putRow(store, row), notify: [] };
}

function githubModeOf(ctx) {
  return Boolean(ctx?.identity().mode);
}

// ---------------------------------------------------------------------------
// The tick (§6.10 "Reading it in the tick").

// Step 4: read every approved spec's driver. A read that fails leaves the
// spec read only for this tick: an unread lock is not a lock this machine
// holds.
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
        result = await readGitHubDriver(store, github, ctx, plan, { login });
      } else result = readLocalDriver(store, ctx, plan);
      notify.push(...result.notify);
      if (result.issue?.state === "open" && landedInFull(store, plan.id))
        notify.push(...(await closeLanded(store, github, plan, result)));
    } catch (error) {
      const row = store.get(TABLE, plan.id);
      putRow(store, {
        ...(row || { id: plan.id, mode: githubMode ? "github" : "local" }),
        state: "read-only",
        reason: error.rateLimited ? "rate-limited" : "unreadable",
        error: String(error.message || error).slice(0, 300),
        readAt: iso(ctx.now()),
      });
      // A rate limit has its own single row (github-rate.mjs).
      if (!error.rateLimited)
        notify.push({
          channel: "failure",
          title: `Avoozl could not read who drives ${specName(plan)}`,
          text: `${error.message} The spec reads only on this machine until the next tick reads it.`,
        });
    }
  }
  return { notify };
}

// Every leaf task of the spec is complete (R116.4).
function landedInFull(store, planId) {
  const data = store.read(),
    complete = (status) => statusComplete(data, status),
    leaves = planTasks(data, planId).filter(
      (task) => taskKind(task) === "leaf" && task.status !== "superseded",
    );
  return (
    leaves.length > 0 &&
    leaves.every((task) => completionReached(task, null, complete))
  );
}

// Close a fully landed spec's issue as completed, once: the next read sees
// it closed. A failed close leaves the driver as it was, tries again next
// tick, and says why once per distinct error.
async function closeLanded(store, github, plan, { issue, config }) {
  try {
    await asJob("spec-issues", github).updateIssue(config, issue.number, {
      state: "closed",
      state_reason: "completed",
    });
    return [];
  } catch (error) {
    const row = store.get(TABLE, plan.id),
      text = `Every task of ${specName(plan)} landed, but closing spec issue #${issue.number} failed: ${error.message}`;
    if (row.closeError === text) return [];
    putRow(store, { ...row, closeError: text });
    return [
      {
        channel: "failure",
        title: `Avoozl could not close the spec issue for ${specName(plan)}`,
        text,
      },
    ];
  }
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

// Words for why a spec reads only here, shown in the banner and errors.
function reasonText(row) {
  switch (row.reason) {
    case "driver":
      return "This workspace drives it.";
    case "not-shared":
      return "Not shared: it has no spec issue, so other machines cannot see who drives it. Make the GitHub issues to share it.";
    case "other-person":
      return `Taken by ${row.assignees?.[0]}: its spec issue is assigned to them.`;
    case "no-assignee":
      return "Nobody drives it. Assign someone on its spec issue on GitHub.";
    case "several":
      return `Its spec issue has several assignees: ${(row.assignees || []).join(", ")}. Remove all but one on GitHub.`;
    case "rate-limited":
      return "GitHub's rate limit held this read back. It reads again once the limit resets.";
    case "unreadable":
      return `Avoozl could not read its spec issue: ${row.error || "unknown error"}.`;
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
          }
        : { driver: { label: row.label ?? null, machine: row.machine } }),
      decision: row.decision?.state === "open" ? row.decision : null,
    };
  });
  return {
    enabled: true,
    machine: { id: settings.machine, label: settings.label },
    readOnly: specs.filter((spec) => spec.state !== "driver").length,
    specs,
  };
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
        title: `${row.id} has several assignees`,
        detail: row.decision.text,
        link: row.url ?? null,
        openedAt: row.decision.openedAt,
      });
  }
  return items;
}
