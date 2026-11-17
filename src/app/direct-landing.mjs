// The tick lands `direct` projects' verified work on the registered remote
// (Requirements 87.1, 87.2, 88.6, design §4.26 Land; task 41.9).
//
// - A verified task in a project with `landing: "direct"` is queued as one
//   portion for its base (`enqueueLanding`). Nothing is pushed yet.
// - Each tick takes the head of each queue one step (`landNext` with
//   `directSteps`, landing-trains.mjs): merge it with origin's current
//   base, run the project's checks on that exact candidate, write the
//   intent in the spec's journal, and push a guarded fast-forward. Never
//   forced.
// - Landed: the task is integrated at the candidate, the local base is
//   fast-forwarded from origin, and the task's worktree and local branch
//   are removed. Failed checks go back to the worker chat; a conflict uses
//   `sendConflictBack`; each for `landing.conflictRounds` rounds.
// - A queued task whose base moved is withdrawn by integrateVerified
//   (`stillQueued`, pr-landing.mjs), merged with the base and verified again.
//
// shortcut: one task per portion and no train across tasks; upgrade when
// batches land directly.
import { git, removeLandedTaskWorktree } from "./git.mjs";
import { enqueueLanding, landingQueue, landNext } from "./landing-queue.mjs";
import { directSteps } from "./landing-trains.mjs";
import { sendConflictBack } from "./landing-conflicts.mjs";
import { markLanded, sendFailureBack, syncBase } from "./pr-landing.mjs";
import { driverIdOf } from "./spec-scheduler.mjs";
import { specAuthority } from "./spec-takeover.mjs";
import { taskDefinition } from "./task-outcomes.mjs";
import { fail } from "./store.mjs";

const ERRORS = "directLandingErrors";
export const isDirectLanding = (project) => project?.landing === "direct";

// Queues one verified task. Returns the delivery with the queued commit.
export function queueDirect(store, { delivery, project, task, at }) {
  const planId = task?.planId,
    driver = planId ? driverIdOf(store, planId) : null;
  if (!driver)
    fail(
      `Take over ${planId ?? "the spec"} before it lands: avoozl spec takeover ${planId ?? "SPEC"}.`,
      409,
    );
  if (!project.checks?.length)
    fail(`Project ${project.id} has no checks to land directly with.`, 409);
  enqueueLanding(store, {
    projectId: project.id,
    base: project.baseBranch || "main",
    key: delivery.taskId,
    commit: delivery.commit,
    spec: planId,
    driver,
    tasks: [
      {
        task: delivery.taskId,
        definition: taskDefinition({
          id: task.id,
          title: task.title,
          acceptance: task.acceptance ?? null,
        }),
      },
    ],
  });
  return { ...delivery, landing: { commit: delivery.commit, queuedAt: at } };
}

// One step for each `direct` project's queue. Returns {notify, messages}.
export async function landDirect(
  store,
  {
    github,
    workspaceRoot,
    rounds,
    now = Date.now(),
    env,
    machine,
    configFile,
    run,
  } = {},
) {
  const notify = [],
    messages = [],
    at = new Date(now).toISOString();
  for (const project of store.list("projects").filter(isDirectLanding)) {
    const base = project.baseBranch || "main",
      queue = landingQueue(store, { projectId: project.id, base });
    if (!queue.length) continue;
    const head = queue[0];
    try {
      const authority = await specAuthority(
          store,
          { github, workspaceRoot },
          head.spec,
        ),
        plan = store.get("plans", head.spec),
        url = await git(project.root, ["remote", "get-url", "origin"]),
        steps = directSteps({
          root: project.root,
          url,
          branch: base,
          // A journal reference names owner/name; a remote that is not on
          // GitHub (a bare folder) is named by its project.
          repository: project.repository || `local/${project.id}`,
          checks: project.checks ?? [],
          checksEnv: project.checksEnv,
          env,
          machine,
          configFile,
          ...(run ? { run } : {}),
          intent: () => ({
            journal: authority.journal,
            options: { ...authority.options, machine, configFile },
            input: {
              driver: head.driver,
              owner: authority.owner,
              login: authority.login,
              revision: plan.hash,
            },
          }),
        });
      const result = await landNext(
        store,
        { projectId: project.id, base },
        steps,
      );
      if (result.state === "landed") {
        for (const entry of result.entries)
          markLanded(store, entry, {
            mergeCommit: result.candidate,
            branch: store.get("task_worktrees", entry.key)?.branch,
            at,
          });
        await syncBase(project, { env }).catch(() => null);
        for (const entry of result.entries) {
          const worktree = store.get("task_worktrees", entry.key);
          if (worktree?.path)
            await removeLandedTaskWorktree(
              store,
              project,
              { worktree: worktree.path, branch: worktree.branch },
              base,
              result.candidate,
            );
        }
      } else if (result.state === "failed") {
        const sent = sendFailureBack(store, result, {
          rounds,
          now,
          where: `the landing candidate on ${base}`,
        });
        messages.push(...sent.messages);
        notify.push(...sent.notify);
      } else if (result.state === "conflict") {
        const sent = sendConflictBack(store, result, { rounds, now });
        messages.push(...sent.messages);
        notify.push(...sent.notify);
      }
    } catch (error) {
      if (error.contention) continue;
      // One notice per head and cause, not one per tick.
      const seen = store.getMeta(ERRORS) ?? {},
        cause = `${head.commit}:${error.message}`;
      if (seen[head.id] === cause) continue;
      store.setMeta(ERRORS, { ...seen, [head.id]: cause });
      notify.push({
        channel: "failure",
        task: head.key,
        title: `Avoozl could not land ${head.key} directly`,
        text: error.message,
      });
    }
  }
  return { notify, messages };
}
