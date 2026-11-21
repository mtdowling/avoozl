// Round 3 of the app page: the plan and repository filters, Start now, the
// tick log, Recent activity and the "Ask in a chat" seed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { Edge, Task } from "../../types.ts";
import type { StoredSnapshot } from "../store/store.ts";
import { Operations } from "../api/operations.ts";
import { principalAllows } from "../executors/kirocrew/app-backend.ts";
import { classifyOperation } from "../api/operation-table.ts";
import { readyLeaves } from "../delivery/delivery.ts";
import { specOf } from "../api/page-views.ts";
import { tickLogEntry } from "../tick/tick.ts";
import { fixture, snapshot } from "./fixtures.ts";
import type { GraphView } from "./view-shapes.ts";

const leaf = (id: string, extra: Record<string, unknown> = {}): Task => ({
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

// What these operations answer, for the fields read here.
interface Started {
  full: boolean;
  message: string;
}
interface Items<T> {
  items: T[];
}
interface Line {
  at: string;
  level: string;
  taskId?: string;
  text?: string;
}

function workspace(
  t: TestContext,
  {
    delivery = {},
    tasks,
    edges = [],
  }: {
    delivery?: Record<string, unknown> | null;
    tasks?: Task[];
    edges?: Edge[];
  } = {},
) {
  const { root, store } = fixture(t),
    data: StoredSnapshot = snapshot(),
    checkout = path.join(root, "checkout");
  fs.mkdirSync(checkout, { recursive: true });
  data.tasks = tasks ?? [
    leaf("a", { repositoryId: "app" }),
    leaf("b", { repositoryId: "app", rank: 1 }),
    leaf("c", { repositoryId: "app" }),
    leaf("d", { repositoryId: "app" }),
    leaf("loose"),
  ];
  data.edges = edges;
  store.initialize(data);
  store.put("repositories", { id: "app", name: "app", root: checkout });
  if (delivery)
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, lanes: { local: 1 }, delivery }),
    );
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

test("a task's spec folder comes from a source reference, never an epic string", () => {
  // Requirement 59.6: a `doc:` epic is no group and names no spec folder.
  assert.equal(specOf({ epic: "doc:.kiro/specs/compression/design.md" }), null);
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
  const graph = await ops.execute<GraphView>("graph.view", {});
  const ready = graph.tasks.filter(
    (task) => task.ready && task.kind === "leaf",
  );
  const pageOrder = [...ready]
    .sort((x, y) => Number(x.order) - Number(y.order))
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
  const first = await ops.execute<Started>("task.start", { taskId: "d" });
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
  const full = await ops.execute<Started>("task.start", { taskId: "c" });
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
    /Autopilot is off/,
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
  const log = await ops.execute<Items<Line>>("workspace.tick.log", {
    limit: 1,
  });
  assert.equal(log.items.length, 1);
  assert.equal(log.items[0].level, "info");
  assert.ok(log.items[0].at);
  const all = await ops.execute<Items<Line>>("workspace.tick.log", {});
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
  const { items } = await ops.execute<Items<Line>>("activity.recent", {
    limit: 3,
  });
  assert.ok(items.length >= 1 && items.length <= 3);
  assert.ok(items.every((item, i) => i === 0 || items[i - 1].at >= item.at));
  assert.ok(
    items.some(
      (item) => item.taskId === "a" && /worker attempt 1/.test(item.text ?? ""),
    ),
  );
});

test("chat.context seeds a chat with the item, its task, plan and history, and writes nothing", async (t) => {
  const { store, ops } = workspace(t, {
    tasks: [leaf("x", { decision: "Pick a format", repositoryId: "app" })],
  });
  const before = store.read().revision;
  const { message } = await ops.execute<{ message: string }>("chat.context", {
    items: [{ kind: "decision", taskId: "x" }],
  });
  assert.match(message, /Open decision|Why: Pick a format/);
  assert.match(message, /Task x \(x\)/);
  assert.match(message, /History/);
  assert.match(message, /Do not change anything/);
  const gone = await ops.execute<{ message: string }>("chat.context", {
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
  const result = await ops.execute<{
    languages: Record<string, { tokens: { type: string }[] }>;
    problems: string[];
  }>("highlight.languages", {});
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
