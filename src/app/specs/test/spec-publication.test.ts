// @ts-nocheck: typing debt
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.ts";
import {
  publishApproved,
  publishSpec,
  queuePublish,
} from "../spec-publication.ts";
import { planningIdentity } from "../../github/github-marker.ts";
import { fixture } from "../../test/fixtures.ts";
import { FakeGitHub } from "../../test/fake-github.ts";
import { writeSpec } from "../../test/spec-fixture.ts";
import { temporaryDirectory } from "../../test/temporary.ts";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const REPOSITORY = "example/code";

async function workspace(t, { github = new FakeGitHub(), mode } = {}) {
  const { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_testtesttesttest",
      github: mode
        ? { mode, repositories: { [REPOSITORY]: { baseBranch: "main" } } }
        : { mode: "local" },
    }),
  );
  const ops = new Operations(store, {
    github: mode ? github : null,
    operator: "Operator",
    workspaceRoot: root,
    driver: { settingsFile: path.join(temporaryDirectory(), "driver.json") },
  });
  store.put("repositories", {
    id: "code",
    root,
    baseBranch: "main",
    worktreeRoot: "/tmp/code-worktrees",
    checks: [["npm", "test"]],
  });
  if (mode)
    await ops.execute("github.configure", {
      repository: REPOSITORY,
      repositoryId: "code",
      allowedActors: ["maintainer"],
    });
  writeSpec(root, "config");
  const plan = await ops.execute("plan.create", {
    spec: "config",
    prompt: "Load config",
    context: { repositoryId: "code" },
  });
  return { store, root, ops, github, plan };
}

const writes = (github) => ({
  created: github.created.length,
  updated: github.updated.length,
  labels: github.labels.length,
  comments: github.comments.length,
  subIssues: github.subIssues.length,
});

test("approval makes no GitHub write; Publish issue makes one labeled issue once", async (t) => {
  const w = await workspace(t, { mode: "single-repo" });
  const before = writes(w.github);
  await w.ops.execute("plan.approve", {
    id: w.plan.id,
    expectedHash: w.plan.hash,
    expectedRevision: w.store.read().revision,
  });
  assert.equal(w.store.get("plans", w.plan.id).state, "approved");
  assert.deepEqual(writes(w.github), before);

  await assert.rejects(
    w.ops.execute("spec.publish", { planId: w.plan.id }, undefined, {
      mcp: true,
    }),
    /Only a person/,
  );
  const published = await w.ops.execute("spec.publish", { planId: w.plan.id });
  assert.equal(published.home, "github");
  assert.equal(published.existing, false);
  assert.equal(w.github.created.length, 1);
  assert.deepEqual(w.github.created[0].labels, [], "no label");
  // No label edit after the create.
  assert.equal(w.github.labels.length, before.labels);
  const again = await w.ops.execute("spec.publish", { planId: w.plan.id });
  assert.equal(again.existing, true);
  assert.equal(again.number, published.number);
  assert.equal(w.github.created.length, 1);
});

test("an issue the workspace already holds for the spec keeps its ownership", async (t) => {
  const w = await workspace(t, { mode: "single-repo" });
  w.store.put("receipts", {
    id: `github-parent:plan:${w.plan.id}`,
    kind: "github-parent",
    level: "plan",
    parentId: w.plan.id,
    repository: REPOSITORY,
    number: 12,
  });
  const published = await w.ops.execute("spec.publish", { planId: w.plan.id });
  assert.deepEqual(
    { existing: published.existing, number: published.number },
    { existing: true, number: 12 },
  );
  assert.equal(w.github.created.length, 0);
});

test("a spec in an epic gets the epic issue and is made under it, both labeled", async (t) => {
  const w = await workspace(t, { mode: "single-repo" });
  w.store.mutate("Add an epic", (data) => {
    data.epics = [
      {
        id: "launch",
        title: "Launch",
        planId: "launch-plan",
        listed: [w.plan.id],
        plans: [w.plan.id],
      },
    ];
  });
  const published = await publishSpec(w.store, {
    github: w.github,
    workspaceRoot: w.root,
    identity: planningIdentity(w.root),
    planId: w.plan.id,
    actor: "Operator",
  });
  assert.equal(w.github.created.length, 2);
  for (const issue of w.github.created) assert.deepEqual(issue.labels, []);
  const [epic, spec] = w.github.created;
  assert.equal(published.epicNumber, epic.number);
  assert.deepEqual(w.github.subIssues, [[epic.number, spec.id]]);
  assert.equal(
    w.store.get("receipts", "github-parent:epic:launch").number,
    epic.number,
  );
});

test("a workspace without GitHub cannot make the issues", async (t) => {
  const w = await workspace(t);
  await assert.rejects(
    w.ops.execute("spec.publish", { planId: w.plan.id }),
    /needs GitHub; run gh auth login/,
  );
});

