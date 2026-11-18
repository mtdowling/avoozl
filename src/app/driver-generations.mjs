// Driver generations, guarded intents and landing reconciliation
// (Requirement 102.5, 102.13 and 102.14, design §4.32.2 and §4.32.7, task
// 56.4). Builds on the spec journal (spec-journal.mjs) and working heads
// (working-heads.mjs).
//
// - Authority. The effective owner is the spec issue's single assignee,
//   else the epic issue's single assignee. None or several holds. Only that
//   person may take over, which writes the next generation with a new
//   opaque driver id. Two takeovers at once are a journal conflict, so the
//   journal holds and nothing dispatches until the owner resolves it.
// - Revalidation. Before every dispatch and landing the driver replays the
//   journal: it must still be the current generation's driver, the owner
//   must be unchanged, and no hold or stop control may be open.
// - Landing. Write an intent (exact candidate, expected base head, tasks
//   with definitions, check evidence), read it back, land by a guarded
//   update (fast-forward only from that base head, or a merge guarded by
//   the pull request's head), then read again before writing the outcome.
//   A displaced driver writes nothing further.
// - After a takeover the new driver holds every task of an outstanding
//   intent. A candidate already on the base gets its outcome once, from the
//   intent's evidence. Otherwise it waits, or a person voids it once the
//   base moved past the intent's base or they confirm the old driver
//   stopped. Outcome operation IDs derive from the intent, and effective
//   outcomes are deduplicated, so one landing yields one effective outcome.
//   This is not exactly-once execution: duplicated work is possible.
// - Trailers. `Avoozl-Task: <task>@<definition>` is a pointer. Without
//   intent evidence for that exact commit, or re-verification at it, a
//   trailer yields `landed-unverified` and a person decides.
//
// Private handoff (driver.mjs buildExport) is unchanged: sensitive controls
// still travel there, never in this journal.
import { randomBytes } from "node:crypto";
import { git } from "./git.mjs";
import { appendRecord, replayJournal } from "./spec-journal.mjs";
import { fail } from "./store.mjs";

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const STOPPING = new Set(["hold", "stop"]);
const RELEASING = new Set(["resume", "release"]);

const same = (a, b) =>
  String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

export const newDriverId = () => randomBytes(8).toString("hex");

// The one login with authority over the spec: the spec issue's single
// assignee, else (only when the spec issue has none) the epic issue's.
export function effectiveOwner({ spec = [], epic = [] } = {}) {
  if (spec.length === 1) return { login: spec[0], from: "spec" };
  if (spec.length > 1) return { login: null, reason: "several" };
  if (epic.length === 1) return { login: epic[0], from: "epic" };
  return { login: null, reason: epic.length ? "several" : "no-assignee" };
}

// The driver state a replay gives: the current generation and its driver,
// open controls, outstanding intents, voids and effective outcomes. A
// record whose `driver` is not its generation's driver authorizes nothing.
export function driverState(replay) {
  const state = {
    held: replay.held,
    generation: 0,
    driver: null,
    controls: new Map(),
    intents: new Map(),
    offers: [],
    claims: [],
    voided: new Set(),
    outcomes: [],
    ignored: [],
  };
  const seen = new Set();
  for (const { id, record } of replay.records) {
    if (record.kind === "generation") {
      state.generation = record.generation;
      state.driver = record.driver ?? null;
      continue;
    }
    if (record.driver && record.driver !== state.driver) {
      state.ignored.push({ id, reason: "displaced-driver" });
      continue;
    }
    if (record.kind === "control")
      for (const entry of record.controls)
        state.controls.set(entry.id, entry.flag);
    else if (record.kind === "intent")
      state.intents.set(record.op, { id, ...record });
    else if (record.kind === "offer") state.offers.push({ id, ...record });
    else if (record.kind === "claim") state.claims.push({ id, ...record });
    else if (record.kind === "void") state.voided.add(record.voids);
    else if (record.kind === "outcome")
      for (const entry of record.outcomes) {
        // One effective outcome per task, definition, kind and commit.
        const key = [entry.task, entry.definition, entry.kind, entry.commit]
          .map(String)
          .join("\0");
        if (seen.has(key)) continue;
        seen.add(key);
        state.outcomes.push({
          id,
          op: record.op,
          ...entry,
          revision: entry.revision ?? record.revision,
        });
      }
  }
  return state;
}

