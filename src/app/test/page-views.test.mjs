import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { principalAllows } from "../app-backend.mjs";
import { classifyOperation } from "../operation-kinds.mjs";
import { Store } from "../store.mjs";
import { fixture, snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: [id + " is observable."],
  ...extra,
});

// One epic, a chain a -> b -> c, a decision, a blocked task, a GitHub row.
function graphSnapshot() {
  const data = snapshot();
  data.epics.push({ id: "other", title: "Other", scope: "catalog" });
  data.tasks = [
    leaf("root", { kind: "epic", title: "Sample epic" }),
    leaf("a", { status: "accepted" }),
    leaf("b"),
    leaf("c"),
    leaf("d", { decision: "choose-format" }),
    leaf("e", { status: "blocked" }),
    leaf("g", {
      epic: "other",
      github: { number: 5, url: "https://github.com/example/fixture/issues/5" },
    }),
  ];
  data.edges = [
    { id: "a:requires:b", from: "a", to: "b", kind: "requires" },
    { id: "b:requires:c", from: "b", to: "c", kind: "requires" },
    { id: "a:supports:g", from: "a", to: "g", kind: "supports" },
  ];
  return data;
}

function graphFixture(t) {
  const { store } = fixture(t);
  store.importSnapshot(graphSnapshot());
  return { store, ops: new Operations(store, {}) };
}

const rows = (store) =>
  store.db.prepare("SELECT kind,id,body FROM entities ORDER BY kind,id").all();

test("graph view shows kind, authority, status, blocking edges and ready leaves", async (t) => {
  const { store, ops } = graphFixture(t);
  const before = rows(store);
  const graph = await ops.execute("graph.view", {});
  const byId = Object.fromEntries(graph.tasks.map((task) => [task.id, task]));
  assert.equal(graph.total, 7);
  assert.equal(byId.root.kind, "epic");
  assert.equal(byId.g.authority, "github");
  assert.equal(byId.g.issue.number, 5);
  assert.equal(byId.b.authority, "local");
  assert.equal(byId.a.complete, true);
  // b's prerequisite is accepted; c waits on b; d has an open decision.
  assert.deepEqual(
    graph.tasks.filter((task) => task.ready).map((task) => task.id),
    ["b", "g"],
  );
  assert.equal(byId.d.decision, "choose-format");
  assert.deepEqual(
    Object.fromEntries(graph.tasks.map((task) => [task.id, task.state])),
    {
      root: "waiting",
      a: "done",
      b: "ready",
      c: "waiting",
      d: "needs-you",
      e: "needs-you",
      g: "ready",
    },
  );
  const edge = (from, to) =>
    graph.edges.find((item) => item.from === from && item.to === to);
  assert.deepEqual(
    [edge("a", "b").blocking, edge("a", "b").satisfied],
    [true, true],
  );
  assert.deepEqual(
    [edge("b", "c").blocking, edge("b", "c").satisfied],
    [true, false],
  );
  assert.equal(edge("a", "g").blocking, false);
  assert.deepEqual(
    graph.epics.map((epic) => [epic.id, epic.count]),
    [
      ["sample", 6],
      ["other", 1],
    ],
  );
  assert.deepEqual(rows(store), before);
});

test("graph view filters by epic and status and keeps edges inside the set", async (t) => {
  const { ops } = graphFixture(t);
  const other = await ops.execute("graph.view", { epic: "other" });
  assert.deepEqual(
    other.tasks.map((task) => task.id),
    ["g"],
  );
  assert.deepEqual(other.edges, []);
  const planned = await ops.execute("graph.view", {
    epic: ["sample", "other"],
    status: "planned",
  });
  assert.deepEqual(planned.tasks.map((task) => task.id).sort(), [
    "b",
    "c",
    "d",
    "g",
    "root",
  ]);
  assert.deepEqual(
    planned.edges.map((item) => item.id ?? `${item.from}>${item.to}`),
    ["b>c"],
  );
});

