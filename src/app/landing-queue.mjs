// One landing queue per base branch, with a brief integration lock
// (Requirement 87.5 and 102.15, design §4.26 Land and §4.32.5, task 41.2).
//
// - Each repository and base branch has one queue. Portions land one at a
//   time, in the order they were queued. A portion names an exact commit and
//   its tasks, never "the current head".
// - Stop the line pauses the queue. A paused head stays first and nothing
//   behind it moves ahead, so the order is the same after Resume.
// - The merge with the base and the checks run outside the integration lock.
//   The lock (`withWorkLock` kind `integration`, git.mjs) covers only the
//   base re-read, the guarded ref move and the push.
// - Under the lock the base is read again. If it moved since the candidate
//   was built, nothing is pushed: the head stays first and the next call
//   builds and checks a new candidate on the new base. The ref move itself
//   is guarded too (`guardedFastForward`, driver-generations.mjs), so a move
//   between the re-read and the push also refuses.
//
// - A train (41.3) takes the head and the portions right behind it that the
//   same driver schedules, up to four tasks. A failed train is halved and the
//   first half checked again, down to one portion; a passing first half
//   lands and the rest stay queued, so the culprit is found one step later.
//
// The git and check steps are passed in, so direct trains (landing-trains.mjs)
// and pull request landing reuse the same queue.
import { withWorkLock } from "./git.mjs";
import { openStops } from "./flow.mjs";
import { fail } from "./store.mjs";

const SHA = /^[0-9a-f]{40}$/;
const TABLE = "landing_queue";
const queueId = (projectId, base) => `${projectId}\0${base}`;
const entryId = (projectId, base, key) => `${queueId(projectId, base)}\0${key}`;

function requireQueue(projectId, base) {
  if (typeof projectId !== "string" || !projectId)
    fail("A landing queue names its repository.", 400);
  if (typeof base !== "string" || !base)
    fail("A landing queue names its base branch.", 400);
}

// The queued portions for one base, first in line first.
export function landingQueue(store, { projectId, base }) {
  requireQueue(projectId, base);
  return store
    .list(TABLE)
    .filter(
      (e) =>
        e.projectId === projectId && e.base === base && e.state === "queued",
    )
    .sort((a, b) => a.seq - b.seq);
}

// Adds a portion at the end of its base's queue. Queuing the same key again
// while it waits changes nothing; a key that already left the queue (landed,
// failed, conflict) comes back at the end with its new commit.
export function enqueueLanding(
  store,
  {
    projectId,
    base,
    key,
    commit,
    tasks = [],
    spec = null,
    driver = null,
    source = null,
    pr = null,
    // Integrator-train fields (branch, forkPoint, builtOn, footprint,
    // cheap); `direct` and `pr` entries have none.
    extra = {},
  },
  { now = Date.now() } = {},
) {
  requireQueue(projectId, base);
  if (typeof key !== "string" || !key) fail("A queued portion has a key.", 400);
  if (!SHA.test(commit ?? ""))
    fail("A queued portion names an exact commit.", 400);
  return store.transaction(() => {
    const id = entryId(projectId, base, key),
      existing = store.get(TABLE, id);
    if (existing?.state === "queued") return existing;
    const seq = Math.max(0, ...store.list(TABLE).map((e) => e.seq ?? 0)) + 1;
    return store.put(TABLE, {
      id,
      projectId,
      base,
      key,
      commit,
      tasks: [...tasks],
      spec,
      driver,
      ...(source ? { source } : {}),
      ...(pr ? { pr } : {}),
      ...extra,
      seq,
      state: "queued",
      queuedAt: new Date(now).toISOString(),
    });
  });
}

// A task is its ID, or {task, definition} when it lands with an intent.
export const taskIds = (entry) =>
  entry.tasks.map((t) => (typeof t === "string" ? t : t.task));