// The outcome operation for one intent, per writing driver, so an old and a
// new driver never write one operation ID with two payloads (that would
// hold the journal); effective outcomes are deduplicated instead.
const landingOp = (driver, intentOp) => `land.${driver}.${intentOp}`;
const fromIntent = (op) => /^land\.[0-9a-f]{16}\.(.+)$/.exec(op ?? "")?.[1];

// Intents with neither an outcome from them nor a void.
export function outstandingIntents(state) {
  const settled = new Set(
    state.outcomes.map((outcome) => fromIntent(outcome.op)),
  );
  return [...state.intents.values()].filter(
    (intent) => !settled.has(intent.op) && !state.voided.has(intent.op),
  );
}

// Tasks dispatch and landing must leave alone: those named by an
// outstanding intent.
export const heldTasks = (state) =>
  new Set(
    outstandingIntents(state).flatMap((intent) =>
      intent.tasks.map((t) => t.task),
    ),
  );

export const openControls = (state) =>
  [...state.controls]
    .filter(([, flag]) => STOPPING.has(flag))
    .map(([id]) => id);

async function read(journal, options) {
  const replay = await replayJournal(await journal.list(), {
    ...options,
    permission: journal.permission,
  });
  return driverState(replay);
}

// Whether `driver` may dispatch or land now: the journal is not held, the
// driver is the current generation's, the owner is the same login that
// took over, and no hold or stop is open. {ok, reason, state}.
export async function revalidate(
  journal,
  { driver, owner, login },
  options = {},
) {
  const state = await read(journal, options),
    no = (reason) => ({ ok: false, reason, state });
  if (state.held) return no("journal-held");
  if (!state.driver || state.driver !== driver) return no("displaced");
  if (!owner?.login) return no(owner?.reason ?? "no-owner");
  if (!same(owner.login, login)) return no("owner-changed");
  if (openControls(state).length) return no("stopped");
  return { ok: true, reason: null, state };
}

// A person's take over: only the effective owner, and only on a journal
// that is not held. Writes the next generation with a new driver id. A
// concurrent takeover makes the journal conflict and hold. The first
// generation also names `sources`, the spec's Radar issues
// (radar-backlinks.mjs), once.
export async function takeOver(
  journal,
  { by, owner, spec, sources = [] },
  options = {},
) {
  if (by?.kind !== "person")
    fail(
      "Take over is a person's action; Avoozl never takes over by itself.",
      403,
    );
  if (!owner?.login)
    fail(
      owner?.reason === "several"
        ? "The spec has several assignees. Assign exactly one person first."
        : "The spec has no assignee. Assign one person first.",
      409,
    );
  if (!same(owner.login, by.login))
    fail(`Only ${owner.login}, the spec's owner, may take over.`, 403);
  const state = await read(journal, options);
  if (state.held)
    fail("This spec's journal is held; a person must reconcile it first.", 409);
  const driver = options.driver ?? newDriverId(),
    generation = state.generation + 1,
    written = await appendRecord(
      journal,
      {
        op: `generation-${generation}`,
        kind: "generation",
        spec,
        generation,
        driver,
        ...(generation === 1 && sources.length ? { sources } : {}),
      },
      options,
    );
  // Read back: a concurrent takeover leaves the journal held.
  const after = await read(journal, options);
  if (after.held || after.driver !== driver)
    return { ok: false, reason: "ambiguous", generation, driver };
  return {
    ok: true,
    generation,
    driver,
    id: written.id,
    outstanding: outstandingIntents(after),
  };
}

