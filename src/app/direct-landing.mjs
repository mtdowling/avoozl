// The tick lands `direct` projects' verified work on the registered remote
// in merge batches (Requirements 87.1, 87.2, 88.6, MB1 to MB6, design §4.26
// Land; task 41.9).
//
// - A verified task in a project with `landing: "direct"` is queued as one
//   member for its base (`enqueueLanding`). Nothing is pushed yet.
// - Each tick takes up to the base's size limit of members one step
//   (`landNext` with `directSteps`, merge-batch.mjs): stack them on origin's
//   current base, run the project's checks on that exact candidate, write
//   each spec's intent in its journal, and push a guarded fast-forward.
//   Never forced. A failed batch is narrowed to its culprit, which goes back
//   to its worker; the members before it land.
// - Landed: the task is integrated at the candidate, the local base is
//   fast-forwarded from origin, and the task's worktree and local branch
//   are removed. Failed checks go back to the worker chat; a conflict uses
//   `sendConflictBack`; each for the repository's `conflicts.maxAttempts` rounds.
// - A queued task whose base moved is withdrawn by integrateVerified
//   (`stillQueued`, pr-landing.mjs), merged with the base and verified again.
import os from "node:os";
import { git, removeLandedTaskWorktree } from "./git.mjs";
import { enqueueLanding, landingQueue, landNext } from "./landing-queue.mjs";
import { directSteps, dropMember } from "./merge-batch.mjs";
import { landingSettings } from "./landing-config.mjs";
import {
  recordBatch,
  setTesting,
  sizeLimit,
  sizeRecord,
  testingNow,
} from "./merge-batch-size.mjs";
import { tickEntry, tickPlansRepo } from "./spec-ticks.mjs";
import { sendConflictBack } from "./landing-conflicts.mjs";
import { markLanded, sendFailureBack, syncBase } from "./pr-landing.mjs";
import { driverIdOf } from "./spec-scheduler.mjs";
import { specAuthority } from "./spec-takeover.mjs";
import { taskDefinition } from "./task-outcomes.mjs";
import { fail } from "./store.mjs";
import { landingSpecOf, specRevision } from "./fix.mjs";
import { repositoryChecks } from "./repository-checks.mjs";
import { requireDiskSpace } from "./disk-space.mjs";

const ERRORS = "directLandingErrors";
export const isDirectLanding = (project) => project?.landing === "direct";

// Queues one verified task. Returns the delivery with the queued commit.
export function queueDirect(store, { delivery, project, task, at }) {
  const planId = landingSpecOf(task),
    driver = planId ? driverIdOf(store, planId) : null;
  if (!driver)
    fail(
      `Take over ${planId ?? "the spec"} before it lands: avoozl spec takeover ${planId ?? "SPEC"}.`,
      409,
    );
  if (!repositoryChecks(project).length)
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
    config,
  } = {},
) {
  const notify = [],
    messages = [],
    at = new Date(now).toISOString();
  for (const project of store.list("projects").filter(isDirectLanding)) {
    // `rounds` is a count or, per repository, a function of the project.
    const tries = typeof rounds === "function" ? rounds(project) : rounds,
      base = project.baseBranch || "main",
      queue = landingQueue(store, { projectId: project.id, base });
    if (!queue.length) continue;
    const head = queue[0];
    // A landing candidate needs a worktree: a full volume holds the queue.
    try {
      requireDiskSpace(store, os.tmpdir(), `Landing on ${project.id}`);
    } catch (error) {
      if (error.lowDisk) continue;
      throw error;
    }
    try {
      const setting = landingSettings(config, project.repository, project),
        record = sizeRecord(store, { projectId: project.id, base }),
        limit = sizeLimit(record, setting.mergeBatch),
        // Each spec's driver journal, for the specs this batch may hold.
        // A member whose spec cannot be read waits; the head's error stops
        // the step as it always did.
        authorities = new Map();
      for (const entry of queue.slice(0, limit)) {
        if (authorities.has(entry.spec)) continue;
        try {
          authorities.set(
            entry.spec,
            await specAuthority(store, { github, workspaceRoot }, entry.spec),
          );
        } catch (error) {
          if (entry === head) throw error;
        }
      }
      const url = await git(project.root, ["remote", "get-url", "origin"]),
        steps = directSteps({
          root: project.root,
          url,
          branch: base,
          // A journal reference names owner/name; a remote that is not on
          // GitHub (a bare folder) is named by its project.
          repository: project.repository || `local/${project.id}`,
          checks: repositoryChecks(project),
          checksEnv: project.checksEnv,
          projectId: project.id,
          isolation: project.isolation,
          unionPaths: config?.landing?.unionPaths ?? [],
          tickOf: (dir, entry) => tickEntry(store, dir, entry),
          env,
          machine,
          configFile,
          ...(run ? { run } : {}),
          intent: (spec, own) => {
            const authority = authorities.get(spec);
            return {
              journal: authority.journal,
              options: { ...authority.options, machine, configFile },
              input: {
                driver: own[0].driver,
                owner: authority.owner,
                login: authority.login,
                revision: specRevision(store, spec),
              },
            };
          },
        });
      const startedAt = new Date().toISOString(),
        result = await landNext(store, { projectId: project.id, base }, steps, {
          limit,
          bisect: true,
          onStep: (step, members) =>
            setTesting(
              store,
              { projectId: project.id, base },
              {
                members: members.map((e) => e.key),
                step,
                since:
                  step === "testing"
                    ? at
                    : (testingNow(store, { projectId: project.id, base })
                        ?.since ?? at),
              },
            ),
          isAlone: (entry) => record.alone.includes(entry.key),
          accept: (entry) => authorities.has(entry.spec),
        });
      setTesting(store, { projectId: project.id, base }, null);
      if (result.batch)
        recordBatch(
          store,
          { projectId: project.id, base },
          {
            ...result.batch,
            at,
            seconds: Math.round((Date.now() - Date.parse(startedAt)) / 1000),
          },
        );
      for (const sent of result.sentBack ?? []) {
        const out =
          sent.state === "conflict"
            ? sendConflictBack(
                store,
                { state: "conflict", entry: sent.entry },
                {
                  rounds: tries,
                  now,
                },
              )
            : sendFailureBack(
                store,
                { entry: sent.entry },
                {
                  rounds: tries,
                  now,
                  where: `the landing candidate on ${base}`,
                },
              );
        messages.push(...out.messages);
        notify.push(...out.notify);
        await dropMember(project.root, sent.entry);
      }
      if (result.state === "landed") {
        for (const entry of result.entries) {
          markLanded(store, entry, {
            mergeCommit: result.candidate,
            branch: store.get("task_worktrees", entry.key)?.branch,
            at,
          });
          await dropMember(project.root, entry);
        }
        // A spec in a separate plans repository is ticked there, as its own
        // guarded commit (spec-ticks.mjs).
        for (const entry of result.entries)
          await tickPlansRepo(store, {
            entry,
            candidate: result.candidate,
            project,
            workspaceRoot,
            env,
          }).catch(() => null);
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
          rounds: tries,
          now,
          where: `the landing candidate on ${base}`,
        });
        messages.push(...sent.messages);
        notify.push(...sent.notify);
        await dropMember(project.root, result.entry);
      } else if (result.state === "conflict") {
        const sent = sendConflictBack(store, result, { rounds: tries, now });
        messages.push(...sent.messages);
        notify.push(...sent.notify);
        await dropMember(project.root, result.entry);
      }
    } catch (error) {
      setTesting(store, { projectId: project.id, base }, null);
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
