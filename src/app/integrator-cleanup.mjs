// A taker cleans up a dead integrator's train (landing-trains LT3.6, LT3.7,
// design D5.3). Called when a lease was taken from a holder that is gone, before
// any new train forms. From the dead train's record it:
//   - removes each listed landing worktree,
//   - runs each held platform environment's `cleanup` argv once,
//   - releases the resource slots it held,
//   - settles the members: back to `queued` in order when nothing was pushed;
//     when an optimistic train had pushed the trunk, runs full validation on
//     the pushed head first, so the next train never stacks on an unchecked one.
// Each action is written to the dead train's steps with `by: <new train or
// taker>`, and its outcome becomes `abandoned`.
import { commandEvidence } from "./git.mjs";
import {
  removeLandingWorktree,
  addLandingWorktree,
} from "./integrator-stack.mjs";
import { endTrain, runningTrain } from "./integrator-trains.mjs";
import {
  machinePlatforms,
  recordPlatformResult,
  runPlatforms,
} from "./integrator-validation.mjs";
import { markLanded } from "./pr-landing.mjs";
import { releaseSlots } from "./resource-slots.mjs";

const TABLE = "landing_queue";
const TRAINS = "landing_trains";

export async function cleanupDeadTrain(
  store,
  {
    project,
    target,
    settings,
    config,
    slots,
    by = "taker",
    env,
    run = commandEvidence,
    runOptions = {},
  },
) {
  const dead = runningTrain(store, project.id, target);
  if (!dead) return null;
  const root = project.root,
    platforms = machinePlatforms(config),
    log = [];
  const note = (name, result, detail) =>
    log.push({
      name,
      by,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      result,
      ...(detail ? { detail } : {}),
    });
  for (const dir of dead.worktrees ?? []) {
    await removeLandingWorktree(root, dir);
    note("remove worktree", "ok", dir);
  }
  // Each held environment's cleanup, once: the platforms with a slot the
  // train held, or that it ran validation on.
  const used = new Set([
    ...Object.keys(dead.checks ?? {}).filter((k) => k !== "cheap"),
    ...(dead.slots ?? []).flatMap((s) =>
      Object.entries(platforms)
        .filter(([, env]) => env.slot === s.slot)
        .map(([name]) => name),
    ),
  ]);
  for (const platform of used) {
    const cleanup = platforms[platform]?.cleanup;
    if (!cleanup) continue;
    const result = await run(root, cleanup, { env });
    note(`cleanup ${platform}`, result.exitCode === 0 ? "ok" : "failed");
  }
  if (slots?.db) {
    const freed = releaseSlots(slots.db, { train: dead.id });
    if (freed) note("release slots", "ok", `${freed}`);
  }
  let outcome = "abandoned";
  if (dead.pushed && dead.policy === "optimistic") {
    // The trunk already has this train: validate it before anything else.
    const validated = await validatePushed(store, dead, {
      project,
      settings,
      platforms,
      root,
      env,
      runOptions,
    });
    note(
      "validate pushed head",
      validated.ok ? "ok" : "failed",
      validated.detail,
    );
    const at = new Date().toISOString();
    for (const member of dead.members.filter((m) => m.state === "stacked")) {
      const entry = store.get(TABLE, `${project.id}\0${target}\0${member.key}`);
      if (entry?.state !== "in-train") continue;
      store.put(TABLE, {
        ...entry,
        state: "landed",
        train: dead.id,
        trunkCommit: dead.pushed,
        boundary: member.boundary,
        finishedAt: at,
      });
      markLanded(store, entry, {
        mergeCommit: member.boundary ?? dead.pushed,
        branch: entry.branch,
        at,
      });
    }
    store.put(TRAINS, {
      ...store.get(TRAINS, dead.id),
      validated: validated.ok,
    });
  }
  store.transaction(() =>
    store.put(TRAINS, {
      ...store.get(TRAINS, dead.id),
      steps: [...store.get(TRAINS, dead.id).steps, ...log],
      worktrees: [],
      slots: [],
    }),
  );
  // Members still `in-train` (nothing pushed) return to `queued`, same seq.
  endTrain(store, dead.id, outcome);
  return { train: store.get(TRAINS, dead.id), log };
}

async function validatePushed(
  store,
  dead,
  { project, settings, platforms, root, env, runOptions },
) {
  const dir = await addLandingWorktree(root, dead.pushed);
  try {
    const local = Object.keys(settings.validation.full).filter(
      (p) => platforms[p],
    );
    const results = await runPlatforms(dir, local, settings, platforms, {
      env,
      ...runOptions,
    });
    for (const r of results) recordPlatformResult(store, dead.id, r);
    const bad = results.filter((r) => !r.ok);
    return {
      ok: !bad.length,
      detail: bad.map((r) => r.platform).join(", ") || undefined,
    };
  } finally {
    await removeLandingWorktree(root, dir);
  }
}
