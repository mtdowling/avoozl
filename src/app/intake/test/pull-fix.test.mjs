// A fix from a pull request (vm-harness vm-3.3, VM6.9): its task folder
// starts at the pull request's head, fetched by Avoozl on the host, and a
// stranger's pull request makes it stranger input that waits for Integrate.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { startFix } from "../fix.mjs";
import { deliveryWorkspace } from "../../test/delivery-fixture.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// A checkout whose origin is a bare remote holding refs/pull/7/head, one
// commit past main, as GitHub keeps it.
function withPull(t) {
  const w = deliveryWorkspace(t, { prefix: "avoozl-pull-fix-", tasks: [] });
  const remote = path.join(w.root, "remote.git");
  git(w.root, "init", "-q", "--bare", remote);
  git(w.checkout, "remote", "add", "origin", remote);
  git(w.checkout, "push", "-q", "origin", "main");
  const other = path.join(w.root, "contributor");
  git(w.root, "clone", "-q", remote, other);
  git(other, "config", "user.name", "Stranger");
  git(other, "config", "user.email", "stranger@example.invalid");
  fs.writeFileSync(path.join(other, "fix.txt"), "half a fix\n");
  git(other, "add", ".");
  git(other, "commit", "-q", "-m", "Half a fix");
  const head = git(other, "rev-parse", "HEAD");
  git(other, "push", "-q", "origin", "HEAD:refs/pull/7/head");
  w.store.put("repositories", {
    ...w.store.get("repositories", "app"),
    github: "o/app",
  });
  return { ...w, head };
}

const github = (permissions, head) => ({
  calls: [],
  async pullRequest(repository, number) {
    this.calls.push(["pull", repository, number]);
    return { number, head: { sha: head }, user: { login: "drive-by" } };
  },
  async pullRequestCommits() {
    return [{ author: { login: "drive-by" } }];
  },
  async permission(_repository, login) {
    return { permission: permissions[login] ?? "none" };
  },
});

test("a stranger's pull request starts a fix at its head, as stranger input that waits for Integrate", async (t) => {
  const w = withPull(t);
  const fake = github({ "drive-by": "read" }, w.head);
  const { taskId, fix } = await startFix(
    w.store,
    { text: "Finish the fix", repository: "app", pr: 7 },
    { workspaceRoot: w.root, actor: "person", github: fake },
  );
  assert.deepEqual(fix.source.pull, {
    repository: "o/app",
    number: 7,
    head: w.head,
  });
  const task = w.store.read().tasks.find((entry) => entry.id === taskId);
  assert.deepEqual(task.strangerInput, {
    reason: "author drive-by is not a collaborator",
    source: "o/app#7",
  });
  assert.equal(task.ship, "manual", "it waits for a person's Integrate");
  // Avoozl fetched the head itself, into its own ref, on the host.
  assert.equal(git(w.checkout, "rev-parse", "refs/avoozl/pull/7"), w.head);
  const { path: worktree } = await w.ops.execute("worktree.prepare", {
    taskId,
  });
  assert.equal(git(worktree, "rev-parse", "HEAD"), w.head);
  assert.equal(
    fs.readFileSync(path.join(worktree, "fix.txt"), "utf8"),
    "half a fix\n",
  );
});

test("a collaborator's pull request is no stranger input", async (t) => {
  const w = withPull(t);
  const { taskId } = await startFix(
    w.store,
    { text: "Finish the fix", repository: "app", pr: 7 },
    {
      workspaceRoot: w.root,
      actor: "person",
      github: github({ "drive-by": "write" }, w.head),
    },
  );
  const task = w.store.read().tasks.find((entry) => entry.id === taskId);
  assert.equal(task.strangerInput, undefined);
  assert.equal(task.ship, undefined);
});

test("a head that moved, or a repository with no GitHub remote, is refused", async (t) => {
  const w = withPull(t);
  await assert.rejects(
    startFix(
      w.store,
      { text: "Fix", repository: "app", pr: 7 },
      { workspaceRoot: w.root, github: github({}, "f".repeat(40)) },
    ),
    /moved while Avoozl fetched it/,
  );
  w.store.put("repositories", {
    ...w.store.get("repositories", "app"),
    github: undefined,
  });
  await assert.rejects(
    startFix(
      w.store,
      { text: "Fix", repository: "app", pr: 7 },
      { github: github({}, w.head) },
    ),
    /no GitHub remote/,
  );
});

test("a stranger's change under .github/ is held as protected; the same change from a spec task is not", async (t) => {
  const { verifyPaths } = await import("../../delivery/verify.mjs");
  const w = withPull(t);
  git(w.checkout, "checkout", "-q", "-b", "change");
  fs.mkdirSync(path.join(w.checkout, ".github"), { recursive: true });
  fs.writeFileSync(path.join(w.checkout, ".github", "CODEOWNERS"), "* @x\n");
  git(w.checkout, "add", ".");
  git(w.checkout, "commit", "-q", "-m", "Edit CODEOWNERS");
  const commit = git(w.checkout, "rev-parse", "HEAD");
  const repository = w.store.get("repositories", "app");
  const held = await verifyPaths(w.store, {
    task: { id: "s", strangerInput: { reason: "r", source: "o/app#7" } },
    repository,
    commit,
  });
  assert.deepEqual(held.protected, [".github/CODEOWNERS"]);
  const trusted = await verifyPaths(w.store, {
    task: { id: "s" },
    repository,
    commit,
  });
  assert.deepEqual(trusted.protected ?? [], []);
});
