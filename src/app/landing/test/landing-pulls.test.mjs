// Pull request portions from a target repository or a fork (task 42.1).
// GitHub is a fake; the journal is in memory.
import { parseLanding } from "../landing-trailers.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { digest } from "../../../model.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { replayJournal } from "../../specs/spec-journal.mjs";
import { driverState, takeOver } from "../../workers/driver-generations.mjs";
import { landNext, landingQueue, enqueueLanding } from "../landing-queue.mjs";
import { pullSteps } from "../landing-pulls.mjs";
import { sourceRegistry } from "../../workers/working-heads.mjs";

const Q = { repositoryId: "fixture", base: "main" };
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
    tasks: [
      { task: "t1", definition: DEF, metrics: { tries: "2", model: "m-1" } },
    ],
    source: { repository: "me/app", branch: "avoozl/s/work" },
  });
  const intentOf = () => ({
    journal,
    options,
    input: { driver, owner, login: "owner", revision: REVISION },
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
    ...(extra.intent === undefined && "intent" in extra
      ? { intent: intentOf }
      : {}),
  });
  const state = async () =>
    driverState(
      await replayJournal(journal.entries, {
        permission: journal.permission,
        visibility: "private",
      }),
    );
  return { store, steps, state, intentOf };
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

test("a later tick with fresh steps records the maintainer's merge with its checks", async (t) => {
  const github = fakeGithub({
      reviews: [approval("r1")],
      roles: { "acme/app": "read", "me/app": "write" },
    }),
    x = await setup(t, github, {
      // As pr-landing builds it: the intent carries no checks of its own.
      intent: undefined,
    });
  assert.equal((await landNext(x.store, Q, x.steps)).state, "not-landed");
  Object.assign(github.pr, {
    merged_at: "2026-11-17T01:00:00Z",
    merged_by: { login: "maintainer" },
    merge_commit_sha: "c".repeat(40),
  });
  // The queue and journal of the first setup; only the steps are new.
  const steps = pullSteps({
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
    intent: x.intentOf,
  });
  const seen = await landNext(x.store, Q, steps);
  assert.equal(seen.state, "landed");
  const [outcome] = (await x.state()).outcomes;
  assert.deepEqual(outcome.evidence?.checks ?? outcome.checks, [
    { name: "build", conclusion: "success" },
  ]);
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
