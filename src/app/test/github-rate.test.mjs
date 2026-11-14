// GitHub rate-limit handling with fakes: conditional reads that reuse the
// stored body on a 304, a bounded cache, a pause on 403 and 429, one Needs
// you row, and a stretched tick when the budget is low. No network.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { GitHubClient } from "../github.mjs";
import {
  CACHE_MAX_AGE_MS,
  CACHE_MAX_BODY,
  LOW_REMAINING,
  RATE_LIMIT_TEXT,
  ResponseCache,
  SECONDARY_WAIT_MS,
  STRETCH_MS,
  githubGate,
  markGithubRun,
  rateLimitNotices,
  rateNeedsYou,
  rateView,
} from "../github-rate.mjs";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const T0 = Date.parse("2026-11-14T18:00:00Z");

function workspace(t) {
  const store = new Store(
    path.join(temporaryDirectory("avoozl-rate-"), "workspace.sqlite"),
  );
  t.after(() => store.close());
  return store;
}

// A GitHub that answers every GET by path from `routes` (a body), with an
// ETag that moves when the body does, and 304 for a matching If-None-Match.
// `counted` is what GitHub would count: every answer but a 304.
function fakeGitHub(routes) {
  const log = { requests: [], counted: 0, notModified: 0 };
  const fetch = async (url, options) => {
    const u = new URL(url),
      headers = options.headers,
      body = routes[u.pathname];
    log.requests.push({ path: u.pathname, headers });
    if (typeof body === "function") return body(u, headers, log);
    const etag = `W/"${JSON.stringify(body).length}-${JSON.stringify(body).slice(0, 12)}"`;
    if (headers["If-None-Match"] === etag) {
      log.notModified += 1;
      return new Response(null, { status: 304, headers: { etag } });
    }
    log.counted += 1;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        etag,
        "last-modified": "Sat, 14 Nov 2026 17:00:00 GMT",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": String(5000 - log.counted),
        "x-ratelimit-reset": String(Math.floor(T0 / 1000) + 3600),
        "x-ratelimit-resource": "core",
      },
    });
  };
  return { fetch, log };
}

function bound(t, store, fetch, now = () => T0) {
  const github = new GitHubClient({
    token: "test-token",
    apiUrl: "https://api.example.test",
    fetch,
  });
  github.bind(store, { now, cacheSeconds: () => 0 });
  return github;
}

test("a 304 reuses the stored body and sends both validators", async (t) => {
  const store = workspace(t),
    { fetch, log } = fakeGitHub({ "/repos/o/r/labels": [{ name: "go" }] }),
    github = bound(t, store, fetch);
  assert.deepEqual(await github.listLabels("o/r"), [{ name: "go" }]);
  assert.deepEqual(await github.listLabels("o/r"), [{ name: "go" }]);
  const [first, second] = log.requests.filter((r) => r.path.endsWith("labels"));
  assert.equal(first.headers["If-None-Match"], undefined);
  assert.match(second.headers["If-None-Match"], /^W\//);
  assert.equal(
    second.headers["If-Modified-Since"],
    "Sat, 14 Nov 2026 17:00:00 GMT",
  );
  assert.equal(log.counted, 1);
  assert.equal(log.notModified, 1);
  // A new client on the same workspace (a new tick process) reuses it too.
  const again = bound(t, store, fetch);
  assert.deepEqual(await again.listLabels("o/r"), [{ name: "go" }]);
  assert.equal(log.counted, 1);
});

test("a changed answer replaces the stored one, and Link survives a 304", async (t) => {
  const store = workspace(t);
  let body = [{ name: "a" }];
  const { fetch, log } = fakeGitHub({
    "/repos/o/r/issues": (u, headers) => {
      const etag = `"${JSON.stringify(body)}"`;
      if (headers["If-None-Match"] === etag)
        return new Response(null, { status: 304 });
      log.counted += 1;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { etag, link: '<https://x/?page=2>; rel="next"' },
      });
    },
  });
  const github = bound(t, store, fetch),
    read = () => github.request("GET", "/repos/o/r/issues", { headers: true });
  assert.deepEqual((await read()).value, [{ name: "a" }]);
  const cached = await read();
  assert.deepEqual(cached.value, [{ name: "a" }]);
  assert.match(cached.link, /rel="next"/);
  body = [{ name: "b" }];
  assert.deepEqual((await read()).value, [{ name: "b" }]);
  assert.equal(log.counted, 2);
});

