// Steady CI waste (design §4.30, Requirement 100). The retro's outlier CI
// trigger misses a cost every pull request pays, because that cost is the
// median. This counts what each pull request changed, repeat runs of one
// workflow on one commit, and CI time against fixed limits, over every pull
// request in the workspace's repositories, not only Avoozl tasks.
//
// Reads: the open pull request read the other steps already make (shared
// through the client's cache) and at most one workflow runs read per
// repository per check. Writes: `pr_ci` and `ci_runs` rows.
import { CI_CLASSES, flowPolicy, listOr } from "./flow.mjs";
import { globToRegex } from "../mirror/forward-guard.mjs";
import { loadLayeredConfig } from "../settings/layered-config.mjs";
import {
  migrateReceiptMeta,
  pruneReceipts,
  readReceipts,
} from "./build-receipt-read.mjs";

export const PR_CI = "pr_ci";
export const CI_RUNS = "ci_runs";
export const CI_METRIC = "CI minutes per pull request";
export const BUILD_METRIC = "Build minutes per pull request";
const DAY_MS = 86_400_000;
const KEEP_MS = 90 * DAY_MS;
const ERRORS_META = "flow.ci.errors";
const CONFIG_META = "flow.ci.config";
// A path takes the first class that matches, in this order; none is code.
const MATCH_ORDER = ["ci", "spec", "tests", "docs", "other"];
// A pull request's one class for grouping: its first present, in this order.
const GROUP_ORDER = ["code", "tests", "ci", "other", "spec", "docs"];
export const CLASS_GLOBS = Object.freeze({
  ci: [".github/", ".gitlab-ci.yml", ".circleci/"],
  spec: [".kiro/specs/"],
  tests: [
    "test/",
    "tests/",
    "**/test/**",
    "**/tests/**",
    "**/*.test.*",
    "**/*_test.*",
  ],
  docs: ["docs/", "*.md", "**/*.md", "*.txt", "LICENSE"],
  other: [
    "package-lock.json",
    "**/package-lock.json",
    "*.lock",
    ".gitignore",
    ".editorconfig",
  ],
});

const lower = (value) => String(value || "").toLowerCase();
const ms = (iso) => (iso ? Date.parse(iso) : NaN);
const minutes = (value) => Math.round((value || 0) / 6000) / 10;

// The globs of each class: the defaults, with `flow.ci.classes` replacing a
// class's list (R100.1).
export function classGlobs(overrides = {}) {
  return Object.fromEntries(
    MATCH_ORDER.map((name) => [
      name,
      (overrides?.[name] ?? CLASS_GLOBS[name]).map(globToRegex),
    ]),
  );
}

// The classes of a pull request's changed paths, in CI_CLASSES order. When
// GitHub listed only part of the files the pull request is code too.
export function fileClasses(paths, globs = classGlobs(), partial = false) {
  const found = new Set(partial ? ["code"] : []);
  for (const path of paths)
    found.add(
      MATCH_ORDER.find((name) => globs[name].some((re) => re.test(path))) ||
        "code",
    );
  return CI_CLASSES.filter((name) => found.has(name));
}

export const docsOnly = (classes) =>
  classes.length > 0 &&
  classes.every((name) => name === "spec" || name === "docs");
const groupClass = (classes) =>
  GROUP_ORDER.find((name) => classes.includes(name)) || "code";

// The workspace's GitHub repositories: those `github.repositories` names.
// None in local mode, so no read is made (R100.8).
export function ciRepositories(policy) {
  if (!policy?.mode) return [];
  return Object.keys(policy.repositories || {});
}

// The flow settings for one GitHub repository: its repository's override when
// a registered repository names one.
export function ciSettings(store, config, repository) {
  const id =
    listOr(store, "repositories").find(
      (entry) => lower(entry.github) === lower(repository),
    )?.id ??
    listOr(store, "github_repositories").find(
      (entry) => lower(entry.id) === lower(repository),
    )?.repositoryId;
  return flowPolicy(config || {}).for(id || repository).ci;
}

function flowConfig(config) {
  const checked = flowPolicy(config || {}).set,
    report = config?.receipts?.report;
  return {
    // The place build reports are kept (§4.31), validated on load.
    ...(report ? { receipts: { report } } : {}),
    flow: checked.workspace,
    repositories: Object.fromEntries(
      Object.entries(checked.repositories).map(([id, flow]) => [id, { flow }]),
    ),
  };
}

