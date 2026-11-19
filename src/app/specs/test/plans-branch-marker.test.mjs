// rc-24.3: approval on the plans branch (RC25.3, design D30.3). Fake GitHub
// only; no network, no real repository.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { Store } from "../../store/store.mjs";
import { FakeGitHub } from "../../test/fake-github.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { specFiles } from "../../test/spec-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const SHA = "0123456789abcdef0123456789abcdef01234567";
const MIRROR = "example/code-private";
const PLANS = "avoozl-plans";

// ---- approval on the plans branch ----

class PullGitHub extends FakeGitHub {
  constructor() {
    super();
    this.pulls = [];
    this.written = [];
    this.made = [];
    this.heads = [];
  }
  async branchHead(_r, name) {
    this.heads.push(name);
    return { oid: SHA };
  }
  async createBranch(_r, name) {
    this.made.push(name);
  }
  async commitFiles(repository, { branch, message, files }) {
    for (const [path, content] of Object.entries(files))
      this.written.push({ repository, path, branch, message, content });
    return "c".repeat(40);
  }
  async createPullRequest(repository, input) {
    this.pulls.push({
      number: this.pulls.length + 1,
      state: "open",
      merged: false,
      repository: `${repository.owner}/${repository.repo}`,
      ...input,
    });
    return { number: this.pulls.length };
  }
  async pullRequest(_r, number) {
    return this.pulls[number - 1];
  }
}

function open(t) {
  const root = temporaryDirectory("avoozl-ref-"),
    store = new Store(
      path.join(temporaryDirectory("avoozl-ref-db-"), "workspace.sqlite"),
    ),
    github = new PullGitHub();
  t.after(() => store.close());
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_refapprove000001",
      github: {
        mode: "plans-repo",
        planningRepository: "example/plans",
        repositories: {
          "example/code": {
            baseBranch: "main",
            allowedActors: ["maintainer"],
            mirror: {
              source: "example/code",
              mirror: MIRROR,
              plansBranch: PLANS,
            },
          },
        },
      },
    }),
  );
  store.importSnapshot(snapshot());
  store.setMeta("workspaceRepository", { root });
  for (const [file, text] of Object.entries(specFiles()))
    github.files.set(`${PLANS}:.kiro/specs/config/${file}`, text);
  const ops = new Operations(store, {
    github,
    operator: "maintainer",
    workspaceRoot: root,
  });
  return { ops, store, github };
}

test("approving a private spec opens its pull request against the plans branch", async (t) => {
  const { ops, store, github } = open(t);
  await ops.refreshPrivateSpecs();
  await ops.execute("plan.create", { spec: "config" });
  assert.equal(store.get("plans", "config").home, "plansBranch");
  const preview = await ops.execute("plan.preview", { id: "config" });
  const first = await ops.execute("plan.approve", {
    id: "config",
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
  });
  assert.equal(first.pending, true);
  const [pull] = github.pulls;
  assert.equal(pull.repository, MIRROR);
  assert.equal(pull.base, PLANS);
  assert.deepEqual(github.heads, [PLANS]);
  // The orphan branch holds specs only: no decision record.
  assert.ok(github.written.length > 0);
  assert.ok(
    github.written.every((file) => file.path.startsWith(".kiro/specs/config/")),
  );
  assert.equal(store.list("approvals").length, 0);
  Object.assign(pull, {
    state: "closed",
    merged: true,
    merge_commit_sha: SHA,
    user: { login: "maintainer" },
  });
  // The merge commit is the plans branch with the Status lines changed,
  // which the revision hash leaves out.
  github.shas.set(SHA, PLANS);
  const done = await ops.execute("plan.approve", {
    id: "config",
    expectedHash: preview.reviewedHash,
    expectedRevision: ops.store.read().revision,
  });
  assert.ok(done);
  const state = store.getMeta(
    `spec-approval:config:${store.get("plans", "config").hash}`,
  );
  assert.equal(state.commit, SHA);
  assert.equal(state.ref, PLANS);
});