// The portions that land together from the head: the head, then each next
// portion with the same driver while the train stays within `maxTasks`
// tasks and none is paused. Without a driver the head lands alone.
export function trainOf(store, queue, { maxTasks = 1 } = {}) {
  const [head] = queue,
    out = [];
  if (!head) return out;
  let count = 0;
  for (const entry of queue) {
    const size = Math.max(1, entry.tasks.length);
    if (out.length) {
      if (!head.driver || entry.driver !== head.driver) break;
      if (count + size > maxTasks || pausedBy(store, entry)) break;
    }
    out.push(entry);
    count += size;
  }
  return out;
}

// The open stop that pauses this portion, if any: a task stop names one of
// its tasks, a spec stop its spec, a repository or automatic stop its
// repository, and an all-scope or full stop everything.
export function pausedBy(store, entry) {
  return (
    openStops(store).find((stop) => {
      if (stop.scope === "task") return taskIds(entry).includes(stop.taskId);
      if (stop.scope === "spec")
        return Boolean(entry.spec) && entry.spec === (stop.spec ?? stop.planId);
      if (stop.projectId) return stop.projectId === entry.projectId;
      return true;
    }) ?? null
  );
}

function finish(store, entry, state, extra = {}) {
  return store.put(TABLE, {
    ...entry,
    ...extra,
    state,
    finishedAt: new Date().toISOString(),
  });
}

// Keeps why the head waits (checks or review) on its queued entry, so the
// Landing queue page can say so from the store (task 44.5). Written only
// when the reason, candidate or check list changes, not on every tick.
function noteWait(store, entry, candidate, verdict) {
  const waiting = {
    reason: verdict.reason === "review" ? "review" : "checks",
    candidate,
    checks: (verdict.checks ?? []).map(({ command, conclusion }) => ({
      command,
      conclusion: conclusion ?? null,
    })),
  };
  const before = entry.waiting;
  if (
    before &&
    JSON.stringify({ ...before, since: undefined }) === JSON.stringify(waiting)
  )
    return entry;
  // The checks ran outside any lock: write only onto the same entry still
  // queued, so a withdrawal meanwhile is never undone.
  return store.transaction(() => {
    const now = store.get(TABLE, entry.id);
    if (now?.state !== "queued" || now.commit !== entry.commit) return entry;
    return store.put(TABLE, {
      ...now,
      waiting: { ...waiting, since: new Date().toISOString() },
    });
  });
}

const running = new Map();

// Takes a waiting portion out of its queue, e.g. when its base moved and
// its commit will be replaced; the key may be queued again later.
export function withdrawLanding(store, { projectId, base, key }, reason) {
  const entry = store.get(TABLE, entryId(projectId, base, key));
  if (entry?.state !== "queued") return null;
  return store.transaction(() => finish(store, entry, "withdrawn", { reason }));
}

