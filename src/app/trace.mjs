// Trace (RC8.2, design D10): one issue's eight steps, each with the time
// GitHub holds for it. A claim marker's `updated=` is never shown; the time
// of a step is a GitHub event or a comment's own timestamp.
//   Spec approved ─ Issue created ─ Ready ─ Claimed ─ PR opened ─ CI ─ Merged ─ Retro
import {
  checkState,
  provenanceOf,
  readIssueFacts,
  readyAt,
  claimOf,
} from "./radar-events.mjs";

export const TRACE_STEPS = Object.freeze([
  { key: "spec", label: "Spec approved" },
  { key: "issue", label: "Issue created" },
  { key: "ready", label: "Ready" },
  { key: "claimed", label: "Claimed" },
  { key: "pr", label: "PR opened" },
  { key: "ci", label: "CI" },
  { key: "merged", label: "Merged" },
  { key: "retro", label: "Retro" },
]);

// States: done (has a time), now (the step in progress), later, and
// skipped (a later step happened without it; drawn dashed).
export function buildTrace({
  issue,
  comments = [],
  events = [],
  pull = null,
  checks = [],
  readyLabel,
  specApproved = null,
  review = null,
  problems = [],
}) {
  const claim = claimOf(comments),
    state = checkState(checks),
    provenance = provenanceOf(issue.body),
    merged = pull?.merged_at ?? null,
    steps = [
      {
        at: specApproved?.at ?? null,
        by: provenance?.approvedBy ?? null,
        detail: provenance
          ? `${provenance.spec} · commit ${provenance.commit.slice(0, 7)}`
          : "No provenance marker on the issue",
      },
      { at: issue.created_at ?? null, link: issue.html_url ?? null },
      { at: readyAt(events, readyLabel) },
      {
        at: claim?.at ?? null,
        link: claim?.url ?? null,
        by: claim?.crewName ?? claim?.crewId ?? null,
      },
      { at: pull?.created_at ?? null, link: pull?.html_url ?? null },
      {
        at: state.green,
        rounds: state.rounds,
        detail: !state.total
          ? "No checks yet"
          : state.failed.length
            ? `Failing: ${state.failed.join(", ")}`
            : state.green
              ? `${state.total} checks passed`
              : `${state.done} of ${state.total} checks done`,
      },
      { at: merged, link: merged ? pull.html_url : null },
      {
        at: null,
        detail: merged ? "Counted in the next retro" : "After merge",
      },
    ].map((step, index) => ({ ...TRACE_STEPS[index], ...step }));
  // RC20.11: a Review step after CI, only when a draft review was made.
  if (review)
    steps.splice(6, 0, {
      key: "review",
      label: "Review",
      at: ["submitted", "discarded"].includes(review.state)
        ? review.closedAt
        : null,
      by: review.reviewer ?? null,
      link: review.url ?? null,
      detail:
        review.state === "submitted"
          ? `Drafted ${review.draftedAt}, submitted by ${review.reviewer}`
          : review.state === "discarded"
            ? `Drafted ${review.draftedAt}, discarded`
            : `Drafted ${review.draftedAt} for ${review.reviewer}; waiting to be submitted`,
    });
  const lastDone = steps.findLastIndex((step) => step.at);
  let next = true;
  for (const [index, step] of steps.entries()) {
    if (step.at) step.state = "done";
    else if (index < lastDone) step.state = "skipped";
    else if (next) {
      step.state = "now";
      next = false;
    } else step.state = "later";
  }
  return {
    number: issue.number,
    title: String(issue.title ?? ""),
    steps,
    crew: claim ? { id: claim.crewId, name: claim.crewName } : null,
    // The crew's last edit to its own comment, GitHub's clock.
    crewLastWordAt: claim?.lastWordAt ?? null,
    links: {
      issue: issue.html_url ?? null,
      pr: pull?.html_url ?? null,
      claim: claim?.url ?? null,
    },
    problems,
  };
}

// The approval commit's time, from the repository that holds the spec: the
// plans repository when the marker names one.
async function approvedAt(github, repository, issue, problems) {
  const marker = provenanceOf(issue.body);
  if (!marker) return null;
  try {
    const [owner, repo] = (marker.plans ?? repository).split("/"),
      commit = await github.request(
        "GET",
        `/repos/${owner}/${repo}/commits/${marker.commit}`,
      );
    return { at: commit?.commit?.committer?.date ?? null };
  } catch (error) {
    problems.push(`spec approval time: ${error.message}`);
    return null;
  }
}

// `draftFor(pullNumber)` gives the pull request's review draft (RC20.11).
export async function readTrace(
  github,
  repository,
  number,
  settings = {},
  { draftFor = () => null } = {},
) {
  const facts = await readIssueFacts(github, repository, number, settings),
    specApproved = await approvedAt(
      github,
      repository,
      facts.issue,
      facts.problems,
    );
  return {
    repository,
    ...buildTrace({
      ...facts,
      specApproved,
      review: facts.pull ? draftFor(facts.pull.number) : null,
    }),
  };
}
