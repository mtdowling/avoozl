// The Insights view's numbers (simplify §D13): what Avoozl already keeps.
// Task timing comes from the local telemetry store (telemetry_spans and
// telemetry_points); each spec's burndown comes from the commits that changed
// its task list on the specs branch. Reads only, and calls no GitHub API.
import { branchTip, git } from "../git/git.mjs";
import { catFiles } from "../git/git-approvals.mjs";
import { specItems } from "../specs/spec-plans.mjs";
import { ticksOf } from "../specs/spec-ticks.mjs";
import { taskFile, taskText } from "../specs/spec-tasks.mjs";
import { specsPath } from "../specs/specs-path.mjs";
import { STAGES } from "../telemetry/stages.mjs";
import { fail } from "../store/store.ts";

const DAY = 24 * 60 * 60 * 1000;
export const RANGES = Object.freeze([7, 30, 90]);

// The range in days: 7, 30 or 90, 30 when unset.
export function insightsDays(value: unknown): number {
  const days = value === undefined || value === null ? 30 : Number(value);
  if (!RANGES.includes(days)) fail("Pick a range of 7, 30 or 90 days.", 400);
  return days;
}

export interface InsightsFilter {
  days: number;
  spec?: string | null;
  repo?: string | null;
  now?: number;
}

const since = ({ days, now = Date.now() }: InsightsFilter) =>
  new Date(now - days * DAY).toISOString();

// The WHERE clause for one table's rows in range: `column` is the time the
// range applies to.
function scope(filter: InsightsFilter, column: string, extra: string[] = []) {
  const clauses = [...extra, `${column} >= ?`],
    args: unknown[] = [since(filter)];
  if (filter.spec) {
    clauses.push("spec = ?");
    args.push(filter.spec);
  }
  if (filter.repo) {
    clauses.push("repo = ?");
    args.push(filter.repo);
  }
  return { where: clauses.join(" AND "), args };
}

// The value at quantile `q` of sorted `values`, or null.
const quantile = (values: number[], q: number) =>
  values.length ? values[Math.max(0, Math.ceil(q * values.length) - 1)] : null;

// One day per entry, oldest first, ending today (UTC).
export function dayKeys({ days, now = Date.now() }: InsightsFilter) {
  return Array.from({ length: days }, (_, i) =>
    new Date(now - (days - 1 - i) * DAY).toISOString().slice(0, 10),
  );
}

