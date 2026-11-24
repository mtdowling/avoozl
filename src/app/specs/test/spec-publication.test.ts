import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { Operations } from "../../api/operations.ts";
import {
  publishApproved,
  publishSpec,
  queuePublish,
  readSpecIssues,
} from "../spec-publication.ts";
import { planningIdentity } from "../../github/github-marker.ts";
import { fixture } from "../../test/fixtures.ts";
import { FakeGitHub } from "../../test/fake-github.ts";
import { writeSpec } from "../../test/spec-fixture.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { found, storedRow, type PlanDraft } from "../../test/view-shapes.ts";

// The fake GitHub with the two reads publishing makes typed as present.
// shortcut: they stay absent until a test sets them, as before; a path that
// reaches them unset fails the same way it did untyped.
class PublishingGitHub extends FakeGitHub {
  declare commit: (
    repository: string,
    sha: string,
  ) => Promise<{ author?: { login?: string } } | null>;
  declare pullRequest: (
    repository: string,
    number: unknown,
  ) => Promise<{ number?: number; assignees?: { login?: string }[] } | null>;
}
// What spec.publish answers.
interface Published {
  home: string;
  existing: boolean;
  reused?: boolean;
  number: number;
}
// A plan row's context.
interface PlanRow {
  id: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

const REPOSITORY = "example/code";

async function workspace(
  t: TestContext,
  {
    github = new PublishingGitHub(),
    mode,
  }: { github?: PublishingGitHub; mode?: string } = {},
) {
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
  const plan = await ops.execute<PlanDraft>("plan.create", {
    spec: "config",
    prompt: "Load config",
    context: { repositoryId: "code" },
  });
  return { store, root, ops, github, plan };
}

const writes = (github: FakeGitHub) => ({
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
  assert.equal(storedRow(w.store, "plans", w.plan.id).state, "approved");
  assert.deepEqual(writes(w.github), before);

  const published = await w.ops.execute<Published>(
    "spec.publish",
    { planId: w.plan.id },
    undefined,
    { mcp: true },
  );
  assert.equal(published.home, "github");
  assert.equal(published.existing, false);
  assert.equal(w.github.created.length, 1);
  assert.deepEqual(w.github.created[0]?.labels, [], "no label");
  // No label edit after the create.
  assert.equal(w.github.labels.length, before.labels);
  const again = await w.ops.execute<Published>("spec.publish", {
    planId: w.plan.id,
  });
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
  const published = await w.ops.execute<Published>("spec.publish", {
    planId: w.plan.id,
  });
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
    identity: planningIdentity(w.root),
    planId: w.plan.id,
  });
  assert.equal(w.github.created.length, 2);
  for (const issue of w.github.created) assert.deepEqual(issue.labels, []);
  const [epic, spec] = w.github.created;
  assert.ok(epic && spec);
  assert.ok("epicNumber" in published);
  assert.equal(published.epicNumber, epic.number);
  assert.deepEqual(w.github.subIssues, [[epic.number, spec.id]]);
  assert.equal(
    storedRow(w.store, "receipts", "github-parent:epic:launch").number,
    epic.number,
  );
});

test("a workspace without GitHub cannot make the issues", async (t) => {
  const w = await workspace(t);
  await assert.rejects(
    w.ops.execute<Published>("spec.publish", { planId: w.plan.id }),
    /needs GitHub; run gh auth login/,
  );
});

