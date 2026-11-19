// Stored build breakdowns, the retro brief's builds block and the Build part
// minutes measure (Requirement 101.9-101.11, design §4.31). Breakdowns are
// compared only when their five-field comparison key is equal and non-null.
import { comparisonKey } from "./build-report.mjs";
import { listOr } from "./flow.mjs";

export const BUILD_PART_METRIC = "Build part minutes";
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const MAX_PULLS = 50;
export const NOT_ENOUGH_BUILDS = "Not enough comparable builds";

const lower = (value) => String(value || "").toLowerCase();
const minutes = (ms) => Math.round((ms / 60_000) * 100) / 100;
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function insertBreakdowns(
  store,
  { repository, pr, head, run, artifact, at, breakdowns },
) {
  breakdowns.forEach((b, seq) =>
    store.db
      .prepare(
        "INSERT OR REPLACE INTO build_breakdowns(repository,pr_number,head_sha,run_id,artifact_id,seq,task,attempt,workload,engine,target,toolchain,cache,costs,parts,counters,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        repository,
        pr,
        head,
        run,
        artifact,
        seq,
        b.task,
        b.attempt,
        b.workload,
        b.engine,
        b.target,
        b.toolchain,
        b.cache,
        JSON.stringify(b.costs),
        JSON.stringify(b.parts),
        JSON.stringify(b.counters),
        b.at ?? at,
      ),
  );
}

// A repository's stored breakdowns, oldest first, each with its key.
function breakdownsFor(store, repository) {
  return store.db
    .prepare(
      "SELECT * FROM build_breakdowns WHERE repository=? ORDER BY at, rowid",
    )
    .all(lower(repository))
    .map((row) => ({
      ...row,
      costs: JSON.parse(row.costs),
      parts: JSON.parse(row.parts),
      key: comparisonKey(row),
    }));
}

// Per comparison key: the count, and the latest and median of each cost and
// part, with the costliest part by median. Null keys are only counted.
function byKey(rows) {
  const groups = new Map();
  let unmatched = 0;
  for (const row of rows) {
    if (!row.key) {
      unmatched += 1;
      continue;
    }
    groups.set(row.key, [...(groups.get(row.key) ?? []), row]);
  }
  const keys = [...groups].map(([key, list]) => {
    const latest = list.at(-1),
      names = [...new Set(list.flatMap((r) => r.parts.map((p) => p.name)))],
      parts = names.map((name) => {
        const mine = list.map((r) => ({
          kind: r.parts.find((p) => p.name === name)?.kind,
          ms: r.parts
            .filter((p) => p.name === name)
            .reduce((sum, p) => sum + p.ms, 0),
          has: r.parts.some((p) => p.name === name),
        }));
        const have = mine.filter((m) => m.has);
        return {
          name,
          kind: have[0].kind,
          count: have.length,
          latestMinutes: have.at(-1) ? minutes(have.at(-1).ms) : null,
          medianMinutes: minutes(median(have.map((m) => m.ms))),
        };
      }),
      costs = Object.fromEntries(
        Object.keys(latest.costs).map((cost) => [
          cost,
          {
            latestMinutes: minutes(latest.costs[cost]),
            medianMinutes: minutes(median(list.map((r) => r.costs[cost] ?? 0))),
          },
        ]),
      ),
      costliest = [...parts].sort(
        (a, b) => b.medianMinutes - a.medianMinutes,
      )[0];
    return {
      key,
      workload: latest.workload,
      engine: latest.engine,
      target: latest.target,
      toolchain: latest.toolchain,
      cache: latest.cache,
      count: list.length,
      costs,
      parts,
      costliestPart: costliest?.name ?? null,
    };
  });
  return { keys, unmatched };
}

// The costliest phase of each pull request in the window: the phase with the
// most ms summed over targets, labeled `task` or `other`.
function pullPhases(store, repository, since) {
  const rows = store.db
      .prepare(
        "SELECT pr_number, head_sha, phase, SUM(ms) AS ms FROM build_observations WHERE repository=? AND pr_number IS NOT NULL AND COALESCE(at,'')>=? GROUP BY pr_number, head_sha, phase",
      )
      .all(lower(repository), since),
    tasks = new Map(
      listOr(store, "pr_ci")
        .filter((r) => lower(r.repository) === lower(repository))
        .map((r) => [r.number, r.taskId]),
    ),
    pulls = new Map();
  for (const row of rows) {
    const id = `${row.pr_number}\0${row.head_sha}`,
      mine = pulls.get(id) ?? { number: row.pr_number, total: 0, top: null };
    mine.total += row.ms;
    if (!mine.top || row.ms > mine.top.ms) mine.top = row;
    pulls.set(id, mine);
  }
  return [...pulls.values()]
    .sort((a, b) => b.number - a.number)
    .slice(0, MAX_PULLS)
    .map((p) =>
      tasks.get(p.number)
        ? {
            kind: "task",
            task: tasks.get(p.number),
            number: p.number,
            costliestPhase: p.top.phase,
            phaseMinutes: minutes(p.top.ms),
            totalMinutes: minutes(p.total),
          }
        : {
            kind: "other",
            number: p.number,
            costliestPhase: p.top.phase,
            phaseMinutes: minutes(p.top.ms),
            totalMinutes: minutes(p.total),
          },
    );
}

// The brief's `builds`: per repository, the costliest phase of each pull
// request and the breakdowns by comparison key. A repository with neither is
// left out; null when none has any, so the brief is as it was.
export function buildBrief(store, repositories, { now = Date.now() } = {}) {
  const since = new Date(now - WINDOW_DAYS * DAY_MS).toISOString(),
    out = [];
  for (const repository of repositories) {
    const pullRequests = pullPhases(store, repository, since),
      rows = breakdownsFor(store, repository);
    if (!pullRequests.length && !rows.length) continue;
    const { keys, unmatched } = byKey(rows);
    out.push({ repository, pullRequests, breakdowns: keys, unmatched });
  }
  return out.length ? out : null;
}

// Whether the brief shows this key, and this part under it (a proposal may
// name only what it saw).
export function keyAndPartProblem(store, repository, key, part) {
  const rows = breakdownsFor(store, repository).filter((r) => r.key === key);
  if (!rows.length)
    return `key is not a comparison key in the builds of ${repository}`;
  if (!rows.some((r) => r.parts.some((p) => p.name === part)))
    return `${part} is not a part of the builds under that key`;
  return null;
}

// Mean minutes of one part over `n` breakdowns with one key: the last ones
// at or before `at`, or the first ones after it. Null with fewer than `n`,
// so builds with another key are never mixed in.
export function buildPartMinutes(
  store,
  { repository, key, part, n, at, after = false },
) {
  const rows = breakdownsFor(store, repository).filter(
      (r) =>
        r.key === key &&
        r.parts.some((p) => p.name === part) &&
        (after ? r.at > at : r.at <= at),
    ),
    pick = after ? rows.slice(0, n) : rows.slice(-n);
  if (pick.length < n || !pick.length) return null;
  const total = pick.reduce(
    (sum, r) =>
      sum +
      r.parts.filter((p) => p.name === part).reduce((s, p) => s + p.ms, 0),
    0,
  );
  return total / n / 60_000;
}
