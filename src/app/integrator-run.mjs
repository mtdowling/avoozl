// One integrator train, start to end (landing-trains LT3.8, LT8, design D10):
// stack the ready branches in a landing worktree, settle mechanical
// conflicts, run the cheap checks, validate per platform, push the trunk as a
// guarded fast-forward, then mark the work landed. No ref is ever forced.
//
//   gated       full validation (local platforms, and CI for the rest) on the
//               stack head, then the guarded push
//   optimistic  cheap checks, the guarded push, then full validation on the
//               pushed head
//
// A trunk that moved while the train ran is fetched, the stack is rebuilt on
// it with the same cut rule and the cheap checks (and, under gated, full
// validation) run again, at most `failure.maxRebases` times; then the train
// fails with "trunk kept moving" and its members go back to the queue.
//
// Failure handling beyond "fail the train and requeue" (flaky reruns, the
// bisect, returning a culprit, revert) is lt-6.1 and lt-6.2.
import { rmSync } from "node:fs";
import { guardedFastForward } from "./driver-generations.mjs";
import { git, removeLandedTaskWorktree, withWorkLock } from "./git.mjs";
import {
  mechanicalResolver,
  mechanicalRules,
  returnConflicted,
} from "./integrator-conflicts.mjs";
import { validateByCi } from "./integrator-ci.mjs";
import {
  addLandingWorktree,
  removeLandingWorktree,
  stackMembers,
} from "./integrator-stack.mjs";
import { endTrain, planTrain, startTrain } from "./integrator-trains.mjs";
import {
  machinePlatforms,
  neededPlatforms,
  changedFiles,
  recordPlatformResult,
  runCheap,
  runPlatforms,
} from "./integrator-validation.mjs";
import { conflictRounds } from "./landing-config.mjs";
import { journalChecks, landWithIntents } from "./landing-trains.mjs";
import { markLanded, syncBase } from "./pr-landing.mjs";
import { releaseSlots, takeSlots } from "./resource-slots.mjs";
import { mergeBaseBack } from "./spec-base.mjs";
import { specAuthority } from "./spec-takeover.mjs";
import { fail } from "./store.mjs";

const TABLE = "landing_queue";
const TRAINS = "landing_trains";
const NO_PROMPT = { GIT_TERMINAL_PROMPT: "0" };

const entryOf = (store, train, key) =>
  store.get(TABLE, `${train.projectId}\0${train.target}\0${key}`);

// Writes a change onto the train record and returns it.
const patch = (store, id, change) =>
  store.transaction(() => {
    const train = store.get(TRAINS, id);
    return store.put(TRAINS, {
      ...train,
      ...(typeof change === "function" ? change(train) : change),
    });
  });

// Runs one named step and records its start, end and result on the train.
async function step(store, id, name, fn) {
  const startedAt = new Date().toISOString();
  let result = "ok",
    detail;
  try {
    const out = await fn();
    if (out?.result) ({ result, detail } = out);
    return out;
  } catch (error) {
    result = "failed";
    detail = error.message;
    throw error;
  } finally {
    patch(store, id, (t) => ({
      steps: [
        ...t.steps,
        {
          name,
          startedAt,
          endedAt: new Date().toISOString(),
          result,
          ...(detail ? { detail } : {}),
        },
      ],
    }));
  }
}

