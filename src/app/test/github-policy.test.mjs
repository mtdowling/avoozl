import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import {
  actorAllowed,
  evaluateRules,
  matchingRules,
  normalizeGitHubPolicy,
  readGitHubPolicy,
} from "../github-policy.mjs";
import { intakeNotices, syncGitHubIssues } from "../github-sync.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// No machine-wide Avoozl configuration leaks into these workspaces.
process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

// The example from design §4.4, with no name built in.
const example = () => ({
  mode: "plans-repo",
  planningRepository: "example/plans",
  epicIssueType: "Epic",
  repositories: {
    "example/app": {
      checkout: "../app",
      folder: "Avoozl/example-app",
      baseBranch: "main",
      allowedActors: ["maintainer-login"],
      minimumPermission: "maintain",
      requiredChecks: ["build", "test"],
      priorityLabels: ["critical", "high"],
      managedLabels: {
        managed: "agent:managed",
        responding: "agent:responding",
        ready: "agent:ready",
      },
      rules: [
        {
          id: "answer",
          action: "respond",
          labelsAll: ["agent:respond"],
          labelsNone: ["agent:paused"],
        },
        {
          id: "build",
          action: "pause",
          labelsAll: ["agent:build"],
          labelsNone: ["agent:paused"],
          assignee: "maintainer-login",
          author: "maintainer-login",
        },
        { id: "pause", action: "pause", labelsAny: ["agent:paused"] },
      ],
    },
  },
});

test("the design example validates and keeps every value", () => {
  const policy = normalizeGitHubPolicy(example()),
    app = policy.repositories["example/app"];
  assert.equal(policy.mode, "plans-repo");
  assert.equal("coder" in app, false);
  assert.equal(app.rules.length, 3);
  assert.equal(app.managedLabels.ready, "agent:ready");
  assert.deepEqual(normalizeGitHubPolicy(undefined).repositories, {});
});

// The removed `concurrency` and `coder` keys are refused by name.
test("a repository's removed concurrency or coder key is refused", () => {
  for (const extra of [{ concurrency: 2 }, { coder: "worker" }])
    assert.throws(
      () =>
        normalizeGitHubPolicy({
          repositories: { "example/app": { baseBranch: "main", ...extra } },
        }),
      new RegExp(`Unknown setting .*${Object.keys(extra)[0]}`),
    );
});

test("validation refuses each §4.4 violation", () => {
  const app = (change) => {
    const value = example();
    change(value.repositories["example/app"], value);
    return value;
  };
  for (const [value, pattern] of [
    [{ ...example(), mode: "shared" }, /mode must be/],
    [
      { ...example(), planningRepository: undefined },
      /needs github.planningRepository/,
    ],
    [app((repo) => delete repo.baseBranch), /default branch/],
    [app((repo) => (repo.rules[0].action = "merge")), /action must be/],
    [
      app((repo) => (repo.rules[0].labelsAll = ["Agent:Ready"])),
      /managed label Agent:Ready as a trigger/,
    ],
    [
      app((repo) => repo.priorityLabels.push("agent:ready")),
      /priorityLabels cannot use/,
    ],
    [app((repo) => (repo.rules[1].id = "answer")), /repeats rule ID answer/],
    [
      app((repo) => (repo.rules[0].labelsAll = [])),
      /needs labelsAll or labelsAny/,
    ],
    [
      app((repo) => (repo.managedLabels.responding = "agent:ready")),
      /different label for each state/,
    ],
    [app((repo) => (repo.label = "agent:ready")), /Unknown setting/],
    [
      app((repo) => (repo.pullRequestReviews = { approvals: 0 })),
      /approvals must be a whole number/,
    ],
    [
      app((repo) => (repo.pullRequestReviews = { count: 1 })),
      /Unknown setting .*pullRequestReviews.count/,
    ],
  ])
    assert.throws(() => normalizeGitHubPolicy(value), pattern);
  // Pull-request reviews need one allowed approval unless told otherwise.
  assert.deepEqual(
    normalizeGitHubPolicy(app((repo) => (repo.pullRequestReviews = {})))
      .repositories["example/app"].pullRequestReviews,
    { approvals: 1 },
  );
  // An empty rule list is valid and executes nothing (R24.3).
  const empty = app((repo) => {
    repo.rules = [];
    repo.allowedActors = [];
    delete repo.minimumPermission;
  });
  assert.deepEqual(
    normalizeGitHubPolicy(empty).repositories["example/app"].rules,
    [],
  );
});

