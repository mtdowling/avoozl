// Claim branches (simplify sim-1.1, §D3): `runner.next` with `claim` makes
// `avoozl/<spec>/<task>` on origin through the refs create call, and the
// branches alone say which tasks are claimed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { Store } from "../../store/store.ts";
import { snapshot } from "../../test/fixtures.mjs";
import { specCheckout } from "../../test/spec-checkout.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { integrationNeedsYou } from "../../specs/integration-base.mjs";
import { RepositorySettings } from "../../settings/repository-settings.mjs";

const leaf = (id) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  checks: ["npm test"],
  repository: "app",
  planId: "parser",
});

// A fake GitHub holding origin's refs: the create call answers 422 for a
// name it already has, as GitHub does.
function fakeGitHub(head, existing = []) {
  const refs = new Map(existing.map((name) => [name, head])),
    calls = [];
  return {
    calls,
    refs,
    async branchesUnder(repository, prefix) {
      calls.push(["matching-refs", repository, prefix]);
      return [...refs]
        .filter(([name]) => name.startsWith(prefix))
        .map(([name, sha]) => ({ ref: `refs/heads/${name}`, object: { sha } }));
    },
    // Origin's branches: main, the refs made here, and `branches` given.
    branches: new Map([["main", head]]),
    async branch(repository, name) {
      calls.push(["branch", repository, name]);
      const sha = this.branches.get(name) ?? refs.get(name);
      if (!sha) throw Object.assign(Error("Branch not found"), { status: 404 });
      return { name, commit: { sha } };
    },
    // How far `head` is ahead of `base`, and a merge that may conflict.
    ahead: 0,
    conflict: false,
    async compareCommits(repository, base, other) {
      calls.push(["compare", repository, base, other]);
      return { ahead_by: this.ahead, files: [{ filename: "src/a.js" }] };
    },
    async mergeBranch(repository, { base, head: from }) {
      calls.push(["merge", repository, base, from]);
      if (this.conflict)
        throw Object.assign(Error("Merge conflict"), { status: 409 });
      this.ahead = 0;
      this.branches.set(base, "m".repeat(40));
      return { sha: "m".repeat(40) };
    },
    async createBranch(repository, name, sha) {
      calls.push(["create", repository, name, sha]);
      if (refs.has(name))
        throw Object.assign(Error("Reference already exists"), {
          status: 422,
        });
      refs.set(name, sha);
      return { ref: `refs/heads/${name}` };
    },
  };
}

function setup(t, { tasks, existing = [], lanes = 20 } = {}) {
  // The workspace is the checkout, as `avoozl init` in a repository makes it.
  const { root, run } = specCheckout("avoozl-claims-"),
    checkout = root,
    dbPath = path.join(root, "workspace.sqlite");
  fs.writeFileSync(path.join(root, ".gitignore"), "*.sqlite*\n.avoozl/\n");
  run(["add", "."]);
  run(["commit", "-q", "-m", "Start"]);
  const head = run(["rev-parse", "HEAD"]);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, lanes: { local: lanes }, delivery: {} }),
  );
  const github = fakeGitHub(head, existing),
    open = () => {
      const store = new Store(dbPath);
      t.after(() => store.close());
      return {
        store,
        ops: new Operations(store, { workspaceRoot: root, github }),
      };
    },
    first = open();
  first.store.initialize({ ...snapshot(), tasks, edges: [] });
  first.store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    github: "acme/app",
    worktreeRoot: temporaryDirectory("avoozl-claims-wt-"),
  });
  return { ...first, open, github, head, dbPath, root };
}

const claim = (ops) => ops.execute("runner.next", { claim: true });

