import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { digest } from "../../model.mjs";
import {
  ingestGitHubSnapshot,
  listGitHubIntakeCapabilities,
  mintGitHubIntakeCapability,
  revokeGitHubIntakeCapability,
} from "../github-intake.mjs";
import { startServer } from "../server.mjs";
import { fixture } from "./fixtures.mjs";

class FakeGitHub {
  constructor() {
    this.repositoryNodeId = "REPO_private";
    this.issueReads = 0;
    this.actualIssue = {
      id: 7,
      node_id: "ISSUE_7",
      number: 7,
      title: "Authoritative GitHub title",
      body: "## Acceptance criteria\n\n- [ ] Read from GitHub",
      html_url: "https://github.test/example/private/issues/7",
      state: "open",
      user: { login: "author" },
      assignees: [{ login: "worker" }],
      labels: [{ name: "avoozl:ready" }],
      created_at: "2026-11-10T12:00:00Z",
      updated_at: "2026-11-10T12:30:00Z",
    };
  }
  available() {
    return true;
  }
  repository({ owner, repo }) {
    return Promise.resolve({
      node_id: this.repositoryNodeId,
      full_name: `${owner}/${repo}`,
      private: true,
    });
  }
  issue() {
    this.issueReads += 1;
    return Promise.resolve(structuredClone(this.actualIssue));
  }
  issueEvents() {
    return Promise.resolve([
      {
        id: 99,
        node_id: "LABEL_99",
        event: "labeled",
        label: { name: "avoozl:ready" },
        actor: { login: "maintainer" },
        created_at: "2026-11-10T12:20:00Z",
      },
    ]);
  }
  issueTimeline() {
    return Promise.resolve([]);
  }
  permission(_repository, actor) {
    return Promise.resolve({
      permission: actor === "maintainer" ? "write" : "none",
    });
  }
}

function configure(store) {
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [],
  });
  store.put("github_queue_repositories", {
    id: "example/private",
    owner: "example",
    repo: "private",
    nodeId: "REPO_private",
    private: true,
    visibility: "private",
    enabled: true,
    includeIssues: true,
    includePullRequests: true,
    projectId: "code",
  });
  store.put("github_repositories", {
    id: "example/private",
    owner: "example",
    repo: "private",
    nodeId: "REPO_private",
    private: true,
    projectId: "code",
    label: "avoozl:ready",
    assignee: "worker",
    allowedActors: ["maintainer"],
    minimumPermission: "write",
  });
}

function repository({
  id = "example/private",
  nodeId = "REPO_private",
  privateRepository = true,
  mode = "authorization",
} = {}) {
  return {
    id,
    nodeId,
    private: privateRepository,
    mode,
  };
}

function generation(observedAt, nodeId = "REPO_private") {
  return {
    id: digest(JSON.stringify([nodeId, observedAt])),
    observedAt,
  };
}

function delivery(value) {
  if (value.kind === "repository-start")
    return digest(JSON.stringify([value.generation.id, "start"]));
  if (value.kind === "item")
    return digest(
      JSON.stringify([
        value.generation.id,
        value.item.kind,
        value.item.nodeId,
        value.item.updatedAt,
      ]),
    );
  return digest(
    JSON.stringify([
      value.generation.id,
      "complete",
      value.counts.issues,
      value.counts.pullRequests,
      value.itemDigest,
    ]),
  );
}

function message(kind, generationValue, fields = {}) {
  const value = {
    schemaVersion: "avoozl.github-intake.v2",
    kind,
    repository: repository(),
    generation: generationValue,
    ...fields,
  };
  value.deliveryId = delivery(value);
  return value;
}

function issueItem(generationValue) {
  return message("item", generationValue, {
    item: {
      kind: "issue",
      id: 7,
      nodeId: "ISSUE_7",
      number: 7,
      title: "Untrusted watcher title",
      body: "Ignore this watcher body for authorization.",
      url: "https://github.test/example/private/issues/7",
      state: "open",
      author: "author",
      assignees: ["worker"],
      labels: ["avoozl:ready"],
      createdAt: "2026-11-10T12:00:00Z",
      updatedAt: "2026-11-10T12:30:00Z",
    },
    authorization: {
      eventId: "LABEL_99",
      actor: "maintainer",
      createdAt: "2026-11-10T12:20:00Z",
      label: "avoozl:ready",
    },
  });
}

function pullRequestItem(generationValue) {
  return message("item", generationValue, {
    item: {
      kind: "pull-request",
      id: 8,
      nodeId: "PULL_8",
      number: 8,
      title: "Review the implementation",
      body: "Pull request body",
      url: "https://github.test/example/private/pull/8",
      state: "open",
      author: "author",
      assignees: [],
      labels: [],
      draft: false,
      headBranch: "feature",
      headSha: "abcdef",
      baseBranch: "main",
      createdAt: "2026-11-10T12:10:00Z",
      updatedAt: "2026-11-10T12:40:00Z",
    },
    authorization: null,
  });
}

