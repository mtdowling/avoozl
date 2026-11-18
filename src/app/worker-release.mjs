// Claim release and stale-claim status (Requirement 90.6, 102.14, design
// §4.32.8, task 43.4).
//
// A claim never expires. A worker that is quiet, whose lease lapsed, whose
// connection dropped or whose chat vanished keeps its claim. Only two things
// end one:
// - the driver, once an accepted result (`landed`, `done` or `skipped`)
//   exists for that task and definition: the claim is settled;
// - a person's Release claim.
// After a takeover the new driver carries each unfinished claim into its own
// generation for the same worker; it does not hand the task to anyone else.
// `workers.claimStaleAfter` (default 24 h) only decides when Needs you shows
// the claim and offers Release claim.
import { driverState, revalidate } from "./driver-generations.mjs";
import { loadLayeredConfig } from "./layered-config.mjs";
import { queueNotifications } from "./notifications.mjs";
import { appendRecord, replayJournal } from "./spec-journal.mjs";
import { fail } from "./store.mjs";
import { claimBranch, claimOp } from "./worker-claims.mjs";

const COMPLETING = new Set(["landed", "done", "skipped"]);
const UNITS = { m: 60_000, h: 3_600_000, d: 86_400_000 };
export const DEFAULT_STALE = 24 * UNITS.h;

// `workers.claimStaleAfter`: "90m", "24h", "2d" or a number of seconds.
export function claimStaleMs(value) {
  if (value === undefined) return DEFAULT_STALE;
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return value * 1000;
  const found = /^(\d{1,6})([mhd])$/.exec(String(value));
  if (!found || !Number(found[1]))
    fail("workers.claimStaleAfter is like 90m, 24h or 2d.");
  return Number(found[1]) * UNITS[found[2]];
}

const completed = (state, claim) =>
  state.outcomes.some(
    (outcome) =>
      COMPLETING.has(outcome.kind) &&
      outcome.task === claim.tasks[0].task &&
      outcome.definition === claim.tasks[0].definition,
  );

// One row per active claim. `seen` maps a task to the last time its worker
// was seen working (an ISO time the caller read from git); the claim's own
// acknowledgment time is the floor. A row with no known time is never stale.
export function claimRows(
  state,
  { now = Date.now(), staleAfter = DEFAULT_STALE, seen = {} } = {},
) {
  return state.claims.map((claim) => {
    const task = claim.tasks[0].task,
      since = Math.max(
        Date.parse(claim.at ?? "") || 0,
        Date.parse(seen[task] ?? "") || 0,
      ),
      age = since ? now - since : null;
    return {
      task,
      worker: claim.worker,
      generation: claim.generation,
      carried: claim.generation < state.generation,
      settled: completed(state, claim),
      since: since ? new Date(since).toISOString() : null,
      stale: age !== null && age > staleAfter && !completed(state, claim),
    };
  });
}

async function read(journal, options) {
  return driverState(
    await replayJournal(await journal.list(), {
      ...options,
      permission: journal.permission,
    }),
  );
}

// After a takeover, or when a result was accepted: carry an unfinished claim
// into the current generation for the same worker, and settle a finished one
// (delete its claim branch and write the release). Never touches another
// claim. Returns {ok, carried, settled}.
export async function reconcileClaims({
  github,
  journal,
  options = {},
  driver,
  owner,
  login,
  spec,
  claims,
}) {
  const check = await revalidate(journal, { driver, owner, login }, options);
  if (!check.ok)
    return { ok: false, reason: check.reason, carried: [], settled: [] };
  const state = check.state,
    result = { ok: true, carried: [], settled: [] };
  for (const claim of [...state.claims]) {
    const [{ task, definition }] = claim.tasks;
    if (completed(state, claim)) {
      await github.deleteBranch(claims, claimBranch(spec, task));
      await appendRecord(
        journal,
        {
          op: `release.${task}.g${state.generation}.${state.released.filter((r) => r.tasks[0].task === task).length}`,
          kind: "claim",
          spec,
          driver,
          worker: claim.worker,
          tasks: [{ task, definition }],
          released: "settled",
        },
        options,
      );
      result.settled.push(task);
    } else if (claim.generation < state.generation) {
      await appendRecord(
        journal,
        {
          op: claimOp(state, task),
          kind: "claim",
          spec,
          driver,
          worker: claim.worker,
          tasks: [{ task, definition }],
        },
        options,
      );
      result.carried.push(task);
    }
  }
  return result;
}

// A person's Release claim. Only the spec's effective owner passes
// revalidation; `by` must be a person. The claim branch goes first, so a
// retry after a crash finds it gone and still writes the record.
export async function releaseClaim({
  github,
  journal,
  options = {},
  driver,
  owner,
  login,
  spec,
  claims,
  task,
  by,
}) {
  if (by?.kind !== "person")
    fail(
      "Release claim is a person's action; Avoozl never releases a claim by itself.",
      403,
    );
  const check = await revalidate(journal, { driver, owner, login }, options);
  if (!check.ok) fail(`Cannot release a claim now: ${check.reason}.`, 409);
  const state = check.state,
    claim = state.claims.find((c) => c.tasks[0].task === task);
  if (!claim) fail(`Task ${task} has no active claim.`, 404);
  await github.deleteBranch(claims, claimBranch(spec, task));
  const written = await appendRecord(
    journal,
    {
      op: `release.${task}.g${state.generation}.${state.released.filter((r) => r.tasks[0].task === task).length}`,
      kind: "claim",
      spec,
      driver,
      worker: claim.worker,
      tasks: claim.tasks,
      released: "person",
    },
    options,
  );
  return { task, worker: claim.worker, record: written.id };
}

// Needs you rows for stale claims. The text has no age, so the same claim
// is one notice however long it stays quiet.
export function staleNotices(rows, { spec }) {
  return rows
    .filter((row) => row.stale)
    .map((row) => ({
      channel: "decision",
      task: row.task,
      title: `Claim on ${row.task} is quiet`,
      text: `${spec}: task ${row.task} has been claimed past the stale limit with no accepted result. Nothing releases it by itself.`,
      resume: `Release claim: avoozl spec claims release ${spec} ${row.task} --claims OWNER/REPO`,
    }));
}

// The cron's pass: for each spec this workspace drives, read its journal and
// queue Needs you for stale claims. At most once in ten minutes.
export async function checkStaleClaims(
  store,
  { workspaceRoot, journalFor, driving, now = Date.now(), env },
) {
  const last = Date.parse(store.getMeta("worker.claimCheckedAt") ?? "") || 0;
  if (now - last < 600_000 || !driving.length) return 0;
  store.setMeta("worker.claimCheckedAt", new Date(now).toISOString());
  const config = loadLayeredConfig({ workspaceRoot, env }).config,
    staleAfter = claimStaleMs(config?.workers?.claimStaleAfter);
  let queued = 0;
  for (const spec of driving) {
    const found = await journalFor(spec);
    if (!found?.journal || found.journal.unreadable) continue;
    const state = await read(found.journal, found.options);
    if (state.held) continue;
    queued += queueNotifications(
      store,
      staleNotices(claimRows(state, { now, staleAfter }), { spec }),
      now,
    );
  }
  return queued;
}

export const claimStatus = async (journal, options, rowOptions) =>
  claimRows(await read(journal, options), rowOptions);