test("delivery view lists leaves with sessions and evidence", async (t) => {
  const { store, ops } = graphFixture(t);
  await ops.execute("session.bind", { taskId: "b", slot: "slot-b-1" });
  await ops.execute("session.status", { slot: "slot-b-1", status: "working" });
  await ops.execute("task.update", {
    id: "a",
    evidence: ["https://example.com/run/1"],
  });
  const before = rows(store);
  const items = await ops.execute("delivery.view", {});
  const byId = Object.fromEntries(items.items.map((item) => [item.id, item]));
  assert.deepEqual(Object.keys(byId).sort(), ["a", "b"]);
  assert.deepEqual(
    byId.b.sessions.map((session) => [
      session.slot,
      session.role,
      session.attempt,
      session.status,
    ]),
    [["slot-b-1", "worker", 1, "working"]],
  );
  assert.deepEqual(byId.a.evidence, [{ text: "https://example.com/run/1" }]);
  assert.deepEqual(rows(store), before);
});

test("conflicts view lists decisions, blocked tasks and ended sessions", async (t) => {
  const { ops } = graphFixture(t);
  await ops.execute("session.bind", { taskId: "c", slot: "slot-c-1" });
  await ops.execute("session.status", { slot: "slot-c-1", status: "lost" });
  const { items } = await ops.execute("conflicts.view", {});
  assert.deepEqual(
    items.map((item) => [item.kind, item.taskId]),
    [
      ["decision", "d"],
      ["needs-human", "e"],
      ["stale-session", "c"],
    ],
  );
});

// R28.5: every view that lists a task says who owns it.
test("delivery and conflicts views show local or the issue link", async (t) => {
  const { store, ops } = graphFixture(t);
  store.mutate("Put g in delivery with a decision", (data) => {
    const g = data.tasks.find((task) => task.id === "g");
    g.status = "review";
    g.decision = "pick-one";
  });
  await ops.execute("session.bind", { taskId: "b", slot: "slot-b-1" });
  const delivery = Object.fromEntries(
    (await ops.execute("delivery.view", {})).items.map((item) => [
      item.id,
      [item.authority, item.issue?.number ?? null],
    ]),
  );
  assert.deepEqual(delivery, { b: ["local", null], g: ["github", 5] });
  const conflicts = (await ops.execute("conflicts.view", {})).items.map(
    (item) => [item.taskId, item.authority, item.issue?.number ?? null],
  );
  assert.deepEqual(conflicts, [
    ["d", "local", null],
    ["e", "local", null],
    ["g", "github", 5],
  ]);
});

test("views read an older read-only database that lacks newer tables", async (t) => {
  const root = temporaryDirectory(),
    dbPath = path.join(root, "workspace.sqlite");
  const older = new Store(dbPath);
  older.importSnapshot(graphSnapshot());
  older.db.exec("DROP TABLE session_bindings");
  older.close();
  fs.chmodSync(dbPath, 0o444);
  const before = fs.readFileSync(dbPath);
  const store = new Store(dbPath);
  t.after(() => store.close());
  assert.equal(store.readOnly, true);
  const ops = new Operations(store, {});
  assert.equal((await ops.execute("graph.view", {})).tasks.length, 7);
  assert.deepEqual((await ops.execute("delivery.view", {})).items, []);
  assert.deepEqual(
    (await ops.execute("conflicts.view", {})).items.map((item) => item.kind),
    ["decision", "needs-human"],
  );
  assert.ok(fs.readFileSync(dbPath).equals(before));
});

test("the views are observe operations any app principal may read", () => {
  for (const operation of ["graph.view", "delivery.view", "conflicts.view"]) {
    assert.equal(classifyOperation(operation), "observe");
    for (const kind of ["owner-session", "app-token", "agent-tool"])
      assert.equal(principalAllows({ kind }, operation), true);
    assert.equal(principalAllows({ kind: "none" }, operation), false);
  }
});

test("the page's resolution actions are the owner's alone", () => {
  for (const operation of [
    "github.conflict.resolve",
    "delivery.retry",
    "task.update",
  ]) {
    assert.equal(principalAllows({ kind: "owner-session" }, operation), true);
    for (const kind of ["app-token", "agent-tool", "none"])
      assert.equal(principalAllows({ kind }, operation), false, kind);
  }
});
