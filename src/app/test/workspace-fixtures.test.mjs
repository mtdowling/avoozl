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
  assert.deepEqual(store.list("github_issues"), []);
});

test("GitHub fixture workspaces link every task to a cached issue", (t) => {
  const { store } = workspaceFixture(t, "github"),
    data = store.read(),
    issues = store.list("github_issues"),
    [repository] = store.list("github_repositories");
  assert.equal(repository.id, "example/fixture");
  assert.equal(repository.private, true);
  assert.equal(data.tasks.length, 2);
  for (const task of data.tasks) {
    const issue = issues.find((entry) => entry.taskId === task.id);
    assert.equal(task.github.repository, repository.id);
    assert.equal(task.github.number, issue.number);
    assert.equal(task.github.issueId, issue.issueId);
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
  assert.equal(store.list("github_issues").length, githubIds.length);
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
