// Task 3.10: `avoozl rebuild` (design §3.3, R14.3). Fake GitHub only: a plan
// is projected, one leaf is closed by order, SQLite is wiped, and rebuild
// must restore the same tasks, edges, epics, fields and orders.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest } from "../../model.mjs";
import { taskAuthority, taskKind } from "../../work-model.mjs";
import { parseManagedSection } from "../github-rebuild.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// No machine-wide Avoozl configuration leaks into these workspaces.
process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const NAMESPACE = "avz_rebuildrebuild12",
  REPO = "example/code";

const option = (id, name) => ({ id, name: { raw: name, html: name } });
const FIELDS = [
  {
    id: 1,
    name: "Status",
    data_type: "single_select",
    options: [option("s-todo", "Todo"), option("s-done", "Done")],
  },
  {
    id: 2,
    name: "Release",
    data_type: "single_select",
    options: [option("r-one", "one"), option("r-two", "two")],
  },
  { id: 3, name: "Wave", data_type: "number" },
];

// FakeGitHub plus a Project board and close-without-code reads.
function fakeGitHub() {
  const github = new FakeGitHub(),
    items = [];
  github.items = items;
  github.closingPullRequests = async () => [];
  github.projectV2 = async () => ({
    id: 7,
    node_id: "PVT_rebuild",
    number: 7,
    base: "/orgs/example/projectsV2/7",
    scopes: "project, repo",
  });
  github.projectFields = async () => structuredClone(FIELDS);
  github.projectItems = async () => structuredClone(items);
  github.projectStatusChanges = async () => [];
  github.addProjectItem = async (_, { number }) => {
    const issue = github.created.find((entry) => entry.number === number),
      item = {
        id: 100 + items.length,
        content_type: "Issue",
        content: { node_id: issue.node_id, number },
        fields: [],
      };
    items.push(item);
    return structuredClone(item);
  };
  github.updateProjectItem = async (_, id, fields) => {
    const item = items.find((entry) => entry.id === id);
    for (const { id: fieldId, value } of fields) {
      const field = FIELDS.find((entry) => entry.id === fieldId);
      item.fields = item.fields.filter((entry) => entry.id !== fieldId);
      item.fields.push({
        id: fieldId,
        value:
          field.data_type === "number"
            ? value
            : field.options.find((entry) => entry.id === value),
      });
    }
    return {};
  };
  return github;
}

function avoozlJson(root, allowedActors = ["maintainer"]) {
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode: "single-repo",
        project: { owner: "example", number: 7 },
        repositories: {
          [REPO]: { baseBranch: "main", allowedActors },
        },
      },
    }),
  );
}

// A fresh workspace database with the same configuration: the code project
// and the registered repository come from configuration, not from GitHub.
async function openWorkspace(t, root, github, codeRoot = "/tmp/code") {
  const dir = temporaryDirectory("avoozl-rebuild-"),
    store = new Store(path.join(dir, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot(snapshot());
  store.put("projects", {
    id: "code",
    root: codeRoot,
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [["npm", "test"]],
  });
  const ops = new Operations(store, {
    github,
    operator: "Operator",
    workspaceRoot: root,
  });
  await ops.execute("github.configure", {
    repository: REPO,
    projectId: "code",
    allowedActors: ["maintainer"],
  });
  return { store, ops };
}

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  summary: "Summary " + id,
  acceptance: [id + " passes"],
  projectId: "code",
  ...extra,
});

