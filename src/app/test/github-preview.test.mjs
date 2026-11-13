// Task 3.12: the projection preview lists exactly the writes a real
// projection then makes, and makes none itself. Fake GitHub only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { WORKSPACE_TOOLS } from "../mcp.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const NAMESPACE = "avz_previewpreview00",
  REPO = "example/code",
  PROJECT_NODE = "PVT_preview";

const option = (id, name) => ({ id, name: { raw: name } });
const FIELDS = [
  {
    id: 1,
    name: "Status",
    data_type: "single_select",
    options: [
      option("s-todo", "Todo"),
      option("s-progress", "In progress"),
      option("s-done", "Done"),
      option("s-deferred", "Deferred"),
    ],
  },
  {
    id: 2,
    name: "Release",
    data_type: "single_select",
    options: [option("r-one", "one"), option("r-two", "two")],
  },
  { id: 3, name: "Wave", data_type: "number" },
  {
    id: 4,
    name: "Iteration",
    data_type: "iteration",
    configuration: { iterations: [{ id: "it-1", title: { raw: "Sprint 1" } }] },
  },
];

const labelNames = (issue) => issue.labels.map((label) => label.name);
const taskOf = (issue) =>
  issue
    ? JSON.parse(issue.body.match(/<!-- avoozl-task\n(.*)\n-->/)?.[1] || "{}")
        .taskId || null
    : null;

// Issues, dependencies, sub-issues and one Project in memory. `log` records
// each write in the preview's own shape, so the two lists compare directly.
function fakeGitHub() {
  const issues = [],
    blockers = new Map(),
    subIssues = new Map(),
    items = [],
    log = [];
  let next = 40;
  const find = (repository, number) =>
    issues.find(
      (issue) =>
        issue.repository === (repository.id || repository) &&
        issue.number === number,
    );
  const write = (kind, issue, detail = {}) =>
    log.push({
      kind,
      repository: issue?.repository ?? null,
      taskId: taskOf(issue),
      ...detail,
    });
  const copy = (value) => Promise.resolve(structuredClone(value));
  return {
    issues,
    items,
    log,
    state: () =>
      JSON.stringify({
        issues,
        items,
        blockers: [...blockers],
        subIssues: [...subIssues],
      }),
    repository: () => copy({ private: true, node_id: "R_code" }),
    currentUser: () => copy({ login: "worker" }),
    ensureLabel: (_repository, label) => copy(label),
    permission: () => copy({ permission: "admin" }),
    listIssueTypes: () => copy([{ name: "Epic" }]),
    listIssues: (repository, { label }) =>
      copy(
        issues.filter(
          (issue) =>
            issue.repository === repository.id &&
            (!label || labelNames(issue).includes(label)),
        ),
      ),
    issue: (repository, number) => copy(find(repository, number)),
    listIssueBlockers: (repository, number) =>
      copy(blockers.get(find(repository, number).id) || []),
    listSubIssues: (repository, number) =>
      copy(subIssues.get(find(repository, number).id) || []),
    createIssue(repository, input) {
      const number = next++,
        issue = {
          id: number,
          node_id: "I_" + number,
          number,
          repository: repository.id,
          state: "open",
          title: input.title,
          body: input.body,
          labels: (input.labels || []).map((name) => ({ name })),
          assignees: (input.assignees || []).map((login) => ({ login })),
          html_url: `https://example.test/${repository.id}/issues/${number}`,
          ...(input.type ? { type: { name: input.type } } : {}),
        };
      issues.push(issue);
      write("issue.create", issue, {
        title: input.title,
        labels: input.labels || [],
        ...(input.assignees ? { assignees: input.assignees } : {}),
        ...(input.type ? { type: input.type } : {}),
      });
      return copy(issue);
    },
    updateIssue(repository, number, patch) {
      const issue = find(repository, number),
        { type, ...rest } = patch;
      Object.assign(issue, rest, type ? { type: { name: type } } : {});
      write("issue.update", issue, {
        fields: Object.keys(patch).sort(),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(type ? { type } : {}),
      });
      return copy(issue);
    },
    addLabels(repository, number, labels) {
      const issue = find(repository, number);
      for (const name of labels)
        if (!labelNames(issue).includes(name)) issue.labels.push({ name });
      write("label.add", issue, { labels });
      return copy(issue.labels);
    },
    removeLabel(repository, number, label) {
      const issue = find(repository, number);
      issue.labels = issue.labels.filter((entry) => entry.name !== label);
      write("label.remove", issue, { labels: [label] });
      return copy(null);
    },
    addAssignees(repository, number, assignees) {
      const issue = find(repository, number);
      issue.assignees = assignees.map((login) => ({ login }));
      write("assignee.add", issue, { assignees });
      return copy({});
    },
    addSubIssue(repository, number, childId) {
      const parent = find(repository, number),
        child = issues.find((issue) => issue.id === childId);
      subIssues.set(parent.id, [...(subIssues.get(parent.id) || []), child]);
      write("sub-issue.add", parent, { childTaskId: taskOf(child) });
      return copy({});
    },
    addIssueBlocker(repository, number, blockerId) {
      const issue = find(repository, number),
        blocker = issues.find((entry) => entry.id === blockerId);
      blockers.set(issue.id, [...(blockers.get(issue.id) || []), blocker]);
      write("blocker.add", issue, {
        blockerTaskId: taskOf(blocker),
        blockerRepository: blocker.repository,
      });
      return copy(blocker);
    },
    removeIssueBlocker(repository, number, blockerId) {
      const issue = find(repository, number),
        list = blockers.get(issue.id) || [],
        blocker = list.find((entry) => entry.id === blockerId);
      blockers.set(
        issue.id,
        list.filter((entry) => entry.id !== blockerId),
      );
      write("blocker.remove", issue, {
        blockerTaskId: taskOf(blocker),
        blockerIssueId: blockerId,
      });
      return copy(null);
    },
    projectV2: () =>
      copy({
        id: 7,
        node_id: PROJECT_NODE,
        base: "/orgs/example/projectsV2/7",
      }),
    projectFields: () => copy(FIELDS),
    projectItems: () => copy(items),
    projectStatusChanges: () => copy([]),
    addProjectItem(_project, { number }) {
      const issue = issues.find((entry) => entry.number === number),
        item = {
          id: 100 + items.length,
          content_type: "Issue",
          content: { node_id: issue.node_id, number },
          fields: [],
        };
      items.push(item);
      write("project.add", issue);
      return copy(item);
    },
    updateProjectItem(_project, itemId, updates) {
      const item = items.find((entry) => entry.id === itemId),
        issue = issues.find((entry) => entry.node_id === item.content.node_id),
        shown = {};
      for (const { id, value } of updates) {
        const field = FIELDS.find((entry) => entry.id === id),
          options =
            field.data_type === "iteration"
              ? field.configuration.iterations
              : field.options || [],
          picked = options.find((entry) => entry.id === value);
        shown[field.name] = picked
          ? (picked.name?.raw ?? picked.title.raw)
          : value;
        item.fields = item.fields.filter((entry) => entry.id !== id);
        item.fields.push({ id, value: picked ?? value });
      }
      write("project.fields", issue, { fields: shown });
      return copy({});
    },
  };
}

