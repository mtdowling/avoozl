// Pull request portions from a target repository or a fork (task 42.1).
// GitHub is a fake.
import { parseLanding } from "../landing-trailers.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { digest } from "../../../model.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { landNext, landingQueue, enqueueLanding } from "../landing-queue.mjs";
import { approveMerge, pullSteps, releaseDraft } from "../landing-pulls.mjs";
import { landingSettings, validateLandingConfig } from "../landing-config.mjs";
import { sourceRegistry } from "../../landing/push-head.mjs";

const Q = { repositoryId: "fixture", base: "main" };
const DEF = digest("definition t1");
const COMMIT = "a".repeat(40);
const BASE = "b".repeat(40);
// A fake GitHub with one pull request from the fork `me/app` to `acme/app`.
// `released`: a person marked the draft ready for review at once.
function fakeGithub({
  released = false,
  pull = {},
  runs = [{ name: "build", status: "completed", conclusion: "success" }],
  reviews = [],
  approvals = 1,
  lastPush = false,
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
      // GitHub opens it as the request says: a draft when asked.
      pr.draft = Boolean(input.draft) && !released;
      return pr;
    },
    markPullRequestReadyForReview: async (id) => {
      calls.ready = [...(calls.ready ?? []), id];
      pr.draft = false;
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
        parameters: {
          required_approving_review_count: approvals,
          require_last_push_approval: lastPush,
        },
      },
    ],
    branchProtection: async () => null,
    branch: async () => ({ protection: { enabled: false } }),
    checkRuns: async () => runs,
    commitStatus: async () => ({ statuses: [] }),
    createCommitStatus: async (repo, sha, input) => {
      calls.statuses = [...(calls.statuses ?? []), { repo, sha, ...input }];
    },
    pullRequestReviews: async () => reviews,
    mergePullRequest: async (repo, number, { sha, title, message }) => {
      calls.merged.push({ number, sha });
      calls.messages = [...(calls.messages ?? []), { title, message }];
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
  const { store } = fixture(t);
  enqueueLanding(store, {
    ...Q,
    key: "s.t1",
    commit: COMMIT,
    spec: "s",
    tasks: [
      { task: "t1", definition: DEF, metrics: { tries: "2", model: "m-1" } },
    ],
    source: { repository: "me/app", branch: "avoozl/s/work" },
  });
  return { store, steps: steps(github, extra) };
}

