// Integrator trains (landing-trains spec, `.kiro/specs/landing-trains/`).
// Finished work waits in a queue as a pushed batch branch; one integrator
// stacks the ready branches and lands them in a train. This module holds the
// queue side (lt-1.2); later tasks add the lease, the train engine and
// failure handling here (design D21). Nothing here force pushes: a batch
// branch is created or fast-forwarded, never replaced.
import { contentBinding } from "./content-rules.mjs";
import { git } from "./git.mjs";
import { branchNameProblem } from "./integration-branch.mjs";
import { loadLayeredConfig } from "./layered-config.mjs";
import { runCheckAt } from "./flow-line.mjs";
import { composeTrain } from "./integrator-schedule.mjs";
import { enqueueLanding, pausedBy } from "./landing-queue.mjs";
import { leaseSettings, trainSettings } from "./landing-config.mjs";
import {
  endLandingLease,
  landingLease,
  renewLandingLease,
  takeLandingLease,
} from "./landing-lease.mjs";
import { leaseState } from "../lease.mjs";
import { queueNotifications } from "./notifications.mjs";
import { listSessionBindings } from "./session-bindings.mjs";
import { enqueueSessionRequests } from "./session-requests.mjs";
import { randomUUID } from "node:crypto";
import { driverIdOf } from "./spec-scheduler.mjs";
import { taskDefinition } from "./task-outcomes.mjs";
import { fail } from "./store.mjs";
import { taskRepository } from "../work-model.mjs";
import { pushHead, sourceRegistry } from "./working-heads.mjs";

const TABLE = "landing_queue";
const NO_PROMPT = { GIT_TERMINAL_PROMPT: "0" };
const LIVE = ["queued", "in-train", "landed"];

export const isTrainLanding = (project) => project?.landing === "train";

const isAncestor = async (root, older, newer) => {
  try {
    await git(root, ["merge-base", "--is-ancestor", older, newer]);
    return true;
  } catch {
    return false;
  }
};

// The batch branch name for a task: `<prefix><task>` (LT1.1).
export function batchBranch(settings, taskId) {
  const name = `${settings.branchPrefix}${taskId}`,
    problem = branchNameProblem(name);
  if (problem) fail(`Task ${taskId} cannot be queued: ${problem}`, 409);
  return name;
}

// The train settings for one base, or a refusal that names the first
// problem: `landing: train` with no valid block lands nothing (LT15.4).
export function requireTrainSettings(config, base) {
  const settings = trainSettings(config, base),
    policy = config?.landing?.trains?.targets?.[base]?.policy;
  if (!settings || !policy)
    fail(
      `Landing is train, but landing.trains.targets.${base}.policy is not set in .avoozl.json (optimistic or gated).`,
      409,
    );
  return { ...settings, policy };
}

// What a head changed against its fork point, plus the declared paths.
async function footprintOf(root, forkPoint, commit, declared = []) {
  const changed = (
    await git(root, ["diff", "--name-only", `${forkPoint}..${commit}`])
  )
    .split("\n")
    .filter(Boolean);
  return [...new Set([...declared, ...changed])].sort();
}

// Entry keys whose recorded heads this head descends from (D7).
async function builtOnOf(store, root, { projectId, base, key, commit }) {
  const out = [];
  for (const other of store.list(TABLE))
    if (
      other.projectId === projectId &&
      other.base === base &&
      other.key !== key &&
      LIVE.includes(other.state) &&
      other.commit !== commit &&
      (await isAncestor(root, other.commit, commit))
    )
      out.push(other.key);
  return out.sort();
}