test("writes and answers with no validator are never cached", async (t) => {
  const store = workspace(t);
  let posts = 0;
  const github = bound(t, store, async (url, options) => {
    if (options.method === "POST") posts += 1;
    return new Response("{}", { status: 200 });
  });
  await github.request("POST", "/repos/o/r/issues", { body: { title: "x" } });
  await github.request("POST", "/repos/o/r/issues", { body: { title: "x" } });
  await github.request("GET", "/repos/o/r");
  assert.equal(posts, 2);
  assert.equal(new ResponseCache(store).size(), 0);
});

test("the cache is bounded: oversize skipped, least recently used and old entries pruned", (t) => {
  const store = workspace(t);
  let clock = T0;
  const cache = new ResponseCache(store, { now: () => clock, maxEntries: 3 }),
    put = (name, body = "[]") =>
      cache.put(name, { etag: '"' + name + '"', body });
  cache.put("big", { etag: '"x"', body: "x".repeat(CACHE_MAX_BODY + 1) });
  assert.equal(cache.size(), 0);
  for (const name of ["a", "b", "c", "d", "e"]) {
    clock += 1000;
    put(name);
  }
  assert.equal(cache.size(), 5);
  assert.equal(cache.prune(), 2);
  assert.deepEqual(
    ["a", "b", "c", "d", "e"].filter((name) => cache.get(name)),
    ["c", "d", "e"],
  );
  clock += CACHE_MAX_AGE_MS + 1;
  put("fresh");
  assert.equal(cache.prune(), 3);
  assert.equal(cache.size(), 1);
});

test("a 403 with no calls left stops every call until the reset, with no retries", async (t) => {
  const store = workspace(t);
  let clock = T0,
    calls = 0;
  const reset = Math.floor(T0 / 1000) + 600,
    github = bound(
      t,
      store,
      async () => {
        calls += 1;
        return calls === 1
          ? new Response(
              JSON.stringify({ message: "API rate limit exceeded" }),
              {
                status: 403,
                headers: {
                  "x-ratelimit-limit": "5000",
                  "x-ratelimit-remaining": "0",
                  "x-ratelimit-reset": String(reset),
                  "x-ratelimit-resource": "core",
                },
              },
            )
          : new Response("{}", { status: 200 });
      },
      () => clock,
    );
  await assert.rejects(github.repository("o/r"), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.rateLimited.resource, "core");
    assert.equal(
      error.rateLimited.resetAt,
      new Date(reset * 1000).toISOString(),
    );
    assert.match(error.message, RATE_LIMIT_TEXT);
    return true;
  });
  // Ten more calls, even from a second client of the same workspace, make
  // no request.
  const other = bound(
    t,
    store,
    async () => (calls += 1),
    () => clock,
  );
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(github.repository("o/r"), (e) =>
      Boolean(e.rateLimited),
    );
    await assert.rejects(other.listLabels("o/r"), (e) =>
      Boolean(e.rateLimited),
    );
  }
  assert.equal(calls, 1);
  // GraphQL has its own budget and is not held by a spent core budget.
  clock = (reset + 1) * 1000;
  await github.repository("o/r");
  assert.equal(calls, 2);
});

test("a spent budget on a 200 holds the next call too", async (t) => {
  const store = workspace(t);
  let calls = 0;
  const github = bound(t, store, async () => {
    calls += 1;
    return new Response("{}", {
      status: 200,
      headers: {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.floor(T0 / 1000) + 300),
      },
    });
  });
  await github.repository("o/r");
  await assert.rejects(github.repository("o/r"), (e) => Boolean(e.rateLimited));
  assert.equal(calls, 1);
});

test("a 429 waits for Retry-After", async (t) => {
  const store = workspace(t);
  let clock = T0,
    calls = 0;
  const github = bound(
    t,
    store,
    async () => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ message: "slow down" }), {
            status: 429,
            headers: { "retry-after": "90" },
          })
        : new Response("{}", { status: 200 });
    },
    () => clock,
  );
  await assert.rejects(github.repository("o/r"), (e) => Boolean(e.rateLimited));
  assert.equal(
    rateView(store, T0).limitedUntil,
    new Date(T0 + 90_000).toISOString(),
  );
  clock = T0 + 89_000;
  await assert.rejects(github.repository("o/r"), (e) => Boolean(e.rateLimited));
  clock = T0 + 91_000;
  await github.repository("o/r");
  assert.equal(calls, 2);
});

