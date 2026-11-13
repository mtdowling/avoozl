// GitHub pull-request reviews as a GitHub leaf's review verdict (task 9.10,
// design §5.2, R36.13). GitHub owns the review; Avoozl only reads it. A
// review counts when it is APPROVED or CHANGES_REQUESTED, on the pull
// request's head commit, by a reviewer the repository policy allows (the
// same check as trigger labels, R33.8). COMMENTED and DISMISSED reviews
// count for nothing. A review on an older commit is stale.
import { actorAllowed } from "./github-policy.mjs";

const DECISIVE = new Set(["APPROVED", "CHANGES_REQUESTED"]);

const order = (left, right) =>
  String(left.submitted_at || "").localeCompare(
    String(right.submitted_at || ""),
  ) || (Number(left.id) || 0) - (Number(right.id) || 0);

// The verdict of one pull request's reviews at `headSha`. `permissionOf`
// returns a login's repository permission name; it is called once per
// reviewer and only when the policy sets a minimum permission.
//   state "approved"           enough allowed approvals, no allowed changes
//   state "changes-requested"  an allowed reviewer asked for changes
//   state "pending"            neither
// `reviews` holds each reviewer's newest counting review: on the head when
// there is one, else their newest one, marked stale. Reviews by people the
// policy does not allow are listed with `allowed: false` and count for
// nothing.
export async function reviewVerdict(repository, pull, reviews, permissionOf) {
  const headSha = String(pull?.headRefOid || ""),
    needed = repository.pullRequestReviews?.approvals ?? 1,
    byReviewer = new Map();
  for (const review of [...(reviews || [])].sort(order)) {
    const login = review?.user?.login,
      state = String(review?.state || "").toUpperCase();
    if (!login || !DECISIVE.has(state)) continue;
    const onHead = review.commit_id === headSha,
      known = byReviewer.get(login);
    // A review on the head always beats one on an older commit.
    if (known?.onHead && !onHead) continue;
    byReviewer.set(login, { review, state, onHead });
  }
  const held = new Map(),
    entries = [];
  for (const [login, { review, state, onHead }] of byReviewer) {
    if (repository.minimumPermission && !held.has(login))
      held.set(login, (await permissionOf(login)) || "none");
    const check = actorAllowed(
      repository,
      login,
      repository.minimumPermission ? held.get(login) : null,
    );
    entries.push({
      reviewer: login,
      state: state === "APPROVED" ? "approved" : "changes-requested",
      commit: review.commit_id || null,
      stale: !onHead,
      allowed: check.allowed,
      ...(check.allowed ? {} : { reason: check.reason }),
      at: review.submitted_at || null,
      url: review.html_url || null,
    });
  }
  entries.sort((a, b) => a.reviewer.localeCompare(b.reviewer));
  const counting = entries.filter((entry) => entry.allowed && !entry.stale),
    approvals = counting.filter((entry) => entry.state === "approved").length,
    changes = counting
      .filter((entry) => entry.state === "changes-requested")
      .map((entry) => entry.reviewer);
  return {
    pullRequest: pull?.url || null,
    pullRequestNumber: pull?.number ?? null,
    headSha: headSha || null,
    state: changes.length
      ? "changes-requested"
      : approvals >= needed
        ? "approved"
        : "pending",
    approvals,
    needed,
    reviews: entries,
  };
}

// Why a merged pull request's reviews hold its leaf, or "" when they pass.
export function reviewHoldReason(verdict) {
  const head = verdict.headSha ? verdict.headSha.slice(0, 12) : "its head";
  if (verdict.state === "changes-requested")
    return `Pull request ${verdict.pullRequest} merged with changes requested on ${head} by ${verdict.reviews
      .filter((r) => r.allowed && !r.stale && r.state === "changes-requested")
      .map((r) => r.reviewer)
      .join(", ")}.`;
  if (verdict.state === "pending")
    return `Pull request ${verdict.pullRequest} merged with ${verdict.approvals} of ${verdict.needed} allowed approvals on ${head}.`;
  return "";
}
