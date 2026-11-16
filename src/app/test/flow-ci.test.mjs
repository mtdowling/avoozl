// Phase 54: retrospectives catch steady CI waste (Requirement 100, §4.30).
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  CI_METRIC,
  ciStep,
  classGlobs,
  fileClasses,
  repeatRuns,
} from "../flow-ci.mjs";
import { flowPolicy, flowSection } from "../flow.mjs";
import {
  decideProposal,
  proposalProblem,
  recordRetroReply,
  retroBrief,
  retroStep,
} from "../flow-retro.mjs";
import { GitHubClient } from "../github.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const REPO = "example/code";
const POLICY = { mode: "single-repo", repositories: { [REPO]: {} } };
const NOW = Date.parse("2026-11-15T12:00:00Z");
const sha = (n) => String(n).padStart(40, "0");
const iso = (minutesAgo) => new Date(NOW - minutesAgo * 60_000).toISOString();

function setup(t) {
  const root = temporaryDirectory("avoozl-ci-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  return store;
}

// An open pull request as the widened GraphQL read returns it.
function pull(
  number,
  paths,
  { checks = [], createdAt, author = "someone" } = {},
) {
  return {
    number,
    createdAt: createdAt ?? iso(600),
    author: { login: author },
    headRefName: `branch-${number}`,
    headRefOid: sha(number),
    closingIssuesReferences: { nodes: [] },
    files: { totalCount: paths.length, nodes: paths.map((p) => ({ path: p })) },
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              state: "SUCCESS",
              contexts: { nodes: checks },
            },
          },
        },
      ],
    },
  };
}

const check = (runId, start, end) => ({
  name: "test",
  startedAt: iso(start),
  completedAt: iso(end),
  checkSuite: {
    workflowRun: {
      databaseId: runId,
      event: "pull_request",
      file: { path: ".github/workflows/test.yml" },
    },
  },
});

const run = (id, head, start, end, extra = {}) => ({
  id,
  workflow: ".github/workflows/test.yml",
  headSha: head,
  event: "pull_request",
  attempt: 1,
  status: "completed",
  startedAt: iso(start),
  endedAt: iso(end),
  pullRequests: [],
  ...extra,
});

// A fake client: the same two reads the real one has, counted.
function fakeGitHub(state) {
  const calls = [];
  return {
    calls,
    async openPullRequests(repository) {
      calls.push(["openPullRequests", repository]);
      return state.pulls;
    },
    async workflowRuns(repository, since) {
      calls.push(["workflowRuns", repository, since]);
      return state.runs;
    },
  };
}

// Two checks: open pull requests with their runs, then none open, so each
// pull request is closed with its CI recorded.
async function openThenClose(store, pulls, runs, { config = {} } = {}) {
  const state = { pulls, runs },
    github = fakeGitHub(state);
  await ciStep(store, github, { policy: POLICY, config, now: NOW - 60_000 });
  state.pulls = [];
  await ciStep(store, github, { policy: POLICY, config, now: NOW });
  return github;
}

test("54.1 paths take the first class in order, with overrides and partial lists", () => {
  const globs = classGlobs();
  assert.deepEqual(fileClasses([".kiro/specs/avoozl/tasks.md"], globs), [
    "spec",
  ]);
  // .github/ is ci before docs, even for a Markdown file in it.
  assert.deepEqual(fileClasses([".github/README.md"], globs), ["ci"]);
  assert.deepEqual(
    fileClasses(
      ["src/app/flow.mjs", "src/app/test/flow.test.mjs", "README.md"],
      globs,
    ),
    ["code", "tests", "docs"],
  );
  assert.deepEqual(fileClasses(["package-lock.json"], globs), ["other"]);
  assert.deepEqual(fileClasses(["unknown.bin"], globs), ["code"]);
  // A partial file list is code too.
  assert.deepEqual(fileClasses(["docs/a.md"], globs, true), ["code", "docs"]);
  // flow.ci.classes replaces one class's list; the repository's wins.
  const policy = flowPolicy({
    flow: { ci: { classes: { docs: ["guide/"] } } },
    projects: { app: { flow: { ci: { classes: { docs: ["manual/"] } } } } },
  });
  assert.deepEqual(
    fileClasses(["guide/x.md"], classGlobs(policy.workspace.ci.classes)),
    ["docs"],
  );
  assert.deepEqual(
    fileClasses(["guide/x.md"], classGlobs(policy.for("app").ci.classes)),
    ["code"],
  );
  assert.throws(
    () => flowSection({ ci: { classes: { code: ["x"] } } }),
    /flow\.ci\.classes must be keyed by/,
  );
  assert.throws(
    () => flowSection({ ci: { waitShare: 2 } }),
    /flow\.ci\.waitShare must be a number 0\.05–1/,
  );
  assert.equal(flowPolicy({}).workspace.ci.waitShare, 0.4);
});

