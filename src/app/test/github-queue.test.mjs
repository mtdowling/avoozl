import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

class FakeGitHub {
  constructor() {
    this.private = true;
    this.online = true;
    this.issues = [];
    this.pulls = [];
    this.calls = [];
    this.writes = [];
  }
  available() {
    return true;
  }
  repository(repository) {
    this.calls.push(["repository", repository.id]);
    if (!this.online) throw Error("offline");
    return Promise.resolve({
      node_id: "repo-node",
      full_name: repository.id,
      private: this.private,
    });
  }
  currentUser() {
    return Promise.resolve({ login: "operator" });
  }
  listOpenIssues(repository) {
    this.calls.push(["issues", repository.id]);
    return Promise.resolve(structuredClone(this.issues));
  }
  listPullRequests(repository, input) {
    this.calls.push(["pulls", repository.id, input.state]);
    return Promise.resolve(structuredClone(this.pulls));
  }
  ensureLabel(...args) {
    this.writes.push(["ensureLabel", ...args]);
    throw Error("Queue monitoring must not ensure labels.");
  }
  updateIssue(...args) {
    this.writes.push(["updateIssue", ...args]);
    throw Error("Queue monitoring must not update issues.");
  }
  addLabels(...args) {
    this.writes.push(["addLabels", ...args]);
    throw Error("Queue monitoring must not add labels.");
  }
  addAssignees(...args) {
    this.writes.push(["addAssignees", ...args]);
    throw Error("Queue monitoring must not assign issues.");
  }
  createIssue(...args) {
    this.writes.push(["createIssue", ...args]);
    throw Error("Queue monitoring must not create issues.");
  }
}

function issue(overrides = {}) {
  return {
    id: 7,
    node_id: "issue-node-7",
    number: 7,
    title: "Fix the queue",
    body: "## Acceptance criteria\n\n- [ ] Queue works",
    html_url: "https://example.test/example/code/issues/7",
    state: "open",
    user: { login: "author" },
    assignees: [],
    labels: [{ name: "bug" }],
    created_at: "2026-11-09T12:00:00Z",
    updated_at: "2026-11-10T12:00:00Z",
    ...overrides,
  };
}

function pullRequest(overrides = {}) {
  return {
    id: 9,
    node_id: "pull-node-9",
    number: 9,
    title: "Implement the queue",
    body: "Please review this change.",
    html_url: "https://example.test/example/code/pull/9",
    state: "open",
    user: { login: "contributor" },
    assignees: [{ login: "reviewer" }],
    labels: [{ name: "review" }],
    draft: false,
    head: { ref: "queue", sha: "abcdef0" },
    base: { ref: "main" },
    created_at: "2026-11-09T13:00:00Z",
    updated_at: "2026-11-10T13:00:00Z",
    ...overrides,
  };
}

function operations(t) {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    ops = new Operations(store, { github });
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [],
  });
  return { store, github, ops };
}

test("Queue monitoring is private, read-only configuration separate from dispatch", async (t) => {
  const { store, github, ops } = operations(t);
  await assert.rejects(
    ops.execute("github.queue.configure", {
      repository: "example/unbound",
    }),
    /Choose an execution project/,
  );
  const configured = await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
    enabled: true,
  });
  assert.equal(configured.id, "example/code");
  assert.equal(configured.includeIssues, true);
  assert.equal(configured.includePullRequests, true);
  assert.equal(store.list("github_repositories").length, 0);
  assert.deepEqual(
    github.calls.map((call) => call[0]),
    ["repository"],
  );

  github.private = false;
  await assert.rejects(
    ops.execute("github.queue.configure", {
      repository: "example/public",
      projectId: "code",
    }),
    /configured as private/,
  );
  assert.equal(store.get("github_queue_repositories", "example/public"), null);
});

test("public Queue monitoring is explicitly read-only and never mutates GitHub", async (t) => {
  const { store, github, ops } = operations(t);
  github.private = false;
  github.issues = [issue()];
  github.pulls = [pullRequest()];
  const configured = await ops.execute("github.queue.configure", {
    repository: "example/public",
    projectId: "code",
    visibility: "public",
  });
  assert.equal(configured.private, false);
  assert.equal(configured.visibility, "public");
  assert.equal(configured.accessMode, "public-read-only");
  assert.equal(configured.canAuthorizeExecution, false);

  const synced = await ops.execute("queue.sync", {
    repository: "example/public",
  });
  assert.equal(synced.items, 2);
  assert.equal(synced.repositories[0].visibility, "public");
  assert.equal(synced.repositories[0].accessMode, "public-read-only");
  const queue = await ops.execute("queue.items", {
    repository: "example/public",
  });
  assert.equal(queue.repositories[0].visibility, "public");
  assert.equal(queue.repositories[0].canAuthorizeExecution, false);

  const imported = queue.items.find((item) => item.kind === "issue");
  const created = await ops.execute("queue.createTask", {
    itemId: imported.id,
  });
  assert.equal(created.task.github.repository, "example/public");
  assert.equal(created.task.dispatch.ready, false);
  assert.equal(created.task.dispatch.state, "captured");
  assert.equal(created.task.needsReview, true);
  assert.deepEqual(github.writes, []);
  assert.equal(store.list("github_repositories").length, 0);

  github.private = true;
  await assert.rejects(
    ops.execute("queue.sync", { repository: "example/public" }),
    /configured as public/,
  );
  assert.deepEqual(github.writes, []);
});

