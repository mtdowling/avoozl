// Tasks 4.4 and 4.6 (design §6.2, R12.3–12.6, R27.5, R27.8). Fake GitHub
// only: a broad issue is classified, drafted, critiqued, previewed and
// published only after an allowed re-label; `depends on #N` text becomes a
// native edge only after approval, and is ignored when dependencyText is off.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseDependencyText } from "../github-breakdown.mjs";
import { Operations } from "../operations.mjs";
import { readSpecFolder } from "../spec-plans.mjs";
import { Store } from "../store.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { snapshot } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const REPO = "example/code",
  TRIGGER = "agent:build",
  DECISION = "agent:decision";
let clock = Date.now() + 60_000;
const later = () => new Date((clock += 60_000)).toISOString();

function avoozlJson(root, { dependencyText = false, auto = false } = {}) {
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_breakdownbreakd1",
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            allowedActors: ["maintainer"],
            dependencyText,
            managedLabels: {
              managed: "agent:managed",
              ready: "agent:ready",
              decision: DECISION,
            },
            rules: [
              {
                id: "build",
                action: "deliver",
                labelsAll: [TRIGGER],
                autoPublishChildren: auto,
              },
            ],
          },
        },
      },
    }),
  );
}

// FakeGitHub whose issue reads honor the repository, so a cross-repository
// reference and a missing issue behave as on GitHub.
function fakeGitHub() {
  const github = new FakeGitHub();
  github.permissions.set("maintainer", "write");
  github.permissions.set("outsider", "read");
  const repo = (value) => (typeof value === "string" ? value : value.id);
  github.issue = async (value, number) => {
    const found = github.created.find(
      (item) =>
        item.number === number && (item.repository || REPO) === repo(value),
    );
    return found ? structuredClone(found) : undefined;
  };
  github.listIssueBlockers = async (value, number) =>
    structuredClone([
      ...(
        github.blockers.get(`${repo(value)}#${number}`) || new Map()
      ).values(),
    ]);
  // Comments carry GitHub's own times, on the same clock as label events.
  const create = github.createIssueComment.bind(github),
    update = github.updateIssueComment.bind(github);
  github.createIssueComment = async (...args) => ({
    ...(await create(...args)),
    created_at: later(),
  });
  github.updateIssueComment = async (...args) => ({
    ...(await update(...args)),
    updated_at: later(),
  });
  return github;
}

function sourceIssue(github, body) {
  const issue = {
    id: 7,
    node_id: "issue-node-7",
    number: 7,
    repository: REPO,
    state: "open",
    title: "Ship configuration loading",
    body,
    html_url: `https://example.test/${REPO}/issues/7`,
    assignees: [{ login: "maintainer" }],
    labels: [{ name: TRIGGER }],
  };
  github.created.push(issue);
  github.issues = [issue];
  return issue;
}

function relabel(github, actor) {
  const events = github.events.get(7) || [],
    n = events.length;
  events.push(
    {
      id: 1000 + n,
      node_id: `unlabel-${n}`,
      event: "unlabeled",
      label: { name: TRIGGER },
      actor: { login: actor },
      created_at: later(),
    },
    {
      id: 1001 + n,
      node_id: `label-${n}`,
      event: "labeled",
      label: { name: TRIGGER },
      actor: { login: actor },
      created_at: later(),
    },
  );
  github.events.set(7, events);
}

async function openWorkspace(t, options = {}) {
  const root = temporaryDirectory("avoozl-breakdown-"),
    code = temporaryDirectory("avoozl-breakdown-code-"),
    dir = temporaryDirectory("avoozl-breakdown-db-"),
    store = new Store(path.join(dir, "workspace.sqlite")),
    github = fakeGitHub();
  t.after(() => store.close());
  avoozlJson(root, options);
  store.importSnapshot(snapshot());
  store.put("projects", {
    id: "code",
    root: code,
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [["npm", "test"]],
  });
  const ops = new Operations(store, {
    github,
    operator: "Operator",
    workspaceRoot: root,
  });
  await ops.execute("github.configure", {
    repository: REPO,
    projectId: "code",
    allowedActors: ["maintainer"],
  });
  github.events.set(7, [
    {
      id: 99,
      node_id: "label-first",
      event: "labeled",
      label: { name: TRIGGER },
      actor: { login: "maintainer" },
      created_at: "2026-11-12T00:00:00Z",
    },
  ]);
  return { store, ops, github, code };
}

const sourceTask = (store) =>
  store.read().tasks.find((task) => task.github?.number === 7);
const labels = (issue) => issue.labels.map((label) => label.name);

