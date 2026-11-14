// rc-2.1: projection for `coder: issue-radar`. Fake GitHub only. Nearby
// inputs checked: single-repo and plans-repo modes; coder worker vs
// issue-radar; a repeated projection; a plan that mixes a planning task and a
// radar task; the tick's readiness projection; completion by `Closes #N`.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { registerCoderAdapter } from "../coder-adapter.mjs";
import { planningIdentity } from "../github-marker.mjs";
import { refreshProjectedReadiness } from "../github-projection.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { FakeGitHub } from "./fake-github.mjs";

const NAMESPACE = "avz_testtesttesttest";

const markerOf = (issue) =>
  JSON.parse(issue.body.match(/<!-- avoozl-task\n(.*)\n-->/)[1]);

async function workspace(t, { mode, coder, radar, blockTerm }) {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    root = temporaryDirectory(),
    repositories = {
      "example/code": {
        baseBranch: "main",
        ...(coder ? { coder } : {}),
        ...(radar ? { radar } : {}),
      },
    };
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      ...(blockTerm ? { contentRules: { sets: [{ id: "names" }] } } : {}),
      github: {
        mode,
        ...(mode === "plans-repo"
          ? { planningRepository: "example/planning" }
          : {}),
        repositories,
      },
    }),
  );
  if (blockTerm) {
    const dir = path.join(root, ".avoozl", "local", "content-rules");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "names.txt"), `name: ${blockTerm}\n`);
  }
  const ops = new Operations(store, {
    github,
    operator: "Operator",
    workspaceRoot: root,
  });
  for (const id of ["planning", "code"])
    store.put("projects", {
      id,
      root: `/tmp/${id}`,
      baseBranch: "main",
      worktreeRoot: `/tmp/${id}-worktrees`,
      checks: [["npm", "test"]],
    });
  for (const id of mode === "plans-repo" ? ["planning", "code"] : ["code"])
    await ops.execute("github.configure", {
      repository: `example/${id}`,
      projectId: id,
      allowedActors: ["maintainer"],
    });
  return { store, github, ops };
}

async function approve(ops, store, id, tasks) {
  const plan = await ops.execute("plan.create", {
    id,
    prompt: "Project " + id,
    text:
      `# ${id}\n\n` +
      tasks
        .map((task) => "```task\n" + JSON.stringify(task) + "\n```\n")
        .join("\n"),
  });
  const approved = await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  return { plan, approved };
}

const leaf = (id, projectId, extra = {}) => ({
  id,
  title: "Task " + id,
  acceptance: [id + " passes"],
  projectId,
  ...extra,
});

const repositoriesOf = (github) => [
  ...new Set(github.created.map((issue) => issue.repository)),
];

for (const [mode, coder] of [
  ["single-repo", undefined],
  ["single-repo", "issue-radar"],
  ["plans-repo", "issue-radar"],
])
  test(`${mode} with ${coder ?? "the default coder"} writes issues only into the code repository`, async (t) => {
    const { store, github, ops } = await workspace(t, { mode, coder }),
      { plan, approved } = await approve(ops, store, "one", [
        leaf("first-leaf", "code"),
        leaf("second-leaf", "code", { requires: ["first-leaf"] }),
      ]);
    await ops.execute("github.project", { planId: plan.id });
    assert.equal(approved.taskIds.length, 2);
    assert.deepEqual(repositoriesOf(github), ["example/code"]);
    // A repeat projection writes no new issue and nothing elsewhere.
    const created = github.created.length;
    await ops.execute("github.project", { planId: plan.id });
    assert.equal(github.created.length, created);
    assert.deepEqual(repositoriesOf(github), ["example/code"]);
    for (const issue of github.created)
      assert.doesNotMatch(JSON.stringify(markerOf(issue)), /planning/i);
  });

test("plans-repo with coder worker still writes into the plans repository", async (t) => {
  const { store, github, ops } = await workspace(t, {
    mode: "plans-repo",
    coder: "worker",
  });
  const { plan } = await approve(ops, store, "worker", [
    leaf("plan-leaf", "planning"),
  ]);
  await ops.execute("github.project", { planId: plan.id });
  assert.deepEqual(repositoriesOf(github), ["example/planning"]);
  // A code-repository task of a worker repository is still refused.
  const code = await approve(ops, store, "worker-code", [
    leaf("code-leaf", "code"),
  ]);
  await assert.rejects(
    ops.execute("github.project", { planId: code.plan.id }),
    /example\/code is not the planning repository/,
  );
  assert.deepEqual(repositoriesOf(github), ["example/planning"]);
});

