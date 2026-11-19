import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { githubRepositoryFromRemote, repositoryGitHubRemote } from "../git.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function repositoryWithRemote(t, remoteUrl) {
  const root = temporaryDirectory("avoozl-git-");
  git(root, "init");
  git(root, "remote", "add", "origin", remoteUrl);
  const { store } = fixture(t);
  store.put("repositories", {
    id: "code",
    root,
    baseBranch: "main",
    worktreeRoot: temporaryDirectory("avoozl-worktrees-"),
    checks: [],
  });
  return { store, root };
}

test("githubRepositoryFromRemote recognizes GitHub HTTPS and SSH remotes", () => {
  assert.equal(
    githubRepositoryFromRemote("https://github.com/openai/codex.git"),
    "openai/codex",
  );
  assert.equal(
    githubRepositoryFromRemote("git@github.com:openai/codex.git"),
    "openai/codex",
  );
  assert.equal(
    githubRepositoryFromRemote("ssh://git@github.com/openai/codex.git"),
    "openai/codex",
  );
});

test("githubRepositoryFromRemote rejects non-GitHub remotes", () => {
  assert.equal(
    githubRepositoryFromRemote("https://gitlab.com/openai/codex.git"),
    null,
  );
  assert.equal(
    githubRepositoryFromRemote("git@example.test:openai/codex.git"),
    null,
  );
});

test("repositoryGitHubRemote detects HTTPS and SSH origin repositories", async (t) => {
  const remotes = [
    "https://github.com/openai/codex.git",
    "git@github.com:openai/codex.git",
  ];
  for (const remoteUrl of remotes) {
    await t.test(remoteUrl, async (t) => {
      const { store, root } = repositoryWithRemote(t, remoteUrl);
      const result = await repositoryGitHubRemote(store, {
        repositoryId: "code",
      });
      assert.deepEqual(result, {
        repositoryId: "code",
        repositoryRoot: root,
        remote: "origin",
        remoteUrl,
        repository: "openai/codex",
      });
    });
  }
});

test("repositoryGitHubRemote rejects a non-GitHub origin", async (t) => {
  const { store } = repositoryWithRemote(
    t,
    "https://gitlab.com/openai/codex.git",
  );
  await assert.rejects(
    repositoryGitHubRemote(store, { repositoryId: "code" }),
    /origin remote is not a GitHub repository/,
  );
});
