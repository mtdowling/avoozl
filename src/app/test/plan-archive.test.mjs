// Archiving a plan holds its open tasks, opens decisions on tasks outside
// it that wait on them, and unarchive puts back exactly what was there.
// Only a person archives, and nothing is deleted.
import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { queryTasks } from "../../model.mjs";
import { fixture } from "./fixtures.mjs";

const task = (id, extra = {}) => ({
  id,
  title: id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Done."],
  checks: ["true"],
  ...extra,
});

function setup(t) {
  const { root, store } = fixture(t);
  store.mutate("seed", (data) => {
    data.tasks.push(
      task("p.1", { planId: "a1" }),
      task("p.2", { planId: "a1", status: "accepted" }),
      task("p.3", { planId: "a1", status: "deferred" }),
      task("outside"),
      task("decided", { decision: "Someone else's question." }),
    );
    data.edges.push(
      { from: "p.1", to: "outside", kind: "requires" },
      { from: "p.1", to: "decided", kind: "requires" },
    );
  });
  store.transaction(() =>
    store.put("plans", {
      id: "a1",
      title: "Shared",
      state: "approved",
      mapping: { x: "p.1" },
      history: [{ revision: 1, hash: "h1" }],
    }),
  );
  return {
    store,
    ops: new Operations(store, { workspaceRoot: root, operator: "Owner" }),
  };
}

const ready = (store) =>
  new Set(
    queryTasks(store.read(), { scope: "all", q: "ready:true" }).map((t) => t.id),
  );

test("archive holds open tasks, opens decisions, and unarchive restores", async (t) => {
  const { store, ops } = setup(t);
  assert.ok(ready(store).has("p.1"));
  const result = await ops.execute("plan.archive", { id: "a1" });
  assert.deepEqual([result.held, result.decisions], [2, 1]);
  const plan = store.get("plans", "a1");
  assert.equal(plan.archivedBy, "Owner");
  assert.ok(plan.archivedAt);
  assert.equal(plan.deletedAt, undefined, "nothing is deleted");
  assert.equal(ready(store).has("p.1"), false, "no new dispatch");
  const byId = (id) => store.read().tasks.find((x) => x.id === id);
  assert.equal(byId("p.1").archivedAt, undefined, "task rows are not archived");
  assert.match(byId("outside").decision, /archived plan Shared/);
  assert.equal(byId("decided").decision, "Someone else's question.");
  await assert.rejects(
    ops.execute("plan.archive", { id: "a1" }),
    /already archived/,
  );
  // The Graph marks the plan's tasks and draws held ones as deferred.
  const graph = await ops.execute("graph.view", {});
  const node = graph.tasks.find((x) => x.id === "p.1");
  assert.equal(node.planArchived, "a1");
  assert.equal(node.state, "deferred");
  assert.equal(graph.tasks.find((x) => x.id === "outside").planArchived, null);
  const table = await ops.execute("plan.table", {});
  const row = table.items.find((x) => x.planId === "a1");
  assert.equal(row.archived.by, "Owner");
  assert.equal(row.timeline[0].action, "archived");

  const back = await ops.execute("plan.unarchive", { id: "a1" });
  assert.deepEqual([back.released, back.decisions], [2, 1]);
  assert.ok(ready(store).has("p.1"));
  assert.equal(byId("outside").decision, undefined);
  assert.equal(byId("decided").decision, "Someone else's question.");
  assert.equal(byId("p.3").status, "deferred", "a hand defer stays");
  const after = store.get("plans", "a1");
  assert.equal(after.archivedAt, undefined);
  assert.deepEqual(after.history, [{ revision: 1, hash: "h1" }], "revision history untouched");
  assert.deepEqual(
    after.events.map((h) => [h.action, h.by]),
    [
      ["archived", "Owner"],
      ["unarchived", "Owner"],
    ],
  );
});

test("a session may archive a plan and is recorded as itself", async (t) => {
  const { store, ops } = setup(t);
  await ops.execute("plan.archive", { id: "a1" }, undefined, {
    caller: { sessionKey: "dashboard:s1" },
  });
  await ops.execute("plan.unarchive", { id: "a1" }, undefined, { mcp: true });
  assert.deepEqual(
    store.get("plans", "a1").events.map((h) => [h.action, h.by]),
    [
      ["archived", "session:dashboard:s1"],
      ["unarchived", "session:mcp"],
    ],
  );
});

test("unarchive keeps a decision changed after the archive", async (t) => {
  const { store, ops } = setup(t);
  await ops.execute("plan.archive", { id: "a1" });
  store.mutate("owner edit", (data) => {
    data.tasks.find((x) => x.id === "outside").decision = "Owner's own note.";
  });
  await ops.execute("plan.unarchive", { id: "a1" });
  assert.equal(
    store.read().tasks.find((x) => x.id === "outside").decision,
    "Owner's own note.",
  );
});

test("an archived plan cannot be approved", async (t) => {
  const { ops } = setup(t);
  await ops.execute("plan.archive", { id: "a1" });
  await assert.rejects(
    ops.execute("plan.approve", { id: "a1", expectedHash: "x" }),
    /archived/,
  );
});
