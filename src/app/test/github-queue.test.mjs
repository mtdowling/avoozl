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
    this.issueComments = [];
    this.reviewComments = [];
    this.pullFiles = [];
    this.calls = [];
    this.writes = [];
    this.currentUserLogin = "operator";
    this.assignError = null;
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
    return Promise.resolve({ login: this.currentUserLogin });
  }
  listOpenIssues(repository) {
    this.calls.push(["issues", repository.id]);
    return Promise.resolve(structuredClone(this.issues));
  }
  issue(repository, number) {
    this.calls.push(["issue", repository.id, number]);
    const found = this.issues.find((item) => item.number === number);
    return Promise.resolve(structuredClone(found));
  }
  listPullRequests(repository, input) {
    this.calls.push(["pulls", repository.id, input.state]);
    return Promise.resolve(structuredClone(this.pulls));
  }
  listIssueComments(repository, number) {
    this.calls.push(["issueComments", repository.id, number]);
    return Promise.resolve(structuredClone(this.issueComments));
  }
  listPullRequestReviewComments(repository, number) {
    this.calls.push(["reviewComments", repository.id, number]);
    return Promise.resolve(structuredClone(this.reviewComments));
  }
  listPullRequestFiles(repository, number, input) {
    this.calls.push(["pullFiles", repository.id, number, input.maxFiles]);
    return Promise.resolve({
      files: structuredClone(this.pullFiles),
      truncated: false,
    });
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
    if (this.assignError) throw this.assignError;
    const [, number, logins] = args,
      found = this.issues.find((item) => item.number === number);
    if (found)
      found.assignees = [
        ...new Map(
          [
            ...(found.assignees || []),
            ...logins.map((login) => ({ login })),
          ].map((entry) => [entry.login, entry]),
        ).values(),
      ];
    return Promise.resolve(structuredClone(found));
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
  const remoteOnly = await ops.execute("github.queue.configure", {
    repository: "example/unbound",
  });
  assert.equal(remoteOnly.projectId, null);
  const configured = await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
    enabled: true,
  });
  assert.equal(configured.id, "example/code");
  assert.equal(configured.includeIssues, true);
  assert.equal(configured.includePullRequests, true);
  assert.equal(configured.automation.repository, "example/code");
  assert.equal(configured.automation.eligible, true);
  assert.equal(configured.automation.controlPlane.state, "missing");
  assert.deepEqual(
    configured.automation.relatedAutomations.map((item) => item.role),
    ["issue-implementation", "pull-request-review", "comment-response"],
  );
  assert.ok(
    configured.automation.relatedAutomations.every(
      (item) =>
        item.handoff.requiresUserReview &&
        item.handoff.createsAutomation === false,
    ),
  );
  assert.equal(store.list("github_repositories").length, 0);
  assert.deepEqual(
    github.calls.map((call) => call[0]),
    ["repository", "repository"],
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
  const { store, github, ops } = operations(t),
    provisioned = [];
  ops.provisionGitHubIntake = async (repository, options) => {
    provisioned.push([repository, options]);
    return { state: "active" };
  };
  github.private = false;
  github.issues = [issue()];
  github.pulls = [pullRequest()];
  const configured = await ops.execute("github.queue.configure", {
    repository: "example/public",
    projectId: "code",
    visibility: "public",
    provisionAutomation: true,
  });
  assert.equal(configured.private, false);
  assert.equal(configured.visibility, "public");
  assert.equal(configured.accessMode, "public-read-only");
  assert.equal(configured.canAuthorizeExecution, false);
  assert.deepEqual(provisioned, [["example/public", { enable: true }]]);

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

test("Queue sync stores original labels and repository-normalized states", async (t) => {
  const { store, github, ops } = operations(t);
  const configured = await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
    labelBehaviors: {
      ready: ["queued"],
      blocked: ["waiting"],
      review: ["needs-eyes"],
      quarantined: ["unsafe"],
    },
  });
  assert.deepEqual(configured.labelBehaviors.ready, ["queued"]);
  github.issues = [
    issue({ labels: [{ name: "bug" }, { name: "Queued" }] }),
    issue({
      id: 8,
      node_id: "issue-node-8",
      number: 8,
      labels: [{ name: "unsafe" }, { name: "waiting" }],
    }),
  ];
  await ops.execute("queue.sync");
  const items = store
    .list("github_queue_items")
    .sort((left, right) => left.number - right.number);
  assert.deepEqual(items[0].labels, ["bug", "Queued"]);
  assert.deepEqual(items[0].normalizedStates, ["ready"]);
  assert.equal(items[0].normalizedState, "ready");
  assert.deepEqual(items[1].labels, ["unsafe", "waiting"]);
  assert.deepEqual(items[1].normalizedStates, ["quarantined", "blocked"]);
  assert.equal(items[1].normalizedState, "quarantined");
});

