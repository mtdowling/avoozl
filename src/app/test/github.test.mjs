import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { queryTasks } from "../../model.mjs";
import { fixture, markdown } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { FakeGitHub } from "./fake-github.mjs";

const NAMESPACE = "avz_testtesttesttest";

// The planning workspace's .avoozl.json, which owns the marker namespace.
function planningRoot(root, value = { version: 1, namespace: NAMESPACE }) {
  fs.writeFileSync(path.join(root, ".avoozl.json"), JSON.stringify(value));
  return root;
}

function configure(store, github, manager = null, root = temporaryDirectory()) {
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [["npm", "test"]],
  });
  const ops = new Operations(store, {
    github,
    manager,
    operator: "Operator",
    workspaceRoot: planningRoot(root),
  });
  return ops
    .execute("github.configure", {
      repository: "example/code",
      projectId: "code",
      provider: "openhands",
      autoStart: true,
      allowedActors: ["maintainer"],
    })
    .then(() => ops);
}

function readyIssue(body = "## Acceptance criteria\n\n- [ ] It works") {
  return {
    id: 1,
    node_id: "issue-node-1",
    number: 7,
    title: "Implement the GitHub path",
    body,
    html_url: "https://example.test/example/code/issues/7",
    assignees: [{ login: "worker" }],
    labels: [{ name: "avoozl:ready" }],
  };
}

test("authorized assigned issues become exact ready tasks and body changes quarantine them", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub();
  github.permissions.set("maintainer", "write");
  github.issues = [readyIssue()];
  github.events.set(7, [
    {
      id: 99,
      node_id: "label-event-99",
      event: "labeled",
      label: { name: "avoozl:ready" },
      actor: { login: "maintainer" },
      created_at: "2026-11-10T12:00:00Z",
    },
  ]);
  github.timelines.set(7, [
    {
      event: "cross-referenced",
      source: {
        issue: {
          node_id: "pull-node-12",
          number: 12,
          title: "Implement the GitHub path",
          state: "open",
          html_url: "https://example.test/example/code/pull/12",
          pull_request: {},
        },
      },
    },
  ]);
  const ops = await configure(store, github);
  const first = await ops.execute("github.sync");
  assert.equal(first.authorized.length, 1);
  const task = store.read().tasks.find((item) => item.github?.number === 7);
  assert.equal(task.github.origin, "issue");
  assert.equal(task.github.pullRequests[0].number, 12);
  assert.equal(task.dispatch.state, "authorized");
  assert.deepEqual(task.acceptance, ["It works"]);
  assert.equal(task.approvedSource.hash, first.authorized[0].bodyHash);
  assert.equal(
    queryTasks(store.read(), { scope: "all", q: "ready:true" }).some(
      (item) => item.id === task.id,
    ),
    true,
  );
  const withExecution = structuredClone(store.read()),
    linkedTask = withExecution.tasks.find((item) => item.id === task.id);
  linkedTask.integration = {
    commit: "abcdef0123456789",
    branch: "main",
    repo: "/tmp/code",
    at: "2026-11-10T12:30:00Z",
  };
  store.commit(withExecution, "Record linked code");
  store.put("runs", {
    id: "run-linked",
    taskId: task.id,
    provider: "openhands",
    state: "running",
    branch: "avoozl/run-linked",
    worktree: "/tmp/worktrees/run-linked",
  });
  const detail = await ops.execute("task.get", { id: task.id });
  assert.equal(detail.executionLocation.branch, "avoozl/run-linked");
  assert.equal(detail.executionLocation.worktree, "/tmp/worktrees/run-linked");
  assert.equal(
    detail.codeChanges.commits[0].url,
    "https://example.test/example/code/commit/abcdef0123456789",
  );
  assert.equal(detail.codeChanges.pullRequests[0].number, 12);
  const localData = store.read(),
    localTask = localData.tasks.find((item) => !item.github);
  localTask.projectId = "code";
  localTask.integration = {
    commit: "1234567890abcdef",
    branch: "main",
    repo: "/tmp/code",
    at: "2026-11-10T12:35:00Z",
  };
  store.commit(localData, "Record local code link");
  const linkedLocal = await ops.execute("task.get", { id: localTask.id });
  assert.equal(
    linkedLocal.codeChanges.commits[0].url,
    "https://github.com/example/code/commit/1234567890abcdef",
  );

  github.issues[0].body += "\n\nNew unreviewed scope.";
  const changed = await ops.execute("github.sync");
  assert.equal(changed.quarantined.length, 1);
  assert.equal(
    store.read().tasks.find((item) => item.id === task.id).dispatch.ready,
    false,
  );

  const record = changed.quarantined[0];
  const confirmed = await ops.execute("github.authorize", {
    repository: "example/code",
    id: record.id,
    bodyHash: record.bodyHash,
    labelEventId: record.labelEventId,
  });
  assert.equal(confirmed.authorized.length, 1);
  assert.equal(
    store.read().tasks.find((item) => item.id === task.id).dispatch.ready,
    true,
  );
});