test("runner.next with claim creates avoozl/<spec>/<task> at the base head", async (t) => {
  const s = setup(t, { tasks: [leaf("a"), leaf("b")] });
  const result = await claim(s.ops);
  assert.equal(result.claimed.id, "a");
  assert.equal(result.claimed.branch, "avoozl/parser/a");
  assert.equal(result.claimed.base, "main");
  assert.equal(result.claimed.head, s.head);
  assert.equal(result.claimed.lease, "avoozl-lease/parser/a/1");
  assert.deepEqual(
    s.github.calls.filter((call) => call[0] === "create"),
    [
      ["create", "acme/app", "avoozl/parser/a", s.head],
      // Then generation 1 of its lease (workflow rule 15.1).
      ["create", "acme/app", "avoozl-lease/parser/a/1", s.head],
    ],
  );
  assert.equal(
    result.worktree?.branch,
    "avoozl/parser/a",
    result.worktreeError,
  );
  assert.equal(
    execFileSync(
      "git",
      ["-C", result.worktree.path, "branch", "--show-current"],
      { encoding: "utf8" },
    ).trim(),
    "avoozl/parser/a",
  );
  assert.match(result.brief, /a/);
  // The claimed task runs; the other is still ready.
  const next = await s.ops.execute("runner.next", {});
  assert.deepEqual(
    next.ready.map((item) => item.id),
    ["b"],
  );
  assert.deepEqual(
    next.running.map((item) => item.id),
    ["a"],
  );
});

// Workflow rule 15.5: a claim branch deleted outside Avoozl can leave its
// lease refs behind, and lease numbers never repeat.
test("a claim takes the generation above leftover lease refs", async (t) => {
  const s = setup(t, {
    tasks: [leaf("a")],
    existing: [
      "avoozl-lease/parser/a/1",
      "avoozl-lease/parser/a/3",
      "avoozl-lease/parser/ab/7",
    ],
  });
  const result = await claim(s.ops);
  assert.equal(result.claimed.lease, "avoozl-lease/parser/a/4");
});

test("a 422 from the create call takes the next ready task", async (t) => {
  const s = setup(t, { tasks: [leaf("a"), leaf("b"), leaf("c")] });
  // Another runner claims a between this runner's read and its create.
  const read = s.github.branchesUnder;
  s.github.branchesUnder = async (...args) => {
    const refs = await read(...args);
    s.github.refs.set("avoozl/parser/a", s.head);
    return refs;
  };
  const result = await claim(s.ops);
  assert.equal(result.claimed.id, "b");
  assert.equal(result.claimed.refusals, 1);
});

test("ten refusals end the call with every ready task is claimed", async (t) => {
  const ids = Array.from({ length: 12 }, (_, i) => `t${i + 1}`);
  const s = setup(t, { tasks: ids.map(leaf) });
  s.github.branchesUnder = async () => [];
  for (const id of ids) s.github.refs.set(`avoozl/parser/${id}`, s.head);
  await assert.rejects(claim(s.ops), /every ready task is claimed/);
  assert.equal(
    s.github.calls.filter((call) => call[0] === "create").length,
    10,
  );
});

test("a task with a claim branch on origin is not ready", async (t) => {
  const s = setup(t, {
    tasks: [leaf("a"), leaf("b")],
    existing: ["avoozl/parser/a", "avoozl/other-spec/b"],
  });
  const result = await claim(s.ops);
  // b's branch names another spec, so it does not hold this b.
  assert.equal(result.claimed.id, "b");
  const next = await s.ops.execute("runner.next", {});
  assert.deepEqual(next.ready, []);
  assert.deepEqual(
    next.running.map(({ id, phase, branch }) => [id, phase, branch]),
    [
      ["a", "claimed", "avoozl/parser/a"],
      ["b", "working", "avoozl/parser/b"],
    ],
  );
});

