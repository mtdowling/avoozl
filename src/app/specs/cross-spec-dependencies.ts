import { parseSpec } from "./spec-plans.ts";
import { fail } from "../store/store.ts";

// A task a spec proposes, with the links it names.
interface Proposal {
  id: string;
  requires?: string[];
  sequence?: string[];
  supports?: string[];
  repositoryId?: string;
  [key: string]: unknown;
}
// A stored plan revision.
interface PlanRow {
  id: string;
  spec?: string;
  deletedAt?: string;
  files?: Record<string, string>;
  context?: { repositoryId?: string };
}
// Who declares a task: its plan and spec.
interface Declaration {
  id?: string;
  planId: string;
  spec?: string;
  taskId?: string;
  [key: string]: unknown;
}
const KINDS = ["requires", "sequence", "supports"] as const;

// Only stored revisions declare a foreign task. Reading another folder must
// not create tasks or silently approve the folder's contents.
export function specDeclarations(plans: PlanRow[]): Declaration[] {
  const result = new Map<string, Declaration>();
  for (const plan of plans) {
    if (!plan.spec || plan.deletedAt || !plan.files) continue;
    for (const proposal of parseSpec({
      name: plan.spec,
      exists: true,
      files: plan.files,
    }).proposals as Proposal[]) {
      if (result.has(proposal.id))
        fail(`Task ${proposal.id} is declared by more than one spec.`, 409);
      result.set(proposal.id, {
        ...proposal,
        planId: plan.id,
        spec: plan.spec,
        ...(proposal.repositoryId || plan.context?.repositoryId
          ? {
              repositoryId: proposal.repositoryId || plan.context?.repositoryId,
            }
          : {}),
      });
    }
  }
  return [...result.values()];
}

export function declaredDependencies(
  plan: { id: string },
  proposals: Proposal[],
  declarations: Declaration[],
  existingTasks: { id: string; planId?: unknown }[] = [],
  plans: PlanRow[] = [],
) {
  const own = new Set(proposals.map((proposal) => proposal.id)),
    index = new Map(declarations.map((entry) => [entry.id, entry])),
    result = new Map<
      string,
      { taskId: string; spec?: string; planId: string }
    >();
  for (const proposal of proposals)
    for (const kind of KINDS)
      for (const taskId of proposal[kind] || []) {
        if (own.has(taskId)) continue;
        const existing = existingTasks.find((task) => task.id === taskId),
          owner = plans.find(
            (entry) => entry.id === existing?.planId && entry.spec,
          ),
          declaration: Declaration | null =
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
