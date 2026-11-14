// rc-23.5: the public pull request after a forward (RC24.6, RC24.11, design
// D29.7). Fake GitHub only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { queryTasks } from "../../model.mjs";
import { Operations } from "../operations.mjs";
import { renderMarker } from "../github-marker.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { instanceView } from "../instance.mjs";
import {
  mirrorPublicPollStep,
  publicMergeReached,
} from "../mirror-forward-poll.mjs";
import { mirrorForwardRows } from "../mirror-forward.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const SOURCE = "example/code";
const MIRROR = "example/code-private";
const SHA = "a".repeat(40);
const hash = "b".repeat(64);
const mirrorPolicy = {
  source: SOURCE,
  mirror: MIRROR,
  forward: "nudge",
  branchPrefix: "avoozl/",
};
const policy = {
  mode: "single-repo",
  repositories: { [SOURCE]: { coder: "issue-radar", mirror: mirrorPolicy } },
};
const record = (extra = {}) => ({
  id: "sha1",
  repository: SOURCE,
  mirror: MIRROR,
  mirrorPr: 5,
  taskId: "a",
  approver: "dana",
  state: "public_open",
  reason: "Forwarded; waiting on the public pull request.",
  mirrorMergedAt: "2026-11-14T10:00:00.000Z",
  forwardedAt: "2026-11-14T10:05:00.000Z",
  publicPrAt: "2026-11-14T10:05:00.000Z",
  publicMergedAt: null,
  forwardBranch: "avoozl/a",
  publicPr: 40,
  ...extra,
});

function fakePublic(pull = {}) {
  const github = {
    pull: { number: 40, state: "open", merged_at: null, body: "", ...pull },
    comments: [],
    issues: [],
    issueComments: [],
    closedBy: "erin",
    pullRequest: async (repo, number) => {
      assert.equal(repo, SOURCE);
      assert.equal(number, 40);
      return github.pull;
    },
    issue: async () => ({ closed_by: { login: github.closedBy } }),
    listPullRequestReviewComments: async (repo) => {
      assert.equal(repo, SOURCE);
      return github.comments;
    },
    createIssue: async (repo, input) => {
      assert.equal(repo, MIRROR);
      github.issues.push(input);
      return { number: 90 + github.issues.length };
    },
    createIssueComment: async (repo, number, body) => {
      assert.equal(repo, MIRROR);
      github.issueComments.push({ number, body });
    },
  };
  return github;
}

test("a public merge records the merge and counts the task as done", async (t) => {
  const { store } = fixture(t),
    github = fakePublic();
  store.put("mirror_forward", record());
  await mirrorPublicPollStep(store, github, { policy });
  assert.equal(store.get("mirror_forward", "sha1").state, "public_open");
  assert.equal(
    publicMergeReached(store, { id: "a" }, { mirror: mirrorPolicy }),
    false,
  );
  github.pull = {
    ...github.pull,
    state: "closed",
    merged_at: "2026-11-14T12:00:00Z",
  };
  await mirrorPublicPollStep(store, github, { policy });
  const next = store.get("mirror_forward", "sha1");
  assert.equal(next.state, "public_merged");
  assert.equal(next.publicMergedAt, "2026-11-14T12:00:00Z");
  assert.equal(
    publicMergeReached(store, { id: "a" }, { mirror: mirrorPolicy }),
    true,
  );
  // A repository with no mirror is unchanged.
  assert.equal(publicMergeReached(store, { id: "z" }, {}), true);
});

test("a close without a merge returns the item to Waiting on you with the reason", async (t) => {
  const { store } = fixture(t),
    github = fakePublic({ state: "closed", closed_at: "2026-11-14T11:00:00Z" });
  store.put("mirror_forward", record());
  await mirrorPublicPollStep(store, github, { policy });
  await mirrorPublicPollStep(store, github, { policy });
  const next = store.get("mirror_forward", "sha1");
  assert.equal(next.state, "closed_unmerged");
  assert.match(
    next.reason,
    /closed without a merge by erin at 2026-11-14T11:00/,
  );
  const rows = mirrorForwardRows(store, policy);
  assert.equal(rows.length, 1);
  assert.match(rows[0].detail, /erin/);
  assert.equal(
    publicMergeReached(store, { id: "a" }, { mirror: mirrorPolicy }),
    false,
  );
});

