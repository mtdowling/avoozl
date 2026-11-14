import assert from "node:assert/strict";
import test from "node:test";
import { CODERS, normalizeGitHubPolicy } from "../github-policy.mjs";

// rc-14.1: `coder` is issue-radar, worker or remote, per repository.
const repo = (mode, repository = {}) =>
  normalizeGitHubPolicy({
    mode,
    ...(mode === "plans-repo" ? { planningRepository: "example/plans" } : {}),
    repositories: { "example/app": { baseBranch: "main", ...repository } },
  }).repositories["example/app"];

test("each of the three values validates in both GitHub modes", () => {
  for (const mode of ["plans-repo", "single-repo"])
    for (const coder of ["issue-radar", "worker", "remote"])
      assert.equal(repo(mode, { coder }).coder, coder);
});

test("an unknown value is refused naming the allowed ones", () => {
  for (const mode of ["plans-repo", "single-repo"])
    for (const coder of ["", "Remote", "harness", 1])
      assert.throws(
        () => repo(mode, { coder }),
        /coder must be issue-radar, worker or remote/,
      );
});

test("a missing value keeps the mode default; two-value configs still load", () => {
  assert.equal(repo("plans-repo").coder, "worker");
  assert.equal(repo("single-repo").coder, "issue-radar");
  assert.equal(repo("single-repo", { coder: null }).coder, "issue-radar");
  assert.equal(repo("plans-repo", { coder: "worker" }).coder, "worker");
});

test("repositories choose their coder separately", () => {
  const { repositories } = normalizeGitHubPolicy({
    mode: "single-repo",
    repositories: {
      "example/a": { baseBranch: "main", coder: "remote" },
      "example/b": { baseBranch: "main", coder: "worker" },
      "example/c": { baseBranch: "main" },
    },
  });
  assert.deepEqual(
    ["a", "b", "c"].map((n) => repositories[`example/${n}`].coder),
    ["remote", "worker", "issue-radar"],
  );
});

test("one list holds the three values", () => {
  assert.deepEqual([...CODERS].sort(), ["issue-radar", "remote", "worker"]);
});
