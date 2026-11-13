import assert from "node:assert/strict";
import test from "node:test";
import { inspectGitHubTaskCompletion } from "../github-completion.mjs";

function fixture(overrides = {}) {
  const issue = {
      state: "closed",
      state_reason: "completed",
      html_url: "https://example.test/example/code/issues/7",
      ...overrides.issue,
    },
    pull = {
      id: "pull-node",
      number: 12,
      url: "https://example.test/example/code/pull/12",
      state: "MERGED",
      merged: true,
      mergedAt: "2026-11-11T18:00:00Z",
      headRefOid: "a".repeat(40),
      baseRefName: "main",
      repository: { nameWithOwner: "example/code" },
      ...overrides.pull,
    },
    github = {
      issue: async () => issue,
      closingPullRequests: async () => overrides.pulls || [pull],
      checkRuns: async () =>
        overrides.checkRuns || [
          { id: 1, name: "build", status: "completed", conclusion: "success" },
        ],
      commitStatus: async () => ({
        statuses: overrides.statuses || [
          { id: 2, context: "test", state: "success" },
        ],
      }),
    },
    task = { github: { repository: "example/code", number: 7 } };
  return { github, task, pull };
}

test("GitHub completion binds one merged pull request and exact checks", async () => {
  const { github, task } = fixture(),
    result = await inspectGitHubTaskCompletion(github, task, {
      baseBranch: "main",
      requiredChecks: ["build", "test"],
    });
  assert.equal(result.completed, true);
  assert.equal(result.pullRequestNumber, 12);
  assert.equal(result.headSha, "a".repeat(40));
  assert.deepEqual(
    result.checks.map((check) => [check.name, check.state, check.source]),
    [
      ["build", "success", "check-run"],
      ["test", "success", "commit-status"],
    ],
  );
});

test("GitHub completion rejects manual closure and missing checks", async () => {
  const manual = fixture({ issue: { state_reason: "not_planned" } });
  assert.match(
    (
      await inspectGitHubTaskCompletion(manual.github, manual.task, {
        requiredChecks: [],
      })
    ).reason,
    /did not close as completed/,
  );

  const missing = fixture({ checkRuns: [], statuses: [] }),
    result = await inspectGitHubTaskCompletion(missing.github, missing.task, {
      requiredChecks: ["build"],
    });
  assert.equal(result.completed, false);
  assert.equal(result.checks[0].state, "missing");
});

test("GitHub completion reports multiple closing pull requests as conflict", async () => {
  const { github, task, pull } = fixture({
      pulls: [
        {
          number: 12,
          url: "https://example.test/example/code/pull/12",
        },
        {
          number: 13,
          url: "https://example.test/example/code/pull/13",
        },
      ],
    }),
    result = await inspectGitHubTaskCompletion(github, task, {
      requiredChecks: [],
    });
  assert.equal(pull.number, 12);
  assert.equal(result.completed, false);
  assert.equal(result.conflict, true);
  assert.equal(result.pullRequests.length, 2);
});

test("GitHub completion rejects another base branch", async () => {
  const { github, task } = fixture({ pull: { baseRefName: "release" } }),
    result = await inspectGitHubTaskCompletion(github, task, {
      baseBranch: "main",
      requiredChecks: [],
    });
  assert.equal(result.completed, false);
  assert.equal(result.conflict, true);
  assert.match(result.reason, /release, not main/);
});
