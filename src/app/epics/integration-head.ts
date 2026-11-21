// The head of an epic's integration branch (RC16.3, RC16.5, RC16.7, design
// D21). Four records stay apart (AGENTS.md): plan approval, implementation (the
// task pull requests), integration (a task's merge into the branch) and
// whole-head acceptance. This module keeps the last: the tick reads the
// branch head's check runs and records an acceptance row that names the head.
// A task merge moves the head and so leaves acceptance open until the new head
// is green. It also stops the line for the epic while the head is red or the
// sync has a conflict, and asks one person to land the branch. Avoozl never
// merges the branch into the default branch: no code path here writes to it.
import { checksOf, green } from "../delivery/check-reads.ts";
import type { CheckReader, HeadCheck } from "../delivery/check-reads.ts";
import { ruleBranch } from "../github/github-branch-rules.ts";
import type { RulesReader } from "../github/github-branch-rules.ts";
import { openStops, putStop } from "../flow/flow.ts";
import { queueNotifications } from "../tick/notifications.ts";
import { statusComplete } from "../../model.ts";
import { branchChecks, stageResults } from "../plugins/check-stages.ts";
import { fail, type Store } from "../store/store.ts";
import type { SyncTarget } from "./integration-sync.ts";

const META = "integrationHeads";
const SYNC = "integrationSync";
const keyOf = (repository: string, branch: string) => `${repository}@${branch}`;
const SHA = /^[0-9a-f]{40}$/;

// What the last read of one branch head found.
type HeadEntry = {
  head?: string;
  base?: string;
  behind?: number;
  checks?: "red" | "green" | "pending";
  tasksMerged?: number;
  tasksTotal?: number;
  readAt?: number;
  acceptance?: { head: string; at: string } | null;
  error?: string;
};
// A person's approval to land one head.
type Landing = { head: string; approvedBy: unknown; at: string };
type HeadMeta = {
  entries: Record<string, HeadEntry>;
  landing: Record<string, Landing>;
};
type Plan = { id: string; spec?: string; deletedAt?: string };
type Check = HeadCheck & { [key: string]: unknown };
// The GitHub reads a head step makes (with checksOf's and ruleBranch's).
type HeadGitHub = CheckReader &
  Pick<RulesReader, "repository"> & {
    branch(
      repository: string,
      branch: string,
    ): Promise<{ commit?: { sha?: string } } | null>;
    compareCommits(
      repository: string,
      base: string,
      head: string,
    ): Promise<{ ahead_by?: unknown } | null>;
  };
type Policy = {
  repositories?: Record<
    string,
    { requiredChecks?: string[]; baseBranch?: string | null }
  >;
} | null;

const read = (store: Store): HeadMeta =>
  store.getMeta<HeadMeta>(META) ?? { entries: {}, landing: {} };

// Check state of one head: red when a finished check failed, green when every
// check passed and each required one ran, else pending.
function headState(checks: Check[], required: string[]) {
  if (checks.some((check) => check.done && !check.ok)) return "red";
  return green(checks, required) ? "green" : "pending";
}

