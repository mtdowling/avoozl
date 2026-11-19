// Issue Radar escalations open first in intake (Requirement 103.8-103.11,
// design §4.32.11, task 56.14), on the issues recorded from a scratch
// repository (fixtures/radar-scratch.json). No network: a fake GitHub
// records every write, so a test can say exactly what was written.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { machineIdentity } from "../github-sync.mjs";
import { normalizeGitHubPolicy } from "../github-policy.mjs";
import { githubSourceId } from "../github-sources.mjs";
import { intakeSpecIssue } from "../radar-backlinks.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const RECORDED = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/radar-scratch.json", import.meta.url),
    "utf8",
  ),
);
const REPO = RECORDED.repository,
  NEEDS_HUMAN = "plan me",
  CLAIM = "crew: in progress",
  sourceId = githubSourceId(REPO);

// A recorded issue, with another author, extra labels or a creation time.
const recorded = (number, { author, labels = [], createdAt } = {}) => {
  const issue = structuredClone(RECORDED.issues[number]);
  if (author) issue.user = { login: author };
  for (const name of labels) issue.labels.push({ name });
  issue.state = "open";
  issue.node_id = `issue-${number}`;
  issue.createdAt = createdAt ?? "2026-11-14T05:00:00Z";
  return issue;
};

function fakeGitHub(issues) {
  const byNumber = new Map(issues.map((issue) => [issue.number, issue])),
    writes = [];
  const node = (issue) => ({
    __typename: "Issue",
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    createdAt: issue.createdAt,
    author: { login: issue.user.login },
    labels: { nodes: issue.labels },
    assignees: { nodes: [] },
    comments: { totalCount: issue.comments.length },
  });
  return {
    writes,
    available: () => true,
    async graphql(query) {
      if (!/search\(/.test(query)) return { nodes: [] };
      return {
        search: {
          issueCount: issues.length,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: issues.map(node),
        },
      };
    },
    async issue(_repository, number) {
      return structuredClone(byNumber.get(number));
    },
    async listIssueComments(_repository, number) {
      return byNumber.get(number).comments;
    },
    async issueEvents(_repository, number) {
      return RECORDED.events[String(number)] ?? [];
    },
    async permission(_repository, actor) {
      const held = RECORDED.permissions[actor];
      if (!held) throw Object.assign(Error("forbidden"), { status: 403 });
      return held;
    },
    async listIssues() {
      return [];
    },
    async currentUser() {
      return { login: "mtdowling" };
    },
    // Every write a test may see. A label write changes the issue, as
    // GitHub would.
    async addLabels(_repository, number, labels) {
      writes.push(["addLabels", number, labels]);
      for (const name of labels) byNumber.get(number).labels.push({ name });
      return [];
    },
    async removeLabel(_repository, number, label) {
      writes.push(["removeLabel", number, label]);
    },
    async createIssueComment(_repository, number, body) {
      writes.push(["createIssueComment", number, body]);
      byNumber
        .get(number)
        .comments.push({ body, user: { login: "mtdowling" } });
      return { id: 1 };
    },
    async createIssue(...args) {
      writes.push(["createIssue", ...args]);
    },
    async updateIssue(...args) {
      writes.push(["updateIssue", ...args]);
    },
  };
}

const POLICY = (extra = {}) => ({
  mode: "single-repo",
  repositories: {
    [REPO]: {
      baseBranch: "main",
      minimumPermission: "write",
      managedLabels: { managed: "avoozl:managed", ready: "ready" },
      crewLabels: { needsHuman: NEEDS_HUMAN, inProgress: CLAIM },
      rules: [],
      ...extra,
    },
  },
});

function workspace(t, github, policy = POLICY(), extra = {}) {
  const { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdef",
      github: policy,
      ...extra,
    }),
  );
  store.put("github_repositories", {
    id: REPO,
    owner: "mtdowling",
    repo: "avoozl-radar-test",
    repositoryId: "code",
    activeMachine: machineIdentity(store).id,
  });
  const ops = new Operations(store, { github, workspaceRoot: root });
  return {
    store,
    ops,
    root,
    async read() {
      await ops.execute("untriaged.view", { refresh: true });
      return {
        intake: await ops.execute("untriaged.view", {}),
        needsYou: (await ops.execute("conflicts.view", {})).items.filter(
          (item) => item.reason === "crew",
        ),
      };
    },
  };
}

