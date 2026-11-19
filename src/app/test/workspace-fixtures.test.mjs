import assert from "node:assert/strict";
import test from "node:test";
import { workspaceFixture, workspaceShapes } from "./fixtures.mjs";

test("local fixture workspaces hold only local tasks", (t) => {
  const { store, root } = workspaceFixture(t, "local"),
    data = store.read();
  assert.ok(root);
  assert.deepEqual(
    data.tasks.map((task) => task.id),
    ["local-a", "local-b"],
  );
  assert.ok(data.tasks.every((task) => !task.github));
  assert.deepEqual(
    data.edges.map((edge) => [edge.from, edge.to]),
    [["local-a", "local-b"]],
  );
  assert.deepEqual(store.list("github_repositories"), []);
});

test("GitHub fixture workspaces link every task to an issue", (t) => {
  const { store } = workspaceFixture(t, "github"),
    data = store.read(),
    [repository] = store.list("github_repositories");
  assert.equal(repository.id, "example/fixture");
  assert.equal(repository.private, true);
  assert.equal(data.tasks.length, 2);
  for (const task of data.tasks) {
    assert.equal(task.github.repository, repository.id);
    assert.ok(Number.isInteger(task.github.number));
    assert.ok(task.github.issueId);
    assert.match(task.github.url, /^https:\/\/example\.test\//);
  }
  assert.deepEqual(
    data.edges.map((edge) => [edge.from, edge.to]),
    [["github-a", "github-b"]],
  );
});

test("mixed fixture workspaces join local and GitHub tasks", (t) => {
  const { store, localIds, githubIds } = workspaceFixture(t, "mixed"),
    data = store.read();
  assert.deepEqual(
    data.tasks.map((task) => task.id),
    [...localIds, ...githubIds],
  );
  assert.deepEqual(
    data.tasks.filter((task) => task.github).map((task) => task.id),
    githubIds,
  );
  assert.ok(
    data.edges.some(
      (edge) => edge.from === "local-b" && edge.to === "github-a",
    ),
  );
});

test("fixture workspaces are isolated and reject unknown shapes", (t) => {
  const roots = workspaceShapes.map((shape) => workspaceFixture(t, shape).root);
  assert.equal(new Set(roots).size, workspaceShapes.length);
  assert.throws(() => workspaceFixture(t, "remote"), /Unknown workspace/);
});