// Finished tasks per day, lead time per task, time per stage, review rounds
// and rework, from the telemetry tables of `db`.
export function telemetryInsights(db: any, filter: InsightsFilter) {
  const points = (name: string) => {
    const { where, args } = scope(filter, "at", ["name = ?"]);
    return db
      .prepare(
        `SELECT task_id AS taskId, spec, repo, at, value FROM telemetry_points WHERE ${where} ORDER BY at`,
      )
      .all(name, ...args);
  };
  const perDay = new Map<string, number>();
  for (const row of points("avoozl.tasks.finished")) {
    const day = row.at.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + row.value);
  }
  const lead = points("avoozl.task.lead_time").map((row: any) => ({
      taskId: row.taskId,
      spec: row.spec ?? null,
      at: row.at,
      seconds: row.value,
    })),
    sorted = lead.map((row: any) => row.seconds).sort((a, b) => a - b);

  const stage = scope(filter, "started_at", [
    "parent_span_id IS NOT NULL",
    "stage IS NOT NULL",
    "ended_at IS NOT NULL",
  ]);
  const stageRows = db
    .prepare(
      `SELECT stage, SUM((julianday(ended_at) - julianday(started_at)) * 86400) AS seconds,
         COUNT(*) AS spans, COUNT(DISTINCT task_id) AS tasks
       FROM telemetry_spans WHERE ${stage.where} GROUP BY stage`,
    )
    .all(...stage.args);
  const stages = STAGES.map((name: string) => {
    const row = stageRows.find((r: any) => r.stage === name);
    return row
      ? {
          stage: name,
          seconds: Math.max(0, Math.round(row.seconds)),
          spans: row.spans,
          tasks: row.tasks,
        }
      : null;
  }).filter(Boolean);

  const review = scope(filter, "started_at", ["stage = 'review'"]);
  const rounds = db
    .prepare(
      `SELECT task_id AS taskId, COUNT(*) AS rounds FROM telemetry_spans WHERE ${review.where} GROUP BY task_id`,
    )
    .all(...review.args)
    .map((row: any) => row.rounds);
  const root = scope(filter, "ended_at", ["parent_span_id IS NULL"]);
  const roots = db
    .prepare(
      `SELECT COUNT(*) AS finished, COALESCE(SUM(attempts > 1), 0) AS reworked,
         COALESCE(SUM(first_pass = 1), 0) AS firstPass, COALESCE(SUM(first_pass IS NOT NULL), 0) AS judged
       FROM telemetry_spans WHERE ${root.where}`,
    )
    .get(...root.args);

  return {
    finished: dayKeys(filter).map((day) => ({
      day,
      count: perDay.get(day) ?? 0,
    })),
    leadTime: {
      tasks: lead,
      median: quantile(sorted, 0.5),
      p85: quantile(sorted, 0.85),
    },
    stages,
    review: {
      tasks: rounds.length,
      average: rounds.length
        ? Math.round((rounds.reduce((a, b) => a + b, 0) / rounds.length) * 10) /
          10
        : null,
      rounds: [
        { label: "1", tasks: rounds.filter((n) => n === 1).length },
        { label: "2", tasks: rounds.filter((n) => n === 2).length },
        { label: "3+", tasks: rounds.filter((n) => n >= 3).length },
      ],
    },
    rework: {
      finished: roots.finished,
      reworked: roots.reworked,
      firstPass: roots.firstPass,
      judged: roots.judged,
    },
  };
}

// The specs and repositories the telemetry store names, for the filters.
export function telemetryNames(db: any) {
  const names = (column: string) =>
    db
      .prepare(
        `SELECT DISTINCT ${column} AS name FROM telemetry_spans WHERE ${column} IS NOT NULL ORDER BY ${column}`,
      )
      .all()
      .map((row: any) => row.name);
  return { specs: names("spec"), repos: names("repo") };
}

// Leaf tasks open and ticked in one version of a task list.
export function taskCounts(name: string, file: string, text: string) {
  const list = taskText(file, text) ?? "",
    items = specItems(name, list).filter((item: any) => item.key),
    parents = new Set(
      items.map((item: any) => item.parent?.key).filter(Boolean),
    ),
    leaves = items.filter((item: any) => !parents.has(item.key)),
    { ticked } = ticksOf(name, list),
    done = leaves.filter((item: any) => ticked.has(item.id)).length;
  return { open: leaves.length - done, done };
}

// Counts by `root\0commit:path`. A commit's file never changes.
// shortcut: cleared whole past 5000 entries; upgrade to an LRU when a
// workspace reads more history than that in one view.
const counted = new Map<string, { open: number; done: number }>();

// Spec name -> every commit on first-parent history from `head` that changed
// its task list, oldest first, with its commit time in UTC. One git log per
// head; null when git cannot read it.
// shortcut: the last 20 heads are kept; upgrade when one page reads more
// checkouts than that.
const logs = new Map<string, Map<string, { commit: string; at: string }[]>>();
async function taskListChanges(
  root: string,
  head: string,
  files: [string, string][],
) {
  const key = [root, head, ...files.map(([file]) => file)].join("\0");
  if (logs.has(key)) return logs.get(key)!;
  let log = "";
  try {
    log = await git(root, [
      "log",
      "--first-parent",
      "--no-renames",
      "--reverse",
      "--format=%x1e%H%x1f%cI",
      "--name-only",
      head,
      "--",
      ...files.map(([file]) => file),
    ]);
  } catch {
    return null;
  }
  const specOf = new Map(files),
    changes = new Map<string, { commit: string; at: string }[]>();
  for (const block of log.split("\x1e").filter((b) => b.trim())) {
    const [line, ...names] = block.trim().split("\n"),
      [commit, time] = line.split("\x1f"),
      at = new Date(time).toISOString();
    for (const file of names) {
      const name = specOf.get(file.trim());
      if (!name) continue;
      if (!changes.has(name)) changes.set(name, []);
      changes.get(name)!.push({ commit, at });
    }
  }
  if (logs.size >= 20) logs.delete(logs.keys().next().value!);
  logs.set(key, changes);
  return changes;
}

