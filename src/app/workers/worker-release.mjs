// Grant release and stale-grant status (Requirement 90.6, 102.14, design
// §4.32.8, task 43.4).
//
// A grant never expires. A worker that is quiet, whose lease lapsed, whose
// connection dropped or whose chat vanished keeps its grant. Only two things
// end one:
// - the driver, once an accepted result (`landed`, `done` or `skipped`)
//   exists for that task and definition: the grant is settled;
// - a person's Release grant.
// After a takeover the new driver carries each unfinished grant into its own
// generation for the same worker; it does not hand the task to anyone else.
// `workers.grantStaleAfter` (default 24 h) only decides when Needs you shows
// the grant and offers Release grant.
import { driverState, revalidate } from "./driver-generations.mjs";
import { loadLayeredConfig } from "../settings/layered-config.mjs";
import { queueNotifications } from "../tick/notifications.mjs";
import { appendRecord, replayJournal } from "../specs/spec-journal.mjs";
import { fail } from "../store/store.mjs";
import { grantBranch, grantOp } from "./worker-grants.mjs";
import { asJob } from "../github/github-jobs.mjs";

const COMPLETING = new Set(["landed", "done", "skipped"]);
const UNITS = { m: 60_000, h: 3_600_000, d: 86_400_000 };
const DEFAULT_STALE = 24 * UNITS.h;

// `workers.grantStaleAfter`: "90m", "24h", "2d" or a number of seconds.
export function grantStaleMs(value) {
  if (value === undefined) return DEFAULT_STALE;
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return value * 1000;
  const found = /^(\d{1,6})([mhd])$/.exec(String(value));
  if (!found || !Number(found[1]))
    fail("workers.grantStaleAfter is like 90m, 24h or 2d.");
  return Number(found[1]) * UNITS[found[2]];
}

const completed = (state, grant) =>
  state.outcomes.some(
    (outcome) =>
      COMPLETING.has(outcome.kind) &&
      outcome.task === grant.tasks[0].task &&
      outcome.definition === grant.tasks[0].definition,
  );