const labeled = (id, label, actor, at, event = "labeled") => ({
  id,
  event,
  label: { name: label },
  actor: { login: actor },
  created_at: `2026-11-12T10:${String(at).padStart(2, "0")}:00Z`,
});

test("rules match all, any and none labels, assignee and author", () => {
  const repo = normalizeGitHubPolicy(example()).repositories["example/app"],
    issue = (labels, extra = {}) => ({
      labels: labels.map((name) => ({ name })),
      assignees: [{ login: "maintainer-login" }],
      user: { login: "maintainer-login" },
      ...extra,
    }),
    rules = (value) => matchingRules(repo, value).map((match) => match.rule);
  assert.deepEqual(rules(issue(["agent:build"])), ["build"]);
  assert.deepEqual(rules(issue(["AGENT:BUILD", "agent:respond"])), [
    "answer",
    "build",
  ]);
  assert.deepEqual(rules(issue(["agent:build", "agent:paused"])), ["pause"]);
  assert.deepEqual(rules(issue(["agent:build"], { assignees: [] })), []);
  assert.deepEqual(
    rules(issue(["agent:build"], { user: { login: "someone" } })),
    [],
  );
  assert.deepEqual(rules(issue([])), []);
});

test("the newest event that made a rule true decides the actor", async () => {
  const repo = normalizeGitHubPolicy(example()).repositories["example/app"],
    issue = {
      labels: [{ name: "agent:build" }],
      assignees: [{ login: "maintainer-login" }],
      user: { login: "maintainer-login" },
    },
    permissions = { "maintainer-login": "maintain", outsider: "write" },
    evaluate = (events) =>
      evaluateRules(repo, issue, events, async (login) => permissions[login]);
  const [allowed] = await evaluate([
    labeled(1, "agent:build", "maintainer-login", 1),
  ]);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.eventId, "1");
  // Removing the pause label also makes the rule true: its actor counts.
  const [unpaused] = await evaluate([
    labeled(1, "agent:build", "maintainer-login", 1),
    labeled(2, "agent:paused", "maintainer-login", 2),
    labeled(3, "agent:paused", "outsider", 3, "unlabeled"),
  ]);
  assert.equal(unpaused.actor, "outsider");
  assert.equal(unpaused.allowed, false);
  // A label event whose label is gone again does not count.
  const [stale] = await evaluate([
    labeled(1, "agent:build", "maintainer-login", 1),
    labeled(2, "agent:other", "outsider", 2),
  ]);
  assert.equal(stale.actor, "maintainer-login");
  const [none] = await evaluate([]);
  assert.equal(none.allowed, false);
});

test("actor checks need the listed actor and the minimum permission", () => {
  const both = { allowedActors: ["a"], minimumPermission: "write" };
  assert.equal(actorAllowed(both, "a", "write").allowed, true);
  assert.equal(actorAllowed(both, "A", "admin").allowed, true);
  assert.equal(actorAllowed(both, "a", "triage").allowed, false);
  assert.equal(actorAllowed(both, "b", "admin").allowed, false);
  assert.equal(
    actorAllowed({ minimumPermission: "triage" }, "b", "triage").allowed,
    true,
  );
  assert.equal(
    actorAllowed({ allowedActors: ["a"] }, "a", "read").allowed,
    true,
  );
  assert.equal(actorAllowed({}, "a", "admin").allowed, false);
  assert.equal(actorAllowed(both, "", "admin").allowed, false);
});

