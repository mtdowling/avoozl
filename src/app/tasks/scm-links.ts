// One link set per spec and per task, from stored records only
// (Requirement 92.1-92.3, design §4.27, task 44.1).
//
// - A pure read model: its only input is the local store. It takes no
//   GitHub client and makes no call, so showing, filtering or refreshing
//   link sets costs nothing on GitHub.
// - Sources: the spec issue and journal receipts (56.2), the spec working
//   branch a task was prepared from (56.3, 41.5), the task branch and
//   worktree (40.4), the task pull request and its check state from the
//   landing queue (41.2, 42.6), the landed commit from delivery records,
//   and the labeled and escalation issues a spec or task came from (56.8,
//   56.14).
// - A URL is built only from a validated owner/name, number, branch name
//   or 40-character SHA, never from a URL stored from issue or comment
//   content. A field that fails validation counts as missing.
// - A missing record is null (a list is empty): the views show "none".
// - Check state carries the head SHA it was read for and its read time. It
//   is `current` only when that head is the task's current commit; any
//   other head shows as "stale", never as its old state.
import { branchNameProblem } from "../epics/integration-branch.ts";
import type { Store } from "../store/store.ts";
import type { Snapshot, Task } from "../../types.ts";

// The stored rows a link set reads. Every field is checked before use.
interface IssueRecord {
  repository?: unknown;
  number?: unknown;
}
interface WorktreeRow {
  id: string;
  taskId?: string;
  repository?: string;
  branch?: unknown;
  path?: unknown;
  base?: { branch?: unknown; kind?: unknown };
}
interface DeliveryRow {
  id: string;
  taskId?: string;
  pr?: unknown;
  state?: string;
  commit?: unknown;
  integratedCommit?: unknown;
}
interface LandingRow {
  id: string;
  seq?: number;
  tasks?: (string | { task?: string })[];
  commit?: unknown;
  checks?: unknown;
  finishedAt?: string;
  pr?: unknown;
  state?: string;
  repositoryId?: string;
  source?: { repository?: unknown; branch?: unknown };
}
interface ReceiptRow extends IssueRecord {
  id: string;
  kind?: string;
  planId?: string;
}
interface PlanRow {
  id: string;
  spec?: string;
  deletedAt?: string;
  context?: { newPlan?: { source?: IssueRecord } };
}
type Rows = ReturnType<typeof records>;
type Links = ReturnType<typeof linker>;
type TaskSet = ReturnType<typeof taskSet>;
type Link = { kind: string; repository: string; [key: string]: unknown };

const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;
const HOST = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/;
const DEFAULT_HOST = "https://github.com";

const lower = (value: unknown) => String(value ?? "").toLowerCase();

function listOr<T>(store: Store, table: string): T[] {
  try {
    return store.list<T>(table);
  } catch {
    return [];
  }
}

const repositoryOf = (value: unknown) =>
  typeof value === "string" &&
  REPOSITORY.test(value) &&
  !value.split("/").some((part) => part === "." || part === "..")
    ? value
    : null;
const numberOf = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
const shaOf = (value: unknown) =>
  typeof value === "string" && SHA.test(value) ? value : null;
// branchNameProblem refuses anything but a string.
const refOf = (value: unknown) =>
  branchNameProblem(value) ? null : (value as string);
const ms = (value: string | null | undefined) => {
  const at = Date.parse(value ?? "");
  return Number.isFinite(at) ? at : null;
};

// The GitHub repository a repository ID or an owner/name names, or null.
function resolver(store: Store) {
  const repositories = new Map(
    listOr<{ id: string; github?: unknown }>(store, "repositories").map((p) => [
      p.id,
      p,
    ]),
  );
  return (value: unknown) =>
    repositoryOf(repositories.get(value as string)?.github) ??
    repositoryOf(value);
}

function linker(host: string | null | undefined) {
  const base = host && HOST.test(host) ? host : DEFAULT_HOST;
  return {
    issue: (repository: string, number: number) => ({
      kind: "issue",
      repository,
      number,
      url: `${base}/${repository}/issues/${number}`,
    }),
    pull: (repository: string, number: number) => ({
      kind: "pull",
      repository,
      number,
      url: `${base}/${repository}/pull/${number}`,
    }),
    branch: (repository: string, ref: string) => ({
      kind: "branch",
      repository,
      ref,
      url: `${base}/${repository}/tree/${ref.split("/").map(encodeURIComponent).join("/")}`,
    }),
    commit: (repository: string, sha: string) => ({
      kind: "commit",
      repository,
      sha,
      url: `${base}/${repository}/commit/${sha}`,
    }),
    checks: (repository: string, number: number) =>
      number ? `${base}/${repository}/pull/${number}/checks` : null,
  };
}