// The landing protocol. `candidate` is the exact commit, `base` the base
// head it must advance from; `tasks` [{task, definition}]; `checks` the
// check evidence; `refs` qualified references for the candidate. `land()`
// performs the guarded update and returns truthy when it landed. `hooks`
// lets a test pause between steps.
export async function landIntent(
  journal,
  {
    driver,
    owner,
    login,
    spec,
    op,
    revision,
    candidate,
    base,
    tasks,
    checks,
    refs,
    land,
  },
  options = {},
  hooks = {},
) {
  if (!SHA.test(candidate ?? "") || !SHA.test(base ?? ""))
    fail("An intent names the exact candidate and base commits.", 400);
  if (!tasks?.length || tasks.some((t) => !DIGEST.test(t.definition ?? "")))
    fail("An intent names each task with its definition.", 400);
  if (!DIGEST.test(revision ?? ""))
    fail("An intent names the approved revision.", 400);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,57}$/.test(op ?? ""))
    fail(
      "An intent's operation ID is at most 58 letters, digits and . _ -.",
      400,
    );
  if (refs?.at(-1)?.commit !== candidate)
    fail("An intent's last reference names the candidate commit.", 400);
  const before = await revalidate(journal, { driver, owner, login }, options);
  if (!before.ok) return { state: "refused", reason: before.reason };
  if (tasks.some((t) => heldTasks(before.state).has(t.task)))
    return { state: "refused", reason: "outstanding-intent" };
  // 1. Intent.
  await appendRecord(
    journal,
    {
      op,
      kind: "intent",
      spec,
      driver,
      revision,
      base,
      tasks,
      refs,
      ...(checks?.length ? { checks } : {}),
    },
    options,
  );
  await hooks.afterIntent?.();
  // 2. Read back.
  const readBack = await revalidate(journal, { driver, owner, login }, options);
  if (!readBack.ok || !readBack.state.intents.has(op))
    return {
      state: "stopped",
      reason: readBack.reason ?? "intent-missing",
      step: "read-back",
    };
  await hooks.beforeLand?.();
  // 3. Land with a guarded update.
  const landed = await land();
  if (!landed) return { state: "not-landed", reason: "guard" };
  // 4. Outcome, only if still the driver.
  const after = await revalidate(journal, { driver, owner, login }, options);
  if (!after.ok) return { state: "landed-unrecorded", reason: after.reason };
  await recordLanding(
    journal,
    after.state.intents.get(op),
    { spec, driver },
    options,
  );
  return { state: "landed" };
}

// The candidate an intent names: its last reference's commit.
const candidateOf = (intent) => intent.refs.at(-1).commit;

async function recordLanding(journal, intent, { spec, driver }, options) {
  const commit = candidateOf(intent);
  return appendRecord(
    journal,
    {
      op: landingOp(driver, intent.op),
      kind: "outcome",
      spec,
      driver,
      outcomes: intent.tasks.map((task) => ({
        task: task.task,
        kind: "landed",
        definition: task.definition,
        revision: intent.revision,
        commit,
        ...(intent.checks ? { checks: intent.checks } : {}),
      })),
    },
    options,
  );
}

async function isAncestor(root, older, newer) {
  try {
    await git(root, ["merge-base", "--is-ancestor", older, newer]);
    return true;
  } catch {
    return false;
  }
}

// After a takeover: each outstanding intent, by what the base shows now.
// - landed: the candidate is on the base; its outcome is written once from
//   the intent's evidence.
// - void-allowed: the base moved past the intent's base without it.
// - wait: the base is unchanged; the old driver may still land it. A
//   person may void it after confirming the old driver stopped.
// `baseHead` is the base head now; `root` a checkout that has fetched it.
export async function reconcileIntents(
  journal,
  { driver, owner, login, spec, root, baseHead },
  options = {},
) {
  const check = await revalidate(journal, { driver, owner, login }, options);
  if (!check.ok) return { ok: false, reason: check.reason, intents: [] };
  const results = [];
  for (const intent of outstandingIntents(check.state)) {
    const candidate = candidateOf(intent);
    if (await isAncestor(root, candidate, baseHead)) {
      await recordLanding(journal, intent, { spec, driver }, options);
      results.push({ op: intent.op, state: "landed" });
    } else if (baseHead !== intent.base)
      results.push({ op: intent.op, state: "void-allowed" });
    else results.push({ op: intent.op, state: "wait" });
  }
  return { ok: true, intents: results };
}