test("54.1 rows label task and other pull requests from the shared read", async (t) => {
  const store = setup(t);
  store.put("github_linked_branches", {
    id: "t1",
    taskId: "t1",
    repository: REPO,
    name: "branch-1",
  });
  await openThenClose(
    store,
    [pull(1, ["src/a.mjs"]), pull(2, ["docs/a.md"], { author: "pat" })],
    [],
  );
  const rows = store.list("pr_ci").sort((a, b) => a.number - b.number);
  assert.equal(rows[0].taskId, "t1");
  assert.equal(rows[1].taskId, null);
  assert.equal(rows[1].author, "pat");
  assert.deepEqual(rows[1].classes, ["docs"]);
  assert.ok(rows.every((row) => row.closedAt === new Date(NOW).toISOString()));
});

test("54.1 no GitHub repository means no read", async (t) => {
  const store = setup(t),
    github = fakeGitHub({ pulls: [], runs: [] });
  await ciStep(store, github, { policy: { mode: null, repositories: {} } });
  await ciStep(store, github, { policy: null });
  assert.deepEqual(github.calls, []);
});

test("54.2 two runs of one workflow on one commit are a repeat run; a re-run attempt is not", () => {
  const rows = (list) =>
    list.map((r) => ({
      repository: REPO,
      runId: r.id,
      workflow: r.workflow,
      headSha: r.headSha,
      event: r.event,
      attempt: r.attempt,
      startedAt: r.startedAt,
      jobMs: 10 * 60_000,
    }));
  const twice = repeatRuns(
    rows([
      run(1, "a", 60, 50, { event: "push" }),
      run(2, "a", 59, 49, { event: "pull_request" }),
    ]),
  );
  assert.equal(twice.length, 1);
  assert.deepEqual(twice[0].events, ["push", "pull_request"]);
  assert.equal(twice[0].runs, 2);
  assert.equal(twice[0].extraMinutes, 10);
  // Attempt 2 of run 1 is the same run id: one run.
  assert.deepEqual(
    repeatRuns(
      rows([run(1, "a", 60, 50), run(1, "a", 40, 30, { attempt: 2 })]),
    ),
    [],
  );
});

