// @ts-nocheck: typing debt
// The tick lands `direct` repositories' verified work on the registered remote
// in merge batches (Requirements 87.1, 87.2, 88.6, MB1 to MB6, design §4.26
// Land; task 41.9).
//
// - A verified task in a repository with `landing: "direct"` is queued as one
//   member for its base (`enqueueLanding`). Nothing is pushed yet.
// - Each tick takes up to the base's size limit of members one step
//   (`landNext` with `directSteps`, merge-batch.mjs): stack them on origin's
//   current base, run the repository's checks on that exact candidate, and
//   push a guarded fast-forward.
//   Never forced. A failed batch is narrowed to its culprit, which goes back
//   to its worker; the members before it land.
// - Landed: the task is integrated at the candidate, the local base is
//   fast-forwarded from origin, and the task's worktree and local branch
//   are removed. Failed checks go back to the worker chat; a conflict uses
//   `sendConflictBack`; each for the repository's `conflicts.maxAttempts` rounds.
// - A queued task whose base moved is withdrawn by integrateVerified
//   (`stillQueued`, pr-landing.mjs), merged with the base and verified again.
import os from "node:os";
import { git, removeLandedTaskWorktree } from "../git/git.ts";
import { enqueueLanding, landNext, queueHeads } from "./landing-queue.ts";
import { directSteps, dropMember } from "./merge-batch.ts";
import { landingSettings } from "./landing-config.ts";
import {
  recordBatch,
  setTesting,
  sizeLimit,
  sizeRecord,
  testingNow,
} from "./merge-batch-size.ts";
import { tickEntry } from "../specs/spec-ticks.ts";
import { sendConflictBack } from "./landing-conflicts.ts";
import { markLanded, sendFailureBack, syncBase } from "./pr-landing.ts";
import { finishLanded } from "./landed-work.ts";
import { fail } from "../store/store.ts";
import { landingSpecOf } from "../specs/labeled-issues.ts";
import { repositoryChecks } from "../workspace/repository-checks.ts";
import { pluginChecksOf } from "../plugins/plugin-checks.ts";

// The checks a merge batch candidate runs: the repository's and its
// task-stage plugin checks (plugin-checks PK4.1).
const landingChecks = (store, repository) =>
  repositoryChecks(repository, pluginChecksOf(store)).filter(
    (check) => check.stage === "task",
  );
import { requireDiskSpace } from "../workspace/disk-space.ts";

const ERRORS = "directLandingErrors";
export const isDirectLanding = (repository) => repository?.landing === "direct";

// Queues one verified task. Returns the delivery with the queued commit.
export function queueDirect(store, { delivery, repository, task, at }) {
  const planId = landingSpecOf(task);
  if (!planId) fail("Only a spec's task lands.", 409);
  if (!landingChecks(store, repository).length)
    fail(
      `Repository ${repository.id} has no checks to land directly with.`,
      409,
    );
  enqueueLanding(store, {
    repositoryId: repository.id,
    base: repository.baseBranch || "main",
    key: delivery.taskId,
    commit: delivery.commit,
    spec: planId,
    tasks: [{ task: delivery.taskId }],
  });
  return { ...delivery, landing: { commit: delivery.commit, queuedAt: at } };
}

// One step for each `direct` repository's queue. Returns {notify, messages}.
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
    only = null,
  } = {},
) {
  const notify = [],
    messages = [],
    at = new Date(now).toISOString();
  for (const { repository, base, head, tries } of queueHeads(
    store,
    isDirectLanding,
    { only, rounds },
  )) {
    // A landing candidate needs a worktree: a full volume holds the queue.
    try {
      requireDiskSpace(store, os.tmpdir(), `Landing on ${repository.id}`);
    } catch (error) {
      if (error.lowDisk) continue;
      throw error;
    }
    try {
      const setting = landingSettings(config, repository.github, repository),
        record = sizeRecord(store, { repositoryId: repository.id, base }),
        limit = sizeLimit(record, setting.mergeBatch);
      const url = await git(repository.root, ["remote", "get-url", "origin"]),
        steps = directSteps({
          root: repository.root,
          url,
          branch: base,
          repository: repository.github || `local/${repository.id}`,
          checks: landingChecks(store, repository),
          store,
          checksEnv: repository.checksEnv,
          repositoryId: repository.id,
          isolation: repository.isolation,
          unionPaths: config?.landing?.unionPaths ?? [],
          tickOf: (dir, entry) => tickEntry(store, dir, entry),
          commitPrefix: repository.commitPrefix,
          env,
          machine,
          configFile,
          ...(run ? { run } : {}),
        });
      const startedAt = new Date().toISOString(),
        result = await landNext(
          store,
          { repositoryId: repository.id, base },
          steps,
          {
            limit,
            bisect: true,
            onStep: (step, members) =>
              setTesting(
                store,
                { repositoryId: repository.id, base },
                {
                  members: members.map((e) => e.key),
                  step,
                  since:
                    step === "testing"
                      ? at
                      : (testingNow(store, {
                          repositoryId: repository.id,
                          base,
                        })?.since ?? at),
                },
              ),
            isAlone: (entry) => record.alone.includes(entry.key),
          },
        );
      setTesting(store, { repositoryId: repository.id, base }, null);
      if (result.batch)
        recordBatch(
          store,
          { repositoryId: repository.id, base },
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
        await dropMember(repository.root, sent.entry);
      }
      if (result.state === "landed") {
        for (const entry of result.entries) {
          markLanded(store, entry, {
            mergeCommit: result.candidate,
            branch: store.get("task_worktrees", entry.key)?.branch,
            at,
          });
          await dropMember(repository.root, entry);
        }
        await syncBase(repository, { env }).catch(() => null);
        // A spec in a separate plans repository is ticked there, as its own
        // guarded commit (spec-ticks.mjs); then the claim branches this
        // runner created go (rule 16.1).
        for (const entry of result.entries)
          await finishLanded(store, github, {
            repository,
            entry,
            candidate: result.candidate,
            workspaceRoot,
            env,
          });
        for (const entry of result.entries) {
          const worktree = store.get("task_worktrees", entry.key);
          if (worktree?.path)
            await removeLandedTaskWorktree(
              store,
              repository,
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
        await dropMember(repository.root, result.entry);
      } else if (result.state === "conflict") {
        const sent = sendConflictBack(store, result, { rounds: tries, now });
        messages.push(...sent.messages);
        notify.push(...sent.notify);
        await dropMember(repository.root, result.entry);
      }
    } catch (error) {
      setTesting(store, { repositoryId: repository.id, base }, null);
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
