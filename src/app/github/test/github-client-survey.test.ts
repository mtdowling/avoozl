import { defaultJob, fixedCredentials } from "../../test/github-credentials.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { GitHubClient } from "../github.ts";

// A client whose fetch answers each path from `routes` as
// [status, value, headers].
function client(
  routes: Record<string, [number, unknown, Record<string, string>]>,
  seen: string[] = [],
) {
  return defaultJob(
    "check-in",
    new GitHubClient({
      credentials: fixedCredentials("test-token"),
      apiUrl: "https://api.example.test",
      fetch: async (url) => {
        const u = new URL(url);
        seen.push(u.pathname + u.search);
        const found = Object.entries(routes).find(([path]) =>
          u.pathname.endsWith(path),
        );
        const [status, value, headers] = found?.[1] ?? [200, null, {}];
        return new Response(JSON.stringify(value), {
          status,
          headers: { "content-type": "application/json", ...headers },
        });
      },
    }),
  );
}

test("collaborator permission uses role_name for maintain and triage", async () => {
  const github = client({});
  // GitHub's `permission` field folds maintain into write and triage into
  // read; only `role_name` names the real role.
  github.fetch = async (url) => {
    const login = String(url).split("/collaborators/")[1].split("/")[0];
    const bodies: Record<string, unknown> = {
      maintainer: { permission: "write", role_name: "maintain" },
      triager: { permission: "read", role_name: "triage" },
      writer: { permission: "write", role_name: "write" },
      // A custom role names no built-in role: its base permission counts.
      custom: { permission: "write", role_name: "security-reviewer" },
      owner: { permission: "admin", role_name: "admin" },
    };
    return new Response(JSON.stringify(bodies[login]), { status: 200 });
  };
  const held = async (login: string) =>
    (await github.permission("example/code", login)).permission;
  assert.equal(await held("maintainer"), "maintain");
  assert.equal(await held("triager"), "triage");
  assert.equal(await held("writer"), "write");
  assert.equal(await held("custom"), "write");
  assert.equal(await held("owner"), "admin");
});

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
