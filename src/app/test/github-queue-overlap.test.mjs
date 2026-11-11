import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

class FakeGitHub {
  constructor() {
    this.issues = [];
    this.pulls = [];
  }
  available() {
    return true;
  }
  repository(repository) {
    return Promise.resolve({
      node_id: `repo:${repository.id}`,
      full_name: repository.id,
      private: true,
    });
  }
  currentUser() {
    return Promise.resolve({ login: "operator" });
  }
  listOpenIssues() {
    return Promise.resolve(structuredClone(this.issues));
  }
  listPullRequests() {
    return Promise.resolve(structuredClone(this.pulls));
  }
}

function issue(overrides = {}) {
  return {
    id: 7,
    node_id: "issue-node-7",
    number: 7,
    title: "Prevent duplicate queue imports",
    body: "Queue polling must not create duplicate imported work.",
    html_url: "https://github.com/example/code/issues/7",
    state: "open",
    user: { login: "author" },
    assignees: [],
    labels: [],
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
    title: "Refine queue import",
    body: "Review the importer.",
    html_url: "https://github.com/example/code/pull/9",
    state: "open",
    user: { login: "contributor" },
    assignees: [],
    labels: [],
    draft: false,
    head: { ref: "queue", sha: "abcdef0" },
    base: { ref: "main" },
    created_at: "2026-11-09T13:00:00Z",
    updated_at: "2026-11-10T13:00:00Z",
    ...overrides,
  };
}

async function setup(t) {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    ops = new Operations(store, { github, operator: "reviewer" });
  for (const id of ["code", "other"])
    store.put("projects", {
      id,
      root: `/tmp/${id}`,
      baseBranch: "main",
      worktreeRoot: `/tmp/${id}-worktrees`,
      checks: [],
    });
  await ops.execute("github.queue.configure", {
    repository: "example/code",
    projectId: "code",
  });
  return { store, github, ops };
}

test("Queue items rank unconfirmed task and plan overlaps using local evidence", async (t) => {
  const { store, github, ops } = await setup(t);
  store.mutate("Add overlap fixtures", (data) => {
    data.tasks.push(
      {
        id: "queue-import-deduplication",
        title: "Make queue ingestion idempotent",
        summary: "Reconcile imported work during each poll.",
        approvedSource: {
          text: "Prevent duplicate queue imports when queue polling repeats.",
        },
        scope: "catalog",
        status: "planned",
        epic: "sample",
        track: "catalog",
        tags: [],
        acceptance: ["One imported item remains after repeated polling."],
        projectId: "code",
      },
      {
        id: "wrong-project-duplicate",
        title: "Prevent duplicate queue imports",
        scope: "catalog",
        status: "planned",
        epic: "sample",
        track: "catalog",
        tags: [],
        acceptance: ["Other project remains separate."],
        projectId: "other",
      },
      {
        id: "wrong-repository-duplicate",
        title: "Prevent duplicate queue imports",
        scope: "catalog",
        status: "planned",
        epic: "sample",
        track: "catalog",
        tags: [],
        acceptance: ["Other repository remains separate."],
        projectId: "code",
        github: {
          repository: "example/other",
          number: 7,
          origin: "issue-request",
        },
      },
    );
  });
  store.put("plans", {
    id: "plan-review-queue-pr",
    kind: "plan",
    title: "Queue review follow-up",
    prompt: "Review the existing pull request.",
    text: "# Queue review\n\nTrack https://github.com/example/code/pull/9.",
    hash: "plan-hash",
    revision: 1,
    state: "draft",
    context: { projectId: "code" },
  });
  github.issues = [issue()];
  github.pulls = [pullRequest()];
  await ops.execute("queue.sync");

  const queue = await ops.execute("queue.items", { showAssigned: true }),
    issueItem = queue.items.find((item) => item.kind === "issue"),
    pullItem = queue.items.find((item) => item.kind === "pull-request"),
    taskCandidate = issueItem.overlapCandidates.find(
      (candidate) => candidate.targetId === "queue-import-deduplication",
    ),
    planCandidate = pullItem.overlapCandidates.find(
      (candidate) => candidate.targetId === "plan-review-queue-pr",
    );
  assert.equal(taskCandidate.unconfirmed, true);
  assert.ok(taskCandidate.score >= 35);
  assert.ok(
    taskCandidate.reasons.some((reason) => reason.code === "source-terms"),
  );
  assert.equal(
    issueItem.overlapCandidates.some(
      (candidate) => candidate.targetId === "wrong-project-duplicate",
    ),
    false,
  );
  assert.equal(
    issueItem.overlapCandidates.some(
      (candidate) => candidate.targetId === "wrong-repository-duplicate",
    ),
    false,
  );
  assert.equal(planCandidate.unconfirmed, true);
  assert.ok(
    planCandidate.reasons.some((reason) => reason.code === "explicit-url"),
  );
  assert.ok(planCandidate.score > taskCandidate.score);
});