function critique(code, name) {
  const { hash } = readSpecFolder(code, name);
  fs.writeFileSync(
    path.join(code, ".kiro", "specs", name, "avoozl", "critique.md"),
    `Reviewed: .kiro/specs/${name}/ ${hash}\n\nNo findings.\n`,
  );
  return hash;
}

async function broadDraft(t, options) {
  const workspace = await openWorkspace(t, options),
    { ops, github, code } = workspace;
  sourceIssue(github, "Load and validate config.json.");
  await ops.execute("github.sync");
  await ops.execute("github.breakdown.classify", {
    repository: REPO,
    number: 7,
    kind: "broad",
    reason: "Two leaves: reading and validating.",
  });
  writeSpec(code, "issue-7");
  const drafted = await ops.execute("github.breakdown.draft", {
    repository: REPO,
    number: 7,
    spec: "issue-7",
  });
  return { ...workspace, drafted };
}

test("a broad issue publishes children only after an allowed re-label", async (t) => {
  const { store, ops, github, code, drafted } = await broadDraft(t);
  assert.equal(drafted.canPublish, true);
  assert.equal(sourceTask(store).dispatch.ready, false, "broad is held");
  assert.equal(sourceTask(store).kind, "epic");

  // No critique yet: nothing is posted.
  let synced = await ops.execute("github.sync");
  assert.equal(synced.breakdown.waiting[0].state, "awaiting-critique");
  assert.equal(github.comments.length, 0);

  critique(code, "issue-7");
  synced = await ops.execute("github.sync");
  assert.equal(synced.breakdown.previewed.length, 1);
  assert.equal(github.comments.length, 1);
  assert.match(github.comments[0].body, /`issue-7\.1\.1` Read the config file/);
  assert.match(github.comments[0].body, /remove and add the `agent:build`/);
  assert.ok(labels(github.created[0]).includes(DECISION));
  // Before approval: no child issue, link, or edge exists.
  assert.equal(github.created.length, 1);
  assert.deepEqual(github.subIssues, []);
  assert.equal(github.blockers.size, 0);

  // A second sync with no new label event changes nothing.
  await ops.execute("github.sync");
  assert.equal(github.created.length, 1);
  assert.equal(github.comments.length, 1);

  // A disallowed actor's re-label approves nothing.
  relabel(github, "outsider");
  await ops.execute("github.sync");
  assert.equal(github.created.length, 1);
  assert.deepEqual(github.subIssues, []);

  relabel(github, "maintainer");
  synced = await ops.execute("github.sync");
  assert.equal(synced.breakdown.published.length, 1);
  const [read, validate] = github.created.slice(1);
  assert.equal(github.created.length, 3);
  assert.equal(read.title, "Read the config file");
  assert.equal(validate.title, "Validate loaded config");
  // Both are sub-issues of the source; validate is blocked by read.
  assert.deepEqual(github.subIssues.sort(), [
    [7, read.id],
    [7, validate.id],
  ]);
  assert.deepEqual(
    [...github.blockers.get(`${REPO}#${validate.number}`).keys()],
    [read.id],
  );
  assert.equal(github.blockers.get(`${REPO}#${read.number}`), undefined);
  assert.ok(!labels(github.created[0]).includes(DECISION));
  assert.match(github.comments[0].body, /published/);
  // Children inherit the source issue's assignee.
  assert.deepEqual(
    validate.assignees.map((entry) => entry.login),
    ["maintainer"],
  );

  const data = store.read(),
    source = sourceTask(store),
    children = data.tasks.filter((task) => task.parent === source.id);
  assert.deepEqual(children.map((task) => task.id).sort(), [
    "issue-7.1.1",
    "issue-7.1.2",
  ]);
  assert.ok(
    data.edges.some(
      (edge) =>
        edge.from === "issue-7.1.1" &&
        edge.to === "issue-7.1.2" &&
        edge.kind === "requires",
    ),
  );
  assert.equal(
    data.tasks.some((task) => task.id === "issue-7.1"),
    false,
    "the spec's root epic is the source issue, not a new task",
  );
  assert.equal(source.dispatch.ready, false);

  // Idempotent: another sync writes nothing new.
  await ops.execute("github.sync");
  assert.equal(github.created.length, 3);
  assert.equal(github.subIssues.length, 2);
});

test("a re-label before the preview changed approves nothing", async (t) => {
  const { ops, github, code } = await broadDraft(t);
  critique(code, "issue-7");
  await ops.execute("github.sync");
  relabel(github, "maintainer");
  // The child graph changes after that re-label and is critiqued again.
  const folder = path.join(code, ".kiro", "specs", "issue-7");
  fs.writeFileSync(path.join(folder, "design.md"), "# Design\n\nChanged.\n");
  critique(code, "issue-7");
  let synced = await ops.execute("github.sync");
  assert.equal(synced.breakdown.previewed.length, 1, "a new preview");
  synced = await ops.execute("github.sync");
  assert.equal(synced.breakdown.published.length, 0);
  assert.equal(github.created.length, 1);
  relabel(github, "maintainer");
  synced = await ops.execute("github.sync");
  assert.equal(synced.breakdown.published.length, 1);
});

