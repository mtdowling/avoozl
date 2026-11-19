import { randomUUID } from "node:crypto";
import { digest } from "../model.mjs";
import { savePlan } from "./plans.mjs";
import { callerSlot, servedModel } from "./delivery.mjs";
import { REVISION_FILES, specHash } from "./spec-plans.mjs";
import { validatePlanReview } from "./chat-models.mjs";
import { fail } from "./store.mjs";
import {
  FINDING_SEVERITIES,
  MAX_QUOTE,
  findingSeverity,
  quoteHash,
  quoteLines,
  settledByPerson,
} from "./review-findings.mjs";

const severities = new Set(["blocking", "important", "suggestion", "question"]);
// A spec finding takes the Requirement 104 values; the older ones still map.
const specSeverities = new Set([...FINDING_SEVERITIES, ...severities]);
export const SPEC_FINDING_KINDS = Object.freeze([
  "gap",
  "untestable",
  "wrong-reference",
  "hidden-order",
  "too-big",
  "conflict",
]);
const namedModel = (value) =>
  typeof value === "string" &&
  value !== "auto" &&
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)
    ? value
    : null;

// Only recorded observations count. A requested model is never evidence of
// the model that wrote or reviewed a revision.
export function reportedPlanModel(store, { slot, receiptId } = {}) {
  if (receiptId) {
    const receipt = store.get("receipts", receiptId);
    return receipt?.kind === "plan-review-writer"
      ? namedModel(receipt.actualModel)
      : null;
  }
  if (slot) {
    const reading = servedModel(store.get("session_bindings", slot));
    return reading.reported ? namedModel(reading.model) : null;
  }
  return null;
}

function specRevision(store, planId, revisionHash) {
  const plan = store.get("plans", planId);
  if (!plan?.spec || plan.deletedAt) fail("Spec plan not found.", 404);
  const revision =
    plan.hash === revisionHash
      ? plan
      : (plan.history || []).find((entry) => entry.hash === revisionHash);
  if (!revision?.files || specHash(revision.files) !== revisionHash)
    fail("The exact stored spec revision is unavailable.", 409);
  return { plan, files: revision.files };
}

export function listSpecReviewRounds(store, { planId, revisionHash } = {}) {
  const plan = planId ? store.get("plans", planId) : null;
  return {
    items: store
      .list("review_rounds")
      .filter(
        (row) =>
          row.spec &&
          (!planId || row.planId === planId) &&
          (!revisionHash || row.revisionHash === revisionHash),
      )
      .sort((a, b) => a.pass - b.pass || a.round - b.round)
      .map((row) => ({
        ...row,
        current:
          (plan || store.get("plans", row.planId))?.hash === row.revisionHash,
      })),
  };
}

