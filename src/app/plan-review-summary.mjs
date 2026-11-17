import { fail } from "./store.mjs";
import {
  FINDING_SEVERITIES,
  findingContext,
  findingFields,
  findingSeverity,
  findingState,
} from "./review-findings.mjs";

const noSeverities = () =>
  Object.fromEntries(FINDING_SEVERITIES.map((severity) => [severity, 0]));

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
      bySeverity: noSeverities(),
      byState: {},
      open: [],
      note: null,
    };
  const pass = new Set(
      rounds
        .filter((round) => round.pass === latest.pass)
        .map((round) => round.id),
    ),
    context = findingContext(store, plan),
    { hashes } = context,
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
  const state = (thread) => findingState(thread, context),
    bySeverity = noSeverities(),
    byState = {};
  for (const thread of findings) {
    bySeverity[findingSeverity(thread.severity)]++;
    const name = state(thread);
    byState[name] = (byState[name] ?? 0) + 1;
  }
  return {
    state: latest.state,
    reviewerModel: latest.reviewerModel,
    writerModel: latest.writerModel ?? null,
    revisionHash: latest.revisionHash,
    current: latest.revisionHash === plan.hash,
    found: findings.length,
    fixed: findings.filter(fixed).length,
    forYou: findings.filter(
      (thread) => thread.state !== "closed" && !fixed(thread),
    ).length,
    bySeverity,
    byState,
    open: findings
      .filter((thread) => thread.state !== "closed")
      .map((thread) => ({
        id: thread.id,
        roundId: thread.roundId,
        revisionHash: thread.revisionHash,
        current: thread.revisionHash === plan.hash,
        kind: thread.kind,
        file: thread.file,
        line: thread.line,
        // Severity, state, and its lines in the current revision, or moved.
        ...findingFields(thread, plan, context, plan.hash),
        claim: thread.claim,
        evidence: thread.evidence,
        answer: thread.answer || null,
      })),
    note: latest.note || null,
    unproven: Boolean(latest.unproven),
    canReviewAnyway:
      latest.state === "skipped" &&
      !latest.unproven &&
      !latest.slot &&
      !rounds.some(
        (round) =>
          round.revisionHash === plan.hash &&
          (round.slot || ["running", "done"].includes(round.state)),
      ) &&
      !latest.writerModel &&
      Boolean(latest.reviewerModel) &&
      plan.state === "draft" &&
      !plan.archivedAt &&
      latest.revisionHash === plan.hash,
  };
}
