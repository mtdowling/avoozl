// GitHub's REST rate limit, kept out of the way: a bounded cache of GET
// answers for conditional requests (a 304 does not count against the
// limit), the last-known x-ratelimit numbers, a pause while limited, and
// the one Needs you row that says so. Everything lives in this workspace's
// SQLite store, because the tick runs in a new process each time.
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const META = "githubRate";
// Under this many calls left in the hour, the tick stretches its GitHub
// reads (below), so the last calls go to what is waiting.
export const LOW_REMAINING = 200;
export const STRETCH_MS = 5 * 60 * 1000;
// With no reset time to go on (a secondary limit with no Retry-After), wait
// the minute GitHub's guidance names.
export const SECONDARY_WAIT_MS = 60 * 1000;
const MAX_WAIT_MS = 2 * 60 * 60 * 1000;
// How many answers, how large one may be, and how long one may go unused.
export const CACHE_MAX_ENTRIES = 400;
export const CACHE_MAX_BODY = 1024 * 1024;
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_MS = 10 * 60 * 1000;
const PRUNE_EVERY = 50;

// ---- Calls by source ------------------------------------------------------

// Who asked for a call: a page view, the tick, setup, a forward, a review, or
// a crew chat through bin/gh-counted. Unmarked code reads as "other".
const sources = new AsyncLocalStorage();
export const withSource = (source, fn) => sources.run(source, fn);
export const currentSource = () => sources.getStore() || "other";
export const sourceOfOperation = (name) =>
  /^tick\b/.test(name)
    ? "tick"
    : /setup/.test(name)
      ? "setup"
      : /^mirror\.forward|^forward/.test(name)
        ? "forward"
        : /review/.test(name)
          ? "review"
          : "view";

const BUCKET_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const bucketOf = (at) => String(Math.floor(at / BUCKET_MS) * BUCKET_MS);

// The file bin/gh-counted appends to, one JSON line per gh run. One login
// has one limit, so every workspace reads the same file.
export const countFilePath = () =>
  process.env.AVOOZL_GH_COUNT_FILE ||
  path.join(
    process.env.AVOOZL_HOME || path.join(homedir(), ".avoozl"),
    "gh-calls.jsonl",
  );

export function recordWrapperCall(
  source,
  at = Date.now(),
  file = countFilePath(),
) {
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ at, source }) + "\n");
}

