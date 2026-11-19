// A writer observation belongs to the exact revision the attested caller
// stored. A later model switch or a manual reload cannot rewrite it.
import { digest } from "../model.mjs";
import { callerSlot } from "./delivery.mjs";
import { reportedPlanModel } from "./plan-reviews.mjs";

export const writerReceiptId = (planId, revisionHash) =>
  "plan-review-writer:" + digest(JSON.stringify([planId, revisionHash]));

export function recordPlanReviewWriter(
  store,
  plan,
  { previousHash, caller, slot: bound } = {},
) {
  if (!plan?.spec || previousHash === plan.hash) return null;
  const id = writerReceiptId(plan.id, plan.hash),
    existing = store.get("receipts", id);
  if (existing) return existing;
  // `slot` names a chat Avoozl opened and bound for this revision.
  const slot = bound || callerSlot(caller),
    source = slot ? { slot } : {};
  const binding = slot ? store.get("session_bindings", slot) : null;
  const receipt = {
    id,
    kind: "plan-review-writer",
    planId: plan.id,
    revisionHash: plan.hash,
    slot,
    actualModel: ["working", "queued"].includes(binding?.status)
      ? null
      : reportedPlanModel(store, source),
    at: new Date().toISOString(),
  };
  store.put("receipts", receipt);
  return receipt;
}

export function planReviewWriter(store, planId, revisionHash) {
  const receipt = store.get("receipts", writerReceiptId(planId, revisionHash));
  return receipt?.kind === "plan-review-writer" ? receipt : null;
}

// A first-turn save can precede the gateway's completed-turn model reading.
// Fill that missing observation only for the already recorded writer; never
// choose an actor from the active planners, and never replace a known model.
export function completePlanReviewWriter(store, planId, revisionHash) {
  const receipt = planReviewWriter(store, planId, revisionHash);
  if (!receipt || receipt.actualModel || !receipt.slot) return receipt;
  const binding = receipt.slot
    ? store.get("session_bindings", receipt.slot)
    : null;
  if (receipt.slot && ["working", "queued"].includes(binding?.status))
    return receipt;
  const model = reportedPlanModel(store, { slot: receipt.slot });
  if (!model) return receipt;
  const completed = {
    ...receipt,
    actualModel: model,
    observedAt: new Date().toISOString(),
  };
  store.put("receipts", completed);
  return completed;
}