test("a rebuilt cache finds every claimed task from the claim branches alone", async (t) => {
  const s = setup(t, {
    tasks: [leaf("a"), leaf("b"), leaf("c")],
    existing: ["avoozl/parser/a", "avoozl/parser/c"],
  });
  // The cache was never told of them; rebuild reads the branches.
  assert.deepEqual(
    (await s.ops.execute("runner.next", {})).ready.map((item) => item.id),
    ["a", "b", "c"],
  );
  await s.ops.execute("workspace.rebuild", {}, undefined, { local: true });
  const next = await s.ops.execute("runner.next", {});
  assert.deepEqual(
    next.ready.map((item) => item.id),
    ["b"],
  );
  assert.deepEqual(
    next.running.map((item) => item.id),
    ["a", "c"],
  );
});

// Integration branches by name (sim-2.6, §D21).
test("a branch named for the spec, or for the outermost spec that links it, is the base", async (t) => {
  const s = setup(t, { tasks: [leaf("a")] });
  s.github.branches.set("parser", "p".repeat(40));
  let result = await claim(s.ops);
  assert.deepEqual(
    [result.claimed.base, result.claimed.head],
    ["parser", "p".repeat(40)],
  );
  // A spec that links parser has a branch of its own: the outermost wins.
  const t2 = setup(t, { tasks: [leaf("a")] });
  t2.store.put("plans", {
    id: "client",
    spec: "client",
    files: { "tasks.md": "- [ ] `c-1` Build [parser](../parser/tasks.md)\n" },
  });
  t2.github.branches.set("parser", "p".repeat(40));
  t2.github.branches.set("client", "c".repeat(40));
  result = await claim(t2.ops);
  assert.equal(result.claimed.base, "client");
  // Avoozl made no integration branch.
  assert.ok(
    !t2.github.calls.some(
      (call) => call[0] === "create" && !/^avoozl/.test(call[2]),
    ),
  );
});

test("a moved default branch is merged into the integration branch before a claim, and only then", async (t) => {
  const s = setup(t, { tasks: [leaf("a"), leaf("b")], lanes: 20 });
  s.github.branches.set("parser", "p".repeat(40));
  s.github.ahead = 2;
  const first = await claim(s.ops);
  // Parallel tasks claimed one after the other start on one merged head.
  const second = await claim(s.ops);
  assert.deepEqual(
    s.github.calls.filter((call) => call[0] === "merge"),
    [["merge", "acme/app", "parser", "main"]],
  );
  assert.equal(first.claimed.head, "m".repeat(40));
  assert.equal(second.claimed.head, first.claimed.head);
});

test("a conflict holds every claim on the branch and gives one Needs you item", async (t) => {
  const s = setup(t, { tasks: [leaf("a"), leaf("b")] });
  s.github.branches.set("parser", "p".repeat(40));
  s.github.ahead = 1;
  s.github.conflict = true;
  await assert.rejects(claim(s.ops), /integration branch could not take/);
  assert.ok(!s.github.calls.some((call) => call[0] === "create"));
  const rows = integrationNeedsYou(s.store);
  assert.equal(rows.length, 1);
  assert.match(rows[0].title, /parser has a conflict with main/);
  assert.match(rows[0].detail, /src\/a\.js/);
  // Once the merge goes in, claims go on and the row clears.
  s.github.conflict = false;
  assert.equal((await claim(s.ops)).claimed.base, "parser");
  assert.deepEqual(integrationNeedsYou(s.store), []);
});

// Label filters (simplify sim-1.6, §D5): the spec issue of spec `parser` is
// #7 in acme/app; `labels` are on it, each added by `by` (login -> role).
function labeled(s, labels, roles = { mona: "write" }, by = "mona") {
  s.store.put("receipts", {
    id: "github-parent:plan:parser",
    kind: "github-parent",
    level: "plan",
    repository: "acme/app",
    number: 7,
  });
  s.store.put("plans", { id: "parser", spec: "parser", state: "approved" });
  Object.assign(s.github, {
    issue: async () => ({
      number: 7,
      labels: labels.map((name) => ({ name })),
    }),
    issueEvents: async () =>
      labels.map((name) => ({
        event: "labeled",
        label: { name },
        actor: { login: by },
      })),
    permission: async (_repository, login) => ({
      permission: roles[login] ?? "none",
    }),
  });
}
const filtered = (s, labels) =>
  s.store.put("repositories", {
    ...s.store.get("repositories", "app"),
    labels,
  });
