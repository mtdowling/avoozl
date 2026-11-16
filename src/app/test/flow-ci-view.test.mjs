import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ciClassGlobs, ciFlowView } from "../flow-ci-view.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

test("CI view splits stored class minutes and aggregates repeated commits per workflow", (t) => {
  const { store } = fixture(t),
    now = Date.parse("2026-11-15T12:00:00Z"),
    iso = (minutes) => new Date(now - minutes * 60000).toISOString(),
    repository = "example/code";
  store.put("github_repositories", { id: repository, projectId: "code" });
  for (const [number, taskId, classes] of [
    [1, "task-1", ["code"]],
    [2, null, ["docs"]],
  ])
    store.put("pr_ci", {
      id: String(number),
      repository,
      number,
      taskId,
      classes,
      createdAt: iso(60),
      closedAt: iso(10),
      waitMs: 15 * 60000,
    });
  for (const [runId, prNumber, headSha, jobMs] of [
    [1, 1, "a", 60000],
    [2, 1, "a", 120000],
    [3, 2, "b", 180000],
    [4, 2, "b", 240000],
    [5, 2, "b", 300000],
  ])
    store.put("ci_runs", {
      id: String(runId),
      repository,
      runId,
      prNumber,
      workflow: ".github/workflows/check.yml",
      headSha,
      event: "push",
      startedAt: iso(20),
      jobMs,
    });
  const {
    repositories: [row],
  } = ciFlowView(
    store,
    {
      flow: { ci: { waitShare: 0.4 } },
      projects: { code: { flow: { ci: { windowDays: 3, waitShare: 0.6 } } } },
    },
    { mode: "single-repo", repositories: { [repository]: {} } },
    {},
    { now },
  );
  assert.equal(row.windowDays, 3);
  assert.equal(row.waitLimit, 0.6);
  assert.equal(row.waitShare, 0.3);
  assert.equal(row.closedPullRequests, 2);
  assert.deepEqual(row.byClass.code, {
    task: { minutes: 3, pullRequests: 1 },
    other: { minutes: 0, pullRequests: 0 },
  });
  assert.deepEqual(row.byClass.docs, {
    task: { minutes: 0, pullRequests: 0 },
    other: { minutes: 12, pullRequests: 1 },
  });
  assert.deepEqual(row.repeats, [
    {
      workflow: ".github/workflows/check.yml",
      commits: 2,
      extraRuns: 3,
      extraMinutes: 11,
    },
  ]);
  assert.equal("pulls" in row, false);
  assert.deepEqual(
    ciFlowView(
      store,
      {},
      { mode: "single-repo", repositories: { [repository]: {} } },
      { repository: "example/elsewhere" },
    ).repositories,
    [],
  );
});

test("flow.view with no GitHub repository reads no GitHub data and exposes no old CI repository", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, {
      workspaceRoot: root,
      github: new Proxy(
        {},
        {
          get: () => () => {
            throw Error("A view must not read GitHub");
          },
        },
      ),
    });
  store.put("pr_ci", {
    id: "old",
    repository: "example/removed",
    number: 1,
    classes: ["docs"],
  });
  const before = store.list("pr_ci");
  assert.deepEqual((await ops.execute("flow.view")).ci, { repositories: [] });
  assert.deepEqual(store.list("pr_ci"), before);
  assert.equal(store.getMeta("flow.ci.config"), null);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      flow: { ci: { waitShare: 0.65, classes: { docs: ["guides/"] } } },
    }),
  );
  const settings = await ops.execute("flow.settings.get");
  assert.deepEqual(settings.ciClassGlobs.docs, ["guides/"]);
  assert.deepEqual(settings.ciClassGlobs.ci, [
    ".github/",
    ".gitlab-ci.yml",
    ".circleci/",
  ]);
  assert.equal(settings.ciEffective.waitShare, 0.65);
  assert.equal(store.getMeta("flow.ci.config"), null);
});

test("read-only class globs preserve effective overrides and matching order", () => {
  const globs = ciClassGlobs({
    flow: { ci: { classes: { docs: ["guides/"] } } },
  });
  assert.deepEqual(Object.keys(globs), [
    "ci",
    "spec",
    "tests",
    "docs",
    "other",
  ]);
  assert.deepEqual(globs.docs, ["guides/"]);
});
