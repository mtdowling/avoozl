// What GitHub holds about one Issue Radar issue, as times (RC8.2, RC8.5).
// Both Trace and Flow read these and never a claim marker's `updated=`, which
// runs ahead of GitHub's own clock. Pure helpers plus one read; the read
// writes nothing.
import { parseMarkers, crewName } from "./radar-claims.mjs";
import { parseProvenance } from "./github-provenance.mjs";
import { READY_LABEL_DEFAULT } from "./github-policy.mjs";

const lower = (value) => String(value ?? "").toLocaleLowerCase();
const earliest = (times) =>
  times.filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ??
  null;

// When the ready label was first added.
export const readyAt = (events, label = READY_LABEL_DEFAULT) =>
  earliest(
    (events || [])
      .filter(
        (e) => e.event === "labeled" && lower(e.label?.name) === lower(label),
      )
      .map((e) => e.created_at),
  );

// The crew's claim: the oldest comment that carries a marker. Its
// `created_at` is when the crew claimed the issue. The crew edits that one
// comment as it works, so `updated_at` is its last word, not the claim.
export function claimOf(comments) {
  const marked = (comments || [])
      .map((comment) => ({ comment, markers: parseMarkers(comment.body) }))
      .filter((entry) => entry.markers.length)
      .sort((a, b) => a.comment.id - b.comment.id),
    first = marked[0];
  if (!first) return null;
  const markers = marked.flatMap((entry) => entry.markers),
    last = markers.at(-1);
  return {
    at: first.comment.created_at ?? null,
    lastWordAt: first.comment.updated_at ?? null,
    url: first.comment.html_url ?? null,
    crewId: markers.find((m) => m.id)?.id ?? null,
    crewName: crewName(first.comment.body),
    phase: last.phase,
    pr: [...markers].reverse().find((m) => m.pr)?.pr ?? null,
  };
}

const FAILED = new Set([
  "failure",
  "timed_out",
  "cancelled",
  "action_required",
  "startup_failure",
]);

// The checks on the pull request's head: the latest run of each name.
// `green` is the last completion time once every one has passed.
export function checkState(runs) {
  const byName = new Map(),
    rounds = new Map();
  for (const run of runs || []) {
    rounds.set(run.name, (rounds.get(run.name) ?? 0) + 1);
    const seen = byName.get(run.name);
    if (
      !seen ||
      Date.parse(run.completed_at ?? run.started_at ?? 0) >=
        Date.parse(seen.completed_at ?? seen.started_at ?? 0)
    )
      byName.set(run.name, run);
  }
  const latest = [...byName.values()],
    done = latest.filter((run) => run.status === "completed"),
    failed = latest.filter((run) => FAILED.has(run.conclusion)),
    passed = done.length === latest.length && !failed.length;
  return {
    total: latest.length,
    done: done.length,
    failed: failed.map((run) => run.name),
    rounds: Math.max(0, ...rounds.values()),
    green:
      passed && latest.length
        ? done
            .map((run) => run.completed_at)
            .sort((a, b) => Date.parse(b) - Date.parse(a))[0]
        : null,
  };
}

export const provenanceOf = (body) => parseProvenance(body).marker;

// One attempt per read, so a failed one leaves its own times empty and is
// named, and the rest still show.
async function attempt(problems, what, read, fallback) {
  try {
    return await read();
  } catch (error) {
    problems.push(`${what}: ${error.message}`);
    return fallback;
  }
}

// The GitHub reads for one issue: the issue, its comments and events, the
// pull request the claim names (else none), and that pull request's checks.
export async function readIssueFacts(
  github,
  repository,
  number,
  settings = {},
) {
  const problems = [],
    issue = await github.issue(repository, number),
    comments = await attempt(
      problems,
      "comments",
      () => github.listIssueComments(repository, number),
      [],
    ),
    events = await attempt(
      problems,
      "events",
      () => github.issueEvents(repository, number),
      [],
    ),
    claim = claimOf(comments),
    pull = claim?.pr
      ? await attempt(
          problems,
          "pull request",
          () => github.pullRequest(repository, claim.pr),
          null,
        )
      : null,
    sha = pull?.head?.sha,
    checks = sha
      ? await attempt(
          problems,
          "checks",
          () => github.checkRuns(repository, sha),
          [],
        )
      : [];
  return {
    issue,
    comments,
    events,
    claim,
    pull,
    checks,
    problems,
    readyLabel: settings.managedLabels?.ready ?? READY_LABEL_DEFAULT,
  };
}

// The five flow times of one issue (flow-github.mjs).
export function flowTimes(facts) {
  const checks = checkState(facts.checks);
  return {
    number: facts.issue.number,
    ready: readyAt(facts.events, facts.readyLabel),
    claimed: facts.claim?.at ?? null,
    pr: facts.pull?.created_at ?? null,
    green: checks.green,
    merged: facts.pull?.merged_at ?? null,
  };
}
