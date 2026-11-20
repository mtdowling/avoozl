import {
  defaultJob,
  fixedCredentials,
} from "../../test/github-credentials.mjs";
// A login without push access cannot read collaborator permissions: its own
// role comes from the repository, and another login's reads as none.
import assert from "node:assert/strict";
import test from "node:test";
import { GitHubClient } from "../github.mjs";
import { landingRights, qualifiedRef } from "../../workers/working-heads.mjs";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// GitHub as a read-only `reader` sees it on acme/app, and as a writer on
// acme/app-fork.
function client(seen = []) {
  return defaultJob(
    "check-in",
    new GitHubClient({
      credentials: fixedCredentials("test-token", "reader"),
      fetch: async (url) => {
        const p = new URL(String(url)).pathname;
        seen.push(p);
        if (p === "/user") return json(200, { login: "reader" });
        if (p === "/repos/acme/app/collaborators/maintainer/permission")
          return json(403, {
            message: "Must have push access to view collaborator permission.",
          });
        if (p === "/repos/acme/app/collaborators/reader/permission")
          return json(403, {
            message: "Must have push access to view collaborator permission.",
          });
        if (p === "/repos/acme/app")
          return json(200, {
            full_name: "acme/app",
            permissions: {
              admin: false,
              maintain: false,
              push: false,
              triage: false,
              pull: true,
            },
          });
        if (p === "/repos/acme/app-fork/collaborators/reader/permission")
          return json(200, { permission: "write", role_name: "write" });
        return json(404, { message: "Not Found" });
      },
    }),
  );
}

test("the signed-in login's own role comes from the repository when GitHub refuses", async () => {
  const seen = [],
    github = client(seen);
  assert.equal(
    (await github.permission("acme/app", "reader")).permission,
    "read",
  );
  assert.ok(seen.includes("/repos/acme/app"));
  // A login GitHub lets read collaborators is answered as before.
  assert.equal(
    (await github.permission("acme/app-fork", "reader")).permission,
    "write",
  );
});

test("a refused lookup of another login reads as none and grants nothing", async () => {
  const github = client(),
    answer = await github.permission("acme/app", "maintainer");
  assert.equal(answer.permission, "none");
  assert.equal(answer.unknown, true);
  // The read-only driver may checkpoint to its fork but only observes a
  // merge into the target.
  const ref = qualifiedRef({
    source: {
      repository: "acme/app-fork",
      branch: "avoozl/x/work",
      commit: "a".repeat(40),
    },
    target: { repository: "acme/app", base: "main" },
  });
  assert.deepEqual(await landingRights(github, ref, "reader"), {
    checkpoint: true,
    land: "observe",
  });
});