test("54.2 one cached runs read per repository per check; a 304 reuses the cache", async (t) => {
  const dir = temporaryDirectory("avoozl-ci-http-"),
    store = new Store(path.join(dir, "workspace.sqlite")),
    seen = [],
    etag = '"v1"';
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  let clock = NOW;
  const fetch = async (url, options) => {
    seen.push({ url: String(url), headers: options.headers });
    if (new URL(url).pathname === "/graphql")
      return new Response(
        JSON.stringify({
          data: {
            repository: {
              pullRequests: {
                pageInfo: { hasNextPage: false },
                nodes: [pull(1, [".kiro/specs/x/tasks.md"])],
              },
            },
          },
        }),
        { status: 200 },
      );
    if (options.headers["If-None-Match"] === etag)
      return new Response(null, { status: 304, headers: { etag } });
    return new Response(
      JSON.stringify({
        workflow_runs: [
          {
            id: 5,
            path: ".github/workflows/test.yml",
            head_sha: sha(1),
            event: "pull_request",
            run_attempt: 1,
            status: "completed",
            run_started_at: iso(30),
            updated_at: iso(5),
            pull_requests: [{ number: 1 }],
          },
        ],
      }),
      { status: 200, headers: { etag } },
    );
  };
  const github = new GitHubClient({
    token: "x",
    apiUrl: "https://api.example.test",
    fetch,
  }).bind(store, {
    now: () => clock,
    cacheSeconds: () => 60,
    countFile: path.join(dir, "gh-calls.jsonl"),
  });
  // Another step read the open pull requests this check already.
  await github.openPullRequests(REPO);
  const before = seen.length;
  await ciStep(store, github, { policy: POLICY, now: clock });
  const made = seen.slice(before);
  // The CI step added one call, the runs read, and no GraphQL call.
  assert.equal(made.length, 1);
  assert.match(made[0].url, /\/repos\/example\/code\/actions\/runs\?/);
  assert.match(made[0].url, /per_page=100/);
  assert.match(decodeURIComponent(made[0].url), /created=>=2026-11-/);
  // The next check sends the ETag; the 304 reuses the stored list.
  clock += 5 * 60_000;
  const next = seen.length;
  await ciStep(store, github, { policy: POLICY, now: clock });
  const runsCall = seen.slice(next).filter((c) => c.url.includes("/actions/"));
  assert.equal(runsCall.length, 1);
  assert.equal(runsCall[0].headers["If-None-Match"], etag);
  const rows = store.list("ci_runs");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prNumber, 1);
  assert.equal(rows[0].jobMs, 25 * 60_000);
  assert.equal(rows[0].estimate, true);
});

test("54.3 ten spec-only pull requests with 25 CI minutes fire docs-only waste once", async (t) => {
  const store = setup(t),
    pulls = [],
    runs = [];
  for (let i = 1; i <= 10; i += 1) {
    const head = sha(i);
    pulls.push(
      pull(i, [".kiro/specs/avoozl/tasks.md"], {
        checks: [check(100 + i, 300 - i * 10, 275 - i * 10)],
      }),
    );
    runs.push(run(100 + i, head, 300 - i * 10, 275 - i * 10));
  }
  await openThenClose(store, pulls, runs);
  const first = retroStep(store, {}, { now: NOW, ciRepositories: [REPO] }),
    [retro] = store.list("flow_retros");
  assert.equal(first.retro, "retro-1");
  const kinds = retro.triggers.map((x) => x.kind);
  assert.deepEqual(
    kinds.filter((k) => k === "waste-docs"),
    ["waste-docs"],
  );
  assert.match(retro.triggers[0].detail, /250 CI min on spec- or docs-only/);
  // Once per repository, kind and window.
  recordRetroReply(
    store,
    "retro-1",
    '{"bottleneck":{"stage":"ci-wait","evidence":"x"}}',
  );
  const again = retroStep(
    store,
    {},
    {
      now: NOW + 60_000,
      ciRepositories: [REPO],
    },
  );
  assert.equal(again.retro, null);
});

test("54.3 a varied but steady repository fires nothing", async (t) => {
  const store = setup(t),
    pulls = [],
    runs = [];
  // Code pull requests, 8 to 30 CI minutes each, open for hours: CI wait is
  // well under 40% of lead time, and each commit ran once.
  for (let i = 1; i <= 12; i += 1) {
    const head = sha(i),
      length = 8 + ((i * 7) % 23);
    pulls.push(
      pull(i, ["src/app/flow.mjs", "src/app/test/flow.test.mjs"], {
        createdAt: iso(900 + i * 10),
        checks: [check(200 + i, 400, 400 - length)],
      }),
    );
    runs.push(run(200 + i, head, 400, 400 - length));
  }
  // One docs-only pull request after the suite was skipped for docs: 1 min.
  pulls.push(pull(50, ["docs/guide.md"], { checks: [check(250, 100, 99)] }));
  runs.push(run(250, sha(50), 100, 99));
  await openThenClose(store, pulls, runs);
  const step = retroStep(store, {}, { now: NOW, ciRepositories: [REPO] });
  assert.equal(step.retro, null);
  assert.deepEqual(store.list("flow_retros"), []);
});

