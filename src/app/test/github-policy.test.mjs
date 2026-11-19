import assert from "node:assert/strict";
import test from "node:test";
import {
  actorAllowed,
  normalizeGitHubPolicy,
  requireDefaultBranch,
} from "../github-policy.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// No machine-wide Avoozl configuration leaks into these workspaces.
process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

// The example from design §4.4, with no name built in.
const example = () => ({
  mode: "plans-repo",
  planningRepository: "example/plans",
  epicIssueType: "Epic",
  repositories: {
    "example/app": {
      checkout: "../app",
      folder: "Avoozl/example-app",
      baseBranch: "main",
      allowedActors: ["maintainer-login"],
      minimumPermission: "maintain",
      requiredChecks: ["build", "test"],
      priorityLabels: ["critical", "high"],
      waitingLabels: ["needs-info"],
    },
  },
});

test("the design example validates and keeps every value", () => {
  const policy = normalizeGitHubPolicy(example()),
    app = policy.repositories["example/app"];
  assert.equal(policy.mode, "plans-repo");
  assert.equal("coder" in app, false);
  assert.deepEqual(app.priorityLabels, ["critical", "high"]);
  assert.deepEqual(app.waitingLabels, ["needs-info"]);
  assert.equal(app.minimumPermission, "maintain");
  assert.deepEqual(normalizeGitHubPolicy(undefined).repositories, {});
});

// Removed keys are refused by name: `concurrency` and `coder`, and the label
// commands and Issue Radar settings (triage-agent TA11.1, TA11.2).
test("a repository's removed key is refused by name", () => {
  for (const extra of [
    { concurrency: 2 },
    { coder: "worker" },
    { rules: [{ id: "go", action: "pause", labelsAll: ["go"] }] },
    { managedLabels: { ready: "agent:ready" } },
    { crewLabels: { needsHuman: "help" } },
    { radar: { planLabel: "plan" } },
    { release: { capacity: 1 } },
    { untriaged: { notify: true } },
    { acceptedLabel: "ok" },
  ])
    assert.throws(
      () =>
        normalizeGitHubPolicy({
          repositories: { "example/app": { baseBranch: "main", ...extra } },
        }),
      new RegExp(`Unknown setting .*${Object.keys(extra)[0]}`),
    );
});

test("validation refuses each §4.4 violation", () => {
  const app = (change) => {
    const value = example();
    change(value.repositories["example/app"], value);
    return value;
  };
  for (const [value, pattern] of [
    [{ ...example(), mode: "shared" }, /mode must be/],
    [
      { ...example(), planningRepository: undefined },
      /needs github.planningRepository/,
    ],
    [app((repo) => delete repo.baseBranch), /default branch/],
    [app((repo) => (repo.minimumPermission = "owner")), /must be one of/],
    [app((repo) => (repo.label = "agent:ready")), /Unknown setting/],
    // The base branch's own review rule replaced it.
    [
      app((repo) => (repo.pullRequestReviews = { approvals: 1 })),
      /Unknown setting .*pullRequestReviews/,
    ],
  ])
    assert.throws(() => normalizeGitHubPolicy(value), pattern);
});

test("actor checks need the listed actor and the minimum permission", () => {
  const both = { allowedActors: ["a"], minimumPermission: "write" };
  assert.equal(actorAllowed(both, "a", "write").allowed, true);
  assert.equal(actorAllowed(both, "A", "admin").allowed, true);
  assert.equal(actorAllowed(both, "a", "triage").allowed, false);
  assert.equal(actorAllowed(both, "b", "admin").allowed, false);
  assert.equal(
    actorAllowed({ minimumPermission: "triage" }, "b", "triage").allowed,
    true,
  );
  assert.equal(
    actorAllowed({ allowedActors: ["a"] }, "a", "read").allowed,
    true,
  );
  assert.equal(actorAllowed({}, "a", "admin").allowed, false);
  assert.equal(actorAllowed(both, "", "admin").allowed, false);
});

test("a base branch other than the default branch is refused", () => {
  const repository = { baseBranch: "main" };
  assert.throws(
    () =>
      requireDefaultBranch(
        repository,
        { default_branch: "trunk" },
        "example/code",
      ),
    /\.avoozl\.json github\.repositories\.example\/code\.baseBranch is main, but the default branch of example\/code is trunk\./,
  );
  requireDefaultBranch(repository, { default_branch: "main" }, "example/code");
});

test("a repository that names nobody defaults to write permission", () => {
  const policy = (entry) =>
    normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: { "example/app": { baseBranch: "main", ...entry } },
    }).repositories["example/app"];
  // Saving no longer fails for a missing People setting.
  assert.equal(policy({}).minimumPermission, "write");
  // Explicit settings win.
  assert.equal(
    policy({ minimumPermission: "maintain" }).minimumPermission,
    "maintain",
  );
  assert.equal(policy({ allowedActors: ["m"] }).minimumPermission, null);
  const fallback = policy({});
  assert.equal(actorAllowed(fallback, "w", "write").allowed, true);
  assert.equal(actorAllowed(fallback, "a", "admin").allowed, true);
  for (const held of ["read", "triage", "none", undefined]) {
    const check = actorAllowed(fallback, "r", held);
    assert.equal(check.allowed, false, String(held));
    assert.match(check.reason, /needs write permission/);
  }
});
