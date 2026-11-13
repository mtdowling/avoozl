import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Store, canonical } from "../store.mjs";
import { Operations } from "../operations.mjs";
import { projectConfig, git, validateRun, integrateRun } from "../git.mjs";
import { fixture, snapshot, markdown, recordedRun } from "./fixtures.mjs";
import { flushOutbox } from "../outbox.mjs";

test("SQLite import round trips every legacy record and unknown metadata", (t) => {
  const { store } = fixture(t);
  assert.equal(canonical(store.read()), canonical(snapshot()));
  assert.equal(
    store.db.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  const imported = store.getMeta("import");
  assert.equal(imported.tasks, 1);
  assert.equal(store.getMeta("mode"), "shadow");
});
test("three-way final import preserves new tasks and upstream changes, rejects competing edits", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  await ops.execute("task.capture", {
    prompt: "New local work",
    submissionId: "unique-capture-id",
    context: { filters: { epic: "sample" } },
  });
  let incoming = snapshot();
  incoming.tasks[0].notes = "New upstream evidence";
  store.importSnapshot(incoming, { final: true });
  assert.equal(store.read().tasks.length, 2);
  assert.equal(store.read().tasks[0].notes, "New upstream evidence");
  await ops.execute("task.update", {
    id: "sample-task",
    title: "Shadow title",
  });
  incoming = structuredClone(incoming);
  incoming.tasks[0].title = "Upstream title";
  const before = canonical(store.read());
  assert.equal(
    store.importSnapshot(incoming, { dryRun: true }).conflicts.length,
    1,
  );
  assert.throws(
    () => store.importSnapshot(incoming, { final: true }),
    /Import conflicts/,
  );
  assert.equal(canonical(store.read()), before);
});
test("unapproved drafts never enter ready work; approved extraction is exact and retry-safe", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    initial = store.read().tasks.length;
  const plan = await ops.execute("plan.create", {
    prompt: "Build feature",
    text: markdown,
  });
  assert.equal(store.read().tasks.length, initial);
  const input = {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
    approvedBy: "User",
    evidence: "Implement this reviewed revision.",
  };
  const receipt = await ops.execute("plan.approve", input);
  assert.equal(receipt.taskIds.length, 2);
  assert.equal(store.read().tasks.length, initial + 2);
  assert.equal(
    (await ops.execute("queue")).ready.some(
      (t) => t.id === receipt.mapping.delivery,
    ),
    false,
  );
  assert.equal((await ops.execute("plan.approve", input)).existing, true);
  assert.equal(store.list("approvals").length, 1);
  assert.equal(
    store
      .read()
      .documents[`workspace/plans/${plan.id}.md`].text.includes("```task"),
    false,
  );
  assert.equal(store.get("approvals", receipt.id).source, markdown);
});
test("stale approvals and cyclic dependencies leave no partial tasks, receipt or outbox", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      prompt: "Bad graph",
      text: markdown.replace(
        '"track":"catalog"}',
        '"track":"catalog","requires":["delivery"]}',
      ),
    });
  const input = {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
    approvedBy: "User",
    evidence: "Test approval",
  };
  await assert.rejects(
    ops.execute("plan.approve", { ...input, expectedHash: "old" }),
    /hash changed/,
  );
  await assert.rejects(ops.execute("plan.approve", input), /cycle/);
  assert.equal(store.read().tasks.length, 1);
  assert.equal(store.list("approvals").length, 0);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM outbox").get().n, 0);
});
test("design amendments preserve status and evidence but flag tasks for reconciliation", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      prompt: "Feature",
      text: markdown,
    });
  const approval = await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
    approvedBy: "User",
    evidence: "Approved",
  });
  const id = approval.taskIds[0];
  await ops.execute("task.update", {
    id,
    status: "partial",
    notes: "Prior evidence",
  });
  const changed = await ops.execute("plan.save", {
    id: plan.id,
    expectedHash: plan.hash,
    text: markdown + "\nA new design constraint.\n",
  });
  assert.equal(changed.state, "draft");
  const task = store.read().tasks.find((t) => t.id === id);
  assert.equal(task.status, "partial");
  assert.equal(task.notes, "Prior evidence");
  assert.equal(task.needsReview, true);
  await assert.rejects(
    ops.execute("plan.save", {
      id: plan.id,
      expectedHash: plan.hash,
      text: "stale",
    }),
    /changed/,
  );
});
test("outbox projects recoverably without touching a conflicting source document", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store),
    plan = await ops.execute("plan.create", {
      prompt: "Feature",
      text: markdown,
    });
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
    approvedBy: "User",
    evidence: "Approved",
  });
  const docs = path.join(root, "docs");
  assert.equal(flushOutbox(store, docs)[0].state, "published");
  assert.equal(flushOutbox(store, docs).length, 0);
  const file = path.join(docs, "source.md");
  fs.writeFileSync(file, "External changes");
  store.db
    .prepare("INSERT INTO outbox(id,path,text,expected_hash) VALUES (?,?,?,?)")
    .run("conflict", "source.md", "New content", "oldhash");
  assert.equal(flushOutbox(store, docs)[0].state, "conflict");
  assert.equal(fs.readFileSync(file, "utf8"), "External changes");
});
test("optimistic task writes reject stale revisions and dependency cycles", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    rev = store.read().revision;
  await ops.execute(
    "task.update",
    { id: "sample-task", notes: "First writer" },
    rev,
  );
  await assert.rejects(
    ops.execute(
      "task.update",
      { id: "sample-task", notes: "Lost update" },
      rev,
    ),
    /changed/,
  );
  assert.equal(store.read().tasks[0].notes, "First writer");
  await assert.rejects(
    ops.execute("task.update", {
      id: "sample-task",
      requires: ["sample-task"],
    }),
    /Self edge/,
  );
});
test("real isolated Git work validates at its head, rebases and integrates without touching other trees", async (t) => {
  const { root, store } = fixture(t),
    repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "Fixture"]);
  await git(repo, ["config", "user.email", "fixture@example.invalid"]);
  fs.writeFileSync(
    path.join(repo, "check.mjs"),
    'import fs from "node:fs"; if(fs.readFileSync("result.txt","utf8")!=="done")process.exit(1);',
  );
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Add fixture check"]);
  const project = await projectConfig({
    id: "fixture",
    root: repo,
    checks: [[process.execPath, "check.mjs"]],
  });
  store.put("projects", project);
  // A run the removed agent host had started, as an old workspace holds it.
  const run = await recordedRun(store, {
    id: "run-fixture",
    projectId: "fixture",
    state: "running",
  });
  assert.notEqual(run.worktree, repo);
  fs.writeFileSync(path.join(run.worktree, "result.txt"), "done");
  await git(run.worktree, ["add", "."]);
  await git(run.worktree, ["commit", "-m", "Complete fixture"]);
  store.put("runs", { ...store.get("runs", run.id), state: "completed" });
  const validation = await validateRun(store, run.id);
  assert.equal(validation.passed, true);
  assert.equal(store.read().tasks[0].status, "implemented");
  // A concurrent main change is part of the normal integration path.
  fs.writeFileSync(path.join(repo, "another.txt"), "other work");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Add independent change"]);
  const entry = await integrateRun(store, {
    id: run.id,
    expectedCommit: validation.commit,
  });
  assert.equal(entry.state, "integrated");
  assert.equal(fs.readFileSync(path.join(repo, "result.txt"), "utf8"), "done");
  assert.equal(fs.existsSync(run.worktree), false);
  assert.equal(store.read().tasks[0].status, "implemented");
  assert.equal(
    store.read().tasks[0].integration.commit,
    await git(repo, ["rev-parse", "HEAD"]),
  );
});
test("independent validations can overlap while integration excludes validation and new claims", async (t) => {
  const { store } = fixture(t);
  const { withWorkLock, assertProjectAvailable } = await import("../git.mjs");
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const first = withWorkLock(
    store,
    { id: "validation:first", projectId: "fixture", kind: "validation" },
    () => pending,
  );
  await withWorkLock(
    store,
    { id: "validation:second", projectId: "fixture", kind: "validation" },
    async () => {},
  );
  await assert.rejects(
    withWorkLock(
      store,
      { id: "integration:fixture", projectId: "fixture", kind: "integration" },
      async () => {},
    ),
    /already owns/,
  );
  release();
  await first;
  await withWorkLock(
    store,
    { id: "integration:fixture", projectId: "fixture", kind: "integration" },
    async () => {
      assert.throws(
        () => assertProjectAvailable(store, "fixture"),
        /integrating/,
      );
      await assert.rejects(
        withWorkLock(
          store,
          { id: "validation:first", projectId: "fixture", kind: "validation" },
          async () => {},
        ),
        /already owns/,
      );
    },
  );
  assertProjectAvailable(store, "fixture");
});
