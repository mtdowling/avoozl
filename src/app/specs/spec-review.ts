// Human review of one exact spec revision. Comments stay in the workspace
// database, remain visible across spec revisions, and block approval until a
// person resolves them. Request changes records the reviewed revision and the
// exact open-comment snapshot that the spec editing chat receives.
import { randomUUID } from "node:crypto";
import { digest } from "../../model.ts";
import { canonical, fail, type Store } from "../store/store.ts";

interface ReviewPlan {
  id: string;
  spec?: string;
  hash: string;
  state?: string;
  files?: Record<string, string>;
  reviewStatus?: string;
  [key: string]: unknown;
}

export interface PlanReviewComment {
  id: string;
  planId: string;
  spec: string;
  revisionHash: string;
  file: string;
  lineStart: number | null;
  body: string;
  state: "open" | "resolved";
  author: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  [key: string]: unknown;
}

export interface PlanReviewRequest {
  id: string;
  planId: string;
  spec: string;
  revisionHash: string;
  disposition: "changes-requested" | "held";
  reason: string;
  commentIds: string[];
  commentSnapshot: string;
  requestedBy: string;
  requestedAt: string;
  state?: "open" | "closed";
  closedAt?: string;
  closedBy?: string;
  [key: string]: unknown;
}

const text = (value: unknown, label: string, limit = 4_000) => {
  if (typeof value !== "string" || !value.trim())
    fail(`${label} must be non-empty text.`);
  const trimmed = value.trim();
  if (trimmed.length > limit)
    fail(`${label} must be ${limit} characters or fewer.`);
  return trimmed;
};

const planFor = (store: Store, id: unknown) => {
  const plan = store.get<ReviewPlan>("plans", id);
  if (!plan) fail("Plan not found.", 404);
  if (!plan.spec) fail("Only a spec plan has a review.", 409);
  return plan;
};

const expectedPlan = (store: Store, id: unknown, expectedHash: unknown) => {
  const plan = planFor(store, id);
  if (typeof expectedHash !== "string" || plan.hash !== expectedHash)
    fail("The reviewed document hash changed.", 409);
  if (plan.state === "approved")
    fail(
      "This revision is already approved. Revise the spec before adding review findings.",
      409,
    );
  return plan;
};

const commentsFor = (store: Store, planId: string) =>
  store
    .list<PlanReviewComment>("plan_review_comments")
    .filter((comment) => comment.planId === planId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

const requestsFor = (store: Store, planId: string) =>
  store
    .list<PlanReviewRequest>("plan_review_requests")
    .filter((request) => request.planId === planId)
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));

const snapshotOf = (comments: PlanReviewComment[]) =>
  digest(
    canonical(
      comments.map((comment) => ({
        id: comment.id,
        revisionHash: comment.revisionHash,
        file: comment.file,
        lineStart: comment.lineStart,
        body: comment.body,
        state: comment.state,
        resolution: comment.resolution ?? null,
        resolvedBy: comment.resolvedBy ?? null,
        resolvedAt: comment.resolvedAt ?? null,
      })),
    ),
  );

export function planReview(store: Store, planId: string) {
  const plan = planFor(store, planId),
    comments = commentsFor(store, plan.id),
    open = comments.filter((comment) => comment.state === "open"),
    requests = requestsFor(store, plan.id),
    currentChanges = requests
      .filter(
        (request) =>
          request.disposition === "changes-requested" &&
          request.state !== "closed" &&
          request.revisionHash === plan.hash,
      )
      .at(-1),
    status =
      plan.reviewStatus === "held"
        ? "held"
        : currentChanges
          ? "changes-requested"
          : open.length
            ? "commented"
            : "open",
    latestRequest = requests.at(-1) ?? null;
  const activeRequest =
    status === "held"
      ? requests
          .filter(
            (request) =>
              request.disposition === "held" && request.state !== "closed",
          )
          .at(-1)
      : status === "changes-requested"
        ? currentChanges
        : null;
  return {
    status,
    comments: comments.map((comment) => ({
      ...comment,
      current: comment.revisionHash === plan.hash,
    })),
    openCount: open.length,
    currentOpenCount: open.filter(
      (comment) => comment.revisionHash === plan.hash,
    ).length,
    commentSnapshot: snapshotOf(comments),
    latestRequest: latestRequest
      ? { ...latestRequest, current: latestRequest.revisionHash === plan.hash }
      : null,
    activeRequest: activeRequest
      ? { ...activeRequest, current: activeRequest.revisionHash === plan.hash }
      : null,
  };
}

export function addPlanReviewComment(
  store: Store,
  input: Record<string, unknown>,
  author: string,
) {
  return store.transaction(() => {
    const plan = expectedPlan(store, input.id, input.expectedHash),
      file = text(input.file, "file", 240);
    if (!plan.files || typeof plan.files[file] !== "string")
      fail(`${file} is not a file in this spec revision.`, 409);
    const lineStart =
      input.lineStart === undefined || input.lineStart === null
        ? null
        : Number(input.lineStart);
    if (
      lineStart !== null &&
      (!Number.isInteger(lineStart) ||
        lineStart < 1 ||
        lineStart > plan.files[file].split("\n").length)
    )
      fail("lineStart must name a line in the reviewed file.");
    const comment: PlanReviewComment = {
      id: "plan-review-comment-" + randomUUID(),
      planId: plan.id,
      spec: plan.spec as string,
      revisionHash: plan.hash,
      file,
      lineStart,
      body: text(input.body, "body"),
      state: "open",
      author: text(author, "author", 240),
      createdAt: new Date().toISOString(),
    };
    store.put("plan_review_comments", comment);
    if (!["held", "changes-requested"].includes(plan.reviewStatus ?? ""))
      plan.reviewStatus = "commented";
    store.put("plans", plan);
    store.event(null, "plan.review.commented", {
      planId: plan.id,
      commentId: comment.id,
      hash: plan.hash,
      file,
      lineStart,
    });
    return comment;
  });
}