const readyIds = async (s) =>
  (await s.ops.execute("runner.next", {})).ready.map((item) => item.id);

test("labels.require and labels.exclude load from repository settings onto the repository", async (t) => {
  const s = setup(t, { tasks: [leaf("a")] }),
    file = path.join(s.root, ".avoozl.json"),
    write = (labels) =>
      fs.writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          repositories: { app: { root: ".", labels } },
        }),
      ),
    settings = new RepositorySettings(s.store, { workspaceRoot: s.root });
  write({ require: ["agent-ok"], exclude: ["needs-design"] });
  assert.equal(settings.reload().repository.error, null);
  assert.deepEqual(s.store.get("repositories", "app").labels, {
    require: ["agent-ok"],
    exclude: ["needs-design"],
  });
  write({ require: "agent-ok" });
  assert.match(settings.reload().repository.error.message, /labels\.require/);
});

test("a spec runs only when its spec issue carries every require label, each a writer's, and no exclude label", async (t) => {
  const s = setup(t, { tasks: [leaf("a")] });
  filtered(s, { require: ["agent-ok"], exclude: ["needs-design"] });
  // No spec issue yet: held.
  assert.deepEqual(await readyIds(s), []);
  const store = s.store,
    { readLabelFilters } = await import("../../specs/label-filters.mjs");
  labeled(s, ["agent-ok"]);
  await readLabelFilters(store, s.github);
  assert.deepEqual(await readyIds(s), ["a"]);
  // An exclude label holds it; so does a require label a non-writer added.
  labeled(s, ["agent-ok", "needs-design"]);
  await readLabelFilters(store, s.github);
  assert.deepEqual(await readyIds(s), []);
  const waiting = (await s.ops.execute("runner.next", {})).waiting[0];
  assert.equal(waiting.reason, "label filter: it carries needs-design");
  labeled(s, ["agent-ok"], { stranger: "read" }, "stranger");
  await readLabelFilters(store, s.github);
  assert.equal(
    (await s.ops.execute("runner.next", {})).waiting[0].reason,
    "label filter: agent-ok was not added by a writer",
  );
});

test("a writer's stop label on the spec issue, or on a parent spec's, stops the spec until a writer removes it", async (t) => {
  const s = setup(t, { tasks: [leaf("a")] }),
    { readLabelFilters } = await import("../../specs/label-filters.mjs");
  labeled(s, ["avoozl:stopped"]);
  await readLabelFilters(s.store, s.github);
  assert.deepEqual(await readyIds(s), []);
  assert.match(
    (await s.ops.execute("runner.next", {})).waiting[0].reason,
    /^stopped: /,
  );
  // A stop label someone without write access added stops nothing.
  labeled(s, ["avoozl:stopped"], { stranger: "read" }, "stranger");
  await readLabelFilters(s.store, s.github);
  assert.deepEqual(await readyIds(s), ["a"]);
  // A parent spec's stop label stops the spec it links.
  s.store.put("plans", {
    id: "parser",
    spec: "parser",
    state: "approved",
    files: { "tasks.md": "- [ ] `a` Task a\n  - Works\n" },
  });
  s.store.put("plans", {
    id: "client-v2",
    spec: "client-v2",
    state: "approved",
    files: {
      "tasks.md": "- [ ] `v2-p` Build [parser](../parser/tasks.md)\n",
    },
  });
  s.store.put("receipts", {
    id: "github-parent:plan:client-v2",
    kind: "github-parent",
    level: "plan",
    repository: "acme/app",
    number: 8,
  });
  const on = { 7: [], 8: ["avoozl:stopped"] };
  Object.assign(s.github, {
    issue: async (_repository, number) => ({
      number,
      labels: on[number].map((name) => ({ name })),
    }),
    issueEvents: async (_repository, number) =>
      on[number].map((name) => ({
        event: "labeled",
        label: { name },
        actor: { login: "mona" },
      })),
    permission: async () => ({ permission: "write" }),
  });
  await readLabelFilters(s.store, s.github);
  assert.deepEqual(await readyIds(s), []);
});

