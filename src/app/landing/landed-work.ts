// Landed work (workflow v1 rule 16.5, simplify SM4.1): once a task's work is
// on the base, its tick goes on the done branch if it is missing, in its own
// commit (a plans repository's specs branch), and then the claim branch this
// runner created goes with its leases. A tick that fails keeps the claim, so
// no runner takes the task again, and the next pass tries again.
import { tickPlansRepo } from "../specs/spec-ticks.ts";
import { cachedOwnClaims, deleteOwnClaim } from "../workers/claims.ts";
import { landingAction } from "./landing-action.ts";
import { closeLanded, landingSpecOf } from "../specs/labeled-issues.ts";
import type { Store } from "../store/store.ts";
import type { Repository } from "../git/git.ts";
import { type QueuedTask, taskIds } from "./landing-queue.ts";

// One landed entry: its spec and its tasks.
type Entry = { spec: unknown; tasks: QueuedTask[] };
// Where the landing runs.
type Where = { workspaceRoot?: string; env?: NodeJS.ProcessEnv };
type GitHub = Parameters<typeof closeLanded>[0];

// One landed entry ({spec, tasks}) at `candidate`, the commit on the base.
// Returns whether its tick is on the done branch.
export async function finishLanded(
  store: Store,
  github: GitHub | null | undefined,
  {
    repository,
    entry,
    candidate,
    workspaceRoot,
    env,
  }: Where & { repository: Repository; entry: Entry; candidate: string },
) {
  const tasks = new Map(store.read().tasks.map((task) => [task.id, task])),
    issues = taskIds(entry)
      .map((id) => tasks.get(id))
      .filter((task) => task?.labeledIssue);
  // A labeled issue's landing record is the issue closing (rule 11.3): its
  // pull request's `Closes #<n>` closes it in `pr` mode, and in `direct`
  // mode Avoozl closes it with a comment naming the commit.
  if (issues.length) {
    if (repository.landing === "direct")
      for (const task of issues)
        if (
          !(await (github
            ? closeLanded(github, task, candidate)
            : Promise.resolve(false)
          ).catch(() => false))
        )
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
    for (const task of taskIds(entry))
      await deleteOwnClaim(store, github, repository.github, task).catch(
        () => false,
      );
  return true;
}

// Every own claim whose task has landed but whose claim branch is still
// here: its tick or its delete did not go through. Each is finished again.
export async function retryLanded(
  store: Store,
  github: GitHub,
  { workspaceRoot, env }: Where = {},
) {
  const tasks = new Map(store.read().tasks.map((task) => [task.id, task])),
    repositories = store.list<Repository>("repositories");
  let finished = 0;
  for (const claim of cachedOwnClaims(store) as {
    task: string;
    repository: string;
  }[]) {
    const task = tasks.get(claim.task),
      repository = repositories.find((r) => r.github === claim.repository);
    const commit = task?.integration?.commit;
    if (!task || !commit || !repository) continue;
    if (
      await finishLanded(store, github, {
        repository,
        entry: { spec: landingSpecOf(task), tasks: [{ task: task.id }] },
        candidate: commit,
        workspaceRoot,
        env,
      })
    )
      finished += 1;
  }
  return finished;
}