// An {repository, number} record as an issue link, or null.
function issueLink(
  links: Links,
  record: IssueRecord | null | undefined,
  resolve: (value: unknown) => string | null,
) {
  const repository = resolve(record?.repository),
    number = numberOf(record?.number);
  return repository && number ? links.issue(repository, number) : null;
}

// Stored rows the link sets read, read once per call. A caller that has
// already read the workspace passes it as `data`.
function records(store: Store, data: Snapshot = store.read()) {
  return {
    data,
    resolve: resolver(store),
    receipts: listOr<ReceiptRow>(store, "receipts"),
    worktrees: new Map(
      listOr<WorktreeRow>(store, "task_worktrees").map((row) => [
        row.taskId ?? row.id,
        row,
      ]),
    ),
    deliveries: new Map(
      listOr<DeliveryRow>(store, "task_deliveries").map((row) => [
        row.taskId ?? row.id,
        row,
      ]),
    ),
    landing: listOr<LandingRow>(store, "landing_queue"),
  };
}

const landingTasks = (entry: LandingRow) =>
  (entry.tasks || []).map((t) => (typeof t === "string" ? t : t?.task));

// The newest landing queue entry that carries this task.
function landingOf(rows: Rows, taskId: string) {
  return (
    rows.landing
      .filter((entry) => landingTasks(entry).includes(taskId))
      .sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))[0] ?? null
  );
}

function verdict(conclusions: string[]) {
  if (!conclusions.length) return null;
  if (conclusions.some((c) => c === "fail")) return "fail";
  if (conclusions.some((c) => c === "pending")) return "pending";
  return "pass";
}

// Check state the landing queue recorded when a portion finished.
function landingChecks(entry: LandingRow | null) {
  const head = shaOf(entry?.commit);
  if (!head || !entry || !Array.isArray(entry.checks) || !entry.finishedAt)
    return null;
  const state = verdict(
    entry.checks.map((check) => (check?.exitCode === 0 ? "pass" : "fail")),
  );
  return state
    ? { state, head, readAt: entry.finishedAt, source: "landing" }
    : null;
}

// The landing queue's check read, with its age and whether it is for the
// task's current commit.
function checkState(
  found: ReturnType<typeof landingChecks>,
  currentHead: string | null,
  now: number,
) {
  if (!found) return null;
  const read = ms(found.readAt),
    current = Boolean(currentHead) && found.head === currentHead;
  return {
    ...found,
    ageMs: read === null ? null : Math.max(0, now - read),
    current,
    // What a check dot shows: the state only for the current head.
    dot: current ? found.state : "stale",
  };
}

// The pull request a task has, by number from delivery, integration or the
// landing queue.
function pullOf(
  task: Task,
  delivery: DeliveryRow | null,
  entry: LandingRow | null,
  repository: string | null,
) {
  const n =
    numberOf(delivery?.pr) ??
    numberOf(task.integration?.pr) ??
    numberOf(entry?.pr) ??
    null;
  if (!n || !repository) return null;
  const merged =
    entry?.state === "landed" ||
    (delivery?.state === "integrated" && numberOf(delivery?.pr) === n);
  return {
    number: n,
    repository,
    state: merged ? "merged" : entry?.state === "queued" ? "open" : "unknown",
  };
}