test("plans-repo with issue-radar keeps plan and epic issues in the code repository", async (t) => {
  const { store, github, ops } = await workspace(t, {
    mode: "plans-repo",
    coder: "issue-radar",
  });
  const { plan, approved } = await approve(ops, store, "parents", [
    { id: "epic-one", kind: "package", title: "Epic", projectId: "code" },
    leaf("child-one", "code"),
  ]);
  const [epicId, childId] = approved.taskIds;
  store.mutate("Nest child", (data) => {
    data.tasks.find((task) => task.id === childId).parent = epicId;
  });
  await ops.execute("github.project", { planId: plan.id });
  assert.deepEqual(repositoriesOf(github), ["example/code"]);
  assert.equal(github.subIssues.length >= 1, true);
});

test("a plan mixing a planning task and a radar task is refused when a link would cross", async (t) => {
  const { store, github, ops } = await workspace(t, {
    mode: "plans-repo",
    coder: "issue-radar",
  });
  const { plan } = await approve(ops, store, "mixed", [
    leaf("plan-leaf", "planning"),
    leaf("code-leaf", "code", { requires: ["plan-leaf"] }),
  ]);
  await assert.rejects(
    ops.execute("github.project", { planId: plan.id }),
    /links only planning issues/,
  );
  assert.equal(github.blockers?.length ?? 0, 0);
});

