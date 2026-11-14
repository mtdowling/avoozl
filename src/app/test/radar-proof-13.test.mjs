// Proof 13 (rc-p13): the work split. Run on a fake GitHub and a fake planner
// in an isolated temporary workspace; no real repository is written.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { SCOPE_RULE, SCOPE_STATEMENT } from "../../work-split.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");
const SHA = "0123456789abcdef0123456789abcdef01234567";

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
  async putFile(repository, file) {
    this.written.push(file);
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

const task = (id, extra = {}) => ({
  id,
  title: `Task ${id}`,
  evidence: { file: "src/a.mjs", line: 3 },
  ...extra,
});
const agentFor = (proposal) => () => ({
  turn: async () => ({ proposal }),
});
function open(
  t,
  { proposal = TWO, checks = [["npm", "test"]], planner = true } = {},
) {
  const root = temporaryDirectory("avoozl-qg-"),
    code = temporaryDirectory("avoozl-qg-code-"),
    store = new Store(
      path.join(temporaryDirectory("avoozl-qg-db-"), "w.sqlite"),
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
      namespace: "avz_quickgoal0000001",
      github: {
        mode: "single-repo",
        repositories: {
          "example/code": {
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
    worktreeRoot: "/tmp/w",
    checks,
  });
  const ops = new Operations(store, {
    github,
    operator: "maintainer",
    workspaceRoot: root,
    ...(planner ? { plannerAgent: agentFor(proposal) } : {}),
  });
  return { ops, store, github, code };
}
const REQUEST = { goal: "Make tests faster", repository: "example/code" };
const ids = (n) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
// Five tasks in two levels: T1, then T2 to T5 after it.
const five = {
  tasks: ids(5).map((id) => task(id)),
  edges: ids(5)
    .slice(1)
    .map((id) => ({ from: "T1", to: id })),
};
const read = (file) =>
  fs.readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");

test("Proof 13: the statement shows in the README, Set up and the modal", () => {
  assert.ok(read("README.md").replace(/\s+/g, " ").includes(SCOPE_STATEMENT));
  for (const file of [
    "kirocrew-app/ui/src/SetupWizard.tsx",
    "kirocrew-app/ui/src/QuickGoalModal.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /SCOPE_STATEMENT/, file);
    assert.match(source, /SCOPE_RULE/, file);
    assert.ok(source.includes("work-split.mjs"), file);
  }
});

test("Proof 13: the hint shows for the one-task goal only and blocks nothing", async (t) => {
  const one = open(t, { proposal: { tasks: [task("T1")] } }),
    many = open(t, { proposal: five });
  for (const { ops } of [one, many])
    await ops.execute("github.configure", {
      repository: "example/code",
      projectId: "code",
      allowedActors: ["maintainer"],
    });
  const small = await one.ops.execute("quickgoal.propose", REQUEST),
    large = await many.ops.execute("quickgoal.propose", REQUEST);
  assert.equal(small.status, "proposed");
  assert.equal(small.hint.action, "Plan it anyway");
  assert.equal(large.status, "proposed");
  assert.equal(large.hint, null);
  assert.equal(large.proposal.tasks.length, 5);
  // Plan it anyway still plans the small goal: one approval pull request.
  const approval = await one.ops.execute("quickgoal.approve", { id: small.id });
  assert.equal(approval.pending, true);
  assert.equal(one.github.pulls.length, 1);
  // The five-task goal plans the same way, with no hint in the way.
  const other = await many.ops.execute("quickgoal.approve", { id: large.id });
  assert.equal(other.pending, true);
});
