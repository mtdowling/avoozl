// The head of an epic's integration branch (RC16.3, RC16.5, RC16.7, design
// D21). Four records stay apart (AGENTS.md): plan approval, implementation (the
// task pull requests), integration (a task's merge into the branch) and
// whole-head acceptance. This module keeps the last: the tick reads the
// branch head's check runs and records an acceptance row that names the head.
// A task merge moves the head and so leaves acceptance open until the new head
// is green. It also stops the line for the epic while the head is red or the
// sync has a conflict, and asks one person to land the branch. Avoozl never
// merges the branch into the default branch: no code path here writes to it.
import { checksOf, green } from "./radar-merge.mjs";
import { ruleBranch } from "./github-branch-rules.mjs";
import { openStops } from "./flow.mjs";
import { queueNotifications } from "./notifications.mjs";
import { statusComplete } from "../model.mjs";
import { fail } from "./store.mjs";

const META = "integrationHeads";
const SYNC = "integrationSync";
const keyOf = (repository, branch) => `${repository}@${branch}`;
const SHA = /^[0-9a-f]{40}$/;

const read = (store) => store.getMeta(META) ?? { entries: {}, landing: {} };

// Check state of one head: red when a finished check failed, green when every
// check passed and each required one ran, else pending.
export function headState(checks, required) {
  if (checks.some((check) => check.done && !check.ok)) return "red";
  return green(checks, required) ? "green" : "pending";
}

// Opens or closes the stop that holds the epic's line. One stop per branch.
function holdLine(store, target, plan, reason, now) {
  const key = keyOf(target.repository, target.branch),
    open = openStops(store).find((stop) => stop.branch === key);
  if (!reason) {
    if (open)
      store.put("flow_stops", {
        ...open,
        closedAt: new Date(now).toISOString(),
        resumedBy: {
          by: "integration branch",
          at: new Date(now).toISOString(),
        },
      });
    return;
  }
  if (open) {
    if (open.reason !== reason) store.put("flow_stops", { ...open, reason });
    return;
  }
  const at = new Date(now).toISOString();
  store.put("flow_stops", {
    id: `stop:branch:${key}:${at}`,
    manual: true,
    by: { kind: "app", name: "integration branch" },
    reason,
    scope: "spec",
    projectId: null,
    planId: plan.id,
    spec: plan.spec || null,
    taskId: null,
    check: null,
    culprit: null,
    fixTaskId: null,
    openedAt: at,
    closedAt: null,
    runAnyway: null,
    branch: key,
  });
  queueNotifications(store, [
    {
      channel: "failure",
      title: `Line stopped for ${target.branch}: ${reason}`,
      text: `No release and no auto-merge for ${plan.spec || plan.id} until this clears. Running chats keep going.`,
      resume:
        "It clears by itself when the branch is healthy, or press Resume.",
    },
  ]);
}

// The tick step: per epic with a branch, read the head and its checks, record
// acceptance for a green head, and hold or release the line. A read failure
// keeps the last entry and says so; it changes no stop.
export async function headStep(
  store,
  github,
  targets,
  { policy, now = Date.now() } = {},
) {
  const errors = [],
    state = read(store),
    next = { entries: {}, landing: state.landing },
    syncs = store.getMeta(SYNC)?.entries ?? {},
    data = store.read(),
    plans = store.list("plans");
  for (const target of targets) {
    const key = keyOf(target.repository, target.branch),
      before = state.entries[key],
      plan = plans.find(
        (entry) => entry.spec === target.spec && !entry.deletedAt,
      );
    if (!plan || !github) continue;
    next.entries[key] = before ?? {};
    try {
      const found = await github.branch(target.repository, target.branch),
        head = found?.commit?.sha;
      if (!SHA.test(head ?? ""))
        throw Error("the branch head could not be read");
      const settings = policy?.repositories?.[target.repository],
        base = await ruleBranch(github, target.repository, settings),
        [checks, compare] = await Promise.all([
          checksOf(github, target.repository, head),
          github.compareCommits(target.repository, target.branch, base),
        ]),
        checkState = headState(checks, settings?.requiredChecks || []),
        own = data.tasks.filter((task) => task.planId === plan.id),
        merged = own.filter((task) => statusComplete(data, task.status)).length;
      // Acceptance names the head it covers. A task merge never sets it.
      let acceptance = before?.acceptance ?? null;
      if (checkState === "green" && acceptance?.head !== head)
        acceptance = { head, at: new Date(now).toISOString() };
      next.entries[key] = {
        head,
        base,
        behind: Number(compare?.ahead_by) || 0,
        checks: checkState,
        tasksMerged: merged,
        tasksTotal: own.length,
        readAt: now,
        acceptance,
      };
      const synced = syncs[key];
      holdLine(
        store,
        target,
        plan,
        checkState === "red"
          ? `${target.branch} has a red check on its head ${head.slice(0, 7)}.`
          : synced?.state === "conflict"
            ? `${target.branch} could not take ${synced.base}: the sync has a conflict.`
            : null,
        now,
      );
    } catch (error) {
      next.entries[key] = {
        ...(before ?? {}),
        error: error.message,
        readAt: now,
      };
      errors.push(`${key}: GitHub could not be read: ${error.message}`);
    }
  }
  store.setMeta(META, next);
  return { errors };
}

