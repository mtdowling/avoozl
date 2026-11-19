import { fail } from "../store/store.mjs";
import { planReviewSummary } from "./plan-review-summary.mjs";
import { planReviewWriter } from "./plan-review-authorship.mjs";
import { reviewFindings } from "./plan-review-answers.mjs";

export function currentPlanReview(store, { id, planId, spec } = {}) {
  const name = planId || id || spec;
  let plan = store.get("plans", name);
  if (!plan) {
    const matches = store
      .list("plans")
      .filter((row) => row.spec === name && !row.deletedAt);
    if (matches.length > 1)
      fail("More than one plan uses that spec name. Use a plan ID.", 409);
    plan = matches[0];
  }
  if (!plan?.spec || plan.deletedAt) fail("Spec plan not found.", 404);
  return {
    planId: plan.id,
    spec: plan.spec,
    revisionHash: plan.hash,
    writerModel:
      planReviewWriter(store, plan.id, plan.hash)?.actualModel ?? null,
    review: planReviewSummary(store, plan.id),
    ...reviewFindings(store, { planId: plan.id, revisionHash: plan.hash }),
  };
}