test("a review comment is copied once across three ticks, then each new one once", async (t) => {
  const { store } = fixture(t),
    github = fakePublic();
  store.put("mirror_forward", record());
  github.comments = [
    { id: 1, user: { login: "erin" }, body: "Please rename this." },
  ];
  for (let i = 0; i < 3; i++)
    await mirrorPublicPollStep(store, github, { policy });
  assert.equal(github.issues.length, 1);
  assert.equal(github.issueComments.length, 0);
  assert.match(github.issues[0].body, /avoozl-review-copy 1/);
  assert.match(github.issues[0].body, /@erin/);
  assert.match(github.issues[0].body, /Please rename this/);
  github.comments.push({ id: 2, user: { login: "erin" }, body: "And this." });
  for (let i = 0; i < 2; i++)
    await mirrorPublicPollStep(store, github, { policy });
  assert.equal(github.issues.length, 1);
  assert.equal(github.issueComments.length, 1);
  assert.equal(github.issueComments[0].number, 91);
  assert.deepEqual(store.get("mirror_forward", "sha1").copiedComments, [
    "1",
    "2",
  ]);
});

test("another Avoozl's ID in a public comment is remembered, not copied as a name", async (t) => {
  const { store } = fixture(t),
    github = fakePublic();
  store.put("mirror_forward", record());
  github.comments = [
    { id: 1, user: { login: "erin" }, body: "see inst-0123456789ab" },
  ];
  await mirrorPublicPollStep(store, github, { policy });
  assert.deepEqual(instanceView(store).others, ["inst-0123456789ab"]);
});

// ---- the completion gate, through the real tick -------------------------

const NAMESPACE = "avz_0123456789abcdef";
const marker = (taskId) =>
  renderMarker({
    version: 2,
    taskId,
    namespace: NAMESPACE,
    kind: "leaf",
    source: { commit: null, manifest: hash },
    applied: { title: hash, body: hash, labels: [], blockers: [] },
  });

function gate(t) {
  const { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode: "single-repo",
        repositories: {
          [SOURCE]: {
            baseBranch: "main",
            allowedActors: ["maintainer"],
            minimumPermission: "write",
            requiredChecks: ["build"],
            mirror: mirrorPolicy,
          },
        },
      },
    }),
  );
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    checks: [],
  });
  store.put("github_repositories", {
    id: SOURCE,
    owner: "example",
    repo: "code",
    projectId: "code",
    activeMachine: machineIdentity(store).id,
  });
  store.mutate("Seed", (data) => {
    const leaf = (id, number) => ({
      id,
      title: "Task " + id,
      scope: "catalog",
      status: "planned",
      epic: "sample",
      track: "catalog",
      kind: "leaf",
      authority: "github",
      repository: "code",
      acceptance: [id + " works"],
      checks: ["build"],
      ...(number
        ? {
            github: {
              repository: SOURCE,
              number,
              nodeId: "I_" + number,
              url: `https://example.test/${SOURCE}/issues/${number}`,
            },
          }
        : {}),
    });
    data.tasks.push(leaf("a", 1), leaf("a-next", null));
    data.edges.push({
      id: "a:requires:a-next",
      from: "a",
      to: "a-next",
      kind: "requires",
    });
  });
  const issue = {
    number: 1,
    state: "closed",
    state_reason: "completed",
    closed_at: "2026-11-12T10:05:00Z",
    updated_at: "2026-11-12T10:05:00Z",
    body: marker("a") + "\nBody",
    html_url: `https://example.test/${SOURCE}/issues/1`,
  };
  const github = {
    available: () => true,
    issue: async () => structuredClone(issue),
    closingPullRequests: async () => [
      {
        number: 101,
        url: `https://example.test/${SOURCE}/pull/101`,
        merged: true,
        mergedAt: "2026-11-12T10:04:00Z",
        headRefOid: SHA,
        baseRefName: "main",
        repository: { nameWithOwner: SOURCE },
      },
    ],
    pullRequestReviews: async () => [],
    checkRuns: async () => [{ id: 1, name: "build", conclusion: "success" }],
    commitStatus: async () => ({ statuses: [] }),
    issueEvents: async () => [],
    issueTimeline: async () => [],
    permission: async () => ({ permission: "write" }),
    updateIssue: async () => structuredClone(issue),
  };
  const ops = new Operations(store, { github, workspaceRoot: root }),
    run = () => ops.execute("workspace.tick", { sessions: [] }),
    ready = () =>
      new Set(
        queryTasks(store.read(), { scope: "all", q: "ready:true" }).map(
          (item) => item.id,
        ),
      );
  return {
    store,
    run,
    ready,
    task: (id) => store.read().tasks.find((x) => x.id === id),
  };
}

test("a mirror merge alone releases no dependent; the public merge does", async (t) => {
  const { store, run, ready, task } = gate(t);
  store.put("mirror_forward", record({ state: "to_forward", publicPr: null }));
  await run();
  assert.notEqual(task("a").githubVerdict?.state, "verified");
  assert.equal(ready().has("a-next"), false);
  // Forwarded and still open: dependents still wait.
  store.put("mirror_forward", record());
  await run();
  assert.equal(ready().has("a-next"), false);
  store.put("mirror_forward", record({ state: "public_merged" }));
  await run();
  assert.equal(task("a").githubVerdict.state, "verified");
  assert.equal(ready().has("a-next"), true);
});
