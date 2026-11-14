// GitHub's REST rate limit, kept out of the way: a bounded cache of GET
// answers for conditional requests (a 304 does not count against the
// limit), the last-known x-ratelimit numbers, a pause while limited, and
// the one Needs you row that says so. Everything lives in this workspace's
// SQLite store, because the tick runs in a new process each time.
import { createHash } from "node:crypto";

const META = "githubRate";
// Under this many calls left in the hour, the tick stretches its GitHub
// reads (below), so the last calls go to what is waiting.
export const LOW_REMAINING = 200;
export const STRETCH_MS = 5 * 60 * 1000;
// With no reset time to go on (a secondary limit with no Retry-After), wait
// the minute GitHub's guidance names.
export const SECONDARY_WAIT_MS = 60 * 1000;
const MAX_WAIT_MS = 2 * 60 * 60 * 1000;
const FLUSH_MS = 2000;
// How many answers, how large one may be, and how long one may go unused.
export const CACHE_MAX_ENTRIES = 400;
export const CACHE_MAX_BODY = 1024 * 1024;
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_MS = 10 * 60 * 1000;
const PRUNE_EVERY = 50;

export const resourceOf = (pathname) =>
  pathname.startsWith("/graphql")
    ? "graphql"
    : pathname.startsWith("/search/")
      ? "search"
      : "core";

const iso = (ms) => new Date(ms).toISOString();

// ---- The answer cache ---------------------------------------------------

export class ResponseCache {
  constructor(store, { now, maxEntries = CACHE_MAX_ENTRIES } = {}) {
    this.store = store;
    this.now = now || Date.now;
    this.maxEntries = maxEntries;
    this.puts = 0;
    this.ready = false;
  }

  #db() {
    if (!this.ready) {
      this.store.db.exec(
        "CREATE TABLE IF NOT EXISTS github_http_cache(key TEXT PRIMARY KEY,etag TEXT,last_modified TEXT,body TEXT NOT NULL,link TEXT,scopes TEXT,at INTEGER NOT NULL)",
      );
      this.ready = true;
    }
    return this.store.db;
  }

  // One entry per URL, Accept header and login, so a second account never
  // reads the first one's answer.
  key(token, accept, href) {
    return (
      createHash("sha256").update(String(token)).digest("hex").slice(0, 8) +
      "|" +
      accept +
      "|" +
      href
    );
  }

  get(key) {
    try {
      const row = this.#db()
        .prepare(
          "SELECT etag,last_modified AS lastModified,body,link,scopes,at FROM github_http_cache WHERE key=?",
        )
        .get(key);
      if (!row) return null;
      if (this.now() - row.at > TOUCH_MS)
        this.#db()
          .prepare("UPDATE github_http_cache SET at=? WHERE key=?")
          .run(this.now(), key);
      return row;
    } catch {
      return null;
    }
  }

  // An answer with neither validator, or too large, is not kept.
  put(key, { etag, lastModified, body, link, scopes }) {
    if ((!etag && !lastModified) || body.length > CACHE_MAX_BODY) return;
    try {
      this.#db()
        .prepare(
          "INSERT OR REPLACE INTO github_http_cache(key,etag,last_modified,body,link,scopes,at) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          key,
          etag || null,
          lastModified || null,
          body,
          link || null,
          scopes ?? null,
          this.now(),
        );
      this.puts += 1;
      if (this.puts % PRUNE_EVERY === 0) this.prune();
    } catch {
      // A read-only or busy store only means no caching this time.
    }
  }

  // Entries unused for a week go, then the least recently used beyond the
  // cap. Returns how many were removed.
  prune() {
    try {
      const db = this.#db(),
        old = db
          .prepare("DELETE FROM github_http_cache WHERE at<?")
          .run(this.now() - CACHE_MAX_AGE_MS).changes,
        extra = db
          .prepare(
            "DELETE FROM github_http_cache WHERE key IN (SELECT key FROM github_http_cache ORDER BY at DESC LIMIT -1 OFFSET ?)",
          )
          .run(this.maxEntries).changes;
      return old + extra;
    } catch {
      return 0;
    }
  }

  size() {
    try {
      return this.#db()
        .prepare("SELECT COUNT(*) AS n FROM github_http_cache")
        .get().n;
    } catch {
      return 0;
    }
  }
}

