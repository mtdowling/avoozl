// Landed work (workflow v1 rule 13.6, simplify SM4.1): once a task's work is
// on the base, its tick goes on the done branch if it is missing, in its own
// commit (a plans repository's specs branch), and then the claim branch this
// runner created goes with its leases. A tick that fails keeps the claim, so
// no runner takes the task again, and the next pass tries again.
import { tickPlansRepo } from "../specs/spec-ticks.mjs";
import { cachedOwnClaims, deleteOwnClaim } from "../workers/claims.mjs";
import { landingAction } from "./landing-action.mjs";

// One landed entry ({spec, tasks}) at `candidate`, the commit on the base.
// Returns whether its tick is on the done branch.
export async function finishLanded(
  store,
  github,
  { repository, entry, candidate, workspaceRoot, env },
) {
  const ticked = await tickPlansRepo(store, {
    entry,
    candidate,
    repository,
    workspaceRoot,
    env,
  }).catch(() => null);
  if (!ticked?.done) return false;
  if (
    repository.github &&
    landingAction({ landed: true, base: repository.baseBranch })
      .deleteClaimBranch
  )
    for (const { task } of entry.tasks)
      await deleteOwnClaim(store, github, repository.github, task).catch(
        () => false,
      );
  return true;
}

// Every own claim whose task has landed but whose claim branch is still
// here: its tick or its delete did not go through. Each is finished again.
export async function retryLanded(store, github, { workspaceRoot, env } = {}) {
  const tasks = new Map(store.read().tasks.map((task) => [task.id, task])),
    repositories = store.list("repositories");
  let finished = 0;
  for (const claim of cachedOwnClaims(store)) {
    const task = tasks.get(claim.task),
      repository = repositories.find((r) => r.github === claim.repository);
    if (!task?.integration?.commit || !repository) continue;
    if (
      await finishLanded(store, github, {
        repository,
        entry: { spec: task.planId, tasks: [{ task: task.id }] },
        candidate: task.integration.commit,
        workspaceRoot,
        env,
      })
    )
      finished += 1;
  }
  return finished;
}