test("a secondary limit holds every resource for a minute when GitHub names no time", async (t) => {
  const store = workspace(t);
  let clock = T0,
    calls = 0;
  const github = bound(
    t,
    store,
    async () => {
      calls += 1;
      return calls === 1
        ? new Response(
            JSON.stringify({
              message:
                "You have exceeded a secondary rate limit. Please wait a few minutes.",
            }),
            { status: 403 },
          )
        : new Response(JSON.stringify({ data: {} }), { status: 200 });
    },
    () => clock,
  );
  await assert.rejects(github.repository("o/r"), (e) => Boolean(e.rateLimited));
  await assert.rejects(github.graphql("query{x}", {}, "read"), (e) =>
    Boolean(e.rateLimited),
  );
  assert.equal(calls, 1);
  clock = T0 + SECONDARY_WAIT_MS + 1;
  await github.graphql("query{x}", {}, "read");
  assert.equal(calls, 2);
});

test("a 403 for permissions is not a rate limit", async (t) => {
  const store = workspace(t),
    github = bound(
      t,
      store,
      async () =>
        new Response(JSON.stringify({ message: "Resource not accessible" }), {
          status: 403,
          headers: { "x-ratelimit-remaining": "4000" },
        }),
    );
  await assert.rejects(github.repository("o/r"), (e) => {
    assert.equal(e.status, 403);
    assert.equal(e.rateLimited, undefined);
    return true;
  });
  assert.equal(rateView(store, T0).limitedUntil, null);
});

test("one Needs you row and one notice per window, and the row clears itself", async (t) => {
  const store = workspace(t),
    reset = Math.floor(T0 / 1000) + 600,
    github = bound(
      t,
      store,
      async () =>
        new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
          status: 403,
          headers: {
            "x-ratelimit-limit": "5000",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(reset),
            "x-ratelimit-resource": "core",
          },
        }),
    );
  for (let i = 0; i < 4; i += 1)
    await assert.rejects(github.repository("o/r"), (e) =>
      Boolean(e.rateLimited),
    );
  const rows = rateNeedsYou(store, T0);
  assert.equal(rows.length, 1);
  assert.equal(
    rows[0].title,
    `GitHub rate limit reached, resumes at ${new Date(reset * 1000).toISOString()}`,
  );
  assert.match(rows[0].detail, /0 of 5000 core calls left/);
  assert.equal(rateLimitNotices(store, T0).length, 1);
  assert.equal(rateLimitNotices(store, T0 + 1000).length, 0);
  assert.deepEqual(rateNeedsYou(store, reset * 1000 + 1), []);
});

test("a low budget stretches the tick, a spent one holds it, and a reset frees it", (t) => {
  const store = workspace(t),
    github = bound(t, store, async () => new Response("{}"));
  const set = (remaining, resetIn = 3600_000) => {
    github.rate.observe("core", {
      limit: 5000,
      remaining,
      resetAtMs: T0 + resetIn,
    });
    github.rate.flush(true);
  };
  set(LOW_REMAINING + 1);
  assert.equal(githubGate(store, T0).skip, false);
  set(LOW_REMAINING - 1);
  assert.equal(githubGate(store, T0).skip, false, "no run recorded yet");
  markGithubRun(store, T0);
  assert.equal(githubGate(store, T0 + 60_000).skip, true);
  assert.equal(githubGate(store, T0 + 60_000).reason, "low");
  assert.equal(githubGate(store, T0 + STRETCH_MS).skip, false);
  // Under a quarter of the threshold the gap is four times as long.
  set(10);
  assert.equal(githubGate(store, T0 + STRETCH_MS).skip, true);
  assert.equal(githubGate(store, T0 + 4 * STRETCH_MS).skip, false);
  // Never past the reset.
  set(10, 120_000);
  assert.equal(githubGate(store, T0 + 120_001).skip, false);
  // Spent: held until the reset.
  set(0, 600_000);
  assert.deepEqual(
    [githubGate(store, T0 + 1).skip, githubGate(store, T0 + 1).reason],
    [true, "limited"],
  );
  assert.equal(githubGate(store, T0 + 600_001).skip, false);
});

test("the settings view reports the last numbers and the 304 share", async (t) => {
  const store = workspace(t),
    { fetch } = fakeGitHub({ "/repos/o/r": { id: 1 } }),
    github = bound(t, store, fetch);
  for (let i = 0; i < 4; i += 1) await github.repository("o/r");
  github.rate.flush(true);
  const view = rateView(store, T0);
  assert.equal(view.calls, 4);
  assert.equal(view.notModified, 3);
  assert.equal(view.notModifiedShare, 0.75);
  assert.equal(view.resources.core.limit, 5000);
  assert.equal(view.limitedUntil, null);
});