test("public repositories register and authorize like private ones", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub();
  github.repository = async () => ({
    node_id: "public-repo",
    full_name: "example/code",
    private: false,
  });
  github.permissions.set("maintainer", "write");
  github.issues = [readyIssue()];
  github.events.set(7, [
    {
      id: 99,
      event: "labeled",
      label: { name: "avoozl:ready" },
      actor: { login: "maintainer" },
      created_at: "2026-11-10T12:00:00Z",
    },
  ]);
  const ops = await configure(store, github);
  assert.equal(store.get("github_repositories", "example/code").private, false);
  const synced = await ops.execute("github.sync");
  assert.equal(synced.authorized.length, 1);
});

test("untrusted label actors cannot dispatch and withdrawal does not erase the task", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub();
  github.permissions.set("outsider", "read");
  github.issues = [readyIssue()];
  github.events.set(7, [
    {
      id: 100,
      event: "labeled",
      label: { name: "avoozl:ready" },
      actor: { login: "outsider" },
      created_at: "2026-11-10T12:00:00Z",
    },
  ]);
  const ops = await configure(store, github);
  const ignored = await ops.execute("github.sync");
  assert.equal(ignored.ignored.length, 1);
  assert.equal(ignored.authorized.length, 0);
  // A disallowed actor's label writes nothing: no task, no receipt.
  assert.equal(
    store.read().tasks.some((item) => item.github?.number === 7),
    false,
  );
  assert.equal(store.list("github_issues").length, 0);

  github.permissions.set("maintainer", "write");
  github.events.set(7, [
    {
      id: 101,
      event: "labeled",
      label: { name: "avoozl:ready" },
      actor: { login: "maintainer" },
      created_at: "2026-11-10T12:05:00Z",
    },
  ]);
  const authorized = await ops.execute("github.sync");
  const task = store
    .read()
    .tasks.find((item) => item.id === authorized.authorized[0].taskId);
  assert.equal(task.dispatch.ready, true);
  github.issues = [];
  await ops.execute("github.sync");
  const withdrawn = store.read().tasks.find((item) => item.id === task.id);
  assert.equal(withdrawn.dispatch.state, "withdrawn");
  assert.equal(withdrawn.status, "planned");
});

test("approved design tasks project once, preserve human issue text, and point the start to Kiro Crew", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    starts = [],
    manager = {
      remote: true,
      start(input) {
        starts.push(input);
        return Promise.resolve({ id: "run-from-issue", ...input });
      },
    },
    ops = await configure(store, github, manager);
  const plan = await ops.execute("plan.create", {
    id: "plan-github",
    prompt: "Project a design",
    text: markdown.replace(
      '"epic":"sample"',
      '"epic":"sample","projectId":"code"',
    ),
    context: { projectId: "code" },
  });
  const approved = await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  const projected = await ops.execute("github.project", {
    planId: plan.id,
    repository: "example/code",
  });
  assert.equal(projected.issues.length, approved.taskIds.length);
  assert.equal(github.created.length, approved.taskIds.length);
  const [foundationTaskId, deliveryTaskId] = approved.taskIds,
    foundationIssue = projected.issues.find(
      (issue) => issue.taskId === foundationTaskId,
    ),
    deliveryIssue = projected.issues.find(
      (issue) => issue.taskId === deliveryTaskId,
    );
  assert.deepEqual(deliveryIssue.managedBlockerIssueIds, [
    foundationIssue.issueId,
  ]);
  assert.deepEqual(foundationIssue.managedBlockerIssueIds, []);
  assert.equal(
    github.labels.some(
      ([kind, number]) => kind === "add" && number === foundationIssue.number,
    ),
    true,
  );
  assert.equal(
    github.labels.some(
      ([kind, number]) => kind === "add" && number === deliveryIssue.number,
    ),
    false,
  );
  assert.equal(
    github.labels.some(([kind]) => kind === "add"),
    true,
  );

  github.created[0].body += "\n\nHuman coordination note.";
  const labelWritesBeforeRerun = github.labels.length;
  const projectedAgain = await ops.execute("github.project", {
    planId: plan.id,
    repository: "example/code",
  });
  // Repeating the same revision writes nothing (R13.4).
  assert.deepEqual(github.labels.slice(labelWritesBeforeRerun), []);
  assert.equal(github.created.length, approved.taskIds.length);
  assert.equal(
    projectedAgain.issues[0].body.includes("Human coordination note."),
    true,
  );

  const task = store
    .read()
    .tasks.find((item) => item.id === approved.taskIds[0]);
  store.mutate("Make projected task ready", (data) => {
    const local = data.tasks.find((item) => item.id === task.id);
    local.dispatch = { ...local.dispatch, ready: true, state: "authorized" };
    local.needsReview = false;
  });
  assert.equal(
    store.read().tasks.find((item) => item.id === task.id).dispatch.state,
    "authorized",
  );
  // Starting an issue's work moved to the tick's Kiro Crew dispatch.
  const moved = await ops.execute("github.start", { taskId: task.id });
  assert.equal(moved.moved, true);
  assert.equal(moved.taskId, task.id);
  assert.deepEqual(starts, []);
});

