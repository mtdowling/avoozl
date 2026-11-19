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
// - A merge batch (merge-batches spec) takes the head and the members right
//   behind it, up to the base's size limit, whatever their spec or driver.
//   A failed batch is rerun once, then bisected to its culprit; the members
//   before the culprit land and the members after it stay queued.
//
// The git and check steps are passed in, so direct landing
// (merge-batch.mjs) and pull request landing reuse the same queue.
import { withWorkLock } from "./git.mjs";
import { openStops } from "./flow.mjs";
import { outputExcerpt } from "./verify.mjs";
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
      seq,
      state: "queued",
      queuedAt: new Date(now).toISOString(),
    });
  });
}

// A task is its ID, or {task, definition} when it lands with an intent.
export const taskIds = (entry) =>
  entry.tasks.map((t) => (typeof t === "string" ? t : t.task));

// The members that land together from the head: the head, then each next
// member while the batch stays within `limit` members, none is paused, none
// must land alone and `accept` agrees. The head lands alone when it must.
export function batchOf(
  store,
  queue,
  { limit = 1, isAlone = () => false, accept = () => true } = {},
) {
  const [head] = queue,
    out = [];
  if (!head) return out;
  for (const entry of queue) {
    if (out.length) {
      if (isAlone(head) || isAlone(entry)) break;
      if (out.length >= limit || pausedBy(store, entry) || !accept(entry))
        break;
    }
    out.push(entry);
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

// The checks of a verdict that failed, and the log excerpt they carry,
// capped at 8 KB (MB4.3). `tail` is the check's last output lines.
const EXCERPT_BYTES = 8192;
const failedOf = (checks = []) => checks.filter((c) => c.exitCode !== 0);
const commandsOf = (checks) => failedOf(checks).map((c) => c.command);
const bare = (checks = []) => checks.map(({ tail, ...rest }) => rest);
const excerptOf = (checks) =>
  outputExcerpt(
    failedOf(checks)
      .map((c) => c.tail)
      .filter(Boolean)
      .join("\n"),
  ).slice(-EXCERPT_BYTES);

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

// Keeps the pull request a portion's step opened or found on its queued
// entry, so a held or failed portion still links to it (Requirement 92.1).
// Same rule as noteWait: only onto the same entry still queued.
function notePull(store, entry, pr) {
  if (!Number.isSafeInteger(pr) || pr < 1 || entry.pr === pr) return entry;
  return store.transaction(() => {
    const now = store.get(TABLE, entry.id);
    if (now?.state !== "queued" || now.commit !== entry.commit) return entry;
    return store.put(TABLE, { ...now, pr });
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

// Takes the head of one base's queue, alone or as a merge batch, one step
// toward landing.
//
// steps:
//   observe(entry)  (optional)          -> {merged, candidate, ...record} when
//                                          someone else already landed the
//                                          head; checked before anything else
//   readBase()                          -> the base's current commit
//   prepare(entries, baseHead)          -> {candidate}, or {conflict: [files],
//                                          key} naming the conflicted member
//   check(candidate, entries, baseHead, only) -> {ok, checks, record?}, or
//                                          {wait, checks} while checks or
//                                          reviews are pending; `record` is
//                                          kept on the landed entries. `only`
//                                          names the checks to run (a rerun
//                                          or a bisect step), else all.
//   land({entries, entry, candidate, baseHead}) -> true when the guarded
//                                          move pushed
//   afterLand({entries, candidate}) (optional) -> merges the landed base
//                                          back into each working branch,
//                                          outside the lock (task 41.5)
//
// options: `limit` (default 1) bounds a batch; `isAlone(entry)` marks a
// member that must land alone; `accept(entry)` lets a member join a batch;
// `onStep(step, entries)` tells the Landing queue page what the batch is
// doing ("testing", "rerun", "bisect", "push"); `bisect` turns on the rerun, the search for the culprit and the
// confirmation alone (MB4) for batches of direct landing.
//
// Returns {state, entry, entries} with state one of: empty, paused,
// running, conflict, failed, retry, waiting, base-moved, busy, not-landed,
// landed. `batch` is {held, waiting, landed, culprits} (member keys) for
// the size record. `sentBack` lists members that left the queue as
// {state: "conflict" | "failed", entry} while the rest went on. A member
// that conflicted or failed alone leaves the queue; landed takes out what
// landed. Every other state keeps the order.
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
    let entries = batchOf(store, queue, options);
    const batch = { held: entries.length, waiting: queue.length },
      sentBack = [],
      baseHead = await steps.readBase();
    if (!SHA.test(baseHead ?? ""))
      fail(`The base ${base} has no exact head to land on.`, 409);
    // Outside the lock: stack the members on the base and run the checks.
    options.onStep?.("testing", entries);
    let candidate,
      verdict,
      flaky = false,
      culprits = [];
    for (;;) {
      const prepared = await steps.prepare(entries, baseHead);
      // One pull request is one member (pr landing never makes a batch).
      if (entries.length === 1 && prepared?.pr)
        entries = [notePull(store, entries[0], prepared.pr)];
      if (prepared?.conflict) {
        // The later member goes back; the others go on (MB5.2).
        const at = Math.max(
            0,
            entries.findIndex((e) => e.key === prepared.key),
          ),
          sent = finish(store, entries[at], "conflict", {
            baseHead,
            files: prepared.conflict,
          });
        sentBack.push({ state: "conflict", entry: sent });
        entries = entries.filter((_, i) => i !== at);
        if (entries.length) continue;
        return {
          state: "conflict",
          entries: [sent],
          entry: sent,
          sentBack: sentBack.slice(0, -1),
          batch: { ...batch, landed: [], culprits: [] },
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
      if (!options.bisect) {
        return {
          state: "failed",
          entries: [entries[0]],
          entry: finish(store, entries[0], "failed", {
            baseHead,
            candidate,
            checks: bare(verdict?.checks),
            excerpt: excerptOf(verdict?.checks),
          }),
          sentBack,
          batch: { ...batch, landed: [], culprits: [entries[0].key] },
        };
      }
      // MB4.1: a failing check runs once more on the same head.
      let failing = commandsOf(verdict.checks);
      options.onStep?.("rerun", entries);
      const again = await steps.check(candidate, entries, baseHead, failing);
      if (again?.ok) {
        flaky = true;
        verdict = {
          ...verdict,
          ok: true,
          checks: verdict.checks.map(
            (c) => again.checks.find((a) => a.command === c.command) ?? c,
          ),
        };
        break;
      }
      if (commandsOf(again?.checks).length) failing = commandsOf(again.checks);
      // MB4.2: the first boundary where the failing checks fail.
      options.onStep?.("bisect", entries);
      let lo = 1,
        hi = entries.length,
        atHi = { candidate, checks: again?.checks ?? verdict.checks };
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2),
          part = await steps.prepare(entries.slice(0, mid), baseHead),
          result = part?.candidate
            ? await steps.check(
                part.candidate,
                entries.slice(0, mid),
                baseHead,
                failing,
              )
            : { ok: false, checks: atHi.checks };
        if (result.ok) lo = mid + 1;
        else {
          hi = mid;
          atHi = { candidate: part?.candidate ?? atHi.candidate, ...result };
        }
      }
      const culprit = entries[lo - 1],
        before = entries.slice(0, lo - 1);
      // MB4.3: the culprit alone on the base, with the failing checks.
      let culpritChecks = atHi.checks,
        culpritCandidate = atHi.candidate,
        together = [];
      if (before.length) {
        const alone = await steps.prepare([culprit], baseHead),
          result = alone?.candidate
            ? await steps.check(alone.candidate, [culprit], baseHead, failing)
            : { ok: false, checks: culpritChecks };
        if (result.ok) together = before.map((e) => e.key);
        else {
          culpritChecks = result.checks;
          culpritCandidate = alone?.candidate ?? culpritCandidate;
        }
      }
      const gone = () =>
        finish(store, culprit, "failed", {
          baseHead,
          candidate: culpritCandidate,
          checks: bare(culpritChecks),
          excerpt: excerptOf(culpritChecks),
          ...(together.length ? { with: together } : {}),
        });
      if (!before.length) {
        const sent = gone();
        return {
          state: "failed",
          entries: [sent],
          entry: sent,
          sentBack,
          batch: { ...batch, landed: [], culprits: [culprit.key] },
        };
      }
      // The members ahead of the culprit land, after one full check of
      // exactly that candidate (MB3.3).
      const part = await steps.prepare(before, baseHead),
        full = part?.candidate
          ? await steps.check(part.candidate, before, baseHead)
          : { ok: false };
      if (!full.ok)
        return {
          state: "retry",
          entries: before,
          entry: before[0],
          sentBack,
          batch: { ...batch, landed: [], culprits: [], halve: true },
        };
      sentBack.push({ state: "failed", entry: gone() });
      culprits = [culprit.key];
      entries = before;
      candidate = part.candidate;
      verdict = full;
      break;
    }
    // A stop pulled while the checks ran still pauses the queue.
    const late = entries.map((e) => pausedBy(store, e)).find(Boolean);
    if (late)
      return { state: "paused", entry: entries[0], entries, stop: late.id };
    // Inside the lock: re-read the base, move the ref, push. Nothing else.
    options.onStep?.("push", entries);
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
      return { ...outcome, entry: entries[0], entries, candidate, sentBack };
    const landed = entries.map((e) =>
      finish(store, e, "landed", {
        baseHead,
        candidate,
        checks: bare(verdict.checks),
        ...(flaky ? { flaky: true } : {}),
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
      sentBack,
      batch: { ...batch, landed: landed.map((e) => e.key), culprits },
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
