import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GITHUB_LABEL_BEHAVIORS,
  normalizeGitHubLabelBehaviors,
  normalizedGitHubLabelStates,
  primaryGitHubLabelState,
} from "../github-label-behaviors.mjs";

test("GitHub label behavior defaults require no repository configuration", () => {
  assert.deepEqual(normalizeGitHubLabelBehaviors(), {
    ready: ["avoozl:ready"],
    blocked: ["avoozl:blocked"],
    review: ["avoozl:review"],
    quarantined: ["avoozl:quarantined"],
  });
  assert.equal(primaryGitHubLabelState(["bug", "avoozl:ready"]), "ready");
});

test("custom GitHub labels map case-insensitively to normalized states", () => {
  const behaviors = normalizeGitHubLabelBehaviors({
    ready: ["Queued"],
    blocked: ["Waiting"],
    review: ["Needs Review"],
    quarantined: ["Unsafe"],
  });
  assert.deepEqual(
    normalizedGitHubLabelStates(
      ["queued", "WAITING", "Needs Review", "Unsafe"],
      behaviors,
    ),
    ["quarantined", "blocked", "review", "ready"],
  );
});

test("unknown GitHub labels remain original and unclassified", () => {
  assert.equal(primaryGitHubLabelState(["bug", "customer"]), "unclassified");
  assert.deepEqual(
    normalizedGitHubLabelStates(
      ["bug", "customer"],
      DEFAULT_GITHUB_LABEL_BEHAVIORS,
    ),
    [],
  );
});