// epic E holds alpha, bravo, charlie and delta; bravo requires alpha at
// integrated, delta requires alpha, charlie follows alpha, and bravo
// supports charlie.
async function projectedGraph(t) {
  const root = temporaryDirectory("avoozl-plan-"),
    github = fakeGitHub();
  avoozlJson(root);
  const { store, ops } = await openWorkspace(t, root, github),
    tasks = [
      { id: "epic", kind: "epic", title: "The epic", projectId: "code" },
      leaf("alpha", { milestone: "one" }),
      leaf("bravo", {
        milestone: "two",
        requires: [{ task: "alpha", condition: "integrated" }],
      }),
      leaf("charlie", { milestone: "one", sequence: ["alpha"] }),
      leaf("delta", { milestone: "one", requires: ["alpha"] }),
    ];
  const plan = await ops.execute("plan.create", {
      id: "graph",
      prompt: "Project the graph",
      text:
        "# graph\n\n" +
        tasks
          .map((task) => "```task\n" + JSON.stringify(task) + "\n```\n")
          .join("\n"),
    }),
    approved = await ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
    }),
    [epicId, alphaId, bravoId, charlieId] = approved.taskIds;
  store.mutate("Nest and connect", (data) => {
    for (const task of data.tasks)
      if (approved.taskIds.slice(1).includes(task.id)) task.parent = epicId;
    data.edges.push({
      id: `${bravoId}:supports:${charlieId}`,
      from: bravoId,
      to: charlieId,
      kind: "supports",
      planId: plan.id,
    });
  });
  await ops.execute("github.project", { planId: plan.id });
  // An allowed actor closes alpha with no merged closing pull request.
  const alpha = github.created.find((issue) => issue.body.includes(alphaId));
  Object.assign(alpha, {
    state: "closed",
    state_reason: "completed",
    closed_at: "2026-11-12T08:00:00Z",
    updated_at: "2026-11-12T08:00:00Z",
  });
  github.events.set(alpha.number, [
    {
      event: "closed",
      actor: { login: "maintainer" },
      created_at: "2026-11-12T08:00:00Z",
      state_reason: "completed",
    },
  ]);
  await ops.execute("workspace.tick", { sessions: [] });
  return { root, github, store, ops, ids: approved.taskIds, alphaId };
}

