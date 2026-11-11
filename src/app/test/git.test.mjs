import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  githubRepositoryFromRemote,
  projectGitHubRepository,
} from "../git.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function projectWithRemote(t, remoteUrl) {
  const root = temporaryDirectory("avoozl-git-");
  git(root, "init");
  git(root, "remote", "add", "origin", remoteUrl);
  const { store } = fixture(t);
  store.put("projects", {
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

test("projectGitHubRepository detects HTTPS and SSH origin repositories", async (t) => {
  const remotes = [
    "https://github.com/openai/codex.git",
    "git@github.com:openai/codex.git",
  ];
  for (const remoteUrl of remotes) {
    await t.test(remoteUrl, async (t) => {
      const { store, root } = projectWithRemote(t, remoteUrl);
      const result = await projectGitHubRepository(store, {
        projectId: "code",
      });
      assert.deepEqual(result, {
        projectId: "code",
        projectRoot: root,
        remote: "origin",
        remoteUrl,
        repository: "openai/codex",
      });
    });
  }
});

test("projectGitHubRepository rejects a non-GitHub origin", async (t) => {
  const { store } = projectWithRemote(t, "https://gitlab.com/openai/codex.git");
  await assert.rejects(
    projectGitHubRepository(store, { projectId: "code" }),
    /origin remote is not a GitHub repository/,
  );
});