// Called by the planner before it queues a chat. It records the decision,
// but never opens a session or changes a plan. previousRoundId is supplied
// only for a revision produced in answer to that round; other edits start
// a new pass. A bounded pass cannot silently restart itself.
export function createSpecReviewRound(
  store,
  {
    planId,
    revisionHash,
    reviewerModel,
    writer = {},
    previousRoundId = null,
    maxRounds = 1,
    unproven = false,
    person = false,
    // Review anyway at the rounds cap: one more round of the pass (R104.14).
    anyway = false,
    commits = {},
  },
) {
  const { plan } = specRevision(store, planId, revisionHash),
    limit = validatePlanReview({ rounds: maxRounds }).rounds,
    reviewer = namedModel(reviewerModel),
    writerModel = reportedPlanModel(store, writer);
  if (unproven && !person)
    fail("Only a person may review an unknown writer model anyway.", 403);
  if (
    !commits ||
    typeof commits !== "object" ||
    Array.isArray(commits) ||
    Object.entries(commits).some(
      ([repository, sha]) =>
        !repository ||
        repository.length > 200 ||
        /[\u0000-\u001f\u007f]/.test(repository) ||
        typeof sha !== "string" ||
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha),
    )
  )
    fail("Review commits must name repositories and their full commit hashes.");
  let note = null;
  if (!reviewer) note = "Pick a Plan reviewer model in Settings › Models.";
  else if (!writerModel && !unproven)
    note = "The model that wrote this revision is unknown.";
  else if (reviewer === writerModel)
    note =
      "The reviewer model is the same as the model that wrote this revision.";
  return store.transaction(() => {
    const rows = listSpecReviewRounds(store, { planId }).items,
      previous = previousRoundId
        ? store.get("review_rounds", previousRoundId)
        : null;
    if (
      previousRoundId &&
      (!previous?.spec ||
        previous.planId !== planId ||
        previous.state !== "done" ||
        previous.revisionHash === revisionHash)
    )
      fail(
        "Continue only a completed round of this plan at a new revision.",
        409,
      );
    const latest =
      previous && rows.filter((row) => row.pass === previous.pass).at(-1);
    if (previous && latest?.id !== previous.id) {
      if (latest?.revisionHash === revisionHash)
        return { round: latest, created: false };
      fail("Continue only the latest round of a review pass.", 409);
    }
    if (previous && previous.round >= limit && !(anyway && person))
      return { round: null, created: false, limited: true };
    const existing = rows
      .filter((row) => row.revisionHash === revisionHash)
      .at(-1);
    if (
      existing &&
      (existing.state !== "skipped" ||
        (existing.note === note &&
          existing.reviewerModel === reviewer &&
          existing.writerModel === writerModel &&
          existing.unproven === unproven))
    )
      return { round: store.get("review_rounds", existing.id), created: false };
    const now = new Date().toISOString(),
      round = {
        id: "plan-review-" + randomUUID(),
        planId,
        spec: plan.spec,
        revisionHash,
        pass: previous
          ? previous.pass
          : Math.max(0, ...rows.map((row) => row.pass)) + 1,
        round: previous ? previous.round + 1 : 1,
        reviewerModel: reviewer,
        writerModel,
        unproven: Boolean(unproven && !writerModel),
        state: note ? "skipped" : "running",
        note,
        slot: null,
        commits: structuredClone(commits),
        startedAt: now,
        endedAt: note ? now : null,
      };
    store.put("review_rounds", round);
    store.event(null, "plan.review.round", {
      planId,
      revisionHash,
      roundId: round.id,
      state: round.state,
    });
    return { round, created: true };
  });
}

// The dispatcher calls this after recording the session. The review binding
// is server-owned; submitting a different roundId cannot retarget a chat.
export function bindSpecReviewRound(store, { roundId, slot }) {
  return store.transaction(() => {
    const round = store.get("review_rounds", roundId);
    if (!round?.spec || round.state !== "running")
      fail("An active spec review round is required.", 409);
    if (!slot) fail("Bind a review session slot.");
    const record = store.get("session_bindings", slot);
    if (!record) fail("Review session not found.", 404);
    if (record.role !== "plan-review" || record.taskId !== round.id)
      fail("This session is not assigned to that review round.", 403);
    if (
      record.review &&
      (record.review.planId !== round.planId ||
        record.review.revisionHash !== round.revisionHash ||
        record.review.roundId !== round.id)
    )
      fail("This session is already bound to another review.", 409);
    if (round.slot && round.slot !== slot)
      fail("The review round is already bound to another session.", 409);
    const review = {
      planId: round.planId,
      revisionHash: round.revisionHash,
      roundId,
    };
    store.put("session_bindings", { ...record, review });
    if (slot) {
      round.slot = slot;
      store.put("review_rounds", round);
    }
    return round;
  });
}

function skipSpecReviewRound(store, round, note) {
  store.transaction(() => {
    const current = store.get("review_rounds", round.id);
    if (current?.state === "running") {
      // Findings that waited for the reviewer's model are not kept.
      const {
        pendingFindings: _pending,
        pendingSummary: _summary,
        ...rest
      } = current;
      store.put("review_rounds", {
        ...rest,
        state: "skipped",
        note,
        endedAt: new Date().toISOString(),
      });
    }
  });
  fail(note, 409);
}

