import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";

// Any GitHub call counts and fails: the Graph's drafts are read from disk.
function noGitHub() {
  const calls = [];
  const client = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "then"
          ? undefined
          : (...args) => {
              calls.push(String(key));
              throw Error(`GitHub call ${String(key)} in a test`);
            },
    },
  );
  return { calls, client };
}

test("graph.view shows draft spec tasks as drafts that never become ready", async (t) => {
  const { root, store } = fixture(t);
  const github = noGitHub(),
    ops = new Operations(store, { workspaceRoot: root, github: github.client });
  // One approved spec, one draft spec, one stored but not approved, and an
  // old folder with no task list.
  writeSpec(root, "live");
  const live = await ops.execute("plan.create", { spec: "live" });
  const preview = await ops.execute("plan.preview", { id: "live" });
  await ops.execute("plan.approve", {
    id: "live",
    expectedHash: live.hash,
    expectedRevision: preview.expectedRevision,
  });
  writeSpec(root, "config");
  writeSpec(root, "stored");
  await ops.execute("plan.create", { spec: "stored" });
  writeSpec(root, "old", { "tasks.md": null, "avoozl/manifest.json": null });
  const before = github.calls.length;

  const graph = await ops.execute("graph.view", {});
  assert.deepEqual(github.calls.slice(before), [], "no GitHub calls");
  assert.ok(graph.tasks.some((task) => task.id === "live.1.1"));
  assert.ok(
    graph.tasks.every((task) => task.state !== "draft"),
    "drafts stay out of tasks",
  );
  const drafts = new Map(graph.drafts.tasks.map((task) => [task.id, task]));
  assert.deepEqual([...drafts.keys()].sort(), [
    "config.1",
    "config.1.1",
    "config.1.2",
    "stored.1",
    "stored.1.1",
    "stored.1.2",
  ]);
  for (const task of drafts.values()) {
    assert.equal(task.state, "draft");
    assert.equal(task.ready, false);
    assert.equal(task.complete, false);
  }
  assert.deepEqual(drafts.get("config.1.1").draft, {
    spec: "config",
    status: "not stored",
  });
  assert.equal(drafts.get("stored.1.1").draft.status, "draft");
  assert.deepEqual(
    graph.drafts.specs.map((spec) => [spec.name, spec.count]).sort(),
    [
      ["config", 3],
      ["stored", 3],
    ],
  );
  assert.ok(
    graph.drafts.edges.some(
      (edge) =>
        edge.from === "config.1.1" &&
        edge.to === "config.1.2" &&
        edge.blocking &&
        !edge.satisfied,
    ),
  );

  // Never stored, queued or released by being shown.
  const ids = [...drafts.keys()],
    data = store.read();
  assert.ok(data.tasks.every((task) => !ids.includes(task.id)));
  const queue = await ops.execute("queue", {});
  assert.ok(
    JSON.stringify(queue).indexOf("config.1") === -1,
    "no draft task in the queue",
  );
  assert.deepEqual(github.calls.slice(before), [], "no GitHub calls");

  // A scope narrows drafts too.
  const scoped = await ops.execute("graph.view", { spec: "config" });
  assert.ok(scoped.drafts.tasks.every((task) => task.spec === "config"));
});
