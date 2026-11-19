import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { createSpecPlan, readSpecFolder } from "../spec-plans.mjs";
import { queryTasks } from "../../query.mjs";
import { taskSignals } from "../../workbench-model.mjs";
import { completionReached } from "../../work-model.mjs";
import { completeParents } from "../delivery.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";

function setup(t) {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, github: { mode: "local" } }),
  );
  const ops = new Operations(store, { workspaceRoot: root });
  return { root, store, ops };
}
const leaf = (summary, requires = []) => ({
  kind: "leaf",
  summary,
  requires,
  paths: ["src/example.mjs"],
  checks: ["node --check src/example.mjs"],
  completion: "integrated",
  acceptance: ["The synthetic fixture produces its expected result."],
});
function draft({ root, store }, name, entries, { checked = [] } = {}) {
  writeSpec(root, name, {
    "requirements.md": "# Synthetic requirement\n\nStatus: Draft\n",
    "design.md": "# Synthetic design\n\nStatus: Draft\n",
    "tasks.md":
      "# Tasks\n\nStatus: Draft\n\n" +
      Object.entries(entries)
        .map(
          ([id, task]) =>
            `- [${checked.includes(id) ? "x" : " "}] ${id} ${task.summary}`,
        )
        .join("\n") +
      "\n",
    "avoozl/manifest.json": JSON.stringify({ version: 1, tasks: entries }),
  });
  return createSpecPlan(store, { id: name }, readSpecFolder(root, name));
}
async function approve({ store, ops }, id) {
  const plan = store.get("plans", id);
  return ops.execute("plan.approve", {
    id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
}
function interleaved(t) {
  const workspace = setup(t);
  draft(workspace, "left", {
    "left-start": leaf("Build left foundation"),
    "left-finish": leaf("Finish left delivery", ["right-step"]),
  });
  draft(workspace, "right", {
    "right-step": leaf("Build right step", ["left-start"]),
  });
  return workspace;
}

test("real previews distinguish foreign declarations from actual tasks", async (t) => {
  const w = interleaved(t);
  for (const id of ["left", "right"]) {
    const preview = await w.ops.execute("plan.preview", { id });
    assert.equal(preview.quality.counts.error, 0);
    assert.equal(preview.dependencies[0].known, false);
    assert.equal(preview.dependencies[0].pending, true);
    assert.equal(typeof preview.dependencies[0].declaredBy, "string");
  }
  assert.deepEqual(
    w.store.read().tasks.map((task) => task.id),
    ["sample-task"],
  );
  assert.equal(w.store.list("approvals").length, 0);
});

test("separate approvals resolve an interleaved acyclic graph without foreign placeholders", async (t) => {
  const w = interleaved(t);
  await approve(w, "left");
  let data = w.store.read();
  assert.equal(
    data.tasks.some((task) => task.id === "right-step"),
    false,
  );
  assert.equal(w.store.get("plans", "right").state, "draft");
  const finish = data.tasks.find((task) => task.id === "left-finish");
  assert.deepEqual(
    finish.pendingSpecDependencies.map((entry) => entry.taskId),
    ["right-step"],
  );
  assert.equal(
    queryTasks(data, { scope: "all", q: "ready:true" }).some(
      (task) => task.id === finish.id,
    ),
    false,
  );
  assert.equal(taskSignals(data, finish).ready, false);
  await approve(w, "right");
  data = w.store.read();
  assert.equal(
    data.tasks.find((task) => task.id === finish.id).pendingSpecDependencies,
    undefined,
  );
  assert.deepEqual(
    data.edges
      .filter((edge) => ["left-start", "right-step"].includes(edge.from))
      .map(({ from, to }) => [from, to])
      .sort(),
    [
      ["left-start", "right-step"],
      ["right-step", "left-finish"],
    ],
  );
  assert.equal(w.store.list("approvals").length, 2);
});

test("unknown names and foreign unowned task collisions still refuse approval", async (t) => {
  const w = setup(t);
  draft(w, "unknown", {
    "unknown-consumer": leaf("Use nonexistent task", ["missing-task"]),
  });
  await assert.rejects(approve(w, "unknown"), /task.unknown-dependency/);
  draft(w, "source", { "sample-task": leaf("Declare a colliding source") });
  draft(w, "consumer", {
    "consumer-step": leaf("Use declared source", ["sample-task"]),
  });
  await assert.rejects(approve(w, "consumer"), /Foreign dependency ownership/);
  assert.equal(w.store.list("approvals").length, 0);
});

test("a real cross-spec task cycle is refused before the first approval", async (t) => {
  const w = setup(t);
  draft(w, "one", { "one-step": leaf("Build first stage", ["two-step"]) });
  draft(w, "two", { "two-step": leaf("Build second stage", ["one-step"]) });
  await assert.rejects(approve(w, "one"), /task.dependency-cycle/);
  assert.equal(w.store.list("approvals").length, 0);
});

test("a newer unapproved peer draft keeps the last real approval anchor", async (t) => {
  const w = interleaved(t);
  await approve(w, "left");
  await approve(w, "right");
  const before = w.store.get("plans", "right");
  fs.appendFileSync(
    path.join(w.root, ".kiro/specs/right/design.md"),
    "\nA draft explanation.\n",
  );
  await w.ops.execute("plan.save", { id: "right", expectedHash: before.hash });
  assert.equal(w.store.get("plans", "right").state, "draft");
  assert.equal(
    w.store.read().tasks.find((task) => task.id === "left-finish")
      .pendingSpecDependencies,
    undefined,
  );
  assert.ok(
    w.store
      .read()
      .edges.some(
        (edge) => edge.from === "right-step" && edge.to === "left-finish",
      ),
  );
});

test("archiving and restoring an owner restores and resolves pending references", async (t) => {
  const w = interleaved(t);
  await approve(w, "left");
  await approve(w, "right");
  await w.ops.execute("plan.archive", { id: "right" });
  assert.ok(
    w.store.read().tasks.find((task) => task.id === "left-finish")
      .pendingSpecDependencies.length,
  );
  assert.equal(
    w.store
      .read()
      .edges.some(
        (edge) => edge.from === "right-step" && edge.to === "left-finish",
      ),
    false,
  );
  await w.ops.execute("plan.unarchive", { id: "right" });
  assert.equal(
    w.store.read().tasks.find((task) => task.id === "left-finish")
      .pendingSpecDependencies,
    undefined,
  );
});

test("owner invalidation cannot leave an already projected consumer released", async (t) => {
  const w = interleaved(t);
  await approve(w, "left");
  await approve(w, "right");
  w.store.mutate("Fixture repositories one consumer", (data) => {
    data.tasks.find((task) => task.id === "left-finish").github = { number: 7 };
  });
  await assert.rejects(
    w.ops.execute("plan.archive", { id: "right" }),
    /projected task left-finish/,
  );
  assert.equal(w.store.get("plans", "right").archivedAt, undefined);
  assert.equal(
    w.store.read().tasks.find((task) => task.id === "left-finish")
      .pendingSpecDependencies,
    undefined,
  );
});

test("manual and package completion cannot bypass pending owners", async (t) => {
  const w = interleaved(t);
  await approve(w, "left");
  w.store.mutate("Fixture adds local completion state", (data) => {
    const task = data.tasks.find((row) => row.id === "left-finish");
    task.kind = "package";
    task.status = "accepted";
    data.tasks.push({
      id: "finished-child",
      parent: task.id,
      title: "Finished child",
      status: "accepted",
      scope: "catalog",
      track: "catalog",
    });
  });
  const data = w.store.read(),
    task = data.tasks.find((row) => row.id === "left-finish");
  assert.equal(
    completionReached(task, undefined, (status) => status === "accepted"),
    false,
  );
  assert.deepEqual(completeParents(w.store), []);
  assert.equal(
    completionReached(
      { ...task, kind: "leaf", manual: true, manualDone: true },
      undefined,
      () => true,
    ),
    false,
  );
  assert.equal(taskSignals(data, task).ready, false);
  assert.equal(taskSignals(data, task).complete, false);
});

test("checked marks cannot baseline a task with an unapproved foreign owner", async (t) => {
  const w = setup(t);
  draft(w, "source", { "source-step": leaf("Produce a reviewed source") });
  draft(
    w,
    "consumer",
    { "consumer-done": leaf("Claim checked work", ["source-step"]) },
    { checked: ["consumer-done"] },
  );
  await assert.rejects(approve(w, "consumer"), /cannot be baselined/);
  assert.equal(w.store.list("approvals").length, 0);
});

test("a prose-only consumer amendment preserves unchanged reviewed foreign links", async (t) => {
  const w = interleaved(t);
  await approve(w, "left");
  await approve(w, "right");
  assert.equal(
    w.store.read().tasks.find((task) => task.id === "left-finish").needsReview,
    false,
  );
  const plan = w.store.get("plans", "left");
  fs.appendFileSync(
    path.join(w.root, ".kiro/specs/left/design.md"),
    "\nA clearer explanation only.\n",
  );
  await w.ops.execute("plan.save", { id: "left", expectedHash: plan.hash });
  assert.equal(
    w.store.read().tasks.find((task) => task.id === "left-finish").needsReview,
    true,
  );
  await approve(w, "left");
  assert.equal(
    w.store.read().tasks.find((task) => task.id === "left-finish").needsReview,
    false,
  );
  assert.ok(
    w.store
      .read()
      .edges.some(
        (edge) => edge.from === "right-step" && edge.to === "left-finish",
      ),
  );
});

test("changing the reviewed foreign dependency still holds a consumer for review", async (t) => {
  const w = interleaved(t);
  await approve(w, "left");
  await approve(w, "right");
  const plan = w.store.get("plans", "left"),
    file = path.join(w.root, ".kiro/specs/left/tasks.md");
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, "utf8")
      .replace(
        /(left-finish[^\n]*\n(?:\s+-.*\n)*?\s+- \$after:) right-step/,
        "$1 left-start",
      ),
  );
  await w.ops.execute("plan.save", { id: "left", expectedHash: plan.hash });
  await approve(w, "left");
  const task = w.store.read().tasks.find((row) => row.id === "left-finish");
  assert.equal(task.needsReview, true);
  assert.equal(task.specDependencies, undefined);
  assert.ok(
    w.store
      .read()
      .edges.some((edge) => edge.from === "left-start" && edge.to === task.id),
  );
});
