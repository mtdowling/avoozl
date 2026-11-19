// Shared scratch repositories and a fake GitHub for the forward tests: local
// bare git repositories and made-up terms only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { bindContentRules, contentBinding } from "../content/content-rules.mjs";
import { forwardGit } from "../mirror/mirror-forward-git.mjs";
import { fixture } from "./fixtures.mjs";
import { gitTemplate } from "./git-template.mjs";

export const SOURCE = "example/code";
export const MIRROR = "example/code-private";
export const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Crew",
      GIT_AUTHOR_EMAIL: "crew@example.test",
      GIT_COMMITTER_NAME: "Crew",
      GIT_COMMITTER_EMAIL: "crew@example.test",
    },
  }).trim();

// The public and private bare repositories and a work checkout whose main
// merged one crew change, built once per test file for each `file`/`text`.
const templates = new Map();
function repositories(root, file, text) {
  const id = JSON.stringify([file, text]);
  if (!templates.has(id))
    templates.set(
      id,
      gitTemplate((dir) => {
        const pub = path.join(dir, "pub.git"),
          priv = path.join(dir, "priv.git"),
          work = path.join(dir, "work");
        git(dir, "init", "-q", "--bare", "-b", "main", pub);
        git(dir, "clone", "-q", pub, work);
        fs.writeFileSync(path.join(work, "a.txt"), "base\n");
        git(work, "add", ".");
        git(work, "commit", "-q", "-m", "base");
        git(work, "push", "-q", "origin", "HEAD:refs/heads/main");
        git(dir, "clone", "-q", "--bare", pub, priv);
        git(work, "remote", "add", "private", priv);
        git(work, "checkout", "-q", "-b", "avoozl/task-1");
        fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
        fs.writeFileSync(path.join(work, file), text);
        git(work, "add", ".");
        git(work, "commit", "-q", "-m", "crew work");
        git(work, "checkout", "-q", "main");
        git(
          work,
          "merge",
          "-q",
          "--no-ff",
          "-m",
          "Merge crew",
          "avoozl/task-1",
        );
        git(work, "push", "-q", "private", "main:refs/heads/main");
        return { pub, priv, work, sha: git(work, "rev-parse", "HEAD") };
      }),
    );
  return templates.get(id)(root);
}

export function scratch(t, { file = "feature.txt", text = "hello\n" } = {}) {
  const { root, store } = fixture(t),
    { pub, priv, work, sha } = repositories(root, file, text),
    commands = [],
    urls = { [SOURCE]: pub, [MIRROR]: priv },
    forward = forwardGit({
      urlFor: (repo) => urls[repo],
      run: (args, options) => {
        commands.push(args.join(" "));
        return execFileSync2(args, options);
      },
    });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      plugins: [{ id: "fake-rules", path: "plugins/fake-rules", contract: 1 }],
      contentRules: {
        sets: [{ id: "fake-plugin-set", plugin: "fake-rules" }],
      },
    }),
  );
  bindContentRules(store, {
    workspaceRoot: root,
    configFile: path.join(root, "config", "config.json"),
  });
  contentBinding(store).plugins.set("fake-rules", {
    loadedAt: Date.now(),
    sets: new Map([
      [
        "fake-plugin-set",
        {
          id: "fake-plugin-set",
          version: "1.0.0",
          rules: [{ id: "orchard", source: "\\borchard[- ]?nine\\b" }],
        },
      ],
    ]),
  });
  store.put("mirror_forward", {
    id: sha,
    repository: SOURCE,
    mirror: MIRROR,
    mirrorPr: 5,
    taskId: "task-1",
    approver: "dana",
    state: "to_forward",
    reason: "Merged in the mirror, not forwarded yet.",
    mirrorMergedAt: "2026-11-14T10:00:00.000Z",
    forwardedAt: null,
    publicPrAt: null,
    publicMergedAt: null,
    forwardBranch: null,
    publicPr: null,
  });
  return { store, pub, priv, work, sha, commands, forward };
}

export function execFileSync2(args, { cwd, env, input } = {}) {
  try {
    const stdout = execFileSync("git", args, {
      cwd,
      env: { ...process.env, ...env },
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return Promise.resolve({ stdout, stderr: "" });
  } catch (error) {
    return Promise.reject(
      Object.assign(error, {
        stdout: String(error.stdout ?? ""),
        stderr: String(error.stderr ?? ""),
      }),
    );
  }
}

export function fakeGitHub({
  title = "Add the feature",
  body = "Adds it.\n\nTests: yes.",
  head = () => "0".repeat(40),
} = {}) {
  const github = {
    issues: [],
    created: [],
    branch: async () => ({ commit: { sha: head() } }),
    treeEntries: async () => [],
    blobTexts: async () => new Map(),
    createIssue: async (repo, input) => {
      assert.equal(repo, MIRROR);
      github.issues.push(input);
      return { number: 60 + github.issues.length };
    },
    pulls: [],
    available: () => true,
    signedIn: () => true,
    repository: async () => ({ default_branch: "main" }),
    pullRequest: async () => ({ title, body }),
    listPullRequests: async () => github.pulls,
    createPullRequest: async (repo, input) => {
      assert.equal(repo, SOURCE);
      const pull = { number: 40 + github.created.length, ...input };
      github.created.push(pull);
      github.pulls.push(pull);
      return pull;
    },
  };
  return github;
}

export const policy = (forward = "nudge", extra = {}) => ({
  mode: "single-repo",
  repositories: {
    [SOURCE]: {
      mirror: {
        source: SOURCE,
        mirror: MIRROR,
        forward,
        branchPrefix: "avoozl/",
        trustedPersons: ["dana"],
        ...extra,
      },
    },
  },
});
export const grant = async () => "token";
// The public branch of one forward: named by the merge commit, never the task.
export const forwardName = (sha) => `avoozl/change-${sha.slice(0, 8)}`;
export const branches = (repo) =>
  git(repo, "for-each-ref", "--format=%(refname:short)", "refs/heads").split(
    "\n",
  );