// A person voids an outstanding intent: allowed when the base moved past
// the intent's base without the candidate, or when they confirm the old
// driver is stopped.
export async function voidIntent(
  journal,
  { by, driver, owner, spec, op, root, baseHead, confirmedStopped = false },
  options = {},
) {
  if (by?.kind !== "person")
    fail("Voiding an intent is a person's action.", 403);
  const check = await revalidate(
    journal,
    { driver, owner, login: by.login },
    options,
  );
  if (!check.ok) fail(`This driver cannot void now: ${check.reason}.`, 409);
  const intent = outstandingIntents(check.state).find(
    (entry) => entry.op === op,
  );
  if (!intent) fail("That intent is not outstanding.", 404);
  const candidate = candidateOf(intent);
  if (await isAncestor(root, candidate, baseHead))
    fail("That intent's candidate is on the base; reconcile it instead.", 409);
  if (baseHead === intent.base && !confirmedStopped)
    fail(
      "The base has not moved; confirm the old driver is stopped before voiding.",
      409,
    );
  return appendRecord(
    journal,
    { op: `void.${op}`.slice(0, 80), kind: "void", spec, driver, voids: op },
    options,
  );
}

// Guarded fast-forward of `branch` in a registered remote from exactly
// `base` to `candidate`. Refuses unless the remote is at `base` and the
// candidate descends from it; the push itself is fast-forward only, so a
// base that moved between the read and the push refuses. Never forced.
export async function guardedFastForward(
  root,
  { url, branch, base, candidate, env },
) {
  if (!(await isAncestor(root, base, candidate)))
    fail("The candidate does not build on the expected base.", 409);
  const environment = { ...(env ?? process.env), GIT_TERMINAL_PROMPT: "0" },
    remote = (
      await git(root, ["ls-remote", "--heads", url, `refs/heads/${branch}`], {
        env: environment,
      })
    ).split(/\s+/)[0];
  if (remote !== base) return false;
  try {
    await git(
      root,
      ["push", "--quiet", url, `${candidate}:refs/heads/${branch}`],
      {
        env: environment,
      },
    );
    return true;
  } catch {
    return false;
  }
}

// A merge guarded by the pull request's head: GitHub refuses when the head
// is no longer `sha`.
export async function headGuardedMerge(
  github,
  repository,
  number,
  sha,
  method,
) {
  try {
    const result = await github.mergePullRequest(repository, number, {
      sha,
      method,
    });
    return Boolean(result?.merged);
  } catch (error) {
    if (error.status === 409 || error.status === 405) return false;
    throw error;
  }
}

const TRAILER =
  /^Avoozl-Task:\s*([A-Za-z0-9][A-Za-z0-9._-]{0,79})@([0-9a-f]{64})\s*$/gm;

// Every `Avoozl-Task: <task>@<definition>` trailer in a commit message.
export function parseTrailers(message) {
  return [...String(message ?? "").matchAll(TRAILER)].map((m) => ({
    task: m[1],
    definition: m[2],
  }));
}

// What one trailer on a landing commit means (§4.32.2):
// - skip: a completing outcome for that definition already exists.
// - landed: the task is in the approved revision with that definition, and
//   an intent covers this exact commit with evidence, or `reverified` says
//   the commit passed its paths, checks and review now.
// - landed-unverified: anything else (a copied or stale trailer, a changed
//   definition, no evidence). A person decides; it never becomes landed.
export function trailerOutcome(
  { task, definition, commit },
  { approved, state, reverified = false },
) {
  if (
    state.outcomes.some(
      (o) =>
        o.task === task &&
        o.definition === definition &&
        ["landed", "done", "skipped"].includes(o.kind),
    )
  )
    return { kind: "skip", reason: "already-complete" };
  if (approved.get(task) !== definition)
    return {
      kind: "landed-unverified",
      reason: approved.has(task) ? "stale-definition" : "unknown-task",
    };
  const covered = [...state.intents.values()].some(
    (intent) =>
      intent.checks?.length &&
      intent.refs.some((ref) => ref.commit === commit) &&
      intent.tasks.some((t) => t.task === task && t.definition === definition),
  );
  if (covered) return { kind: "landed", reason: "intent-evidence" };
  if (reverified) return { kind: "landed", reason: "reverified" };
  return { kind: "landed-unverified", reason: "no-evidence" };
}