// Only validated Flow settings are retained; paths, credentials and unrelated
// configuration never enter this last-valid CI snapshot.
export function lastEffectiveCIConfig(store, fallback = {}) {
  return store.getMeta(CONFIG_META) ?? flowConfig(fallback);
}

export function readEffectiveCIConfig(
  store,
  { workspaceRoot, fallback = {}, persist = false } = {},
) {
  if (!workspaceRoot) return lastEffectiveCIConfig(store, fallback);
  try {
    const config = flowConfig(loadLayeredConfig({ workspaceRoot }).config);
    if (persist && !store.readOnly && !same(store.getMeta(CONFIG_META), config))
      store.setMeta(CONFIG_META, config);
    return config;
  } catch {
    return lastEffectiveCIConfig(store, fallback);
  }
}

function pruneCIHistory(store, { now = Date.now() } = {}) {
  const cut = now - KEEP_MS;
  return store.transaction(() => {
    let removed = 0;
    for (const row of listOr(store, PR_CI))
      if (row.closedAt && ms(row.closedAt) < cut) {
        store.remove(PR_CI, row.id);
        removed++;
      }
    for (const row of listOr(store, CI_RUNS))
      if (ms(row.startedAt) < cut) {
        store.remove(CI_RUNS, row.id);
        removed++;
      }
    return removed + pruneReceipts(store, cut);
  });
}

// Window starts are aligned to whole windows since the epoch, so each
// trigger fires at most once a window (§4.30).
function windowStart(now, days) {
  const size = days * DAY_MS;
  return Math.floor(now / size) * size;
}

// The task an open pull request delivers: the task whose worktree branch is
// its head, or an issue it closes that a task tracks. Null for a pull
// request no task owns.
function taskOf(store, data, repository, pull) {
  const worktree = listOr(store, "task_worktrees").find(
    (row) => row.branch && row.branch === pull.headRefName,
  );
  if (worktree) return worktree.taskId;
  for (const ref of pull.closingIssuesReferences?.nodes || []) {
    const where = ref.repository?.nameWithOwner || repository,
      task = data.tasks.find(
        (t) =>
          t.github?.number === ref.number &&
          lower(t.github?.repository) === lower(where),
      );
    if (task) return task.id;
  }
  return null;
}

// Check run times on a pull request's head commit, by workflow run id.
function checkTimes(pull) {
  const rollup = pull.commits?.nodes?.[0]?.commit?.statusCheckRollup,
    out = new Map();
  for (const check of rollup?.contexts?.nodes || []) {
    const id = check?.checkSuite?.workflowRun?.databaseId;
    if (!id) continue;
    const entry = out.get(id) || [];
    entry.push({ start: ms(check.startedAt), end: ms(check.completedAt) });
    out.set(id, entry);
  }
  return out;
}

// Merged span length of [start, end] pairs, so parallel runs count once.
function unionMs(spans) {
  let total = 0,
    end = -Infinity;
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    if (b <= end) continue;
    total += b - Math.max(a, end);
    end = b;
  }
  return total;
}

// The tick's CI read (R100.1, R100.2, R100.6): per repository, the open pull
// requests (the shared cached read) and one workflow runs read, then the
// pr_ci and ci_runs rows. Errors are per repository and returned.
export async function ciStep(
  store,
  github,
  { policy, config, now = Date.now() } = {},
) {
  pruneCIHistory(store, { now });
  migrateReceiptMeta(store);
  const repositories = ciRepositories(policy),
    errors = [];
  // A client without these reads (a fake, an old build) reads nothing.
  if (
    typeof github?.openPullRequests !== "function" ||
    typeof github?.workflowRuns !== "function" ||
    !repositories.length
  )
    return { errors, repositories: 0 };
  const data = store.read(),
    at = new Date(now).toISOString(),
    // The error last reported per repository: each is reported once.
    reported = { ...(store.getMeta(ERRORS_META) || {}) },
    before = JSON.stringify(reported);
  for (const repository of repositories) {
    const settings = ciSettings(store, config, repository),
      globs = classGlobs(settings.classes),
      since = new Date(
        windowStart(now, settings.windowDays) - settings.windowDays * DAY_MS,
      )
        .toISOString()
        .slice(0, 10);
    let pulls, recent, runs;
    try {
      pulls = await github.openPullRequests(repository);
      // The same query's closed pull requests; none from a client without it.
      recent =
        typeof github.recentPullRequests === "function"
          ? await github.recentPullRequests(repository)
          : [];
      runs = await github.workflowRuns(repository, since);
    } catch (error) {
      errors.push({ repository, error: error.message });
      continue;
    }
    delete reported[repository];
    store.transaction(() =>
      record(store, data, repository, {
        pulls,
        recent,
        runs,
        globs,
        at,
        now,
      }),
    );
    // Build receipts (§4.31): after the rows, so the runs are known. A failed
    // read keeps nothing and is tried again at the next check.
    if (policy?.repositories?.[repository]?.buildReceipts === true)
      await readReceipts(store, github, repository, {
        now,
        report: config?.receipts?.report ?? null,
        base: policy.repositories[repository].baseBranch ?? null,
      }).catch(() => {});
  }
  const fresh = errors.filter((e) => reported[e.repository] !== e.error);
  for (const e of errors) reported[e.repository] = e.error;
  if (JSON.stringify(reported) !== before) store.setMeta(ERRORS_META, reported);
  return { errors: fresh, repositories: repositories.length };
}

