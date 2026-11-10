import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { queryTasks } from "../../model.mjs";
import { fixture, markdown } from "./fixtures.mjs";

class FakeGitHub {
  constructor() {
    this.login = "worker";
    this.issues = [];
    this.events = new Map();
    this.timelines = new Map();
    this.permissions = new Map();
    this.created = [];
    this.updated = [];
    this.labels = [];
  }
  available() {
    return true;
  }
  repository({ owner, repo }) {
    return Promise.resolve({
      node_id: "repo-node",
      full_name: owner + "/" + repo,
      private: true,
    });
  }
  currentUser() {
    return Promise.resolve({ login: this.login });
  }
  ensureLabel(_repository, label) {
    this.labels.push(["ensure", label.name]);
    return Promise.resolve(label);
  }
  listReadyIssues() {
    return Promise.resolve(this.issues.map((issue) => structuredClone(issue)));
  }
  issueEvents(_repository, number) {
    return Promise.resolve(
      structuredClone(this.events.get(number) || []),
    );
  }
  issueTimeline(_repository, number) {
    return Promise.resolve(
      structuredClone(this.timelines.get(number) || []),
    );
  }
  issue(_repository, number) {
    const issue = this.created.find((item) => item.number === number);
    return Promise.resolve(structuredClone(issue));
  }
  permission(_repository, actor) {
    return Promise.resolve({
      permission: this.permissions.get(actor) || "none",
    });
  }
  createIssue(repository, input) {
    const number = this.created.length + 40;
    const issue = {
      id: number,
      node_id: "issue-" + number,
      number,
      title: input.title,
      body: input.body,
      html_url: `https://example.test/${repository.id}/issues/${number}`,
      assignees: (input.assignees || []).map((login) => ({ login })),
    };
    this.created.push(issue);
    return Promise.resolve(structuredClone(issue));
  }
  updateIssue(_repository, number, input) {
    const issue = this.created.find((item) => item.number === number);
    Object.assign(issue, input);
    this.updated.push(number);
    return Promise.resolve(structuredClone(issue));
  }
  addLabels(_repository, number, labels) {
    this.labels.push(["add", number, ...labels]);
    return Promise.resolve([]);
  }
  removeLabel(_repository, number, label) {
    this.labels.push(["remove", number, label]);
    return Promise.resolve(null);
  }
  addAssignees(_repository, number, assignees) {
    const issue = this.created.find((item) => item.number === number);
    issue.assignees = assignees.map((login) => ({ login }));
    return Promise.resolve({ assignees: issue.assignees });
  }
}

function configure(store, github, manager = null) {
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [],
  });
  const ops = new Operations(store, { github, manager, operator: "Operator" });
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

test("public repositories are refused before labels or issue mutations", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub();
  github.repository = async () => ({
    node_id: "public-repo",
    full_name: "example/public",
    private: false,
  });
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [],
  });
  const ops = new Operations(store, { github });
  await assert.rejects(
    ops.execute("github.configure", {
      repository: "example/public",
      projectId: "code",
    }),
    /refuses public repositories/,
  );
  assert.equal(github.labels.length, 0);
  assert.equal(store.list("github_repositories").length, 0);
});

test("a repository made public after registration is refused before polling", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    ops = await configure(store, github);
  let polled = false;
  github.repository = async () => ({
    node_id: "repo-node",
    full_name: "example/code",
    private: false,
  });
  github.listReadyIssues = async () => {
    polled = true;
    return [];
  };
  await assert.rejects(ops.execute("github.sync"), /must remain private/);
  assert.equal(polled, false);
});

test("a repository made public after authorization cannot dispatch work", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    starts = [],
    manager = {
      remote: true,
      start(input) {
        starts.push(input);
        return Promise.resolve({ id: "must-not-start", ...input });
      },
    };
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
  const ops = await configure(store, github, manager);
  const synced = await ops.execute("github.sync");
  github.repository = async () => ({
    node_id: "repo-node",
    full_name: "example/code",
    private: false,
  });
  await assert.rejects(
    ops.execute("github.start", { taskId: synced.authorized[0].taskId }),
    /must remain private/,
  );
  assert.equal(starts.length, 0);
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
  const pending = await ops.execute("github.sync");
  assert.equal(pending.pending.length, 1);
  const task = store.read().tasks.find((item) => item.github?.number === 7);
  assert.equal(task.needsReview, true);
  assert.equal(task.dispatch.ready, false);

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
  await ops.execute("github.sync");
  github.issues = [];
  await ops.execute("github.sync");
  const withdrawn = store.read().tasks.find((item) => item.id === task.id);
  assert.equal(withdrawn.dispatch.state, "withdrawn");
  assert.equal(withdrawn.status, "planned");
});

test("approved design tasks project once, preserve human issue text, and enter the same start path", async (t) => {
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
  assert.equal(github.labels.some(([kind]) => kind === "add"), true);
  assert.equal(github.labels.some(([kind]) => kind === "remove"), true);

  github.created[0].body += "\n\nHuman coordination note.";
  const projectedAgain = await ops.execute("github.project", {
    planId: plan.id,
    repository: "example/code",
  });
  assert.equal(github.created.length, approved.taskIds.length);
  assert.equal(projectedAgain.issues[0].body.includes("Human coordination note."), true);

  const task = store.read().tasks.find((item) => item.id === approved.taskIds[0]);
  store.mutate("Make projected task ready", (data) => {
    const local = data.tasks.find((item) => item.id === task.id);
    local.dispatch = { ...local.dispatch, ready: true, state: "authorized" };
    local.needsReview = false;
  });
  assert.equal(
    store.read().tasks.find((item) => item.id === task.id).dispatch.state,
    "authorized",
  );
  const run = await ops.execute("github.start", { taskId: task.id });
  assert.equal(run.id, "run-from-issue");
  assert.equal(starts[0].projectId, "code");
  assert.equal(starts[0].provider, "openhands");
});