const accepted = (entry) => entry?.acceptance?.head === entry?.head;

// One row per epic with a branch, for Trace, In flight and Progress.
export function integrationView(store) {
  const { entries, landing } = read(store);
  return {
    branches: Object.entries(entries).map(([key, entry]) => {
      const [repository, branch] = [
        key.slice(0, key.indexOf("@")),
        key.slice(key.indexOf("@") + 1),
      ];
      return {
        key,
        repository,
        branch,
        head: entry.head ?? null,
        base: entry.base ?? null,
        behind: entry.behind ?? null,
        checks: entry.checks ?? null,
        tasksMerged: entry.tasksMerged ?? 0,
        tasksTotal: entry.tasksTotal ?? 0,
        accepted: accepted(entry),
        acceptedAt: entry.acceptance?.at ?? null,
        landing: landing[key] ?? null,
        error: entry.error ?? null,
        readAt: entry.readAt ?? null,
      };
    }),
  };
}

// Ready to land: the head is green and accepted, the branch has caught up with
// the default branch, and nobody has approved this head yet.
const ready = (entry, approval) =>
  entry.checks === "green" &&
  accepted(entry) &&
  entry.behind === 0 &&
  approval?.head !== entry.head;

// The Needs you rows: one asks a person to land a ready head; once approved
// for this head, one says to merge it on GitHub.
export function landingNeedsYou(store) {
  const { entries, landing } = read(store);
  const items = [];
  for (const [key, entry] of Object.entries(entries)) {
    const approval = landing[key],
      [repository, branch] = [
        key.slice(0, key.indexOf("@")),
        key.slice(key.indexOf("@") + 1),
      ];
    if (ready(entry, approval))
      items.push({
        kind: "branch-landing",
        id: `branch-landing:${key}`,
        taskId: null,
        authority: "github",
        repository,
        branch,
        head: entry.head,
        link: `https://github.com/${repository}/compare/${entry.base}...${branch}`,
        title: `${branch} is ready to land in ${entry.base}`,
        detail: `Its head ${entry.head.slice(0, 7)} is green and the branch has caught up with ${entry.base}. Approve this head, then merge it on GitHub yourself. Avoozl never merges the branch.`,
        openedAt: entry.acceptance.at,
      });
    else if (approval?.head === entry.head)
      items.push({
        kind: "needs-human",
        reason: "approval",
        id: `branch-landing:${key}`,
        taskId: null,
        authority: "github",
        link: `https://github.com/${repository}/compare/${entry.base}...${branch}`,
        title: `${branch} is approved to land: merge it on GitHub`,
        detail: `${approval.approvedBy} approved head ${entry.head.slice(0, 7)}. Avoozl does not merge it.`,
        openedAt: approval.at,
      });
  }
  return items;
}

// A person approves landing one head. An older head is refused: the branch
// moved since the row was shown. This records who and which head and does
// nothing else; the merge into the default branch is a person's, on GitHub.
export function landBranch(store, input = {}, { by, now = Date.now() } = {}) {
  const key = keyOf(String(input.repository ?? ""), String(input.branch ?? "")),
    state = read(store),
    entry = state.entries[key];
  if (!entry?.head) fail("That integration branch has not been read yet.", 404);
  if (input.head !== entry.head)
    fail(
      `The branch head is now ${entry.head.slice(0, 7)}, not ${String(input.head ?? "").slice(0, 7)}. Review it again.`,
      409,
    );
  if (!ready(entry, state.landing[key]))
    fail(
      entry.checks !== "green" || !accepted(entry)
        ? "The head is not green and accepted yet."
        : entry.behind !== 0
          ? `The branch is ${entry.behind} commits behind ${entry.base}.`
          : "This head is already approved.",
      409,
    );
  const record = {
    head: entry.head,
    approvedBy: by,
    at: new Date(now).toISOString(),
  };
  store.setMeta(META, {
    ...state,
    landing: { ...state.landing, [key]: record },
  });
  return { repository: input.repository, branch: input.branch, ...record };
}
