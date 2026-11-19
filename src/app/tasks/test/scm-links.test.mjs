import assert from "node:assert/strict";
import test from "node:test";
import { linkSets, specLinks, taskLinks } from "../scm-links.mjs";
import { Operations } from "../../api/operations.mjs";
import { fixture } from "../../test/fixtures.mjs";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const iso = (minutes) => new Date(NOW - minutes * 60000).toISOString();
const sha = (c) => c.repeat(40);
const task = (id, extra = {}) => ({
  id,
  title: id,
  scope: "catalog",
  status: "planned",
  track: "catalog",
  kind: "leaf",
  tags: [],
  acceptance: ["Done."],
  planId: "s",
  ...extra,
});

// A seeded workspace with every stored record a link set reads: a spec
// issue, a working branch, an open pull request with checks, a landed task,
// a task with no records, and the intake issue the spec came from.
function seed(t) {
  const { root, store } = fixture(t),
    data = store.read();
  store.importSnapshot({
    ...data,
    tasks: [
      task("open", { github: { repository: "example/code", number: 7 } }),
      task("landed", {
        integration: { commit: sha("c"), pr: 12, into: "main" },
        intake: { issue: { repository: "example/radar", number: 3 } },
      }),
      task("bare"),
      task("hostile", {
        repository: "code",
        github: { repository: "https://evil.example/x", number: 1 },
        intake: { link: "https://evil.example/phish" },
      }),
    ],
  });
  store.put("repositories", { id: "code", github: "example/code" });
  store.put("plans", {
    id: "s",
    spec: "s",
    context: {
      newPlan: { source: { repository: "example/radar", number: 3 } },
    },
  });
  store.put("receipts", {
    id: "github-parent:plan:s",
    kind: "github-parent",
    level: "plan",
    parentId: "s",
    repository: "example/specs",
    number: 40,
    // Stored from GitHub's reply; link sets never use it.
    url: "https://evil.example/spec",
  });
  store.put("receipts", {
    id: "radar-source:example/radar#5",
    kind: "radar-source",
    planId: "s",
    repository: "example/radar",
    number: 5,
  });
  for (const id of ["open", "landed"])
    store.put("task_worktrees", {
      id,
      taskId: id,
      repository: "code",
      branch: `avoozl/${id}`,
      path: `/work/avoozl-${id}`,
      base: { branch: "avoozl/s/work", commit: sha("0"), kind: "working" },
    });
  store.put("task_deliveries", {
    id: "open",
    taskId: "open",
    state: "done",
    commit: sha("a"),
  });
  store.put("task_deliveries", {
    id: "landed",
    taskId: "landed",
    state: "integrated",
    commit: sha("b"),
    integratedCommit: sha("c"),
    pr: 12,
  });
  store.put("landing_queue", {
    id: "code\0main\0landed",
    repositoryId: "code",
    base: "main",
    key: "landed",
    commit: sha("b"),
    tasks: [{ task: "landed" }],
    pr: 12,
    seq: 1,
    state: "landed",
    checks: [{ command: "test", exitCode: 0 }],
    finishedAt: iso(30),
  });
  store.put("pr_ci", {
    id: "example/code#11",
    repository: "example/code",
    number: 11,
    taskId: "open",
    branch: "avoozl/open",
    headSha: sha("a"),
    lastSeen: iso(5),
    closedAt: null,
  });
  for (const [runId, workflow, attempt, conclusion] of [
    [1, "ci", 1, "failure"],
    [2, "ci", 2, "success"],
    [3, "lint", 1, "success"],
  ])
    store.put("ci_runs", {
      id: `example/code:${runId}`,
      repository: "example/code",
      runId,
      workflow,
      attempt,
      headSha: sha("a"),
      conclusion,
    });
  return { root, store };
}

test("link sets come from stored records with URLs built from validated fields", (t) => {
  const { store } = seed(t),
    { specs, tasks } = linkSets(store, { now: NOW });

  const open = tasks.open;
  assert.equal(open.repository, "example/code");
  assert.equal(
    open.branch.url,
    "https://github.com/example/code/tree/avoozl/open",
  );
  assert.deepEqual(open.worktree, {
    kind: "worktree",
    path: "/work/avoozl-open",
    local: true,
  });
  assert.equal(open.pr.url, "https://github.com/example/code/pull/11");
  assert.equal(open.pr.state, "open");
  // The retried ci attempt passed; check state carries its head and age.
  assert.equal(open.checks.state, "pass");
  assert.equal(open.checks.head, sha("a"));
  assert.equal(open.checks.ageMs, 5 * 60000);
  assert.equal(open.checks.current, true);
  assert.equal(open.checks.dot, "pass");
  assert.equal(
    open.checks.url,
    "https://github.com/example/code/pull/11/checks",
  );
  assert.equal(open.issue.url, "https://github.com/example/code/issues/7");
  assert.equal(open.landed, null);

  const landed = tasks.landed;
  assert.equal(landed.pr.number, 12);
  assert.equal(landed.pr.state, "merged");
  assert.equal(
    landed.landed.url,
    `https://github.com/example/code/commit/${sha("c")}`,
  );
  assert.equal(landed.checks.source, "landing");
  assert.equal(landed.checks.state, "pass");
  assert.equal(landed.source.url, "https://github.com/example/radar/issues/3");

  // Missing records show as none.
  const bare = tasks.bare;
  for (const key of [
    "branch",
    "worktree",
    "pr",
    "checks",
    "landed",
    "issue",
    "source",
  ])
    assert.equal(bare[key], null, key);

  // A URL from content never becomes a link; an invalid repository is none.
  const hostile = tasks.hostile;
  assert.equal(hostile.issue, null);
  assert.equal(hostile.source, null);
  const all = JSON.stringify({ specs, tasks });
  assert.ok(!all.includes("evil.example"), "no stored URL is passed through");

  const spec = specs.s;
  assert.equal(spec.issue.url, "https://github.com/example/specs/issues/40");
  assert.equal(spec.journal.home, "github");
  assert.deepEqual(
    spec.workingBranches.map((b) => b.url),
    ["https://github.com/example/code/tree/avoozl/s/work"],
  );
  assert.deepEqual(
    spec.pulls.map((p) => [p.number, p.checks.dot]),
    [[11, "pass"]],
  );
  assert.deepEqual(
    spec.sources.map((s) => s.number),
    [3, 5],
  );
  assert.deepEqual(specLinks(store, "s", { now: NOW }), spec);
  assert.deepEqual(taskLinks(store, "open", { now: NOW }), open);
  assert.equal(taskLinks(store, "nope"), null);
});

