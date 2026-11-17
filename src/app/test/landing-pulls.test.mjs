// Pull request portions from a target repository or a fork (task 42.1).
// GitHub is a fake; the journal is in memory.
import test from "node:test";
import assert from "node:assert/strict";
import { digest } from "../../model.mjs";
import { fixture } from "./fixtures.mjs";
import { replayJournal } from "../spec-journal.mjs";
import { driverState, takeOver } from "../driver-generations.mjs";
import { landNext, landingQueue, enqueueLanding } from "../landing-queue.mjs";
import { pullSteps } from "../landing-pulls.mjs";
import { sourceRegistry } from "../working-heads.mjs";

const Q = { projectId: "fixture", base: "main" };
const owner = { login: "owner", from: "spec" };
const person = { kind: "person", login: "owner" };
const REVISION = digest("revision");
const DEF = digest("definition t1");
const COMMIT = "a".repeat(40);
const BASE = "b".repeat(40);
const options = {
  visibility: "private",
  machine: { hostname: "made-up-host", username: "madeupuser" },
  configFile: "/nonexistent/machine.json",
};

function memory() {
  const entries = [];
  return {
    entries,
    list: async () => structuredClone(entries),
    create: async (body) => {
      entries.push({ id: 1000 + entries.length * 7, body, author: "owner" });
      return { id: 1000 + (entries.length - 1) * 7 };
    },
    permission: async (login) => (login === "owner" ? "admin" : "none"),
  };
}

// A fake GitHub with one pull request from the fork `me/app` to `acme/app`.
function fakeGithub({
  pull = {},
  runs = [{ name: "build", status: "completed", conclusion: "success" }],
  reviews = [],
  approvals = 1,
  roles = { "acme/app": "write", "me/app": "write" },
} = {}) {
  const calls = { created: [], merged: [] };
  const pr = {
    number: 7,
    state: "open",
    head: { sha: COMMIT },
    base: { sha: BASE },
    mergeable: true,
    html_url: "https://example.invalid/pull/7",
    ...pull,
  };
  const github = {
    calls,
    pr,
    branchHead: async () => ({ oid: BASE }),
    listPullRequests: async () =>
      calls.created.length || pull.exists ? [pr] : [],
    pullRequest: async () => pr,
    createPullRequest: async (repo, input) => {
      calls.created.push({ repo, input });
      return pr;
    },
    repository: async () => ({ fork: true, parent: { full_name: "acme/app" } }),
    permission: async (repo, login) => ({
      permission: login === "r1" ? "write" : (roles[repo] ?? "none"),
    }),
    branchRules: async () => [
      {
        type: "required_status_checks",
        parameters: { required_status_checks: [{ context: "build" }] },
      },
      {
        type: "pull_request",
        parameters: { required_approving_review_count: approvals },
      },
    ],
    branchProtection: async () => null,
    branch: async () => ({ protection: { enabled: false } }),
    checkRuns: async () => runs,
    commitStatus: async () => ({ statuses: [] }),
    pullRequestReviews: async () => reviews,
    mergePullRequest: async (repo, number, { sha }) => {
      calls.merged.push({ number, sha });
      Object.assign(pr, {
        merged_at: "2026-11-17T00:00:00Z",
        merged_by: { login: "ci-bot" },
      });
      return { merged: true };
    },
  };
  return github;
}

async function setup(t, github, extra = {}) {
  const { store } = fixture(t),
    journal = memory(),
    { driver } = await takeOver(
      journal,
      { by: person, owner, spec: "s" },
      options,
    );
  const registry = sourceRegistry({
    "acme/app": { url: "https://example.invalid/acme/app.git" },
    "me/app": { url: "https://example.invalid/me/app.git", parent: "acme/app" },
  });
  enqueueLanding(store, {
    ...Q,
    key: "s.t1",
    commit: COMMIT,
    spec: "s",
    driver,
    tasks: [{ task: "t1", definition: DEF }],
    source: { repository: "me/app", branch: "avoozl/s/work" },
  });
  const steps = pullSteps({
    github,
    registry,
    root: "/nonexistent",
    target: "acme/app",
    base: "main",
    login: "ci-bot",
    intent: () => ({
      journal,
      options,
      input: {
        driver,
        owner,
        login: "owner",
        revision: REVISION,
        checks: [{ name: "build", conclusion: "success" }],
      },
    }),
    ...extra,
  });
  const state = async () =>
    driverState(
      await replayJournal(journal.entries, {
        permission: journal.permission,
        visibility: "private",
      }),
    );
  return { store, steps, state };
}