// A pull request's row from one read of it, open or closed.
function pullRow(store, data, repository, pull, { before, globs, at }) {
  const files = pull.files || { totalCount: 0, nodes: [] },
    paths = (files.nodes || []).map((node) => node.path),
    partial = (files.totalCount ?? paths.length) > paths.length,
    head = pull.headRefOid;
  return {
    id: `${lower(repository)}#${pull.number}`,
    repository,
    number: pull.number,
    taskId: taskOf(store, data, repository, pull),
    author: pull.author?.login || null,
    classes: fileClasses(paths, globs, partial),
    partial,
    branch: pull.headRefName || before?.branch || null,
    createdAt: pull.createdAt || before?.createdAt || at,
    firstSeen: before?.firstSeen || at,
    lastSeen: at,
    closedAt: null,
    // The head commit and merge time: the reader of build receipts (§4.31)
    // finds a merged pull request's artifacts by its head commit.
    headSha: head ?? before?.headSha ?? null,
    mergedAt: before?.mergedAt ?? null,
    // The commit the pull request landed as on the base branch: its CI there
    // is the one a task's `Built:` line names (R101.14).
    mergeCommit: before?.mergeCommit ?? null,
    heads: [...new Set([...(before?.heads || []), head].filter(Boolean))].slice(
      -50,
    ),
    runIds: before?.runIds || [],
  };
}

// The pull request a run belongs to by its branch: the newest one on that
// branch open when the run started.
function byBranch(rows, run) {
  if (!run.headBranch) return null;
  const start = ms(run.startedAt);
  let found = null;
  for (const row of rows.values())
    if (
      row.branch === run.headBranch &&
      !(start < ms(row.createdAt)) &&
      !(row.closedAt && start > ms(row.closedAt)) &&
      (!found || row.number > found.number)
    )
      found = row;
  return found?.number ?? null;
}

