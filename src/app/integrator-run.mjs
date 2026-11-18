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
  bisectBoundaries,
  checkoutClean,
  confirmFailures,
  failedSuites,
  revertRange,
  runSuites,
} from "./integrator-failure.mjs";
import { openLineStop } from "./flow-line.mjs";
import {
  addLandingWorktree,
  removeLandingWorktree,
  stackMembers,
} from "./integrator-stack.mjs";
import { closeReviewPulls } from "./integrator-review.mjs";
import { endTrain, planTrain, startTrain } from "./integrator-trains.mjs";
import {
  machinePlatforms,
  neededPlatforms,
  changedFiles,
  recordPlatformResult,
  runCheap,
  runPlatforms,
} from "./integrator-validation.mjs";
import { PR_COMMENT_TEMPLATE, landingSettings } from "./landing-config.mjs";
import { journalChecks, landWithIntents } from "./landing-trains.mjs";
import { markLanded, sendFailureBack, syncBase } from "./pr-landing.mjs";
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
  patch(store, id, { current: name });
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
      current: null,
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

const trunkRedNotice = (target) => ({
  channel: "failure",
  title: `Landing on ${target} stopped: its validation fails without the train`,
  text: `The suites that failed also fail on the trunk before this train, so no task was blamed. Fix ${target} or the validation machine.`,
});

