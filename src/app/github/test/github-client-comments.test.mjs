import assert from "node:assert/strict";
import test from "node:test";
import { GitHubClient } from "../github.mjs";

test("GitHub comment clients use the issue and pull-request review endpoints", async () => {
  const requests = [],
    github = new GitHubClient({
      token: "test-token",
      apiUrl: "https://api.example.test",
      fetch: async (url, options) => {
        requests.push({ url: String(url), method: options.method });
        return new Response("[]", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

  assert.deepEqual(await github.listIssueComments("example/code", 7), []);
  assert.deepEqual(
    await github.listPullRequestReviewComments("example/code", 9),
    [],
  );
  assert.deepEqual(requests, [
    {
      method: "GET",
      url: "https://api.example.test/repos/example/code/issues/7/comments?per_page=100&page=1",
    },
    {
      method: "GET",
      url: "https://api.example.test/repos/example/code/pulls/9/comments?per_page=100&page=1",
    },
  ]);
});

test("GitHub pull-request files stop at the requested safe bound", async () => {
  const requests = [],
    github = new GitHubClient({
      token: "test-token",
      apiUrl: "https://api.example.test",
      fetch: async (url) => {
        const parsed = new URL(url);
        requests.push(parsed);
        const count = Number(parsed.searchParams.get("per_page"));
        return new Response(
          JSON.stringify(
            Array.from({ length: count }, (_, index) => ({
              filename: `src/file-${requests.length}-${index}.mjs`,
            })),
          ),
          { status: 200 },
        );
      },
    });

  const result = await github.listPullRequestFiles("example/code", 12, {
    maxFiles: 125,
  });
  assert.equal(result.files.length, 125);
  assert.equal(result.truncated, true);
  assert.deepEqual(
    requests.map((request) => [
      request.pathname,
      request.searchParams.get("page"),
      request.searchParams.get("per_page"),
    ]),
    [
      ["/repos/example/code/pulls/12/files", "1", "100"],
      ["/repos/example/code/pulls/12/files", "2", "25"],
    ],
  );
});

test("GitHub Queue list clients consume every page", async () => {
  const requests = [],
    github = new GitHubClient({
      token: "test-token",
      apiUrl: "https://api.example.test",
      fetch: async (url) => {
        const parsed = new URL(url);
        requests.push(parsed);
        const page = Number(parsed.searchParams.get("page")),
          isIssues = parsed.pathname.endsWith("/issues"),
          count = page === 1 ? 100 : 1,
          payload = Array.from({ length: count }, (_, index) => ({
            id: `${isIssues ? "issue" : "pull"}-${page}-${index}`,
            ...(isIssues && page === 1 && index === 0
              ? { pull_request: { url: "https://api.example.test/pulls/1" } }
              : {}),
          }));
        return new Response(JSON.stringify(payload), { status: 200 });
      },
    });

  const issues = await github.listOpenIssues("example/code"),
    pulls = await github.listPullRequests("example/code", { state: "open" });
  assert.equal(issues.length, 100);
  assert.equal(pulls.length, 101);
  assert.deepEqual(
    requests.map((request) => [
      request.pathname,
      request.searchParams.get("page"),
      request.searchParams.get("per_page"),
    ]),
    [
      ["/repos/example/code/issues", "1", "100"],
      ["/repos/example/code/issues", "2", "100"],
      ["/repos/example/code/pulls", "1", "100"],
      ["/repos/example/code/pulls", "2", "100"],
    ],
  );
});

test("GitHub pagination fails instead of silently truncating at its safe cap", async () => {
  let requests = 0;
  const github = new GitHubClient({
    token: "test-token",
    apiUrl: "https://api.example.test",
    fetch: async () => {
      requests += 1;
      return new Response(
        JSON.stringify(
          Array.from({ length: 100 }, (_, index) => ({ id: index })),
        ),
        { status: 200 },
      );
    },
  });

  await assert.rejects(
    github.listPullRequests("example/code", { state: "open" }),
    (error) =>
      error.status === 413 &&
      /more than 2000 items/.test(String(error.message)),
  );
  assert.equal(requests, 21);
});

test("GitHub dependency clients use issue database IDs", async () => {
  const requests = [],
    github = new GitHubClient({
      token: "test-token",
      apiUrl: "https://api.example.test",
      fetch: async (url, options) => {
        requests.push({
          url: String(url),
          method: options.method,
          body: options.body ? JSON.parse(options.body) : null,
        });
        return new Response(options.method === "GET" ? "[]" : "{}", {
          status: 200,
        });
      },
    });

  assert.deepEqual(await github.listIssueBlockers("example/code", 7), []);
  await github.addIssueBlocker("example/code", 7, 123456);
  await github.removeIssueBlocker("example/code", 7, 123456);

  assert.deepEqual(requests, [
    {
      method: "GET",
      url: "https://api.example.test/repos/example/code/issues/7/dependencies/blocked_by?per_page=100&page=1",
      body: null,
    },
    {
      method: "POST",
      url: "https://api.example.test/repos/example/code/issues/7/dependencies/blocked_by",
      body: { issue_id: 123456 },
    },
    {
      method: "DELETE",
      url: "https://api.example.test/repos/example/code/issues/7/dependencies/blocked_by/123456",
      body: null,
    },
  ]);
});

test("GitHub completion clients read closing pull requests and exact checks", async () => {
  const requests = [],
    github = new GitHubClient({
      token: "test-token",
      apiUrl: "https://api.example.test",
      fetch: async (url, options) => {
        const parsed = new URL(url),
          body = options.body ? JSON.parse(options.body) : null;
        requests.push({
          pathname: parsed.pathname,
          method: options.method,
          body,
        });
        if (parsed.pathname === "/graphql")
          return new Response(
            JSON.stringify({
              data: {
                repository: {
                  issue: {
                    closedByPullRequestsReferences: {
                      nodes: [{ number: 12, merged: true }],
                    },
                  },
                },
              },
            }),
            { status: 200 },
          );
        if (parsed.pathname.endsWith("/check-runs"))
          return new Response(JSON.stringify({ check_runs: [] }), {
            status: 200,
          });
        return new Response(JSON.stringify({ statuses: [] }), { status: 200 });
      },
    });

  assert.equal(
    (await github.closingPullRequests("example/code", 7))[0].number,
    12,
  );
  assert.deepEqual(await github.checkRuns("example/code", "a".repeat(40)), []);
  assert.deepEqual(
    (await github.commitStatus("example/code", "a".repeat(40))).statuses,
    [],
  );
  await github.createCommitStatus("example/code", "a".repeat(40), {
    state: "success",
    context: "proof",
  });
  assert.deepEqual(
    requests.map(({ pathname, method }) => [method, pathname]),
    [
      ["POST", "/graphql"],
      ["GET", `/repos/example/code/commits/${"a".repeat(40)}/check-runs`],
      ["GET", `/repos/example/code/commits/${"a".repeat(40)}/status`],
      ["POST", `/repos/example/code/statuses/${"a".repeat(40)}`],
    ],
  );
  assert.equal(requests[0].body.variables.number, 7);
});