// R110.8: a repository whose GitHub source is in `intake.sources` keeps
// Radar intake, Radar asks in Triage and back-links.
test("Radar intake, asks and back-links read the intake list", async (t) => {
  const SOURCE = {
    intake: {
      sources: {
        "github-radar": {
          via: "github",
          repository: REPO,
          executionRepository: "code",
          assignee: "operator",
        },
      },
    },
  };
  for (const form of ["source"]) {
    const github = fakeGitHub([
        recorded(2, { createdAt: "2026-11-15T05:00:00Z" }),
        recorded(12),
        recorded(14),
      ]),
      { store, ops, root, read } = workspace(t, github, POLICY(), SOURCE);
    const listed = (await ops.execute("intake.sources", {})).sources.filter(
      (row) => row.entry?.via === "github",
    );
    assert.deepEqual(
      listed.map((row) => [row.entry.repository, row.error]),
      [[REPO, null]],
      form,
    );
    const { intake, needsYou } = await read();
    assert.deepEqual(
      intake.items.map((item) => item.number),
      [12, 2],
      form,
    );
    assert.deepEqual(intake.items[0].start, { plan: true, deliver: true });
    assert.deepEqual(
      needsYou.map((row) => row.issue.number),
      [14],
      form,
    );
    assert.deepEqual(github.writes, [], "reading writes nothing");
    // Back-links read the stored repository rows, which the move leaves.
    store.put("github_repositories", {
      ...store.get("github_repositories", REPO),
      private: false,
    });
    store.put("github_repositories", {
      id: "o/plans",
      owner: "o",
      repo: "plans",
      private: false,
    });
    store.put("plans", {
      id: "s",
      spec: "s",
      context: { newPlan: { source: { repository: REPO, number: 12 } } },
    });
    store.put("receipts", {
      id: "github-parent:plan:s",
      kind: "github-parent",
      level: "plan",
      parentId: "s",
      repository: "o/plans",
      number: 40,
    });
    assert.deepEqual(
      intakeSpecIssue(store, { repository: REPO, number: 12 }),
      { repository: "o/plans", number: 40 },
      form,
    );
  }
});

test("a trusted escalation lists first in Untriaged with Plan this and Deliver this", async (t) => {
  // #2 is a plain issue, newer than the escalation #12 (new-feature skip).
  const github = fakeGitHub([
      recorded(2, { createdAt: "2026-11-15T05:00:00Z" }),
      recorded(12),
    ]),
    { read } = workspace(t, github);
  const { intake } = await read();
  assert.deepEqual(
    intake.items.map((item) => item.number),
    [12, 2],
  );
  const [first, plain] = intake.items;
  assert.deepEqual(first.start, { plan: true, deliver: true });
  assert.equal(first.source, "github");
  assert.equal(first.id, `${REPO}#12`);
  assert.deepEqual(first.escalation, {
    label: NEEDS_HUMAN,
    scope: "new-feature",
    claimed: false,
    draft: null,
  });
  assert.equal(plain.escalation, undefined);
  assert.equal(plain.start, undefined);
  assert.deepEqual(github.writes, [], "reading writes nothing");
});

// Untriaged reads every repository, and Radar's asks still arrive.
test("every repository feeds Triage and Radar asks", async (t) => {
  const github = fakeGitHub([
      recorded(2, { createdAt: "2026-11-15T05:00:00Z" }),
      recorded(12),
      recorded(14),
    ]),
    { read } = workspace(t, github, POLICY({}));
  const { intake, needsYou } = await read();
  // The plain issue is listed too: there is no Radar-only read.
  assert.deepEqual(
    intake.items.map((item) => item.number),
    [12, 2],
  );
  assert.deepEqual(intake.items[0].start, { plan: true, deliver: true });
  assert.equal(intake.items[0].escalation.scope, "new-feature");
  assert.deepEqual(
    needsYou.map((row) => row.issue.number),
    [14],
  );
  assert.deepEqual(needsYou[0].start, { plan: true, deliver: true });
  assert.deepEqual(github.writes, [], "reading writes nothing");
});