function taskSet(rows: Rows, links: Links, task: Task, now: number) {
  const worktree = rows.worktrees.get(task.id) ?? null,
    delivery = rows.deliveries.get(task.id) ?? null,
    entry = landingOf(rows, task.id),
    repository =
      rows.resolve(worktree?.repository) ??
      rows.resolve(entry?.repositoryId) ??
      rows.resolve(task.repository) ??
      null,
    branchRef = refOf(worktree?.branch),
    currentHead = shaOf(delivery?.commit),
    pull = pullOf(task, delivery, entry, repository),
    landedSha =
      (delivery?.state === "integrated" && shaOf(delivery.integratedCommit)) ||
      shaOf(task.integration?.commit) ||
      null,
    checks = checkState(landingChecks(entry), currentHead, now);
  return {
    task: task.id,
    planId: task.planId ?? null,
    repository,
    branch:
      repositoryOf(entry?.source?.repository) && refOf(entry?.source?.branch)
        ? links.branch(
            entry!.source!.repository as string,
            entry!.source!.branch as string,
          )
        : repository && branchRef
          ? links.branch(repository, branchRef)
          : null,
    // Local only: shown as text in the app, never a link or a GitHub write.
    worktree:
      typeof worktree?.path === "string" && worktree.path
        ? { kind: "worktree", path: worktree.path, local: true }
        : null,
    base:
      repository &&
      refOf(worktree?.base?.branch) &&
      typeof worktree!.base!.kind === "string"
        ? {
            ...links.branch(repository, worktree!.base!.branch as string),
            baseKind: worktree!.base!.kind,
          }
        : null,
    head: currentHead,
    pr: pull
      ? { ...links.pull(pull.repository, pull.number), state: pull.state }
      : null,
    checks: checks
      ? {
          ...checks,
          url: pull ? links.checks(pull.repository, pull.number) : null,
        }
      : null,
    landed:
      landedSha && (repository || pull?.repository)
        ? links.commit((repository || pull?.repository)!, landedSha)
        : null,
    issue: issueLink(links, task.github, rows.resolve) ?? null,
    source: issueLink(links, task.labeledIssue, rows.resolve) ?? null,
  };
}

const unique = <T extends Link>(items: (T | null)[]) => {
  const seen = new Set<string>();
  return items.filter((item): item is T => {
    const key =
      item &&
      `${lower(item.repository)}\0${item.kind}\0${item.number ?? item.ref ?? item.sha}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function specSet(rows: Rows, links: Links, plan: PlanRow, tasks: TaskSet[]) {
  const receipt = rows.receipts.find(
      (r) => r.id === `github-parent:plan:${plan.id}`,
    ),
    issue = issueLink(links, receipt, rows.resolve);
  return {
    planId: plan.id,
    spec: plan.spec ?? null,
    issue,
    workingBranches: unique(
      tasks
        .map((t) => t.base)
        .filter(
          (b): b is NonNullable<TaskSet["base"]> => b?.baseKind === "working",
        )
        .map(({ baseKind, ...branch }) => branch),
    ),
    pulls: tasks
      .filter((t) => t.pr && t.pr.state === "open")
      .map((t) => ({ ...t.pr, task: t.task, checks: t.checks })),
    sources: unique([
      issueLink(links, plan.context?.newPlan?.source, rows.resolve),
      ...rows.receipts
        .filter((r) => r.kind === "radar-source" && r.planId === plan.id)
        .map((r) => issueLink(links, r, rows.resolve)),
      ...tasks.map((t) => t.source),
    ]),
  };
}

// Every spec's and every task's link set: {specs: {planId: set}, tasks:
// {taskId: set}}. `host` is the registered web host; `now` sets check ages;
// `data` is an already-read workspace, so the caller's read is reused.
export interface LinkOptions {
  host?: string;
  now?: number;
  data?: Snapshot;
}

export function linkSets(
  store: Store,
  { host = DEFAULT_HOST, now = Date.now(), data }: LinkOptions = {},
) {
  const rows = records(store, data),
    links = linker(host),
    tasks: Record<string, TaskSet> = {};
  for (const task of rows.data.tasks)
    tasks[task.id] = taskSet(rows, links, task, now);
  const specs: Record<string, ReturnType<typeof specSet>> = {};
  for (const plan of listOr<PlanRow>(store, "plans")) {
    if (plan.deletedAt || !plan.spec) continue;
    const members = Object.values(tasks).filter((t) => t.planId === plan.id);
    specs[plan.id] = specSet(rows, links, plan, members);
  }
  return { specs, tasks };
}

// One task's link set, or null for an unknown task.
export function taskLinks(
  store: Store,
  taskId: string,
  options: LinkOptions = {},
) {
  return linkSets(store, options).tasks[taskId] ?? null;
}

// One spec plan's link set, or null for an unknown or non-spec plan.
export function specLinks(
  store: Store,
  planId: string,
  options: LinkOptions = {},
) {
  return linkSets(store, options).specs[planId] ?? null;
}
