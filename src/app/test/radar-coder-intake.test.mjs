// rc-1.2: a Radar-coded repository is never triaged. Avoozl lists only an
// issue an allowed person labeled to be planned (or the plan-me hand-off's
// Intake route), and Plan this starts a planner chat. No network: the fake
// GitHub records every call.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { pendingNewPlans } from "../new-plan.mjs";
import { principalAllows } from "../app-backend.mjs";
import { searchQuery } from "../untriaged.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const REPO = "example/app",
  NAMESPACE = "avz_0123456789abcdef";

const issue = (
  number,
  { labels = [], author = "owner", pull = false } = {},
) => ({
  number,
  title: `Issue ${number}`,
  body: `Body of ${number}`,
  html_url: `https://github.example/${REPO}/issues/${number}`,
  user: { login: author },
  labels: labels.map((name) => ({ name })),
  pull,
  comments: [],
});

// `events`: issue number -> who added which label.
function fakeGitHub(issues, { events = {}, permissions = {} } = {}) {
  const byNumber = new Map(issues.map((entry) => [entry.number, entry])),
    calls = { queries: [], writes: [], listIssues: 0 };
  return {
    calls,
    available: () => true,
    brokenEvents: new Set(),
    // Answers what GitHub search would: only issues with one of the
    // `label:` terms, or every open issue when the query has none.
    async graphql(_query, variables) {
      calls.queries.push(variables.q);
      const TERM = '(?:"[^"]*"|[^\\s",]+)',
        term = new RegExp(`(?:^| )label:(${TERM}(?:,${TERM})*)`).exec(
          variables.q,
        ),
        wanted = term
          ? [...term[1].matchAll(new RegExp(TERM, "g"))].map((part) =>
              part[0].replace(/^"|"$/g, ""),
            )
          : null,
        found = issues.filter(
          (entry) =>
            (variables.q.includes("is:pr") ? entry.pull : !entry.pull) &&
            (!wanted ||
              entry.labels.some((label) => wanted.includes(label.name))),
        );
      return {
        search: {
          issueCount: found.length,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: found.map((entry) => ({
            __typename: entry.pull ? "PullRequest" : "Issue",
            number: entry.number,
            title: entry.title,
            url: entry.html_url,
            createdAt: "2026-11-14T05:00:00Z",
            author: { login: entry.user.login },
            labels: { nodes: entry.labels },
            assignees: { nodes: [] },
            comments: { totalCount: 0 },
          })),
        },
      };
    },
    async issue(_repository, number) {
      return byNumber.get(number);
    },
    async listIssueComments() {
      return [];
    },
    async issueEvents(_repository, number) {
      if (this.brokenEvents.has(number)) throw Error("GitHub said no");
      return events[number] ?? [];
    },
    async permission(_repository, actor) {
      const permission = permissions[actor];
      if (!permission) throw Object.assign(Error("forbidden"), { status: 403 });
      return { permission };
    },
    async listIssues() {
      calls.listIssues += 1;
      return [];
    },
    addLabels(...args) {
      calls.writes.push(["addLabels", ...args]);
    },
    removeLabel(...args) {
      calls.writes.push(["removeLabel", ...args]);
    },
  };
}

const labeled = (login, label = "avoozl:plan") => [
  { event: "labeled", label: { name: label }, actor: { login } },
];
const PERMISSIONS = { owner: "admin", stranger: "read" };

function workspace(t, github, extra = {}) {
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
          [REPO]: {
            baseBranch: "main",
            coder: "issue-radar",
            minimumPermission: "write",
            managedLabels: { managed: "avoozl:managed", ready: "ready" },
            ...extra,
          },
        },
      },
    }),
  );
  store.put("github_repositories", {
    id: REPO,
    owner: "example",
    repo: "app",
    projectId: "code",
    activeMachine: machineIdentity(store).id,
  });
  store.put("projects", {
    id: REPO,
    name: "app",
    root: temporaryDirectory("avoozl-repo-"),
  });
  const ops = new Operations(store, { github, workspaceRoot: root });
  return {
    store,
    ops,
    async intake() {
      await ops.execute("untriaged.view", { refresh: true });
      const view = await ops.execute("untriaged.view", {}),
        needs = await ops.execute("conflicts.view", {});
      return {
        view,
        intake: view.items.map((item) => item.number).sort((a, b) => a - b),
        withRadar: view.withRadar.map((item) => item.number),
        needsYou: needs.items
          .filter((item) => item.reason === "crew")
          .map((item) => item.issue.number),
      };
    },
  };
}

