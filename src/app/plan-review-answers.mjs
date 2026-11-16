import { callerSlot } from "./delivery.mjs";
import { fail } from "./store.mjs";
import { planReviewWriter } from "./plan-review-authorship.mjs";

export const answerReceiptId = (roundId) => "plan-answer:" + roundId;

export function assertPlanAnswerWrite(store, { id }, { caller } = {}) {
  const binding = store.get("session_bindings", callerSlot(caller)),
    scope = binding?.planAnswer;
  if (!scope) return;
  const plan = store.get("plans", id),
    receipt = store.get("receipts", answerReceiptId(scope.roundId));
  if (
    id !== scope.planId ||
    plan?.state !== "draft" ||
    plan.deletedAt ||
    plan.archivedAt ||
    receipt?.state !== "running" ||
    receipt.permissionClass === "read" ||
    (plan.hash !== scope.revisionHash &&
      planReviewWriter(store, id, plan.hash)?.slot !== binding.slot)
  )
    fail("This planner may change only its own still-draft spec.", 403);
}

export function reviewFindings(store, { planId, roundId, revisionHash } = {}) {
  const plan = store.get("plans", planId);
  if (!plan?.spec || plan.deletedAt) fail("Spec plan not found.", 404);
  if (roundId) {
    const round = store.get("review_rounds", roundId);
    if (!round?.spec || round.planId !== plan.id)
      fail("Review round not found.", 404);
  }
  return {
    planId: plan.id,
    revisionHash: revisionHash || plan.hash,
    findings: store
      .list("review_threads")
      .filter(
        (thread) =>
          thread.source === "plan-review" &&
          thread.planId === plan.id &&
          (!roundId || thread.roundId === roundId) &&
          (!revisionHash || thread.revisionHash === revisionHash),
      )
      .map((thread) => ({
        ...thread,
        current: thread.revisionHash === plan.hash,
        stale: thread.revisionHash !== plan.hash,
      })),
  };
}

export function bindPlanAnswerSession(store, { roundId, slot }) {
  const round = store.get("review_rounds", roundId),
    binding = store.get("session_bindings", slot),
    receipt = store.get("receipts", answerReceiptId(roundId));
  if (
    !round?.spec ||
    round.state !== "done" ||
    !receipt ||
    !["queued", "running"].includes(receipt.state) ||
    binding?.role !== "plan-answer" ||
    binding.taskId !== roundId
  )
    fail("This session is not assigned to that planner answer.", 403);
  if (receipt.slot && receipt.slot !== slot)
    fail("The answer already has a planner session.", 409);
  const planAnswer = {
    roundId,
    planId: round.planId,
    revisionHash: round.revisionHash,
  };
  store.put("session_bindings", { ...binding, planAnswer });
  store.put("receipts", { ...receipt, slot, state: "running" });
  return planAnswer;
}

function revisionExists(plan, hash) {
  return (
    hash === plan.hash ||
    (plan.history || []).some((revision) => revision.hash === hash)
  );
}

// Findings stay open until a person disposes them. A planner answer only
// records its own response; it neither closes a finding nor approves a plan.
export function answerReview(
  store,
  { planId, roundId, answers },
  { caller } = {},
) {
  const slot = callerSlot(caller),
    binding = slot && store.get("session_bindings", slot),
    scope = binding?.planAnswer,
    round = store.get("review_rounds", roundId),
    plan = store.get("plans", planId),
    receipt = store.get("receipts", answerReceiptId(roundId));
  if (
    !slot ||
    binding?.role !== "plan-answer" ||
    scope?.roundId !== roundId ||
    scope?.planId !== planId ||
    !round?.spec ||
    round.planId !== planId ||
    round.state !== "done" ||
    !plan?.spec ||
    receipt?.slot !== slot ||
    !["running", "done"].includes(receipt.state)
  )
    fail("Only the bound planner may answer this review round.", 403);
  if (!Array.isArray(answers) || !answers.length || answers.length > 50)
    fail("Answer 1–50 findings from this round.");
  const ids = new Set(),
    checked = answers.map((answer) => {
      const thread = answer && store.get("review_threads", answer.id);
      if (
        !thread ||
        thread.source !== "plan-review" ||
        thread.roundId !== roundId ||
        thread.planId !== planId ||
        ids.has(thread.id)
      )
        fail("Answer each finding in this round at most once.");
      ids.add(thread.id);
      if (!["fixed", "answered"].includes(answer.action))
        fail("Choose fixed or answered for each finding.");
      if (
        (answer.text !== undefined && typeof answer.text !== "string") ||
        (answer.text?.length || 0) > 10000 ||
        (answer.action === "answered" && !answer.text?.trim())
      )
        fail("Each answer needs a reason of 1–10000 characters.");
      let revisionHash;
      if (answer.action === "fixed") {
        if (
          plan.state !== "draft" ||
          plan.deletedAt ||
          plan.archivedAt ||
          receipt.permissionClass === "read"
        )
          fail("This spec accepts answered findings only.", 409);
        revisionHash = answer.revisionHash;
        const writer = planReviewWriter(store, planId, revisionHash);
        if (
          !revisionHash ||
          revisionHash === round.revisionHash ||
          !revisionExists(plan, revisionHash) ||
          writer?.slot !== slot
        )
          fail(
            "A fixed answer must name a stored revision this planner wrote.",
            409,
          );
      } else if (answer.revisionHash !== undefined)
        fail("Only a fixed answer names a revision hash.");
      const value = {
        action: answer.action,
        ...(revisionHash ? { revisionHash } : {}),
        text: answer.text?.trim() || "",
        slot,
      };
      if (
        thread.answer &&
        (thread.answer.action !== value.action ||
          thread.answer.revisionHash !== value.revisionHash ||
          thread.answer.text !== value.text ||
          thread.answer.slot !== slot)
      )
        fail("This finding already has its planner answer.", 409);
      return { thread, value };
    });
  return store.transaction(() => {
    const now = new Date().toISOString();
    for (const { thread, value } of checked) {
      const latest = store.get("review_threads", thread.id);
      if (
        latest.answer &&
        (latest.answer.action !== value.action ||
          latest.answer.revisionHash !== value.revisionHash ||
          latest.answer.text !== value.text ||
          latest.answer.slot !== slot)
      )
        fail("This finding already has its planner answer.", 409);
      if (!latest.answer)
        store.put("review_threads", {
          ...latest,
          answer: { ...value, at: now },
        });
    }
    const currentPlan = store.get("plans", planId),
      findings = reviewFindings(store, { planId, roundId }).findings,
      complete = findings.every((finding) => finding.answer),
      resultHash =
        currentPlan.hash !== round.revisionHash &&
        planReviewWriter(store, planId, currentPlan.hash)?.slot === slot
          ? currentPlan.hash
          : null;
    if (complete && receipt.state !== "done")
      store.put("receipts", {
        ...receipt,
        state: "done",
        endedAt: now,
        resultHash,
      });
    return { planId, roundId, complete, findings };
  });
}
