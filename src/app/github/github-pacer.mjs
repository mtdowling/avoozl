// One serial pacer for every GitHub write Avoozl makes. GitHub allows about
// 80 content-creating requests a minute and 500 an hour, and repeat hits can
// get the login banned, so the client waits before a write instead of after a
// refusal. Every write is a row in a journal table of this workspace's SQLite
// store, so the windows are counted across processes and survive a crash.
// A projection too large for one hour stops at the cap, keeps a run record,
// and the tick carries on when the window opens (the projection finds what
// it already wrote by the marker in each issue).
import { AsyncLocalStorage } from "node:async_hooks";

const WRITES_PER_MINUTE = 60;
const WRITES_PER_HOUR = 400;
// GitHub's own ceilings; a setting above them is held to them.
export const MAX_WRITES_PER_MINUTE = 80;
export const MAX_WRITES_PER_HOUR = 500;
// Below this share of the primary limit left, no write goes out.
const LOW_SHARE = 0.1;
// A wait up to this long is slept in the call; a longer one stops the run.
const MAX_SLEEP_MS = 5000;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const RUN = "githubProjectionRun";

const iso = (ms) => new Date(ms).toISOString();

export function clampLimits({ perMinute, perHour } = {}) {
  const whole = (value, fallback, max) =>
    Number.isSafeInteger(value) && value > 0 ? Math.min(value, max) : fallback;
  return {
    perMinute: whole(perMinute, WRITES_PER_MINUTE, MAX_WRITES_PER_MINUTE),
    perHour: whole(perHour, WRITES_PER_HOUR, MAX_WRITES_PER_HOUR),
  };
}

// When the next write may go, given the times of the earlier ones (ascending,
// all within the last hour) and the limits. Pure, so the preview can replay it.
function nextSlot(times, now, { perMinute, perHour }) {
  let at = now;
  const last = times[times.length - 1];
  if (last !== undefined) at = Math.max(at, last + MINUTE / perMinute);
  if (times.length >= perHour)
    at = Math.max(at, times[times.length - perHour] + HOUR);
  const minute = times.filter((time) => time > at - MINUTE);
  if (minute.length >= perMinute)
    at = Math.max(at, minute[minute.length - perMinute] + MINUTE);
  return at;
}

function pacedError({ until, reason }) {
  const error = Error(
    `GitHub writes are paced (${reason}); they resume at ${iso(until)}.`,
  );
  error.status = 429;
  error.paced = true;
  error.rateLimited = {
    resource: "writes",
    until,
    reason: "paced",
    resetAt: iso(until),
  };
  return error;
}

// Which projection a write belongs to, so the run's count is its own.
const runs = new AsyncLocalStorage();

export class WritePacer {
  constructor(store, { now, sleep, limits, primary, onInterrupted } = {}) {
    this.onInterrupted = onInterrupted || (() => {});
    this.store = store;
    this.now = now || Date.now;
    this.sleep = sleep || ((ms) => new Promise((done) => setTimeout(done, ms)));
    this.limitsOf = limits || (() => ({}));
    // { limit, remaining, resetAtMs } for the core limit, or null.
    this.primary = primary || (() => null);
    this.tail = Promise.resolve();
    this.ready = false;
  }

  limits() {
    return clampLimits(this.limitsOf());
  }

