// A repository's landing.commitPrefix reaches every commit subject Avoozl
// writes there: landing, merge-forward, tick and the sync merge.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { rebaseForIntegration } from "../delivery/delivery.mjs";
import { normalizeGitHubPolicy } from "../github/github-policy.mjs";
import { syncStep } from "../epics/integration-sync.mjs";
import {
  applyLandingModes,
  commitSubject,
  landingSettings,
} from "../landing/landing-config.mjs";
import { holdMember, stackMembers } from "../landing/merge-batch.mjs";
import { specItems } from "../specs/spec-plans.mjs";
import { tickBranch } from "../specs/spec-ticks.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";

const PREFIX = "chore: ";
// The rule a repository's check enforces: every subject starts with it.
const follows = (subject) => subject.startsWith(PREFIX);

const sh = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-prefix-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "root");
  fs.mkdirSync(root);
  sh(root, "init", "-q", "-b", "main");
  sh(root, "config", "user.email", "test@example.com");
  sh(root, "config", "user.name", "Test");
  const commit = (file, text, message) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
    sh(root, "add", ".");
    sh(root, "commit", "-q", "-m", message);
    return sh(root, "rev-parse", "HEAD");
  };
  return { dir, root, commit };
}

test("commitSubject adds the prefix, and none leaves the subject as written", () => {
  assert.equal(commitSubject(PREFIX, "Land a"), "chore: Land a");
  assert.equal(commitSubject("", "Land a"), "Land a");
  assert.equal(commitSubject(undefined, "Land a"), "Land a");
});

test("landing commits carry the prefix, and without one keep Land KEY", async (t) => {
  for (const [prefix, expected] of [
    [PREFIX, "chore: Land a"],
    ["", "Land a"],
  ]) {
    const { root, commit } = scratch(t);
    const base = commit("base.txt", "base\n", "Start");
    sh(root, "checkout", "-q", "-b", "member");
    const member = commit("a.txt", "a\n", "Member");
    sh(root, "checkout", "-q", "main");
    const entry = { key: "a", commit: member, tasks: [] };
    await holdMember(root, entry);
    const { candidate } = await stackMembers(
      root,
      [entry],
      base,
      [],
      null,
      prefix,
    );
    const subject = sh(root, "log", "-1", "--format=%s", candidate);
    assert.equal(subject, expected);
    if (prefix) assert.ok(follows(subject));
  }
});

test("the merge-forward commit carries the prefix", async (t) => {
  const { root, commit } = scratch(t);
  commit("base.txt", "base\n", "Start");
  const tree = path.join(root, "..", "tree");
  sh(root, "worktree", "add", "-q", "-b", "task/a", tree);
  fs.writeFileSync(path.join(tree, "a.txt"), "a\n");
  sh(tree, "add", ".");
  sh(tree, "commit", "-q", "-m", "a");
  const head = sh(tree, "rev-parse", "HEAD");
  commit("other.txt", "main moved\n", "Main moves");
  const moved = await rebaseForIntegration(
    { id: "app", root, baseBranch: "main", commitPrefix: PREFIX },
    { path: tree, branch: "task/a" },
    head,
  );
  assert.equal(moved.how, "merge");
  assert.equal(
    sh(tree, "log", "-1", "--format=%s"),
    "chore: Merge main into task/a",
  );
});

test("the tick commit carries the prefix", async (t) => {
  const { root, dir, commit } = scratch(t);
  const bare = path.join(dir, "remote.git");
  sh(dir, "init", "-q", "--bare", "-b", "main", bare);
  sh(root, "remote", "add", "origin", bare);
  const spec = writeSpec(root, "config"),
    text = fs.readFileSync(path.join(spec, "tasks.md"), "utf8");
  commit(".kiro/specs/config/tasks.md", text, "Spec");
  sh(root, "push", "-q", "origin", "main");
  const item = specItems("config", text).find((i) => i.key);
  const out = await tickBranch(root, {
    branch: "main",
    files: [{ spec: "config", ids: [item.id] }],
    commitPrefix: PREFIX,
  });
  assert.ok(out.commit);
  assert.match(
    sh(root, "log", "-1", "--format=%s", out.commit),
    /^chore: Tick /,
  );
});

test("the sync merge on GitHub carries the prefix from the policy", async (t) => {
  const { store } = fixture(t),
    merges = [],
    github = {
      available: () => true,
      repository: async () => ({ default_branch: "main" }),
      compareCommits: async () => ({ ahead_by: 1, behind_by: 0, files: [] }),
      mergeBranch: async (_repo, input) => {
        merges.push(input);
        return { sha: "x" };
      },
    };
  await syncStep(
    store,
    github,
    [
      {
        spec: "s",
        repository: "example/code",
        branch: "rewrite/x",
        sync: "weekly",
      },
    ],
    {
      policy: {
        mode: "single-repo",
        repositories: {
          "example/code": {
            baseBranch: "main",
            landing: { commitPrefix: PREFIX },
          },
        },
      },
      now: Date.parse("2026-11-14T00:00:00Z"),
    },
  );
  assert.equal(merges[0].message, "chore: Merge main into rewrite/x");
});

test("the setting reaches the repository row, and removing it clears it", (t) => {
  const { store } = fixture(t);
  store.put("repositories", { id: "app", github: "acme/app", root: "/x" });
  const config = (landing) => ({
    github: { repositories: { "acme/app": { landing } } },
  });
  applyLandingModes(store, config({ mode: "direct", commitPrefix: PREFIX }));
  assert.equal(store.get("repositories", "app").commitPrefix, PREFIX);
  assert.equal(store.get("repositories", "app").landing, "direct");
  assert.equal(
    landingSettings(config({ commitPrefix: PREFIX }), "acme/app").commitPrefix,
    PREFIX,
  );
  applyLandingModes(store, config({ mode: "direct" }));
  assert.equal(store.get("repositories", "app").commitPrefix, undefined);
  assert.equal(landingSettings({}, "acme/app").commitPrefix, "");
});

test("commitPrefix is one line of at most 40 characters", () => {
  const policy = (commitPrefix) =>
    normalizeGitHubPolicy({
      repositories: {
        "acme/app": { baseBranch: "main", landing: { commitPrefix } },
      },
    });
  assert.equal(
    policy(PREFIX).repositories["acme/app"].landing.commitPrefix,
    PREFIX,
  );
  assert.throws(() => policy("a\nb"), /commitPrefix/);
  assert.throws(() => policy("x".repeat(41)), /commitPrefix/);
});
