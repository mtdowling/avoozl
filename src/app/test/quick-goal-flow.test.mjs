// rc-9.3: the quick goal operations. Fake planner and fake GitHub only.
// Nearby inputs checked: a one-task and a two-task proposal; Approve before
// and after the approval pull request merges; a goal that crosses a promote
// rule (Approve refused, Promote works); Edit that removes a task; Discard;
// no planner chat; an MCP caller; auto-approve off and on; a repeated
// Approve; a repository with no checks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
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
const TWO = { tasks: [task("A"), task("B")], edges: [{ from: "A", to: "B" }] };

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
const run = (ops, name, input, context) =>
  ops.execute(name, input, undefined, context);
const nothingWritten = ({ github, store }) => {
  assert.deepEqual(github.pulls, []);
  assert.deepEqual(github.written, []);
  assert.equal(store.list("plans").length, 0);
};
async function configure(ops) {
  await ops.execute("github.configure", {
    repository: "example/code",
    projectId: "code",
    allowedActors: ["maintainer"],
  });
}

test("propose stores a proposal and writes nothing; confirm lists every issue", async (t) => {
  const context = open(t);
  await configure(context.ops);
  const goal = await run(context.ops, "quickgoal.propose", REQUEST);
  assert.equal(goal.status, "proposed");
  assert.equal(goal.hint, null);
  assert.deepEqual(goal.promote, []);
  const confirm = await run(context.ops, "quickgoal.confirm", { id: goal.id });
  assert.deepEqual(
    confirm.issues.map((issue) => [issue.id, issue.requires]),
    [
      ["goal-make-tests-faster.1", []],
      ["goal-make-tests-faster.2", ["goal-make-tests-faster.1"]],
    ],
  );
  nothingWritten(context);
});

test("a one-task proposal carries the hint, and Plan it anyway still approves", async (t) => {
  const context = open(t, { proposal: { tasks: [task("A")] } });
  await configure(context.ops);
  const goal = await run(context.ops, "quickgoal.propose", REQUEST);
  assert.equal(goal.hint.action, "Plan it anyway");
  const approval = await run(context.ops, "quickgoal.approve", { id: goal.id });
  assert.equal(approval.pending, true);
});

test("Approve opens one approval pull request with the manifest; after the merge it approves", async (t) => {
  const context = open(t);
  await configure(context.ops);
  const { ops, store, github } = context,
    goal = await run(ops, "quickgoal.propose", REQUEST);
  const first = await run(ops, "quickgoal.approve", { id: goal.id });
  assert.equal(first.pending, true);
  assert.equal(github.pulls.length, 1);
  assert.ok(
    github.written.some((file) => file.path.endsWith("/avoozl/manifest.json")),
  );
  assert.equal(store.list("approvals").length, 0);
  assert.deepEqual(
    (await run(ops, "quickgoal.list", {})).map((entry) => entry.id),
    [goal.id],
  );
  // A repeat opens no second pull request.
  await run(ops, "quickgoal.approve", { id: goal.id });
  assert.equal(github.pulls.length, 1);
  Object.assign(github.pulls[0], {
    state: "closed",
    merged: true,
    merge_commit_sha: SHA,
  });
  const done = await run(ops, "quickgoal.approve", { id: goal.id });
  assert.equal(done.status, "approved");
  assert.deepEqual(await run(ops, "quickgoal.list", {}), []);
  assert.equal(store.list("approvals").length, 1);
  // Projection finds the approval: the issues carry the approved commit.
  await ops.execute("github.project", { planId: "goal-make-tests-faster" });
  assert.equal(github.created.length >= 2, true);
  assert.match(github.created[0].body, new RegExp(`commit=${SHA}`));
});

test("a goal over a promote rule cannot be approved; Promote writes the folder and a draft", async (t) => {
  const context = open(t, {
    proposal: {
      tasks: [task("A", { publicInterface: true }), task("B")],
      edges: [],
    },
  });
  await configure(context.ops);
  const { ops, store, code, github } = context,
    goal = await run(ops, "quickgoal.propose", REQUEST);
  assert.deepEqual(goal.promote, ["public-interface"]);
  await assert.rejects(
    run(ops, "quickgoal.approve", { id: goal.id }),
    /Promote this goal/,
  );
  const confirm = await run(ops, "quickgoal.confirm", { id: goal.id });
  const promoted = await run(ops, "quickgoal.promote", { id: goal.id });
  assert.equal(promoted.status, "promoted");
  const folder = path.join(code, ".kiro", "specs", promoted.plan.spec);
  assert.ok(fs.existsSync(path.join(folder, "avoozl", "manifest.json")));
  assert.equal(store.get("plans", promoted.plan.id).state, "draft");
  // The same task IDs the confirm listed.
  const ids = Object.keys(
    JSON.parse(
      fs.readFileSync(path.join(folder, "avoozl", "manifest.json"), "utf8"),
    ).tasks,
  );
  assert.deepEqual(
    ids.map((id) => `${promoted.plan.spec}.${id}`),
    confirm.issues.map((issue) => issue.id),
  );
  assert.deepEqual(github.pulls, []);
});

test("Edit removes a task and its edges; Discard ends it with no write", async (t) => {
  const context = open(t);
  await configure(context.ops);
  const { ops } = context,
    goal = await run(ops, "quickgoal.propose", REQUEST),
    edited = await run(ops, "quickgoal.edit", {
      id: goal.id,
      remove: ["B"],
      titles: { A: "Renamed" },
    });
  assert.deepEqual(
    edited.proposal.tasks.map((entry) => entry.title),
    ["Renamed"],
  );
  assert.deepEqual(edited.proposal.edges, []);
  assert.equal(edited.hint.action, "Plan it anyway");
  const gone = await run(ops, "quickgoal.discard", { id: goal.id });
  assert.equal(gone.status, "discarded");
  await assert.rejects(
    run(ops, "quickgoal.approve", { id: goal.id }),
    /discarded/,
  );
  nothingWritten(context);
});

test("no planner chat, an MCP caller and a repository with no checks are refused", async (t) => {
  const none = open(t, { planner: false });
  await assert.rejects(
    run(none.ops, "quickgoal.propose", REQUEST),
    /No planner chat/,
  );
  const context = open(t);
  await assert.rejects(
    run(context.ops, "quickgoal.propose", REQUEST, { mcp: true }),
    /Only a person/,
  );
  const bare = open(t, { checks: [] });
  await configure(bare.ops);
  const goal = await run(bare.ops, "quickgoal.propose", REQUEST);
  await assert.rejects(
    run(bare.ops, "quickgoal.confirm", { id: goal.id }),
    /Name the checks/,
  );
});

test("auto-approve is off by default, and on it approves a goal with no promote rule", async (t) => {
  const context = open(t);
  await configure(context.ops);
  const { ops, github } = context;
  assert.deepEqual(await run(ops, "quickgoal.settings.get", {}), {
    autoApprove: false,
  });
  const manual = await run(ops, "quickgoal.propose", REQUEST);
  assert.equal(manual.approval, undefined);
  assert.equal(github.pulls.length, 0);
  await run(ops, "quickgoal.settings.update", { autoApprove: true });
  const auto = await run(ops, "quickgoal.propose", {
    ...REQUEST,
    goal: "Another goal",
  });
  assert.equal(auto.approval.pending, true);
  assert.equal(github.pulls.length, 1);
});