// The preview's entries without issue numbers, which a preview cannot know
// for issues it would create.
const comparable = (writes) => writes.map(({ issue: _issue, ...rest }) => rest);

async function workspace(t) {
  const { store } = fixture(t),
    github = fakeGitHub(),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode: "single-repo",
        epicIssueType: "Epic",
        project: {
          owner: "example",
          number: 7,
          fields: { iteration: "Iteration" },
        },
        repositories: {
          [REPO]: { baseBranch: "main", allowedActors: ["maintainer"] },
        },
      },
    }),
  );
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
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
  });
  const leaf = (id, extra = {}) => ({
    id,
    title: "Task " + id,
    summary: "Summary " + id,
    acceptance: [id + " passes"],
    projectId: "code",
    ...extra,
  });
  const plan = await ops.execute("plan.create", {
    id: "preview-plan",
    prompt: "Preview a projection",
    text:
      "# Preview\n\n" +
      [
        {
          id: "big-epic",
          kind: "package",
          title: "Big epic",
          projectId: "code",
        },
        leaf("first-leaf"),
        leaf("second-leaf", { requires: ["first-leaf"] }),
        leaf("third-leaf", { sequence: ["second-leaf"] }),
      ]
        .map((task) => "```task\n" + JSON.stringify(task) + "\n```\n")
        .join("\n"),
  });
  const approved = await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  const [epicId, ...leaves] = approved.taskIds;
  store.mutate("Nest and schedule", (data) => {
    for (const task of data.tasks) {
      if (leaves.includes(task.id)) task.parent = epicId;
      if (approved.taskIds.includes(task.id)) task.milestone = "one";
      if (task.id === leaves[0]) task.iteration = "Sprint 1";
    }
  });
  return { store, github, ops, plan, ids: approved.taskIds };
}

