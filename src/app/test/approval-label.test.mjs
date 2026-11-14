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

test("the default is avoozl:plan-approved, in both modes, for worker and radar repositories", () => {
  for (const mode of MODES)
    for (const coder of [undefined, "worker", "issue-radar"])
      assert.equal(
        repo(mode, { coder }).radar.approvalLabel,
        "avoozl:plan-approved",
      );
  // A worker repository with no radar block, and with an empty one.
  assert.equal(repo("plans-repo").radar.approvalLabel, "avoozl:plan-approved");
  assert.equal(
    repo("plans-repo", { radar: {} }).radar.approvalLabel,
    "avoozl:plan-approved",
  );
});

test("the approval label is configurable per repository", () => {
  const entry = repo("single-repo", { radar: { approvalLabel: "lgtm plan" } });
  assert.equal(entry.radar.approvalLabel, "lgtm plan");
  assert.equal(entry.radar.planLabel, "avoozl:plan");
});

test("empty, blank and non-string names are refused", () => {
  for (const approvalLabel of ["", "   ", 4, null, true])
    assert.throws(
      () => repo("single-repo", { radar: { approvalLabel } }),
      /radar\.approvalLabel/,
    );
});

const OTHERS = {
  planning: (name) => ({ radar: { planLabel: name } }),
  "needs-human": (name) => ({ crewLabels: { needsHuman: name } }),
  claim: (name) => ({ crewLabels: { claim: name } }),
  ready: (name) => ({ managedLabels: { ready: name } }),
  conflict: (name) => ({ radar: { conflictLabel: name } }),
};

test("a name equal to any other label is refused, naming both, in both modes, ignoring case", () => {
  for (const mode of MODES)
    for (const [role, set] of Object.entries(OTHERS)) {
      const input = set("Same Name");
      input.radar = { ...input.radar, approvalLabel: "same name" };
      assert.throws(
        () => repo(mode, input),
        (error) =>
          error.message.includes("approval") &&
          error.message.includes(role) &&
          /different name/.test(error.message),
        `${mode} ${role}`,
      );
    }
});

test("another label set to the approval default clashes with it", () => {
  assert.throws(
    () => repo("plans-repo", { radar: { planLabel: "avoozl:plan-approved" } }),
    /approval.*planning|planning.*approval/,
  );
  assert.throws(
    () =>
      repo("single-repo", { crewLabels: { claim: "Avoozl:Plan-Approved" } }),
    /approval.*claim|claim.*approval/,
  );
});

test("distinct names pass, including a shared prefix", () => {
  assert.doesNotThrow(() =>
    repo("single-repo", { radar: { approvalLabel: "ready to approve" } }),
  );
});
