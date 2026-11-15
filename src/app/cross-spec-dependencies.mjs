import { parseSpec } from "./spec-plans.mjs";
import { fail } from "./store.mjs";

// Only stored revisions declare a foreign task. Reading another folder must
// not create tasks or silently approve the folder's contents.
export function specDeclarations(plans) {
  const result = new Map();
  for (const plan of plans) {
    if (!plan.spec || plan.deletedAt || !plan.files) continue;
    for (const proposal of parseSpec({
      name: plan.spec,
      exists: true,
      files: plan.files,
    }).proposals) {
      if (result.has(proposal.id))
        fail(`Task ${proposal.id} is declared by more than one spec.`, 409);
      result.set(proposal.id, {
        ...proposal,
        planId: plan.id,
        spec: plan.spec,
        ...(proposal.projectId || plan.context?.projectId
          ? { projectId: proposal.projectId || plan.context.projectId }
          : {}),
      });
    }
  }
  return [...result.values()];
}

export function declaredDependencies(
  plan,
  proposals,
  declarations,
  existingTasks = [],
  plans = [],
) {
  const own = new Set(proposals.map((proposal) => proposal.id)),
    index = new Map(declarations.map((entry) => [entry.id, entry])),
    result = new Map();
  for (const proposal of proposals)
    for (const kind of ["requires", "sequence", "supports"])
      for (const taskId of proposal[kind] || []) {
        if (own.has(taskId)) continue;
        const existing = existingTasks.find((task) => task.id === taskId),
          owner = plans.find(
            (entry) => entry.id === existing?.planId && entry.spec,
          ),
          declaration =
            index.get(taskId) ||
            (owner ? { planId: owner.id, spec: owner.spec } : null);
        if (!declaration || declaration.planId === plan.id) continue;
        if (declaration.taskId)
          fail(
            `Foreign task ${taskId} reuses another task; name its actual owner instead.`,
            409,
          );
        result.set(taskId, {
          taskId,
          spec: declaration.spec,
          planId: declaration.planId,
        });
      }
  return [...result.values()];
}
