import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest } from "../../model.mjs";
import { Operations } from "../operations.mjs";
import { fixture, markdown } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function repository(t) {
  const root = temporaryDirectory(),
    remote = path.join(temporaryDirectory(), "workspace.git");
  git(root, "init");
  git(root, "config", "user.name", "Avoozl Test");
  git(root, "config", "user.email", "avoozl@example.invalid");
  fs.writeFileSync(path.join(root, "README.md"), "code repository\n");
  git(root, "add", "README.md");
  git(root, "commit", "-m", "Initialize");
  git(root, "branch", "-M", "main");
  git(path.dirname(remote), "init", "--bare", remote);
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "-u", "origin", "main");
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(path.dirname(remote), { recursive: true, force: true });
  });
  return { root, remote };
}

const localGitHub = {
  available: () => true,
  repository: async () => {
    throw Error("A local test remote is not GitHub.");
  },
};

test("portable publication uses an isolated Git tree and hydrates another local database", async (t) => {
  const repo = repository(t),
    first = fixture(t),
    ops = new Operations(first.store, { github: localGitHub });
  first.store.put("plans", {
    id: "plan-portable",
    kind: "plan",
    title: "Portable design",
    prompt: "Test portable planning",
    text: "# Portable design\n\nShared prose.\n",
    hash: digest("# Portable design\n\nShared prose.\n"),
    revision: 1,
    state: "draft",
    context: {},
    history: [],
    createdAt: "2026-11-10T00:00:00Z",
    updatedAt: "2026-11-10T00:00:00Z",
  });
  await ops.execute("workspace.repository.configure", {
    root: repo.root,
    branch: "avoozl-workspace",
    directory: ".avoozl",
  });
  const before = git(repo.root, "status", "--porcelain"),
    published = await ops.execute("workspace.repository.publish");
  assert.match(published.commit, /^[a-f0-9]{40,64}$/);
  assert.equal(git(repo.root, "status", "--porcelain"), before);
  git(repo.root, "fetch", "origin", "avoozl-workspace");
  assert.equal(
    git(
      repo.root,
      "show",
      "origin/avoozl-workspace:.avoozl/designs/plan-portable.md",
    ),
    "# Portable design\n\nShared prose.",
  );
  assert.equal(
    git(repo.root, "ls-tree", "-r", "--name-only", "origin/avoozl-workspace")
      .split("\n")
      .some((file) => /sqlite|transcript|handoff|credential/i.test(file)),
    false,
  );

  const second = fixture(t),
    secondOps = new Operations(second.store, { github: localGitHub });
  await secondOps.execute("workspace.repository.configure", {
    root: repo.root,
    branch: "avoozl-workspace",
    directory: ".avoozl",
  });
  const synced = await secondOps.execute("workspace.repository.sync");
  assert.equal(synced.commit, published.commit);
  assert.equal(second.store.get("plans", "plan-portable").text, "# Portable design\n\nShared prose.\n");
  assert.equal(second.store.read().tasks.some((task) => task.id === "sample-task"), true);
});

test("publication refuses secrets and absolute machine paths before writing Git objects", async (t) => {
  const repo = repository(t),
    { store } = fixture(t),
    ops = new Operations(store, { github: localGitHub });
  await ops.execute("workspace.repository.configure", {
    root: repo.root,
    branch: "avoozl-workspace",
  });
  store.put("plans", {
    id: "plan-secret",
    kind: "plan",
    title: "Unsafe",
    prompt: "Unsafe",
    text: "# Unsafe\n\napi_key=super-secret-value\n",
    hash: digest("# Unsafe\n\napi_key=super-secret-value\n"),
    revision: 1,
    state: "draft",
    context: {},
    history: [],
  });
  await assert.rejects(
    ops.execute("workspace.repository.publish"),
    /detected credential assignment/,
  );
  assert.throws(
    () => git(repo.root, "rev-parse", "--verify", "origin/avoozl-workspace"),
    /unknown revision|Needed a single revision|ambiguous argument/,
  );

  const plan = store.get("plans", "plan-secret");
  plan.text = "# Unsafe\n\nSee /Users/example/private/file.txt\n";
  plan.hash = digest(plan.text);
  store.put("plans", plan);
  await assert.rejects(
    ops.execute("workspace.repository.publish"),
    /detected absolute user path/,
  );
});

test("an approved design publishes to a review branch before task projection", async (t) => {
  const repo = repository(t),
    { store } = fixture(t),
    pulls = [],
    github = {
      available: () => true,
      repository: async () => ({ private: true, node_id: "private-plans" }),
      listPullRequests: async () => [],
      createPullRequest: async (_repository, input) => {
        const pull = {
          number: 12,
          node_id: "planning-pr-node",
          html_url: "https://example.test/private/plans/pull/12",
          state: "open",
          merged_at: null,
          merge_commit_sha: null,
          ...input,
        };
        pulls.push(pull);
        return pull;
      },
    },
    ops = new Operations(store, { github, operator: "Planner" });
  const draft = await ops.execute("plan.create", {
    id: "plan-team-review",
    prompt: "Publish a team design",
    text: markdown,
  });
  await ops.execute("plan.approve", {
    id: draft.id,
    expectedHash: draft.hash,
    expectedRevision: store.read().revision,
  });
  await ops.execute("workspace.repository.configure", {
    root: repo.root,
    branch: "avoozl-workspace",
  });
  const config = store.getMeta("workspaceRepository");
  config.repository = "private/plans";
  store.setMeta("workspaceRepository", config);
  const receipt = await ops.execute("planning.publish", {
    planId: draft.id,
  });
  assert.equal(receipt.state, "open");
  assert.equal(pulls.length, 1);
  assert.equal(pulls[0].base, "avoozl-workspace");
  assert.match(pulls[0].head, /^avoozl\/design-plan-team-review-/);
  git(repo.root, "fetch", "origin", pulls[0].head);
  assert.match(
    git(
      repo.root,
      "show",
      `origin/${pulls[0].head}:.avoozl/designs/plan-team-review.md`,
    ),
    /Build foundation/,
  );
});