class FakeGitHub {
  constructor() {
    this.issues = [];
    this.events = new Map();
    this.permissions = new Map();
    this.writes = [];
    this.defaultBranch = "main";
  }
  available() {
    return true;
  }
  repository() {
    return Promise.resolve({
      node_id: "repo-node",
      private: false,
      default_branch: this.defaultBranch,
    });
  }
  currentUser() {
    return Promise.resolve({ login: "worker" });
  }
  ensureLabel(_repository, label) {
    return Promise.resolve(label);
  }
  // One search per repository per sync, whatever the rules.
  searchIssuesWithAnyLabel(_repository, labels) {
    this.searches = (this.searches || 0) + 1;
    this.searchedLabels = labels;
    return Promise.resolve(structuredClone(this.issues));
  }
  issueEvents(_repository, number) {
    return Promise.resolve(structuredClone(this.events.get(number) || []));
  }
  issueTimeline() {
    return Promise.resolve([]);
  }
  permission(_repository, actor) {
    return Promise.resolve({
      permission: this.permissions.get(actor) || "none",
    });
  }
  // Any write would land here; intake must make none.
  addLabels(...args) {
    this.writes.push(["addLabels", ...args]);
    return Promise.resolve([]);
  }
  removeLabel(...args) {
    this.writes.push(["removeLabel", ...args]);
    return Promise.resolve(null);
  }
  updateIssue(...args) {
    this.writes.push(["updateIssue", ...args]);
    return Promise.resolve({});
  }
  createIssueComment(...args) {
    this.writes.push(["comment", ...args]);
    return Promise.resolve({});
  }
}

const SINGLE_REPO = {
  mode: "single-repo",
  repositories: {
    "example/code": {
      baseBranch: "main",
      allowedActors: ["maintainer"],
      minimumPermission: "write",
      managedLabels: { managed: "bot:managed", ready: "bot:ready" },
      rules: [
        {
          id: "build",
          action: "pause",
          labelsAll: ["bot:build", "area:core"],
          labelsNone: ["bot:hold"],
          assignee: "maintainer",
        },
        { id: "hold", action: "pause", labelsAll: ["bot:hold"] },
      ],
    },
  },
};

async function workspace(t, github, policy = SINGLE_REPO) {
  const { store } = fixture(t),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdef",
      github: policy,
    }),
  );
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    checks: [["npm", "test"]],
  });
  const ops = new Operations(store, { github, workspaceRoot: root });
  await ops.execute("github.configure", {
    repository: "example/code",
    projectId: "code",
    allowedActors: ["maintainer"],
  });
  return { store, ops, root };
}

const issue = (labels, body = "## Acceptance criteria\n\n- [ ] It works") => ({
  id: 1,
  node_id: "issue-node-1",
  number: 7,
  state: "open",
  title: "Policy issue",
  body,
  html_url: "https://example.test/example/code/issues/7",
  assignees: [{ login: "maintainer" }],
  user: { login: "maintainer" },
  labels: labels.map((name) => ({ name })),
});

test("a base branch other than the default branch is refused", async (t) => {
  const github = new FakeGitHub(),
    { ops } = await workspace(t, github);
  github.defaultBranch = "trunk";
  await assert.rejects(
    ops.execute("github.sync"),
    /\.avoozl\.json github\.repositories\.example\/code\.baseBranch is main, but the default branch of example\/code is trunk\./,
  );
});

const block = (fields) => "```task\n" + JSON.stringify(fields) + "\n```\n";
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  acceptance: [id + " is observable."],
  checks: ["npm test"],
  projectId: "code",
  ...extra,
});

