import { fail } from "../store/store.mjs";
import {
  FINDING_SEVERITIES,
  findingContext,
  findingFields,
  findingSeverity,
  findingState,
} from "./review-findings.mjs";

const noSeverities = () =>
  Object.fromEntries(FINDING_SEVERITIES.map((severity) => [severity, 0]));

// States that still need someone: the planner, or the person. Fixed,
// rejected, deferred and resolved findings are done.
const OPEN_STATES = new Set(["open", "answered", "for you", "accepted"]);

// The reviewer's summary for this revision, else the latest one from an
// earlier revision (marked not current), else null. Read from stored rounds
// only: the page never asks a model for it.
function specSummary(rounds, plan) {
  const written = rounds.filter((round) => round.summary);
  const pick =
    written.filter((round) => round.revisionHash === plan.hash).at(-1) ||
    written.at(-1);
  return pick
    ? {
        text: pick.summary,
        revisionHash: pick.revisionHash,
        current: pick.revisionHash === plan.hash,
      }
    : null;
}

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
      planHash: plan.hash,
      reviewerModel: null,
      revisionHash: null,
      current: false,
      found: 0,
      fixed: 0,
      forYou: 0,
      bySeverity: noSeverities(),
      openBySeverity: noSeverities(),
      byState: {},
      summary: null,
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
    openBySeverity = noSeverities(),
    byState = {};
  for (const thread of findings) {
    const severity = findingSeverity(thread.severity),
      name = state(thread);
    bySeverity[severity]++;
    if (OPEN_STATES.has(name)) openBySeverity[severity]++;
    byState[name] = (byState[name] ?? 0) + 1;
  }
  // At the rounds cap the step opens no round for a newer revision, so the
  // pass's done round is behind the plan with nothing at plan.hash and no
  // planner turn left (R104.14). shortcut: the summary has no config, so for
  // up to one tick under the cap this also shows; pressing it then only asks
  // for the round the tick is about to start.
  const capped =
    latest.state === "done" &&
    latest.revisionHash !== plan.hash &&
    Boolean(latest.reviewerModel) &&
    !rounds.some((round) => round.revisionHash === plan.hash) &&
    !store
      .list("receipts")
      .some(
        (receipt) =>
          receipt.planId === planId &&
          ((receipt.kind === "plan-answer" && receipt.state !== "done") ||
            (receipt.kind === "plan-review-choice" &&
              receipt.revisionHash === plan.hash &&
              receipt.state === "review")),
      ) &&
    plan.state === "draft" &&
    !plan.archivedAt;
  return {
    state: latest.state,
    // The stored revision now. An open Approve dialog compares it with the
    // one on screen and updates in place when it moves (R104.13).
    planHash: plan.hash,
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
    openBySeverity,
    byState,
    summary: specSummary(rounds, plan),
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
        statement: thread.statement,
        evidence: thread.evidence,
        answer: thread.answer || null,
      })),
    note: latest.note || null,
    unproven: Boolean(latest.unproven),
    capped,
    canReviewAnyway:
      capped ||
      (latest.state === "skipped" &&
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
        latest.revisionHash === plan.hash),
  };
}
