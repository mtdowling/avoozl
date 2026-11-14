// Proof 1 (rc-p1): Avoozl lists only what it was asked to plan. Run on a fake
// GitHub in an isolated temporary workspace; no real repository is read.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { pendingNewPlans } from "../new-plan.mjs";
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

test("Proof 1: only the planned issues are listed, the stranger's is left alone, plan me routes by scope", async (t) => {
  // Three plain issues, one with the planning label from an allowed person
  // (4), one with it from a stranger (5), one `plan me` issue by the owner (6).
  const github = fakeGitHub(
    [
      issue(1),
      issue(2),
      issue(3),
      issue(4, { labels: ["avoozl:plan"] }),
      issue(5, { labels: ["avoozl:plan"] }),
      issue(6, { labels: ["plan me"] }),
    ],
    {
      events: { 4: labeled("owner"), 5: labeled("stranger") },
      permissions: PERMISSIONS,
    },
  );
  const { ops, store, intake } = workspace(t, github, {
    crewLabels: { needsHuman: "plan me" },
  });
  const result = await intake();
  // Untriaged read: only #4 is in Intake; the plain ones never; #5 nowhere.
  assert.deepEqual(result.intake, [4]);
  // The plan me issue sits under With Issue Radar, not Intake.
  assert.deepEqual(result.withRadar, [6]);
  // Hand-off read: the plan me issue routes to Needs you, once.
  assert.deepEqual(result.needsYou, [6]);
  // No call asked for plain open issues, and nothing was written.
  assert.equal(github.calls.listIssues, 0);
  for (const query of github.calls.queries)
    assert.match(query, /label:("[^"]*"|\S)|is:pr/);
  // Plan this starts a planner chat for the planned issue only.
  const started = await ops.execute("untriaged.plan", {
    repository: REPO,
    number: 4,
  });
  assert.equal(started.agent, "avoozl-planner");
  assert.deepEqual(pendingNewPlans(store).at(-1).source, {
    repository: REPO,
    number: 4,
  });
  for (const number of [1, 5, 6])
    await assert.rejects(
      ops.execute("untriaged.plan", { repository: REPO, number }),
      /not in Intake/,
    );
  assert.deepEqual(github.calls.writes, []);
});
