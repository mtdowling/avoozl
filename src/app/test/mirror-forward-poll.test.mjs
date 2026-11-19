// rc-23.5: the public pull request after a forward (RC24.6, RC24.11, design
// D29.7). Fake GitHub only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { instanceView } from "../instance.mjs";
import { mirrorPublicPollStep } from "../mirror-forward-poll.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { throughClient } from "./crew-label-client.mjs";

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

test("a review comment is copied once across three ticks, then each new one once", async (t) => {
  const { store } = fixture(t),
    github = fakePublic(),
    { requests } = throughClient(github);
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
  // Each create's own request carries crew:avoozl (R103.2).
  assert.deepEqual(
    requests.map((request) => request.labels.includes("crew:avoozl")),
    [true],
  );
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
