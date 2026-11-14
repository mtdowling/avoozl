// Pull requests on Issue Radar repositories (RC5.3, RC5.6, design D7), read
// from GitHub on the tick. Two things, and no merging:
//   - ship `manual`: one Ready to merge row per pull request whose required
//     checks are green. Nothing is armed.
//   - any ship mode: a pull request with a merge conflict gets the conflict
//     label and one Needs you row; the label comes off when the conflict is
//     gone. Avoozl resolves nothing and writes no other label.
// shortcut: every open, non-draft, same-repository pull request counts, not
// only those that close a marked issue; rc-5.2 adds that filter for arming.
import { effectiveShip } from "./radar-merge-path.mjs";
import { RADAR_INTERVAL_MS } from "./radar-claims.mjs";

const META = "radarMerge";
const lower = (value) => String(value ?? "").toLocaleLowerCase();
const FINE = new Set(["success", "neutral", "skipped"]);
const CLEAN = new Set(["clean", "has_hooks"]);

// Every check run and commit status on the head commit, as {name, ok, done}.
async function checksOf(github, repository, sha) {
  const [runs, status] = await Promise.all([
    github.checkRuns(repository, sha),
    github.commitStatus(repository, sha),
  ]);
  return [
    ...(runs || []).map((run) => ({
      name: run.name,
      done: run.status === "completed",
      ok: run.status === "completed" && FINE.has(run.conclusion),
    })),
    ...(status?.statuses || []).map((entry) => ({
      name: entry.context,
      done: entry.state !== "pending",
      ok: entry.state === "success",
    })),
  ];
}

const green = (checks, required) =>
  checks.length > 0 &&
  checks.every((check) => check.ok) &&
  required.every((name) => checks.some((check) => check.name === name));

// Reads one repository and writes only the conflict label. Returns the rows
// that now stand; a GitHub error throws before any row changes.
async function readRepository(github, repository, settings, ship, old, errors) {
  const label = settings.radar?.conflictLabel,
    required = settings.requiredChecks || [],
    listed = await github.listPullRequests(repository, { state: "open" }),
    rows = { ready: [], conflicts: [] };
  for (const entry of listed) {
    if (entry.draft || lower(entry.head?.repo?.full_name) !== lower(repository))
      continue;
    const pull = await github.pullRequest(repository, entry.number),
      labelled = (pull.labels || []).some(
        (item) => lower(item.name ?? item) === lower(label),
      ),
      known = old.conflicts.find((row) => row.number === pull.number),
      base = {
        number: pull.number,
        url: pull.html_url,
        title: String(pull.title ?? ""),
        head: pull.head?.sha,
      },
      conflicted = pull.mergeable === false && pull.mergeable_state === "dirty",
      clear = pull.mergeable === true;
    if (conflicted) {
      rows.conflicts.push({ ...base, at: known?.at });
      if (!labelled)
        await github.addLabels(repository, pull.number, [label]).catch((e) => {
          errors.push(`${repository} #${pull.number}: ${e.message}`);
        });
    } else if (clear) {
      if (labelled)
        await github.removeLabel(repository, pull.number, label).catch((e) => {
          errors.push(`${repository} #${pull.number}: ${e.message}`);
        });
    } else if (known) rows.conflicts.push(known);
    if (
      ship === "manual" &&
      clear &&
      CLEAN.has(pull.mergeable_state) &&
      green(await checksOf(github, repository, pull.head.sha), required)
    ) {
      const kept = old.ready.find(
        (row) => row.number === pull.number && row.head === base.head,
      );
      rows.ready.push({ ...base, at: kept?.at });
    }
  }
  return rows;
}

// The tick step. At most one read per interval unless `force`. A repository
// that cannot be read keeps its rows and writes nothing.
export async function mergeStep(
  store,
  github,
  policy,
  delivery,
  { now = Date.now(), force = false } = {},
) {
  const notify = [],
    errors = [],
    old = store.getMeta(META) ?? { readAt: null, repositories: {} };
  if (!policy?.mode || !github) return { notify, errors };
  if (!force && old.readAt && now - Date.parse(old.readAt) < RADAR_INTERVAL_MS)
    return { notify, errors };
  const at = new Date(now).toISOString(),
    next = { readAt: at, repositories: {} };
  for (const [repository, settings] of Object.entries(
    policy.repositories || {},
  )) {
    if (settings.coder !== "issue-radar") continue;
    const before = old.repositories?.[repository] ?? {
      ready: [],
      conflicts: [],
    };
    try {
      const rows = await readRepository(
        github,
        repository,
        settings,
        effectiveShip(delivery, repository),
        before,
        errors,
      );
      for (const row of rows.ready) {
        row.at ??= at;
        if (
          !before.ready.some(
            (r) => r.number === row.number && r.head === row.head,
          )
        )
          notify.push({
            channel: "decision",
            title: `${repository} #${row.number} is ready to merge`,
            text: `Its required checks pass. You merge it on GitHub: ${row.url}`,
          });
      }
      for (const row of rows.conflicts) {
        row.at ??= at;
        if (!before.conflicts.some((r) => r.number === row.number))
          notify.push({
            channel: "decision",
            title: `${repository} #${row.number} has a merge conflict`,
            text: `Merge the base branch into it. Avoozl does not resolve conflicts: ${row.url}`,
          });
      }
      next.repositories[repository] = { ...rows, error: null };
    } catch (error) {
      errors.push(`${repository}: GitHub could not be read: ${error.message}`);
      next.repositories[repository] = { ...before, error: error.message };
    }
  }
  store.setMeta(META, next);
  return { notify, errors };
}

// The Needs you rows the last read left standing.
export function mergeNeedsYou(store) {
  const items = [];
  for (const [repository, entry] of Object.entries(
    store.getMeta(META)?.repositories ?? {},
  )) {
    for (const row of entry.ready ?? [])
      items.push({
        kind: "ready-to-merge",
        id: `ready-to-merge:${repository}#${row.number}`,
        taskId: null,
        authority: "github",
        pullRequest: row.number,
        link: row.url,
        title: `${repository} #${row.number} is ready to merge`,
        detail: `Its required checks pass on ${String(row.head).slice(0, 12)}. You merge it on GitHub; Avoozl never merges it.`,
        openedAt: row.at,
      });
    for (const row of entry.conflicts ?? [])
      items.push({
        kind: "needs-human",
        reason: "crew",
        id: `merge-conflict:${repository}#${row.number}`,
        taskId: null,
        authority: "github",
        pullRequest: row.number,
        link: row.url,
        title: `${repository} #${row.number} has a merge conflict`,
        detail:
          "Merge the base branch into the pull request branch. Avoozl does not resolve conflicts; the label comes off when it is clear.",
        openedAt: row.at,
      });
  }
  return items;
}