test("no list call for plain open issues is made for a Radar-coded repository", async (t) => {
  const github = fakeGitHub(
    [issue(1), issue(2), issue(3, { labels: ["avoozl:plan"] })],
    { events: { 3: labeled("owner") }, permissions: PERMISSIONS },
  );
  const { intake } = workspace(t, github);
  const result = await intake();
  // Every search names labels or asks for pull requests; none asks for
  // plain open issues.
  assert.ok(github.calls.queries.length >= 1);
  for (const query of github.calls.queries)
    assert.match(query, /label:"?avoozl:plan"?|is:pr/);
  assert.equal(github.calls.listIssues, 0);
  assert.deepEqual(result.intake, [3]);
  assert.deepEqual(result.withRadar, []);
});

test("a repository with the worker coder still reads every open issue", async (t) => {
  const github = fakeGitHub([issue(1), issue(2)]);
  const { intake } = workspace(t, github, { coder: "worker" });
  assert.deepEqual((await intake()).intake, [1, 2]);
  assert.equal(github.calls.queries[0], `repo:${REPO} is:open`);
});

test("the Radar query lists the planning, needs-human and claim labels", () => {
  const repo = {
    coder: "issue-radar",
    radar: { planLabel: "plan, please" },
    crewLabels: { needsHuman: "plan me", claim: "crew: in progress" },
  };
  assert.equal(
    searchQuery("o/r", {}, Date.now(), repo),
    'repo:o/r is:open is:issue label:"plan, please","plan me","crew: in progress"',
  );
  assert.equal(
    searchQuery("o/r", {}, Date.now(), { coder: "worker" }),
    "repo:o/r is:open",
  );
});

test("a planning label from an allowed person goes to Intake; a stranger's does nothing", async (t) => {
  const github = fakeGitHub(
    [
      issue(1, { labels: ["avoozl:plan"] }),
      issue(2, { labels: ["avoozl:plan"] }),
      issue(3, { labels: ["avoozl:plan"] }),
    ],
    {
      events: {
        1: labeled("owner"),
        2: labeled("stranger"),
        // Someone unknown to GitHub's permission read (403): not allowed.
        3: labeled("ghost"),
      },
      permissions: PERMISSIONS,
    },
  );
  const result = await workspace(t, github).intake();
  assert.deepEqual(
    [result.intake, result.withRadar, result.needsYou],
    [[1], [], []],
  );
});

test("the last labeler counts, and an unreadable history plans nothing", async (t) => {
  const github = fakeGitHub(
    [
      issue(1, { labels: ["avoozl:plan"] }),
      issue(2, { labels: ["avoozl:plan"] }),
    ],
    {
      events: {
        1: [...labeled("owner"), ...labeled("stranger")],
        2: labeled("owner"),
      },
      permissions: PERMISSIONS,
    },
  );
  github.brokenEvents.add(2);
  assert.deepEqual((await workspace(t, github).intake()).intake, []);
});

test("allowedActors admits a named person without a permission read", async (t) => {
  const github = fakeGitHub([issue(1, { labels: ["avoozl:plan"] })], {
    events: { 1: labeled("friend") },
    permissions: PERMISSIONS,
  });
  const { intake } = workspace(t, github, {
    allowedActors: ["friend"],
    minimumPermission: undefined,
  });
  assert.deepEqual((await intake()).intake, [1]);
});

test("the planning label name is the repository's own", async (t) => {
  const github = fakeGitHub(
    [issue(1, { labels: ["plan-it"] }), issue(2, { labels: ["avoozl:plan"] })],
    {
      events: { 1: labeled("owner", "plan-it"), 2: labeled("owner") },
      permissions: PERMISSIONS,
    },
  );
  const { intake } = workspace(t, github, { radar: { planLabel: "plan-it" } });
  assert.deepEqual((await intake()).intake, [1]);
});