test("a repository that names nobody defaults to write permission", () => {
  const policy = (entry) =>
    normalizeGitHubPolicy({
      mode: "single-repo",
      repositories: {
        "example/app": {
          baseBranch: "main",
          rules: [{ id: "go", action: "pause", labelsAll: ["go"] }],
          ...entry,
        },
      },
    }).repositories["example/app"];
  // Saving no longer fails for a missing People setting.
  assert.equal(policy({}).minimumPermission, "write");
  // Explicit settings win.
  assert.equal(
    policy({ minimumPermission: "maintain" }).minimumPermission,
    "maintain",
  );
  assert.equal(policy({ allowedActors: ["m"] }).minimumPermission, null);
  const fallback = policy({});
  assert.equal(actorAllowed(fallback, "w", "write").allowed, true);
  assert.equal(actorAllowed(fallback, "a", "admin").allowed, true);
  for (const held of ["read", "triage", "none", undefined]) {
    const check = actorAllowed(fallback, "r", held);
    assert.equal(check.allowed, false, String(held));
    assert.match(check.reason, /needs write permission/);
  }
});

const noPush = () =>
  Promise.reject(
    Object.assign(
      Error("Must have push access to view collaborator permission."),
      { status: 403 },
    ),
  );

test("allowedActors alone decides without reading permissions", async () => {
  const issue = {
      labels: [{ name: "go" }],
      assignees: [],
      user: { login: "a" },
    },
    rule = {
      id: "go",
      action: "pause",
      labelsAll: ["go"],
      labelsAny: [],
      labelsNone: [],
    },
    reads = [],
    permissionOf = (login) => {
      reads.push(login);
      return noPush();
    };
  const [named] = await evaluateRules(
    { allowedActors: ["a"], minimumPermission: null, rules: [rule] },
    issue,
    [labeled(1, "go", "a", 1)],
    permissionOf,
  );
  assert.equal(named.allowed, true);
  // Someone not named is refused before any permission read.
  const [other] = await evaluateRules(
    { allowedActors: ["a"], minimumPermission: "write", rules: [rule] },
    issue,
    [labeled(1, "go", "b", 1)],
    permissionOf,
  );
  assert.equal(other.allowed, false);
  assert.match(other.reason, /not an allowed actor/);
  assert.deepEqual(reads, []);
  // A permission GitHub will not show is unchecked, never allowed.
  const [unchecked] = await evaluateRules(
    { allowedActors: [], minimumPermission: "write", rules: [rule] },
    issue,
    [labeled(1, "go", "a", 1)],
    permissionOf,
  );
  assert.equal(unchecked.allowed, false);
  assert.equal(unchecked.unchecked, true);
  assert.match(unchecked.reason, /needs write access .* to check who counts/);
  // Other failures still stop the read.
  await assert.rejects(
    evaluateRules(
      { allowedActors: [], minimumPermission: "write", rules: [rule] },
      issue,
      [labeled(1, "go", "a", 1)],
      () => Promise.reject(Object.assign(Error("down"), { status: 503 })),
    ),
    /down/,
  );
});

test("intake makes one search per repository for all its rules", async (t) => {
  const github = new FakeGitHub(),
    { ops } = await workspace(t, github);
  github.permissions.set("maintainer", "write");
  // Only issues some rule could match have their events read.
  github.issues = [
    issue(["bot:build", "area:core"]),
    { ...issue(["bot:build"]), number: 8, node_id: "n8" },
  ];
  github.events.set(7, [
    labeled(1, "bot:build", "maintainer", 1),
    labeled(2, "area:core", "maintainer", 2),
  ]);
  const read = [];
  const events = github.issueEvents.bind(github);
  github.issueEvents = (repository, number) => {
    read.push(number);
    return events(repository, number);
  };
  await ops.execute("github.sync");
  assert.equal(github.searches, 1);
  assert.deepEqual(github.searchedLabels, ["bot:build", "bot:hold"]);
  assert.deepEqual(read, [7]);
});