function findingText(value, label, max = 10000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(`Each spec finding needs ${label} of 1–${max} characters.`);
  return value.trim();
}

export function createSpecReviewFindings(
  store,
  input,
  { caller, mcp = false } = {},
) {
  const slot = callerSlot(caller),
    binding = slot ? store.get("session_bindings", slot) : null,
    bound = binding?.review,
    roundId = input.roundId || bound?.roundId,
    round = roundId && store.get("review_rounds", roundId);
  if (
    (mcp && !slot) ||
    (caller && !slot) ||
    !bound ||
    !round?.spec ||
    bound.roundId !== round.id ||
    bound.planId !== input.planId ||
    bound.revisionHash !== input.revisionHash ||
    round.planId !== input.planId ||
    round.revisionHash !== input.revisionHash ||
    (slot && round.slot !== slot)
  )
    fail("This session is not authorized to review that plan revision.", 403);
  if (!["running", "done"].includes(round.state))
    fail("This review round is not active.", 409);
  const model =
    round.state === "done"
      ? round.reviewerModel
      : reportedPlanModel(store, { slot });
  if (!round.writerModel && !round.unproven)
    skipSpecReviewRound(
      store,
      round,
      "The model that wrote this revision is unknown; review skipped.",
    );
  // Kiro Crew may name a chat's model only once its turn ends. A reviewer
  // that submits mid-turn waits for that reading (settleSpecReviewRounds).
  const waitForModel =
    !model && round.state === "running" && slot && turnOpen(binding);
  if (!model && !waitForModel)
    skipSpecReviewRound(
      store,
      round,
      "The reviewer session has no proven reported model; review skipped.",
    );
  if (model && model === round.writerModel)
    skipSpecReviewRound(
      store,
      round,
      "The reviewer session ran on the model that wrote this revision; review skipped.",
    );
  const { files } = specRevision(store, round.planId, round.revisionHash),
    findings = input.findings ?? input.comments;
  if (!Array.isArray(findings) || findings.length > 50)
    fail("Submit at most 50 spec findings per round.");
  const checked = findings.map((finding) => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding))
      fail("Each spec finding must be an object.");
    if (!SPEC_FINDING_KINDS.includes(finding.kind))
      fail("Choose a supported spec finding kind.");
    if (!specSeverities.has(finding.severity))
      fail("Choose info, warn or blocker severity.");
    if (
      !REVISION_FILES.includes(finding.file) ||
      typeof files[finding.file] !== "string"
    )
      fail("A finding must name a file in the reviewed revision.");
    // The lines come from the quote, never from the reviewer (R104.3).
    if (
      typeof finding.quote !== "string" ||
      !finding.quote.trim() ||
      finding.quote.length > MAX_QUOTE
    )
      fail(
        `Each spec finding needs an exact quote of 1–${MAX_QUOTE} characters.`,
      );
    const lines = quoteLines(files[finding.file], finding.quote);
    if (!lines) fail("A finding's quote must occur exactly once in its file.");
    const quote = finding.quote.trim(),
      entry = {
        kind: finding.kind,
        severity: findingSeverity(finding.severity),
        file: finding.file,
        line: lines.lineStart,
        anchor: {
          file: finding.file,
          ...lines,
          quote,
          quoteHash: quoteHash(quote),
        },
        claim: findingText(finding.claim, "a claim"),
        evidence: findingText(finding.evidence, "evidence", 20000),
      };
    return { ...entry, fingerprint: digest(JSON.stringify([round.id, entry])) };
  });
  const summary = reviewSummaryText(input.summary);
  if (waitForModel)
    return store.transaction(() => {
      const current = store.get("review_rounds", round.id);
      if (current?.state !== "running")
        fail("This review round is not active.", 409);
      const waiting = {
        ...current,
        pendingFindings: checked,
        ...(summary ? { pendingSummary: summary } : {}),
      };
      store.put("review_rounds", waiting);
      return {
        planId: round.planId,
        revisionHash: round.revisionHash,
        round: waiting,
        pending: true,
        note: "Avoozl records these findings once Kiro Crew names this chat's model, after this turn ends. Nothing more to do.",
      };
    });
  return finishSpecReviewRound(store, round, checked, model, {
    slot,
    summary,
  });
}