test("extracted designs project a parent, attach child issues, and comment best effort", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    ops = await configure(store, github),
    text =
      "Build a durable import pipeline.\n\nThe import preserves every source line.",
    plan = await ops.execute("plan.create", {
      id: "extracted-github",
      prompt: "Extract a GitHub-backed design",
      text,
      context: {
        projectId: "code",
        github: { repository: "example/code", pullRequestNumber: 19 },
      },
    }),
    extraction = await ops.execute("plan.extract", {
      planId: plan.id,
      revisionHash: plan.hash,
    }),
    task = {
      kind: "task",
      text: "Build a durable import pipeline",
      quote: "Build a durable import pipeline.",
      derivation: "stated",
      taskLocalId: "durable-import",
    };
  await ops.execute("plan.extraction.submit", {
    extractionId: extraction.id,
    revisionHash: plan.hash,
    complete: true,
    facts: [
      task,
      {
        kind: "acceptance",
        text: "Every source line is preserved",
        quote: "The import preserves every source line.",
        derivation: "stated",
        relatesTo: "durable-import",
      },
    ],
  });
  const preview = await ops.execute("plan.preview", {
    id: plan.id,
    extractionId: extraction.id,
  });
  await ops.execute("plan.approve", {
    id: plan.id,
    extractionId: extraction.id,
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
  const projected = await ops.execute("github.project", {
    planId: plan.id,
    repository: "example/code",
  });
  assert.equal(projected.issues.length, 1);
  assert.equal(projected.parent.number, 41);
  assert.deepEqual(github.subIssues, [[41, 40]]);
  assert.equal(github.comments[0].number, 19);
  assert.match(github.comments[0].body, /Avoozl extracted revision/);
});

test("approved tasks project native dependencies across repositories", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    ops = new Operations(store, {
      github,
      operator: "Operator",
      workspaceRoot: planningRoot(temporaryDirectory()),
    });
  for (const id of ["planning", "code"])
    store.put("projects", {
      id,
      root: `/tmp/${id}`,
      baseBranch: "main",
      worktreeRoot: `/tmp/${id}-worktrees`,
      checks: [["npm", "test"]],
    });
  await ops.execute("github.configure", {
    repository: "example/planning",
    projectId: "planning",
  });
  await ops.execute("github.configure", {
    repository: "example/code",
    projectId: "code",
  });
  const plan = await ops.execute("plan.create", {
      id: "cross-repository",
      prompt: "Project work across two repositories",
      text: `# Cross-repository plan

\`\`\`task
{"id":"design-change","title":"Land planning change","summary":"Update the plan.","acceptance":["Plan passes"],"projectId":"planning"}
\`\`\`

\`\`\`task
{"id":"code-change","title":"Land code change","summary":"Update the code.","acceptance":["Code passes"],"requires":["design-change"],"projectId":"code"}
\`\`\`
`,
    }),
    approved = await ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
    }),
    projected = await ops.execute("github.project", { planId: plan.id }),
    [designTaskId, codeTaskId] = approved.taskIds,
    designIssue = projected.issues.find(
      (issue) => issue.taskId === designTaskId,
    ),
    codeIssue = projected.issues.find((issue) => issue.taskId === codeTaskId);

  assert.equal(designIssue.repository, "example/planning");
  assert.equal(codeIssue.repository, "example/code");
  assert.deepEqual(codeIssue.managedBlockerIssueIds, [designIssue.issueId]);
  assert.equal(
    github.created.find((issue) => issue.id === designIssue.issueId).repository,
    "example/planning",
  );
  assert.equal(
    github.created.find((issue) => issue.id === codeIssue.issueId).repository,
    "example/code",
  );
});