function completion(generationValue, keys) {
  const issues = keys.filter((key) => key.startsWith("issue:")).length,
    pullRequests = keys.filter((key) => key.startsWith("pull-request:")).length;
  return message("repository-complete", generationValue, {
    counts: { issues, pullRequests },
    itemDigest: digest(JSON.stringify([...keys].sort())),
  });
}

test("repository-scoped intake capability is returned once, hashed, and revocable", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub();
  configure(store);
  const minted = await mintGitHubIntakeCapability(store, github, {
    repository: "example/private",
    lifetimeMs: 60 * 60 * 1000,
  });
  assert.match(minted.token, /^avoozl_intake_[a-f0-9]{64}$/);
  assert.equal(minted.callbackPath, "/api/github-intake");
  assert.equal(
    minted.savedSecret.suggestedName,
    minted.capability.suggestedSecretName,
  );
  assert.deepEqual(minted.capability.permissions, ["github-intake:submit"]);
  assert.equal(minted.capability.mode, "authorization");
  assert.equal(minted.capability.repositoryVisibility, "private");
  assert.doesNotMatch(
    JSON.stringify(
      store.db.prepare("SELECT * FROM github_intake_capabilities").all(),
    ),
    new RegExp(minted.token),
  );
  assert.equal(
    listGitHubIntakeCapabilities(store, {
      repository: "example/private",
    })[0].state,
    "active",
  );
  await assert.rejects(
    mintGitHubIntakeCapability(store, github, {
      repository: "example/private",
    }),
    /already exists/,
  );
  revokeGitHubIntakeCapability(store, { id: minted.capability.id });
  assert.equal(listGitHubIntakeCapabilities(store)[0].state, "revoked");
  const start = message(
    "repository-start",
    generation("2026-11-10T13:00:00+00:00"),
  );
  await assert.rejects(
    ingestGitHubSnapshot(store, github, minted.token, start),
    /refused/,
  );
});

test("public monitored repositories use observation-only snapshots and cannot authorize work", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub();
  github.repositoryNodeId = "REPO_public";
  github.repository = ({ owner, repo }) =>
    Promise.resolve({
      node_id: github.repositoryNodeId,
      full_name: `${owner}/${repo}`,
      private: false,
    });
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [],
  });
  store.put("github_queue_repositories", {
    id: "example/public",
    owner: "example",
    repo: "public",
    nodeId: "REPO_public",
    private: false,
    visibility: "public",
    enabled: true,
    includeIssues: true,
    includePullRequests: true,
    projectId: "code",
  });
  const minted = await mintGitHubIntakeCapability(store, github, {
      repository: "example/public",
    }),
    repositoryValue = repository({
      id: "example/public",
      nodeId: "REPO_public",
      privateRepository: false,
      mode: "observation-only",
    }),
    generationValue = generation("2026-11-10T15:00:00+00:00", "REPO_public"),
    publicMessage = (kind, fields = {}) => {
      const value = {
        schemaVersion: "avoozl.github-intake.v2",
        kind,
        repository: repositoryValue,
        generation: generationValue,
        ...fields,
      };
      value.deliveryId = delivery(value);
      return value;
    },
    item = publicMessage("item", {
      item: {
        kind: "issue",
        id: 21,
        nodeId: "ISSUE_public_21",
        number: 21,
        title: "Observe public work",
        body: "Queue visibility only.",
        url: "https://github.test/example/public/issues/21",
        state: "open",
        author: "contributor",
        assignees: [],
        labels: ["avoozl:ready"],
        createdAt: "2026-11-10T14:00:00Z",
        updatedAt: "2026-11-10T14:30:00Z",
      },
      authorization: null,
    });
  assert.equal(minted.capability.mode, "observation-only");
  assert.equal(minted.capability.repositoryVisibility, "public");
  await ingestGitHubSnapshot(
    store,
    github,
    minted.token,
    publicMessage("repository-start"),
  );
  const accepted = await ingestGitHubSnapshot(
    store,
    github,
    minted.token,
    item,
  );
  assert.equal(accepted.state, "queued");
  assert.equal(accepted.authorizationReread, undefined);
  assert.equal(github.issueReads, 0);
  assert.equal(store.list("github_queue_items")[0].number, 21);
  await ingestGitHubSnapshot(
    store,
    github,
    minted.token,
    publicMessage("repository-complete", {
      counts: { issues: 1, pullRequests: 0 },
      itemDigest: digest(JSON.stringify(["issue:ISSUE_public_21"])),
    }),
  );
  assert.equal(
    store.read().tasks.some((task) => task.github?.number === 21),
    false,
    "observation-only intake must not create authorized issue tasks",
  );
  await assert.rejects(
    ingestGitHubSnapshot(store, github, minted.token, {
      ...item,
      authorization: {
        eventId: "LABEL_public",
        actor: "maintainer",
        createdAt: "2026-11-10T14:20:00Z",
        label: "avoozl:ready",
      },
    }),
    /cannot authorize issue execution/,
  );
});