test("54.3 CI wait over the share of lead time and a repeat run fire", async (t) => {
  const store = setup(t),
    pulls = [],
    runs = [];
  for (let i = 1; i <= 5; i += 1) {
    const head = sha(i);
    // Open 60 minutes ago; CI ran 40 of them, on push and pull_request.
    pulls.push(pull(i, ["src/a.mjs"], { createdAt: iso(61) }));
    runs.push(run(300 + i, head, 58, 18, { event: "push" }));
    runs.push(run(400 + i, head, 58, 18));
  }
  await openThenClose(store, pulls, runs);
  retroStep(store, {}, { now: NOW, ciRepositories: [REPO] });
  const [retro] = store.list("flow_retros"),
    kinds = retro.triggers.map((x) => x.kind).sort();
  assert.deepEqual(kinds, ["repeat", "waste-wait"]);
  const repeat = retro.triggers.find((x) => x.kind === "repeat");
  assert.match(
    repeat.detail,
    /test\.yml ran 2 times on 0000000 \(push, pull_request\)/,
  );
  assert.match(repeat.detail, /4 more commits/);
});

test("54.4 the brief holds CI facts, with other pull requests as number, author and classes", async (t) => {
  const store = setup(t),
    pulls = [],
    runs = [];
  store.put("github_linked_branches", {
    id: "t1",
    taskId: "t1",
    repository: REPO,
    name: "branch-1",
  });
  for (let i = 1; i <= 4; i += 1) {
    const head = sha(i);
    pulls.push(
      pull(i, [".kiro/specs/a/tasks.md"], {
        author: "pat",
        checks: [check(500 + i, 100, 75)],
      }),
    );
    runs.push(run(500 + i, head, 100, 75));
  }
  await openThenClose(store, pulls, runs);
  retroStep(store, {}, { now: NOW, ciRepositories: [REPO] });
  const [retro] = store.list("flow_retros"),
    text = retroBrief(store, store.read(), retro, null, {
      ciRepositories: [REPO],
      now: NOW,
    }),
    data = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)),
    [ci] = data.ci;
  assert.equal(ci.repository, REPO);
  assert.equal(ci.minutesByClass.spec.other.minutes, 75);
  assert.equal(ci.minutesByClass.spec.task.minutes, 25);
  assert.deepEqual(ci.workflows, [".github/workflows/test.yml"]);
  const other = ci.pullRequests.find((p) => p.kind === "other");
  assert.deepEqual(Object.keys(other).sort(), [
    "author",
    "classes",
    "kind",
    "number",
  ]);
  assert.deepEqual(
    ci.pullRequests.find((p) => p.kind === "task"),
    { kind: "task", task: "t1", number: 1, classes: ["spec"] },
  );
});

