import { fail } from "./store.mjs";

// Review is evidence for the person. This read never changes approval checks,
// closes a finding, or performs a GitHub operation.
export function planReviewSummary(store, planId) {
  const plan = store.get("plans", planId);
  if (!plan || plan.deletedAt) fail("Plan not found.", 404);
  if (!plan.spec) return null;
  const rounds = store
      .list("review_rounds")
      .filter((round) => round.spec && round.planId === planId)
      .sort((a, b) => a.pass - b.pass || a.round - b.round),
    latest = rounds.at(-1);
  if (!latest)
    return {
      state: "not-reviewed",
      reviewerModel: null,
      revisionHash: null,
      current: false,
      found: 0,
      fixed: 0,
      forYou: 0,
      open: [],
      note: null,
    };
  const pass = new Set(
      rounds
        .filter((round) => round.pass === latest.pass)
        .map((round) => round.id),
    ),
    hashes = new Set([
      plan.hash,
      ...(plan.history || []).map((entry) => entry.hash),
    ]),
    findings = store
      .list("review_threads")
      .filter(
        (thread) =>
          thread.source === "plan-review" &&
          thread.planId === planId &&
          pass.has(thread.roundId),
      ),
    fixed = (thread) =>
      thread.answer?.action === "fixed" &&
      hashes.has(thread.answer.revisionHash);
  return {
    state: latest.state,
    reviewerModel: latest.reviewerModel,
    revisionHash: latest.revisionHash,
    current: latest.revisionHash === plan.hash,
    found: findings.length,
    fixed: findings.filter(fixed).length,
    forYou: findings.filter(
      (thread) => thread.state !== "closed" && !fixed(thread),
    ).length,
    open: findings
      .filter((thread) => thread.state !== "closed")
      .map((thread) => ({
        id: thread.id,
        roundId: thread.roundId,
        revisionHash: thread.revisionHash,
        current: thread.revisionHash === plan.hash,
        kind: thread.kind,
        severity: thread.severity,
        file: thread.file,
        line: thread.line,
        claim: thread.claim,
        evidence: thread.evidence,
        answer: thread.answer || null,
      })),
    note: latest.note || null,
    unproven: Boolean(latest.unproven),
  };
}
