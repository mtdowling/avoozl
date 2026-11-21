import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { prepareTaskWorktree, repositoryConfig } from "../git.ts";
import { specBase } from "../../specs/spec-base.ts";
import { changedPaths } from "../../delivery/verify.ts";
import { syncBase } from "../../landing/pr-landing.ts";
import { fixture } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
const hasRef = (root: string, ref: string) => {
  try {
    git(root, "rev-parse", "--verify", "--quiet", ref);
    return true;
  } catch {
    return false;
  }
};

// A bare remote with main and core-dev, and a clone of it that has only
// origin/core-dev: no local core-dev branch, as a checkout that never
// switched to it.
function cloneWithRemoteOnlyBase() {
  const bare = path.join(temporaryDirectory("avoozl-remote-"), "origin.git"),
    seed = temporaryDirectory("avoozl-seed-"),
    clone = path.join(temporaryDirectory("avoozl-clone-"), "nupp");
  git(seed, "init", "--initial-branch=main");
  git(seed, "config", "user.name", "Test");
  git(seed, "config", "user.email", "test@example.invalid");
  git(seed, "commit", "--allow-empty", "-m", "Start");
  git(seed, "branch", "core-dev");
  git(seed, "switch", "core-dev");
  git(seed, "commit", "--allow-empty", "-m", "Core work");
  const coreDev = git(seed, "rev-parse", "HEAD");
  git(seed, "init", "--bare", bare);
  git(seed, "push", "--quiet", bare, "main", "core-dev");
  git(path.dirname(clone), "clone", "--quiet", "--branch", "main", bare, clone);
  git(clone, "config", "user.name", "Test");
  git(clone, "config", "user.email", "test@example.invalid");
  return { clone, coreDev };
}

test("a base branch that exists only as origin/<branch> is a repository's base", async (t) => {
  const { clone, coreDev } = cloneWithRemoteOnlyBase();
  assert.equal(hasRef(clone, "refs/heads/core-dev"), false);
  const repository = await repositoryConfig({
    id: "nupp",
    root: clone,
    baseBranch: "core-dev",
  });
  assert.equal(repository.baseBranch, "core-dev");
  // The base resolves the same way for the spec base, the path diff and a
  // task worktree, and none of them makes a local core-dev.
  assert.deepEqual(await specBase(clone, { base: "core-dev" }), {
    branch: "core-dev",
    kind: "base",
    commit: coreDev,
  });
  assert.equal((await changedPaths(clone, "core-dev", coreDev)).base, coreDev);
  const { store } = fixture(t);
  store.put("repositories", repository);
  const prepared = await prepareTaskWorktree(store, repository, {
    branch: "avoozl/t1",
    name: "avoozl-t1",
  });
  assert.equal(prepared.head, coreDev);
  assert.deepEqual(prepared.started, { branch: "core-dev", commit: coreDev });
  assert.equal(hasRef(clone, "refs/heads/core-dev"), false);
  // The task branch does not track origin's core-dev.
  assert.throws(() => git(clone, "config", "branch.avoozl/t1.remote"));
  // Pull request landing reads origin's base and still keeps no local copy.
  assert.equal(await syncBase(repository), coreDev);
  assert.equal(hasRef(clone, "refs/heads/core-dev"), false);
});

test("a base branch in neither place is refused naming both refs", async () => {
  const { clone } = cloneWithRemoteOnlyBase();
  await assert.rejects(
    repositoryConfig({ id: "nupp", root: clone, baseBranch: "missing" }),
    (error: Error) =>
      error.message.includes("refs/heads/missing") &&
      error.message.includes("refs/remotes/origin/missing"),
  );
});