const approval = (login, commit = COMMIT) => ({
  id: 1,
  user: { login },
  state: "APPROVED",
  commit_id: commit,
  submitted_at: "2026-11-17T00:00:00Z",
});

test("a fork head opens a pull request, passes checks and review, and merges guarded by its head", async (t) => {
  const github = fakeGithub({ reviews: [approval("r1")] }),
    x = await setup(t, github),
    result = await landNext(x.store, Q, x.steps);
  assert.equal(result.state, "landed");
  assert.deepEqual(github.calls.created[0].input.head, "me:avoozl/s/work");
  assert.equal(github.calls.created[0].input.base, "main");
  assert.deepEqual(github.calls.merged, [{ number: 7, sha: COMMIT }]);
  assert.equal(result.entry.pr, 7);
  assert.deepEqual(result.entry.approvers, ["r1"]);
  assert.equal(result.entry.mergedBy, "ci-bot");
  const st = await x.state();
  assert.deepEqual(
    st.outcomes.map((o) => [o.task, o.kind, o.commit]),
    [["t1", "landed", COMMIT]],
  );
});

test("without merge rights Avoozl waits, then records the maintainer's merge", async (t) => {
  const github = fakeGithub({
      reviews: [approval("r1")],
      roles: { "acme/app": "read", "me/app": "write" },
    }),
    x = await setup(t, github),
    first = await landNext(x.store, Q, x.steps);
  assert.equal(first.state, "not-landed");
  assert.equal(github.calls.merged.length, 0);
  assert.equal(landingQueue(x.store, Q).length, 1);
  Object.assign(github.pr, {
    merged_at: "2026-11-17T01:00:00Z",
    merged_by: { login: "maintainer" },
    merge_commit_sha: "c".repeat(40),
  });
  const second = await landNext(x.store, Q, x.steps);
  assert.equal(second.state, "landed");
  assert.equal(second.observed, true);
  assert.equal(second.entry.mergedBy, "maintainer");
  assert.equal(landingQueue(x.store, Q).length, 0);
  assert.equal((await x.state()).outcomes.length, 1);
});

test("pending checks and missing approvals keep the portion queued; a failed check fails it", async (t) => {
  const pending = await setup(
    t,
    fakeGithub({
      reviews: [approval("r1")],
      runs: [{ name: "build", status: "in_progress" }],
    }),
  );
  assert.equal(
    (await landNext(pending.store, Q, pending.steps)).state,
    "waiting",
  );
  assert.equal(landingQueue(pending.store, Q).length, 1);

  const stale = fakeGithub({ reviews: [approval("r1", "d".repeat(40))] }),
    unreviewed = await setup(t, stale);
  assert.equal(
    (await landNext(unreviewed.store, Q, unreviewed.steps)).state,
    "waiting",
  );
  assert.equal(stale.calls.merged.length, 0);

  const bad = await setup(
    t,
    fakeGithub({
      reviews: [approval("r1")],
      runs: [{ name: "build", status: "completed", conclusion: "failure" }],
    }),
  );
  assert.equal((await landNext(bad.store, Q, bad.steps)).state, "failed");
});

test("a pull request at another head is not updated without source write rights", async (t) => {
  const github = fakeGithub({
      pull: { exists: true, head: { sha: "e".repeat(40) } },
      roles: { "acme/app": "write", "me/app": "read" },
    }),
    x = await setup(t, github);
  await assert.rejects(
    () => landNext(x.store, Q, x.steps),
    /cannot write me\/app/,
  );
  assert.equal(github.calls.merged.length, 0);
});

test("a repository with no required check is refused", async (t) => {
  const github = fakeGithub({ reviews: [approval("r1")] });
  github.branchRules = async () => [];
  const x = await setup(t, github);
  assert.equal((await landNext(x.store, Q, x.steps)).state, "failed");
});