const steps = (github, extra = {}) =>
  pullSteps({
    github,
    registry: sourceRegistry({
      "acme/app": { url: "https://example.invalid/acme/app.git" },
      "me/app": {
        url: "https://example.invalid/me/app.git",
        parent: "acme/app",
      },
    }),
    root: "/nonexistent",
    target: "acme/app",
    base: "main",
    login: "ci-bot",
    // These tests merge; the landing.pr tests below pass their own.
    pr: "auto",
    ...extra,
  });

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
  // Avoozl writes the squash commit's message: the direct landing's
  // trailers, so the commit on main carries the task and its metrics.
  const [squash] = github.calls.messages;
  assert.match(squash.title, /\(#7\)$/);
  assert.deepEqual(parseLanding(squash.message), [
    { task: "t1", definition: DEF, tries: 2, model: "m-1" },
  ]);
  assert.equal(result.entry.pr, 7);
  assert.deepEqual(result.entry.approvers, ["r1"]);
  assert.equal(result.entry.mergedBy, "ci-bot");
  assert.deepEqual(
    github.calls.statuses.map((s) => [s.repo, s.sha, s.context, s.state]),
    [["acme/app", COMMIT, "avoozl/verify", "success"]],
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

  const stale = fakeGithub({
      reviews: [{ ...approval("r1", "d".repeat(40)), state: "DISMISSED" }],
    }),
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

// P67: after a base merge into the pull request, GitHub kept the approval
// on the older head; Avoozl must not wait for a review GitHub does not need.
test("an approval GitHub still shows on an older head counts, unless the last push must be approved", async (t) => {
  const older = "d".repeat(40),
    kept = fakeGithub({ reviews: [approval("r1", older)] }),
    x = await setup(t, kept),
    result = await landNext(x.store, Q, x.steps);
  assert.equal(result.state, "landed");
  assert.deepEqual(result.entry.approvers, ["r1"]);
  assert.deepEqual(kept.calls.merged, [{ number: 7, sha: COMMIT }]);

  const strict = fakeGithub({
      reviews: [approval("r1", older)],
      lastPush: true,
    }),
    y = await setup(t, strict);
  assert.equal((await landNext(y.store, Q, y.steps)).state, "waiting");
  assert.equal(strict.calls.merged.length, 0);
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

test("a later tick with fresh steps records the maintainer's merge", async (t) => {
  const github = fakeGithub({
      reviews: [approval("r1")],
      roles: { "acme/app": "read", "me/app": "write" },
    }),
    x = await setup(t, github);
  assert.equal((await landNext(x.store, Q, x.steps)).state, "not-landed");
  Object.assign(github.pr, {
    merged_at: "2026-11-17T01:00:00Z",
    merged_by: { login: "maintainer" },
    merge_commit_sha: "c".repeat(40),
  });
  // The queue of the first setup; only the steps are new.
  assert.equal((await landNext(x.store, Q, steps(github))).state, "landed");
  assert.equal(landingQueue(x.store, Q).length, 0);
});

test("a fork in the target's own organization names its head repository", async (t) => {
  const github = fakeGithub({ reviews: [approval("r1")] }),
    upstreamCopy = {
      number: 3,
      state: "open",
      head: { sha: "f".repeat(40), repo: { full_name: "acme/app" } },
    };
  // The same owner and branch name in the target itself is not the fork's.
  github.listPullRequests = async () =>
    github.calls.created.length ? [github.pr] : [upstreamCopy];
  const x = await setup(t, github, {
    registry: sourceRegistry({
      "acme/app": { url: "https://example.invalid/acme/app.git" },
      "acme/app-fork": {
        url: "https://example.invalid/acme/app-fork.git",
        parent: "acme/app",
      },
    }),
  });
  x.store.put("landing_queue", {
    ...landingQueue(x.store, Q)[0],
    source: { repository: "acme/app-fork", branch: "avoozl/s/work" },
  });
  const result = await landNext(x.store, Q, x.steps);
  assert.equal(result.state, "landed");
  assert.equal(github.calls.created.length, 1);
  assert.equal(github.calls.created[0].input.head, "avoozl/s/work");
  assert.equal(github.calls.created[0].input.head_repo, "acme/app-fork");
});

test("a fork under another owner sends no head repository", async (t) => {
  const github = fakeGithub({ reviews: [approval("r1")] }),
    x = await setup(t, github);
  await landNext(x.store, Q, x.steps);
  assert.equal("head_repo" in github.calls.created[0].input, false);
});

test("an open pull request from a same-org fork is found by its head repository", async (t) => {
  const github = fakeGithub({ reviews: [approval("r1")] }),
    lists = [];
  github.pr.head = {
    sha: COMMIT,
    ref: "avoozl/s/work",
    repo: { full_name: "acme/app-fork" },
  };
  github.listPullRequests = async (repo, input) => {
    lists.push(input);
    return [
      {
        number: 3,
        state: "open",
        head: {
          sha: COMMIT,
          ref: "other",
          repo: { full_name: "acme/app-fork" },
        },
      },
      github.pr,
    ];
  };
  const x = await setup(t, github, {
    registry: sourceRegistry({
      "acme/app": { url: "https://example.invalid/acme/app.git" },
      "acme/app-fork": {
        url: "https://example.invalid/acme/app-fork.git",
        parent: "acme/app",
      },
    }),
  });
  x.store.put("landing_queue", {
    ...landingQueue(x.store, Q)[0],
    source: { repository: "acme/app-fork", branch: "avoozl/s/work" },
  });
  const result = await landNext(x.store, Q, x.steps);
  assert.equal(result.state, "landed");
  assert.equal(github.calls.created.length, 0);
  assert.equal(result.entry.pr, 7);
  assert.equal("head" in lists[0], false);
});

// plugin-checks pk-1.5 (D8, PK6.3, PK6.4): a required name a plugin check
// provides is read from this machine's result on the exact head, never
// from GitHub; a name nothing here runs waits with one Needs you row.
test("pk-1.5: a required plugin check waits for its local result on the exact head, and a GitHub check of its name does not count", async (t) => {
  const results = new Map(),
    github = fakeGithub({
      reviews: [approval("r1")],
      runs: [
        { name: "build", status: "completed", conclusion: "success" },
        // A GitHub check that happens to share the name.
        { name: "parity", status: "completed", conclusion: "success" },
      ],
    }),
    x = await setup(t, github, {
      checks: ["parity"],
      local: {
        names: ["parity"],
        result: (name, commit) =>
          results.get(`${name}@${commit}`) ?? { conclusion: "pending" },
      },
    });
  const waiting = await landNext(x.store, Q, x.steps);
  assert.equal(waiting.state, "waiting");
  assert.equal(github.calls.merged.length, 0);
  assert.deepEqual(
    landingQueue(x.store, Q)[0].waiting.checks.map((c) => [
      c.command,
      c.conclusion,
    ]),
    [
      ["build", "success"],
      ["parity", "pending"],
    ],
  );
  // A pass on another head does not count either.
  results.set(`parity@${"d".repeat(40)}`, { conclusion: "success" });
  assert.equal((await landNext(x.store, Q, x.steps)).state, "waiting");
  results.set(`parity@${COMMIT}`, { conclusion: "success" });
  const landed = await landNext(x.store, Q, x.steps);
  assert.equal(landed.state, "landed");
  // The pull request body names tasks only: nothing of the plugin.
  const body = github.calls.created[0].input.body;
  assert.doesNotMatch(body, /parity|bin\/|prompt/);
});

test("pk-1.5: a required name no plugin here provides and GitHub lacks waits as unprovided, with one Needs you row", async (t) => {
  const { requiredCheckNeedsYou } = await import(
    "../../plugins/check-stages.mjs"
  );
  const github = fakeGithub({ reviews: [approval("r1")] }),
    x = await setup(t, github, { checks: ["parity"] });
  assert.equal((await landNext(x.store, Q, x.steps)).state, "waiting");
  assert.deepEqual(
    landingQueue(x.store, Q)[0].waiting.checks.map((c) => [
      c.command,
      c.conclusion,
    ]),
    [
      ["build", "success"],
      ["parity", "unprovided"],
    ],
  );
  const rows = requiredCheckNeedsYou(x.store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /No machine here runs check `parity`/);
  assert.equal((await landNext(x.store, Q, x.steps)).state, "waiting");
  assert.deepEqual(
    requiredCheckNeedsYou(x.store).map((r) => r.id),
    rows.map((r) => r.id),
    "a second tick opens no second row",
  );
});

test("a pull request opens as a draft; release only marks it ready, and a person's Merge for the exact head merges it", async (t) => {
  const github = fakeGithub({ released: false, reviews: [approval("r1")] }),
    x = await setup(t, github, { pr: "draft" });
  const at = { ...Q, key: "s.t1" },
    first = await landNext(x.store, Q, x.steps);
  assert.equal(github.calls.created[0].input.draft, true);
  assert.equal(first.state, "waiting");
  assert.equal(first.entry.waiting.reason, "draft");
  assert.equal(first.entry.pr, 7);
  // Merge is refused while it is a draft: no check passed on its head.
  x.store.transaction(() =>
    x.store.put("repositories", { id: Q.repositoryId, github: "acme/app" }),
  );
  assert.throws(
    () => approveMerge(x.store, at, { commit: COMMIT, by: "dashboard" }),
    /not ready to merge/,
  );
  // Ready for review on GitHub: the next read sees it, the checks pass,
  // and it still waits for a person to merge.
  github.pr.draft = false;
  const ready = await landNext(x.store, Q, x.steps);
  assert.equal(ready.state, "waiting");
  assert.equal(ready.entry.waiting.reason, "merge");
  assert.equal((await landNext(x.store, Q, x.steps)).state, "waiting");
  assert.equal(github.calls.merged.length, 0, "Avoozl never merges alone");
  assert.throws(
    () => approveMerge(x.store, at, { commit: "f".repeat(40), by: "x" }),
    /not ready to merge/,
  );
  approveMerge(x.store, at, { commit: COMMIT, by: "dashboard" });
  const landed = await landNext(x.store, Q, x.steps);
  assert.equal(landed.state, "landed");
  assert.deepEqual(github.calls.merged, [{ number: 7, sha: COMMIT }]);
});

test("Approve in Avoozl marks the queued draft ready for review and nothing more", async (t) => {
  const github = fakeGithub({
      released: false,
      reviews: [approval("r1")],
      pull: { node_id: "PR_node7" },
    }),
    x = await setup(t, github, { pr: "draft" });
  assert.equal((await landNext(x.store, Q, x.steps)).state, "waiting");
  const at = { ...Q, key: "s.t1" };
  x.store.transaction(() =>
    x.store.put("repositories", { id: Q.repositoryId, github: "acme/app" }),
  );
  assert.deepEqual(await releaseDraft(x.store, github, at), {
    pr: 7,
    released: true,
  });
  assert.deepEqual(github.calls.ready, ["PR_node7"]);
  // Already ready: nothing more is written.
  assert.deepEqual(await releaseDraft(x.store, github, at), {
    pr: 7,
    released: false,
  });
  assert.deepEqual(github.calls.ready, ["PR_node7"]);
  // Released, it waits for a person's merge; it is never made a draft again.
  const next = await landNext(x.store, Q, x.steps);
  assert.equal(next.entry.waiting.reason, "merge");
  assert.equal(github.calls.merged.length, 0);
  assert.equal(github.pr.draft, false);
  await assert.rejects(
    () => releaseDraft(x.store, github, { ...Q, key: "nope" }),
    /not waiting to land/,
  );
});

test("a failed check on a draft still goes back to the worker", async (t) => {
  const github = fakeGithub({
      released: false,
      runs: [{ name: "build", status: "completed", conclusion: "failure" }],
    }),
    x = await setup(t, github, { pr: "draft" });
  assert.equal((await landNext(x.store, Q, x.steps)).state, "failed");
  assert.equal(github.calls.merged.length, 0);
});

test("landing.pr ready opens ready for review and waits for a person's merge; auto merges once checks pass", async (t) => {
  const ready = fakeGithub({ released: false, reviews: [approval("r1")] }),
    x = await setup(t, ready, { pr: "ready" }),
    first = await landNext(x.store, Q, x.steps);
  assert.equal(ready.calls.created[0].input.draft, false);
  assert.equal(first.state, "waiting");
  assert.equal(first.entry.waiting.reason, "merge");
  assert.equal(ready.calls.merged.length, 0);

  const auto = fakeGithub({ released: false, reviews: [approval("r1")] }),
    y = await setup(t, auto, { pr: "auto" });
  assert.equal((await landNext(y.store, Q, y.steps)).state, "landed");
  assert.equal(auto.calls.created[0].input.draft, false);
  assert.deepEqual(auto.calls.merged, [{ number: 7, sha: COMMIT }]);
});

test("landing.pr reads the repository's block, then the workspace's, then draft", () => {
  const config = (workspace, repository) => ({
    ...(workspace ? { landing: { pr: workspace } } : {}),
    github: {
      repositories: {
        "acme/app": { landing: repository ? { pr: repository } : {} },
      },
    },
  });
  assert.equal(landingSettings(config(null, null), "acme/app").pr, "draft");
  assert.equal(landingSettings(config("auto", null), "acme/app").pr, "auto");
  assert.equal(
    landingSettings(config("auto", "ready"), "acme/app").pr,
    "ready",
  );
  assert.throws(
    () => validateLandingConfig({ landing: { pr: "always" } }),
    /landing.pr must be draft, ready or auto/,
  );
});
