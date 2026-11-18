// RC28.7: merge.method picks how Avoozl arms auto-merge on crew pull requests,
// squash (the default) or merge, and a method the repository refuses arms
// nothing and opens one Needs you row. Set up and Adopt read the repository's
// allowed methods. Fake GitHub only.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { radarSetup } from "../radar-setup.mjs";
import { REPO } from "./radar-coder-merge-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

test("merge.method defaults to squash and is refused when unknown", () => {
  const entry = (merge) =>
    normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: {
        [REPO]: { baseBranch: "main", ...(merge ? { merge } : {}) },
      },
    }).repositories[REPO];
  assert.deepEqual(entry().merge, { method: "squash" });
  assert.deepEqual(entry({ method: "merge" }).merge, { method: "merge" });
  assert.throws(
    () => entry({ method: "rebase" }),
    /merge\.method must be squash or merge/,
  );
});

test("Set up refuses a method the repository does not allow and names the setting", async () => {
  const github = (allows) => ({
    available: () => true,
    repository: () =>
      Promise.resolve({
        default_branch: "main",
        allow_auto_merge: true,
        permissions: { admin: true, push: true },
        ...allows,
      }),
    listLabels: () => Promise.resolve([]),
    request: () => Promise.resolve({ object: { sha: "x" } }),
    branchRules: () => Promise.resolve([]),
    branch: () => Promise.resolve({ protected: false }),
    branchProtection: () => Promise.resolve(null),
    listCommits: () => Promise.resolve([]),
    checkRuns: () => Promise.resolve([]),
    commitStatus: () => Promise.resolve({ statuses: [] }),
    listPullRequests: () => Promise.resolve([]),
  });
  const step = async (allows, merge) =>
    (
      await radarSetup(github(allows), REPO, {
        baseBranch: "main",
        requiredChecks: ["build"],
        ...(merge ? { merge } : {}),
      })
    ).steps.find((entry) => entry.id === "merge-method");
  assert.equal((await step({})).status, "ok");
  const squash = await step({ allow_squash_merge: false });
  assert.equal(squash.status, "input");
  assert.match(squash.detail, /Allow squash merging/);
  const merge = await step({ allow_merge_commit: false }, { method: "merge" });
  assert.equal(merge.status, "input");
  assert.match(merge.detail, /Allow merge commits/);
});