// One row per active grant. `seen` maps a task to the last time its worker
// was seen working (an ISO time the caller read from git); the grant's own
// acknowledgment time is the floor. A row with no known time is never stale.
export function grantRows(
  state,
  { now = Date.now(), staleAfter = DEFAULT_STALE, seen = {} } = {},
) {
  return state.grants.map((grant) => {
    const task = grant.tasks[0].task,
      since = Math.max(
        Date.parse(grant.at ?? "") || 0,
        Date.parse(seen[task] ?? "") || 0,
      ),
      age = since ? now - since : null;
    return {
      task,
      worker: grant.worker,
      generation: grant.generation,
      carried: grant.generation < state.generation,
      settled: completed(state, grant),
      since: since ? new Date(since).toISOString() : null,
      stale: age !== null && age > staleAfter && !completed(state, grant),
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

// Deletes a grant branch only when it is Avoozl's own (own-branch-delete,
// §D6, PC13.1): under the grant prefix, and its head still the commit the
// grant was made at. Any other branch is left for a person. True when the
// branch is gone.
export async function deleteOwnBranch(github, repository, branch, grant) {
  if (!/^avoozl\/[^/]+\/grant\/[^/]+$/.test(branch)) return false;
  let head = null;
  try {
    head = (await github.branch(repository, branch))?.commit?.sha ?? null;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (!head) return true;
  if (!grant?.base || head !== grant.base) return false;
  await asJob("own-branch-delete", github).deleteBranch(repository, branch);
  return true;
}

// After a takeover, or when a result was accepted: carry an unfinished grant
// into the current generation for the same worker, and settle a finished one
// (delete its grant branch and write the release). Never touches another
// grant. Returns {ok, carried, settled}.
export async function reconcileGrants({
  github,
  journal,
  options = {},
  driver,
  owner,
  login,
  spec,
  grants,
}) {
  const check = await revalidate(journal, { driver, owner, login }, options);
  if (!check.ok)
    return { ok: false, reason: check.reason, carried: [], settled: [] };
  const state = check.state,
    // `left`: grant branches that are not Avoozl's own to delete; a
    // person deletes them with Delete branches (branch-delete).
    result = { ok: true, carried: [], settled: [], left: [] };
  for (const grant of [...state.grants]) {
    const [{ task, definition }] = grant.tasks;
    if (completed(state, grant)) {
      if (
        !(await deleteOwnBranch(github, grants, grantBranch(spec, task), grant))
      )
        result.left.push({
          repository: grants,
          branch: grantBranch(spec, task),
        });
      await appendRecord(
        journal,
        {
          op: `release.${task}.g${state.generation}.${state.released.filter((r) => r.tasks[0].task === task).length}`,
          kind: "grant",
          spec,
          driver,
          worker: grant.worker,
          tasks: [{ task, definition }],
          released: "settled",
        },
        options,
      );
      result.settled.push(task);
    } else if (grant.generation < state.generation) {
      await appendRecord(
        journal,
        {
          op: grantOp(state, task),
          kind: "grant",
          spec,
          driver,
          worker: grant.worker,
          tasks: [{ task, definition }],
        },
        options,
      );
      result.carried.push(task);
    }
  }
  return result;
}

// A person's Release grant. Only the spec's effective owner passes
// revalidation; `by` must be a person. The grant branch goes first, so a
// retry after a crash finds it gone and still writes the record.
export async function releaseGrant({
  github,
  journal,
  options = {},
  driver,
  owner,
  login,
  spec,
  grants,
  task,
  by,
}) {
  if (by?.kind !== "person")
    fail(
      "Release grant is a person's action; Avoozl never releases a grant by itself.",
      403,
    );
  const check = await revalidate(journal, { driver, owner, login }, options);
  if (!check.ok) fail(`Cannot release a grant now: ${check.reason}.`, 409);
  const state = check.state,
    grant = state.grants.find((c) => c.tasks[0].task === task);
  if (!grant) fail(`Task ${task} has no active grant.`, 404);
  const left = !(await deleteOwnBranch(
    github,
    grants,
    grantBranch(spec, task),
    grant,
  ));
  const written = await appendRecord(
    journal,
    {
      op: `release.${task}.g${state.generation}.${state.released.filter((r) => r.tasks[0].task === task).length}`,
      kind: "grant",
      spec,
      driver,
      worker: grant.worker,
      tasks: grant.tasks,
      released: "person",
    },
    options,
  );
  return {
    task,
    worker: grant.worker,
    record: written.id,
    ...(left
      ? { left: [{ repository: grants, branch: grantBranch(spec, task) }] }
      : {}),
  };
}

// Needs you rows for stale grants. The text has no age, so the same grant
// is one notice however long it stays quiet.
export function staleNotices(rows, { spec }) {
  return rows
    .filter((row) => row.stale)
    .map((row) => ({
      channel: "decision",
      task: row.task,
      title: `Grant on ${row.task} is quiet`,
      text: `${spec}: task ${row.task} has been granted past the stale limit with no accepted result. Nothing releases it by itself.`,
      resume: `Release grant: avoozl spec grants release ${spec} ${row.task} --grants OWNER/REPO`,
    }));
}

// The cron's pass: for each spec this workspace drives, read its journal and
// queue Needs you for stale grants. At most once in ten minutes.
export async function checkStaleGrants(
  store,
  { workspaceRoot, journalFor, driving, now = Date.now(), env },
) {
  const last = Date.parse(store.getMeta("worker.acceptCheckedAt") ?? "") || 0;
  if (now - last < 600_000 || !driving.length) return 0;
  store.setMeta("worker.acceptCheckedAt", new Date(now).toISOString());
  const config = loadLayeredConfig({ workspaceRoot, env }).config,
    staleAfter = grantStaleMs(config?.workers?.grantStaleAfter);
  let queued = 0;
  for (const spec of driving) {
    const found = await journalFor(spec);
    if (!found?.journal || found.journal.unreadable) continue;
    const state = await read(found.journal, found.options);
    if (state.held) continue;
    queued += queueNotifications(
      store,
      staleNotices(grantRows(state, { now, staleAfter }), { spec }),
      now,
    );
  }
  return queued;
}

export const grantStatus = async (journal, options, rowOptions) =>
  grantRows(await read(journal, options), rowOptions);
