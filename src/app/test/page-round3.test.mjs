// Round 3 of the app page: the plan and repository filters, Start now, the
// tick log, Recent activity and the "Ask in a chat" seed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { principalAllows } from "../app-backend.mjs";
import { classifyOperation } from "../operation-kinds.mjs";
import { readyLeaves } from "../delivery.mjs";
import { specOf } from "../page-views.mjs";
import { tickLogEntry } from "../tick.mjs";
import { fixture, snapshot } from "./fixtures.mjs";

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

function workspace(
  t,
  { delivery = { concurrency: 1 }, tasks, edges = [] } = {},
) {
  const { root, store } = fixture(t),
    data = snapshot(),
    checkout = path.join(root, "checkout");
  fs.mkdirSync(checkout, { recursive: true });
  data.tasks = tasks ?? [
    leaf("a", { projectId: "app" }),
    leaf("b", { projectId: "app", rank: 1 }),
    leaf("c", { projectId: "app" }),
    leaf("d", { projectId: "app" }),
    leaf("loose"),
  ];
  data.edges = edges;
  store.importSnapshot(data);
  store.put("projects", { id: "app", name: "app", root: checkout });
  if (delivery)
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, delivery }),
    );
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

test("a task's spec folder comes from its document epic or a source reference", () => {
  assert.equal(
    specOf({ epic: "doc:.kiro/specs/compression/design.md" }),
    "compression",
  );
  assert.equal(
    specOf({
      epic: "x",
      source: { document: ".kiro/specs/ci/tasks.md", key: "1" },
    }),
    "ci",
  );
  assert.equal(specOf({ epic: "doc:done/old.md" }), null);
});

test("graph.view names each task's spec and its place in the dispatch order", async (t) => {
  const { store, ops } = workspace(t, {
    edges: [{ id: "a:requires:c", from: "a", to: "c", kind: "requires" }],
  });
  const graph = await ops.execute("graph.view", {});
  const ready = graph.tasks.filter(
    (task) => task.ready && task.kind === "leaf",
  );
  const pageOrder = [...ready]
    .sort((x, y) => x.order - y.order)
    .map((task) => task.id);
  const tickOrder = readyLeaves(
    store,
    { concurrency: 32, repositories: {} },
    {},
  ).map((leaf) => leaf.task.id);
  // The tick starts only tasks with a checkout; the page lists every ready
  // leaf. Where both list a task, the order is the same.
  assert.deepEqual(
    pageOrder.filter((id) => tickOrder.includes(id)),
    tickOrder,
  );
  assert.equal(tickOrder[0], "b", "rank (a priority label) goes first");
});

test("task.start puts a ready task first in line, or says the workspace is full", async (t) => {
  const { store, ops } = workspace(t);
  const first = await ops.execute("task.start", { taskId: "d" });
  assert.equal(first.full, false);
  assert.match(first.message, /next tick/);
  assert.equal(
    readyLeaves(store, { concurrency: 1, repositories: {} }, {})[0].task.id,
    "d",
  );
  await ops.execute("session.bind", {
    taskId: "d",
    slot: "slot-d-1",
    attempt: 1,
    source: "tick",
  });
  await ops.execute("session.status", { slot: "slot-d-1", status: "working" });
  const full = await ops.execute("task.start", { taskId: "c" });
  assert.equal(full.full, true);
  assert.match(full.message, /All slots are busy/);
  await assert.rejects(
    ops.execute("task.start", { taskId: "d" }),
    /already running/,
  );
  await assert.rejects(
    ops.execute("task.start", { taskId: "loose" }),
    /no repository/,
  );
});

test("task.start refuses when delivery is off, and only the owner may call it", async (t) => {
  const { ops } = workspace(t, { delivery: null });
  await assert.rejects(
    ops.execute("task.start", { taskId: "a" }),
    /Delivery is off/,
  );
  assert.equal(classifyOperation("task.start"), "protect");
  assert.equal(principalAllows({ kind: "owner-session" }, "task.start"), true);
  assert.equal(principalAllows({ kind: "app-token" }, "task.start"), false);
  for (const name of ["workspace.tick.log", "activity.recent", "chat.context"])
    assert.equal(principalAllows({ kind: "app-token" }, name), true, name);
});

test("tick log lines carry a time and a level, newest first", async (t) => {
  const { ops } = workspace(t);
  await ops.execute("workspace.tick", {});
  await ops.execute("workspace.tick", {});
  const log = await ops.execute("workspace.tick.log", { limit: 1 });
  assert.equal(log.items.length, 1);
  assert.equal(log.items[0].level, "info");
  assert.ok(log.items[0].at);
  const all = await ops.execute("workspace.tick.log", {});
  assert.equal(all.items.length, 2);
  assert.ok(all.items[0].at >= all.items[1].at);
  assert.equal(tickLogEntry({ outcome: "locked" }).level, "warn");
  assert.equal(
    tickLogEntry({ outcome: "error", error: "boom" }).text,
    "Failed: boom",
  );
});

test("activity.recent lists task events newest first", async (t) => {
  const { ops } = workspace(t);
  await ops.execute("session.bind", { taskId: "a", slot: "slot-a-1" });
  await ops.execute("session.status", { slot: "slot-a-1", status: "working" });
  const { items } = await ops.execute("activity.recent", { limit: 3 });
  assert.ok(items.length >= 1 && items.length <= 3);
  assert.ok(items.every((item, i) => i === 0 || items[i - 1].at >= item.at));
  assert.ok(
    items.some(
      (item) => item.taskId === "a" && /worker attempt 1/.test(item.text),
    ),
  );
});

test("chat.context seeds a chat with the item, its task, plan and history, and writes nothing", async (t) => {
  const { store, ops } = workspace(t, {
    tasks: [leaf("x", { decision: "Pick a format", projectId: "app" })],
  });
  const before = store.read().revision;
  const { message } = await ops.execute("chat.context", {
    items: [{ kind: "decision", taskId: "x" }],
  });
  assert.match(message, /Open decision|Why: Pick a format/);
  assert.match(message, /Task x \(x\)/);
  assert.match(message, /History/);
  assert.match(message, /Do not change anything/);
  const gone = await ops.execute("chat.context", {
    items: [{ kind: "decision", taskId: "nope" }],
  });
  assert.match(gone.message, /no longer open/);
  assert.equal(store.read().revision, before);
});

test("highlight.languages reads grammar files inside the workspace only", async (t) => {
  const { root, ops } = workspace(t);
  fs.mkdirSync(path.join(root, "grammars"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "grammars", "nupp.json"),
    JSON.stringify({
      tokens: [{ type: "keyword", pattern: "\\b(?:fn|let)\\b" }],
    }),
  );
  fs.writeFileSync(
    path.join(root, "grammars", "bad.json"),
    JSON.stringify({ tokens: [{ type: "x", pattern: "(" }] }),
  );
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      highlight: {
        languages: {
          nupp: "grammars/nupp.json",
          bad: "grammars/bad.json",
          out: "../etc/passwd",
          gone: "grammars/none.json",
        },
      },
    }),
  );
  const result = await ops.execute("highlight.languages", {});
  assert.deepEqual(Object.keys(result.languages), ["nupp"]);
  assert.equal(result.languages.nupp.tokens[0].type, "keyword");
  assert.equal(result.problems.length, 3);
  assert.ok(result.problems.some((p) => /bad/.test(p)));
  assert.ok(
    result.problems.some((p) =>
      /out .*inside the workspace|out names a missing file/.test(p),
    ),
  );
});