async function fetchTrunk(root, url, branch, env) {
  await git(root, ["fetch", "--quiet", url, `refs/heads/${branch}`], { env });
  return git(root, ["rev-parse", "FETCH_HEAD"]);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Takes the slots every local platform uses; waits for a held one up to
// `waitMs`. Returns the rows taken.
async function takePlatformSlots(ctx, trainId, local, platforms) {
  const names = [
    ...new Set(local.map((p) => platforms[p].slot).filter(Boolean)),
  ];
  if (!names.length) return [];
  const { db, counts, workspace } = ctx.slots ?? {};
  if (!db)
    fail(
      "This train needs resource slots but no machine database was given.",
      500,
    );
  const until = Date.now() + (ctx.slotWaitMs ?? 30 * 60_000);
  for (;;) {
    const taken = takeSlots(db, { names, counts, workspace, train: trainId });
    if (taken.ok) return taken.held;
    if (Date.now() >= until)
      fail(
        `waiting for ${taken.waiting.slot} (${taken.waiting.train}) timed out`,
        409,
      );
    await (ctx.sleep ?? sleep)(ctx.slotPollMs ?? 5000);
  }
}

// The journal intents for the stacked members' specs, one per spec through
// its own driver (LT8.4, LT16.2).
async function intents(
  store,
  ctx,
  train,
  stacked,
  candidate,
  baseHead,
  checks,
) {
  const evidence = journalChecks(checks),
    repository = ctx.project.repository || `local/${ctx.project.id}`;
  return Promise.all(
    [...new Set(stacked.map((e) => e.spec))].map(async (spec) => {
      const own = stacked.filter((e) => e.spec === spec),
        authority = await specAuthority(
          store,
          { github: ctx.github, workspaceRoot: ctx.workspaceRoot },
          spec,
        ),
        plan = store.get("plans", spec);
      return {
        journal: authority.journal,
        options: {
          ...authority.options,
          machine: ctx.machine,
          configFile: ctx.configFile,
        },
        input: {
          op: `land.${candidate.slice(0, 16)}`,
          driver: own[0].driver,
          owner: authority.owner,
          login: authority.login,
          revision: plan.hash,
          ...(evidence.length ? { checks: evidence } : {}),
          refs: [{ repository, branch: train.target, commit: candidate }],
          spec,
          candidate,
          base: baseHead,
          tasks: own.flatMap((e) => e.tasks),
        },
      };
    }),
  );
}

// Plain-delete a batch branch only when the remote still shows the head the
// train recorded. shortcut: the check and the delete are two calls, so a push
// between them is lost from the remote (the pusher still has it); close the
// gap if a receipt ever shows it.
async function deleteBatchBranch(root, url, branch, recorded, env) {
  try {
    const now = (
      await git(root, ["ls-remote", "--heads", url, `refs/heads/${branch}`], {
        env,
      })
    ).split(/\s+/)[0];
    if (!now) return { deleted: false, head: null };
    if (now !== recorded) return { deleted: false, head: now };
    await git(root, ["push", "--quiet", url, `:refs/heads/${branch}`], { env });
    return { deleted: true, head: null };
  } catch {
    return { deleted: false, head: null };
  }
}

// Runs one train when the trigger says so. Returns {state, train?, ...}.
//   ctx: {project, target, settings, config, lease, workspaceRoot, github,
//         env, machine, configFile, now, run, slots: {db, counts, workspace},
//         ciOptions}
export async function runTrain(store, ctx) {
  const { project, target, settings, lease } = ctx,
    now = ctx.now ?? Date.now(),
    root = project.root,
    plan = planTrain(store, { projectId: project.id, target, settings, now });
  if (plan.state !== "start") return { state: plan.state, plan };
  const url = await git(root, ["remote", "get-url", "origin"]),
    env = { ...(ctx.env ?? process.env), ...NO_PROMPT },
    platforms = machinePlatforms(ctx.config);
  let baseHead = await fetchTrunk(root, url, target, env);
  const train = startTrain(store, {
    projectId: project.id,
    target,
    policy: settings.policy,
    members: plan.members,
    baseHead,
    leaseId: lease?.leaseId ?? null,
    now,
  });
  const id = train.id,
    worktrees = new Set();
  let held = [],
    outcome;
  try {
    outcome = await execute();
  } catch (error) {
    patch(store, id, (t) => ({
      steps: [
        ...t.steps,
        {
          name: "train",
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          result: "failed",
          detail: error.message,
        },
      ],
    }));
    endTrain(store, id, "failed");
    outcome = { state: "failed", error: error.message };
  } finally {
    for (const dir of worktrees) await removeLandingWorktree(root, dir);
    patch(store, id, { worktrees: [], slots: [] });
    if (ctx.slots?.db) releaseSlots(ctx.slots.db, { train: id });
  }
  return { ...outcome, train: store.get(TRAINS, id) };

  // The validating CI run goes on the train. Under optimistic it is the trunk
  // push's own run, so it is also the run `readTrainCi` would find (LT8.6).
  function recordCi(ci) {
    const run = ci.run
      ? { run: ci.run.id, status: ci.run.status, conclusion: ci.run.conclusion }
      : {};
    patch(store, id, (t) => ({
      ciValidation: { state: ci.state, mode: ci.mode, ...run },
      ...(ci.mode === "push-run"
        ? { ci: { ...(t.ci ?? {}), ...run, readAt: new Date().toISOString() } }
        : {}),
    }));
  }

  async function execute() {
    const { policy } = settings,
      maxRebases = settings.failure.maxRebases,
      cheapArgv = settings.validation.cheap.length
        ? settings.validation.cheap
        : (project.checks ?? []),
      rules = mechanicalRules(ctx.config, settings),
      rounds = ctx.rounds ?? conflictRounds(ctx.config?.landing),
      timeoutFor = ctx.timeoutFor,
      checkOptions = {
        ...(timeoutFor ? { timeoutFor } : {}),
        ...(ctx.run ? { run: ctx.run } : {}),
      };
    // Every queue entry of the target: the cut looks at all of them.
    const all = () =>
      store
        .list(TABLE)
        .filter((e) => e.projectId === project.id && e.base === target);
    let members = plan.members,
      rebases = 0;
    const result = { messages: [], notify: [] };
    for (;;) {
      const dir = await addLandingWorktree(root, baseHead);
      worktrees.add(dir);
      patch(store, id, { worktrees: [...worktrees], baseHead });
      const stack = await step(store, id, "stack", async () => ({
        ...(await stackMembers({
          root,
          dir,
          baseHead,
          members,
          others: all(),
          resolve: mechanicalResolver({
            rules,
            cheap: cheapArgv,
            timeoutMs: undefined,
          }),
        })),
      }));
      // Settle each member that did not stack: conflicts go back to their
      // task, held ones wait in the queue, contained ones close.
      for (const out of stack.members) {
        const entry = entryOf(store, train, out.key);
        if (out.state === "conflict") {
          const sent = returnConflicted(store, {
            entry,
            files: out.files,
            against: out.against,
            baseHead,
            rounds,
            now: Date.now(),
          });
          result.messages.push(...sent.messages);
          result.notify.push(...sent.notify);
        } else if (out.state === "held")
          store.put(TABLE, {
            ...entry,
            state: "queued",
            train: null,
            reason: out.holdReason,
          });
        else if (out.state === "contained")
          store.put(TABLE, {
            ...entry,
            state: "closed",
            train: null,
            reason: `already in the trunk at ${baseHead.slice(0, 12)}`,
            finishedAt: new Date().toISOString(),
          });
      }
      patch(store, id, (t) => ({
        members: t.members.map((m) => {
          const out = stack.members.find((s) => s.key === m.key);
          return out
            ? {
                ...m,
                cutFrom: out.from,
                boundary: out.boundary,
                state: out.state,
              }
            : m;
        }),
      }));
      const stacked = stack.members.filter((m) => m.state === "stacked"),
        stackedEntries = stacked.map((m) => entryOf(store, train, m.key));
      if (!stacked.length) {
        endTrain(
          store,
          id,
          stack.members.some((m) => m.state === "contained")
            ? "landed"
            : "failed",
        );
        return { state: "ended", train: store.get(TRAINS, id), ...result };
      }
      const candidate = stack.stack;

      const cheap = await step(store, id, "cheap", async () => {
        const out = await runCheap(dir, cheapArgv, {
          ...checkOptions,
          env: project.checksEnv,
        });
        return {
          ...out,
          result: out.ok ? "ok" : "failed",
          detail: out.ok ? undefined : out.checks.at(-1)?.command,
        };
      });
      patch(store, id, (t) => ({
        checks: { ...t.checks, cheap: cheap.checks },
      }));
      if (!cheap.ok) {
        endTrain(store, id, "failed");
        return { state: "ended", train: store.get(TRAINS, id), ...result };
      }

      const files = await changedFiles(dir, baseHead),
        { names: needed } = await step(store, id, "platforms", async () => ({
          names: await neededPlatforms(settings, { dir, files }),
        })),
        local = needed.filter((p) => platforms[p]),
        viaCi = needed.filter((p) => !platforms[p]);

      const validate = async (where) => {
        const out = { ok: true, checks: [] };
        if (local.length) {
          held = await takePlatformSlots(ctx, id, local, platforms);
          patch(store, id, { slots: held });
          const results = await step(store, id, `full ${where}`, async () => {
            const done = await runPlatforms(dir, local, settings, platforms, {
              ...checkOptions,
              env: project.checksEnv,
            });
            return { done, result: done.every((r) => r.ok) ? "ok" : "failed" };
          });
          for (const r of results.done) {
            recordPlatformResult(store, id, r);
            out.checks.push({
              command: `full ${r.platform}`,
              exitCode: r.exitCode,
            });
            if (!r.ok) out.ok = false;
          }
        }
        return out;
      };
      const ciValidate = (extra) =>
        step(store, id, "ci", async () => {
          const out = await validateByCi({
            github: ctx.github,
            repository: project.repository || `local/${project.id}`,
            workflow: settings.ci.workflow,
            train: id,
            platforms: viaCi,
            policy,
            root,
            url,
            baseHead,
            env,
            machine: ctx.machine,
            configFile: ctx.configFile,
            store,
            ...(ctx.ciOptions ?? {}),
            ...extra,
          });
          return { ...out, result: out.state === "passed" ? "ok" : out.state };
        });

      let checks = cheap.checks.map((c) => ({
        command: c.command,
        exitCode: c.exitCode,
      }));
      if (policy === "gated") {
        const full = await validate("on the stack");
        let ci = { state: "passed" };
        if (viaCi.length) ci = await ciValidate({ candidate });
        if (viaCi.length) recordCi(ci);
        if (!full.ok || ci.state !== "passed") {
          endTrain(store, id, "failed");
          return { state: "ended", train: store.get(TRAINS, id), ...result };
        }
        checks = [...checks, ...full.checks];
      }

      // Intents are written and read back before the push (LT8.4). The
      // lock covers the trunk re-read and the guarded push only.
      const pushed = await step(store, id, "push", async () => {
        const intentList = await intents(
            store,
            ctx,
            train,
            stackedEntries,
            candidate,
            baseHead,
            checks,
          ),
          landed = await withWorkLock(
            store,
            {
              id: `landing:${project.id}\0${target}`,
              projectId: project.id,
              kind: "integration",
            },
            async () => {
              if ((await fetchTrunk(root, url, target, env)) !== baseHead)
                return false;
              const out = await landWithIntents(intentList, () =>
                guardedFastForward(root, {
                  url,
                  branch: target,
                  base: baseHead,
                  candidate,
                  env,
                }),
              );
              return out.pushed;
            },
          );
        return { landed, result: landed ? "ok" : "trunk moved" };
      });
      if (!pushed.landed) {
        // The trunk moved: rebuild on its new head and check again.
        rebases += 1;
        if (rebases > maxRebases) {
          patch(store, id, (t) => ({
            steps: [
              ...t.steps,
              {
                name: "rebase",
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
                result: "failed",
                detail: "trunk kept moving",
              },
            ],
          }));
          endTrain(store, id, "failed");
          return {
            state: "ended",
            train: store.get(TRAINS, id),
            reason: "trunk kept moving",
            ...result,
          };
        }
        baseHead = await fetchTrunk(root, url, target, env);
        await removeLandingWorktree(root, dir);
        worktrees.delete(dir);
        members = stackedEntries.map((e) => store.get(TABLE, e.id));
        continue;
      }
      patch(store, id, { pushed: candidate, validated: false });

      // Optimistic: full validation on the pushed head, after the push.
      let validated = true;
      if (policy === "optimistic") {
        const full = await validate("on the pushed head");
        let ci = { state: "passed" };
        if (viaCi.length) ci = await ciValidate({ pushed: candidate });
        if (viaCi.length) recordCi(ci);
        validated = full.ok && ci.state === "passed";
      }
      await finishLanded(stackedEntries, stack.members, candidate, validated);
      return {
        state: "landed",
        train: store.get(TRAINS, id),
        candidate,
        ...result,
      };
    }
  }

  // After the trunk push: each landed task is integrated at its boundary, the
  // trunk is merged back into each spec's working branch, each batch branch
  // is deleted if it still shows the recorded head, and the worktrees go.
  async function finishLanded(stackedEntries, outcomes, candidate, validated) {
    const at = new Date().toISOString();
    for (const entry of stackedEntries) {
      const boundary =
          outcomes.find((o) => o.key === entry.key)?.boundary ?? candidate,
        current = store.get(TABLE, entry.id);
      store.put(TABLE, {
        ...current,
        state: "landed",
        train: id,
        trunkCommit: candidate,
        boundary,
        finishedAt: at,
      });
      markLanded(store, entry, {
        mergeCommit: boundary,
        branch: entry.branch,
        at,
      });
    }
    await syncBase(project, { env }).catch(() => null);
    for (const entry of stackedEntries)
      for (const { task: taskId } of entry.tasks) {
        const worktree = store.get("task_worktrees", taskId);
        if (worktree?.path)
          await removeLandedTaskWorktree(
            store,
            project,
            { worktree: worktree.path, branch: worktree.branch },
            target,
            candidate,
          ).catch(() => {});
      }
    for (const spec of new Set(stackedEntries.map((e) => e.spec)))
      await mergeBaseBack(root, {
        spec,
        landed: candidate,
        base: target,
      }).catch(() => null);
    for (const entry of stackedEntries) {
      const { head } = await deleteBatchBranch(
        root,
        url,
        entry.branch,
        entry.commit,
        env,
      );
      // Someone pushed to the batch branch during the train: it is kept and
      // its new head is queued again, held until its cheap checks pass.
      if (head)
        store.put(TABLE, {
          ...store.get(TABLE, entry.id),
          state: "queued",
          train: null,
          commit: head,
          cheap: null,
          finishedAt: undefined,
          queuedAt: new Date().toISOString(),
          seq: Math.max(0, ...store.list(TABLE).map((e) => e.seq ?? 0)) + 1,
          reason: "the batch branch moved during the train",
        });
    }
    // Stop the line counts this head only when the train is validated.
    patch(store, id, { validated });
    endTrain(store, id, validated ? "landed" : "failed");
  }
}

// Removes landing worktrees a dead train left, by path (lt-2.4 calls this).
export async function removeWorktrees(root, dirs) {
  for (const dir of dirs ?? []) {
    await git(root, ["worktree", "remove", "--force", dir]).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}
