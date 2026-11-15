// putFile replaces a file that exists on the branch by naming its sha. Found
// in the live run of Proof 24: approving a spec whose files were already
// committed (every private spec on the plans branch) failed with
// `"sha" wasn't supplied`.
import assert from "node:assert/strict";
import test from "node:test";
import { GitHubClient } from "../github.mjs";

function client(existing) {
  const requests = [],
    github = new GitHubClient({
      token: "test-token",
      apiUrl: "https://api.example.test",
      fetch: async (url, options) => {
        const parsed = new URL(url);
        requests.push({
          method: options.method,
          path: parsed.pathname,
          ref: parsed.searchParams.get("ref"),
          body: options.body ? JSON.parse(options.body) : null,
        });
        if (options.method === "GET")
          return existing
            ? Response.json({ sha: existing })
            : Response.json({ message: "Not Found" }, { status: 404 });
        return Response.json({ content: {} }, { status: 201 });
      },
    });
  return { github, requests };
}

const file = {
  path: ".kiro/specs/s/tasks.md",
  branch: "avoozl/approve-s",
  message: "Approve spec s",
  content: "eA==",
};

test("putFile names the sha of a file that exists on the branch", async () => {
  const { github, requests } = client("abc123");
  await github.putFile("example/code", file);
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].ref, "avoozl/approve-s");
  assert.equal(requests[1].method, "PUT");
  assert.equal(requests[1].body.sha, "abc123");
  assert.equal(requests[1].body.branch, "avoozl/approve-s");
});

test("putFile creates a new file with no sha", async () => {
  const { github, requests } = client(null);
  await github.putFile("example/code", file);
  assert.equal(requests[1].method, "PUT");
  assert.equal("sha" in requests[1].body, false);
});
