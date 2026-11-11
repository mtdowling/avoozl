import { randomUUID } from "node:crypto";
import { digest } from "../model.mjs";
import { savePlan } from "./plans.mjs";
import { fail } from "./store.mjs";

const severities = new Set(["blocking", "important", "suggestion", "question"]);

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

export function listReviewThreads(store, { planId, state } = {}) {
  const plan = planId ? store.get("plans", planId) : null;
  const items = store
    .list("review_threads")
    .filter(
      (thread) =>
        (!planId || thread.planId === planId) &&
        (!state || thread.state === state),
    )
    .map((thread) => {
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