export interface BurndownSpec {
  name: string;
  root: string;
  files: Record<string, string>;
}

// Open and ticked tasks over time for each spec, from the commits on the
// specs branch that changed its task list. With no spec named, only specs
// whose list changed in range are drawn. `branchOf(root)` names the specs
// branch of a checkout; a checkout without it reads HEAD. No fetch.
export async function burndown(
  specs: BurndownSpec[],
  filter: InsightsFilter,
  branchOf: (root: string) => string,
) {
  const from = since(filter),
    now = new Date(filter.now ?? Date.now()).toISOString(),
    out: {
      spec: string;
      points: { at: string; open: number; done: number }[];
    }[] = [];
  const byRoot = new Map<string, BurndownSpec[]>();
  for (const spec of specs) {
    if (!byRoot.has(spec.root)) byRoot.set(spec.root, []);
    byRoot.get(spec.root)!.push(spec);
  }
  for (const [root, list] of byRoot) {
    const tip = await branchTip(root, branchOf(root)),
      folder = specsPath(root),
      pathOf = new Map(
        list.map((spec) => [
          spec.name,
          `${folder}/${spec.name}/${taskFile(spec.files)}`,
        ]),
      );
    const changes = await taskListChanges(
      root,
      tip?.commit ?? "HEAD",
      [...pathOf].map(([name, file]) => [file, name]),
    );
    if (!changes) continue;
    // Each spec's versions in range, oldest first, after the one that stood
    // when the range began.
    const versions = new Map<string, { commit: string; at: string }[]>();
    for (const spec of list) {
      const all = changes.get(spec.name) ?? [],
        inRange = all.filter(({ at }) => at >= from);
      if (!inRange.length && filter.spec !== spec.name) continue;
      const before = all.filter(({ at }) => at < from).at(-1);
      versions.set(spec.name, [
        ...(before ? [{ commit: before.commit, at: from }] : []),
        ...inRange,
      ]);
    }
    const shown = list.filter((spec) => versions.has(spec.name));
    const key = (commit: string, name: string) =>
      `${commit}:${pathOf.get(name)}`;
    const missing = [
      ...new Set(
        shown.flatMap((spec) =>
          versions
            .get(spec.name)!
            .map(({ commit }) => key(commit, spec.name))
            .filter((object) => !counted.has(`${root}\0${object}`)),
        ),
      ),
    ];
    const texts: Map<string, string> = missing.length
      ? await catFiles(root, missing)
      : new Map();
    if (counted.size > 5000) counted.clear();
    for (const spec of shown) {
      const file = taskFile(spec.files),
        points: { at: string; open: number; done: number }[] = [];
      for (const { commit, at } of versions.get(spec.name)!) {
        const object = key(commit, spec.name),
          cacheKey = `${root}\0${object}`;
        let counts = counted.get(cacheKey);
        if (!counts) {
          const text = texts.get(object);
          counts =
            text === undefined
              ? { open: 0, done: 0 }
              : taskCounts(spec.name, file, text);
          counted.set(cacheKey, counts);
        }
        const last = points.at(-1);
        if (last && last.open === counts.open && last.done === counts.done)
          continue;
        points.push({ at, ...counts });
      }
      if (!points.length) continue;
      points.push({ ...points.at(-1)!, at: now });
      out.push({ spec: spec.name, points });
    }
  }
  return out.sort((a, b) => a.spec.localeCompare(b.spec));
}