test("an exclude label added after the claim does not unclaim the task", async (t) => {
  const s = setup(t, { tasks: [leaf("a"), leaf("b")] });
  filtered(s, { require: [], exclude: ["needs-design"] });
  labeled(s, []);
  assert.equal((await claim(s.ops)).claimed.id, "a");
  labeled(s, ["needs-design"]);
  const { readLabelFilters } = await import("../../specs/label-filters.mjs");
  await readLabelFilters(s.store, s.github);
  const next = await s.ops.execute("runner.next", {});
  assert.deepEqual(
    next.running.map((item) => item.id),
    ["a"],
    "the claimed task keeps running",
  );
  assert.deepEqual(next.ready, [], "b is held by the label");
  assert.ok(s.github.refs.has("avoozl/parser/a"), "its claim branch stays");
});

// Labeled issues (simplify sim-1.7, rule 11): acme/app's issues, each with
// its labels, who labeled it, and who it is assigned to.
function issues(s, list, roles = { mona: "write", stranger: "read" }) {
  Object.assign(s.github, {
    currentUser: async () => ({ login: "mona" }),
    listIssues: async () =>
      list.map(({ by, ...issue }) => ({
        state: "open",
        labels: [{ name: "agent-ok" }],
        assignees: [{ login: "mona" }],
        ...issue,
      })),
    issueEvents: async (_repository, number) => [
      {
        event: "labeled",
        label: { name: "agent-ok" },
        actor: { login: list.find((i) => i.number === number)?.by ?? "mona" },
      },
    ],
    permission: async (_repository, login) => ({
      permission: roles[login] ?? "none",
    }),
  });
}

test("an open issue with a writer's require label becomes task issue-<n> and claims avoozl/issue-<n>/issue-<n>", async (t) => {
  const s = setup(t, { tasks: [] });
  filtered(s, { require: ["agent-ok"] });
  issues(s, [
    {
      number: 12,
      title: "Fix the crash",
      body: "Empty input no longer crashes.",
    },
    { number: 13, title: "A stranger's label", body: "x", by: "stranger" },
    { number: 14, title: "Someone else's", body: "x", assignees: [] },
    { number: 15, title: "A spec issue", body: "<!-- avoozl-spec:parser -->" },
    { number: 16, title: "A pull request", body: "x", pull_request: {} },
  ]);
  const result = await claim(s.ops);
  assert.equal(result.claimed.id, "issue-12");
  assert.equal(result.claimed.branch, "avoozl/issue-12/issue-12");
  const task = s.store.read().tasks.find((x) => x.id === "issue-12");
  assert.equal(task.title, "Fix the crash");
  assert.deepEqual(task.acceptance, ["Empty input no longer crashes."]);
  assert.deepEqual(
    s.store
      .read()
      .tasks.filter((x) => x.labeledIssue)
      .map((x) => x.id),
    ["issue-12"],
  );
  // The issue closing is its landing record: the next read marks it done.
  issues(s, [
    { number: 12, title: "Fix the crash", body: "x", state: "closed" },
  ]);
  const { readLabeledIssues } = await import("../../specs/labeled-issues.mjs");
  await readLabeledIssues(s.store, s.github);
  const { statusComplete } = await import("../../../model.mjs"),
    data = s.store.read();
  assert.ok(
    statusComplete(data, data.tasks.find((x) => x.id === "issue-12").status),
  );
});
