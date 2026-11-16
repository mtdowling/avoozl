// rc-24.3: the marker `ref`, approval on the plans branch, and `verify-issue`
// for a private spec (RC25.3 to RC25.5, design D30.3 and D30.4). Fake GitHub
// only; no network, no real repository.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseProvenance, renderProvenance } from "../github-provenance.mjs";
import { Operations } from "../operations.mjs";
import { CREW_PROMPT } from "../radar-crew-prompt.mjs";
import { Store } from "../store.mjs";
import { verifyIssue } from "../verify-issue.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { snapshot } from "./fixtures.mjs";
import { specFiles } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const SHA = "0123456789abcdef0123456789abcdef01234567";
const MIRROR = "example/code-private";
const PLANS = "avoozl-plans";

test("the marker writes and reads `ref`, and omits it for a public spec", () => {
  const input = {
    spec: "pay-fix",
    tasks: ["pf-1.1"],
    commit: SHA,
    approvedBy: "octocat",
  };
  const line = renderProvenance({ ...input, ref: PLANS });
  assert.match(line, / approved-by=octocat ref=avoozl-plans -->$/);
  assert.equal(parseProvenance(line).marker.ref, PLANS);
  assert.equal(parseProvenance(renderProvenance(input)).marker.ref, undefined);
  assert.throws(() => renderProvenance({ ...input, ref: "a b" }), /ref/);
  const bad = line.replace("ref=avoozl-plans", "ref=a..b");
  assert.equal(parseProvenance(bad).problem.code, "bad-value");
});

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
            coder: "issue-radar",
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
  Object.assign(pull, { state: "closed", merged: true, merge_commit_sha: SHA });
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

// ---- verify-issue with a ref ----

const CODE = "example/code-private";
const base = `repos/${CODE}/contents/.kiro/specs/pay-fix`;
const prose = "# Title\n\nStatus: Approved\n\nText\n";
const marker = (extra = {}) =>
  renderProvenance({
    spec: "pay-fix",
    tasks: ["pf-1"],
    commit: SHA,
    approvedBy: "octocat",
    ref: PLANS,
    ...extra,
  });

function fake(over = {}, line = marker()) {
  const table = new Map([
    [
      `repos/${CODE}/issues/7`,
      {
        status: 200,
        body: { body: line, user: { login: "owner1" } },
      },
    ],
    [
      `repos/${CODE}/collaborators/octocat/permission`,
      { status: 200, body: { permission: "write" } },
    ],
    [
      `repos/${CODE}/collaborators/owner1/permission`,
      { status: 200, body: { permission: "admin" } },
    ],
    [`repos/${CODE}`, { status: 200, body: { default_branch: "main" } }],
    [`repos/${CODE}/branches/${PLANS}`, { status: 200, body: {} }],
    // Only the explicit no-common-ancestor response proves orphan history.
    [
      `repos/${CODE}/compare/main...${PLANS}`,
      {
        status: 404,
        body: { message: `No common ancestor between main and ${PLANS}.` },
      },
    ],
    [
      `repos/${CODE}/compare/${PLANS}...${SHA}`,
      { status: 200, body: { status: "behind" } },
    ],
    [`${base}/requirements.md?ref=${SHA}`, { status: 200, text: prose }],
    [`${base}/design.md?ref=${SHA}`, { status: 200, text: prose }],
    [
      `${base}/tasks.md?ref=${SHA}`,
      {
        status: 200,
        text: "# Tasks\n\nStatus: Approved\n\n- [ ] pf-1 First\n",
      },
    ],
    [`${base}/avoozl/manifest.json?ref=${SHA}`, { status: 200, text: "{}" }],
  ]);
  for (const [key, value] of Object.entries(over)) table.set(key, value);
  const calls = [];
  const read = async (apiPath) => {
    calls.push(apiPath);
    const hit = table.get(apiPath);
    if (!hit) return { status: 404, headers: {}, text: "{}" };
    return {
      status: hit.status,
      headers: {},
      text: hit.text ?? JSON.stringify(hit.body ?? {}),
    };
  };
  return { read, calls };
}
const verify = (f) => verifyIssue(`${CODE}#7`, { read: f.read });
const commitCheck = (result) =>
  result.checks.find((check) => check.name === "commit");

test("a private spec's issue passes and prints the fetch and show commands", async () => {
  const f = fake();
  const result = await verify(f);
  assert.equal(result.exitCode, 0, JSON.stringify(result.checks));
  assert.equal(result.ref, PLANS);
  assert.equal(
    result.fetch,
    `git fetch https://github.com/${CODE}.git refs/heads/${PLANS}`,
  );
  assert.deepEqual(result.show, [
    `git show ${SHA}:.kiro/specs/pay-fix/requirements.md`,
    `git show ${SHA}:.kiro/specs/pay-fix/design.md`,
    `git show ${SHA}:.kiro/specs/pay-fix/tasks.md`,
    `git show ${SHA}:.kiro/specs/pay-fix/avoozl/manifest.json`,
  ]);
  assert.ok(f.calls.includes(`repos/${CODE}/compare/${PLANS}...${SHA}`));
  assert.ok(!f.calls.includes(`repos/${CODE}/compare/main...${SHA}`));
});

test("a public marker has no fetch or show commands", async () => {
  const f = fake(
    {
      [`repos/${CODE}/compare/main...${SHA}`]: {
        status: 200,
        body: { status: "identical" },
      },
    },
    marker({ ref: undefined }),
  );
  const result = await verify(f);
  assert.equal(result.exitCode, 0);
  assert.equal(result.fetch, undefined);
  assert.equal(result.show, undefined);
});

test("a ref that is the default branch, missing, or shares history fails with the reason", async () => {
  const main = await verify(fake({}, marker({ ref: "main" })));
  assert.equal(main.exitCode, 1);
  assert.match(commitCheck(main).reason, /main is the default branch/);

  const missing = await verify(
    fake({ [`repos/${CODE}/branches/${PLANS}`]: { status: 404 } }),
  );
  assert.equal(missing.exitCode, 1);
  assert.match(commitCheck(missing).reason, /avoozl-plans is not a branch/);

  const shared = await verify(
    fake({
      [`repos/${CODE}/compare/main...${PLANS}`]: {
        status: 200,
        body: { status: "ahead" },
      },
    }),
  );
  assert.equal(shared.exitCode, 1);
  assert.match(commitCheck(shared).reason, /shares history.*not an orphan/);
  assert.equal(shared.fetch, undefined);

  const ahead = await verify(
    fake({
      [`repos/${CODE}/compare/${PLANS}...${SHA}`]: {
        status: 200,
        body: { status: "ahead" },
      },
    }),
  );
  assert.equal(ahead.exitCode, 1);
  assert.match(commitCheck(ahead).reason, /not behind avoozl-plans/);
});

test("a read that fails is could-not-run, not a verdict", async () => {
  const result = await verify(
    fake({ [`repos/${CODE}/branches/${PLANS}`]: { status: 500 } }),
  );
  assert.equal(result.exitCode, 2);
});

test("the crew's one-line prompt is unchanged and does not name the ref", () => {
  assert.equal(CREW_PROMPT.includes("\n"), false);
  assert.match(CREW_PROMPT, /verify-issue/);
  assert.doesNotMatch(CREW_PROMPT, /\bref\b|fetch|git show/);
});
