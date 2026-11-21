// @ts-nocheck: typing debt
// Landed work (workflow v1 rule 16.5, simplify SM4.1): once a task's work is
// on the base, its tick goes on the done branch if it is missing, in its own
// commit (a plans repository's specs branch), and then the claim branch this
// runner created goes with its leases. A tick that fails keeps the claim, so
// no runner takes the task again, and the next pass tries again.
import { tickPlansRepo } from "../specs/spec-ticks.ts";
import { cachedOwnClaims, deleteOwnClaim } from "../workers/claims.ts";
import { landingAction } from "./landing-action.ts";
import { closeLanded, landingSpecOf } from "../specs/labeled-issues.ts";

// One landed entry ({spec, tasks}) at `candidate`, the commit on the base.
// Returns whether its tick is on the done branch.
export async function finishLanded(
  store,
  github,
  { repository, entry, candidate, workspaceRoot, env },
) {
  const tasks = new Map(store.read().tasks.map((task) => [task.id, task])),
    issues = entry.tasks
      .map(({ task }) => tasks.get(task))
      .filter((task) => task?.labeledIssue);
  // A labeled issue's landing record is the issue closing (rule 11.3): its
  // pull request's `Closes #<n>` closes it in `pr` mode, and in `direct`
  // mode Avoozl closes it with a comment naming the commit.
  if (issues.length) {
    if (repository.landing === "direct")
      for (const task of issues)
        if (!(await closeLanded(github, task, candidate).catch(() => false)))
          return false;
  } else {
    const ticked = await tickPlansRepo(store, {
      entry,
      candidate,
      repository,
      workspaceRoot,
      env,
    }).catch(() => null);
    if (!ticked?.done) return false;
  }
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
        entry: { spec: landingSpecOf(task), tasks: [{ task: task.id }] },
        candidate: task.integration.commit,
        workspaceRoot,
        env,
      })
    )
      finished += 1;
  }
  return finished;
}
