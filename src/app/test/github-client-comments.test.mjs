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
