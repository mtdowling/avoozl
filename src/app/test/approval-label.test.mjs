import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubPolicy } from "../github-policy.mjs";

// rc-18.1: the per-repository approval label and its clash check (RC18.1).
const repo = (mode, repository = {}) =>
  normalizeGitHubPolicy({
    mode,
    ...(mode === "plans-repo" ? { planningRepository: "example/plans" } : {}),
    repositories: { "example/app": { baseBranch: "main", ...repository } },
  }).repositories["example/app"];
const MODES = ["plans-repo", "single-repo"];

test("another label set to the approval default clashes with it", () => {
  assert.throws(
    () => repo("plans-repo", { radar: { planLabel: "avoozl:plan-approved" } }),
    /approval.*planning|planning.*approval/,
  );
  assert.throws(
    () =>
      repo("single-repo", {
        crewLabels: { inProgress: "Avoozl:Plan-Approved" },
      }),
    /approval.*in-progress|in-progress.*approval/,
  );
});
