import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const postMainTables = [
  "github_repositories",
  "github_issues",
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
    repositoryId: "code",
    private: true,
  });
  store.put("github_issues", {
    id: "ISSUE_node",
    repository: "example/private",
    number: 17,
    bodyHash: "body-hash",
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
  assert.equal(
    store.get("evidence", "evidence-migrated").commit,
    "1234567890abcdef",
  );
  assert.equal(store.get("github_issues", "ISSUE_node").number, 17);
  assert.equal(store.get("review_threads", "review-migrated").state, "open");
  store.close();
});

test("opening a store drops stored ideas and keeps other incoming items (RC30.3)", () => {
  const database = path.join(
    temporaryDirectory("avoozl-ideas-"),
    "store.sqlite",
  );
  let store = new Store(database);
  store.put("incoming_items", {
    id: "i",
    source: "local",
    record: { kind: "idea" },
  });
  store.put("incoming_items", {
    id: "t",
    source: "tickets",
    record: { kind: "ticket" },
  });
  store.close();
  store = new Store(database);
  assert.deepEqual(
    store.list("incoming_items").map((row) => row.id),
    ["t"],
  );
  store.close();
});

// Tables nothing writes to any more: runs, teams, the safety gate, execution
// jobs, and the GitHub queue and intake.
const DROPPED = [
  "runs",
  "run_capabilities",
  "surface_capabilities",
  "provider_events",
  "usage_counters",
  "usage_samples",
  "deliveries",
  "requests",
  "execution_targets",
  "execution_jobs",
  "team_checkpoints",
  "review_requests",
  "safety_incidents",
  "safety_permits",
  "safety_submissions",
  "github_intake_capabilities",
  "github_intake_generations",
  "github_intake_deliveries",
  "github_queue_repositories",
  "github_queue_items",
  "github_queue_associations",
];

test("opening an older database drops the tables nothing writes to and keeps the rest", () => {
  const database = path.join(
      temporaryDirectory("avoozl-dropped-"),
      "store.sqlite",
    ),
    tables = (store) =>
      new Set(
        store.db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
          .map((row) => row.name),
      );
  let store = new Store(database);
  store.importSnapshot(snapshot());
  store.put("plans", { id: "kept", title: "Kept" });
  for (const name of DROPPED)
    store.db.exec(`CREATE TABLE ${name}(id TEXT PRIMARY KEY, body TEXT)`);
  store.db.exec("INSERT INTO runs VALUES ('run-old', '{}')");
  store.setMeta("runArchive:run-old", "2026-01-01T00:00:00Z");
  store.setMeta("kept", true);
  store.close();

  store = new Store(database);
  const present = tables(store);
  for (const name of DROPPED) assert.ok(!present.has(name), name);
  assert.equal(store.get("plans", "kept").title, "Kept");
  assert.equal(store.getMeta("runArchive:run-old"), null);
  assert.equal(store.getMeta("kept"), true);
  assert.equal(store.read().tasks.length > 0, true);
  store.close();

  // A second open has nothing to drop and still opens.
  store = new Store(database);
  assert.equal(store.get("plans", "kept").title, "Kept");
  store.close();
});

test("a new database never creates the dropped tables", () => {
  const store = new Store(":memory:"),
    present = new Set(
      store.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row) => row.name),
    );
  for (const name of DROPPED) assert.ok(!present.has(name), name);
  store.close();
});

test("an older database's projects become repositories once, with no old name left", () => {
  const root = temporaryDirectory("avoozl-repositories-"),
    database = path.join(root, "older.sqlite");
  // The older shape: a `projects` table, a `project_id` lock column, and
  // `projectId` fields and `project.*` events in stored rows.
  let store = new Store(database);
  store.importSnapshot(snapshot());
  store.mutate("Name the task's repository", (data) => {
    data.tasks[0].projectId = "app";
  });
  store.db.exec(`
    ALTER TABLE repositories RENAME TO projects;
    ALTER TABLE work_locks RENAME COLUMN repository_id TO project_id;
  `);
  store.db
    .prepare("INSERT INTO projects VALUES (?,?)")
    .run(
      "app",
      JSON.stringify({ id: "app", root: "/src/app", repository: "o/app" }),
    );
  store.db
    .prepare("INSERT INTO work_locks VALUES (?,?,?,?,?)")
    .run("checks:app", "app", "checks", 1, "token");
  for (const [table, body] of [
    ["github_repositories", { id: "o/app", projectId: "app" }],
    ["landing_queue", { id: "q", projectId: "app", base: "main" }],
    ["flow_stops", { id: "s", projectId: "app", by: { projectId: "app" } }],
  ])
    store.db
      .prepare(`INSERT INTO ${table} VALUES (?,?)`)
      .run(body.id, JSON.stringify(body));
  store.event(null, "project.removed", { projectId: "app" });
  store.setMeta("context", { projectId: "app" });
  store.close();

  store = new Store(database);
  const tables = store.db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='table'")
    .all();
  assert.ok(tables.some((row) => row.name === "repositories"));
  for (const row of tables) assert.doesNotMatch(row.sql, /project/i, row.name);
  assert.deepEqual(store.get("repositories", "app"), {
    id: "app",
    root: "/src/app",
    github: "o/app",
  });
  assert.equal(
    store.db.prepare("SELECT repository_id FROM work_locks").get()
      .repository_id,
    "app",
  );
  assert.equal(store.read().tasks[0].repositoryId, "app");
  assert.equal(store.get("github_repositories", "o/app").repositoryId, "app");
  assert.deepEqual(store.getMeta("context"), { repositoryId: "app" });
  assert.deepEqual(
    store
      .events()
      .filter((event) => event.repositoryId === "app")
      .map((event) => event.kind),
    ["repository.removed"],
  );
  // No stored row keeps the old names.
  for (const { name } of tables) {
    const rows = store.db.prepare(`SELECT * FROM "${name}"`).all();
    assert.doesNotMatch(JSON.stringify(rows), /projectId|"project\./, name);
  }
  store.close();

  // A second open has nothing to rename and keeps the rows.
  store = new Store(database);
  assert.equal(store.get("repositories", "app").github, "o/app");
  store.close();
});