test("the tick's readiness projection keeps a radar plan in the code repository", async (t) => {
  const { store, github, ops } = await workspace(t, {
    mode: "plans-repo",
    coder: "issue-radar",
  });
  const { plan } = await approve(ops, store, "tick", [
    leaf("tick-first", "code"),
    leaf("tick-second", "code", { requires: ["tick-first"] }),
  ]);
  await ops.execute("github.project", { planId: plan.id });
  const before = github.created.length;
  // A forced re-projection is the path the tick takes for a changed graph.
  const result = await refreshProjectedReadiness(store, github, {
    identity: planningIdentity(ops.workspaceRoot),
    forcePlans: new Set([plan.id]),
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.projected, [plan.id]);
  assert.equal(github.created.length, before);
  assert.deepEqual(repositoriesOf(github), ["example/code"]);
});

// GitHub merges a pull request with `Closes #N` and closes the issue.
function mergeAndClose(github, issue) {
  const pull = {
    number: 100 + issue.number,
    url: `https://example.test/example/code/pull/${100 + issue.number}`,
    state: "MERGED",
    title: "Pull " + issue.number,
    body: "Closes #" + issue.number,
    merged: true,
    mergedAt: "2026-11-12T10:04:00Z",
    headRefName: "issue-radar/one",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    repository: { nameWithOwner: "example/code" },
    commits: [],
  };
  github.checkRuns = () => Promise.resolve([]);
  github.commitStatus = () => Promise.resolve({ state: "success" });
  github.issueLinks = (_repository, number) =>
    Promise.resolve({
      nodeId: "issue-" + number,
      linkedBranches: [],
      openBlockedBy: 0,
      totalBlockedBy: 0,
    });
  github.closingPullRequests = () => Promise.resolve([pull]);
  github.branchPullRequests = () => Promise.resolve([pull]);
  Object.assign(issue, {
    state: "closed",
    state_reason: "completed",
    closed_at: "2026-11-12T10:05:00Z",
    updated_at: "2026-11-12T10:05:00Z",
  });
  github.events.set(issue.number, [
    {
      event: "closed",
      actor: { login: "maintainer" },
      state_reason: "completed",
      created_at: "2026-11-12T10:05:00Z",
    },
  ]);
}

for (const mode of ["single-repo", "plans-repo"])
  test(`${mode}: a pull request with Closes #N completes the radar leaf`, async (t) => {
    const { store, github, ops } = await workspace(t, {
      mode,
      coder: "issue-radar",
    });
    const { plan, approved } = await approve(ops, store, "close", [
      leaf("close-one", "code"),
    ]);
    await ops.execute("github.project", { planId: plan.id });
    const issue = github.created.find(
      (item) => item.repository === "example/code",
    );
    mergeAndClose(github, issue);
    await ops.execute("workspace.tick", { sessions: [] });
    const task = store
      .read()
      .tasks.find((item) => item.id === approved.taskIds[0]);
    assert.equal(task.githubVerdict?.state, "verified");
    assert.deepEqual(repositoriesOf(github), ["example/code"]);
  });

// rc-2.2: the plans repository name in issues. Nearby inputs checked: public
// and private code repository; the switch unset, off and on; plans-repo and
// single-repo mode; coder worker; a content rule that blocks the name.
const publicRepository = (github) => {
  github.repository = ({ owner, repo }) =>
    Promise.resolve({
      node_id: "repo-node",
      full_name: owner + "/" + repo,
      private: false,
    });
};

for (const [visibility, radar, refused] of [
  ["public", undefined, true],
  ["public", { showPlansRepo: false }, true],
  ["public", { showPlansRepo: true }, false],
  ["private", undefined, false],
  ["private", { showPlansRepo: false }, false],
  ["private", { showPlansRepo: true }, false],
])
  test(`plans-repo, ${visibility} code repository, showPlansRepo ${radar ? radar.showPlansRepo : "unset"}: ${refused ? "refused" : "projected"}`, async (t) => {
    const { store, github, ops } = await workspace(t, {
      mode: "plans-repo",
      coder: "issue-radar",
      radar,
    });
    if (visibility === "public") publicRepository(github);
    const { plan } = await approve(ops, store, "name", [
      leaf("name-leaf", "code"),
    ]);
    if (refused) {
      await assert.rejects(
        ops.execute("github.project", { planId: plan.id }),
        /Show the plans repository name in issues/,
      );
      assert.equal(github.created.length, 0);
    } else {
      await ops.execute("github.project", { planId: plan.id });
      assert.deepEqual(repositoriesOf(github), ["example/code"]);
    }
  });

test("single-repo and coder worker never need the switch", async (t) => {
  for (const [mode, coder] of [
    ["single-repo", "issue-radar"],
    ["plans-repo", "worker"],
  ]) {
    const { store, github, ops } = await workspace(t, { mode, coder });
    publicRepository(github);
    const { plan } = await approve(ops, store, "no-switch", [
      leaf("no-switch-leaf", mode === "plans-repo" ? "planning" : "code"),
    ]);
    await ops.execute("github.project", { planId: plan.id });
    assert.equal(github.created.length, 1);
  }
});

test("a content rule that blocks the plans repository name stops the projection before any write", async (t) => {
  const { store, github, ops } = await workspace(t, {
    mode: "plans-repo",
    coder: "issue-radar",
    blockTerm: "example/planning",
  });
  const { plan } = await approve(ops, store, "blocked-name", [
    leaf("blocked-leaf", "code"),
  ]);
  await assert.rejects(
    ops.execute("github.project", { planId: plan.id }),
    /content rule blocks the plans repository name/,
  );
  assert.equal(github.created.length, 0);
});

test("a coder change leaves a handed-over task with its coder and shows the split once", async (t) => {
  const { store, ops } = await workspace(t, {
      mode: "single-repo",
      coder: "issue-radar",
    }),
    file = path.join(ops.workspaceRoot, ".avoozl.json"),
    setCoder = (coder, capacity) => {
      const config = JSON.parse(fs.readFileSync(file, "utf8"));
      Object.assign(config.github.repositories["example/code"], {
        coder,
        release: { capacity },
      });
      fs.writeFileSync(file, JSON.stringify(config));
    },
    handed = new Set(),
    restore = registerCoderAdapter("remote", {
      usesMergePath: false,
      handOver: async ({ issue }) => handed.add(issue.number),
      readState: () => ({ state: "filed" }),
      countsAsDone: () => false,
    });
  t.after(restore);
  setCoder("issue-radar", 1);
  const { plan } = await approve(ops, store, "split", [
    leaf("split-a", "code"),
    leaf("split-b", "code"),
  ]);
  await ops.execute("github.project", { planId: plan.id });
  assert.equal(handed.size, 0);
  setCoder("remote", 2);
  const second = await ops.execute("github.project", { planId: plan.id });
  // One task keeps Radar, the other goes to the new coder; one notice.
  assert.equal(handed.size, 1);
  assert.equal(
    second.notes.filter((note) => /now uses remote/.test(note)).length,
    1,
  );
  const third = await ops.execute("github.project", { planId: plan.id });
  assert.equal(handed.size, 1);
  assert.equal(
    third.notes.filter((note) => /now uses remote/.test(note)).length,
    0,
  );
});
