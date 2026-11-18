// Task 4.1 and 4.5: the Issue Radar crew labels in the policy, and priority
// order. The crew claim reconcile on task issues went with Who codes (R91.6).
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubPolicy, priorityRank } from "../github-policy.mjs";

const REPO = "example/code";

// --- 4.1 and policy ------------------------------------------------------

test("crew labels default to Issue Radar's own and stay configurable", () => {
  const base = { baseBranch: "main", managedLabels: { ready: "go" } },
    policy = normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: {
        [REPO]: base,
        "example/other": {
          ...base,
          crewLabels: { claim: "bot busy", needsHuman: "help wanted" },
        },
      },
    });
  assert.deepEqual(policy.repositories[REPO].crewLabels, {
    claim: "crew: in progress",
    needsHuman: "crew: needs human",
  });
  assert.deepEqual(policy.repositories["example/other"].crewLabels, {
    claim: "bot busy",
    needsHuman: "help wanted",
  });
  for (const crewLabels of [
    { claim: "same", needsHuman: "Same" },
    { claim: "go" },
    { unknown: "x" },
    { claim: "" },
  ])
    assert.throws(() =>
      normalizeGitHubPolicy({
        mode: "single-repo",
        repositories: { [REPO]: { ...base, crewLabels } },
      }),
    );
});

test("priority rank takes the best listed label, without case; others sort last", () => {
  const list = ["critical", "high"];
  assert.equal(priorityRank(list, [{ name: "High" }]), 1);
  assert.equal(priorityRank(list, ["high", "CRITICAL"]), 0);
  assert.equal(priorityRank(list, ["urgent"]), 2);
  assert.equal(priorityRank(list, []), 2);
  assert.equal(priorityRank(undefined, ["critical"]), 0);
  assert.equal(priorityRank("critical", ["critical"]), 0);
});
