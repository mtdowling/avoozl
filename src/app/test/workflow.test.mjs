import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canonical } from "../store/store.mjs";
import { Operations } from "../api/operations.mjs";
import { repositoryConfig, git, integrateRun } from "../git/git.mjs";
import {
  fixture,
  snapshot,
  markdown,
  recordedRun,
  validateRun,
} from "./fixtures.mjs";
import { flushOutbox } from "../store/outbox.mjs";

test("SQLite initialize round trips every record and unknown metadata", (t) => {
  const { store } = fixture(t);
  assert.equal(canonical(store.read()), canonical(snapshot()));
  assert.equal(
    store.db.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.equal(store.getMeta("mode"), "active");
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
  const repository = await repositoryConfig({
    id: "fixture",
    root: repo,
    checks: [[process.execPath, "check.mjs"]],
  });
  store.put("repositories", repository);
  const run = await recordedRun(store, {
    id: "run-fixture",
    repositoryId: "fixture",
  });
  assert.notEqual(run.worktree, repo);
  fs.writeFileSync(path.join(run.worktree, "result.txt"), "done");
  await git(run.worktree, ["add", "."]);
  await git(run.worktree, ["commit", "-m", "Complete fixture"]);
  const validation = await validateRun(store, run);
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