// Takes the head of one base's queue, alone or as a train, one step toward
// landing.
//
// steps:
//   observe(entry)  (optional)          -> {merged, candidate, ...record} when
//                                          someone else already landed the
//                                          head; checked before anything else
//   readBase()                          -> the base's current commit
//   prepare(entries, baseHead)          -> {candidate}, or {conflict: [files],
//                                          key} naming the conflicted portion
//   check(candidate, entries, baseHead) -> {ok, checks, record?}, or {wait,
//                                          checks} while checks or reviews
//                                          are pending; `record` is kept on
//                                          the landed entries
//   land({entries, entry, candidate, baseHead}) -> true when the guarded
//                                          move pushed
//   afterLand({entries, candidate}) (optional) -> merges the landed base
//                                          back into each working branch,
//                                          outside the lock (task 41.5)
//
// options.maxTasks (default 1) bounds a train; direct landing passes 4.
//
// Returns {state, entry, entries} with state one of: empty, paused,
// running, conflict, failed, waiting, base-moved, busy, not-landed, landed. Only
// conflict and failed take a portion out of the queue, and only the one
// that conflicted or failed alone; landed takes out what landed. Every
// other state keeps the order.
export async function landNext(
  store,
  { projectId, base },
  steps,
  options = {},
) {
  requireQueue(projectId, base);
  const key = queueId(projectId, base);
  // One step per base at a time in this process; across processes the
  // integration lock and the base re-read keep it safe.
  if (running.has(key)) return { state: "running" };
  const step = (async () => {
    const queue = landingQueue(store, { projectId, base });
    if (!queue.length) return { state: "empty" };
    const seen = await steps.observe?.(queue[0]);
    if (seen?.merged) {
      const { merged, ...record } = seen,
        entry = finish(store, queue[0], "landed", {
          observed: true,
          ...record,
        });
      return {
        state: "landed",
        observed: true,
        candidate: seen.candidate,
        entry,
        entries: [entry],
      };
    }
    const stop = pausedBy(store, queue[0]);
    if (stop) return { state: "paused", entry: queue[0], stop: stop.id };
    let entries = trainOf(store, queue, options);
    const baseHead = await steps.readBase();
    if (!SHA.test(baseHead ?? ""))
      fail(`The base ${base} has no exact head to land on.`, 409);
    // Outside the lock: merge with the base and run the checks. A conflict
    // or a failure narrows the train until one portion is left.
    let candidate, verdict;
    for (;;) {
      const prepared = await steps.prepare(entries, baseHead);
      if (prepared?.conflict) {
        const at = Math.max(
          0,
          entries.findIndex((e) => e.key === prepared.key),
        );
        if (at > 0) {
          entries = entries.slice(0, at);
          continue;
        }
        return {
          state: "conflict",
          entries: [entries[0]],
          entry: finish(store, entries[0], "conflict", {
            baseHead,
            files: prepared.conflict,
          }),
        };
      }
      candidate = prepared?.candidate;
      if (!SHA.test(candidate ?? ""))
        fail("Preparing a landing gives an exact candidate commit.", 500);
      verdict = await steps.check(candidate, entries, baseHead);
      if (verdict?.ok) break;
      if (verdict?.wait)
        return {
          state: "waiting",
          entries,
          entry: noteWait(store, entries[0], candidate, verdict),
          checks: verdict.checks ?? [],
        };
      if (entries.length > 1) {
        entries = entries.slice(0, Math.floor(entries.length / 2));
        continue;
      }
      return {
        state: "failed",
        entries,
        entry: finish(store, entries[0], "failed", {
          baseHead,
          candidate,
          checks: verdict?.checks ?? [],
        }),
      };
    }
    // A stop pulled while the checks ran still pauses the queue.
    const late = entries.map((e) => pausedBy(store, e)).find(Boolean);
    if (late)
      return { state: "paused", entry: entries[0], entries, stop: late.id };
    // Inside the lock: re-read the base, move the ref, push. Nothing else.
    let outcome;
    try {
      outcome = await withWorkLock(
        store,
        { id: `landing:${key}`, projectId, kind: "integration" },
        async () => {
          const now = await steps.readBase();
          if (now !== baseHead) return { state: "base-moved", baseHead: now };
          const pushed = await steps.land({
            entries,
            entry: entries[0],
            candidate,
            baseHead,
            // The checks that passed at this exact candidate: the intent's
            // evidence, so the landed outcome completes its tasks.
            checks: verdict.checks ?? [],
          });
          return { state: pushed ? "landed" : "not-landed" };
        },
      );
    } catch (error) {
      if (error.contention)
        return { state: "busy", entry: entries[0], entries };
      throw error;
    }
    if (outcome.state !== "landed")
      return { ...outcome, entry: entries[0], entries, candidate };
    const landed = entries.map((e) =>
      finish(store, e, "landed", {
        baseHead,
        candidate,
        checks: verdict.checks ?? [],
        ...verdict.record,
      }),
    );
    // Outside the lock: bring the new base back into each working branch.
    // A failure there never undoes the landing.
    let mergedBack;
    try {
      mergedBack = await steps.afterLand?.({ entries: landed, candidate });
    } catch (error) {
      mergedBack = { error: error.message };
    }
    return {
      state: "landed",
      candidate,
      entry: landed[0],
      entries: landed,
      ...(mergedBack ? { mergedBack } : {}),
    };
  })();
  running.set(key, step);
  try {
    return await step;
  } finally {
    running.delete(key);
  }
}