// The reviewer's optional plain summary of the revision it read, shown on
// the spec page. Stored on the round, so it is cached per revision.
const MAX_SUMMARY = 800;
function reviewSummaryText(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim() || value.length > MAX_SUMMARY)
    fail(`A review summary must be 1–${MAX_SUMMARY} characters.`);
  return value.trim();
}

// A running or queued turn has not reported its model yet; a chat whose
// status was never read is treated the same.
const turnOpen = (binding) =>
  !["idle", "gone", "closed", "lost"].includes(binding?.status);

// Findings that waited for the reviewer's model: record them once the chat
// is idle and Kiro Crew names a model that differs from the writer's.
export function settleSpecReviewRounds(store) {
  for (const round of store.list("review_rounds")) {
    if (round.state !== "running" || !round.pendingFindings || !round.slot)
      continue;
    const binding = store.get("session_bindings", round.slot);
    if (binding && turnOpen(binding)) continue;
    const model = reportedPlanModel(store, { slot: round.slot });
    try {
      if (!model)
        skipSpecReviewRound(
          store,
          round,
          "The reviewer session has no proven reported model; review skipped.",
        );
      if (model === round.writerModel)
        skipSpecReviewRound(
          store,
          round,
          "The reviewer session ran on the model that wrote this revision; review skipped.",
        );
      finishSpecReviewRound(store, round, round.pendingFindings, model, {
        slot: round.slot,
        summary: round.pendingSummary ?? null,
      });
    } catch {
      // A skip is already recorded on the round.
    }
  }
}

function finishSpecReviewRound(
  store,
  round,
  submitted,
  model,
  { slot, summary = null },
) {
  return store.transaction(() => {
    const current = store.get("review_rounds", round.id);
    if (!["running", "done"].includes(current?.state))
      fail("This review round is not active.", 409);
    // A person rejected or resolved this in the same pass: drop the repeat.
    const pass = new Set(
        store
          .list("review_rounds")
          .filter(
            (row) =>
              row.planId === round.planId &&
              row.pass === round.pass &&
              row.id !== round.id,
          )
          .map((row) => row.id),
      ),
      settled = new Set(
        store
          .list("review_threads")
          .filter(
            (thread) =>
              thread.source === "plan-review" &&
              pass.has(thread.roundId) &&
              thread.anchor?.quoteHash &&
              settledByPerson(thread),
          )
          .map((thread) => thread.kind + ":" + thread.anchor.quoteHash),
      ),
      checked = submitted.filter(
        (entry) => !settled.has(entry.kind + ":" + entry.anchor?.quoteHash),
      ),
      dropped = submitted.length - checked.length;
    const existing = store
        .list("review_threads")
        .filter((thread) => thread.roundId === round.id),
      wanted = new Set(checked.map((entry) => entry.fingerprint));
    if (current.state === "done") {
      if (
        existing.length !== wanted.size ||
        existing.some((thread) => !wanted.has(thread.fingerprint))
      )
        fail("This round already has its final findings.", 409);
      return {
        planId: round.planId,
        revisionHash: round.revisionHash,
        round: current,
        threads: existing.map((thread) => ({ ...thread, existing: true })),
      };
    }
    const now = new Date().toISOString(),
      threads = [
        ...new Map(checked.map((entry) => [entry.fingerprint, entry])).values(),
      ].map((entry) => ({
        id: "review-" + randomUUID(),
        ...entry,
        source: "plan-review",
        roundId: round.id,
        planId: round.planId,
        revisionHash: round.revisionHash,
        state: "open",
        model,
        slot,
        author: "Plan reviewer",
        replies: [],
        createdAt: now,
      })),
      {
        pendingFindings: _pending,
        pendingSummary: _summary,
        ...rest
      } = current,
      done = {
        ...rest,
        reviewerModel: model,
        state: "done",
        endedAt: now,
        ...(summary ? { summary } : {}),
        ...(dropped
          ? {
              dropped,
              note: `Dropped ${dropped} ${dropped === 1 ? "finding" : "findings"} a person already rejected or resolved.`,
            }
          : {}),
      };
    for (const thread of threads) store.put("review_threads", thread);
    store.put("review_rounds", done);
    store.event(null, "plan.review.submitted", {
      planId: round.planId,
      revisionHash: round.revisionHash,
      roundId: round.id,
      threadIds: threads.map((thread) => thread.id),
    });
    return {
      planId: round.planId,
      revisionHash: round.revisionHash,
      round: done,
      threads,
    };
  });
}