test("a plan's input issue in the spec's home becomes its spec issue", async (t) => {
  const w = await workspace(t, { mode: "single-repo" });
  w.github.created.push({
    id: 7,
    node_id: "issue-7",
    number: 7,
    state: "open",
    labels: [],
    html_url: "https://example.test/issues/7",
  });
  const plan = w.store.get("plans", w.plan.id);
  w.store.put("plans", {
    ...plan,
    context: {
      ...plan.context,
      newPlan: { source: { repository: REPOSITORY, number: 7 } },
    },
  });
  const published = await w.ops.execute("spec.publish", { planId: w.plan.id });
  assert.deepEqual(
    { reused: published.reused, number: published.number },
    { reused: true, number: 7 },
  );
  assert.equal(w.github.created.length, 1, "no new issue");
  const added = () => w.github.labels.filter(([kind]) => kind === "add");
  assert.deepEqual(added(), [], "no label");
  const again = await w.ops.execute("spec.publish", { planId: w.plan.id });
  assert.equal(again.existing, true);
  assert.equal(added().length, 0);
});

test("an input issue in another repository is not reused", async (t) => {
  const w = await workspace(t, { mode: "single-repo" });
  const plan = w.store.get("plans", w.plan.id);
  w.store.put("plans", {
    ...plan,
    context: {
      ...plan.context,
      newPlan: { source: { repository: "example/other", number: 7 } },
    },
  });
  const published = await w.ops.execute("spec.publish", { planId: w.plan.id });
  assert.equal(published.reused, undefined);
  assert.equal(w.github.created.length, 1);
  assert.notEqual(published.number, 7);
});

// An approved plan queued for publishing as approval commit `c1`, with the
// approval evidence `proof` and GitHub signed in as `login`.
async function queued(t, { proof = {}, login = "maintainer", pull } = {}) {
  const w = await workspace(t, { mode: "single-repo" });
  await w.ops.execute("plan.approve", {
    id: w.plan.id,
    expectedHash: w.plan.hash,
    expectedRevision: w.store.read().revision,
  });
  w.github.login = login;
  w.github.pullRequest = async (_repository, number) =>
    number === pull?.number ? pull : null;
  w.github.commit = async () => ({ author: { login: "maintainer" } });
  queuePublish(w.store, w.plan.id, "c1");
  const run = () =>
    publishApproved(w.store, {
      github: w.github,
      identity: planningIdentity(w.root),
      evidence: { get: (commit) => (commit === "c1" ? proof : undefined) },
      homeOf: async () => REPOSITORY,
    });
  return { ...w, run };
}

test("the merger of an approving pull request publishes its spec issue with the pull request's assignees", async (t) => {
  const w = await queued(t, {
    proof: { mergedBy: "maintainer", pull: 7 },
    pull: { number: 7, assignees: [{ login: "alice" }] },
  });
  assert.deepEqual(await w.run(), []);
  assert.equal(w.github.created.length, 1);
  assert.deepEqual(w.github.created[0].assignees, [{ login: "alice" }]);
  assert.match(w.github.created[0].body, /^<!-- avoozl-spec:config -->$/m);
  // Published once: the next tick writes nothing.
  assert.deepEqual(await w.run(), []);
  assert.equal(w.github.created.length, 1);
});

test("an approval with no pull request publishes an unassigned spec issue", async (t) => {
  const w = await queued(t, { proof: { pushedBy: "maintainer" } });
  await w.run();
  assert.equal(w.github.created.length, 1);
  assert.deepEqual(w.github.created[0].assignees, []);
});

test("a runner that is not the approver makes no issue", async (t) => {
  const w = await queued(t, {
    proof: { mergedBy: "maintainer", pull: 7 },
    login: "someone-else",
  });
  await w.run();
  assert.equal(w.github.created.length, 0);
  // Dropped from the queue: the approver's runner publishes it.
  await w.run();
  assert.equal(w.github.created.length, 0);
});

test("with no evidence the commit author's login decides who publishes", async (t) => {
  const w = await queued(t);
  await w.run();
  assert.equal(w.github.created.length, 1);
});

test("an open issue with the spec's marker is used, not made again", async (t) => {
  const w = await queued(t, { proof: { mergedBy: "maintainer" } });
  w.store.put("repositories", {
    ...w.store.get("repositories", "code"),
    github: REPOSITORY,
  });
  w.github.listIssues = async () => [
    {
      number: 5,
      state: "open",
      author_association: "OWNER",
      body: "<!-- avoozl-spec:config -->",
    },
  ];
  await w.run();
  assert.equal(w.github.created.length, 0);
  assert.equal(
    w.store.get("receipts", `github-parent:plan:${w.plan.id}`).number,
    5,
  );
});

test("a failed publish stays queued for the next tick", async (t) => {
  const w = await queued(t, { proof: { mergedBy: "maintainer" } });
  const create = w.github.createIssue.bind(w.github);
  w.github.createIssue = async () => {
    throw new Error("GitHub is down");
  };
  assert.deepEqual(
    (await w.run()).map((failed) => failed.error),
    ["GitHub is down"],
  );
  w.github.createIssue = create;
  await w.run();
  assert.equal(w.github.created.length, 1);
});

test("a local-only workspace publishes nothing on approval", async (t) => {
  const w = await workspace(t);
  queuePublish(w.store, w.plan.id, "c1");
  const github = new FakeGitHub();
  assert.deepEqual(
    await publishApproved(w.store, {
      github,
      identity: planningIdentity(w.root),
      evidence: { get: () => ({ mergedBy: "worker" }) },
      homeOf: async () => REPOSITORY,
    }),
    [],
  );
  assert.equal(github.created.length, 0);
});