test("autoPublishChildren publishes without a preview once lint and critique pass", async (t) => {
  const { ops, github, code } = await broadDraft(t, { auto: true });
  critique(code, "issue-7");
  const synced = await ops.execute("github.sync");
  assert.equal(synced.breakdown.published.length, 1);
  assert.equal(github.comments.length, 0);
  assert.equal(github.created.length, 3);
  assert.equal(github.subIssues.length, 2);
});

test("autoPublishChildren still waits when the critique has findings", async (t) => {
  const { ops, github, code } = await broadDraft(t, { auto: true });
  const hash = critique(code, "issue-7");
  fs.writeFileSync(
    path.join(code, ".kiro", "specs", "issue-7", "avoozl", "critique.md"),
    `Reviewed: .kiro/specs/issue-7/ ${hash}\n\n\`\`\`finding\n{"kind": "open-decision", "text": "Pick a format."}\n\`\`\`\n`,
  );
  await ops.execute("github.sync");
  assert.equal(github.created.length, 1);
  assert.equal(github.comments.length, 1);
  assert.match(github.comments[0].body, /1 finding/);
});

test("a bounded issue stays its own leaf with no new issue", async (t) => {
  const { store, ops, github } = await openWorkspace(t);
  sourceIssue(github, "Fix one typo.");
  await ops.execute("github.sync");
  await ops.execute("github.breakdown.classify", {
    repository: REPO,
    number: 7,
    kind: "bounded",
    reason: "One file, one change.",
  });
  await ops.execute("github.sync");
  assert.equal(sourceTask(store).dispatch.ready, true);
  assert.equal(github.created.length, 1);
  assert.equal(github.comments.length, 0);
  await assert.rejects(
    ops.execute("github.breakdown.draft", {
      repository: REPO,
      number: 7,
      spec: "issue-7",
    }),
    /Classify the issue as broad/,
  );
});