test("pull requests are still read for Code review, but never planned", async (t) => {
  const github = fakeGitHub(
    [
      issue(1),
      issue(2, { pull: true }),
      issue(3, { labels: ["avoozl:plan"], pull: true }),
    ],
    { events: { 3: labeled("owner") }, permissions: PERMISSIONS },
  );
  const { view, intake } = await workspace(t, github).intake();
  assert.deepEqual(intake, [2, 3]);
  assert.ok(view.items.every((item) => item.kind === "pr" && !item.start));
});

test("a crew's claim keeps the issue under With Issue Radar, not Intake", async (t) => {
  const github = fakeGitHub(
    [issue(1, { labels: ["avoozl:plan", "crew: in progress"] })],
    { events: { 1: labeled("owner") }, permissions: PERMISSIONS },
  );
  const result = await workspace(t, github).intake();
  assert.deepEqual([result.intake, result.withRadar], [[], [1]]);
});

test("the plan-me hand-off still routes by scope (PR 67)", async (t) => {
  // A needs-human issue by an allowed author with no skip comment: Needs you.
  const github = fakeGitHub([issue(1, { labels: ["plan me"] })], {
    permissions: PERMISSIONS,
  });
  const result = await workspace(t, github, {
    crewLabels: { needsHuman: "plan me" },
  }).intake();
  assert.deepEqual([result.intake, result.needsYou], [[], [1]]);
});

test("Plan this starts a planner chat and records the issue as the source", async (t) => {
  const github = fakeGitHub([issue(7, { labels: ["avoozl:plan"] }), issue(8)], {
    events: { 7: labeled("owner") },
    permissions: PERMISSIONS,
  });
  const { ops, store, intake } = workspace(t, github);
  await intake();
  const row = (await ops.execute("untriaged.view", {})).items.find(
    (item) => item.number === 7,
  );
  assert.deepEqual(row.start, { plan: true, deliver: false });
  const result = await ops.execute("untriaged.plan", {
    repository: REPO,
    number: 7,
  });
  assert.equal(result.agent, "avoozl-planner");
  assert.match(result.name, /^issue-example-app-7$/);
  assert.match(result.message, /Body of 7/);
  assert.deepEqual(pendingNewPlans(store).at(-1).source, {
    repository: REPO,
    number: 7,
  });
  // A plain issue is not in Intake, so it cannot be planned from here.
  await assert.rejects(
    ops.execute("untriaged.plan", { repository: REPO, number: 8 }),
    /not in Intake/,
  );
  await assert.rejects(
    ops.execute("untriaged.plan", { repository: REPO, number: "7" }),
    /repository and number/,
  );
  assert.deepEqual(github.calls.writes, []);
});

test("Plan this is a person's: an agent or MCP caller is refused", async (t) => {
  const github = fakeGitHub([issue(7, { labels: ["avoozl:plan"] })], {
    events: { 7: labeled("owner") },
    permissions: PERMISSIONS,
  });
  const { ops, store, intake } = workspace(t, github);
  await intake();
  for (const context of [{ mcp: true }, { caller: { sessionKey: "x" } }])
    await assert.rejects(
      ops.execute(
        "untriaged.plan",
        { repository: REPO, number: 7 },
        undefined,
        context,
      ),
      /Only a person/,
    );
  assert.deepEqual(pendingNewPlans(store), []);
  assert.equal(
    principalAllows({ kind: "owner-session" }, "untriaged.plan"),
    true,
  );
  assert.equal(
    principalAllows({ kind: "agent-tool" }, "untriaged.plan"),
    false,
  );
});

test("Plan this refuses a repository whose coder is the worker", async (t) => {
  const github = fakeGitHub([issue(1)]);
  const { ops, intake } = workspace(t, github, { coder: "worker" });
  await intake();
  await assert.rejects(
    ops.execute("untriaged.plan", { repository: REPO, number: 1 }),
    /does not use Issue Radar/,
  );
});