test("check state for a head that is no longer current shows as stale", (t) => {
  const { store } = seed(t);
  store.put("task_deliveries", {
    id: "open",
    taskId: "open",
    state: "running",
    commit: sha("d"),
  });
  const { checks } = taskLinks(store, "open", { now: NOW });
  assert.equal(checks.state, "pass");
  assert.equal(checks.head, sha("a"));
  assert.equal(checks.current, false);
  assert.equal(checks.dot, "stale");
});

test("a spec without a published issue shows its local journal or none", (t) => {
  const { store } = seed(t);
  store.remove("receipts", "github-parent:plan:s");
  assert.equal(specLinks(store, "s").issue, null);
  assert.equal(specLinks(store, "s").journal, null);
  store.put("receipts", {
    id: "spec-journal:s",
    kind: "spec-journal",
    planId: "s",
    home: "local",
  });
  assert.deepEqual(specLinks(store, "s").journal, {
    kind: "journal",
    home: "local",
    local: true,
  });
});

test("link sets add no GitHub call: the count is the same with them on", async (t) => {
  const { root, store } = seed(t),
    calls = [],
    // Counts every read or write a view could make, then answers nothing.
    github = new Proxy(
      {},
      {
        get: (_, method) =>
          method === "then"
            ? undefined
            : (...args) => {
                calls.push(String(method));
                return method === "available" ? true : null;
              },
      },
    ),
    ops = new Operations(store, { workspaceRoot: root, github });
  const views = async (withLinks) => {
    for (const id of ["open", "landed", "bare"]) {
      await ops.execute("task.detail", { id });
      if (withLinks) taskLinks(store, id);
    }
    if (withLinks) {
      specLinks(store, "s");
      // Refreshing builds them again from the store.
      linkSets(store);
      linkSets(store);
    }
  };
  await views(false);
  const off = calls.length;
  calls.length = 0;
  await views(true);
  assert.equal(calls.length, off);
});

test("delivery.view carries each task's link set for In flight chips, with no GitHub call", async (t) => {
  const { root, store } = seed(t),
    calls = [],
    github = new Proxy(
      {},
      {
        get: (_, method) =>
          method === "then"
            ? undefined
            : (...args) => {
                calls.push(String(method));
                return method === "available" ? true : null;
              },
      },
    ),
    ops = new Operations(store, { workspaceRoot: root, github });
  const { items } = await ops.execute("delivery.view", {}),
    byId = new Map(items.map((item) => [item.id, item])),
    { tasks } = linkSets(store);
  assert.equal(calls.length, 0);
  for (const id of ["open", "landed"]) {
    const { links } = byId.get(id);
    // `now` differs between the two reads; ages are not compared.
    assert.deepEqual(
      { ...links, checks: links.checks && { ...links.checks, ageMs: 0 } },
      {
        ...tasks[id],
        checks: tasks[id].checks && { ...tasks[id].checks, ageMs: 0 },
      },
    );
  }
  assert.equal(byId.get("open").links.pr.number, 11);
  assert.equal(byId.get("open").links.checks.dot, "pass");
  assert.equal(byId.get("open").links.branch.ref, "avoozl/open");
});

test("task.detail carries the task's link set for the Links box", async (t) => {
  const { root, store } = seed(t),
    ops = new Operations(store, { workspaceRoot: root });
  const { links } = await ops.execute("task.detail", { id: "open" });
  const expected = taskLinks(store, "open");
  assert.equal(links.pr.url, expected.pr.url);
  assert.equal(links.branch.url, expected.branch.url);
  assert.equal(links.checks.dot, "pass");
  assert.deepEqual(links.worktree, expected.worktree);
  assert.equal(
    (await ops.execute("task.detail", { id: "bare" })).links.pr,
    null,
  );
});

test("plan.get carries the spec's link set and makes no GitHub call", async (t) => {
  const { root, store } = seed(t),
    calls = [],
    github = new Proxy(
      {},
      {
        get: (_, method) =>
          method === "then"
            ? undefined
            : (...args) => {
                calls.push(String(method));
                return method === "available" ? true : null;
              },
      },
    ),
    ops = new Operations(store, { workspaceRoot: root, github });
  const plan = await ops.execute("plan.get", { id: "s" });
  assert.deepEqual(
    { ...plan.links, pulls: undefined },
    { ...specLinks(store, "s"), pulls: undefined },
  );
  // Check ages move with the clock; the pull requests themselves match.
  assert.deepEqual(
    plan.links.pulls.map((p) => p.url),
    specLinks(store, "s").pulls.map((p) => p.url),
  );
  assert.equal(
    plan.links.issue.url,
    "https://github.com/example/specs/issues/40",
  );
  assert.deepEqual(calls, []);
});