// The quiet-tick workload: the REST reads a tick with nothing new makes,
// repeated over four ticks. `old` is the path before this change (no cache,
// so every read is counted); the new path must count fewer, whatever the
// number of reads.
test("a quiet tick makes fewer counted calls than the old path", async (t) => {
  const routes = {
    "/repos/o/r": { id: 1, private: true },
    "/repos/o/r/labels": [{ name: "go" }],
    "/repos/o/r/issues": [{ number: 1 }, { number: 2 }],
    "/repos/o/r/issues/1/comments": [{ id: 1 }],
    "/repos/o/r/issues/1/events": [{ id: 9 }],
    "/repos/o/r/pulls/5": { number: 5 },
    "/repos/o/r/commits/abc/check-runs": { check_runs: [] },
    "/repos/o/r/contents/.kiro/specs/x/tasks.md": { content: "" },
  };
  const tick = async (github) => {
    await github.repository("o/r");
    await github.listLabels("o/r");
    await github.listIssues("o/r");
    await github.listIssueComments("o/r", 1);
    await github.issueEvents("o/r", 1);
    await github.pullRequest("o/r", 5);
    await github.checkRuns("o/r", "abc");
    await github.request("GET", "/repos/o/r/contents/.kiro/specs/x/tasks.md");
  };
  const run = async (bind) => {
    const { fetch, log } = fakeGitHub(routes),
      github = new GitHubClient({
        token: "test-token",
        apiUrl: "https://api.example.test",
        fetch,
      });
    if (bind) github.bind(workspace(t));
    for (let i = 0; i < 4; i += 1) await tick(github);
    return log;
  };
  const before = await run(false),
    after = await run(true);
  assert.equal(before.counted, before.requests.length);
  assert.ok(
    after.counted < before.counted,
    `counted ${after.counted} should be below ${before.counted}`,
  );
  // Quiet means one counted read per URL, whatever the tick count.
  assert.equal(after.counted, Object.keys(routes).length);
});

// The whole tick: while limited it makes no GitHub call, says so once, and
// catches up on the first tick after the reset.
test("the tick holds every GitHub step while limited, with one row and one notice", async (t) => {
  const { workspace: plans } = await import("./plans-repo-github.mjs"),
    w = plans(t),
    calls = [],
    counted = new Proxy(w.github, {
      get(target, name) {
        const value = target[name];
        return typeof value === "function" &&
          !["bind", "available", "signedIn"].includes(name)
          ? (...args) => {
              calls.push(name);
              return value.apply(target, args);
            }
          : value;
      },
    }),
    { Operations } = await import("../operations.mjs"),
    ops = new Operations(w.store, { github: counted, workspaceRoot: w.root }),
    tick = () => ops.execute("workspace.tick", { sessions: [] }),
    now = Date.now();
  await tick();
  const free = calls.length;
  assert.ok(free > 0, "an unlimited tick reads GitHub");
  w.store.setMeta("githubRate", {
    resources: {
      core: {
        limit: 5000,
        remaining: 0,
        resetAt: new Date(now + 3600_000).toISOString(),
        at: now,
      },
    },
    pause: { resource: "core", scope: "core", until: now + 3600_000, at: now },
  });
  calls.length = 0;
  const notices = [];
  for (let i = 0; i < 3; i += 1)
    notices.push(
      ...(await tick()).notify.filter((n) => /rate limit/i.test(n.title)),
    );
  assert.deepEqual(calls, []);
  assert.equal(notices.length, 1);
  const view = await ops.execute("conflicts.view", {}),
    rows = view.items.filter((item) => item.id === "github-rate-limit");
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /^GitHub rate limit reached, resumes at /);
  // The settings page shows the numbers.
  const settings = await ops.execute("github.settings.get", {});
  assert.equal(settings.rate.resources.core.remaining, 0);
  assert.ok(settings.rate.limitedUntil);
  // After the reset the row is gone and the next tick reads GitHub again.
  w.store.setMeta("githubRate", {
    ...w.store.getMeta("githubRate"),
    pause: { resource: "core", scope: "core", until: now - 1000, at: now },
  });
  const after = await ops.execute("conflicts.view", {});
  assert.equal(
    after.items.filter((item) => item.id === "github-rate-limit").length,
    0,
  );
  await tick();
  assert.ok(calls.length > 0);
});

// ---- The one max-age cache (github.cacheSeconds) ------------------------

function aged(t, routes, seconds = () => 60) {
  const store = workspace(t),
    clock = { now: T0 },
    { fetch, log } = fakeGitHub(routes),
    github = new GitHubClient({
      token: "test-token",
      apiUrl: "https://api.example.test",
      fetch,
    });
  github.bind(store, { now: () => clock.now, cacheSeconds: seconds });
  return { github, log, clock, store };
}

