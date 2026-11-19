// Spec pull requests through Operations (Requirement 107): the overlay, the
// chip, the Decisions item, Approve then merge, and person-only actions.
// Fake GitHub only; no network.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { snapshot } from "./fixtures.mjs";
import { specFiles } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const HEAD = "c".repeat(40),
  MERGE = "d".repeat(40),
  FOLDER = ".kiro/specs/feature/";

class PullGitHub extends FakeGitHub {
  constructor() {
    super();
    this.checks = "SUCCESS";
    this.merges = [];
    this.pull = { state: "open", merged: false };
  }
  async graphql() {
    const names = [
      "requirements.md",
      "design.md",
      "tasks.md",
      "avoozl/manifest.json",
    ];
    return {
      search: {
        issueCount: 1,
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            __typename: "PullRequest",
            number: 7,
            title: "Add feature spec",
            url: "https://github.com/example/code/pull/7",
            createdAt: new Date().toISOString(),
            author: { login: "maintainer" },
            labels: { nodes: [] },
            assignees: { nodes: [] },
            comments: { totalCount: 0 },
            isDraft: false,
            headRefOid: HEAD,
            headRefName: "spec/feature",
            baseRefName: "main",
            files: {
              totalCount: names.length,
              nodes: names.map((name) => ({ path: FOLDER + name })),
            },
            closingIssuesReferences: { nodes: [] },
            commits: {
              nodes: [
                { commit: { statusCheckRollup: { state: this.checks } } },
              ],
            },
          },
        ],
      },
    };
  }
  // The pull request's files at its head and at its merge commit.
  async blobTexts(_repository, _ref, list) {
    const files = specFiles();
    return new Map(
      list.map((file) => [file, files[file.slice(FOLDER.length)] ?? null]),
    );
  }
  async pullRequest() {
    return this.pull;
  }
  async mergePullRequest(_repository, number, options) {
    this.merges.push({ number, ...options });
    return { merged: true };
  }
  async pullRequestReviews() {
    return [];
  }
}

function open(t) {
  const root = temporaryDirectory("avoozl-specpr-ws-"),
    code = temporaryDirectory("avoozl-specpr-code-"),
    store = new Store(
      path.join(temporaryDirectory("avoozl-specpr-db-"), "workspace.sqlite"),
    ),
    github = new PullGitHub();
  t.after(() => store.close());
  execFileSync("git", ["init", "-q", "-b", "main", code]);
  execFileSync("git", [
    "-C",
    code,
    "remote",
    "add",
    "origin",
    "https://github.com/example/code.git",
  ]);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_specpr0000000001",
      github: {
        mode: "single-repo",
        repositories: {
          "example/code": {
            baseBranch: "main",
            allowedActors: ["maintainer"],
            landing: { method: "merge" },
          },
        },
      },
    }),
  );
  store.importSnapshot(snapshot());
  store.put("repositories", {
    id: "code",
    root: code,
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [["npm", "test"]],
  });
  github.login = "maintainer";
  const ops = new Operations(store, {
    github,
    operator: "maintainer",
    workspaceRoot: root,
  });
  return {
    ops,
    store,
    github,
    policy: () =>
      JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8")),
  };
}

// The open items read, as the tick makes it (github-open-read.mjs).
const read = async (ops) => {
  const policy = (await import("../github-policy.mjs")).readGitHubPolicyOrNull(
    ops.workspaceRoot,
  );
  const { refreshOpenItems } = await import("../github-open-read.mjs");
  await refreshOpenItems(ops.store, ops.github, policy, { force: true });
  return policy;
};
const adopt = async (ops) => {
  const policy = await read(ops);
  await ops.specPullTick(policy);
  return policy;
};

test("a spec-only pull request is adopted and shows on its spec", async (t) => {
  const { ops, store } = open(t);
  await adopt(ops);
  // The folder does not exist on disk: the pull request's files stand for it.
  const list = ops.specList().items.find((item) => item.name === "feature");
  assert.equal(list.pull.number, 7);
  assert.equal(list.plan.state, "draft");
  assert.equal(
    ops.readSpec("feature").pull.url,
    "https://github.com/example/code/pull/7",
  );
  const decisions = (await ops.execute("conflicts.view", {})).items.filter(
    (item) => item.kind === "spec-pull",
  );
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].specPull.author, "maintainer");
  const shown = await ops.execute("specpr.view", {});
  assert.equal(shown.items[0].canApprove, true);
  assert.equal(store.list("approvals").length, 0);
});

test("Approve approves that head, the tick merges it once checks pass, and the merge records the approval", async (t) => {
  const { ops, store, github } = open(t);
  const policy = await adopt(ops);
  const preview = await ops.execute("plan.preview", { id: "feature" });
  const pending = await ops.execute("plan.approve", {
    id: "feature",
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
  });
  assert.equal(pending.pending, true);
  assert.equal(pending.approvalPullRequest.number, 7);
  assert.equal(store.list("approvals").length, 0);
  // Decisions no longer waits on the person for it.
  assert.equal(
    (await ops.execute("conflicts.view", {})).items.filter(
      (item) => item.kind === "spec-pull",
    ).length,
    0,
  );
  // Checks pass on the exact head: one guarded merge with the repo's method.
  await ops.specPullTick(policy);
  assert.deepEqual(github.merges, [{ number: 7, sha: HEAD, method: "merge" }]);
  // GitHub reports the merge; the next tick records the approval.
  github.pull = {
    state: "closed",
    merged: true,
    merge_commit_sha: MERGE,
    // The squash commit's author is the pull request's author.
    user: { login: "maintainer" },
    merged_by: { login: "maintainer" },
    merged_at: new Date().toISOString(),
  };
  await ops.approvalTick();
  assert.equal(store.list("approvals").length, 1);
  assert.equal(store.get("plans", "feature").state, "approved");
});

test("an agent or MCP caller cannot adopt, reject or request changes", async (t) => {
  const { ops } = open(t);
  for (const name of ["specpr.adopt", "specpr.reject", "specpr.requestChanges"])
    for (const context of [{ caller: "worker" }, { mcp: true }])
      await assert.rejects(
        ops.execute(
          name,
          { repository: "example/code", number: 7 },
          undefined,
          context,
        ),
        /Only a person/,
      );
});