test("dependency text becomes native edges only after approval", async (t) => {
  const { store, ops, github } = await openWorkspace(t, {
    dependencyText: true,
  });
  github.created.push(
    {
      id: 5,
      node_id: "issue-node-5",
      number: 5,
      repository: REPO,
      state: "open",
      title: "Blocker here",
      body: "",
      labels: [],
    },
    {
      id: 900,
      node_id: "issue-node-900",
      number: 9,
      repository: "other/repo",
      state: "open",
      title: "Blocker elsewhere",
      body: "",
      labels: [],
    },
  );
  sourceIssue(
    github,
    [
      "Depends on #5 and other/repo#9.",
      "Also depends on #7, depends on #99.",
      "`depends on #6` is code, as is:",
      "```",
      "depends on #8",
      "```",
    ].join("\n"),
  );
  await ops.execute("github.sync");
  assert.equal(sourceTask(store).dispatch.ready, false);
  assert.equal(sourceTask(store).dispatch.state, "awaiting-approval");
  assert.equal(github.blockers.size, 0, "no edge before approval");
  assert.equal(github.comments.length, 1);
  const preview = github.comments[0].body;
  assert.match(preview, /- example\/code#5\n- other\/repo#9/);
  assert.match(preview, /example\/code#7: An issue cannot depend on itself/);
  assert.match(preview, /example\/code#99: example\/code#99 is not an issue/);
  assert.doesNotMatch(preview, /#6|#8/);

  relabel(github, "outsider");
  await ops.execute("github.sync");
  assert.equal(github.blockers.size, 0);

  relabel(github, "maintainer");
  await ops.execute("github.sync");
  assert.deepEqual(
    [...github.blockers.get(`${REPO}#7`).keys()].sort((a, b) => a - b),
    [5, 900],
  );
  // Neither blocker is an Avoozl task, so the issue waits on GitHub state.
  assert.equal(sourceTask(store).dispatch.state, "blocked");
  github.created.find((issue) => issue.id === 5).state = "closed";
  github.created.find((issue) => issue.id === 900).state = "closed";
  await ops.execute("github.sync");
  assert.equal(sourceTask(store).dispatch.ready, true);
});

test("dependency text is ignored when dependencyText is off", async (t) => {
  const { store, ops, github } = await openWorkspace(t);
  github.created.push({
    id: 5,
    node_id: "issue-node-5",
    number: 5,
    repository: REPO,
    state: "open",
    title: "Blocker",
    body: "",
    labels: [],
  });
  sourceIssue(github, "Depends on #5.");
  await ops.execute("github.sync");
  assert.equal(sourceTask(store).dispatch.ready, true);
  assert.equal(github.comments.length, 0);
  assert.equal(github.blockers.size, 0);
  assert.equal(store.list("github_issues")[0].breakdown, undefined);
});

test("a reference that would close a cycle is shown and never linked", async (t) => {
  const { store, ops, github } = await openWorkspace(t, {
    dependencyText: true,
  });
  github.created.push({
    id: 5,
    node_id: "issue-node-5",
    number: 5,
    repository: REPO,
    state: "open",
    title: "Waits on 7",
    body: "",
    labels: [],
  });
  const source = sourceIssue(github, "Depends on #5.");
  github.blockers.set(`${REPO}#5`, new Map([[7, source]]));
  await ops.execute("github.sync");
  const row = store.list("github_issues")[0];
  assert.equal(row.breakdown.textEdges[0].state, "cycle");
  assert.equal(github.comments.length, 0, "nothing to approve, nothing posted");
  assert.equal(github.blockers.get(`${REPO}#7`), undefined);
  // The cycle is not a proposal, so the issue is not held after the check.
  await ops.execute("github.sync");
  assert.equal(sourceTask(store).dispatch.ready, true);
});

test("parseDependencyText reads phrases, cross-repo references and self", () => {
  assert.deepEqual(
    parseDependencyText(
      "Depends on: #1, #2 and owner/x#3\ndepends on #1\nDepends on #4",
      "a/b",
      4,
    ).map(({ ref, state }) => [ref, state]),
    [
      ["a/b#1", "proposed"],
      ["a/b#2", "proposed"],
      ["owner/x#3", "proposed"],
      ["a/b#4", "self"],
    ],
  );
  assert.deepEqual(parseDependencyText("Relates to #3", "a/b", 1), []);
});

test("the tick alone takes in, publishes, and readies children as blockers merge", async (t) => {
  // Nearby inputs: the trigger label before any planner (nothing published),
  // a tick with no change (no new label), and the parent closing last.
  const { store, ops, github, code } = await openWorkspace(t, { auto: true });
  sourceIssue(github, "Load and validate config.json.");
  const SHA = "c".repeat(40),
    tick = () => ops.execute("workspace.tick", { sessions: [] }),
    ready = (issue) => labels(issue).includes("agent:ready");
  github.closing = new Map();
  github.closingPullRequests = async (_repo, number) =>
    structuredClone(github.closing.get(number) || []);
  github.checkRuns = async () => [];
  github.commitStatus = async () => ({ statuses: [] });
  // A merged pull request closes the issue, as GitHub does on `Closes #N`.
  const merge = (issue) => {
    Object.assign(issue, {
      state: "closed",
      state_reason: "completed",
      closed_at: later(),
    });
    github.closing.set(issue.number, [
      {
        number: 100 + issue.number,
        url: `https://example.test/${REPO}/pull/${100 + issue.number}`,
        merged: true,
        mergedAt: issue.closed_at,
        headRefOid: SHA,
        baseRefName: "main",
        repository: { nameWithOwner: REPO },
      },
    ]);
  };

  // Intake: the tick records the match and starts a planner, which holds the
  // issue until it is classified; nothing is published yet.
  const started = await tick();
  assert.equal(sourceTask(store).dispatch.state, "classifying");
  assert.equal(started.dispatch.filter((d) => d.role === "planner").length, 1);
  assert.equal(github.created.length, 1);

  // The planner's classification and draft, then the tick publishes.
  await ops.execute("github.breakdown.classify", {
    repository: REPO,
    number: 7,
    kind: "broad",
    reason: "Two leaves: reading and validating.",
  });
  writeSpec(code, "issue-7");
  await ops.execute("github.breakdown.draft", {
    repository: REPO,
    number: 7,
    spec: "issue-7",
  });
  critique(code, "issue-7");
  await tick();
  const [read, validate] = github.created.slice(1);
  assert.equal(github.created.length, 3);
  assert.equal(github.subIssues.length, 2);
  assert.ok(ready(read), "the unblocked child is ready");
  assert.ok(!ready(validate), "the blocked child is not");
  assert.ok(!ready(github.created[0]), "the parent is never ready");

  const writes = github.labels.length;
  await tick();
  assert.deepEqual(
    github.labels.slice(writes),
    [],
    "an unchanged tick writes no label",
  );

  // The blocker merges: the next tick readies its dependent.
  merge(read);
  await tick();
  assert.ok(ready(validate));
  assert.equal(github.created[0].state, "open");

  // The last child merges: the parent closes.
  merge(validate);
  await tick();
  await tick();
  assert.equal(github.created[0].state, "closed");
  assert.equal(github.comments.length, 0, "auto-publish posts no preview");
});