test("Confirming an overlap records a neutral link without changing provenance", async (t) => {
  const { store, github, ops } = await setup(t);
  const plan = {
    id: "plan-queue-deduplication",
    kind: "plan",
    title: "Prevent duplicate queue imports",
    prompt: "Make queue synchronization idempotent.",
    text: "# Prevent duplicate queue imports",
    hash: "immutable-plan-hash",
    revision: 3,
    state: "approved",
    context: { projectId: "code" },
  };
  store.put("plans", plan);
  github.issues = [issue()];
  await ops.execute("queue.sync");
  const before = await ops.execute("queue.items"),
    item = before.items.find((entry) => entry.kind === "issue");
  assert.ok(
    item.overlapCandidates.some((candidate) => candidate.targetId === plan.id),
  );

  const linked = await ops.execute(
    "queue.confirmLink",
    {
      itemId: item.id,
      targetKind: "plan",
      targetId: plan.id,
    },
    store.read().revision,
  );
  assert.equal(linked.existing, false);
  assert.equal(linked.association.targetKind, "plan");
  assert.equal(linked.association.source, "operator-confirmed");
  assert.equal(linked.association.confirmedBy, "reviewer");
  assert.equal(store.get("plans", plan.id).hash, "immutable-plan-hash");
  assert.equal(store.list("github_queue_associations").length, 1);

  const after = await ops.execute("queue.items"),
    afterItem = after.items.find((entry) => entry.id === item.id);
  assert.equal(
    afterItem.overlapCandidates.some(
      (candidate) => candidate.targetId === plan.id,
    ),
    false,
  );
  assert.equal(afterItem.associations[0].targetId, plan.id);
  const repeated = await ops.execute("queue.confirmLink", {
    itemId: item.id,
    targetKind: "plan",
    targetId: plan.id,
  });
  assert.equal(repeated.existing, true);
  assert.equal(store.list("github_queue_associations").length, 1);
});

test("A task created from a Queue item is already a confirmed origin association", async (t) => {
  const { github, ops } = await setup(t);
  github.issues = [issue()];
  await ops.execute("queue.sync");
  const item = (await ops.execute("queue.items")).items.find(
      (entry) => entry.kind === "issue",
    ),
    created = await ops.execute("queue.createTask", { itemId: item.id }),
    linked = await ops.execute("queue.confirmLink", {
      itemId: item.id,
      targetKind: "task",
      targetId: created.task.id,
    }),
    refreshed = (await ops.execute("queue.items")).items.find(
      (entry) => entry.id === item.id,
    );
  assert.equal(linked.existing, true);
  assert.equal(linked.association.source, "task-origin");
  assert.equal(
    refreshed.overlapCandidates.some(
      (candidate) => candidate.targetId === created.task.id,
    ),
    false,
  );
  assert.equal(refreshed.associations[0].targetId, created.task.id);
});