test("Queue sync aggregates issues, pull requests, and unblocked local tasks", async (t) => {
  const { github, ops } = operations(t);
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  github.issues = [
    issue(),
    issue({
      id: 8,
      node_id: "issue-node-8",
      number: 8,
      title: "Assigned issue",
      assignees: [{ login: "worker" }],
    }),
  ];
  github.pulls = [pullRequest()];
  const synced = await ops.execute("queue.sync");
  assert.equal(synced.items, 3);
  assert.equal(synced.repositories[0].issues, 2);
  assert.equal(synced.repositories[0].pullRequests, 1);

  const defaultQueue = await ops.execute("queue.items");
  assert.match(defaultQueue.lastSync, /^2026-\d\d-\d\dT/);
  assert.equal(
    defaultQueue.items.some(
      (item) => item.kind === "issue" && item.number === 8,
    ),
    false,
  );
  assert.equal(
    defaultQueue.items.some(
      (item) => item.kind === "issue" && item.number === 7,
    ),
    true,
  );
  assert.equal(
    defaultQueue.items.some(
      (item) => item.kind === "pull-request" && item.number === 9,
    ),
    true,
  );
  assert.equal(
    defaultQueue.items.some((item) => item.kind === "task"),
    true,
  );

  const withAssigned = await ops.execute("queue.items", {
    showAssigned: true,
    kinds: ["issue"],
  });
  assert.deepEqual(
    withAssigned.items.map((item) => item.number).sort(),
    [7, 8],
  );
});

test("Queue synchronization removes closed items and rechecks repository privacy", async (t) => {
  const { store, github, ops } = operations(t);
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  github.issues = [issue()];
  await ops.execute("queue.sync");
  assert.equal(store.list("github_queue_items").length, 1);

  github.issues = [];
  await ops.execute("queue.sync");
  assert.equal(store.list("github_queue_items").length, 0);

  github.private = false;
  let polled = false;
  github.listOpenIssues = async () => {
    polled = true;
    return [];
  };
  await assert.rejects(ops.execute("queue.sync"), /configured as private/);
  assert.equal(polled, false);
});

test("Queue items become reviewable tasks without authorizing execution", async (t) => {
  const { store, github, ops } = operations(t);
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  github.issues = [issue()];
  await ops.execute("queue.sync");
  const item = (await ops.execute("queue.items")).items.find(
      (entry) => entry.kind === "issue",
    ),
    created = await ops.execute("queue.createTask", {
      itemId: item.id,
    });
  assert.equal(created.existing, false);
  assert.equal(created.task.title, "Fix the queue");
  assert.deepEqual(created.task.acceptance, ["Queue works"]);
  assert.equal(created.task.projectId, "code");
  assert.equal(created.task.provenance.kind, "github-issue");
  assert.equal(created.task.provenance.bodyHash, item.bodyHash);
  assert.equal(created.task.dispatch.ready, false);
  assert.equal(created.task.dispatch.state, "captured");
  assert.equal(created.task.needsReview, true);
  assert.equal(
    (await ops.execute("queue")).ready.some(
      (task) => task.id === created.task.id,
    ),
    false,
  );

  const repeated = await ops.execute("queue.createTask", {
    itemId: item.id,
  });
  assert.equal(repeated.existing, true);
  assert.equal(repeated.task.id, created.task.id);
  assert.equal(
    store.read().tasks.filter((task) => task.id === created.task.id).length,
    1,
  );
});

test("Queue monitoring can be disabled offline and removal clears cached items", async (t) => {
  const { store, github, ops } = operations(t);
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  github.issues = [issue()];
  await ops.execute("queue.sync");
  github.online = false;
  const disabled = await ops.execute("github.queue.configure", {
    repository: "example/code",
    enabled: false,
  });
  assert.equal(disabled.enabled, false);
  assert.equal(
    (await ops.execute("queue.items")).items.some(
      (item) => item.repository === "example/code" && item.kind !== "task",
    ),
    false,
  );
  assert.equal(
    (await ops.execute("queue.items")).items.some(
      (item) => item.kind === "issue",
    ),
    false,
  );
  assert.equal(
    github.calls.filter((call) => call[0] === "repository").length,
    2,
  );
  const removed = await ops.execute("github.queue.remove", {
    repository: "example/code",
  });
  assert.equal(removed.removed, true);
  assert.equal(store.list("github_queue_repositories").length, 0);
  assert.equal(store.list("github_queue_items").length, 0);
});
