// Large-workspace hot spots, each checked against the old way computed here:
// the same answer, with fewer statements or less work. No time limits.
import assert from "node:assert/strict";
import path from "node:path";
import { StatementSync } from "node:sqlite";
import test from "node:test";
import { Store } from "../store.mjs";
import { deliveryView } from "../page-views.mjs";
import { readyAt } from "../flow.mjs";
import { duplicateCandidates, titleIndex } from "../../task-identity.mjs";
import { largeWorkspace } from "./large-workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

// Statements run while fn runs, by SQL text.
function statements(fn) {
  const seen = [],
    originals = {};
  for (const method of ["all", "get", "run", "iterate"]) {
    originals[method] = StatementSync.prototype[method];
    StatementSync.prototype[method] = function (...values) {
      seen.push(this.sourceSQL);
      return originals[method].apply(this, values);
    };
  }
  try {
    return { result: fn(), seen };
  } finally {
    Object.assign(StatementSync.prototype, originals);
  }
}

let built;
test.before(async () => {
  built = await largeWorkspace(path.join(temporaryDirectory(), "ws"), {
    specs: 4,
    crossSpecEdges: 20,
  });
});
test.after(() => built.store.close());

test("a mutation writes only the rows it changed", () => {
  const { store } = built,
    data = store.read(),
    // The old write ran one upsert per task, document and edge.
    old =
      data.tasks.length +
      Object.keys(data.documents).length +
      data.edges.length,
    target = data.tasks[0].id;
  const { seen } = statements(() =>
    store.mutate("Retitle one task", (draft) => {
      draft.tasks.find((t) => t.id === target).title =
        "Retitled synthetic task";
    }),
  );
  const upserts = seen.filter((sql) =>
    sql.startsWith("INSERT INTO entities"),
  ).length;
  assert.equal(upserts, 1);
  assert.ok(upserts < old);
  // What is on disk is what a full rewrite would leave.
  const reopened = new Store(store.filename);
  try {
    const expected = structuredClone(store.read());
    assert.deepEqual(reopened.read(), expected);
    assert.equal(
      reopened.read().tasks.find((t) => t.id === target).title,
      "Retitled synthetic task",
    );
  } finally {
    reopened.close();
  }
});

test("a write after another writer's commit keeps that writer's change", () => {
  const { store } = built,
    other = new Store(store.filename);
  try {
    store.read();
    other.mutate("Other writer", (draft) => {
      draft.tasks[1].title = "Changed elsewhere";
    });
    // The revision moved, so this store reloads its rows before comparing.
    const { seen } = statements(() =>
      store.mutate("Retitle another task", (draft) => {
        draft.tasks[2].title = "Changed here";
      }),
    );
    assert.equal(
      seen.filter((sql) => sql.startsWith("INSERT INTO entities")).length,
      1,
    );
    const reopened = new Store(store.filename);
    try {
      const data = reopened.read();
      assert.equal(data.tasks[1].title, "Changed elsewhere");
      assert.equal(data.tasks[2].title, "Changed here");
    } finally {
      reopened.close();
    }
  } finally {
    other.close();
  }
});

test("the Delivery view reads pull request feedback once", () => {
  const { store } = built,
    data = store.read(),
    leaves = data.tasks.filter((t) => t.kind === "leaf"),
    covered = leaves.slice(0, 3).map((t) => t.id);
  store.transaction(() => {
    for (const taskId of covered)
      store.put("pr_feedback", {
        id: taskId,
        taskId,
        repository: "app",
        rounds: 2,
        roundsFrom: 0,
        strangers: {},
        pull: { url: `https://example.test/app/pull/${taskId}` },
      });
  });
  const { result, seen } = statements(() => deliveryView(store, store.read())),
    reads = seen.filter((sql) => sql.includes("FROM pr_feedback")).length;
  // The old view ran one lookup per leaf.
  assert.equal(reads, 1);
  assert.ok(reads < leaves.length);
  for (const taskId of covered) {
    const item = result.items.find((i) => i.id === taskId);
    assert.equal(item.prFeedback.rounds, 2);
    assert.equal(
      item.prFeedback.pullRequest,
      `https://example.test/app/pull/${taskId}`,
    );
  }
});

test("the title index finds the same duplicates as a full scan", () => {
  const data = structuredClone(built.store.read());
  // Two tasks with the same title as an existing one.
  data.tasks[5].title = data.tasks[0].title;
  data.tasks[9].title = data.tasks[0].title.toUpperCase() + "!";
  const index = titleIndex(data.tasks);
  for (const task of data.tasks) {
    const input = { title: task.title, id: "proposal-" + task.id };
    assert.deepEqual(
      duplicateCandidates(data, input, { index }),
      duplicateCandidates(data, input),
    );
  }
  assert.equal(
    duplicateCandidates(
      data,
      { title: data.tasks[0].title, id: "x" },
      { index },
    ).length,
    3,
  );
});

test("ready times from a shared memo match fresh lookups", () => {
  const { store } = built,
    data = store.read(),
    memo = {};
  let known = 0;
  for (const task of data.tasks) {
    const shared = readyAt(store, data, task, 1, memo);
    assert.equal(shared, readyAt(store, data, task, 1));
    if (shared) known++;
  }
  assert.ok(known > 0);
});
