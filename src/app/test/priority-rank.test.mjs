// Task 4.5: priority order from a repository's priority labels.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubPolicy, priorityRank } from "../github-policy.mjs";

const REPO = "example/code";

// --- 4.1 and policy ------------------------------------------------------

test("priority rank takes the best listed label, without case; others sort last", () => {
  const list = ["critical", "high"];
  assert.equal(priorityRank(list, [{ name: "High" }]), 1);
  assert.equal(priorityRank(list, ["high", "CRITICAL"]), 0);
  assert.equal(priorityRank(list, ["urgent"]), 2);
  assert.equal(priorityRank(list, []), 2);
  assert.equal(priorityRank(undefined, ["critical"]), 0);
  assert.equal(priorityRank("critical", ["critical"]), 0);
});