// Opens or closes the stop that holds the epic's line. One stop per branch.
function holdLine(
  store: Store,
  target: SyncTarget,
  plan: Plan,
  reason: string | null,
  now: number,
) {
  const key = keyOf(target.repository, target.branch),
    open = openStops(store).find(
      (stop: { branch?: string }) => stop.branch === key,
    );
  if (!reason) {
    if (open)
      putStop(store, {
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
    if (open.reason !== reason) putStop(store, { ...open, reason });
    return;
  }
  const at = new Date(now).toISOString();
  putStop(store, {
    id: `stop:branch:${key}:${at}`,
    manual: true,
    by: { kind: "app", name: "integration branch" },
    reason,
    scope: "spec",
    repositoryId: null,
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
      text: `No release and no merge for ${plan.spec || plan.id} until this clears. Running chats keep going.`,
      resume:
        "It clears by itself when the branch is healthy, or press Resume.",
    },
  ]);
}

// The tick step: per epic with a branch, read the head and its checks, record
// acceptance for a green head, and hold or release the line. A read failure
// keeps the last entry and says so; it changes no stop.
export async function headStep(
  store: Store,
  github: HeadGitHub | null,
  targets: SyncTarget[],
  { policy, now = Date.now() }: { policy?: Policy; now?: number } = {},
) {
  const errors: string[] = [],
    state = read(store),
    next: HeadMeta = { entries: {}, landing: state.landing },
    syncs =
      store.getMeta<{
        entries?: Record<string, { state?: string; base?: string }>;
      }>(SYNC)?.entries ?? {},
    data = store.read(),
    plans = store.list<Plan>("plans");
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
      if (!head || !SHA.test(head))
        throw Error("the branch head could not be read");
      const settings = policy?.repositories?.[target.repository],
        base = await ruleBranch(github, target.repository, settings);
      if (!base) throw Error("the default branch could not be read");
      const [remote, compare] = await Promise.all([
          checksOf(github, target.repository, head),
          github.compareCommits(target.repository, target.branch, base),
        ]),
        own = data.tasks.filter((task) => task.planId === plan.id),
        // The head's branch-stage plugin checks, run here and never posted
        // (plugin-checks D7, D8): pending until their run finishes.
        checks: Check[] = [
          ...remote,
          ...branchChecks(store, {
            github: target.repository,
            branch: target.branch,
            head,
            tasks: own.map((task) => task.id),
            now,
          }),
        ],
        checkState = headState(checks, settings?.requiredChecks || []),
        merged = own.filter((task) => statusComplete(data, task.status)).length;
      // Acceptance names the head it covers. A task merge never sets it.
      let acceptance: HeadEntry["acceptance"] = before?.acceptance ?? null;
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
    } catch (thrown) {
      const error = thrown as Error;
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

const accepted = (entry: HeadEntry | undefined) =>
  entry?.acceptance?.head === entry?.head;

// One row per epic with a branch, for Trace, In flight and Progress.
export function integrationView(store: Store) {
  const { entries, landing } = read(store),
    stages = stageResults(store);
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
        // Its branch-stage plugin checks on this machine (plugin-checks D10).
        pluginChecks: stages.branches[key] ?? null,
      };
    }),
  };
}

// Ready to land: the head is green and accepted, the branch has caught up with
// the default branch, and nobody has approved this head yet.
const ready = (entry: HeadEntry, approval: Landing | undefined) =>
  entry.checks === "green" &&
  accepted(entry) &&
  entry.behind === 0 &&
  approval?.head !== entry.head;

// The Needs you rows: one asks a person to land a ready head; once approved
// for this head, one says to merge it on GitHub.
export function landingNeedsYou(store: Store) {
  const { entries, landing } = read(store);
  const items: Record<string, unknown>[] = [];
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
        detail: `Its head ${String(entry.head).slice(0, 7)} is green and the branch has caught up with ${entry.base}. Approve this head, then merge it on GitHub yourself. Avoozl never merges the branch.`,
        openedAt: entry.acceptance?.at,
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
        detail: `${approval.approvedBy} approved head ${String(entry.head).slice(0, 7)}. Avoozl does not merge it.`,
        openedAt: approval.at,
      });
  }
  return items;
}

// A person approves landing one head. An older head is refused: the branch
// moved since the row was shown. This records who and which head and does
// nothing else; the merge into the default branch is a person's, on GitHub.
export function landBranch(
  store: Store,
  input: { repository?: unknown; branch?: unknown; head?: unknown } = {},
  { by, now = Date.now() }: { by?: unknown; now?: number } = {},
) {
  const key = keyOf(String(input.repository ?? ""), String(input.branch ?? "")),
    state = read(store),
    entry = state.entries[key];
  if (!entry?.head)
    return fail("That integration branch has not been read yet.", 404);
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
  const record: Landing = {
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