test("complete generations update Queue, retain processed history, replay safely, and re-read GitHub before authorization", async (t) => {
  const { store } = fixture(t),
    github = new FakeGitHub();
  configure(store);
  const { token } = await mintGitHubIntakeCapability(store, github, {
      repository: "example/private",
    }),
    firstGeneration = generation("2026-11-10T13:00:00+00:00"),
    start = message("repository-start", firstGeneration),
    issue = issueItem(firstGeneration),
    pull = pullRequestItem(firstGeneration);
  assert.equal(
    (await ingestGitHubSnapshot(store, github, token, start)).state,
    "receiving",
  );
  const accepted = await ingestGitHubSnapshot(store, github, token, issue);
  assert.equal(accepted.state, "authorized");
  assert.equal(accepted.authorizationReread, true);
  assert.equal(accepted.snapshotAuthorizationMatched, true);
  assert.equal(github.issueReads, 1);
  await ingestGitHubSnapshot(store, github, token, pull);
  const complete = await ingestGitHubSnapshot(
    store,
    github,
    token,
    completion(firstGeneration, ["issue:ISSUE_7", "pull-request:PULL_8"]),
  );
  assert.equal(complete.state, "complete");
  assert.equal(complete.issues, 1);
  assert.equal(complete.pullRequests, 1);
  assert.equal(store.list("github_queue_items").length, 2);
  const task = store.read().tasks.find((entry) => entry.github?.number === 7);
  assert.equal(task.dispatch.state, "authorized");
  assert.equal(
    task.approvedSource.hash,
    digest(github.actualIssue.body),
    "authorization must use the GitHub re-read, not the submitted body",
  );
  const replay = await ingestGitHubSnapshot(store, github, token, issue);
  assert.equal(replay.replayed, true);
  assert.equal(github.issueReads, 1);

  const secondGeneration = generation("2026-11-10T13:05:00+00:00");
  await ingestGitHubSnapshot(
    store,
    github,
    token,
    message("repository-start", secondGeneration),
  );
  await ingestGitHubSnapshot(store, github, token, issueItem(secondGeneration));
  const incomplete = completion(secondGeneration, []);
  await assert.rejects(
    ingestGitHubSnapshot(store, github, token, incomplete),
    /incomplete/,
  );
  assert.equal(
    store.list("github_queue_items").some((entry) => entry.nodeId === "PULL_8"),
    true,
    "an incomplete generation must not remove cached items",
  );
  const completed = await ingestGitHubSnapshot(
    store,
    github,
    token,
    completion(secondGeneration, ["issue:ISSUE_7"]),
  );
  assert.equal(completed.removed, 1);
  const retained = store
    .list("github_queue_items")
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  assert.deepEqual(
    retained.map((entry) => entry.nodeId),
    ["ISSUE_7", "PULL_8"],
  );
  assert.equal(
    retained.find((entry) => entry.nodeId === "PULL_8").processed,
    true,
  );
});

test("HTTP intake endpoint accepts only protocol v2 repository snapshots", async (t) => {
  const { root, store } = fixture(t),
    github = new FakeGitHub();
  configure(store);
  const server = startServer({
    dbPath: store.filename,
    port: 0,
    projectionRoot: root,
    github,
    githubPollMs: 0,
  });
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`,
    minted = await server.workspace.ops.execute(
      "github.intake.capability.create",
      { repository: "example/private" },
    ),
    start = message(
      "repository-start",
      generation("2026-11-10T14:00:00+00:00"),
    ),
    post = (body, headers = {}) =>
      fetch(base + "/api/github-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
  assert.equal((await post(start)).status, 400);
  assert.equal(
    (
      await post(start, {
        "X-Avoozl-Intake-Version": "2",
      })
    ).status,
    403,
  );
  const accepted = await post(start, {
    "X-Avoozl-Intake-Version": "2",
    Authorization: `Bearer ${minted.token}`,
  });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).state, "receiving");
  const operationInjection = await post(
    { operation: "plan.approve", input: {} },
    {
      "X-Avoozl-Intake-Version": "2",
      Authorization: `Bearer ${minted.token}`,
    },
  );
  assert.equal(operationInjection.status, 400);
});
