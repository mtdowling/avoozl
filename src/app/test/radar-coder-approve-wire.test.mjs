// rc-3.2 wiring: plan.approve opens the approval pull request for a spec held
// by an Issue Radar repository and approves in Avoozl only after it merges.
// Fake GitHub only; no network, no real repository.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { snapshot } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const SHA = "0123456789abcdef0123456789abcdef01234567";

class PullGitHub extends FakeGitHub {
  constructor() {
    super();
    this.pulls = [];
    this.written = [];
    this.branches = [];
  }
  async repository({ owner, repo }) {
    return {
      node_id: "n",
      full_name: `${owner}/${repo}`,
      private: true,
      default_branch: "main",
    };
  }
  async branchHead() {
    return { oid: SHA };
  }
  async createBranch(_r, name) {
    this.branches.push(name);
  }
  async putFile(repository, file) {
    this.written.push({ repository, ...file });
  }
  async createPullRequest(_r, input) {
    this.pulls.push({
      number: this.pulls.length + 1,
      state: "open",
      merged: false,
      ...input,
    });
    return { number: this.pulls.length };
  }
  async pullRequest(_r, number) {
    return this.pulls[number - 1];
  }
}

// One workspace: a code checkout with an origin remote and a spec folder.
function open(t, { mode, repositories, planning = false }) {
  const root = temporaryDirectory("avoozl-wire-"),
    code = temporaryDirectory("avoozl-wire-code-"),
    store = new Store(
      path.join(temporaryDirectory("avoozl-wire-db-"), "workspace.sqlite"),
    ),
    github = new PullGitHub(),
    specRoot = planning ? temporaryDirectory("avoozl-wire-plans-") : code;
  t.after(() => store.close());
  for (const dir of new Set([code, specRoot])) {
    execFileSync("git", ["init", "-q", "-b", "main", dir]);
    execFileSync("git", [
      "-C",
      dir,
      "remote",
      "add",
      "origin",
      `https://github.com/example/${dir === code ? "code" : "plans"}.git`,
    ]);
  }
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_wireapprove00001",
      github: {
        mode,
        ...(planning ? { planningRepository: "example/plans" } : {}),
        repositories: Object.fromEntries(
          Object.entries(repositories).map(([id, extra]) => [
            id,
            { baseBranch: "main", allowedActors: ["maintainer"], ...extra },
          ]),
        ),
      },
    }),
  );
  store.importSnapshot(snapshot());
  store.put("projects", {
    id: "code",
    root: code,
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [["npm", "test"]],
  });
  if (planning)
    store.setMeta("workspaceRepository", { root: specRoot, directory: "." });
  writeSpec(specRoot, "config");
  const ops = new Operations(store, {
    github,
    operator: "maintainer",
    workspaceRoot: root,
  });
  return { ops, store, github, specRoot };
}

async function approve(ops, input = {}) {
  await ops.execute("plan.create", { spec: "config" }).catch(() => {});
  const preview = await ops.execute("plan.preview", { id: "config" });
  return ops.execute("plan.approve", {
    id: "config",
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
    ...input,
  });
}
const merge = (github, n = 1) =>
  Object.assign(github.pulls[n - 1], {
    state: "closed",
    merged: true,
    merge_commit_sha: SHA,
  });

test("an Issue Radar repository: approve opens a pull request and approves only after the merge", async (t) => {
  const { ops, store, github } = open(t, {
    mode: "single-repo",
    repositories: { "example/code": {} },
  });
  const first = await approve(ops);
  assert.equal(first.pending, true);
  assert.equal(first.approvalPullRequest.number, 1);
  assert.equal(store.list("approvals").length, 0);
  assert.equal(store.get("plans", "config").state, "draft");
  assert.deepEqual(github.written.map((f) => f.path).sort(), [
    ".kiro/specs/config/design.md",
    ".kiro/specs/config/requirements.md",
    ".kiro/specs/config/tasks.md",
    "docs/decisions/config.md",
  ]);
  // Asked again while open: no second pull request, still not approved.
  assert.equal((await approve(ops)).pending, true);
  assert.equal(github.pulls.length, 1);
  assert.equal(store.list("approvals").length, 0);
  merge(github);
  const receipt = await approve(ops);
  assert.equal(receipt.spec, "config");
  assert.equal(receipt.approvedBy, "maintainer");
  assert.match(receipt.evidence, new RegExp(SHA));
  assert.equal(store.list("approvals").length, 1);
});