test("inside the max age a read makes no GitHub call, and after it a 304 revalidates", async (t) => {
  const { github, log, clock } = aged(t, { "/repos/o/r": { id: 1 } });
  await github.repository("o/r");
  clock.now += 59_000;
  assert.deepEqual(await github.repository("o/r"), { id: 1 });
  assert.equal(log.requests.length, 1);
  clock.now += 2000;
  assert.deepEqual(await github.repository("o/r"), { id: 1 });
  assert.equal(log.requests.length, 2);
  assert.equal(log.notModified, 1);
  // The 304 restarted the clock.
  clock.now += 30_000;
  await github.repository("o/r");
  assert.equal(log.requests.length, 2);
});

test("a repository's own seconds beat the default, and 0 turns the cache off", async (t) => {
  const { github, log, clock } = aged(
    t,
    { "/repos/o/a": { id: 1 }, "/repos/o/b": { id: 2 } },
    (repo) => (repo === "o/a" ? 0 : 300),
  );
  for (const repo of ["o/a", "o/b", "o/a", "o/b"])
    await github.repository(repo);
  assert.deepEqual(
    log.requests.map((r) => r.path),
    ["/repos/o/a", "/repos/o/b", "/repos/o/a"],
  );
  clock.now += 299_000;
  await github.repository("o/b");
  assert.equal(log.requests.length, 3);
});

test("a write makes that repository's answers stale, and the next read revalidates", async (t) => {
  const { github, log } = aged(t, {
    "/repos/o/r": { id: 1 },
    "/repos/o/q": { id: 2 },
    "/repos/o/r/issues/1/comments": () => new Response("{}", { status: 201 }),
  });
  await github.repository("o/r");
  await github.repository("o/q");
  await github.request("POST", "/repos/o/r/issues/1/comments", {
    body: { body: "hi" },
  });
  const before = log.requests.length;
  await github.repository("o/q");
  assert.equal(log.requests.length, before, "another repository stays fresh");
  await github.repository("o/r");
  assert.equal(log.requests.length, before + 1);
  assert.equal(
    log.requests.at(-1).headers["If-None-Match"] !== undefined,
    true,
  );
});

test("a GraphQL query is kept for the max age, a mutation makes it stale, errors are not kept", async (t) => {
  let answers = 0;
  const { github, log } = aged(t, {
    "/graphql": async (_url, _headers, state) => {
      answers += 1;
      state.counted += 1;
      return new Response(
        JSON.stringify(
          answers === 1
            ? { errors: [{ message: "boom" }] }
            : { data: { n: answers } },
        ),
        { status: 200 },
      );
    },
  });
  await assert.rejects(github.graphql("query{a}", {}, "read a"));
  assert.deepEqual(await github.graphql("query{a}", {}, "read a"), { n: 2 });
  assert.deepEqual(await github.graphql("query{a}", {}, "read a"), { n: 2 });
  assert.equal(log.requests.length, 2);
  await github.graphql("mutation{b}", {}, "write b");
  assert.deepEqual(await github.graphql("query{a}", {}, "read a"), { n: 4 });
});

test("while the limit holds, even an old answer is served and an unseen one fails", async (t) => {
  const { github, log, clock, store } = aged(t, {
    "/repos/o/r": { id: 1 },
    "/repos/o/other": { id: 2 },
  });
  await github.repository("o/r");
  clock.now += 3_600_000;
  github.rate.limit({
    resource: "core",
    until: clock.now + 600_000,
    reason: "primary",
  });
  const calls = log.requests.length;
  assert.deepEqual(await github.repository("o/r"), { id: 1 });
  await assert.rejects(github.repository("o/other"), (e) =>
    RATE_LIMIT_TEXT.test(e.message),
  );
  assert.equal(log.requests.length, calls);
  assert.ok(store);
});

test("a 403 limit answer on a stored read serves the stored body", async (t) => {
  let limited = false;
  const { github, clock } = aged(t, {
    "/repos/o/r": (_u, _h, state) => {
      if (!limited) {
        state.counted += 1;
        return new Response('{"id":1}', {
          status: 200,
          headers: { etag: '"a"' },
        });
      }
      return new Response('{"message":"API rate limit exceeded"}', {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(Math.floor(T0 / 1000) + 7200),
        },
      });
    },
  });
  await github.repository("o/r");
  clock.now += 120_000;
  limited = true;
  assert.deepEqual(await github.repository("o/r"), { id: 1 });
});