test("54.4 CI plan proposals: an unseen workflow is dropped; approval opens a draft; PDCA compares one class", async (t) => {
  const store = setup(t),
    pulls = [],
    runs = [];
  for (let i = 1; i <= 3; i += 1) {
    const head = sha(i);
    pulls.push(
      pull(i, [".kiro/specs/a/tasks.md"], {
        checks: [check(600 + i, 200, 175)],
      }),
    );
    runs.push(run(600 + i, head, 200, 175));
  }
  await openThenClose(store, pulls, runs);
  const base = {
    type: "plan",
    spec: "avoozl",
    change: "Skip the test matrix on spec-only changes.",
    repository: REPO,
    workflow: ".github/workflows/test.yml",
    metric: CI_METRIC,
    class: "spec",
    direction: "down",
    evidence: "75 CI min on 3 spec-only pull requests.",
  };
  assert.equal(proposalProblem(base, null, store), null);
  assert.match(
    proposalProblem(
      { ...base, workflow: ".github/workflows/other.yml" },
      null,
      store,
    ),
    /not a workflow file seen/,
  );
  assert.match(
    proposalProblem({ ...base, class: undefined }, null, store),
    /names a class/,
  );
  assert.match(
    proposalProblem(
      { ...base, class: "spec", metric: "lead time" },
      null,
      store,
    ),
    /class is only for/,
  );
  store.put("flow_retros", {
    id: "retro-1",
    n: 1,
    state: "running",
    triggers: [],
    startedAt: iso(1),
    proposals: [],
  });
  const { retro } = recordRetroReply(
    store,
    "retro-1",
    JSON.stringify({
      proposals: [base, { ...base, workflow: ".github/workflows/nope.yml" }],
    }),
  );
  assert.equal(retro.proposals.length, 1);
  assert.match(retro.dropped[0].reason, /not a workflow file seen/);
  const drafts = [];
  const approvedAt = NOW + 60_000;
  await decideProposal(
    store,
    { retroId: "retro-1", proposalId: "p1", decision: "approve" },
    {
      config: { flow: { retro: { everyTasks: 3 } } },
      draft: async (p) => {
        drafts.push(p);
        return "plan-1";
      },
      now: approvedAt,
    },
  );
  assert.equal(drafts[0].workflow, ".github/workflows/test.yml");
  let stored = store.get("flow_retros", "retro-1").proposals[0];
  assert.equal(stored.draft, "plan-1");
  assert.equal(stored.pdca.before, 25);
  // Three more spec-only pull requests after approval at 1 min each.
  const later = [],
    laterRuns = [];
  for (let i = 11; i <= 13; i += 1) {
    const head = sha(i);
    later.push(
      pull(i, [".kiro/specs/a/tasks.md"], { checks: [check(700 + i, -2, -3)] }),
    );
    laterRuns.push(run(700 + i, head, -2, -3));
  }
  const state = { pulls: later, runs: laterRuns },
    github = fakeGitHub(state);
  await ciStep(store, github, { policy: POLICY, now: NOW + 2 * 60_000 });
  state.pulls = [];
  await ciStep(store, github, { policy: POLICY, now: NOW + 4 * 60_000 });
  retroStep(store, {}, { now: NOW + 5 * 60_000, ciRepositories: [REPO] });
  stored = store.get("flow_retros", "retro-1").proposals[0];
  assert.equal(stored.pdca.after, 1);
  assert.equal(stored.pdca.result, "helped");
});

test("54.2 a failed runs read is reported once, not every check", async (t) => {
  const store = setup(t),
    github = {
      async openPullRequests() {
        return [];
      },
      async workflowRuns() {
        throw Error("Resource not accessible by integration");
      },
    };
  const first = await ciStep(store, github, { policy: POLICY, now: NOW }),
    second = await ciStep(store, github, { policy: POLICY, now: NOW });
  assert.equal(first.errors.length, 1);
  assert.deepEqual(second.errors, []);
});

test("54.5 the CI card's view data, and No pull requests read without GitHub", async (t) => {
  const { ciView } = await import("../flow-ci.mjs");
  const store = setup(t);
  assert.deepEqual(ciView(store, {}, [], { now: NOW }), {
    read: false,
    repositories: [],
  });
  store.put("github_linked_branches", {
    id: "t1",
    taskId: "t1",
    repository: REPO,
    name: "branch-1",
  });
  await openThenClose(
    store,
    [
      pull(1, ["src/a.mjs"], { checks: [check(801, 100, 80)] }),
      pull(2, [".kiro/specs/a/tasks.md"], { checks: [check(802, 100, 75)] }),
    ],
    [
      run(801, sha(1), 100, 80),
      run(802, sha(2), 100, 75),
      run(803, sha(2), 100, 75, { event: "push" }),
    ],
  );
  const [repo] = ciView(store, {}, [REPO], { now: NOW }).repositories;
  assert.equal(repo.pullRequests, 2);
  assert.deepEqual(repo.classes, [
    { name: "code", task: 20, other: 0 },
    { name: "spec", task: 0, other: 50 },
  ]);
  assert.equal(repo.docsOnlyMinutes, 50);
  assert.equal(repo.docsOnlyLimit, 60);
  assert.deepEqual(repo.repeats, [
    {
      workflow: ".github/workflows/test.yml",
      commits: 1,
      extraRuns: 1,
      extraMinutes: 25,
    },
  ]);
});
