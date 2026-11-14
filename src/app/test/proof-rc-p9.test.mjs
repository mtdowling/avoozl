// Proof rc-p9 on a fake GitHub: "Make tests faster" with Measure, one
// approval, issues that carry the measured evidence and pass verify-issue; a
// second goal that crosses a promote rule offers Promote instead of Approve.
// Temporary workspace and fake GitHub only. The live run is the owner's.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { verifyIssue } from "../verify-issue.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const REPO = "example/code";

class PullGitHub extends FakeGitHub {
  pulls = [];
  written = [];
  async repository({ owner, repo }) {
    return {
      full_name: `${owner}/${repo}`,
      private: true,
      default_branch: "main",
    };
  }
  async branchHead() {
    return { oid: SHA };
  }
  async createBranch() {}
  async putFile(_repository, file) {
    this.written.push(file);
  }
  async createPullRequest(_repository, input) {
    this.pulls.push({
      number: this.pulls.length + 1,
      state: "open",
      merged: false,
      ...input,
    });
    return { number: this.pulls.length };
  }
  async pullRequest(_repository, number) {
    return this.pulls[number - 1];
  }
}

const slow = (id, seconds) => ({
  id,
  title: `Speed up ${id}`,
  evidence: { measured: { seconds, command: "npm test" } },
});
const proposals = [
  { tasks: [slow("A", 41.5), slow("B", 12)], edges: [{ from: "A", to: "B" }] },
  {
    tasks: [
      {
        id: "C",
        title: "Change the public command",
        evidence: { file: "src/cli.mjs", line: 9 },
        publicInterface: true,
      },
      {
        id: "D",
        title: "Update docs",
        evidence: { file: "README.md", line: 1 },
      },
    ],
    edges: [],
  },
];

function open(t) {
  const root = temporaryDirectory("avoozl-p9-"),
    code = temporaryDirectory("avoozl-p9-code-"),
    store = new Store(
      path.join(temporaryDirectory("avoozl-p9-db-"), "w.sqlite"),
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
    `https://github.com/${REPO}.git`,
  ]);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_proofrcp90000001",
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            coder: "issue-radar",
            allowedActors: ["maintainer"],
          },
        },
      },
    }),
  );
  store.importSnapshot(snapshot());
  store.put("projects", {
    id: "code",
    root: code,
    baseBranch: "main",
    worktreeRoot: "worktrees",
    checks: [["npm", "test"]],
  });
  let turn = 0;
  const ops = new Operations(store, {
    github,
    operator: "maintainer",
    workspaceRoot: root,
    plannerAgent: () => ({
      turn: async () => ({ proposal: proposals[turn++] }),
    }),
  });
  return { ops, store, github, code };
}

// What `gh api` would answer for the issue and the approved spec, from the
// fake GitHub's own state. Everyone has write access.
function reader(github, issue) {
  const files = new Map(
    github.written.map((f) => [
      f.path,
      Buffer.from(f.content, "base64").toString(),
    ]),
  );
  return async (apiPath) => {
    const reply = (body) => ({
      status: 200,
      headers: {},
      text: typeof body === "string" ? body : JSON.stringify(body),
    });
    if (apiPath === `repos/${REPO}/issues/${issue.number}`)
      return reply({ body: issue.body, user: { login: "maintainer" } });
    if (apiPath.includes("/collaborators/"))
      return reply({ permission: "write" });
    if (apiPath === `repos/${REPO}`) return reply({ default_branch: "main" });
    if (apiPath.includes("/compare/")) return reply({ status: "identical" });
    const hit = /contents\/(.+?)\?ref=/.exec(apiPath);
    const text = hit && files.get(hit[1]);
    // The spec's tasks.md is the approved copy: the approval pull request
    // wrote Status: Approved, and the fake merge keeps that file.
    return text === undefined
      ? { status: 404, headers: {}, text: "{}" }
      : reply(text);
  };
}

test("Measure goal: one approval, measured evidence in the issues, verify-issue ok; a promote-rule goal offers Promote", async (t) => {
  const { ops, store, github, code } = open(t);
  await ops.execute("github.configure", {
    repository: REPO,
    projectId: "code",
    allowedActors: ["maintainer"],
  });

  // Goal 1: Measure. Propose writes nothing.
  const goal = await ops.execute("quickgoal.propose", {
    goal: "Make tests faster",
    repository: REPO,
    depth: "measure",
  });
  assert.equal(goal.status, "proposed");
  assert.deepEqual(goal.promote, []);
  assert.equal(github.pulls.length, 0);
  assert.equal(store.list("plans").length, 0);

  // One approval: one pull request, then the merge approves.
  const first = await ops.execute("quickgoal.approve", { id: goal.id });
  assert.equal(first.pending, true);
  assert.equal(github.pulls.length, 1);
  Object.assign(github.pulls[0], {
    state: "closed",
    merged: true,
    merge_commit_sha: SHA,
  });
  const done = await ops.execute("quickgoal.approve", { id: goal.id });
  assert.equal(done.status, "approved");
  assert.equal(github.pulls.length, 1, "no second approval was asked for");

  // The mini-spec carries the measured evidence and the goal, verbatim.
  const written = github.written
    .map((f) => Buffer.from(f.content, "base64").toString())
    .join("\n");
  assert.match(written, /measured 41\.5 s with `npm test`/);
  assert.match(written, /Make tests faster/);

  // Projection creates the issues; each carries the measured evidence and
  // passes the check a crew runs before it builds.
  await ops.execute("github.project", { planId: "goal-make-tests-faster" });
  const issues = github.created.filter((i) =>
    /"kind":"leaf"/.test(i.body ?? ""),
  );
  assert.equal(issues.length, 2);
  for (const issue of issues) {
    assert.match(issue.body, /measured (41\.5|12) s with `npm test`/);
    const result = await verifyIssue(`${REPO}#${issue.number}`, {
      read: reader(github, issue),
      brief: true,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  }

  // Goal 2 crosses a promote rule: Approve is refused, Promote writes a draft.
  const second = await ops.execute("quickgoal.propose", {
    goal: "Rename the public command",
    repository: REPO,
  });
  assert.deepEqual(second.promote, ["public-interface"]);
  await assert.rejects(
    ops.execute("quickgoal.approve", { id: second.id }),
    /Promote this goal/,
  );
  assert.equal(
    github.pulls.length,
    1,
    "refused Approve opened no pull request",
  );
  const promoted = await ops.execute("quickgoal.promote", { id: second.id });
  assert.equal(promoted.status, "promoted");
  assert.ok(
    fs.existsSync(
      path.join(code, ".kiro", "specs", promoted.plan.spec, "tasks.md"),
    ),
  );
  assert.equal(store.get("plans", promoted.plan.id).state, "draft");
});