// ---- The rate state -----------------------------------------------------

export const readRate = (store) => {
  try {
    return store.getMeta(META) || {};
  } catch {
    return {};
  }
};

// Remembers what GitHub last said and holds calls back while limited. The
// numbers are kept in memory and written to the store at most every two
// seconds, merged with what another process wrote.
export class RateState {
  constructor(store, { now } = {}) {
    this.store = store;
    this.now = now || Date.now;
    this.resources = {};
    this.pause = null;
    this.calls = 0;
    this.notModified = 0;
    this.flushedAt = 0;
    this.dirty = false;
  }

  observe(resource, { limit, remaining, resetAtMs }) {
    if (![limit, remaining, resetAtMs].every(Number.isFinite)) return;
    this.resources[resource] = {
      limit,
      remaining,
      resetAt: iso(resetAtMs),
      at: this.now(),
    };
    // Spent: hold every call to this resource until it resets.
    if (remaining <= 0 && resetAtMs > this.now())
      this.limit({ resource, until: resetAtMs, reason: "primary" });
    this.dirty = true;
  }

  count(notModified) {
    this.calls += 1;
    if (notModified) this.notModified += 1;
    this.dirty = true;
  }

  // `scope` "all" is a secondary limit, which holds every resource.
  limit({ resource, until, reason }) {
    const at = this.now(),
      end = Math.min(Math.max(until, at + 1000), at + MAX_WAIT_MS);
    if (this.pause && this.pause.until >= end) return;
    this.pause = {
      resource,
      scope: reason === "primary" ? resource : "all",
      until: end,
      reason,
      at,
    };
    this.dirty = true;
    this.flush(true);
  }

  // The error a call raises while held back, or null when it may go.
  held(resource) {
    const pause = this.pause || readRate(this.store).pause;
    if (!pause || pause.until <= this.now()) return null;
    if (pause.scope !== "all" && pause.scope !== resource) return null;
    return pause;
  }

  flush(force = false) {
    if (!this.dirty || (!force && this.now() - this.flushedAt < FLUSH_MS))
      return;
    try {
      const stored = readRate(this.store),
        resources = { ...(stored.resources || {}) };
      for (const [name, mine] of Object.entries(this.resources))
        if (!(resources[name]?.at > mine.at)) resources[name] = mine;
      const pauses = [stored.pause, this.pause].filter(
          (pause) => pause && pause.until > this.now(),
        ),
        pause = pauses.sort((a, b) => b.until - a.until)[0] ?? null,
        stats = {
          calls: stored.calls ?? 0,
          notModified: stored.notModified ?? 0,
        };
      stats.calls += this.calls;
      stats.notModified += this.notModified;
      // Old counts fade, so the share reads recent calls.
      if (stats.calls > 5000) {
        stats.calls = Math.round(stats.calls / 2);
        stats.notModified = Math.round(stats.notModified / 2);
      }
      this.store.setMeta(META, { ...stored, resources, pause, ...stats });
      this.pause = pause;
      this.calls = 0;
      this.notModified = 0;
      this.dirty = false;
      this.flushedAt = this.now();
    } catch {
      // A busy or read-only store keeps the numbers for the next flush.
    }
  }
}

// What a response's headers say about a refusal: until when to wait, and
// why, or null when it was not a rate limit (a 403 for permissions).
export function limitOf(status, headers, message, resource, now) {
  if (status !== 403 && status !== 429) return null;
  const get = (name) => headers?.get?.(name),
    retryAfter = Number(get("retry-after")),
    reset = Number(get("x-ratelimit-reset")),
    spent = get("x-ratelimit-remaining") === "0",
    secondary = /secondary rate limit|abuse detection/i.test(message || "");
  if (!spent && !secondary && !(retryAfter > 0) && status !== 429) return null;
  let until = 0;
  if (retryAfter > 0) until = now + retryAfter * 1000;
  if (spent && reset > 0) until = Math.max(until, reset * 1000);
  if (!until) until = now + SECONDARY_WAIT_MS;
  return {
    resource,
    until,
    reason: spent && !secondary && !(retryAfter > 0) ? "primary" : "secondary",
  };
}