test("dependency drift is a conflict that withdraws readiness and keeps the edge", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    ops = await configure(store, github),
    plan = await ops.execute("plan.create", {
      id: "dependency-drift",
      prompt: "Detect dependency drift",
      text: `# Dependency drift

\`\`\`task
{"id":"only-task","title":"Only task","summary":"One task.","acceptance":["It passes"],"projectId":"code"}
\`\`\`
`,
    }),
    approved = await ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
    }),
    projected = await ops.execute("github.project", { planId: plan.id }),
    issue = projected.issues[0],
    outside = {
      id: 999,
      node_id: "outside-999",
      number: 999,
      repository: "example/code",
      title: "Human dependency",
      body: "",
      html_url: "https://example.test/example/code/issues/999",
      assignees: [],
    };
  github.created.push(outside);
  await github.addIssueBlocker(
    { id: "example/code" },
    issue.number,
    outside.id,
  );
  const before = github.labels.length;

  const drifted = await ops.execute("github.project", { planId: plan.id });
  assert.equal(approved.taskIds.length, 1);
  assert.deepEqual(
    drifted.conflicts.map(({ field }) => field),
    ["blockers"],
  );
  assert.equal(drifted.issues[0].state, "conflict");
  assert.deepEqual(github.labels.slice(before), [
    ["remove", issue.number, "avoozl:ready"],
  ]);
  assert.deepEqual(
    (await github.listIssueBlockers({ id: "example/code" }, issue.number)).map(
      (blocker) => blocker.id,
    ),
    [outside.id],
  );
});

test("fresh workspace recovers projected issues from managed markers", async (t) => {
  const firstFixture = fixture(t),
    github = new FakeGitHub(),
    firstOps = await configure(firstFixture.store, github),
    input = {
      id: "recover-projection",
      prompt: "Recover a projection",
      text: markdown.replace(
        '"epic":"sample"',
        '"epic":"sample","projectId":"code"',
      ),
      context: { projectId: "code" },
    },
    firstPlan = await firstOps.execute("plan.create", input);
  await firstOps.execute("plan.approve", {
    id: firstPlan.id,
    expectedHash: firstPlan.hash,
    expectedRevision: firstFixture.store.read().revision,
  });
  const first = await firstOps.execute("github.project", {
    planId: firstPlan.id,
  });

  const secondFixture = fixture(t),
    secondOps = await configure(secondFixture.store, github),
    secondPlan = await secondOps.execute("plan.create", input);
  await secondOps.execute("plan.approve", {
    id: secondPlan.id,
    expectedHash: secondPlan.hash,
    expectedRevision: secondFixture.store.read().revision,
  });
  const recovered = await secondOps.execute("github.project", {
    planId: secondPlan.id,
  });

  assert.equal(github.created.length, first.issues.length);
  assert.deepEqual(
    recovered.issues.map((issue) => [issue.repository, issue.number]),
    first.issues.map((issue) => [issue.repository, issue.number]),
  );
  assert.equal(
    secondFixture.store
      .read()
      .tasks.every((task) => !task.planId || task.github?.origin === "design"),
    true,
  );
});

function markerOf(issue) {
  return JSON.parse(issue.body.match(/<!-- avoozl-task\n(.*)\n-->/)[1]);
}