export function resolvePlanReviewComment(
  store: Store,
  input: Record<string, unknown>,
  resolver: string,
) {
  return store.transaction(() => {
    const comment = store.get<PlanReviewComment>(
      "plan_review_comments",
      input.commentId,
    );
    if (!comment) fail("Review comment not found.", 404);
    const plan = planFor(store, comment.planId);
    if (comment.state === "resolved") return { ...comment, existing: true };
    const at = new Date().toISOString();
    Object.assign(comment, {
      state: "resolved",
      resolvedAt: at,
      resolvedBy: text(resolver, "resolver", 240),
      ...(typeof input.resolution === "string" && input.resolution.trim()
        ? { resolution: text(input.resolution, "resolution") }
        : {}),
    });
    store.put("plan_review_comments", comment);
    const open = commentsFor(store, plan.id).some(
      (item) => item.state === "open",
    );
    if (plan.reviewStatus !== "held")
      plan.reviewStatus = open ? "commented" : "open";
    store.put("plans", plan);
    store.event(null, "plan.review.resolved", {
      planId: plan.id,
      commentId: comment.id,
      hash: comment.revisionHash,
    });
    return comment;
  });
}

function recordPlanReviewRequest(
  store: Store,
  input: Record<string, unknown>,
  requestedBy: string,
  disposition: PlanReviewRequest["disposition"],
) {
  return store.transaction(() => {
    const plan = expectedPlan(store, input.id, input.expectedHash),
      review = planReview(store, plan.id),
      reason =
        typeof input.reason === "string" && input.reason.trim()
          ? text(input.reason, "reason")
          : "";
    if (review.status === "held" && disposition !== "held")
      fail("Resume this held review before requesting changes.", 409);
    if (review.status === "held" && disposition === "held")
      fail("This spec review is already held.", 409);
    if (disposition === "changes-requested" && !review.openCount && !reason)
      fail("Add a review comment or explain the requested change.");
    if (disposition === "held" && !reason)
      fail("Explain why this spec is held.");
    const request: PlanReviewRequest = {
      id: "plan-review-request-" + randomUUID(),
      planId: plan.id,
      spec: plan.spec as string,
      revisionHash: plan.hash,
      disposition,
      reason,
      commentIds: review.comments
        .filter((comment) => comment.state === "open")
        .map((comment) => comment.id),
      commentSnapshot: review.commentSnapshot,
      requestedBy: text(requestedBy, "requester", 240),
      requestedAt: new Date().toISOString(),
      state: "open",
    };
    store.put("plan_review_requests", request);
    plan.reviewStatus = disposition;
    store.put("plans", plan);
    store.event(null, `plan.review.${disposition}`, {
      planId: plan.id,
      requestId: request.id,
      hash: plan.hash,
      commentIds: request.commentIds,
    });
    return { ...request, comments: review.comments };
  });
}

export const requestPlanChanges = (
  store: Store,
  input: Record<string, unknown>,
  requestedBy: string,
) => recordPlanReviewRequest(store, input, requestedBy, "changes-requested");

export const holdPlanReview = (
  store: Store,
  input: Record<string, unknown>,
  requestedBy: string,
) => recordPlanReviewRequest(store, input, requestedBy, "held");

export function resumePlanReview(
  store: Store,
  input: Record<string, unknown>,
  resumedBy: string,
) {
  return store.transaction(() => {
    const plan = expectedPlan(store, input.id, input.expectedHash);
    if (plan.reviewStatus !== "held")
      fail("This spec review is not held.", 409);
    const resumedByText = text(resumedBy, "resumer", 240),
      request = requestsFor(store, plan.id)
        .filter(
          (item) => item.disposition === "held" && item.state !== "closed",
        )
        .at(-1),
      at = new Date().toISOString();
    if (request) {
      request.state = "closed";
      request.closedAt = at;
      request.closedBy = resumedByText;
      store.put("plan_review_requests", request);
    }
    delete plan.reviewStatus;
    store.put("plans", plan);
    store.event(null, "plan.review.resumed", {
      planId: plan.id,
      hash: plan.hash,
      requestId: request?.id ?? null,
      resumedBy: resumedByText,
    });
    return planReview(store, plan.id);
  });
}

export function assertPlanReviewComplete(store: Store, planId: string) {
  const review = planReview(store, planId);
  if (review.openCount)
    fail(
      `${review.openCount} unresolved review ${review.openCount === 1 ? "comment blocks" : "comments block"} approval.`,
      409,
    );
  if (review.status === "held") fail("This spec review is held.", 409);
  if (review.status === "changes-requested")
    fail("This spec revision has requested changes.", 409);
  return review;
}
