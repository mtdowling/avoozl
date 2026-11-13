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

test("collaborator permission uses role_name for maintain and triage", async () => {
  const github = client({});
  // GitHub's `permission` field folds maintain into write and triage into
  // read; only `role_name` names the real role.
  github.fetch = async (url) => {
    const login = String(url).split("/collaborators/")[1].split("/")[0];
    const body = {
      maintainer: { permission: "write", role_name: "maintain" },
      triager: { permission: "read", role_name: "triage" },
      writer: { permission: "write", role_name: "write" },
      // A custom role names no built-in role: its base permission counts.
      custom: { permission: "write", role_name: "security-reviewer" },
      owner: { permission: "admin", role_name: "admin" },
    }[login];
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const held = async (login) =>
    (await github.permission("example/code", login)).permission;
  assert.equal(await held("maintainer"), "maintain");
  assert.equal(await held("triager"), "triage");
  assert.equal(await held("writer"), "write");
  assert.equal(await held("custom"), "write");
  assert.equal(await held("owner"), "admin");
});