// Queues one verified task as a batch branch (LT1.1 to LT1.5).
//
//   source "verify"  the tick, after Verify passed: pushes the exact commit
//                    as the batch branch.
//   source "submit"  `avoozl landing submit`: the branch already exists on
//                    the remote; its head is fetched, checked and queued.
//
// A head that does not descend from the pushed batch branch is refused
// before any push, and the branch and entry stay as they were (LT1.5).
export async function queueBatch(
  store,
  {
    project,
    task,
    commit,
    branch,
    source = "verify",
    config,
    env,
    machine,
    configFile,
    run = runCheckAt,
    now = Date.now(),
  },
) {
  const base = project.baseBranch || "main",
    settings = requireTrainSettings(config, base),
    planId = task?.planId,
    plan = planId ? store.get("plans", planId) : null,
    environment = { ...(env ?? process.env), ...NO_PROMPT };
  if (source === "submit" && plan?.state !== "approved")
    fail(
      `${task?.id ?? "The task"} is not in an approved plan, so its branch cannot be queued. Approve the plan first.`,
      409,
    );
  const driver = planId ? driverIdOf(store, planId) : null;
  if (!driver)
    fail(
      `Take over ${planId ?? "the spec"} before it lands: avoozl spec takeover ${planId ?? "SPEC"}.`,
      409,
    );
  const name = branch ?? batchBranch(settings, task.id);
  if (branchNameProblem(name)) fail(branchNameProblem(name), 400);
  if (!name.startsWith(settings.branchPrefix))
    fail(
      `Branch ${name} does not start with the batch prefix ${settings.branchPrefix}. Rename it, then submit it again.`,
      409,
    );
  const url = await git(project.root, ["remote", "get-url", "origin"]),
    repository = project.repository || `local/${project.id}`,
    remoteOf = async (ref) =>
      (
        await git(
          project.root,
          ["ls-remote", "--heads", url, `refs/heads/${ref}`],
          {
            env: environment,
          },
        )
      ).split(/\s+/)[0] || null;
  const fetchRef = async (ref) => {
    await git(project.root, ["fetch", "--quiet", url, `refs/heads/${ref}`], {
      env: environment,
    });
    return git(project.root, ["rev-parse", "FETCH_HEAD"]);
  };
  const trunk = await fetchRef(base);
  if (source === "submit") commit = await fetchRef(name);
  if (!/^[0-9a-f]{40}$/.test(commit ?? "")) fail("Queue an exact commit.", 400);
  const key = task.id,
    id = `${project.id}\0${base}\0${key}`,
    existing = store.get(TABLE, id);
  if (existing?.state === "in-train")
    fail(
      `${key} is in train ${existing.train} now; queue it again when the train ends.`,
      409,
    );
  // A rewritten head is refused before anything is pushed or changed.
  const pushed = source === "submit" ? commit : await remoteOf(name);
  if (pushed && pushed !== commit) {
    if (
      !(await git(project.root, ["cat-file", "-t", pushed]).catch(() => null))
    )
      await fetchRef(name);
    if (!(await isAncestor(project.root, pushed, commit)))
      fail(
        `${key}: the new head ${commit.slice(0, 12)} does not descend from the pushed ${name} (${pushed.slice(0, 12)}). Merge the branch into your work instead of rewriting it; nothing was changed.`,
        409,
      );
  }
  if (
    existing?.state === "queued" &&
    existing.commit !== commit &&
    !(await isAncestor(project.root, existing.commit, commit))
  )
    fail(
      `${key}: the new head ${commit.slice(0, 12)} does not descend from the queued ${existing.commit.slice(0, 12)}; nothing was changed.`,
      409,
    );
  // Cheap checks: Verify already ran them for the tick; a submitted branch
  // runs them now, before it is queued.
  const cheap = {
    commit,
    source,
    at: new Date(now).toISOString(),
    results: [],
  };
  if (source === "submit") {
    const argvs = settings.validation.cheap.length
      ? settings.validation.cheap
      : (project.checks ?? []);
    for (const argv of argvs) {
      const result = await run(project, commit, argv);
      cheap.results.push({
        command: argv.join(" "),
        exitCode: result.exitCode,
      });
      if (result.exitCode !== 0)
        fail(
          `${key}: the cheap check \`${argv.join(" ")}\` failed at ${commit.slice(0, 12)}. Fix it, then submit again.`,
          409,
        );
    }
  }
  if (source === "verify" && pushed !== commit)
    await pushHead(
      project.root,
      { repository, branch: name, commit },
      sourceRegistry({ [repository]: { url } }),
      { since: trunk, env, machine, configFile, store },
    );
  const forkPoint = await git(project.root, ["merge-base", commit, trunk]),
    extra = {
      branch: name,
      forkPoint,
      builtOn: await builtOnOf(store, project.root, {
        projectId: project.id,
        base,
        key,
        commit,
      }),
      footprint: await footprintOf(project.root, forkPoint, commit, task.paths),
      cheap,
    };
  if (existing?.state === "queued") {
    // Same place in line for a descendant head (LT1.5).
    if (existing.commit === commit && existing.branch === name) return existing;
    return store.transaction(() =>
      store.put(TABLE, { ...existing, commit, ...extra }),
    );
  }
  return enqueueLanding(
    store,
    {
      projectId: project.id,
      base,
      key,
      commit,
      spec: planId,
      driver,
      tasks: [
        {
          task: task.id,
          definition: taskDefinition({
            id: task.id,
            title: task.title,
            acceptance: task.acceptance ?? null,
          }),
        },
      ],
      extra,
    },
    { now },
  );
}

