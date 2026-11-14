// What an Issue Radar crew leaves on GitHub: its claim comment and `crew:`
// labels (Radar's claim marker, `kirocrew-crew v=1`). This reads that and
// nothing else, so it sees crews on every machine, and it writes nothing.
// Two uses: the plan-me hand-off (radar-plan-me.mjs) and the Dashboard's
// In flight list of live claims (`radar.crews`).
//
// The marker holds crew id, phase, PR and updated time, and no more. The
// crew's name, and the reason for a skip, are in the comment's visible lines,
// which Radar does not promise to keep; both are best-effort here.

// Radar's phases (crew_ledger_spec.md): a claim in a terminal phase is
// history, never a live claim.
export const TERMINAL_PHASES = new Set([
  "resolved",
  "skipped",
  "yielded",
  "handed-back",
  "preempted",
]);
// Only these age toward the claim TTL; a waiting phase is exempt.
export const TTL_PHASES = new Set(["claimed", "investigating", "implementing"]);
// shortcut: Radar's default claim_ttl_hours. The real value is a setting on
// the crew's own machine and is not on GitHub. Read it from Radar's API
// when Avoozl can reach it.
export const CLAIM_TTL_HOURS = 48;
// Radar's skip scopes (crew_brief.md).
export const SKIP_SCOPES = new Set([
  "architecture",
  "new-feature",
  "needs-design",
  "needs-decision",
  "needs-investigation",
  "duplicate",
  "wrong-root-cause",
  "breaking-change",
  "gate-config",
  "other",
]);

const MARKER = /<!--\s*kirocrew-crew\s+([^>]*?)-->/g;
const lower = (value) => String(value).toLocaleLowerCase();

// Every marker in one comment body, in order. A marker with no `v` is v=1.
export function parseMarkers(body) {
  const found = [];
  for (const match of String(body || "").matchAll(MARKER)) {
    const fields = Object.fromEntries(
      [...match[1].matchAll(/([a-z_]+)=(\S*)/g)].map((pair) => [
        pair[1],
        pair[2],
      ]),
    );
    found.push({
      version: fields.v ?? "1",
      id: fields.id || null,
      phase: fields.phase || null,
      pr: /^\d+$/.test(fields.pr || "") ? Number(fields.pr) : null,
      updated: fields.updated || null,
    });
  }
  return found;
}

// The crew's name from the claim comment's first line.
export const crewName = (body) =>
  /^\s*👻\s*\*\*(.+?)\*\*/u.exec(String(body || ""))?.[1] ?? null;

// The skip scope, when Radar wrote it in the second line
// (`skipped · duplicate · updated 05:04 UTC`), else null. It is not in the
// marker.
export function skipScope(body) {
  const line = String(body || "").split("\n")[1] || "",
    parts = line.split("·").map((part) => part.trim());
  return parts[0] === "skipped" && SKIP_SCOPES.has(parts[1]) ? parts[1] : null;
}

// Comments (GitHub's `issues/:n/comments`) that carry a marker, each with
// the comment's id and link, oldest first.
function claimComments(comments) {
  return (comments || [])
    .flatMap((comment) =>
      parseMarkers(comment.body).map((marker) => ({
        marker,
        commentId: comment.id,
        url: comment.html_url ?? comment.url ?? null,
        body: String(comment.body || ""),
      })),
    )
    .sort((a, b) => a.commentId - b.commentId);
}

// The live claim: the oldest marker in a non-terminal phase. A marker whose
// version this reader does not know counts as live (Radar's compatibility
// rule), so it is never taken for history.
export function liveClaim(comments) {
  return (
    claimComments(comments).find(
      ({ marker }) =>
        marker.version !== "1" || !TERMINAL_PHASES.has(marker.phase),
    ) ?? null
  );
}