function planRevision(store, planId, revisionHash) {
  const plan = store.get("plans", planId);
  if (!plan) fail("Plan not found.", 404);
  if (plan.hash !== revisionHash)
    fail("Review feedback must name the current exact plan revision.", 409);
  return plan;
}

function lineFor(text, quote) {
  const first = text.indexOf(quote);
  if (first < 0) return null;
  if (text.indexOf(quote, first + quote.length) >= 0) return "ambiguous";
  return {
    lineStart: text.slice(0, first).split("\n").length,
    lineEnd: text.slice(0, first + quote.length).split("\n").length,
  };
}

export function createReviewThreads(
  store,
  { planId, revisionHash, comments, author, provider, model, runId },
) {
  const plan = planRevision(store, planId, revisionHash);
  if (!Array.isArray(comments) || !comments.length || comments.length > 50)
    fail("Submit 1–50 substantive review comments.");
  const created = [];
  for (const comment of comments) {
    if (
      !comment ||
      typeof comment !== "object" ||
      typeof comment.quote !== "string" ||
      !comment.quote.trim() ||
      typeof comment.comment !== "string" ||
      !comment.comment.trim()
    )
      fail("Each review comment needs an exact quote and explanation.");
    const anchor = lineFor(plan.text, comment.quote);
    if (!anchor || anchor === "ambiguous")
      fail(
        "Each review quote must identify one exact passage in the revision.",
      );
    const severity = comment.severity || "important";
    if (!severities.has(severity))
      fail("Choose blocking, important, suggestion, or question severity.");
    if (
      comment.suggestion !== undefined &&
      typeof comment.suggestion !== "string"
    )
      fail("A review suggestion must be replacement text.");
    const fingerprint = digest(
      [
        planId,
        revisionHash,
        comment.quote,
        comment.comment,
        comment.suggestion || "",
      ].join("\0"),
    );
    const existing = store
      .list("review_threads")
      .find((thread) => thread.fingerprint === fingerprint);
    if (existing) {
      created.push({ ...existing, existing: true });
      continue;
    }
    const thread = {
      id: "review-" + randomUUID(),
      fingerprint,
      planId,
      revisionHash,
      ...anchor,
      quote: comment.quote,
      comment: comment.comment.trim(),
      suggestion: comment.suggestion,
      severity,
      state: "open",
      author: author || provider || "Reviewer",
      provider: provider || null,
      model: model || null,
      runId: runId || null,
      replies: [],
      createdAt: new Date().toISOString(),
    };
    store.put("review_threads", thread);
    created.push(thread);
  }
  store.event(null, "plan.review.submitted", {
    planId,
    revisionHash,
    threadIds: created.map((thread) => thread.id),
    runId: runId || null,
  });
  return { planId, revisionHash, threads: created };
}