async function twoRepositoryPlan(t, avoozlJson) {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    ops = new Operations(store, {
      github,
      operator: "Operator",
      workspaceRoot: planningRoot(temporaryDirectory(), avoozlJson),
    });
  for (const id of ["planning", "code"])
    store.put("projects", {
      id,
      root: `/tmp/${id}`,
      baseBranch: "main",
      worktreeRoot: `/tmp/${id}-worktrees`,
      checks: [["npm", "test"]],
    });
  for (const id of ["planning", "code"])
    await ops.execute("github.configure", {
      repository: `example/${id}`,
      projectId: id,
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

test("projection writes marker version 2 with hash pins and applied values", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    ops = await configure(store, github),
    { plan, approved } = await approve(ops, store, "marker-two", [
      {
        id: "base-work",
        title: "Base work",
        acceptance: ["Base passes"],
        projectId: "code",
      },
      {
        id: "next-work",
        title: "Next work",
        acceptance: ["Next passes"],
        requires: [{ task: "base-work", condition: "integrated" }],
        projectId: "code",
      },
    ]),
    projected = await ops.execute("github.project", { planId: plan.id }),
    [baseId, nextId] = approved.taskIds,
    base = github.created.find((issue) => markerOf(issue).taskId === baseId),
    next = github.created.find((issue) => markerOf(issue).taskId === nextId),
    marker = markerOf(next);
  assert.equal(projected.issues.length, 2);
  assert.equal(marker.version, 2);
  assert.equal(marker.namespace, NAMESPACE);
  assert.equal(marker.kind, "leaf");
  assert.deepEqual(marker.source, { commit: null, manifest: plan.hash });
  assert.deepEqual(marker.edges, { conditions: { [baseId]: "integrated" } });
  assert.deepEqual(marker.applied.blockers, [base.node_id]);
  assert.deepEqual(marker.applied.labels, ["avoozl:managed"]);
  assert.match(marker.applied.title, /^[0-9a-f]{64}$/);
  assert.deepEqual(markerOf(base).applied.labels, [
    "avoozl:managed",
    "avoozl:ready",
  ]);
  for (const issue of [base, next])
    assert.doesNotMatch(JSON.stringify(markerOf(issue)), /planId|\/tmp\//);

  // A rerun matches both issues by namespace and task ID and writes nothing.
  const updates = github.updated.length;
  await ops.execute("github.project", { planId: plan.id });
  assert.equal(github.created.length, 2);
  assert.equal(github.updated.length, updates);
});

test("projection needs the workspace namespace", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    root = temporaryDirectory(),
    ops = await configure(store, github, null, root);
  fs.writeFileSync(path.join(root, ".avoozl.json"), '{"version":1}');
  const { plan } = await approve(ops, store, "no-namespace", [
    { id: "only-one", title: "Only", acceptance: ["Done"], projectId: "code" },
  ]);
  await assert.rejects(
    ops.execute("github.project", { planId: plan.id }),
    /Add "namespace": "avz_[a-z2-7]{16}" to \.avoozl\.json/,
  );
  assert.equal(github.created.length, 0);
});

test("parent tasks link children as sub-issues across repositories", async (t) => {
  const { store, github, ops } = await twoRepositoryPlan(t),
    { plan, approved } = await approve(ops, store, "parent-link", [
      {
        id: "epic-one",
        kind: "epic",
        title: "Epic one",
        projectId: "planning",
      },
      {
        id: "child-one",
        title: "Child one",
        acceptance: ["Child passes"],
        projectId: "code",
      },
    ]),
    [epicId, childId] = approved.taskIds;
  store.mutate("Nest child", (data) => {
    data.tasks.find((task) => task.id === childId).parent = epicId;
  });
  await ops.execute("github.project", { planId: plan.id });
  const epic = github.created.find(
      (issue) => markerOf(issue).taskId === epicId,
    ),
    child = github.created.find((issue) => markerOf(issue).taskId === childId);
  assert.equal(epic.repository, "example/planning");
  assert.equal(child.repository, "example/code");
  assert.deepEqual(github.subIssues, [[epic.number, child.id]]);
  assert.equal(markerOf(child).parent, epicId);
  assert.equal(markerOf(epic).kind, "epic");

  await ops.execute("github.project", { planId: plan.id });
  assert.deepEqual(github.subIssues, [[epic.number, child.id]]);
});

test("plans-repo mode keeps markers and links inside the planning repository", async (t) => {
  const policy = {
      version: 1,
      namespace: NAMESPACE,
      github: { mode: "plans-repo", planningRepository: "example/planning" },
    },
    { store, github, ops } = await twoRepositoryPlan(t, policy),
    { plan } = await approve(ops, store, "planning-only", [
      {
        id: "plan-base",
        title: "Plan base",
        acceptance: ["Base passes"],
        projectId: "planning",
      },
      {
        id: "plan-next",
        title: "Plan next",
        acceptance: ["Next passes"],
        requires: ["plan-base"],
        projectId: "planning",
      },
    ]);
  await ops.execute("github.project", { planId: plan.id });
  assert.equal(github.created.length, 2);
  for (const issue of github.created)
    assert.doesNotMatch(JSON.stringify(markerOf(issue)), /example\/planning/i);

  const code = await approve(ops, store, "code-side", [
    {
      id: "code-leaf",
      title: "Code leaf",
      acceptance: ["Code passes"],
      projectId: "code",
    },
  ]);
  await assert.rejects(
    ops.execute("github.project", { planId: code.plan.id }),
    /example\/code is not the planning repository/,
  );
  assert.equal(github.created.length, 2);
});

async function projectedWorkspace(t, tasks, policy = {}) {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    root = temporaryDirectory(),
    ops = await configure(store, github, null, root);
  planningRoot(root, { version: 1, namespace: NAMESPACE, ...policy });
  const { plan, approved } = await approve(ops, store, "projection", tasks);
  return { store, github, ops, plan, approved, root };
}

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  summary: "Summary " + id,
  acceptance: [id + " passes"],
  projectId: "code",
  ...extra,
});

function issueFor(github, taskId) {
  return github.created.find((issue) => markerOf(issue).taskId === taskId);
}