test("a closed unmerged pull request approves nothing and a new try opens another", async (t) => {
  const { ops, store, github } = open(t, {
    mode: "single-repo",
    repositories: { "example/code": {} },
  });
  await approve(ops);
  Object.assign(github.pulls[0], { state: "closed", merged: false });
  const again = await approve(ops);
  assert.equal(again.pending, true);
  assert.equal(again.approvalPullRequest.number, 2);
  assert.notEqual(github.branches[0], github.branches[1]);
  assert.equal(store.list("approvals").length, 0);
});

test("lint errors block approval before any pull request opens", async (t) => {
  const { ops, github, specRoot } = open(t, {
    mode: "single-repo",
    repositories: { "example/code": {} },
  });
  fs.writeFileSync(
    path.join(specRoot, ".kiro/specs/config/tasks.md"),
    "# Tasks\n\n- [ ] 1 One\n- [ ] 1 Again\n",
  );
  await assert.rejects(approve(ops), /Resolve plan diagnostic/);
  assert.equal(github.pulls.length, 0);
});

test("the decision record follows approval.decisionRecord", async (t) => {
  const { ops, github } = open(t, {
    mode: "single-repo",
    repositories: { "example/code": { approval: { decisionRecord: false } } },
  });
  await approve(ops);
  assert.equal(
    github.written.some((f) => f.path.startsWith("docs/decisions/")),
    false,
  );
  assert.equal(github.written.length, 3);
});

test("a worker repository keeps the plain approval", async (t) => {
  const { ops, store, github } = open(t, {
    mode: "single-repo",
    repositories: { "example/code": { coder: "worker" } },
  });
  const receipt = await approve(ops);
  assert.equal(receipt.spec, "config");
  assert.equal(github.pulls.length, 0);
  assert.equal(store.list("approvals").length, 1);
});

test("plans-repo mode: the planning repository opens the pull request only with an Issue Radar repository", async (t) => {
  const radar = open(t, {
    mode: "plans-repo",
    planning: true,
    repositories: { "example/code": { coder: "issue-radar" } },
  });
  assert.equal((await approve(radar.ops)).pending, true);
  assert.equal(radar.github.written[0].repository.repo, "plans");
  const worker = open(t, {
    mode: "plans-repo",
    planning: true,
    repositories: { "example/code": { coder: "worker" } },
  });
  assert.equal((await approve(worker.ops)).spec, "config");
  assert.equal(worker.github.pulls.length, 0);
});

test("a local workspace keeps the plain approval", async (t) => {
  const root = temporaryDirectory("avoozl-wire-local-"),
    store = new Store(path.join(root, "workspace.sqlite")),
    github = new PullGitHub();
  t.after(() => store.close());
  store.importSnapshot(snapshot());
  writeSpec(root, "config");
  const ops = new Operations(store, {
    github,
    operator: "maintainer",
    workspaceRoot: root,
  });
  assert.equal((await approve(ops)).spec, "config");
  assert.equal(github.pulls.length, 0);
});

test("an already approved plan is not sent through a pull request again", async (t) => {
  const { ops, store, github } = open(t, {
    mode: "single-repo",
    repositories: { "example/code": {} },
  });
  await approve(ops);
  merge(github);
  await approve(ops);
  const again = await approve(ops);
  assert.equal(again.existing, true);
  assert.equal(github.pulls.length, 1);
  assert.equal(store.list("approvals").length, 1);
});
