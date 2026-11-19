// Avoozl never commits or lands its own `.avoozl/` files from a task
// worktree, even in a repository whose .gitignore does not name them (§4.28).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture, recordedRun, validateRun } from "./fixtures.mjs";
import { Operations } from "../api/operations.mjs";
import { git, commitWorkerChanges, integrateRun } from "../git/git.mjs";

async function repository(t) {
  const { store, root } = fixture(t),
    repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "Fixture"]);
  await git(repo, ["config", "user.email", "fixture@example.invalid"]);
  fs.writeFileSync(path.join(repo, "check.mjs"), "process.exit(0)");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Prepare fixture"]);
  assert.equal(fs.existsSync(path.join(repo, ".gitignore")), false);
  await new Operations(store).execute("repository.configure", {
    id: "fixture",
    root: repo,
    checks: [[process.execPath, "check.mjs"]],
  });
  const run = await recordedRun(store, {
    repositoryId: "fixture",
    taskId: "sample-task",
    id: "run-worker",
  });
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(run.worktree, file)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(run.worktree, file), text);
  };
  const finish = async () => {
    const validation = await validateRun(store, run);
    assert.equal(validation.passed, true);
    return validation;
  };
  return { store, repo, run, write, finish };
}

const result = JSON.stringify({ state: "done", text: "Done." });

test("a worker commit leaves out .avoozl/ files the repository does not ignore", async (t) => {
  const { store, repo, run, write, finish } = await repository(t);
  write("work.txt", "work");
  write(".avoozl/result.json", result);
  write("sub/.avoozl/notes.json", "{}");
  write(".avoozl/forced.json", "{}");
  // Staged by the worker itself, past any .gitignore.
  await git(run.worktree, ["add", "-f", ".avoozl/forced.json"]);
  const commit = await commitWorkerChanges(run.worktree, "Work");
  assert.ok(commit);
  assert.deepEqual(
    (await git(run.worktree, ["show", "--name-only", "--format=", commit]))
      .split("\n")
      .filter(Boolean),
    ["work.txt"],
  );
  // The result file stays on disk for the supervisor, and does not block
  // validation or landing.
  assert.equal(
    fs.readFileSync(path.join(run.worktree, ".avoozl/result.json"), "utf8"),
    result,
  );
  const validation = await finish();
  const entry = await integrateRun(store, {
    id: run.id,
    expectedCommit: validation.commit,
  });
  assert.equal(entry.state, "integrated");
  assert.equal(fs.existsSync(run.worktree), false);
  assert.equal(
    await git(repo, ["ls-tree", "-r", "--name-only", "main"]),
    "check.mjs\nwork.txt",
  );
});

test("nothing but .avoozl/ files makes no commit", async (t) => {
  const { run, write } = await repository(t);
  const head = await git(run.worktree, ["rev-parse", "HEAD"]);
  write(".avoozl/result.json", result);
  assert.equal(await commitWorkerChanges(run.worktree, "Work"), null);
  assert.equal(await git(run.worktree, ["rev-parse", "HEAD"]), head);
});

test("landing refuses a worker commit that holds .avoozl/result.json", async (t) => {
  const { store, repo, run, write, finish } = await repository(t);
  const base = await git(repo, ["rev-parse", "main"]);
  write(".avoozl/result.json", result);
  await git(run.worktree, ["add", "-f", ".avoozl/result.json"]);
  await git(run.worktree, ["commit", "-q", "-m", "Commit the result"]);
  // Removing it in a later commit still leaves it in the branch's history.
  await git(run.worktree, ["rm", "-q", ".avoozl/result.json"]);
  write("work.txt", "work");
  await git(run.worktree, ["add", "work.txt"]);
  await git(run.worktree, ["commit", "-q", "-m", "Work"]);
  const validation = await finish();
  await assert.rejects(
    integrateRun(store, { id: run.id, expectedCommit: validation.commit }),
    (error) =>
      error.status === 409 &&
      /Worker commits hold Avoozl's own files \(\.avoozl\/result\.json\); Avoozl never lands a path under \.avoozl\//.test(
        error.message,
      ),
  );
  assert.equal(await git(repo, ["rev-parse", "main"]), base);
  assert.equal(store.get("integration", run.id).state, "ready");
});