test("epics get the epic issue type, sequence edges block, supports stay in the marker", async (t) => {
  const { store, github, ops, plan, approved } = await projectedWorkspace(
    t,
    [
      { id: "big-epic", kind: "epic", title: "Big epic", projectId: "code" },
      leaf("first-leaf"),
      leaf("second-leaf", { sequence: ["first-leaf"] }),
      leaf("third-leaf", { supports: ["first-leaf"] }),
    ],
    { github: { epicIssueType: "Epic" } },
  );
  github.issueTypes = { example: ["Task", "Epic"] };
  const [epicId, firstId, secondId, thirdId] = approved.taskIds;
  store.mutate("Nest leaves", (data) => {
    for (const task of data.tasks)
      if ([firstId, secondId, thirdId].includes(task.id)) task.parent = epicId;
  });
  const result = await ops.execute("github.project", { planId: plan.id }),
    epic = issueFor(github, epicId),
    first = issueFor(github, firstId),
    second = issueFor(github, secondId),
    third = issueFor(github, thirdId);
  assert.deepEqual(result.notes, []);
  assert.equal(epic.type.name, "Epic");
  assert.equal(first.type, undefined);
  assert.deepEqual(
    github.subIssues.map(([parent]) => parent),
    [epic.number, epic.number, epic.number],
  );
  assert.deepEqual(markerOf(second).applied.blockers, [first.node_id]);
  // supports is advisory: marker only, no GitHub dependency either way.
  assert.deepEqual(markerOf(third).applied.blockers, []);
  assert.deepEqual(markerOf(first).applied.blockers, []);
  assert.deepEqual(markerOf(third).edges, undefined);
  assert.deepEqual(markerOf(first).edges, { supports: [thirdId] });
  // Epics never carry the ready label.
  assert.equal(labelsOf(epic).includes("avoozl:ready"), false);
  assert.equal(labelsOf(second).includes("avoozl:ready"), false);

  github.issueTypes = { example: ["Task"] };
  const rerun = await ops.execute("github.project", { planId: plan.id });
  assert.match(rerun.notes[0], /example has no Epic issue type/);
});

function labelsOf(issue) {
  return (issue.labels || []).map((label) => label.name);
}

test("ready labels go on last and are capped by repository concurrency", async (t) => {
  const { github, ops, plan, approved } = await projectedWorkspace(
    t,
    [leaf("leaf-one"), leaf("leaf-two"), leaf("leaf-three")],
    {
      github: {
        repositories: {
          "example/code": {
            concurrency: 2,
            managedLabels: { managed: "agent:managed", ready: "agent:ready" },
          },
        },
      },
    },
  );
  await ops.execute("github.project", { planId: plan.id });
  const ready = approved.taskIds.filter((id) =>
    labelsOf(issueFor(github, id)).includes("agent:ready"),
  );
  assert.deepEqual(ready, approved.taskIds.slice(0, 2));
  for (const id of approved.taskIds)
    assert.equal(
      labelsOf(issueFor(github, id)).includes("agent:managed"),
      true,
    );
  assert.equal(
    github.labels.some(([, , label]) => label === "avoozl:ready"),
    false,
  );
  const lastCreate = github.created.length,
    firstReadyAdd = github.labels.findIndex(
      ([kind, , label]) => kind === "add" && label === "agent:ready",
    );
  assert.equal(lastCreate, 3);
  assert.ok(firstReadyAdd >= 0);
});

test("free ready slots go by priority label, then graph order, under the cap", async (t) => {
  const { github, ops, plan, approved } = await projectedWorkspace(
    t,
    [leaf("leaf-one"), leaf("leaf-two"), leaf("leaf-three")],
    {
      github: {
        repositories: {
          "example/code": {
            concurrency: 1,
            priority: ["critical", "high"],
            managedLabels: { managed: "agent:managed", ready: "agent:ready" },
          },
        },
      },
    },
  );
  const [one, two, three] = approved.taskIds,
    readyNow = () =>
      approved.taskIds.filter((id) =>
        labelsOf(issueFor(github, id)).includes("agent:ready"),
      ),
    relabel = (id, add, remove = []) => {
      const issue = issueFor(github, id);
      issue.labels = issue.labels.filter(({ name }) => !remove.includes(name));
      for (const name of add) issue.labels.push({ name });
    };
  // No priority labels yet: graph order, one slot.
  await ops.execute("github.project", { planId: plan.id });
  assert.deepEqual(readyNow(), [one]);

  // People label the issues. The leaf holding the slot keeps it.
  relabel(one, ["urgent"]); // not in the list: sorts last
  relabel(two, ["High", "critical"]); // two labels: the best one counts
  relabel(three, ["high"]);
  await ops.execute("github.project", { planId: plan.id });
  assert.deepEqual(readyNow(), [one]);

  // The slot frees: the critical leaf takes it, never more than the cap.
  relabel(one, [], ["agent:ready"]);
  await ops.execute("github.project", { planId: plan.id });
  assert.deepEqual(readyNow(), [two]);

  // Without critical, two and three tie on high: graph order decides.
  relabel(two, [], ["agent:ready", "critical"]);
  await ops.execute("github.project", { planId: plan.id });
  assert.deepEqual(readyNow(), [two]);
});

