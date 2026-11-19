import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture, recordedRun, validateRun } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { git, createWorktree, integrateRun, withWorkLock } from "../git.mjs";

// A repository checkout, a validated run on sample-task, and a second run left
// working, recorded as the removed agent host left them. Validation passes while check.mjs exits 0; rewriting it to exit 1
// makes the revalidation after rebase fail at the moment of integration.
async function repository(t, { extraTask = "dependent-task" } = {}) {
  const { store, root } = fixture(t),
    repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "Fixture"]);
  await git(repo, ["config", "user.email", "fixture@example.invalid"]);
  const check = path.join(repo, "check.mjs");
  fs.writeFileSync(check, "process.exit(0)");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Prepare fixture"]);
  store.mutate("Add a second task", (data) => {
    data.tasks.push({
      ...data.tasks[0],
      id: extraTask,
      title: "Concurrent work",
    });
  });
  const ops = new Operations(store);
  await ops.execute("repository.configure", {
    id: "fixture",
    root: repo,
    checks: [[process.execPath, "check.mjs"]],
  });
  const commit = async (run, file, text) => {
    fs.writeFileSync(path.join(run.worktree, file), text);
    await git(run.worktree, ["add", "."]);
    await git(run.worktree, ["commit", "-m", "Work in " + run.id]);
  };
  const start = (input) =>
    recordedRun(store, { repositoryId: "fixture", ...input });
  return { store, repo, check, start, ops, commit };
}

test("run worktrees inherit the execution repository Git identity", async (t) => {
  const { store } = await repository(t);
  const worktree = await createWorktree(
    store,
    store.get("repositories", "fixture"),
    "run-identity",
  );
  assert.equal(
    await git(worktree.worktree, [
      "config",
      "--worktree",
      "--get",
      "user.name",
    ]),
    "Fixture",
  );
  assert.equal(
    await git(worktree.worktree, [
      "config",
      "--worktree",
      "--get",
      "user.email",
    ]),
    "fixture@example.invalid",
  );
});

test("integration lands while another run on the repository is still working", async (t) => {
  const { store, repo, start, commit } = await repository(t);
  const working = await start({
    id: "run-working",
    taskId: "dependent-task",
  });
  const landing = await start({
    id: "run-landing",
    taskId: "sample-task",
  });
  await commit(landing, "landing.txt", "landing");
  const validation = await validateRun(store, landing);
  assert.equal(validation.passed, true);
  // The base moves under the validated run before it integrates.
  fs.writeFileSync(path.join(repo, "moved.txt"), "base moved");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Move the base branch"]);
  const movedBase = await git(repo, ["rev-parse", "HEAD"]);
  const before = store.list("evidence").length;
  const entry = await integrateRun(store, {
    id: landing.id,
    expectedCommit: validation.commit,
  });
  // It landed, with the other run untouched and still working.
  assert.equal(entry.state, "integrated");
  assert.equal(fs.existsSync(working.worktree), true);
  assert.equal(
    fs.readFileSync(path.join(repo, "landing.txt"), "utf8"),
    "landing",
  );
  // It was rebased onto the moved base and revalidated there, not trusted.
  assert.notEqual(entry.integratedCommit, validation.commit);
  assert.equal(
    await git(repo, ["merge-base", "--is-ancestor", movedBase, "HEAD"]).then(
      () => true,
      () => false,
    ),
    true,
  );
  const revalidation = store
    .list("evidence")
    .filter((e) => e.phase === "integration" && e.runId === landing.id);
  assert.equal(store.list("evidence").length, before + revalidation.length);
  assert.equal(revalidation.length, 1);
  assert.equal(revalidation[0].commit, entry.integratedCommit);
  assert.equal(revalidation[0].exitCode, 0);
  assert.deepEqual(entry.revalidatedEvidenceIds, [revalidation[0].id]);
  // The moved base is reported.
  const moved = store
    .events({ limit: 1000 })
    .filter((e) => e.kind === "repository.base.moved");
  assert.equal(moved.length, 1);
  assert.equal(moved[0].commit, entry.integratedCommit);
});

test("revalidation failure after rebase refuses the merge and leaves the entry ready", async (t) => {
  const { store, repo, check, start, commit } = await repository(t);
  const run = await start({
    id: "run-stale",
    taskId: "sample-task",
  });
  await commit(run, "stale.txt", "stale");
  const validation = await validateRun(store, run);
  assert.equal(validation.passed, true);
  // The base moves and breaks the check this work was validated against.
  fs.writeFileSync(check, "process.exit(1)");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Break the acceptance check"]);
  const base = await git(repo, ["rev-parse", "HEAD"]);
  await assert.rejects(
    integrateRun(store, { id: run.id, expectedCommit: validation.commit }),
    (error) =>
      error.status === 409 && /did not pass acceptance checks/.test(error),
  );
  assert.equal(store.get("integration", run.id).state, "ready");
  assert.equal(store.get("integration", run.id).integratedCommit, undefined);
  assert.equal(await git(repo, ["rev-parse", "HEAD"]), base);
  assert.equal(fs.existsSync(path.join(repo, "stale.txt")), false);
  assert.equal(store.read().tasks[0].integration, undefined);
  assert.equal(
    store
      .events({ limit: 1000 })
      .some((e) => e.kind === "repository.base.moved"),
    false,
  );
});

test("the repository work lock still serializes integration against itself and validation", async (t) => {
  const { store, start, commit } = await repository(t);
  const run = await start({
    id: "run-locked",
    taskId: "sample-task",
  });
  await commit(run, "locked.txt", "locked");
  const validation = await validateRun(store, run);
  assert.equal(validation.passed, true);
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const integrating = withWorkLock(
    store,
    {
      id: "integration:fixture",
      repositoryId: "fixture",
      kind: "integration",
    },
    () => held,
  );
  // A second integration, a validation, and a new run's worktree all wait for
  // the lock rather than racing the merge.
  const contends = async (promise) =>
    await promise.then(
      () => null,
      (error) => error,
    );
  for (const attempt of [
    integrateRun(store, { id: run.id, expectedCommit: validation.commit }),
    validateRun(store, run),
    createWorktree(store, store.get("repositories", "fixture"), "run-racing"),
  ]) {
    const error = await contends(attempt);
    assert.equal(error?.status, 409);
    assert.equal(error.contention, true);
    assert.match(error.message, /already owns this work/);
  }
  release();
  await integrating;
  // With the lock clear, the same work integrates.
  const entry = await integrateRun(store, {
    id: run.id,
    expectedCommit: validation.commit,
  });
  assert.equal(entry.state, "integrated");
  // And an integration refuses while a validation holds the lock.
  const validating = withWorkLock(
    store,
    { id: "validation:other", repositoryId: "fixture", kind: "validation" },
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const refused = await contends(
    integrateRun(store, { id: run.id, expectedCommit: validation.commit }),
  );
  assert.equal(refused?.status, 409);
  assert.match(refused.message, /already owns this work/);
  release();
  await validating;
});
