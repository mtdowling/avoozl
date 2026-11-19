// Where each mirror change lands on the public repository, and which epics
// forward as one pull request (RC26.1 to RC26.4, design D31.1). The target of
// a record comes from its task's epic manifest, then the repository's mirror
// setting, then the default (`forwardTargetOf`).
//
// shortcut: an epic's own `publicBranch` is synced and watched only for epics
// that name an integration branch (the same plan-to-repository rule the
// integration sync uses); a `branch` epic without one needs the repository's
// `publicBranch`.
import { syncTargets } from "./integration-sync.mjs";
import { forwardTargetOf } from "./mirror-policy.mjs";
import { specFacts } from "./spec-plans.mjs";

// The facts of the spec a plan was approved from, or null.
export function planManifest(store, plan) {
  const files = store.get("approvals", plan?.approvalId)?.files;
  return files?.["tasks.md"] === undefined ? null : specFacts(files);
}

// The epics of a repository that forward in one batch: approved, with an
// integration branch and the `batch` target in force.
export function batchEpics(store, policy, repository) {
  const mirror = policy?.repositories?.[repository]?.mirror;
  if (!mirror) return [];
  return syncTargets(store, policy)
    .targets.filter((target) => target.repository === repository)
    .map((target) => {
      const plan = store
          .list("plans")
          .find((p) => p.spec === target.spec && p.approvalId),
        manifest = planManifest(store, plan);
      let wanted;
      try {
        wanted = forwardTargetOf(mirror, manifest);
      } catch {
        return null;
      }
      return wanted.forwardTarget === "batch"
        ? { plan, branch: target.branch, ...wanted }
        : null;
    })
    .filter(Boolean);
}

// The public branches a repository's mirror keeps a copy of (RC26.3): the
// repository's own, and each integration-branch epic's.
export function publicBranchesOf(store, policy, repository, mirror) {
  const names = new Set(mirror?.publicBranch ? [mirror.publicBranch] : []);
  for (const target of syncTargets(store, policy).targets) {
    if (target.repository !== repository) continue;
    const plan = store
      .list("plans")
      .find((p) => p.spec === target.spec && p.approvalId);
    try {
      const wanted = forwardTargetOf(mirror, planManifest(store, plan));
      if (wanted.forwardTarget !== "each" && wanted.publicBranch)
        names.add(wanted.publicBranch);
    } catch {
      // a manifest the lint already refuses
    }
  }
  return [...names];
}

// A batch epic is done when it has tasks and every one is in a complete status.
export function epicDone(store, plan) {
  const data = store.read(),
    done = new Set(data.statuses.filter((s) => s.complete).map((s) => s.id)),
    tasks = data.tasks.filter((t) => t.planId === plan.id);
  return tasks.length > 0 && tasks.every((t) => done.has(t.status));
}

export const batchId = (plan) => `batch:${plan.id}`;