test("the tick backs off quiet repositories and reads again on a change", async (t) => {
  const github = new FakeGitHub(),
    { store, root } = await workspace(t, github);
  github.permissions.set("maintainer", "write");
  github.issues = [
    {
      ...issue(["bot:build", "area:core"]),
      updated_at: "2026-11-12T10:00:00Z",
    },
  ];
  github.events.set(7, [
    labeled(1, "bot:build", "maintainer", 1),
    labeled(2, "area:core", "maintainer", 2),
  ]);
  const policy = readGitHubPolicy(root),
    t0 = Date.parse("2026-11-13T00:00:00Z"),
    at = (seconds) =>
      syncGitHubIssues(store, github, {
        policy,
        pace: { now: t0 + seconds * 1000 },
      });
  await at(0);
  await at(60); // unchanged: quiet once, wait two minutes
  assert.equal(github.searches, 2);
  const skipped = await at(120);
  assert.equal(github.searches, 2);
  assert.equal(skipped.repositories[0].skipped, true);
  await at(180);
  assert.equal(github.searches, 3);
  // Quiet again: the wait doubles. A changed issue resets it.
  await at(240);
  assert.equal(github.searches, 3);
  github.issues[0].updated_at = "2026-11-13T00:05:00Z";
  await at(420);
  assert.equal(github.searches, 4);
  await at(480);
  assert.equal(github.searches, 5);
  // A manual sync is never paced.
  await syncGitHubIssues(store, github, { policy });
  assert.equal(github.searches, 6);
});

test("a low GitHub call budget pauses paced intake and warns once", async (t) => {
  const github = new FakeGitHub(),
    { store, root } = await workspace(t, github);
  github.permissions.set("maintainer", "write");
  github.issues = [];
  const resetAt = "2026-11-13T01:00:00.000Z";
  github.rateLimit = (resource) =>
    resource === "core" ? { limit: 5000, remaining: 120, resetAt } : null;
  const policy = readGitHubPolicy(root),
    now = Date.parse("2026-11-13T00:30:00Z");
  const first = await syncGitHubIssues(store, github, {
    policy,
    pace: { now },
  });
  assert.equal(github.searches, undefined);
  assert.equal(first.throttled.resource, "core");
  assert.equal(first.throttled.resetAt, resetAt);
  const [warning] = intakeNotices(null, first);
  assert.match(warning.title, /slowing GitHub reads/);
  assert.deepEqual(intakeNotices(first, first), []);
  // Past the reset the budget no longer counts as low.
  const later = await syncGitHubIssues(store, github, {
    policy,
    pace: { now: Date.parse(resetAt) + 1000 },
  });
  assert.equal(later.throttled, null);
  assert.equal(github.searches, 1);
});

test("a conditional activity read wakes a quiet repository at once", async (t) => {
  const github = new FakeGitHub(),
    { store, root } = await workspace(t, github);
  github.permissions.set("maintainer", "write");
  github.issues = [issue(["bot:build", "area:core"])];
  github.events.set(7, [
    labeled(1, "bot:build", "maintainer", 1),
    labeled(2, "area:core", "maintainer", 2),
  ]);
  let current = "e1";
  const probes = [];
  github.issueActivity = (_repository, etag) => {
    probes.push(etag);
    return Promise.resolve({ changed: etag !== current, etag: current });
  };
  const policy = readGitHubPolicy(root),
    t0 = Date.parse("2026-11-13T00:00:00Z"),
    at = (seconds) =>
      syncGitHubIssues(store, github, {
        policy,
        pace: { now: t0 + seconds * 1000 },
      });
  await at(0);
  await at(60); // quiet: the timer says wait two minutes
  assert.equal(github.searches, 2);
  await at(120); // GitHub says unchanged (a free 304): skip
  assert.equal(github.searches, 2);
  current = "e2"; // someone relabels an issue
  await at(130);
  assert.equal(github.searches, 3);
  await at(140); // one more read, in case the search index lagged
  assert.equal(github.searches, 4);
  await at(150);
  assert.equal(github.searches, 4);
  assert.deepEqual(probes, [null, null, "e1", "e1", null, "e2"]);
});