test("a trusted escalation's Needs you row offers the same two buttons; an untrusted one gets none", async (t) => {
  // #14: needs-decision, trusted, so Needs you. #12 by octocat: untrusted.
  const github = fakeGitHub([
      recorded(14),
      recorded(12, { author: "octocat" }),
    ]),
    { read } = workspace(t, github);
  const { intake, needsYou } = await read();
  assert.deepEqual(intake.items, []);
  assert.deepEqual(
    needsYou.map((row) => row.issue.number),
    [14],
  );
  assert.deepEqual(needsYou[0].start, { plan: true, deliver: true });
  assert.deepEqual(needsYou[0].item, { source: "github", id: `${REPO}#14` });
  assert.equal(needsYou[0].escalation.scope, "needs-decision");
});

test("the escalation rule is off by default and drafts locally with zero GitHub writes", async (t) => {
  const off = workspace(t, fakeGitHub([recorded(12)]));
  assert.equal((await off.read()).intake.items[0].escalation.draft, null);

  const github = fakeGitHub([recorded(12), recorded(14)]),
    on = workspace(t, github, POLICY({ radar: { escalationDraft: true } })),
    before = on.store.read().tasks.length;
  const { intake, needsYou } = await on.read();
  for (const draft of [
    intake.items[0].escalation.draft,
    needsYou[0].escalation.draft,
  ]) {
    assert.ok(draft.source.issue);
    assert.equal(draft.v, 2);
    assert.match(draft.definition, /^[0-9a-f]{64}$|^sha256:/);
  }
  assert.deepEqual(github.writes, [], "a draft writes nothing to GitHub");
  // Approval and dispatch stay person-only: nothing became a task.
  assert.equal(on.store.read().tasks.length, before);
  assert.throws(
    () => normalizeGitHubPolicy(POLICY({ radar: { escalationDraft: "yes" } })),
    /escalationDraft must be true or false/,
  );
});

test("only a person takes an escalation in", async (t) => {
  const github = fakeGitHub([recorded(12)]),
    { ops, read } = workspace(t, github);
  await read();
  for (const context of [{ mcp: true }, { caller: "session-1" }])
    await assert.rejects(
      ops.execute(
        "intake.plan",
        { source: "github", id: `${REPO}#12` },
        undefined,
        context,
      ),
      /Only a person/,
    );
  assert.deepEqual(github.writes, []);
});

test("Plan this on an escalation writes crew:avoozl once and keeps the needs-human label", async (t) => {
  const github = fakeGitHub([recorded(12)]),
    { ops, store, read } = workspace(t, github);
  await read();
  const result = await ops.execute("intake.plan", {
    source: "github",
    id: `${REPO}#12`,
  });
  const labelWrites = github.writes.filter(
    ([kind]) => kind !== "createIssueComment",
  );
  assert.deepEqual(labelWrites, [["addLabels", 12, ["crew:avoozl"]]]);
  assert.equal(
    github.writes.filter(([kind]) => kind === "createIssueComment").length,
    1,
  );
  assert.ok(store.read().tasks.some((task) => task.id === result.taskId));
  // The crew's label is still on the issue, and Avoozl's own is added.
  const issue = await github.issue(REPO, 12),
    names = issue.labels.map((label) => label.name);
  assert.ok(names.includes(NEEDS_HUMAN));
  assert.ok(names.includes("crew:avoozl"));
  // It leaves Untriaged and Needs you.
  const after = await read();
  assert.deepEqual(after.intake.items, []);
  assert.deepEqual(after.needsYou, []);
});

test("a live crew claim makes Plan this ask to confirm, and confirming removes no label", async (t) => {
  // #14 is trusted and in Needs you; a crew also holds the claim label.
  const github = fakeGitHub([recorded(14, { labels: [CLAIM] })]),
    { ops, read } = workspace(t, github);
  const { needsYou } = await read();
  assert.equal(needsYou[0].escalation.claimed, true);
  await assert.rejects(
    ops.execute("intake.plan", { source: "github", id: `${REPO}#14` }),
    /claimed .*Confirm/,
  );
  assert.deepEqual(github.writes, [], "a refused take-over writes nothing");
  await ops.execute("intake.plan", {
    source: "github",
    id: `${REPO}#14`,
    confirmClaim: true,
  });
  assert.deepEqual(
    github.writes.filter(([kind]) => kind !== "createIssueComment"),
    [["addLabels", 14, ["crew:avoozl"]]],
  );
});