// The GitHub-owned state of a workspace, without what only this machine
// knows (design source, timestamps, machine ID).
function graphState(store, { verdicts = "all" } = {}) {
  const data = store.read(),
    complete = (task) =>
      data.statuses.find((status) => status.id === task.status)?.complete,
    tasks = data.tasks
      .filter((task) => taskAuthority(task) === "github")
      .map((task) => ({
        id: task.id,
        title: task.title,
        summary: task.summary,
        nextAction: task.nextAction,
        acceptance: task.acceptance,
        kind: taskKind(task),
        parent: task.parent ?? null,
        status: task.status,
        planId: task.planId,
        planHash: task.planHash,
        projectId: task.projectId,
        milestone: task.milestone ?? null,
        github: task.github,
        // A done task's ready flag is never read again.
        ready: complete(task) ? null : (task.dispatch?.ready ?? false),
        // Open verdicts are the tick's to judge after a rebuild.
        verdict: (verdicts === "all" ||
          task.githubVerdict?.state === "order") &&
          task.githubVerdict && {
            state: task.githubVerdict.state,
            order: task.githubVerdict.order,
            issue: task.githubVerdict.issue,
            key: task.githubVerdict.key,
          },
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    ids = new Set(tasks.map((task) => task.id)),
    edges = data.edges
      .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
      .map(({ id, from, to, kind, condition }) => ({
        id,
        from,
        to,
        kind,
        condition: condition ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    orders = store
      .list("receipts")
      .filter((receipt) => receipt.id.startsWith("github-order:"))
      .map(({ id, taskId, number, actor, reason, closedAt }) => ({
        id,
        taskId,
        number,
        actor,
        reason,
        closedAt,
      })),
    issues = store
      .list("github_issues")
      .map(({ id, taskId, number, bodyHash, managedBlockerIssueIds }) => ({
        id,
        taskId,
        number,
        bodyHash,
        managedBlockerIssueIds,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  return { tasks, edges, orders, issues };
}

test("rebuild restores tasks, edges, epics, fields and orders from GitHub alone", async (t) => {
  const { root, github, store, ids, alphaId } = await projectedGraph(t),
    before = graphState(store),
    [epicId, , bravoId] = ids;
  // The setup reached the states rebuild must restore.
  assert.equal(before.tasks.length, 5);
  assert.equal(before.edges.length, 4);
  const alpha = before.tasks.find((task) => task.id === alphaId);
  assert.equal(alpha.verdict.state, "order");
  assert.equal(alpha.milestone, "one");
  assert.equal(before.orders.length, 1);
  assert.equal(before.tasks.find((task) => task.id === bravoId).parent, epicId);
  const writes = github.updated.length;

  // Wipe SQLite: a new database with the same configuration, plus one local
  // task that rebuild must leave byte for byte.
  const fresh = await openWorkspace(t, root, github);
  fresh.store.mutate("Add a local task", (data) => {
    data.tasks.push({
      id: "local-only",
      title: "Local only",
      scope: "catalog",
      status: "planned",
      epic: "sample",
      track: "catalog",
      tags: [],
      authority: "local",
    });
  });
  const localBefore = JSON.stringify(
    fresh.store.read().tasks.find((task) => task.id === "local-only"),
  );
  const result = await fresh.ops.execute("github.rebuild", {});
  assert.deepEqual(result.conflicts, []);
  // A fenced plan file is not a spec folder, so its plan row stays missing.
  assert.deepEqual(result.notes, [
    "Plan graph is not rebuilt: no spec folder .kiro/specs/graph/ is found.",
  ]);
  assert.deepEqual(result.plans, []);
  assert.equal(result.tasks.length, 5);
  assert.deepEqual(
    graphState(fresh.store, { verdicts: "orders" }),
    graphState(store, { verdicts: "orders" }),
  );
  for (const task of fresh.store.read().tasks.filter((row) => row.github))
    assert.equal(
      task.github.bodyHash,
      digest(
        github.created.find((issue) => issue.number === task.github.number)
          .body,
      ),
    );
  assert.equal(
    JSON.stringify(
      fresh.store.read().tasks.find((task) => task.id === "local-only"),
    ),
    localBefore,
  );
  // The board was read: Release and Wave per task.
  assert.deepEqual(result.project[bravoId], {
    Status: null,
    Release: "two",
    Wave: 2,
    Iteration: null,
  });
  // Rebuild only reads GitHub.
  assert.equal(github.updated.length, writes);

  // A second run writes nothing.
  const revision = fresh.store.read().revision,
    again = await fresh.ops.execute("github.rebuild", {});
  assert.equal(again.written, false);
  assert.equal(fresh.store.read().revision, revision);

  // The tick that follows keeps the order even though the policy no longer
  // allows its actor (§3.4), and writes nothing to GitHub.
  avoozlJson(root, ["someone-else"]);
  await fresh.ops.execute("workspace.tick", { sessions: [] });
  assert.deepEqual(graphState(fresh.store), before);
  assert.equal(github.updated.length, writes);
});

test("the order write keeps stored body hashes, so the next tick and projection see no edit", async (t) => {
  const { github, store, ops, alphaId } = await projectedGraph(t),
    alpha = github.created.find((issue) => issue.body.includes(alphaId)),
    current = digest(alpha.body);
  // The tick wrote the marker order into alpha's body.
  assert.match(alpha.body, /"order":\{"actor":"maintainer"/);
  const row = store.read().tasks.find((task) => task.id === alphaId),
    record = store
      .list("github_issues")
      .find((entry) => entry.taskId === alphaId);
  assert.equal(row.github.bodyHash, current);
  assert.equal(record.bodyHash, current);
  assert.equal(record.body, alpha.body);
  // A second tick writes nothing to GitHub, and projecting again finds no
  // conflict on any issue.
  const writes = github.updated.length;
  await ops.execute("workspace.tick", { sessions: [] });
  assert.equal(github.updated.length, writes);
  const planId = row.planId,
    projected = await ops.execute("github.project", { planId });
  assert.deepEqual(projected.conflicts, []);
  assert.equal(
    store.list("github_issues").some((entry) => entry.state === "conflict"),
    false,
  );
  assert.equal(
    store.read().tasks.find((task) => task.id === alphaId).github.bodyHash,
    digest(alpha.body),
  );
});

test("rebuild restores an approved spec plan row from its folder", async (t) => {
  const root = temporaryDirectory("avoozl-plan-"),
    code = temporaryDirectory("avoozl-code-"),
    github = fakeGitHub();
  avoozlJson(root);
  writeSpec(code, "config");
  const { store, ops } = await openWorkspace(t, root, github, code),
    plan = await ops.execute("plan.create", {
      spec: "config",
      context: { projectId: "code" },
    }),
    approved = await ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
    });
  await ops.execute("github.project", { planId: plan.id });
  const writes = github.updated.length,
    created = github.created.length,
    original = store.get("plans", plan.id);

  const fresh = await openWorkspace(t, root, github, code),
    result = await fresh.ops.execute("github.rebuild", {});
  assert.deepEqual(result.notes, []);
  assert.deepEqual(result.plans, ["config"]);
  const rebuilt = fresh.store.get("plans", "config");
  for (const key of ["spec", "title", "text", "files", "hash", "state"])
    assert.deepEqual(rebuilt[key], original[key], key);
  assert.deepEqual(
    Object.keys(rebuilt.mapping).sort(),
    [...approved.taskIds].sort(),
  );
  const receipt = fresh.store.get("approvals", rebuilt.approvalId);
  assert.equal(receipt.hash, original.hash);
  assert.deepEqual(receipt.files, original.files);
  // The design fields GitHub does not carry come back from the folder.
  const before = store.read(),
    after = fresh.store.read();
  for (const id of approved.taskIds) {
    const was = before.tasks.find((task) => task.id === id),
      now = after.tasks.find((task) => task.id === id);
    for (const key of [
      "completion",
      "checks",
      "source",
      "approvedSource",
      "contextDocuments",
      "resources",
      "statusAuthority",
      "needsReview",
    ])
      assert.deepEqual(now[key], was[key], `${id} ${key}`);
  }
  assert.equal(
    after.documents["spec:config"].text,
    before.documents["spec:config"].text,
  );

  // The rebuilt plan projects again onto the same issues and changes none.
  const projected = await fresh.ops.execute("github.project", {
    planId: "config",
  });
  assert.deepEqual(projected.conflicts, []);
  assert.equal(github.created.length, created);
  assert.equal(github.updated.length, writes);

  // A second rebuild writes nothing.
  const revision = fresh.store.read().revision,
    again = await fresh.ops.execute("github.rebuild", {});
  assert.equal(again.written, false);
  assert.deepEqual(again.plans, []);
  assert.equal(fresh.store.read().revision, revision);
});

// P8's shape: one epic nesting three leaves in tasks.md, with a requires
// and a sequence edge, in single-repo mode with an Epic issue type.
test("a spec epic projects as one Epic parent with three sub-issues, and rebuild restores the parents", async (t) => {
  const root = temporaryDirectory("avoozl-plan-"),
    code = temporaryDirectory("avoozl-code-"),
    github = fakeGitHub();
  github.issueTypes = { example: ["Epic"] };
  avoozlJson(root);
  const config = JSON.parse(
    fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"),
  );
  config.github.epicIssueType = "Epic";
  fs.writeFileSync(path.join(root, ".avoozl.json"), JSON.stringify(config));
  const leafEntry = (extra = {}) => ({
    kind: "leaf",
    acceptance: ["It works."],
    checks: ["npm test"],
    ...extra,
  });
  writeSpec(code, "loader", {
    "tasks.md": [
      "# Tasks",
      "",
      "- [ ] 1 Load configuration",
      "  - [ ] 1.1 Read the file",
      "  - [ ] 1.2 Validate it",
      "  - [ ] 1.3 Report errors",
      "",
    ].join("\n"),
    "avoozl/manifest.json": JSON.stringify({
      tasks: {
        1: { kind: "epic", summary: "The goal." },
        1.1: leafEntry(),
        1.2: leafEntry({ requires: ["1.1"] }),
        1.3: leafEntry({ sequence: ["1.2"] }),
      },
    }),
  });
  const { store, ops } = await openWorkspace(t, root, github, code),
    plan = await ops.execute("plan.create", {
      spec: "loader",
      context: { projectId: "code" },
    });
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  await ops.execute("github.project", { planId: plan.id });
  const issueOf = (id) =>
      github.created.find((issue) => issue.body.includes(`"taskId":"${id}"`)),
    epic = issueOf("loader.1"),
    leaves = ["loader.1.1", "loader.1.2", "loader.1.3"].map(issueOf);
  assert.equal(epic.type?.name, "Epic");
  assert.equal(github.created.filter((issue) => issue.type).length, 1);
  assert.deepEqual(
    github.subIssues
      .filter(([parent]) => parent === epic.number)
      .map(([, id]) => id)
      .sort(),
    leaves.map((issue) => issue.id).sort(),
  );
  assert.equal(github.subIssues.length, 3);
  for (const issue of leaves) assert.match(issue.body, /"parent":"loader\.1"/);
  // Blocked-by links follow the requires and sequence edges.
  const blockedBy = (issue) => [
    ...(github.blockers.get(`${REPO}#${issue.number}`)?.keys() || []),
  ];
  assert.deepEqual(leaves.map(blockedBy), [[], [leaves[0].id], [leaves[1].id]]);

  // A second apply links nothing new.
  const links = github.subIssues.length,
    created = github.created.length;
  await ops.execute("github.project", { planId: plan.id });
  assert.equal(github.subIssues.length, links);
  assert.equal(github.created.length, created);

  // Rebuild restores the same parent on every task.
  const fresh = await openWorkspace(t, root, github, code);
  await fresh.ops.execute("github.rebuild", {});
  const parents = (target) =>
    Object.fromEntries(
      target
        .read()
        .tasks.filter((task) => task.id.startsWith("loader."))
        .map((task) => [task.id, task.parent ?? null]),
    );
  assert.deepEqual(parents(store), {
    "loader.1": null,
    "loader.1.1": "loader.1",
    "loader.1.2": "loader.1",
    "loader.1.3": "loader.1",
  });
  assert.deepEqual(parents(fresh.store), parents(store));
  assert.deepEqual(
    graphState(fresh.store, { verdicts: "orders" }).tasks.map(
      ({ id, parent, kind }) => [id, parent, kind],
    ),
    graphState(store, { verdicts: "orders" }).tasks.map(
      ({ id, parent, kind }) => [id, parent, kind],
    ),
  );
});

test("rebuild leaves the plan row out when its spec folder changed", async (t) => {
  const root = temporaryDirectory("avoozl-plan-"),
    code = temporaryDirectory("avoozl-code-"),
    github = fakeGitHub();
  avoozlJson(root);
  writeSpec(code, "config");
  const { store, ops } = await openWorkspace(t, root, github, code),
    plan = await ops.execute("plan.create", {
      spec: "config",
      context: { projectId: "code" },
    });
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  await ops.execute("github.project", { planId: plan.id });
  writeSpec(code, "config", { "design.md": "# Design\n\nChanged.\n" });
  const fresh = await openWorkspace(t, root, github, code),
    result = await fresh.ops.execute("github.rebuild", {});
  assert.deepEqual(result.plans, []);
  assert.equal(result.notes.length, 1);
  assert.match(result.notes[0], /^Plan config is not rebuilt: .*pin/);
  assert.equal(fresh.store.get("plans", "config"), null);
  // The tasks are still rebuilt.
  assert.equal(result.tasks.length, 3);
});

test("rebuild never touches a local task that shares an ID and skips duplicate issues", async (t) => {
  const { root, github, ids } = await projectedGraph(t),
    [, alphaId, bravoId] = ids,
    fresh = await openWorkspace(t, root, github);
  fresh.store.mutate("A local task with a GitHub task's ID", (data) => {
    data.tasks.push({
      id: bravoId,
      title: "Mine",
      scope: "catalog",
      status: "planned",
      epic: "sample",
      track: "catalog",
      tags: [],
      authority: "local",
    });
  });
  const alpha = github.created.find((issue) => issue.body.includes(alphaId));
  github.created.push({
    ...structuredClone(alpha),
    id: 900,
    number: 900,
    node_id: "issue-900",
  });
  const result = await fresh.ops.execute("github.rebuild", {}),
    data = fresh.store.read();
  assert.deepEqual(result.skipped, [
    { taskId: bravoId, reason: "A local task has this ID." },
  ]);
  assert.deepEqual(
    result.conflicts.map(({ taskId, field }) => [taskId, field]),
    [[alphaId, "identity"]],
  );
  assert.equal(data.tasks.find((task) => task.id === bravoId).title, "Mine");
  assert.equal(
    data.tasks.some((task) => task.id === alphaId),
    false,
  );
  // Edges into the skipped and conflicted tasks are not invented.
  assert.equal(
    data.edges.some((edge) => [alphaId, bravoId].includes(edge.from)),
    false,
  );
});

test("the managed section yields plan, summary, acceptance and requires", () => {
  const body = [
    "<!-- avoozl:managed:start -->",
    "This issue is projected from approved design `graph` at `0123456789ab`.",
    "",
    "Do the thing",
    "",
    "## Acceptance criteria",
    "",
    "- [ ] First",
    "- [x] Second",
    "",
    "## Dependencies",
    "",
    "- graph-alpha",
    "",
    "> Blocker graph-alpha closed without merged code.",
    "<!-- avoozl:managed:end -->",
  ].join("\n");
  assert.deepEqual(parseManagedSection(body), {
    planId: "graph",
    summary: "Do the thing",
    acceptance: ["First", "Second"],
    requires: ["graph-alpha"],
  });
});