test("closed issues for unfinished tasks go to the close-without-code rule", async (t) => {
  const { github, ops, plan, approved } = await projectedWorkspace(t, [
    leaf("closed-leaf"),
    leaf("open-leaf"),
  ]);
  await ops.execute("github.project", { planId: plan.id });
  const closed = issueFor(github, approved.taskIds[0]);
  closed.state = "closed";
  closed.state_reason = "completed";
  const updates = github.updated.length,
    result = await ops.execute("github.project", { planId: plan.id });
  assert.equal(github.created.length, 2);
  assert.equal(github.updated.length, updates);
  assert.deepEqual(result.conflicts, [
    {
      taskId: approved.taskIds[0],
      field: "state",
      reason: `Issue #${closed.number} for ${approved.taskIds[0]} is closed (completed) but the task is not done.`,
    },
  ]);
  assert.equal(labelsOf(closed).includes("avoozl:ready"), false);
});

test("two issues with one task ID are a conflict and nothing is written for it", async (t) => {
  const { github, ops, plan, approved, store } = await projectedWorkspace(t, [
    leaf("dup-leaf"),
    leaf("fine-leaf"),
  ]);
  await ops.execute("github.project", { planId: plan.id });
  const original = issueFor(github, approved.taskIds[0]);
  github.created.push({
    ...structuredClone(original),
    id: 900,
    number: 900,
    node_id: "issue-900",
  });
  store.mutate("Forget the cached link", (data) => {
    delete data.tasks.find((task) => task.id === approved.taskIds[0]).github;
  });
  const updates = github.updated.length,
    result = await ops.execute("github.project", { planId: plan.id });
  assert.deepEqual(
    result.conflicts.map(({ taskId, field }) => [taskId, field]),
    [[approved.taskIds[0], "identity"]],
  );
  assert.equal(github.updated.length, updates);
  assert.deepEqual(
    result.issues.map((issue) => issue.taskId),
    [approved.taskIds[1]],
  );
  const view = await ops.execute("conflicts.view", {});
  assert.equal(
    view.items.some(
      (entry) =>
        entry.kind === "github-conflict" &&
        entry.taskId === approved.taskIds[0] &&
        entry.field === "identity",
    ),
    true,
  );
});