// What a preview must leave untouched: GitHub, and every table it reads.
const stored = (store) =>
  JSON.stringify({
    data: store.read(),
    issues: store.list("github_issues"),
    receipts: store.list("receipts"),
    events: store.events({ latest: true, limit: 1 }),
  });

test("the preview lists exactly the writes the projection then makes, and makes none", async (t) => {
  const { store, github, ops, plan, ids } = await workspace(t),
    before = { github: github.state(), store: stored(store) },
    preview = await ops.execute("github.project.preview", { planId: plan.id });
  assert.equal(github.state(), before.github, "the preview wrote to GitHub");
  assert.equal(stored(store), before.store, "the preview wrote to SQLite");
  assert.equal(github.log.length, 0);
  assert.deepEqual(preview.previewOnly, []);
  assert.equal(preview.project.status, "synced");

  const kinds = new Set(preview.writes.map((write) => write.kind));
  for (const kind of [
    "issue.create",
    "issue.update",
    "label.add",
    "sub-issue.add",
    "blocker.add",
    "project.add",
    "project.fields",
  ])
    assert.ok(kinds.has(kind), kind + " is missing from the preview");
  const fields = preview.writes
    .filter((write) => write.kind === "project.fields")
    .map((write) => write.fields);
  assert.ok(fields.some((entry) => entry.Release === "one"));
  assert.ok(fields.some((entry) => entry.Wave === 3));
  assert.ok(fields.some((entry) => entry.Iteration === "Sprint 1"));
  assert.ok(
    fields.every((entry) => !("Status" in entry)),
    "never Status",
  );
  assert.ok(
    preview.writes.every((write) => write.issue === null),
    "issues a preview would create have no number",
  );

  const projected = await ops.execute("github.project", { planId: plan.id });
  assert.equal(projected.project.status, "synced");
  assert.deepEqual(comparable(preview.writes), github.log);
  assert.ok(
    github.log.some(
      (write) =>
        write.kind === "blocker.add" &&
        write.taskId === ids[2] &&
        write.blockerTaskId === ids[1],
    ),
  );

  // Projected and in step: the preview, like a second run, writes nothing.
  const again = await ops.execute("github.project.preview", {
    planId: plan.id,
  });
  assert.deepEqual(again.writes, []);
  const count = github.log.length;
  await ops.execute("github.project", { planId: plan.id });
  assert.equal(github.log.length, count);
});

test("the preview of a changed plan names existing issues and still matches", async (t) => {
  const { store, github, ops, plan, ids } = await workspace(t);
  await ops.execute("github.project", { planId: plan.id });
  github.log.length = 0;
  // The plan renames a leaf and drops the second leaf's wait on the first.
  store.mutate("Change the plan", (data) => {
    data.tasks.find((task) => task.id === ids[1]).title = "Renamed first";
    data.edges = data.edges.filter(
      (edge) => !(edge.from === ids[1] && edge.to === ids[2]),
    );
  });
  const before = github.state(),
    preview = await ops.execute("github.project.preview", { planId: plan.id });
  assert.equal(github.state(), before);
  const rename = preview.writes.find(
    (write) => write.kind === "issue.update" && write.title === "Renamed first",
  );
  assert.ok(rename, JSON.stringify(preview.writes));
  assert.equal(typeof rename.issue, "number", "an existing issue has a number");
  assert.ok(
    preview.writes.some(
      (write) => write.kind === "blocker.remove" && write.taskId === ids[2],
    ),
  );
  await ops.execute("github.project", { planId: plan.id });
  assert.deepEqual(comparable(preview.writes), github.log);
});

test("a repository another machine writes is preview-only", async (t) => {
  const { store, github, ops, plan } = await workspace(t);
  store.put("github_repositories", {
    ...store.get("github_repositories", REPO),
    activeMachine: "machine-other",
  });
  const preview = await ops.execute("github.project.preview", {
    planId: plan.id,
  });
  assert.deepEqual(preview.previewOnly, [REPO]);
  assert.ok(preview.writes.length > 0, "the writer's writes are still listed");
  await assert.rejects(
    ops.execute("github.project", { planId: plan.id }),
    /only previews example\/code/,
  );
  assert.equal(github.log.length, 0);
});

test("plans_project_preview is a read-only MCP tool", () => {
  const tool = WORKSPACE_TOOLS.find(
    (entry) => entry.name === "plans_project_preview",
  );
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint, true);
});