// The tick's path: queue a task that passed Verify, from the workspace's
// own configuration. Returns the delivery with the queued commit recorded.
export async function queueVerified(store, { delivery, project, task, at }) {
  const workspaceRoot = contentBinding(store)?.workspaceRoot;
  if (!workspaceRoot)
    fail("Landing is train, but this workspace has no configuration.", 409);
  const { config } = loadLayeredConfig({ workspaceRoot });
  await queueBatch(store, {
    project,
    task,
    commit: delivery.commit,
    config,
    now: Date.parse(at),
  });
  return { ...delivery, landing: { commit: delivery.commit, queuedAt: at } };
}

// `avoozl landing submit TASK --branch NAME` and its MCP twin: queue a
// branch from a session Avoozl did not start (LT1.4). Refuses a prefix
// mismatch, a task outside an approved plan and a failed cheap check, each
// naming the step.
export async function submitBranch(store, workspaceRoot, input = {}) {
  const task = store.read().tasks.find((t) => t.id === input.taskId);
  if (!task) fail(`Task ${input.taskId ?? ""} was not found.`, 404);
  if (typeof input.branch !== "string" || !input.branch)
    fail("Name the branch to submit: --branch NAME.", 400);
  const project = store.get("projects", taskRepository(task) ?? "");
  if (!isTrainLanding(project))
    fail(`${task.id} is in a repository that does not land in trains.`, 409);
  const { config } = loadLayeredConfig({ workspaceRoot });
  const entry = await queueBatch(store, {
    project,
    task,
    branch: input.branch,
    source: "submit",
    config,
  });
  return { queued: entry.key, branch: entry.branch, commit: entry.commit };
}

// ---- The integrator process (lt-2.3, design D4) ----

// Each repository target under `landing: train`: {project, target}.
export const trainTargets = (store) =>
  store
    .list("projects")
    .filter(isTrainLanding)
    .map((project) => ({ project, target: project.baseBranch || "main" }));

const noteOnce = (store, key, text) => {
  const seen = store.getMeta("integratorErrors") ?? {};
  if (seen[key] === text) return false;
  store.setMeta("integratorErrors", { ...seen, [key]: text });
  return true;
};