test("Queue synchronization preserves closed items as hidden processed history and rechecks repository privacy", async (t) => {
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
  assert.equal(store.list("github_queue_items").length, 1);
  assert.equal((await ops.execute("queue.items")).items.length, 1);
  assert.equal(
    (await ops.execute("queue.items")).items.some(
      (item) => item.kind === "issue",
    ),
    false,
  );
  const processed = await ops.execute("queue.items", {
    showProcessed: true,
  });
  assert.equal(
    processed.items.find((item) => item.kind === "issue").processed,
    true,
  );
  assert.equal(
    processed.items.find((item) => item.kind === "issue").disposition,
    "no-longer-open",
  );

  github.private = false;
  let polled = false;
  github.listOpenIssues = async () => {
    polled = true;
    return [];
  };
  await assert.rejects(ops.execute("queue.sync"), /configured as private/);
  assert.equal(polled, false);
});

test("Queue hides linked GitHub work unless processed history is requested", async (t) => {
  const { github, ops } = operations(t);
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  github.issues = [issue()];
  await ops.execute("queue.sync");
  const queueItem = (await ops.execute("queue.items")).items.find(
    (item) => item.kind === "issue",
  );
  await ops.execute("queue.createTask", { itemId: queueItem.id });

  assert.equal(
    (await ops.execute("queue.items")).items.some(
      (item) => item.id === queueItem.id,
    ),
    false,
  );
  const history = await ops.execute("queue.items", { showProcessed: true });
  assert.equal(
    history.items.find((item) => item.id === queueItem.id).processed,
    true,
  );
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

test("explicit Queue claim assigns the authenticated GitHub user and routes a captured task", async (t) => {
  const { store, github, ops } = operations(t);
  github.private = false;
  await ops.execute("github.queue.configure", {
    repository: "example/public",
    projectId: "code",
    visibility: "public",
  });
  github.issues = [issue()];
  await ops.execute("queue.sync");
  const item = (await ops.execute("queue.items")).items.find(
      (entry) => entry.kind === "issue",
    ),
    claimed = await ops.execute("queue.claim", { itemId: item.id });

  assert.equal(claimed.claim.login, "operator");
  assert.equal(claimed.claim.authorization, false);
  assert.equal(claimed.claim.activationLease, false);
  assert.equal(claimed.task.owner, "operator");
  assert.equal(claimed.task.dispatch.ready, false);
  assert.equal(claimed.task.dispatch.state, "captured");
  assert.equal(claimed.task.githubClaim.receiptId, claimed.claim.id);
  assert.deepEqual(
    github.writes.map((write) => write[0]),
    ["addAssignees"],
  );
  assert.deepEqual(github.issues[0].assignees, [{ login: "operator" }]);
  assert.equal(store.list("runs").length, 0);

  const repeated = await ops.execute("queue.claim", { itemId: item.id });
  assert.equal(repeated.existing, true);
  assert.equal(repeated.task.id, claimed.task.id);
  assert.equal(github.writes.length, 1);
});

test("Queue claim fails closed before assignment when the issue changed or belongs to another user", async (t) => {
  const { github, ops } = operations(t);
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  github.issues = [issue()];
  await ops.execute("queue.sync");
  const item = (await ops.execute("queue.items")).items.find(
    (entry) => entry.kind === "issue",
  );

  github.issues[0].body = "Changed after the Queue snapshot.";
  await assert.rejects(
    ops.execute("queue.claim", { itemId: item.id }),
    /changed.*Sync Queue/i,
  );
  assert.deepEqual(github.writes, []);

  github.issues[0] = issue({ assignees: [{ login: "someone-else" }] });
  await assert.rejects(
    ops.execute("queue.claim", { itemId: item.id }),
    /already assigned to someone-else/,
  );
  assert.deepEqual(github.writes, []);
});

test("failed Queue assignment leaves a resumable receipt but no routed task or run", async (t) => {
  const { store, github, ops } = operations(t);
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  github.issues = [issue()];
  await ops.execute("queue.sync");
  const item = (await ops.execute("queue.items")).items.find(
    (entry) => entry.kind === "issue",
  );
  github.assignError = Object.assign(Error("assignment forbidden"), {
    status: 403,
  });

  await assert.rejects(
    ops.execute("queue.claim", { itemId: item.id }),
    /assignment forbidden/,
  );
  const receipt = store
    .list("receipts")
    .find((entry) => entry.kind === "github-queue-claim");
  assert.equal(receipt.state, "pending");
  assert.match(receipt.error, /assignment forbidden/);
  assert.equal(
    store.read().tasks.some((task) => task.github?.nodeId === item.nodeId),
    false,
  );
  assert.equal(store.list("runs").length, 0);
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

test("Queue comments load issue discussion and pull-request review threads on demand", async (t) => {
  const { github, ops } = operations(t);
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  github.pulls = [pullRequest()];
  await ops.execute("queue.sync");
  const item = (
    await ops.execute("queue.items", { showAssigned: true })
  ).items.find((entry) => entry.kind === "pull-request");
  github.issueComments = [
    {
      id: 20,
      node_id: "issue-comment-node-20",
      body: "General review note",
      html_url: "https://example.test/example/code/pull/9#issuecomment-20",
      user: { login: "maintainer" },
      author_association: "MEMBER",
      created_at: "2026-11-10T10:00:00Z",
      updated_at: "2026-11-10T10:05:00Z",
      reactions: { total_count: 1, "+1": 1 },
    },
  ];
  github.reviewComments = [
    {
      id: 30,
      node_id: "review-comment-node-30",
      body: "Please cover this branch.",
      html_url: "https://example.test/example/code/pull/9#discussion_r30",
      user: { login: "reviewer" },
      author_association: "COLLABORATOR",
      created_at: "2026-11-10T11:00:00Z",
      updated_at: "2026-11-10T11:00:00Z",
      path: "src/queue.mjs",
      line: 42,
      side: "RIGHT",
      commit_id: "new-commit",
      original_commit_id: "old-commit",
      pull_request_review_id: 71,
      diff_hunk: "@@ -40,2 +40,3 @@",
    },
    {
      id: 31,
      node_id: "review-comment-node-31",
      body: "Covered in the latest change.",
      html_url: "https://example.test/example/code/pull/9#discussion_r31",
      user: { login: "contributor" },
      created_at: "2026-11-10T12:00:00Z",
      updated_at: "2026-11-10T12:00:00Z",
      path: "src/queue.mjs",
      line: 42,
      side: "RIGHT",
      in_reply_to_id: 30,
    },
  ];

  const thread = await ops.execute("queue.comments", { itemId: item.id });
  assert.deepEqual(thread.counts, { issue: 1, review: 2, total: 3 });
  assert.equal(thread.item.id, item.id);
  assert.deepEqual(
    thread.comments.map((comment) => comment.kind),
    ["issue-comment", "review-comment", "review-comment"],
  );
  assert.equal(thread.comments[0].author, "maintainer");
  assert.equal(thread.comments[0].reactions.plusOne, 1);
  assert.equal(thread.comments[1].path, "src/queue.mjs");
  assert.equal(thread.comments[1].line, 42);
  assert.equal(thread.comments[2].inReplyToId, 30);
  assert.equal(thread.comments[2].replyToId, thread.comments[1].id);
  assert.equal(thread.comments[2].threadId, thread.comments[1].id);
  assert.deepEqual(
    github.calls.slice(-3).map((call) => call[0]),
    ["repository", "issueComments", "reviewComments"],
  );
  assert.deepEqual(github.writes, []);
});

test("Queue pull-request diffs are read-only, bounded, and normalized", async (t) => {
  const { github, ops } = operations(t);
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  github.pulls = [pullRequest()];
  await ops.execute("queue.sync");
  const item = (
    await ops.execute("queue.items", { showAssigned: true })
  ).items.find((entry) => entry.kind === "pull-request");
  github.pullFiles = [
    {
      sha: "file-sha",
      filename: "src/queue.mjs",
      status: "modified",
      additions: 2,
      deletions: 1,
      changes: 3,
      blob_url: "https://example.test/blob/src/queue.mjs",
      raw_url: "https://example.test/raw/src/queue.mjs",
      patch: "@@ -1,2 +1,3 @@\n-old\n+new\n context",
    },
    {
      sha: "binary-sha",
      filename: "assets/logo.png",
      status: "modified",
      additions: 0,
      deletions: 0,
      changes: 0,
      blob_url: "https://example.test/blob/assets/logo.png",
    },
  ];

  const diff = await ops.execute("queue.diff", { itemId: item.id });
  assert.equal(diff.item.id, item.id);
  assert.deepEqual(diff.counts, { files: 2, additions: 2, deletions: 1 });
  assert.equal(diff.files[0].patch.includes("+new"), true);
  assert.equal(diff.files[0].patchUnavailable, false);
  assert.equal(diff.files[1].patch, null);
  assert.equal(diff.files[1].patchUnavailable, true);
  assert.equal(diff.limits.files, 300);
  assert.deepEqual(
    github.calls.slice(-2).map((call) => call[0]),
    ["repository", "pullFiles"],
  );
  assert.deepEqual(github.writes, []);
});

test("Queue diffs require a pull request and an enabled matching source", async (t) => {
  const { github, ops } = operations(t);
  await assert.rejects(
    ops.execute("queue.diff", { itemId: "missing" }),
    /Queue item not found/,
  );
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  github.issues = [issue()];
  await ops.execute("queue.sync");
  const issueItem = (await ops.execute("queue.items")).items.find(
    (entry) => entry.kind === "issue",
  );
  await assert.rejects(
    ops.execute("queue.diff", { itemId: issueItem.id }),
    /Only pull requests/,
  );
});

test("Queue issue comments do not request pull-request review comments", async (t) => {
  const { github, ops } = operations(t);
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  github.issues = [issue()];
  await ops.execute("queue.sync");
  const item = (await ops.execute("queue.items")).items.find(
    (entry) => entry.kind === "issue",
  );
  github.issueComments = [
    {
      id: 40,
      node_id: "issue-comment-node-40",
      body: "Issue-only comment",
      user: { login: "author" },
      created_at: "2026-11-10T10:00:00Z",
    },
  ];

  const thread = await ops.execute("queue.comments", { itemId: item.id });
  assert.deepEqual(thread.counts, { issue: 1, review: 0, total: 1 });
  assert.equal(thread.comments[0].kind, "issue-comment");
  assert.equal(
    github.calls.some((call) => call[0] === "reviewComments"),
    false,
  );
});

test("Queue comments require a cached item, enabled source, and matching visibility", async (t) => {
  const { github, ops } = operations(t);
  await assert.rejects(
    ops.execute("queue.comments", { itemId: "missing" }),
    /Queue item not found/,
  );
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  github.issues = [issue()];
  await ops.execute("queue.sync");
  const item = (await ops.execute("queue.items")).items.find(
    (entry) => entry.kind === "issue",
  );
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    enabled: false,
  });
  await assert.rejects(
    ops.execute("queue.comments", { itemId: item.id }),
    /Enable this monitored repository/,
  );

  github.online = true;
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
    enabled: true,
  });
  github.private = false;
  const commentCalls = github.calls.length;
  await assert.rejects(
    ops.execute("queue.comments", { itemId: item.id }),
    /configured as private/,
  );
  assert.deepEqual(
    github.calls.slice(commentCalls).map((call) => call[0]),
    ["repository"],
  );
});