function record(
  store,
  data,
  repository,
  { pulls, recent = [], runs, globs, at, now },
) {
  const rows = new Map(
      listOr(store, PR_CI)
        .filter((row) => lower(row.repository) === lower(repository))
        .map((row) => [row.number, row]),
    ),
    timed = new Map(),
    open = new Set();
  for (const pull of pulls) {
    const times = checkTimes(pull),
      before = rows.get(pull.number),
      row = pullRow(store, data, repository, pull, { before, globs, at });
    row.runIds = [...new Set([...row.runIds, ...times.keys()])].slice(-200);
    for (const [id, entry] of times) timed.set(id, entry);
    rows.set(pull.number, row);
    open.add(pull.number);
  }
  // Closed pull requests from the same read: their exact close time, and a
  // row for one never seen open (opened and merged between two checks, or
  // before this workspace's first check). Kept only inside the 90 days.
  const cut = now - KEEP_MS;
  for (const pull of recent) {
    if (open.has(pull.number) || !(ms(pull.closedAt) >= cut)) continue;
    const before = rows.get(pull.number);
    if (
      before?.closedAt === pull.closedAt &&
      before.branch &&
      before.headSha !== undefined &&
      before.mergeCommit !== undefined
    )
      continue;
    const row = before
      ? { ...before, branch: before.branch || pull.headRefName || null }
      : pullRow(store, data, repository, pull, { before, globs, at });
    row.closedAt = pull.closedAt;
    row.headSha = pull.headRefOid ?? row.headSha ?? null;
    row.mergedAt = pull.mergedAt ?? null;
    row.mergeCommit = pull.mergeCommit?.oid ?? row.mergeCommit ?? null;
    rows.set(pull.number, row);
  }
  // A pull request no longer listed open, and not in the closed list,
  // closed at this check (late by up to one check interval).
  for (const row of rows.values())
    if (!open.has(row.number) && !row.closedAt) row.closedAt = at;
  const byHead = new Map(),
    byRun = new Map();
  for (const row of rows.values()) {
    for (const head of row.heads || []) byHead.set(head, row.number);
    for (const id of row.runIds || []) byRun.set(id, row.number);
  }
  const stored = new Map(
    listOr(store, CI_RUNS)
      .filter((run) => lower(run.repository) === lower(repository))
      .map((run) => [run.runId, run]),
  );
  for (const run of runs) {
    const before = stored.get(run.id),
      wall = ms(run.endedAt) - ms(run.startedAt),
      attemptStart = ms(run.startedAt),
      sameAttempt = before && (before.attempt ?? 1) === (run.attempt ?? 1),
      checks = timed
        .get(run.id)
        ?.filter(
          (check) =>
            !Number.isFinite(attemptStart) ||
            !Number.isFinite(check.start) ||
            check.start >= attemptStart,
        ),
      measured =
        checks?.length &&
        checks.every(
          (check) =>
            Number.isFinite(check.start) &&
            Number.isFinite(check.end) &&
            check.end >= check.start,
        ) &&
        (!before || sameAttempt || Number.isFinite(attemptStart)),
      // Check run times when the open pull request read saw them; else the
      // run's wall time, marked an estimate. Never downgrade a measured one.
      job = measured
        ? {
            jobMs: checks.reduce(
              (sum, check) => sum + check.end - check.start,
              0,
            ),
            estimate: false,
          }
        : sameAttempt && before.estimate === false
          ? { jobMs: before.jobMs, estimate: false }
          : Number.isFinite(wall) && wall >= 0
            ? { jobMs: wall, estimate: true }
            : { jobMs: null, estimate: true };
    stored.set(run.id, {
      id: `${lower(repository)}:${run.id}`,
      repository,
      runId: run.id,
      workflow: run.workflow,
      headSha: run.headSha,
      headBranch: run.headBranch ?? before?.headBranch ?? null,
      event: run.event,
      attempt: run.attempt,
      conclusion: run.conclusion ?? before?.conclusion ?? null,
      prNumber:
        run.pullRequests.find((n) => rows.has(n)) ??
        byRun.get(run.id) ??
        byHead.get(run.headSha) ??
        byBranch(rows, run) ??
        before?.prNumber ??
        null,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      ...job,
    });
  }
  for (const run of stored.values()) {
    const old = ms(run.startedAt) < cut;
    if (old) {
      store.remove(CI_RUNS, run.id);
      stored.delete(run.runId);
    } else if (!same(store.get(CI_RUNS, run.id), run)) store.put(CI_RUNS, run);
  }
  for (const row of rows.values()) {
    const mine = [...stored.values()].filter((r) => r.prNumber === row.number),
      spans = mine
        .map((r) => [ms(r.startedAt), ms(r.endedAt)])
        .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a);
    row.ciMs = mine.reduce((sum, r) => sum + (r.jobMs || 0), 0);
    row.waitMs = unionMs(spans);
    if (row.closedAt && ms(row.closedAt) < cut) store.remove(PR_CI, row.id);
    else if (!same(store.get(PR_CI, row.id), row)) store.put(PR_CI, row);
  }
}