// One loop of the integrator for every train target in this workspace: take
// or renew the target's lease, and (in later tasks) run a train when its
// trigger fires. The lease is renewed on every loop, so a loop must be shorter
// than the heartbeat. Returns {targets: [{project, target, state, ...}],
// notify}; the caller queues the notices.
//
//   state "invalid"  the train settings are missing or wrong: nothing lands
//   state "busy"     another integrator holds the target's lease
//   state "hung"     its holder stopped renewing but is still a live process
//   state "holding"  this integrator holds the lease
export async function integratorPass(
  store,
  { config, sessionId, now = Date.now(), probe, holder, run } = {},
) {
  const out = [],
    notify = [],
    { heartbeatSeconds, missedHeartbeats } = leaseSettings(config),
    seconds = heartbeatSeconds * missedHeartbeats;
  for (const { project, target } of trainTargets(store)) {
    const where = { projectId: project.id, target };
    let settings;
    try {
      settings = requireTrainSettings(config, target);
    } catch (error) {
      // One notice per cause, not one per loop (LT15.4).
      if (noteOnce(store, `${project.id}:${target}`, error.message))
        notify.push({
          channel: "failure",
          title: `Landing on ${target} is off: the train settings are not valid`,
          text: error.message,
        });
      out.push({ ...where, state: "invalid", reason: error.message });
      continue;
    }
    const held = landingLease(store, project.id, target);
    let lease;
    if (
      held &&
      leaseState(held, now) === "active" &&
      held.sessionId === sessionId
    ) {
      const renewed = renewLandingLease(store, {
        ...where,
        leaseId: held.leaseId,
        seconds,
        now,
      });
      if (renewed.changed) {
        out.push({
          ...where,
          state: "busy",
          lease: landingLease(store, project.id, target),
        });
        continue;
      }
      lease = renewed.lease;
    } else {
      const taken = takeLandingLease(store, {
        ...where,
        sessionId,
        seconds,
        now,
        ...(probe ? { probe } : {}),
        ...(holder ? { holder } : {}),
      });
      notify.push(...(taken.notify ?? []));
      if (taken.state !== "taken") {
        out.push({ ...where, state: taken.state, lease: taken.lease });
        continue;
      }
      lease = taken.lease;
      if (taken.dead)
        await run?.cleanup?.(store, {
          ...where,
          dead: taken.dead,
          project,
          config,
          settings,
        });
    }
    const result = { ...where, project, state: "holding", lease, settings };
    // Red CI on a landed head is bisected before the next train (LT10.6).
    if (run?.bisectRed) {
      if (run?.ci) await run.ci(store, { ...result, config });
      const red = await run.bisectRed(store, { ...result, config }, { now });
      notify.push(...(red.notify ?? []));
      if (red.messages?.length) sendToChats(store, red.messages);
    }
    if (run?.train) {
      const trained = await run.train(store, { ...result, config }, { now });
      notify.push(...(trained.notify ?? []));
      if (trained.messages?.length) sendToChats(store, trained.messages);
      Object.assign(result, {
        train: trained.train ?? null,
        trained: trained.state ?? null,
      });
    }
    // Read the one CI run of each pushed train (LT8.6).
    if (run?.ci) await run.ci(store, { ...result, config });
    out.push(result);
  }
  return { targets: out, notify };
}

// What `avoozl integrator status` shows: per target, the lease holder, the
// running train and its step, and the trigger state. From the store only.
export function integratorStatus(store, { config, now = Date.now() } = {}) {
  return {
    targets: trainTargets(store).map(({ project, target }) => {
      const lease = landingLease(store, project.id, target),
        settings = (() => {
          try {
            return requireTrainSettings(config, target);
          } catch (error) {
            return { error: error.message };
          }
        })();
      return {
        repository: project.id,
        target,
        policy: settings.policy ?? null,
        settings: settings.error ? { error: settings.error } : "valid",
        lease: lease
          ? {
              state: leaseState(lease, now),
              holder: lease.holder,
              sessionId: lease.sessionId,
              heartbeatAt: lease.heartbeatAt,
              expiresAt: lease.expiresAt,
              hung: lease.hung ?? null,
            }
          : { state: "none" },
        train: lease?.train ?? null,
        trigger: settings.error
          ? null
          : triggerSummary(
              planTrain(store, {
                projectId: project.id,
                target,
                settings,
                now,
              }),
            ),
      };
    }),
  };
}

// Runs until `signal` aborts: one pass per `intervalMs`, then ends its lease
// so the next integrator takes over at once. The caller owns the store.
export async function runIntegrator(
  store,
  {
    loadConfig,
    intervalMs,
    signal,
    sessionId = `integrator-${process.pid}-${randomUUID().slice(0, 8)}`,
    run,
    onPass,
    heartbeatMs,
  },
) {
  // A train can run for many minutes inside one pass; the lease is renewed
  // on a timer so it does not expire while its holder works.
  const beat = () => {
    try {
      const { heartbeatSeconds, missedHeartbeats } =
        leaseSettings(loadConfig());
      for (const { project, target } of trainTargets(store)) {
        const held = landingLease(store, project.id, target);
        if (held?.sessionId === sessionId && leaseState(held) === "active")
          renewLandingLease(store, {
            projectId: project.id,
            target,
            leaseId: held.leaseId,
            seconds: heartbeatSeconds * missedHeartbeats,
          });
      }
    } catch {}
  };
  const heartbeat = setInterval(
    beat,
    heartbeatMs ?? leaseSettings(loadConfig()).heartbeatSeconds * 1000,
  );
  heartbeat.unref?.();
  const finish = () => {
    clearInterval(heartbeat);
    for (const { project, target } of trainTargets(store)) {
      const held = landingLease(store, project.id, target);
      if (held?.sessionId === sessionId && leaseState(held) === "active")
        endLandingLease(store, {
          projectId: project.id,
          target,
          leaseId: held.leaseId,
        });
    }
  };
  try {
    while (!signal?.aborted) {
      let pass;
      try {
        pass = await integratorPass(store, {
          config: loadConfig(),
          sessionId,
          run,
        });
        queueNotifications(store, pass.notify);
      } catch (error) {
        // An unreadable or invalid configuration lands nothing; say so once.
        if (noteOnce(store, "config", error.message))
          queueNotifications(store, [
            {
              channel: "failure",
              title: "The integrator cannot run",
              text: error.message,
            },
          ]);
      }
      onPass?.(pass);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, intervalMs);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  } finally {
    finish();
  }
}

