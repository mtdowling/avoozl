// landing.method: squash (the default) or merge, and nothing else. The older
// merge.method is refused.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
const REPO = "example/app";

test("landing.method defaults to squash and is refused when unknown", () => {
  const entry = (extra) =>
    normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: { [REPO]: { baseBranch: "main", ...extra } },
    }).repositories[REPO];
  assert.equal(entry({}).landing.method, "squash");
  assert.equal(entry({ landing: { method: "merge" } }).landing.method, "merge");
  assert.throws(
    () => entry({ landing: { method: "rebase" } }),
    /landing\.method must be squash or merge/,
  );
  assert.throws(() => entry({ merge: { method: "merge" } }), /merge/);
});