test("a plan's input issue in the spec's home becomes its spec issue", async (t) => {
  const w = await workspace(t, { mode: "single-repo" });
  w.github.created.push({
    id: 7,
    node_id: "issue-7",
    number: 7,
    repository: REPOSITORY,
    state: "open",
    labels: [],
    title: "Issue 7",
    body: "",
    html_url: "https://example.test/issues/7",
    assignees: [],
  });
  const plan = storedRow<PlanRow>(w.store, "plans", w.plan.id);
  w.store.put("plans", {
    ...plan,
    context: {
      ...plan.context,
      newPlan: { source: { repository: REPOSITORY, number: 7 } },
    },
  });
  const published = await w.ops.execute<Published>("spec.publish", {
    planId: w.plan.id,
  });
  assert.deepEqual(
    { reused: published.reused, number: published.number },
    { reused: true, number: 7 },
  );
  assert.equal(w.github.created.length, 1, "no new issue");
  const added = () => w.github.labels.filter(([kind]) => kind === "add");
  assert.deepEqual(added(), [], "no label");
  const again = await w.ops.execute<Published>("spec.publish", {
    planId: w.plan.id,
  });
  assert.equal(again.existing, true);
  assert.equal(added().length, 0);
});

test("an input issue in another repository is not reused", async (t) => {
  const w = await workspace(t, { mode: "single-repo" });
  const plan = storedRow<PlanRow>(w.store, "plans", w.plan.id);
  w.store.put("plans", {
    ...plan,
    context: {
      ...plan.context,
      newPlan: { source: { repository: "example/other", number: 7 } },
    },
  });
  const published = await w.ops.execute<Published>("spec.publish", {
    planId: w.plan.id,
  });
  assert.equal(published.reused, undefined);
  assert.equal(w.github.created.length, 1);
  assert.notEqual(published.number, 7);
});

// An approved plan queued for publishing as approval commit `c1`, with the
// approval evidence `proof` and GitHub signed in as `login`.
async function queued(
  t: TestContext,
  {
    proof = {},
    login = "maintainer",
    pull,
  }: {
    proof?: Record<string, unknown>;
    login?: string;
    pull?: { number: number; assignees: { login: string }[] };
  } = {},
) {
  const w = await workspace(t, { mode: "single-repo" });
  await w.ops.execute("plan.approve", {
    id: w.plan.id,
    expectedHash: w.plan.hash,
    expectedRevision: w.store.read().revision,
  });
  w.github.login = login;
  w.github.pullRequest = async (_repository, number) =>
    number === pull?.number ? (pull ?? null) : null;
  w.github.commit = async () => ({ author: { login: "maintainer" } });
  queuePublish(w.store, w.plan.id, "c1");
  const run = () =>
    publishApproved(w.store, {
      github: w.github,
      identity: planningIdentity(w.root),
      evidence: {
        get: (commit: string) => (commit === "c1" ? proof : undefined),
      },
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
  assert.deepEqual(w.github.created[0]?.assignees, [{ login: "alice" }]);
  assert.match(
    w.github.created[0]?.body ?? "",
    /^<!-- avoozl-spec:config -->$/m,
  );
  // Published once: the next tick writes nothing.
  assert.deepEqual(await w.run(), []);
  assert.equal(w.github.created.length, 1);
});

test("an approval with no pull request publishes an unassigned spec issue", async (t) => {
  const w = await queued(t, { proof: { pushedBy: "maintainer" } });
  await w.run();
  assert.equal(w.github.created.length, 1);
  assert.deepEqual(w.github.created[0]?.assignees, []);
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
    ...storedRow(w.store, "repositories", "code"),
    github: REPOSITORY,
  });
  w.github.listIssues = async () => [
    {
      id: 5,
      node_id: "issue-5",
      number: 5,
      repository: REPOSITORY,
      state: "open",
      labels: [],
      title: "Spec config",
      html_url: "https://example.test/issues/5",
      assignees: [],
      author_association: "OWNER",
      body: "<!-- avoozl-spec:config -->",
    },
  ];
  await w.run();
  assert.equal(w.github.created.length, 0);
  assert.equal(
    storedRow(w.store, "receipts", `github-parent:plan:${w.plan.id}`).number,
    5,
  );
});