// ---- Train records and the back-to-back trigger (lt-3.1, D2, D6) ----

const TRAINS = "landing_trains";
const trainId = () => `train-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const queuedMs = (entry) => Date.parse(entry.queuedAt) || 0;

const trainsOf = (store, projectId, target) =>
  store
    .list(TRAINS)
    .filter((t) => t.projectId === projectId && t.target === target);

// The train running for a target: one without an outcome. At most one.
export const runningTrain = (store, projectId, target) =>
  trainsOf(store, projectId, target).find((t) => !t.outcome) ?? null;

// When the target's last train ended, in ms, or 0.
export const lastTrainEnd = (store, projectId, target) =>
  Math.max(
    0,
    ...trainsOf(store, projectId, target).map(
      (t) => Date.parse(t.endedAt) || 0,
    ),
  );

// The queued entries of one target in queue order, split into those a train
// may take now and those held, each held one with its reason (LT4.2). An entry
// is ready when it is queued, its head passed the cheap checks, no open stop
// pauses it, and every entry it was built on is in the same train or already
// landed. `ready` is what remains after holds, in queue order.
export function readyEntries(store, { projectId, base }) {
  const all = store
      .list(TABLE)
      .filter((e) => e.projectId === projectId && e.base === base),
    queued = all
      .filter((e) => e.state === "queued")
      .sort((a, b) => a.seq - b.seq),
    held = new Map();
  let ready = [];
  for (const entry of queued) {
    if (entry.cheap?.commit !== entry.commit)
      held.set(entry.key, "its cheap checks have not passed at this head");
    else {
      const stop = pausedBy(store, entry);
      if (stop) held.set(entry.key, `paused by stop ${stop.id}`);
      else ready.push(entry);
    }
  }
  // An entry built on a queued entry that is not going with it waits.
  for (let changed = true; changed; ) {
    changed = false;
    const keys = new Set(ready.map((e) => e.key));
    ready = ready.filter((entry) => {
      const missing = (entry.builtOn ?? []).find(
        (key) =>
          !keys.has(key) &&
          all.some(
            (e) =>
              e.key === key && (e.state === "queued" || e.state === "in-train"),
          ),
      );
      if (missing === undefined) return true;
      held.set(
        entry.key,
        `built on ${missing}, which is queued outside this train`,
      );
      changed = true;
      return false;
    });
  }
  return { ready, held: [...held].map(([key, reason]) => ({ key, reason })) };
}

// Whether a train starts now, and with whom (D6). Pure over the store and the
// clock.
//   {state: "running", train}       a train is running: trains never overlap
//   {state: "cooldown", until}      the last train ended less than
//                                    `cooldownSeconds` ago
//   {state: "wait", why, ready, held, startsAt?}
//   {state: "start", members, held} members in queue order, at most
//                                    `maxBranches`
export function planTrain(
  store,
  { projectId, target, settings, now = Date.now() },
) {
  const running = runningTrain(store, projectId, target);
  if (running) return { state: "running", train: running.id };
  const { trigger } = settings,
    cooled =
      lastTrainEnd(store, projectId, target) + trigger.cooldownSeconds * 1000;
  if (now < cooled)
    return { state: "cooldown", until: new Date(cooled).toISOString() };
  // `ci.waitForLastTrain`: the next train waits for the last pushed train's CI
  // conclusion, for at most an hour (shortcut: a run that is never read must
  // not stop landing; upgrade with a setting if that is too long).
  if (settings.ci.waitForLastTrain && settings.ci.workflow) {
    const last = trainsOf(store, projectId, target)
      .filter((t) => t.pushed && t.endedAt)
      .sort((x, y) => y.endedAt.localeCompare(x.endedAt))[0];
    if (
      last &&
      !last.ci?.conclusion &&
      now - Date.parse(last.endedAt) < 60 * 60000
    )
      return {
        state: "wait",
        why: `waiting for the CI run of ${last.id}`,
        ready: 0,
        held: [],
      };
  }
  const { ready, held } = readyEntries(store, { projectId, base: target });
  if (!ready.length)
    return { state: "wait", why: "nothing is ready", ready: 0, held };
  const waitedUntil = queuedMs(ready[0]) + trigger.maxWaitMinutes * 60000;
  if (ready.length < trigger.minBranches && now < waitedUntil)
    return {
      state: "wait",
      why: `${ready.length} of ${trigger.minBranches} ready branches; a smaller train starts at ${new Date(waitedUntil).toISOString()}`,
      ready: ready.length,
      held,
      startsAt: new Date(waitedUntil).toISOString(),
    };
  // Composition keeps an entry after the entries it was built on, so cutting
  // at maxBranches never cuts a dependency out.
  const composed = composeTrain(ready, {
    overlap: settings.scheduling?.overlap ?? "same-train",
    maxBranches: trigger.maxBranches,
  });
  return {
    state: "start",
    members: composed.members,
    held: [...held, ...composed.held],
  };
}

// Opens a train for `members` and marks each entry `in-train`, in one
// transaction. Refuses a second train for the target.
export function startTrain(
  store,
  {
    projectId,
    target,
    policy,
    members,
    baseHead,
    leaseId = null,
    now = Date.now(),
  },
) {
  if (!members.length) fail("A train has at least one member.", 400);
  return store.transaction(() => {
    if (runningTrain(store, projectId, target))
      fail(`A train is already running for ${target}.`, 409);
    const id = trainId(),
      at = new Date(now).toISOString();
    for (const entry of members) {
      const current = store.get(TABLE, entry.id);
      if (current?.state !== "queued")
        fail(`${entry.key} is no longer queued.`, 409);
      store.put(TABLE, { ...current, state: "in-train", train: id });
    }
    return store.put(TRAINS, {
      id,
      projectId,
      target,
      policy,
      baseHead,
      leaseId,
      startedAt: at,
      members: members.map((e) => ({
        key: e.key,
        task: e.tasks?.[0]?.task ?? e.key,
        spec: e.spec,
        originalHead: e.commit,
        cutFrom: null,
        boundary: null,
        state: "stacking",
      })),
      steps: [],
      checks: {},
      bisects: [],
      culprits: [],
      pushed: null,
      ci: null,
      worktrees: [],
      slots: [],
      outcome: null,
    });
  });
}

// Ends a train with its outcome (landed, partly-landed, failed, abandoned).
// Members that did not land go back to `queued`, in their place.
export function endTrain(
  store,
  trainRecordId,
  outcome,
  { now = Date.now() } = {},
) {
  if (!["landed", "partly-landed", "failed", "abandoned"].includes(outcome))
    fail(`A train ends landed, partly-landed, failed or abandoned.`, 400);
  return store.transaction(() => {
    const train = store.get(TRAINS, trainRecordId);
    if (!train || train.outcome) return train;
    for (const member of train.members) {
      const entry = store.get(
        TABLE,
        `${train.projectId}\0${train.target}\0${member.key}`,
      );
      if (entry?.state === "in-train" && entry.train === train.id)
        store.put(TABLE, { ...entry, state: "queued", train: null });
    }
    return store.put(TRAINS, {
      ...train,
      outcome,
      endedAt: new Date(now).toISOString(),
    });
  });
}

// A plan as `integrator status` shows it: members by key.
const triggerSummary = (plan) => ({
  ...plan,
  ...(plan.members ? { members: plan.members.map((e) => e.key) } : {}),
});

// Messages for worker chats (a conflict or failure sent back) go out as
// session requests, the way the tick sends them.
function sendToChats(store, messages) {
  const bindings = listSessionBindings(store);
  enqueueSessionRequests(
    store,
    {
      sends: messages.map((message) => ({
        ...message,
        executor:
          message.executor ??
          bindings.find((b) => b.slot === message.slot)?.executor ??
          "kirocrew",
      })),
    },
    { source: "integrator" },
  );
}