test("human edits to managed fields are conflicts; untouched fields update", async (t) => {
  const { store, github, ops, plan, approved } = await projectedWorkspace(t, [
      leaf("edited-leaf"),
      leaf("blocker-leaf"),
      leaf("quiet-leaf"),
    ]),
    [editedId, , quietId] = approved.taskIds;
  await ops.execute("github.project", { planId: plan.id });
  const edited = issueFor(github, editedId),
    quiet = issueFor(github, quietId),
    other = issueFor(github, approved.taskIds[1]),
    originalSection = edited.body.match(
      /<!-- avoozl:managed:start -->[\s\S]*<!-- avoozl:managed:end -->/,
    )[0];
  // A person edits the title, the managed section, removes the managed label,
  // and adds a blocked-by link. A Project field value in the marker is not an
  // issue field, so it is no conflict.
  edited.title = "Human title";
  edited.body = edited.body.replace("Summary edited-leaf", "Human summary");
  edited.labels = edited.labels.filter(
    (label) => label.name !== "avoozl:managed",
  );
  await github.addIssueBlocker({ id: "example/code" }, edited.number, other.id);
  const marker = markerOf(quiet);
  marker.applied.project = { Release: "human-release", Wave: 9 };
  quiet.body = quiet.body.replace(
    /<!-- avoozl-task\n.*\n-->/,
    `<!-- avoozl-task\n${JSON.stringify(marker)}\n-->`,
  );
  // The design changes every field of both tasks.
  store.mutate("Change the design", (data) => {
    for (const task of data.tasks)
      if ([editedId, quietId].includes(task.id)) {
        task.title += " v2";
        task.summary += " v2";
      }
  });
  const result = await ops.execute("github.project", { planId: plan.id });
  assert.deepEqual(
    result.conflicts.map(({ taskId, field }) => [taskId, field]),
    [
      [editedId, "title"],
      [editedId, "body"],
      [editedId, "labels"],
      [editedId, "blockers"],
    ],
  );
  assert.equal(edited.title, "Human title");
  assert.match(edited.body, /Human summary/);
  assert.equal(labelsOf(edited).includes("avoozl:managed"), false);
  assert.deepEqual(
    (await github.listIssueBlockers({ id: "example/code" }, edited.number)).map(
      (blocker) => blocker.id,
    ),
    [other.id],
  );
  assert.equal(labelsOf(edited).includes("avoozl:ready"), false);
  assert.equal(quiet.title, "Task quiet-leaf v2");
  assert.match(quiet.body, /Summary quiet-leaf v2/);
  assert.deepEqual(markerOf(quiet).applied.project, {
    Release: "human-release",
    Wave: 9,
  });
  // Baselines stay at the last applied values, so the conflict persists.
  const again = await ops.execute("github.project", { planId: plan.id });
  assert.equal(again.conflicts.length, 4);

  // The Conflicts view shows both values, who changed it, and the choices.
  const titleConflict = async () =>
    (await ops.execute("conflicts.view", {})).items.find(
      (entry) =>
        entry.kind === "github-conflict" &&
        entry.taskId === editedId &&
        entry.field === "title",
    );
  github.events.set(edited.number, [
    {
      event: "renamed",
      actor: { login: "maintainer" },
      created_at: "2026-11-12T09:00:00Z",
    },
  ]);
  await ops.execute("github.project", { planId: plan.id });
  assert.deepEqual(
    (({ expected, actual, changedBy, changedAt, choices, resolution }) => ({
      expected,
      actual,
      changedBy,
      changedAt,
      choices,
      resolution,
    }))(await titleConflict()),
    {
      expected: "Task edited-leaf v2",
      actual: "Human title",
      changedBy: "maintainer",
      changedAt: "2026-11-12T09:00:00Z",
      choices: ["desired", "github"],
      resolution: null,
    },
  );
  const labelsConflict = (await ops.execute("conflicts.view", {})).items.find(
    (entry) => entry.taskId === editedId && entry.field === "labels",
  );
  assert.deepEqual(labelsConflict.expected, ["avoozl:managed"]);
  assert.deepEqual(labelsConflict.actual, []);
  assert.equal(labelsConflict.changedBy, null);

  // Resolve: reapply the design title, keep the human body.
  await ops.execute("github.conflict.resolve", {
    taskId: editedId,
    field: "title",
    choice: "desired",
  });
  assert.equal((await titleConflict()).resolution, "desired");
  await ops.execute("github.conflict.resolve", {
    taskId: editedId,
    field: "body",
    choice: "github",
  });
  const resolved = await ops.execute("github.project", { planId: plan.id });
  assert.equal(edited.title, "Task edited-leaf v2");
  assert.match(edited.body, /Human summary/);
  assert.deepEqual(
    resolved.conflicts.map(({ field }) => field),
    ["labels", "blockers"],
  );
  // Kept until the design changes the body again; then the design wins.
  await ops.execute("github.project", { planId: plan.id });
  assert.match(edited.body, /Human summary/);
  store.mutate("Change the summary again", (data) => {
    data.tasks.find((task) => task.id === editedId).summary = "Third summary";
  });
  await ops.execute("github.project", { planId: plan.id });
  assert.match(edited.body, /Third summary/);
  assert.notEqual(originalSection, null);
});

test("one writer: projection takes the tick lock and skips other namespaces and machines", async (t) => {
  const { store, github, ops, plan, approved } = await projectedWorkspace(t, [
    leaf("solo-leaf"),
  ]);
  // Another workspace's issue claims the same task ID under its namespace.
  github.created.push({
    id: 700,
    node_id: "issue-700",
    number: 700,
    repository: "example/code",
    state: "open",
    title: "Theirs",
    body: `<!-- avoozl-task\n${JSON.stringify({ version: 2, taskId: approved.taskIds[0], namespace: "avz_othernamespace00", kind: "leaf", source: { commit: null, manifest: "a".repeat(64) }, applied: { title: "a".repeat(64), body: "a".repeat(64), labels: [], blockers: [] } })}\n-->`,
    labels: [{ name: "avoozl:managed" }],
    assignees: [],
  });
  const { withWorkLock } = await import("../git.mjs"),
    { WORKSPACE_LOCK } = await import("../tick.mjs");
  await withWorkLock(store, WORKSPACE_LOCK, async () => {
    await assert.rejects(
      ops.execute("github.project", { planId: plan.id }),
      (error) => error.contention === true,
    );
  });
  const result = await ops.execute("github.project", { planId: plan.id });
  assert.equal(result.issues.length, 1);
  assert.notEqual(result.issues[0].number, 700);
  assert.equal(github.updated.includes(700), false);
  assert.equal(
    github.created.find((issue) => issue.id === 700).title,
    "Theirs",
  );

  const config = store.get("github_repositories", "example/code");
  store.put("github_repositories", {
    ...config,
    activeMachine: "machine-other",
  });
  const writes = github.updated.length + github.labels.length;
  await assert.rejects(
    ops.execute("github.project", { planId: plan.id }),
    /only previews example\/code/,
  );
  assert.equal(github.updated.length + github.labels.length, writes);
});