  #db() {
    if (!this.ready) {
      this.store.db.exec(
        "CREATE TABLE IF NOT EXISTS github_write_journal(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,method TEXT,path TEXT,tag TEXT,status INTEGER);" +
          "CREATE INDEX IF NOT EXISTS github_write_journal_at ON github_write_journal(at)",
      );
      // A row with no status is a write that may or may not have landed.
      const unfinished = this.store.db
        .prepare(
          "UPDATE github_write_journal SET status=-1 WHERE status IS NULL",
        )
        .run().changes;
      this.ready = true;
      if (unfinished) this.onInterrupted();
    }
    return this.store.db;
  }

  // Times of the writes in the last hour, ascending.
  history(now = this.now()) {
    return this.#db()
      .prepare("SELECT at FROM github_write_journal WHERE at>? ORDER BY at")
      .all(now - HOUR)
      .map((row) => row.at);
  }

  // Runs `send` once the pace allows, one write at a time. Throws a paced
  // error, sending nothing, when the wait is longer than a short sleep.
  run({ method, pathname }, send) {
    const turn = this.tail.then(async () => {
      // A short wait is slept once and the write goes: it is the only one
      // in line, and the wait ends when its slot opens.
      const now = this.now(),
        until = this.#until(now);
      if (until) {
        if (until.at - now > MAX_SLEEP_MS)
          throw pacedError({ until: until.at, reason: until.reason });
        await this.sleep(until.at - now);
      }
      const db = this.#db(),
        id = Number(
          db
            .prepare(
              "INSERT INTO github_write_journal(at,method,path,tag) VALUES (?,?,?,?)",
            )
            .run(this.now(), method, pathname, runs.getStore() ?? null)
            .lastInsertRowid,
        );
      let status = 0;
      try {
        const result = await send();
        status = 200;
        return result;
      } catch (error) {
        status = error.status || 0;
        throw error;
      } finally {
        db.prepare("UPDATE github_write_journal SET status=? WHERE id=?").run(
          status,
          id,
        );
      }
    });
    this.tail = turn.catch(() => {});
    return turn;
  }

  // The time and reason the next write must wait for, or null to go now.
  #until(now) {
    const db = this.#db(),
      limits = this.limits(),
      primary = this.primary();
    db.prepare(
      "DELETE FROM github_write_journal WHERE at<? AND tag IS NULL",
    ).run(now - 2 * HOUR);
    if (
      primary &&
      primary.limit > 0 &&
      primary.remaining < primary.limit * LOW_SHARE &&
      primary.resetAtMs > now
    )
      return { at: primary.resetAtMs, reason: "primary limit nearly spent" };
    const times = this.history(now),
      at = nextSlot(times, now, limits);
    if (at <= now) return null;
    const hour = times.length >= limits.perHour;
    return {
      at,
      reason: hour
        ? `${limits.perHour} writes an hour`
        : `${limits.perMinute} writes a minute`,
    };
  }
}

// ---- The run record ---------------------------------------------------

export const readRun = (store) => {
  try {
    return store.getMeta(RUN);
  } catch {
    return null;
  }
};

const doneOf = (store, run) => {
  try {
    return store.db
      .prepare(
        "SELECT COUNT(*) AS n FROM github_write_journal WHERE tag=? AND status BETWEEN 200 AND 299",
      )
      .get(run.planId).n;
  } catch {
    // No journal table yet: nothing was written.
    return 0;
  }
};

const runLine = (done, total, resumeAt) =>
  `${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} writes` +
  (resumeAt ? `, resumes at ${hhmm(resumeAt)}` : "");

const hhmm = (ms) =>
  new Date(ms).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

// For Settings and Needs you: null when no projection waits.
export function runView(store, now = Date.now()) {
  const run = readRun(store);
  if (!run || run.state !== "paused") return null;
  const done = doneOf(store, run),
    total = Math.max(done, run.total ?? 0);
  return {
    planId: run.planId,
    done,
    total,
    resumeAt: run.resumeAt > now ? iso(run.resumeAt) : null,
    line: runLine(done, total, run.resumeAt > now ? run.resumeAt : null),
  };
}

export function paceNeedsYou(store, now = Date.now()) {
  const view = runView(store, now);
  return view
    ? [
        {
          kind: "needs-human",
          reason: "crew",
          id: "github-write-pace",
          taskId: null,
          authority: "github",
          title: `Projecting to GitHub: ${view.line}`,
          detail:
            "GitHub limits how fast issues can be created. Avoozl paces its writes and carries on by itself. Nothing needs doing: this row clears itself.",
          openedAt: new Date(now).toISOString(),
        },
      ]
    : [];
}
