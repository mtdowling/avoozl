import {
  defaultJob,
  fixedCredentials,
} from "../../test/github-credentials.mjs";
import { guardGitHub } from "../../content/content-rules.mjs";
import { driverGuard } from "../../workers/driver-scope.mjs";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { GitHubClient } from "../github.mjs";
import { withGitHubReadSnapshots } from "../github-read-snapshot.mjs";
import { ciStep } from "../../flow/flow-ci.mjs";
import { CACHE_MAX_BODY } from "../github-rate.mjs";
import { Store } from "../../store/store.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
const NOW = Date.parse("2026-01-01T00:00:00Z"),
  SINCE = "2025-12-25";
const pull = {
  number: 1,
  headRefName: "feature",
  headRefOid: "a".repeat(40),
  files: { totalCount: 1, nodes: [{ path: "README.md" }] },
  closingIssuesReferences: { nodes: [] },
  commits: { nodes: [] },
  createdAt: "2025-12-31T00:00:00Z",
  author: { login: "fake-author" },
};
function workspace(t) {
  const root = temporaryDirectory("avoozl-read-budget-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({ ...snapshot(), tasks: [], edges: [] });
  return { root, store };
}
function client(t, fetch, cacheSeconds = 0) {
  const { root, store } = workspace(t);
  const github = defaultJob(
    "ci-receipts",
    new GitHubClient({
      credentials: fixedCredentials("fake-token"),
      apiUrl: "https://example.test",
      fetch,
    }),
  ).bind(store, {
    now: () => NOW,
    cacheSeconds: () => cacheSeconds,
    countFile: path.join(root, "calls.jsonl"),
  });
  return { store, github };
}
const response = (value, headers = {}) =>
  new Response(JSON.stringify(value), { headers });
const pullResponse = () =>
  response({
    data: {
      repository: {
        pullRequests: { nodes: [pull], pageInfo: { hasNextPage: false } },
      },
    },
  });
const rawRun = (id = 1) => ({
  id,
  path: ".github/workflows/check.yml",
  head_sha: "a".repeat(40),
  event: "push",
  status: "completed",
  run_attempt: 1,
  run_started_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:01:00Z",
  pull_requests: [{ number: 1 }],
});

test("one check shares the open-PR snapshot across existing readers and CI at TTL0, including no-task repositories", async (t) => {
  let queries = 0,
    runs = 0;
  const { store, github } = client(t, async (url) => {
    if (new URL(url).pathname === "/graphql") {
      queries++;
      return pullResponse();
    }
    runs++;
    return response({ workflow_runs: [] });
  });
  const policy = { mode: "single-repo", repositories: { "example/app": {} } };
  await withGitHubReadSnapshots(async () => {
    await Promise.all([
      github.pullRequestHeads("example/app", ["feature"]),
      github.openPullRequests("EXAMPLE/APP"),
    ]);
    const guarded = driverGuard(store, guardGitHub(github, store));
    await ciStep(store, guarded, { policy, now: NOW });
    await github.pullRequestClosingIssues("example/app", 1);
  });
  assert.equal(queries, 1);
  assert.equal(runs, 1);
  assert.equal(store.list("pr_ci")[0].taskId, null);
  await withGitHubReadSnapshots(() =>
    ciStep(store, github, { policy, now: NOW }),
  );
  assert.equal(queries, 2);
  assert.equal(runs, 2);
  await github.openPullRequests("example/app");
  await github.openPullRequests("example/app");
  assert.equal(
    queries,
    4,
    "ordinary zero-freshness reads outside a check still make calls",
  );
});
test("failed snapshots are shared for a check, and concurrent checks, clients and repositories stay independent", async (t) => {
  let calls = 0;
  const { github } = client(t, async () => {
    calls++;
    return response({ message: "Unavailable" }, { etag: '"bad"' });
  });
  await withGitHubReadSnapshots(async () => {
    const results = await Promise.allSettled([
      github.openPullRequests("example/app"),
      github.openPullRequests("example/app"),
    ]);
    assert.ok(results.every((r) => r.status === "rejected"));
    assert.equal(results[0].reason, results[1].reason);
  });
  assert.equal(calls, 1);
  await withGitHubReadSnapshots(() =>
    assert.rejects(github.openPullRequests("example/app")),
  );
  assert.equal(calls, 2);
  let good = 0;
  const value = client(t, async () => {
    good++;
    return pullResponse();
  });
  await Promise.all([
    withGitHubReadSnapshots(() => value.github.openPullRequests("example/app")),
    withGitHubReadSnapshots(() => value.github.openPullRequests("example/app")),
  ]);
  assert.equal(good, 2);
  await withGitHubReadSnapshots(() =>
    Promise.all([
      value.github.openPullRequests("example/app"),
      value.github.openPullRequests("example/other"),
      github.openPullRequests("example/app").catch(() => {}),
    ]),
  );
  assert.equal(good, 4);
  assert.equal(calls, 3);
});
test("large workflow responses cache only validated metadata under a separate versioned key and reuse 304", async (t) => {
  const raw = {
    workflow_runs: Array.from({ length: 100 }, (_, n) => ({
      ...rawRun(n + 1),
      display_title: "DO NOT CACHE",
      repository: { description: "x".repeat(12000) },
      actor: { bio: "PRIVATE PROSE" },
    })),
  };
  assert.ok(JSON.stringify(raw).length > CACHE_MAX_BODY);
  const requests = [];
  const { github, store } = client(t, async (url, input) => {
    requests.push({ url: String(url), headers: input.headers });
    if (input.headers["If-None-Match"] === '"v1"')
      return new Response(null, { status: 304 });
    return response(raw, {
      etag: '"v1"',
      "last-modified": "Thu, 01 Jan 2026 00:00:00 GMT",
      link: '<https://example.test/?page=2>; rel="next"',
      "x-oauth-scopes": "repo",
    });
  });
  let first;
  await withGitHubReadSnapshots(async () => {
    const reads = await Promise.all([
      github.workflowRuns("example/app", SINCE),
      github.workflowRuns("EXAMPLE/APP", SINCE),
    ]);
    first = reads[0];
    assert.equal(reads[0], reads[1]);
  });
  assert.equal(requests.length, 1);
  assert.equal(first.length, 100);
  assert.equal(first[0].workflow, ".github/workflows/check.yml");
  const cached = store.db.prepare("SELECT * FROM github_http_cache").all();
  assert.equal(cached.length, 1);
  assert.ok(cached[0].key.includes("projection:workflow-runs-v3"));
  assert.ok(cached[0].body.length < CACHE_MAX_BODY);
  assert.doesNotMatch(
    cached[0].body,
    /DO NOT CACHE|PRIVATE PROSE|repository|actor/,
  );
  assert.equal(cached[0].link, '<https://example.test/?page=2>; rel="next"');
  assert.equal(cached[0].scopes, "repo");
  const next = await withGitHubReadSnapshots(() =>
    github.workflowRuns("example/app", SINCE),
  );
  assert.deepEqual(next, first);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].headers["If-None-Match"], '"v1"');
  assert.equal(
    requests[1].headers["If-Modified-Since"],
    "Thu, 01 Jan 2026 00:00:00 GMT",
  );
  assert.equal(store.getMeta("githubRate").notModified, 1);
  const ordinary = await github.request(
    "GET",
    "/repos/example/app/actions/runs",
    { query: { per_page: 100, created: ">=" + SINCE } },
  );
  assert.equal(ordinary.workflow_runs[0].display_title, "DO NOT CACHE");
  assert.equal(requests.length, 3);
  assert.equal(
    requests[2].headers["If-None-Match"],
    undefined,
    "raw callers never read the projected cache entry",
  );
  assert.equal(
    store.db.prepare("SELECT count(*) n FROM github_http_cache").get().n,
    1,
    "the original body-size cap still applies",
  );
  assert.ok(
    requests.every((r) => r.url.includes("/actions/runs?")),
    "no per-run reads",
  );
});
test("invalid projected responses never poison a valid cached answer or its validator, and HTTP errors keep their status", async (t) => {
  let n = 0;
  const tags = [];
  const { github, store } = client(t, async (_url, input) => {
    tags.push(input.headers["If-None-Match"]);
    n++;
    if (n === 2)
      return response({ workflow_runs: [{ id: 1 }] }, { etag: '"invalid"' });
    if (n === 3) return new Response(null, { status: 304 });
    if (n === 4)
      return new Response(
        JSON.stringify({ message: "Missing Actions permission" }),
        { status: 403 },
      );
    return response({ workflow_runs: [rawRun()] }, { etag: '"valid"' });
  });
  const first = await github.workflowRuns("example/app", SINCE);
  await assert.rejects(
    github.workflowRuns("example/app", SINCE),
    (error) => error.status === 502,
  );
  assert.deepEqual(await github.workflowRuns("example/app", SINCE), first);
  assert.deepEqual(tags.slice(0, 3), [undefined, '"valid"', '"valid"']);
  assert.equal(
    store.db.prepare("SELECT etag FROM github_http_cache").get().etag,
    '"valid"',
  );
  await assert.rejects(
    github.workflowRuns("example/app", "2025-12-26"),
    (error) =>
      error.status === 403 && /Missing Actions permission/.test(error.message),
  );
});
test("workflow windows and PR reads use distinct check keys while normal HTTP freshness remains effective", async (t) => {
  let calls = 0;
  const { github } = client(
    t,
    async (url) => {
      calls++;
      return new URL(url).pathname === "/graphql"
        ? pullResponse()
        : response({ workflow_runs: [] }, { etag: '"v1"' });
    },
    60,
  );
  await withGitHubReadSnapshots(() =>
    Promise.all([
      github.openPullRequests("example/app"),
      github.workflowRuns("example/app", SINCE),
      github.workflowRuns("example/app", "2025-12-26"),
    ]),
  );
  assert.equal(calls, 3);
  await withGitHubReadSnapshots(() =>
    github.workflowRuns("example/app", SINCE),
  );
  assert.equal(
    calls,
    3,
    "a fresh persisted answer avoids the next check's network read",
  );
});
