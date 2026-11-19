import assert from "node:assert/strict";
import test from "node:test";
import { GitHubClient } from "../github.mjs";

function client(reply) {
  const requests = [],
    github = new GitHubClient({
      token: "test-token",
      apiUrl: "https://api.example.test",
      fetch: async (url, options) => {
        const request = {
          method: options.method,
          url: String(url).replace("https://api.example.test", ""),
          body: options.body ? JSON.parse(options.body) : undefined,
        };
        requests.push(request);
        const { status = 200, body = [] } = reply(request) || {};
        return new Response(JSON.stringify(body), { status });
      },
    });
  return { github, requests };
}

test("sub-issue, dependency, and issue type endpoints", async () => {
  const { github, requests } = client((request) =>
    request.url.endsWith("/parent") || request.url.includes("/orgs/user")
      ? { status: 404, body: { message: "Not Found" } }
      : { body: request.method === "GET" ? [] : { id: 5 } },
  );
  await github.listSubIssues("example/plans", 3);
  await github.removeSubIssue("example/plans", 3, 99);
  assert.equal(await github.parentIssue("example/plans", 4), null);
  await github.listIssueBlocking("example/plans", 4);
  assert.deepEqual(await github.listIssueTypes("user"), []);
  await github.listIssueTypes("example");
  await github.createIssueType("example", { name: "Epic", color: "purple" });
  await github.setIssueType("example/plans", 3, "Epic");
  assert.deepEqual(
    requests.map(({ method, url, body }) => [method, url, body]),
    [
      [
        "GET",
        "/repos/example/plans/issues/3/sub_issues?per_page=100&page=1",
        undefined,
      ],
      [
        "DELETE",
        "/repos/example/plans/issues/3/sub_issue",
        { sub_issue_id: 99 },
      ],
      ["GET", "/repos/example/plans/issues/4/parent", undefined],
      [
        "GET",
        "/repos/example/plans/issues/4/dependencies/blocking?per_page=100&page=1",
        undefined,
      ],
      ["GET", "/orgs/user/issue-types", undefined],
      ["GET", "/orgs/example/issue-types", undefined],
      [
        "POST",
        "/orgs/example/issue-types",
        { name: "Epic", description: "", is_enabled: true, color: "purple" },
      ],
      ["PATCH", "/repos/example/plans/issues/3", { type: "Epic" }],
    ],
  );
});

test("createLinkedBranch names the code repository and the base oid", async () => {
  const { github, requests } = client(() => ({
    body: {
      data: {
        createLinkedBranch: {
          linkedBranch: {
            id: "LB_1",
            ref: {
              name: "avoozl/w3.timers",
              repository: { id: "R_code", nameWithOwner: "example/app" },
            },
          },
        },
      },
    },
  }));
  const branch = await github.createLinkedBranch({
    issueId: "I_plan",
    repositoryId: "R_code",
    oid: "c".repeat(40),
    name: "avoozl/w3.timers",
  });
  assert.deepEqual(branch, {
    id: "LB_1",
    name: "avoozl/w3.timers",
    repository: "example/app",
    repositoryId: "R_code",
  });
  assert.equal(requests[0].url, "/graphql");
  assert.match(requests[0].body.query, /createLinkedBranch\(input:\$input\)/);
  assert.deepEqual(requests[0].body.variables.input, {
    issueId: "I_plan",
    repositoryId: "R_code",
    oid: "c".repeat(40),
    name: "avoozl/w3.timers",
  });
});

test("issue links read linked branches and the open blocked-by count", async () => {
  const { github, requests } = client(() => ({
    body: {
      data: {
        repository: {
          issue: {
            id: "I_plan",
            linkedBranches: {
              nodes: [
                {
                  id: "LB_1",
                  ref: {
                    name: "avoozl/w3.timers",
                    repository: { id: "R_code", nameWithOwner: "example/app" },
                  },
                },
              ],
            },
            issueDependenciesSummary: { blockedBy: 1, totalBlockedBy: 3 },
          },
        },
      },
    },
  }));
  assert.deepEqual(await github.issueLinks("example/plans", 8), {
    nodeId: "I_plan",
    linkedBranches: [
      {
        id: "LB_1",
        name: "avoozl/w3.timers",
        repository: "example/app",
        repositoryId: "R_code",
      },
    ],
    openBlockedBy: 1,
    totalBlockedBy: 3,
  });
  assert.deepEqual(requests[0].body.variables, {
    owner: "example",
    repo: "plans",
    number: 8,
  });
});

test("GraphQL errors fail instead of reading as empty", async () => {
  const { github } = client(() => ({
    body: { errors: [{ message: "Resource not accessible" }] },
  }));
  await assert.rejects(
    github.createLinkedBranch({
      issueId: "I",
      repositoryId: "R",
      oid: "c".repeat(40),
      name: "avoozl/x",
    }),
    /could not create a linked branch: Resource not accessible/,
  );
  await assert.rejects(
    github.issueLinks("example/plans", 1),
    /could not read issue links/,
  );
});

test("branch head and branch pull requests read what plans-repo delivery needs", async () => {
  const { github, requests } = client((request) =>
    /ref\(qualifiedName/.test(request.body.query)
      ? {
          body: {
            data: {
              repository: {
                id: "R_code",
                ref:
                  request.body.variables.ref === "refs/heads/main"
                    ? { target: { oid: "c".repeat(40) } }
                    : null,
              },
            },
          },
        }
      : {
          body: {
            data: {
              repository: {
                pullRequests: {
                  nodes: [
                    {
                      number: 7,
                      url: "u",
                      title: "t",
                      body: "b",
                      commits: {
                        nodes: [{ commit: { oid: "d", message: "m" } }],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
  );
  assert.deepEqual(await github.branchHead("example/app", "main"), {
    repositoryId: "R_code",
    oid: "c".repeat(40),
  });
  await assert.rejects(
    github.branchHead("example/app", "gone"),
    (error) => error.status === 409,
  );
  const [pull] = await github.branchPullRequests("example/app", "avoozl/w3");
  assert.deepEqual(pull.commits, [{ oid: "d", message: "m" }]);
  assert.equal(requests[2].body.variables.branch, "avoozl/w3");
  assert.match(requests[2].body.query, /headRefName:\$branch/);
});