// The newest skipped marker, with its scope when the visible line has one.
export function latestSkip(comments) {
  const skipped = claimComments(comments)
    .filter(
      ({ marker }) => marker.version === "1" && marker.phase === "skipped",
    )
    .at(-1);
  return skipped
    ? {
        crewId: skipped.marker.id,
        crewName: crewName(skipped.body),
        updated: skipped.marker.updated,
        scope: skipScope(skipped.body),
      }
    : null;
}

// Stale as Radar defines it: a TTL phase whose own `updated` is older than
// the TTL, or has none. A claim in a waiting phase is not stale.
export function isStale(marker, now = Date.now()) {
  if (!marker || !TTL_PHASES.has(marker.phase)) return false;
  const at = Date.parse(marker.updated || "");
  return !Number.isFinite(at) || now - at > CLAIM_TTL_HOURS * 3600 * 1000;
}

// One repository's live claims: every open issue with the claim label, and
// the live marker on it. A label with no live marker is a row with no crew,
// flagged stale: Radar's own protocol says such a label blocks every other
// crew until someone clears it.
export async function readClaims(github, repository, settings, now) {
  const label = settings.crewLabels?.claim,
    issues = (
      await github.listIssues(repository, { state: "open", label })
    ).filter((issue) =>
      (issue.labels || []).some(
        (entry) => lower(entry.name ?? entry) === lower(label),
      ),
    ),
    rows = [];
  for (const issue of issues) {
    const claim = liveClaim(
        await github.listIssueComments(repository, issue.number),
      ),
      marker = claim?.marker ?? null;
    rows.push({
      repository,
      number: issue.number,
      title: String(issue.title ?? ""),
      url: issue.html_url ?? null,
      crewId: marker?.id ?? null,
      crewName: claim ? crewName(claim.body) : null,
      phase: marker?.phase ?? null,
      pr: marker?.pr ?? null,
      prUrl: marker?.pr
        ? `https://github.com/${repository}/pull/${marker.pr}`
        : null,
      updated: marker?.updated ?? null,
      commentUrl: claim?.url ?? null,
      stale: marker ? isStale(marker, now) : true,
      noMarker: !marker,
    });
  }
  return rows;
}

export const RADAR_INTERVAL_MS = 2 * 60 * 1000;
const META = "radarClaims";

// The tick's read, at most once per interval unless `force`. A repository
// that fails keeps its last rows and shows its error.
export async function refreshClaims(
  store,
  github,
  policy,
  { now = Date.now(), force = false } = {},
) {
  const old = store.getMeta(META) ?? { readAt: null, repositories: {} };
  if (!policy?.mode || !github) return old;
  if (!force && old.readAt && now - Date.parse(old.readAt) < RADAR_INTERVAL_MS)
    return old;
  const next = { readAt: new Date(now).toISOString(), repositories: {} };
  for (const [repository, settings] of Object.entries(
    policy.repositories || {},
  )) {
    try {
      next.repositories[repository] = {
        rows: await readClaims(github, repository, settings, now),
        error: null,
      };
    } catch (error) {
      next.repositories[repository] = {
        rows: old.repositories?.[repository]?.rows ?? [],
        error: `GitHub could not be read: ${error.message}`,
      };
    }
  }
  store.setMeta(META, next);
  return next;
}

// `radar.crews`: the cached rows, flat, newest update first, with what a
// GitHub-only read cannot show.
export function claimsView(store, now = Date.now()) {
  const cache = store.getMeta(META) ?? { readAt: null, repositories: {} },
    rows = Object.values(cache.repositories)
      .flatMap((entry) => entry.rows)
      .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  return {
    readAt: cache.readAt,
    stale: rows.filter((row) => row.stale).length,
    rows,
    errors: Object.entries(cache.repositories)
      .filter(([, entry]) => entry.error)
      .map(([repository, entry]) => ({ repository, error: entry.error })),
    // Radar keeps these on the crew's own machine, not on GitHub.
    unseen: ["paused", "machine", "chat"],
    interval: RADAR_INTERVAL_MS,
    now,
  };
}