export function rateLimitError(pause) {
  const error = Error(
    `GitHub rate limit reached (${pause.resource}); calls resume at ${iso(pause.until)}.`,
  );
  error.status = 429;
  error.rateLimited = { ...pause, resetAt: iso(pause.until) };
  return error;
}

export const RATE_LIMIT_TEXT = /GitHub rate limit reached/;

// ---- The tick's gate ----------------------------------------------------

// Whether this tick may make GitHub calls. Held while limited (until the
// reset), and while the budget is low, spaced `STRETCH_MS` apart (four
// times that once under a quarter of the threshold), never past the reset.
export function githubGate(store, now = Date.now()) {
  const state = readRate(store),
    pause = state.pause;
  if (pause && pause.until > now)
    return { skip: true, reason: "limited", until: pause.until };
  let low = null;
  for (const [resource, entry] of Object.entries(state.resources || {})) {
    const resetAt = Date.parse(entry.resetAt);
    if (resetAt > now && entry.remaining < LOW_REMAINING)
      if (!low || entry.remaining < low.remaining)
        low = { resource, ...entry, resetMs: resetAt };
  }
  if (low && state.lastRunAt) {
    const every =
        low.remaining < LOW_REMAINING / 4 ? STRETCH_MS * 4 : STRETCH_MS,
      next = Math.min(state.lastRunAt + every, low.resetMs);
    if (now < next) return { skip: true, reason: "low", until: next };
  }
  return { skip: false, low };
}

export function markGithubRun(store, now = Date.now()) {
  try {
    store.setMeta(META, { ...readRate(store), lastRunAt: now });
  } catch {
    // Pacing then runs the next tick, which is the safe side.
  }
}

// One failure notice per limit window, none per call.
export function rateLimitNotices(store, now = Date.now()) {
  const state = readRate(store),
    pause = state.pause;
  if (!pause || pause.until <= now || state.notifiedUntil === pause.until)
    return [];
  try {
    store.setMeta(META, { ...state, notifiedUntil: pause.until });
  } catch {
    return [];
  }
  return [
    {
      channel: "failure",
      title: "GitHub rate limit reached",
      text: `${rateText(state, pause)} Avoozl makes no GitHub calls until ${iso(pause.until)}, then catches up once.`,
    },
  ];
}

const rateText = (state, pause) => {
  const entry = state.resources?.[pause.resource];
  return entry
    ? `${entry.remaining} of ${entry.limit} ${pause.resource} calls were left.`
    : `The ${pause.resource} limit was reached.`;
};

// The one Needs you row while limited. It is read from the stored reset
// time, so it clears itself when that time passes.
export function rateNeedsYou(store, now = Date.now()) {
  const state = readRate(store),
    pause = state.pause;
  if (!pause || pause.until <= now) return [];
  const entry = state.resources?.[pause.resource];
  return [
    {
      kind: "needs-human",
      reason: "crew",
      id: "github-rate-limit",
      taskId: null,
      authority: "github",
      title: `GitHub rate limit reached, resumes at ${iso(pause.until)}`,
      detail:
        (entry
          ? `${entry.remaining} of ${entry.limit} ${pause.resource} calls left. `
          : `Resource: ${pause.resource}. `) +
        "Avoozl makes no GitHub calls until then. Nothing needs doing: this row clears itself.",
      openedAt: iso(pause.at),
    },
  ];
}

// For Settings > GitHub: the last-known numbers.
export function rateView(store, now = Date.now()) {
  const state = readRate(store),
    calls = state.calls ?? 0,
    pause = state.pause && state.pause.until > now ? state.pause : null;
  return {
    resources: Object.fromEntries(
      Object.entries(state.resources || {}).map(([name, entry]) => [
        name,
        {
          limit: entry.limit,
          remaining: entry.remaining,
          resetAt: entry.resetAt,
        },
      ]),
    ),
    limitedUntil: pause ? iso(pause.until) : null,
    limitedResource: pause?.resource ?? null,
    calls,
    notModified: state.notModified ?? 0,
    notModifiedShare: calls ? (state.notModified ?? 0) / calls : null,
  };
}