const readLines = (file) => {
  try {
    return readFileSync(file, "utf8")
      .split("\n")
      .map((line) => {
        try {
          const row = JSON.parse(line);
          return Number.isFinite(row?.at) && typeof row.source === "string"
            ? row
            : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

const add = (usage, bucket, source, field) => {
  const row = ((usage[bucket] ??= {})[source] ??= {
    calls: 0,
    notModified: 0,
    cached: 0,
  });
  row[field] += 1;
};

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
        "CREATE TABLE IF NOT EXISTS github_http_cache(key TEXT PRIMARY KEY,etag TEXT,last_modified TEXT,body TEXT NOT NULL,link TEXT,scopes TEXT,at INTEGER NOT NULL,fetched INTEGER NOT NULL DEFAULT 0)",
      );
      // A table made before the max-age cache has no `fetched` column.
      if (
        !this.store.db
          .prepare("PRAGMA table_info(github_http_cache)")
          .all()
          .some((column) => column.name === "fetched")
      )
        this.store.db.exec(
          "ALTER TABLE github_http_cache ADD COLUMN fetched INTEGER NOT NULL DEFAULT 0",
        );
      this.ready = true;
    }
    return this.store.db;
  }

  // One entry per URL, Accept header and login, so a second account never
  // reads the first one's answer.
  key(token, accept, href, body) {
    return (
      this.owner(token) +
      accept +
      "|" +
      href +
      (body
        ? "#" + createHash("sha256").update(body).digest("hex").slice(0, 16)
        : "")
    );
  }

  owner(token) {
    return (
      createHash("sha256").update(String(token)).digest("hex").slice(0, 8) + "|"
    );
  }

  get(key) {
    try {
      const row = this.#db()
        .prepare(
          "SELECT etag,last_modified AS lastModified,body,link,scopes,at,fetched FROM github_http_cache WHERE key=?",
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

  // An answer too large is not kept. One with no validator (a GraphQL
  // answer) is kept for the max age only.
  put(
    key,
    { etag, lastModified, body, link, scopes },
    { ttlOnly = false } = {},
  ) {
    if ((!ttlOnly && !etag && !lastModified) || body.length > CACHE_MAX_BODY)
      return;
    try {
      this.#db()
        .prepare(
          "INSERT OR REPLACE INTO github_http_cache(key,etag,last_modified,body,link,scopes,at,fetched) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(
          key,
          etag || null,
          lastModified || null,
          body,
          link || null,
          scopes ?? null,
          this.now(),
          this.now(),
        );
      this.puts += 1;
      if (this.puts % PRUNE_EVERY === 0) this.prune();
    } catch {
      // A read-only or busy store only means no caching this time.
    }
  }

  // GitHub just said the stored answer is still current (a 304).
  refreshed(key) {
    try {
      this.#db()
        .prepare("UPDATE github_http_cache SET fetched=?,at=? WHERE key=?")
        .run(this.now(), this.now(), key);
    } catch {
      // The entry is then read again after its max age.
    }
  }

  // A write ran: the answers it may have changed are no longer fresh. They
  // stay, so the next read asks GitHub with their ETag, and a 304 is free.
  // `repo` is "owner/name", or empty for everything this login stored.
  invalidate(token, repo) {
    try {
      const own = this.owner(token) + "%";
      if (repo)
        this.#db()
          .prepare(
            "UPDATE github_http_cache SET fetched=0 WHERE key LIKE ? AND (key LIKE ? OR key LIKE ? OR key LIKE ? OR key LIKE ? OR key LIKE ?)",
          )
          .run(
            own,
            `%/repos/${repo}`,
            `%/repos/${repo}/%`,
            `%/repos/${repo}?%`,
            "%/graphql%",
            "%/search/%",
          );
      else
        this.#db()
          .prepare("UPDATE github_http_cache SET fetched=0 WHERE key LIKE ?")
          .run(own);
    } catch {
      // Answers then age out by the max age.
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
  constructor(store, { now, countFile } = {}) {
    this.store = store;
    this.countFile = countFile || null;
    this.usage = {};
    this.now = now || Date.now;
    this.resources = {};
    this.pause = null;
    this.calls = 0;
    this.notModified = 0;
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

  // A call that went out (a 304 is counted apart), by source.
  count(notModified, source = currentSource()) {
    this.calls += 1;
    if (notModified) this.notModified += 1;
    add(
      this.usage,
      bucketOf(this.now()),
      source,
      notModified ? "notModified" : "calls",
    );
    this.dirty = true;
  }

  // A git fetch or ls-remote: it costs no API quota, so it is counted under
  // source `git` and left out of the hour's call total.
  countGit() {
    add(this.usage, bucketOf(this.now()), "git", "calls");
    this.dirty = true;
  }

  // A read the cache answered: no call went out.
  cached(source = currentSource()) {
    add(this.usage, bucketOf(this.now()), source, "cached");
    this.dirty = true;
    this.flush();
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
    this.flush();
  }

  // The error a call raises while held back, or null when it may go.
  held(resource) {
    const pause = this.pause || readRate(this.store).pause;
    if (!pause || pause.until <= this.now()) return null;
    if (pause.scope !== "all" && pause.scope !== resource) return null;
    return pause;
  }

  // Writes after every call: a 2-second throttle lost the last calls of a
  // short process (a CLI tick) and left Settings behind until the next call.
  flush() {
    if (!this.dirty) return;
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
      const usage = stored.usage || {};
      for (const [bucket, row] of Object.entries(this.usage))
        for (const [source, mine] of Object.entries(row)) {
          const into = ((usage[bucket] ??= {})[source] ??= {
            calls: 0,
            notModified: 0,
            cached: 0,
          });
          for (const field of Object.keys(into))
            into[field] += mine[field] || 0;
        }
      if (this.countFile) takeWrapperCalls(this.countFile, usage);
      for (const bucket of Object.keys(usage))
        if (Number(bucket) < this.now() - HOUR_MS - BUCKET_MS)
          delete usage[bucket];
      stats.calls += this.calls;
      stats.notModified += this.notModified;
      // Old counts fade, so the share reads recent calls.
      if (stats.calls > 5000) {
        stats.calls = Math.round(stats.calls / 2);
        stats.notModified = Math.round(stats.notModified / 2);
      }
      this.store.setMeta(META, {
        ...stored,
        resources,
        pause,
        usage,
        ...stats,
      });
      this.usage = {};
      this.pause = pause;
      this.calls = 0;
      this.notModified = 0;
      this.dirty = false;
    } catch {
      // A busy or read-only store keeps the numbers for the next flush.
    }
  }
}

// Moves the wrapper's lines into `usage` and removes them from the file.
function takeWrapperCalls(file, usage) {
  if (!existsSync(file)) return;
  const taken = `${file}.${process.pid}.read`;
  try {
    renameSync(file, taken);
  } catch {
    return;
  }
  for (const row of readLines(taken))
    add(usage, bucketOf(row.at), row.source, "calls");
  rmSync(taken, { force: true });
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
export function rateView(store, now = Date.now(), { countFile } = {}) {
  const state = readRate(store),
    usage = structuredClone(state.usage || {}),
    bySource = {};
  // Lines the wrapper wrote that no tick has taken yet.
  if (countFile)
    for (const row of readLines(countFile))
      add(usage, bucketOf(row.at), row.source, "calls");
  for (const [bucket, row] of Object.entries(usage))
    if (Number(bucket) > now - HOUR_MS)
      for (const [source, mine] of Object.entries(row)) {
        const into = (bySource[source] ??= {
          calls: 0,
          notModified: 0,
          cached: 0,
        });
        for (const field of Object.keys(into)) into[field] += mine[field] || 0;
      }
  const view = rateViewOf(state, now);
  return {
    ...view,
    bySource,
    hourCalls: Object.entries(bySource).reduce(
      (n, [source, row]) => (source === "git" ? n : n + row.calls),
      0,
    ),
  };
}

function rateViewOf(state, now) {
  const calls = state.calls ?? 0,
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
