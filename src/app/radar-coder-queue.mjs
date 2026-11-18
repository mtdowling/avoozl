// The Release queue and the Step click (RC4.5, design D6). No repository is
// Radar-coded any more (R91.6), so the queue holds only mirror forwards; a
// Step click still records its receipt.
import { fail } from "./store.mjs";
import { mirrorForwards } from "./mirror-forward.mjs";
import { stepReceiptId } from "./radar-coder-release.mjs";

const phaseOf = (task) => task.phase?.id ?? "";
const phaseName = (task) => task.phase?.title || task.phase?.id || "No phase";

// Phases of one plan in release order, each with whether its click is done.
function stepsOf(store, data, plan) {
  const seen = new Map();
  for (const task of data.tasks)
    if (task.planId === plan.id && task.authority !== "local")
      if (!seen.has(phaseOf(task)))
        seen.set(phaseOf(task), {
          planId: plan.id,
          phase: phaseOf(task),
          title: phaseName(task),
          released: Boolean(
            store.get("receipts", stepReceiptId(plan.id, task)),
          ),
        });
  return [...seen.values()];
}

export function releaseQueue(store) {
  return {
    repositories: [],
    // Merged in a private mirror and not yet public (RC24.5).
    forwards: mirrorForwards(store).filter(
      (record) => record.state !== "public_merged",
    ),
  };
}

// The Step click (RC4.5): releases the next phase of a plan that has no click
// yet. The tick labels its tasks, up to capacity, on its next pass.
export function releaseStep(store, input = {}, { by, now = Date.now() } = {}) {
  const plan = store.get("plans", String(input.planId ?? ""));
  if (!plan || plan.state !== "approved")
    fail("That plan is not approved.", 404);
  const data = store.read(),
    next = stepsOf(store, data, plan).find((step) => !step.released);
  if (!next) fail("Every phase of this plan is already released.", 409);
  store.put("receipts", {
    id: `release-step:${plan.id}:${next.phase}`,
    planId: plan.id,
    phase: next.phase,
    by,
    at: new Date(now).toISOString(),
  });
  return { planId: plan.id, phase: next.phase, title: next.title };
}