// The red-validation tools of one train: confirm and bisect a failure, send the
// culprit's task back, repair a pushed trunk. They work on a train record `id`
// and read `ctx` like runTrain, so a train that already ended can use them
// (integrator-red.mjs).
export function failureTools(store, ctx, id) {
  const { project, target, settings } = ctx,
    root = project.root,
    platforms = machinePlatforms(ctx.config);
  // A red full validation (LT10.1, LT10.2): rerun the failing suites, then
  // bisect the member boundaries to the culprit. {culprit: null} when only
  // flaky suites failed.
  async function handleRed(dir, results, outcomes, candidate, baseHead) {
    const runner = ctx.runSuites ?? runSuites,
      options = {
        ...(ctx.timeoutFor ? { timeoutFor: ctx.timeoutFor } : {}),
        ...(ctx.run ? { run: ctx.run } : {}),
        env: project.checksEnv,
      },
      failures = results
        .filter((r) => !r.ok)
        .map((r) => ({ platform: r.platform, names: failedSuites(r) })),
      confirmed = await step(store, id, "rerun", async () => ({
        ...(await confirmFailures(dir, failures, {
          spec: (p) => settings.validation.full[p],
          environment: (p) => platforms[p] ?? null,
          reruns: settings.failure.flakyReruns,
          run: runner,
          options,
        })),
      }));
    patch(store, id, (t) => ({
      flaky: [...(t.flaky ?? []), ...confirmed.flaky],
    }));
    if (!confirmed.persistent.length) return { culprit: null };
    const stacked = outcomes.filter((o) => o.state === "stacked"),
      probeFails = async (boundary) => {
        await checkoutClean(dir, boundary);
        for (const p of confirmed.persistent) {
          const r = await runner(
            dir,
            p.platform,
            settings.validation.full[p.platform],
            platforms[p.platform] ?? null,
            { names: p.names, ...options },
          );
          if (!r.ok) return true;
        }
        return false;
      },
      found = await step(store, id, "bisect", async () => ({
        ...(await bisectBoundaries(
          stacked.map((o) => ({ key: o.key, boundary: o.boundary })),
          probeFails,
        )),
      })),
      culprit = stacked[found.index];
    // A culprit at the first boundary is only believable when the trunk
    // before the train passes: else the platform or the trunk is red.
    const trunkRed = found.index === 0 && (await probeFails(baseHead));
    await checkoutClean(
      dir,
      outcomes.filter((o) => o.boundary).at(-1).boundary,
    );
    if (trunkRed) {
      patch(store, id, (t) => ({
        notes: [
          ...(t.notes ?? []),
          "the failing suites also fail on the trunk before the train",
        ],
      }));
      return { culprit: null, trunkRed: true };
    }
    patch(store, id, (t) => ({
      bisects: [...t.bisects, ...found.probes],
      culprits: [...t.culprits, culprit.key],
      ...(found.interaction ? { interaction: true } : {}),
    }));
    return {
      culprit,
      persistent: confirmed.persistent,
      interaction: found.interaction,
      excerpt: results.find((r) => !r.ok && r.excerpt)?.excerpt ?? "",
    };
  }

  // The culprit's task gets the failing suites, their platform and a bounded
  // log excerpt, up to `failure.retries` times, then Needs you; `eject` goes
  // straight to Needs you (LT10.5).
  function dealWithCulprit(verdict, result) {
    const entry = store.get(
        TABLE,
        `${project.id}\0${target}\0${verdict.culprit.key}`,
      ),
      failing = verdict.persistent.flatMap((p) =>
        (p.names ?? ["the platform command"]).map(
          (n) => `${n} on ${p.platform}`,
        ),
      ),
      eject = settings.failure.action === "eject",
      sent = sendFailureBack(
        store,
        {
          entry: {
            ...entry,
            checks: failing.map((command) => ({ command, exitCode: 1 })),
            excerpt: verdict.excerpt,
          },
        },
        {
          rounds: eject ? 0 : settings.failure.retries,
          now: Date.now(),
          where: "the integrator train",
        },
      );
    store.put(TABLE, {
      ...entry,
      state: sent.messages.length ? "returned" : "ejected",
      train: null,
      reason: `validation failed: ${failing.join("; ")}`,
      finishedAt: new Date().toISOString(),
    });
    result.messages.push(...sent.messages);
    result.notify.push(...sent.notify);
    return failing;
  }

  // Under `optimistic` the trunk is already pushed: `revert` pushes one
  // fast-forward revert of the culprit's range and checks it is green;
  // `fix-forward` opens Stop the line and a fix task first in line (LT10.4).
  async function repairTrunk(
    dir,
    verdict,
    outcomes,
    { candidate, baseHead, url, env, result },
  ) {
    const failing = dealWithCulprit(verdict, result),
      stacked = outcomes.filter((o) => o.state === "stacked"),
      at = stacked.findIndex((o) => o.key === verdict.culprit.key),
      from = at > 0 ? stacked[at - 1].boundary : baseHead,
      task = verdict.culprit.key;
    if (settings.failure.trunk === "fix-forward") {
      const opened = openLineStop(store, project, {
        check: failing[0] ?? "full validation",
        culprit: task,
        commit: verdict.culprit.boundary,
        from,
        to: verdict.culprit.boundary,
        tail: verdict.excerpt?.split("\n").slice(-20).join("\n"),
        config: ctx.config,
      });
      result.notify.push(...opened.notify);
      return { validated: false, head: null };
    }
    const revert = await step(store, id, "revert", async () => {
      const commit = await revertRange(dir, {
        onto: candidate,
        from,
        to: verdict.culprit.boundary,
        message: `Revert ${task}\n\nAvoozl reverted ${task} after ${failing.join(", ")} failed on the pushed train.`,
      });
      return { commit, result: commit ? "ok" : "conflict" };
    });
    const fail = (text) => {
      result.notify.push({
        channel: "failure",
        task,
        title: `The trunk is red and ${task} could not be reverted`,
        text,
      });
      return { validated: false, head: null };
    };
    if (!revert.commit)
      return fail(
        `Reverting ${task} conflicts with later work on ${target}. Fix ${failing.join(", ")} by hand.`,
      );
    // The revert must make the failing suites pass before it is pushed.
    const runner = ctx.runSuites ?? runSuites;
    for (const p of verdict.persistent) {
      const r = await runner(
        dir,
        p.platform,
        settings.validation.full[p.platform],
        platforms[p.platform] ?? null,
        {
          names: p.names,
          ...(ctx.run ? { run: ctx.run } : {}),
          env: project.checksEnv,
        },
      );
      if (!r.ok)
        return fail(
          `Reverting ${task} did not make ${p.platform} pass, so nothing was pushed.`,
        );
    }
    const landed = await withWorkLock(
      store,
      {
        id: `landing:${project.id}\0${target}`,
        projectId: project.id,
        kind: "integration",
      },
      () =>
        guardedFastForward(root, {
          url,
          branch: target,
          base: candidate,
          candidate: revert.commit,
          env,
        }),
    );
    if (!landed)
      return fail(
        `The trunk moved while ${task} was reverted, so nothing was pushed.`,
      );
    return { validated: true, head: revert.commit };
  }

  return { handleRed, dealWithCulprit, repairTrunk };
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
    worktrees = new Set(),
    { handleRed, dealWithCulprit, repairTrunk } = failureTools(store, ctx, id);
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
      rounds =
        ctx.rounds ??
        landingSettings(ctx.config, project.repository, project).maxAttempts,
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
      rebases = 0,
      bisects = 0,
      rerun = null;
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
            // The resolver chat is offered only when the repository turns it
            // on and the process can start one (D4).
            chat:
              settings.conflicts?.resolver === "chat"
                ? (ctx.resolverChat?.() ?? null)
                : null,
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

      // Full validation of the local platforms; `only` ({platform: suites|null})
      // reruns just those platforms and suites after a failure was dropped.
      const validate = async (where, only = null) => {
        const out = { ok: true, checks: [], results: [] },
          names = only ? local.filter((p) => only[p] !== undefined) : local;
        if (names.length) {
          held = await takePlatformSlots(ctx, id, names, platforms);
          patch(store, id, { slots: held });
          const stepped = await step(store, id, `full ${where}`, async () => {
            const options = { ...checkOptions, env: project.checksEnv },
              done = only
                ? await Promise.all(
                    names.map(async (p) => {
                      const r = await (ctx.runSuites ?? runSuites)(
                        dir,
                        p,
                        settings.validation.full[p],
                        platforms[p] ?? null,
                        { names: only[p], ...options },
                      );
                      return { ...r.result, platform: p, ok: r.ok };
                    }),
                  )
                : await runPlatforms(dir, names, settings, platforms, options);
            return { done, result: done.every((r) => r.ok) ? "ok" : "failed" };
          });
          for (const r of stepped.done) {
            recordPlatformResult(store, id, r);
            out.results.push(r);
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
            capacity: settings.capacity?.ci,
            jobPlatforms: settings.ci.jobPlatforms,
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
          return {
            ...out,
            result: out.state === "passed" ? "ok" : out.state,
            detail: out.waited,
          };
        });

      let checks = cheap.checks.map((c) => ({
        command: c.command,
        exitCode: c.exitCode,
      }));
      if (policy === "gated") {
        let full = await validate("on the stack", rerun);
        if (!full.ok) {
          const verdict = await handleRed(
            dir,
            full.results,
            stack.members,
            candidate,
            baseHead,
          );
          if (verdict.trunkRed) {
            result.notify.push(trunkRedNotice(target));
            endTrain(store, id, "failed");
            return { state: "ended", train: store.get(TRAINS, id), ...result };
          }
          if (verdict.culprit) {
            bisects += 1;
            if (bisects > settings.failure.maxBisects) {
              patch(store, id, (t) => ({
                notes: [...(t.notes ?? []), "too many bisects"],
              }));
              endTrain(store, id, "failed");
              return {
                state: "ended",
                train: store.get(TRAINS, id),
                reason: "too many bisects",
                ...result,
              };
            }
            // Drop the culprit, restack the rest and check again: the cheap
            // checks, then only the suites that failed (LT10.3).
            await dealWithCulprit(verdict, result);
            rerun = Object.fromEntries(
              verdict.persistent.map((p) => [p.platform, p.names]),
            );
            members = stackedEntries
              .filter((e) => e.key !== verdict.culprit.key)
              .map((e) => store.get(TABLE, e.id));
            await removeLandingWorktree(root, dir);
            worktrees.delete(dir);
            if (!members.length) {
              endTrain(store, id, "failed");
              return {
                state: "ended",
                train: store.get(TRAINS, id),
                ...result,
              };
            }
            continue;
          }
          // Only flaky suites failed: the train goes on.
          full = { ok: true, checks: full.checks, results: full.results };
        }
        let ci = { state: "passed" };
        if (viaCi.length) ci = await ciValidate({ candidate });
        if (viaCi.length) recordCi(ci);
        if (ci.state !== "passed") {
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
      let validated = true,
        landedEntries = stackedEntries,
        outcome = "landed",
        finalHead = candidate;
      if (policy === "optimistic") {
        const full = await validate("on the pushed head");
        let ci = { state: "passed" };
        if (viaCi.length) ci = await ciValidate({ pushed: candidate });
        if (viaCi.length) recordCi(ci);
        validated = full.ok && ci.state === "passed";
        if (!full.ok) {
          const verdict = await handleRed(
            dir,
            full.results,
            stack.members,
            candidate,
            baseHead,
          );
          if (verdict.trunkRed) {
            result.notify.push(trunkRedNotice(target));
            validated = false;
          } else if (!verdict.culprit) validated = ci.state === "passed";
          else {
            const repaired = await repairTrunk(dir, verdict, stack.members, {
              candidate,
              baseHead,
              url,
              env,
              result,
            });
            landedEntries = stackedEntries.filter(
              (e) => e.key !== verdict.culprit.key,
            );
            outcome = "partly-landed";
            validated = repaired.validated && ci.state === "passed";
            finalHead = repaired.head ?? candidate;
          }
        }
      }
      await finishLanded(landedEntries, stack.members, candidate, validated, {
        outcome: validated ? outcome : "failed",
        head: finalHead,
      });
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
  async function finishLanded(
    stackedEntries,
    outcomes,
    candidate,
    validated,
    { outcome, head },
  ) {
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
    // Review pull requests are commented on and closed before their branch
    // goes: deleting a head branch would close them without a note.
    if (project.repository && ctx.github) {
      const notes = await closeReviewPulls(store, {
        github: ctx.github,
        repository: project.repository,
        entries: stackedEntries,
        trainId: id,
        trunkCommit: candidate,
        validated,
        template: settings.pullRequests?.commentTemplate ?? PR_COMMENT_TEMPLATE,
      });
      if (notes.length)
        patch(store, id, (t) => ({
          steps: [
            ...t.steps,
            {
              name: "review pull requests",
              startedAt: at,
              endedAt: new Date().toISOString(),
              result: "failed",
              detail: notes.join("; "),
            },
          ],
        }));
    }
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
    patch(store, id, { validated, pushed: head });
    endTrain(store, id, outcome);
  }
}

// Removes landing worktrees a dead train left, by path (lt-2.4 calls this).
export async function removeWorktrees(root, dirs) {
  for (const dir of dirs ?? []) {
    await git(root, ["worktree", "remove", "--force", dir]).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}