export function listReviewThreads(
  store,
  { planId, state, revisionHash, roundId } = {},
) {
  const plan = planId ? store.get("plans", planId) : null;
  const items = store
    .list("review_threads")
    .filter(
      (thread) =>
        (!planId || thread.planId === planId) &&
        (!revisionHash || thread.revisionHash === revisionHash) &&
        (!roundId || thread.roundId === roundId) &&
        (!state || thread.state === state),
    )
    .map((thread) => {
      if (thread.source === "plan-review") {
        const current =
          (plan || store.get("plans", thread.planId))?.hash ===
          thread.revisionHash;
        return { ...thread, current, stale: !current, reanchored: null };
      }
      if (!plan || thread.revisionHash === plan.hash)
        return { ...thread, stale: false };
      const anchor = lineFor(plan.text, thread.quote);
      return {
        ...thread,
        stale: true,
        reanchored:
          anchor && anchor !== "ambiguous"
            ? { revisionHash: plan.hash, ...anchor }
            : null,
      };
    });
  return { items };
}

export function replyToReview(store, { id, text, author }) {
  const thread = store.get("review_threads", id);
  if (!thread) fail("Review thread not found.", 404);
  if (typeof text !== "string" || !text.trim() || text.length > 10000)
    fail("Write a review reply.");
  thread.replies ||= [];
  thread.replies.push({
    id: "reply-" + randomUUID(),
    author: author || "Local operator",
    text: text.trim(),
    at: new Date().toISOString(),
  });
  thread.updatedAt = new Date().toISOString();
  store.put("review_threads", thread);
  return thread;
}

export function disposeReview(store, { id, disposition, note, author }) {
  const thread = store.get("review_threads", id);
  if (!thread) fail("Review thread not found.", 404);
  if (!["resolved", "accepted", "rejected", "deferred"].includes(disposition))
    fail("Choose resolved, accepted, rejected, or deferred.");
  thread.state = "closed";
  thread.disposition = disposition;
  thread.disposedBy = author || "Local operator";
  thread.dispositionNote = note?.trim() || "";
  thread.disposedAt = new Date().toISOString();
  store.put("review_threads", thread);
  return thread;
}

export function applyReviewSuggestion(store, { id, expectedHash, author }) {
  const thread = store.get("review_threads", id);
  if (!thread) fail("Review thread not found.", 404);
  if (typeof thread.suggestion !== "string")
    fail("This review has no suggested replacement.", 409);
  const plan = planRevision(store, thread.planId, expectedHash);
  const anchor = lineFor(plan.text, thread.quote);
  if (!anchor || anchor === "ambiguous")
    fail("The reviewed passage no longer has one exact anchor.", 409);
  const next = plan.text.replace(thread.quote, thread.suggestion);
  const saved = savePlan(store, {
    id: plan.id,
    text: next,
    expectedHash: plan.hash,
  });
  disposeReview(store, {
    id,
    disposition: "accepted",
    note:
      "Applied the suggested replacement to plan revision " + saved.hash + ".",
    author,
  });
  return { plan: saved, thread: store.get("review_threads", id) };
}

export function reviewPrompt({ plan, pipeline, step, existing }) {
  return `Review this exact design revision as a senior software designer.

Revision: ${plan.hash}
Round: ${step.index + 1} of ${pipeline.sequence.length}

Find only material gaps: incorrect authority boundaries, unsafe failure behavior, missing product requirements, contradictions, or acceptance criteria that cannot prove the outcome. Do not nitpick wording, style, optional polish, or repeat an existing point. If the design is already sound, submit no new comments and say so.

Existing feedback to avoid repeating:
${JSON.stringify(existing.map((thread) => ({ quote: thread.quote, comment: thread.comment, state: thread.state })))}

Use plans_submit_review once with:
{"input":{"planId":"${plan.id}","revisionHash":"${plan.hash}","comments":[{"quote":"exact unique passage","severity":"blocking|important|suggestion|question","comment":"why this materially matters","suggestion":"optional exact replacement"}]}}

The quote must occur exactly once in the supplied design. Do not edit or approve the plan.`;
}
