// Claim branches (simplify sim-1.1, §D3): `runner.next` with `claim` makes
// `avoozl/<spec>/<task>` on origin through the refs create call, and the
// branches alone say which tasks are claimed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { Store } from "../../store/store.mjs";
import { snapshot } from "../../test/fixtures.mjs";
import { specCheckout } from "../../test/spec-checkout.mjs";

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
    async branch(repository, name) {
      calls.push(["branch", repository, name]);
      return { name, commit: { sha: head } };
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
  assert.deepEqual(
    s.github.calls.filter((call) => call[0] === "create"),
    [["create", "acme/app", "avoozl/parser/a", s.head]],
  );
  assert.equal(result.worktree.branch, "avoozl/parser/a");
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
