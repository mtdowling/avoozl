import { sessionUrl } from "../tick/notifications.mjs";
import { revisionFiles } from "../specs/spec-plans.mjs";
import { fail } from "../store/store.mjs";
import {
  FINDING_SEVERITIES,
  answerReceiptId,
  filesAt,
  findingContext,
  findingFields,
} from "./review-findings.mjs";

// A link to a chat that exists, `closed` when its session is gone, or null
// when no chat was opened. It never starts a chat (R104.11).
function chat(store, slot) {
  if (!slot) return null;
  const binding = store.get("session_bindings", slot);
  if (!binding || binding.status === "gone")
    return { href: null, closed: true };
  return { href: sessionUrl(slot), closed: false };
}

// `plan.review.view {planId, revisionHash?}` (design §4.33): the spec files
// at one stored revision and every finding of the plan's latest review pass,
// with its state, its anchor at that revision, its decisions and chat links.
// Reads the workspace database only.
export function planReviewView(store, { planId, revisionHash } = {}) {
  const plan = store.get("plans", planId);
  if (!plan?.spec || plan.deletedAt) fail("Spec plan not found.", 404);
  const at = revisionHash || plan.hash,
    stored = filesAt(plan, at);
  if (!stored)
    fail("That revision is not one of this spec's stored revisions.", 404);
  const rounds = store
      .list("review_rounds")
      .filter((round) => round.spec && round.planId === plan.id)
      .sort((a, b) => a.pass - b.pass || a.round - b.round),
    pass = rounds.at(-1)?.pass,
    latest = rounds.filter((round) => round.pass === pass),
    ids = new Set(latest.map((round) => round.id)),
    context = findingContext(store, plan),
    bySeverity = Object.fromEntries(FINDING_SEVERITIES.map((s) => [s, 0])),
    byState = {};
  const findings = store
    .list("review_threads")
    .filter(
      (thread) =>
        thread.source === "plan-review" &&
        thread.planId === plan.id &&
        ids.has(thread.roundId),
    )
    .map((thread) => {
      const fields = findingFields(thread, plan, context, at);
      bySeverity[fields.severity]++;
      byState[fields.state] = (byState[fields.state] ?? 0) + 1;
      return {
        id: thread.id,
        roundId: thread.roundId,
        revisionHash: thread.revisionHash,
        ...fields,
        statement: thread.statement,
        evidence: thread.evidence,
        answer: thread.answer || null,
      };
    })
    .sort(
      (a, b) =>
        a.anchor.file.localeCompare(b.anchor.file) ||
        (a.anchor.lineStart ?? 0) - (b.anchor.lineStart ?? 0),
    );
  return {
    planId: plan.id,
    spec: plan.spec,
    revisionHash: at,
    current: at === plan.hash,
    files: Object.fromEntries(
      // Its spec files as tabs, Kiro's first (R104.9).
      revisionFiles(stored).map((file) => [file, stored[file]]),
    ),
    rounds: latest.map((round) => ({
      id: round.id,
      pass: round.pass,
      round: round.round,
      state: round.state,
      revisionHash: round.revisionHash,
      reviewerModel: round.reviewerModel ?? null,
      note: round.note ?? null,
      reviewChat: chat(store, round.slot),
      plannerChat: chat(
        store,
        store.get("receipts", answerReceiptId(round.id))?.slot,
      ),
    })),
    findings,
    bySeverity,
    byState,
  };
}
