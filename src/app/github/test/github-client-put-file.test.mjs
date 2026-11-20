import {
  defaultJob,
  fixedCredentials,
} from "../../test/github-credentials.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { GitHubClient } from "../github.mjs";

// GitHub rejects an update to an existing file that does not name its blob sha.
test("putFile sends the existing file's sha and none for a new file", async () => {
  const puts = [],
    github = defaultJob(
      "spec-branch",
      new GitHubClient({
        credentials: fixedCredentials("test-token"),
        apiUrl: "https://api.example.test",
        fetch: async (url, options) => {
          const json = { headers: { "content-type": "application/json" } };
          if (options.method === "GET")
            return String(url).includes("/old.md")
              ? new Response('{"sha":"abc123"}', { status: 200, ...json })
              : new Response('{"message":"Not Found"}', {
                  status: 404,
                  ...json,
                });
          puts.push({ url: String(url), body: JSON.parse(options.body) });
          return new Response("{}", { status: 200, ...json });
        },
      }),
    );
  const file = { branch: "b", message: "m", content: "eA==" };
  await github.putFile("example/code", { path: "old.md", ...file });
  await github.putFile("example/code", { path: "new.md", ...file });
  assert.equal(puts[0].body.sha, "abc123");
  assert.equal("sha" in puts[1].body, false);
});

test("commitFiles makes one commit with every file on the expected head", async () => {
  const posts = [],
    github = defaultJob(
      "spec-branch",
      new GitHubClient({
        credentials: fixedCredentials("test-token"),
        apiUrl: "https://api.example.test",
        fetch: async (url, options) => {
          posts.push({ url: String(url), body: JSON.parse(options.body) });
          return new Response(
            '{"data":{"createCommitOnBranch":{"commit":{"oid":"c1"}}}}',
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
      }),
    );
  const oid = await github.commitFiles("example/code", {
    branch: "b",
    message: "Approve spec s",
    expectedHeadOid: "h0",
    files: { "a.md": "eA==", "b.md": "eQ==" },
  });
  assert.equal(oid, "c1");
  assert.equal(posts.length, 1);
  assert.match(posts[0].url, /\/graphql$/);
  const input = posts[0].body.variables.input;
  assert.deepEqual(input.branch, {
    repositoryNameWithOwner: "example/code",
    branchName: "b",
  });
  assert.equal(input.expectedHeadOid, "h0");
  assert.deepEqual(input.fileChanges.additions, [
    { path: "a.md", contents: "eA==" },
    { path: "b.md", contents: "eQ==" },
  ]);
});