test("an older marker issue by a read-only member loses to the writer's newer one", async (t) => {
  const w = await queued(t, { proof: { mergedBy: "maintainer" } });
  w.store.put("repositories", {
    ...storedRow(w.store, "repositories", "code"),
    github: REPOSITORY,
  });
  const issue = (number: number, login: string) => ({
    id: number,
    node_id: `issue-${number}`,
    number,
    repository: REPOSITORY,
    state: "open",
    labels: [],
    title: "Spec config",
    html_url: `https://example.test/issues/${number}`,
    assignees: [],
    author_association: "MEMBER",
    user: { login },
    body: "<!-- avoozl-spec:config -->",
  });
  w.github.listIssues = async () => [
    issue(5, "reader"),
    issue(6, "reader"),
    issue(9, "maintainer"),
  ];
  w.github.permissions.set("reader", "read");
  w.github.permissions.set("maintainer", "write");
  const asked: string[] = [],
    permission = w.github.permission.bind(w.github);
  w.github.permission = (repository, login) => {
    asked.push(login);
    return permission(repository, login);
  };
  assert.deepEqual((await readSpecIssues(w.store, w.github)).errors, []);
  assert.equal(
    storedRow(w.store, "receipts", `github-parent:plan:${w.plan.id}`).number,
    9,
  );
  // Nothing is closed, and each author's permission is read once.
  assert.deepEqual(w.github.updated, []);
  assert.deepEqual(asked, ["reader", "maintainer"]);
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
  const github = new PublishingGitHub();
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

// A spec approved before its checkout had a GitHub name: never queued, no
// github.configure row, no github.mode. The checkout's GitHub name is enough.
async function approvedEarlier(t: TestContext, login = "maintainer") {
  const w = await workspace(t);
  await w.ops.execute("plan.approve", {
    id: w.plan.id,
    expectedHash: w.plan.hash,
    expectedRevision: w.store.read().revision,
  });
  const plan = storedRow(w.store, "plans", w.plan.id),
    approval = storedRow(w.store, "approvals", String(plan.approvalId));
  w.store.db.prepare("UPDATE approvals SET body=? WHERE id=?").run(
    JSON.stringify({
      ...approval,
      approvedBy: "maintainer@example.com",
      approval: { kind: "commit", commit: "c1" },
    }),
    String(plan.approvalId),
  );
  w.store.put("repositories", {
    ...storedRow(w.store, "repositories", "code"),
    github: REPOSITORY,
  });
  const github = new PublishingGitHub();
  github.login = login;
  let commits = 0;
  github.commit = async () => {
    commits += 1;
    return { author: { login: "maintainer" } };
  };
  const run = () =>
    publishApproved(w.store, {
      github,
      identity: planningIdentity(w.root),
      homeOf: async () => REPOSITORY,
    });
  return { ...w, github, run, commits: () => commits };
}

test("the tick publishes an approved spec with work left that was never queued", async (t) => {
  const w = await approvedEarlier(t);
  assert.equal(w.store.list("github_repositories").length, 0);
  assert.deepEqual(await w.run(), []);
  assert.equal(w.github.created.length, 1);
  assert.match(
    w.github.created[0]?.body ?? "",
    /^<!-- avoozl-spec:config -->$/m,
  );
  assert.deepEqual(await w.run(), []);
  assert.equal(w.github.created.length, 1, "published once");
});

test("the tick makes no issue for an approved spec whose work is all done", async (t) => {
  const w = await approvedEarlier(t);
  w.store.mutate("Finish the spec", (data) => {
    for (const task of data.tasks)
      if (task.planId === w.plan.id) task.status = "accepted";
  });
  assert.deepEqual(await w.run(), []);
  assert.equal(w.github.created.length, 0);
});

test("a runner that did not approve an unqueued spec reads its commit once", async (t) => {
  const w = await approvedEarlier(t, "someone-else");
  await w.run();
  await w.run();
  assert.equal(w.github.created.length, 0);
  assert.equal(w.commits(), 1);
});
