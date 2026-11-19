// merge.method: squash (the default) or merge, and nothing else.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
const REPO = "example/app";

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
