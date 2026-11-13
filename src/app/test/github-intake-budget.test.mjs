import assert from "node:assert/strict";
import test from "node:test";
import { GitHubClient } from "../github.mjs";

// A client whose fetch answers each path from `routes`: a value, or
// [status, value, headers].
function client(routes, seen = []) {
  return new GitHubClient({
    token: "test-token",
    apiUrl: "https://api.example.test",
    fetch: async (url) => {
      const u = new URL(url);
      seen.push(u.pathname + u.search);
      const found = Object.entries(routes).find(([path]) =>
        u.pathname.endsWith(path),
      );
      const [status, value, headers] = Array.isArray(found?.[1])
        ? found[1]
        : [200, found?.[1] ?? null, {}];
      return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json", ...headers },
      });
    },
  });
}

test("the client keeps the latest rate-limit headers per resource", async () => {
  const github = client({
    "/repos/example/code": [
      200,
      { default_branch: "main" },
      {
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "42",
        "x-ratelimit-reset": "1794500000",
        "x-ratelimit-resource": "core",
      },
    ],
  });
  assert.equal(github.rateLimit("core"), null);
  await github.repository("example/code");
  assert.deepEqual(github.rateLimit("core"), {
    limit: 5000,
    remaining: 42,
    resetAt: new Date(1794500000 * 1000).toISOString(),
  });
});

test("one issue search reads every label of every rule, across pages", async () => {
  const seen = [],
    page = (from, count) =>
      Array.from({ length: count }, (_, i) => ({ number: from + i }));
  const github = client({}, seen);
  github.fetch = async (url) => {
    const u = new URL(url);
    seen.push(u.searchParams.get("q") + " page " + u.searchParams.get("page"));
    const n = Number(u.searchParams.get("page"));
    return new Response(
      JSON.stringify({
        total_count: 150,
        incomplete_results: false,
        items: n === 1 ? page(1, 100) : page(101, 50),
      }),
      { status: 200 },
    );
  };
  const items = await github.searchIssuesWithAnyLabel("example/code", [
    "bot:go",
    "needs review",
    "bot:go",
  ]);
  assert.equal(items.length, 150);
  assert.deepEqual(seen, [
    'repo:example/code is:issue is:open label:bot:go,"needs review" page 1',
    'repo:example/code is:issue is:open label:bot:go,"needs review" page 2',
  ]);
  // Incomplete results would silently drop issues, so they fail instead.
  github.fetch = async () =>
    new Response(
      JSON.stringify({ total_count: 3, incomplete_results: true, items: [] }),
      { status: 200 },
    );
  await assert.rejects(
    github.searchIssuesWithAnyLabel("example/code", ["bot:go"]),
    /incomplete/,
  );
});

test("issue activity is a conditional read that reports a 304 as unchanged", async () => {
  const sent = [];
  const github = client({});
  github.fetch = async (url, options) => {
    sent.push(options.headers["If-None-Match"] ?? null);
    return options.headers["If-None-Match"] === 'W/"a"'
      ? new Response(null, { status: 304 })
      : new Response("[]", { status: 200, headers: { etag: 'W/"a"' } });
  };
  assert.deepEqual(await github.issueActivity("example/code", null), {
    changed: true,
    etag: 'W/"a"',
  });
  assert.deepEqual(await github.issueActivity("example/code", 'W/"a"'), {
    changed: false,
    etag: 'W/"a"',
  });
  assert.deepEqual(sent, [null, 'W/"a"']);
});