// Equal but for `skip` keys, so an unchanged row is not written each tick.
function same(a, b) {
  if (!a) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

// ------------------------------------------------------------ facts

// One repository's CI facts over the window ending `now` (R100.3, R100.5).
export function ciFacts(store, config, repository, { now = Date.now() } = {}) {
  const settings = ciSettings(store, config, repository),
    from = now - settings.windowDays * DAY_MS,
    pulls = new Map(
      listOr(store, PR_CI)
        .filter((row) => lower(row.repository) === lower(repository))
        .map((row) => [row.number, row]),
    ),
    runs = listOr(store, CI_RUNS).filter(
      (run) =>
        lower(run.repository) === lower(repository) &&
        ms(run.startedAt) >= from &&
        ms(run.startedAt) <= now,
    ),
    byClass = {},
    seen = new Map();
  let docsOnlyMs = 0;
  for (const run of runs) {
    const pull = pulls.get(run.prNumber);
    if (!pull) continue;
    const name = groupClass(pull.classes),
      side = pull.taskId ? "task" : "other",
      entry = (byClass[name] ||= {
        task: { minutes: 0, pullRequests: 0 },
        other: { minutes: 0, pullRequests: 0 },
      });
    entry[side].minutes += (run.jobMs || 0) / 60_000;
    if (!seen.has(pull.number)) {
      seen.set(pull.number, pull);
      entry[side].pullRequests += 1;
    }
    if (docsOnly(pull.classes)) docsOnlyMs += run.jobMs || 0;
  }
  for (const entry of Object.values(byClass))
    for (const side of ["task", "other"])
      entry[side].minutes = Math.round(entry[side].minutes * 10) / 10;
  const closed = [...pulls.values()].filter(
      (row) =>
        row.closedAt && ms(row.closedAt) >= from && ms(row.closedAt) <= now,
    ),
    lead = closed.reduce(
      (sum, row) => sum + Math.max(0, ms(row.closedAt) - ms(row.createdAt)),
      0,
    ),
    wait = closed.reduce((sum, row) => sum + (row.waitMs || 0), 0);
  return {
    repository,
    settings,
    windowStart: windowStart(now, settings.windowDays),
    byClass,
    docsOnlyMs,
    closed: closed.length,
    waitShare: lead > 0 ? wait / lead : null,
    repeats: repeatRuns(runs),
    workflows: [...new Set(runs.map((run) => run.workflow))].sort(),
    pulls: [...seen.values()],
  };
}

// Two or more distinct run ids of one workflow on one head commit. The runs
// list holds one entry per run, its latest attempt, so a re-run is not
// another run (R100.2).
export function repeatRuns(runs) {
  const groups = new Map();
  for (const run of runs) {
    const key = `${run.workflow}\0${run.headSha}`;
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(run.runId, run);
  }
  const out = [];
  for (const group of groups.values()) {
    if (group.size < 2) continue;
    const list = [...group.values()].sort(
        (a, b) =>
          (a.startedAt < b.startedAt
            ? -1
            : a.startedAt > b.startedAt
              ? 1
              : 0) || a.runId - b.runId,
      ),
      extra = list.slice(1);
    out.push({
      repository: list[0].repository,
      workflow: list[0].workflow,
      commit: list[0].headSha,
      runs: list.length,
      events: [...new Set(list.map((run) => run.event))],
      extraMinutes: minutes(extra.reduce((s, r) => s + (r.jobMs || 0), 0)),
      startedAt: list[0].startedAt,
    });
  }
  return out
    .sort(
      (a, b) =>
        (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0) ||
        (a.commit < b.commit ? -1 : 1),
    )
    .map(({ startedAt: _startedAt, ...rest }) => rest);
}

// The steady waste triggers (R100.3), as [kind, key, detail].
export function ciTriggers(store, config, repositories, { now = Date.now() }) {
  const out = [];
  for (const repository of repositories) {
    const facts = ciFacts(store, config, repository, { now }),
      s = facts.settings,
      window = new Date(facts.windowStart).toISOString().slice(0, 10);
    if (facts.docsOnlyMs > s.docsOnlyMinutes * 60_000)
      out.push([
        "waste-docs",
        `waste:docs:${repository}:${window}`,
        `${repository}: ${minutes(facts.docsOnlyMs)} CI min on spec- or docs-only pull requests in ${s.windowDays} days (limit ${s.docsOnlyMinutes})`,
      ]);
    if (
      facts.closed >= s.minPullRequests &&
      facts.waitShare !== null &&
      facts.waitShare > s.waitShare
    )
      out.push([
        "waste-wait",
        `waste:wait:${repository}:${window}`,
        `${repository}: CI wait was ${Math.round(facts.waitShare * 100)}% of lead time over ${facts.closed} closed pull requests (limit ${Math.round(s.waitShare * 100)}%)`,
      ]);
    const byWorkflow = new Map();
    for (const repeat of facts.repeats) {
      if (!byWorkflow.has(repeat.workflow)) byWorkflow.set(repeat.workflow, []);
      byWorkflow.get(repeat.workflow).push(repeat);
    }
    for (const [workflow, list] of byWorkflow) {
      const first = list[0],
        extra = list.reduce((sum, r) => sum + r.extraMinutes, 0);
      out.push([
        "repeat",
        `repeat:${repository}:${workflow}:${window}`,
        `${repository}: ${workflow} ran ${first.runs} times on ${first.commit.slice(0, 7)} (${first.events.join(", ")})${list.length > 1 ? ` and repeated on ${list.length - 1} more commits` : ""}; extra runs cost ${Math.round(extra * 10) / 10} CI min`,
      ]);
    }
  }
  return out;
}

// What the brief holds per repository (R100.4, R100.5): numbers, workflow
// files and, per pull request, `task` with its task ID or `other` with its
// number, author and classes only. Null when nothing was read.
export function ciBrief(store, config, repositories, { now = Date.now() }) {
  const out = [];
  for (const repository of repositories) {
    const facts = ciFacts(store, config, repository, { now });
    if (!facts.pulls.length && !facts.workflows.length) continue;
    out.push({
      repository,
      windowDays: facts.settings.windowDays,
      minutesByClass: facts.byClass,
      docsOnlyMinutes: minutes(facts.docsOnlyMs),
      waitShare:
        facts.waitShare === null
          ? null
          : Math.round(facts.waitShare * 1000) / 1000,
      closedPullRequests: facts.closed,
      repeatRuns: facts.repeats,
      workflows: facts.workflows,
      pullRequests: facts.pulls.slice(0, 50).map((pull) =>
        pull.taskId
          ? {
              kind: "task",
              task: pull.taskId,
              number: pull.number,
              classes: pull.classes,
            }
          : {
              kind: "other",
              number: pull.number,
              author: pull.author,
              classes: pull.classes,
            },
      ),
    });
  }
  return out.length ? out : null;
}

// The workflow files seen for a repository (any, when null), for checking a
// plan proposal's `workflow` (§4.30).
export function seenWorkflows(store, repository = null) {
  return new Set(
    listOr(store, CI_RUNS)
      .filter(
        (run) => !repository || lower(run.repository) === lower(repository),
      )
      .map((run) => run.workflow),
  );
}

// The pull request classes recorded for a repository, for checking that a
// CI proposal's PDCA class can ever be measured (R100.5).
export function seenClasses(store, repository) {
  return new Set(
    listOr(store, PR_CI)
      .filter((row) => lower(row.repository) === lower(repository))
      .map((row) => groupClass(row.classes)),
  );
}

// PDCA for CI minutes per pull request (R100.5): the mean ci_ms, in minutes,
// of `n` closed pull requests of a repository and class, the last ones
// closed before `at` or the first ones closed after it. Null with fewer
// than `n`.
export function ciMinutesPerPullRequest(
  store,
  { repository, cls = "all", n, at, after = false },
) {
  const t = ms(at),
    rows = listOr(store, PR_CI)
      .filter(
        (row) =>
          lower(row.repository) === lower(repository) &&
          row.closedAt &&
          (cls === "all" || groupClass(row.classes) === cls) &&
          (after ? ms(row.closedAt) > t : ms(row.closedAt) <= t),
      )
      .sort((a, b) => (a.closedAt < b.closedAt ? -1 : 1)),
    pick = after ? rows.slice(0, n) : rows.slice(-n);
  if (pick.length < n || !pick.length) return null;
  return pick.reduce((sum, row) => sum + (row.ciMs || 0), 0) / n / 60_000;
}

// PDCA for build minutes per pull request (R101.12): the mean minutes of
// successful build observations (one phase when named) of `n` closed pull
// requests of a repository and class, chosen as ciMinutesPerPullRequest does.
// shortcut: filters on phase only, not target or start; add them when a retro
// needs to compare one platform.
export function buildMinutesPerPullRequest(
  store,
  { repository, cls = "all", phase, n, at, after = false },
) {
  const t = ms(at),
    rows = listOr(store, PR_CI)
      .filter(
        (row) =>
          lower(row.repository) === lower(repository) &&
          row.closedAt &&
          (cls === "all" || groupClass(row.classes) === cls) &&
          (after ? ms(row.closedAt) > t : ms(row.closedAt) <= t),
      )
      .sort((a, b) => (a.closedAt < b.closedAt ? -1 : 1)),
    pick = after ? rows.slice(0, n) : rows.slice(-n);
  if (pick.length < n || !pick.length) return null;
  const sum = store.db.prepare(
    `SELECT COALESCE(SUM(ms),0) AS ms FROM build_observations WHERE repository=? AND head_sha=? AND failed=0${phase ? " AND phase=?" : ""}`,
  );
  return (
    pick.reduce(
      (total, row) =>
        total +
        sum.get(
          ...[lower(repository), row.headSha ?? "", ...(phase ? [phase] : [])],
        ).ms,
      0,
    ) /
    n /
    60_000
  );
}
