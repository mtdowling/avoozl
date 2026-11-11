import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const postMainTables = [
  "run_capabilities",
  "provider_events",
  "surface_capabilities",
  "github_repositories",
  "github_issues",
  "github_queue_repositories",
  "github_queue_items",
  "github_queue_associations",
  "review_threads",
  "review_rounds",
];

test("same-database upgrade and SQLite backup preserve durable workspace history", () => {
  const root = temporaryDirectory("avoozl-migration-"),
    database = path.join(root, "legacy.sqlite"),
    backup = path.join(root, "backup.sqlite");
  let store = new Store(database);
  store.importSnapshot(snapshot());
  store.mutate("Accept migrated task", (data) => {
    const task = data.tasks[0];
    task.status = "accepted";
    task.acceptanceEvidence = {
      acceptedBy: "operator",
      at: "2026-11-09T10:00:00.000Z",
      evidence: "Validated against the recorded check.",
      derivedFrom: ["evidence-migrated"],
    };
    task.github = {
      repository: "example/private",
      nodeId: "ISSUE_node",
      number: 17,
      url: "https://github.com/example/private/issues/17",
      bodyHash: "body-hash",
      pullRequests: [
        {
          nodeId: "PR_node",
          number: 18,
          url: "https://github.com/example/private/pull/18",
        },
      ],
    };
    task.integration = {
      commit: "1234567890abcdef",
      repo: "example/private",
      branch: "main",
      at: "2026-11-09T09:00:00.000Z",
    };
  });
  store.put("plans", {
    id: "plan-migrated",
    title: "Migrated plan",
    prompt: "Preserve this plan",
    text: "# Migrated plan\n",
    hash: "plan-hash",
    revision: 2,
    state: "approved",
  });
  store.put("approvals", {
    id: "approval-migrated",
    planId: "plan-migrated",
    hash: "plan-hash",
    approvedBy: "operator",
    at: "2026-11-09T08:00:00.000Z",
    taskIds: ["sample-task"],
  });
  store.put("runs", {
    id: "run-migrated",
    taskId: "sample-task",
    provider: "openhands",
    providerSessionId: "conversation-migrated",
    state: "completed",
    expectedCommit: "1234567890abcdef",
    pullRequest: {
      nodeId: "PR_node",
      number: 18,
      url: "https://github.com/example/private/pull/18",
    },
  });
  store.put("evidence", {
    id: "evidence-migrated",
    taskId: "sample-task",
    kind: "command",
    argv: ["npm", "test"],
    exitCode: 0,
    commit: "1234567890abcdef",
  });
  store.put("integration", {
    id: "integration-migrated",
    taskId: "sample-task",
    state: "integrated",
    commit: "1234567890abcdef",
  });
  store.put("receipts", {
    id: "receipt-migrated",
    taskId: "sample-task",
    nodeId: "PR_node",
    number: 18,
    url: "https://github.com/example/private/pull/18",
  });

  // Model the schema at main before this branch added execution/UI support.
  for (const table of postMainTables)
    store.db.exec(`DROP TABLE IF EXISTS ${table}`);
  store.close();

  store = new Store(database);
  assert.equal(store.read().tasks[0].status, "accepted");
  assert.equal(
    store.read().tasks[0].acceptanceEvidence.derivedFrom[0],
    "evidence-migrated",
  );
  assert.equal(store.read().tasks[0].github.nodeId, "ISSUE_node");
  assert.equal(store.get("plans", "plan-migrated").revision, 2);
  assert.equal(store.get("approvals", "approval-migrated").hash, "plan-hash");
  assert.equal(
    store.get("runs", "run-migrated").providerSessionId,
    "conversation-migrated",
  );
  assert.equal(store.get("evidence", "evidence-migrated").exitCode, 0);
  assert.equal(
    store.get("integration", "integration-migrated").commit,
    "1234567890abcdef",
  );
  assert.equal(store.get("receipts", "receipt-migrated").nodeId, "PR_node");
  for (const table of postMainTables)
    assert.ok(
      store.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table),
      `${table} should be added during upgrade`,
    );

  store.put("github_repositories", {
    id: "example/private",
    projectId: "code",
    private: true,
  });
  store.put("github_issues", {
    id: "ISSUE_node",
    repository: "example/private",
    number: 17,
    bodyHash: "body-hash",
  });
  store.put("github_queue_associations", {
    id: "association-migrated",
    repository: "example/private",
    kind: "issue",
    nodeId: "ISSUE_node",
    number: 17,
    bodyHash: "body-hash",
    targetKind: "task",
    targetId: "sample-task",
    confirmedBy: "operator",
    confirmedAt: "2026-11-09T11:00:00.000Z",
    source: "operator-confirmed",
  });
  store.put("review_threads", {
    id: "review-migrated",
    planId: "plan-migrated",
    state: "open",
    comment: "Preserve review discussion.",
  });
  store.db.prepare("VACUUM INTO ?").run(backup);
  store.close();

  store = new Store(backup);
  assert.equal(store.read().tasks[0].acceptanceEvidence.acceptedBy, "operator");
  assert.equal(store.get("runs", "run-migrated").pullRequest.number, 18);
  assert.equal(
    store.get("evidence", "evidence-migrated").commit,
    "1234567890abcdef",
  );
  assert.equal(store.get("github_issues", "ISSUE_node").number, 17);
  assert.equal(
    store.get("github_queue_associations", "association-migrated").targetId,
    "sample-task",
  );
  assert.equal(store.get("review_threads", "review-migrated").state, "open");
  store.close();
});
