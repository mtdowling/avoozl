// Two approved specs whose tasks depend on each other both ways
// (left-start -> right-step -> left-finish) project in either order.
import assert from "node:assert/strict";
import test from "node:test";
import { queryTasks } from "../../query.mjs";
import { taskSignals } from "../../workbench-model.mjs";
import { workspace } from "./radar-fixture.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { setRadarHandoverPaused } from "../coder-adapter.mjs";

// These tests cover the Radar hand-over kept while Phase 45 is paused
// (R103.4 pauses it in the product).
setRadarHandoverPaused(false);

const leaf = (summary, requires = []) => ({
  kind: "leaf",
  summary,
  requires,
  paths: ["src/example.mjs"],
  checks: ["node --check src/example.mjs"],
  completion: "merged-pr",
  route: "github",
  repository: "code",
  acceptance: ["The synthetic fixture produces its expected result."],
});

async function draft({ root, ops }, name, entries) {
  writeSpec(root, name, {
    "requirements.md": "# Requirement\n\nStatus: Draft\n",
    "design.md": "# Design\n\nStatus: Draft\n",
    "tasks.md":
      "# Tasks\n\nStatus: Draft\n\n" +
      Object.entries(entries)
        .map(([id, task]) => `- [ ] ${id} ${task.summary}`)
        .join("\n") +
      "\n",
    "avoozl/manifest.json": JSON.stringify({ version: 1, tasks: entries }),
  });
  return ops.execute("plan.create", {
    spec: name,
    context: { projectId: "code" },
  });
}

async function approve({ store, ops }, plan) {
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  store.setMeta(`spec-approval:${plan.id}:${plan.hash}`, {
    state: "merged",
    commit: "0".repeat(40),
    approvedBy: "octocat",
  });
}

async function interleaved(t) {
  const w = await workspace(t, { mode: "single-repo" });
  const left = await draft(w, "left", {
    "left-start": leaf("Left foundation"),
    "left-finish": leaf("Left finish", ["right-step"]),
  });
  const right = await draft(w, "right", {
    "right-step": leaf("Right step", ["left-start"]),
  });
  return { ...w, left, right };
}

const taskIdOf = (issue) => issue?.body.match(/"taskId":"([^"]+)"/)?.[1];
const issueOf = (w, id) =>
  w.github.created.find((issue) => taskIdOf(issue) === id);
const blockersOf = (w, id) =>
  [
    ...(
      w.github.blockers.get(`example/code#${issueOf(w, id).number}`) ??
      new Map()
    ).values(),
  ].map(taskIdOf);
const ready = (w, id) =>
  Boolean(w.store.read().tasks.find((task) => task.id === id).dispatch?.ready);
const labeled = (w, id) =>
  issueOf(w, id).labels.some(
    (label) => (label.name ?? label) === "avoozl:ready",
  );

for (const order of [
  ["left", "right"],
  ["right", "left"],
])
  test(`interleaved specs project ${order.join(" then ")}`, async (t) => {
    const w = await interleaved(t);
    await approve(w, w.left);
    await approve(w, w.right);
    for (const name of order)
      await w.ops.execute("github.project", { planId: w[name].id });
    for (const id of ["left-start", "right-step", "left-finish"])
      assert.ok(issueOf(w, id), `${id} has an issue`);
    assert.deepEqual(blockersOf(w, "right-step"), ["left-start"]);
    assert.deepEqual(blockersOf(w, "left-finish"), ["right-step"]);
    assert.deepEqual(blockersOf(w, "left-start"), []);
    assert.equal(ready(w, "left-start"), true);
    assert.equal(ready(w, "right-step"), false);
    assert.equal(ready(w, "left-finish"), false);
    assert.equal(
      w.store.read().tasks.some((task) => task.github?.waitingOn),
      false,
    );
    // Projecting again changes nothing.
    const count = w.github.created.length;
    for (const name of order)
      await w.ops.execute("github.project", { planId: w[name].id });
    assert.equal(w.github.created.length, count);
  });

test("a task whose blocker has no issue yet is never ready or released", async (t) => {
  const w = await interleaved(t);
  await approve(w, w.left);
  await approve(w, w.right);
  // Mid-way: right is approved but not projected, so right-step has no issue.
  const result = await w.ops.execute("github.project", { planId: w.left.id });
  assert.deepEqual(result.waiting, [
    { taskId: "left-finish", blockers: ["right-step"] },
  ]);
  const data = w.store.read(),
    finish = data.tasks.find((task) => task.id === "left-finish");
  assert.deepEqual(finish.github.waitingOn, ["right-step"]);
  assert.equal(finish.dispatch.ready, false);
  assert.equal(finish.dispatch.state, "blocked");
  assert.equal(labeled(w, "left-finish"), false);
  assert.equal(taskSignals(data, finish).ready, false);
  assert.equal(
    queryTasks(data, { scope: "all", q: "ready:true" }).some(
      (task) => task.id === "left-finish",
    ),
    false,
  );
  assert.equal(labeled(w, "left-start"), true);
  assert.deepEqual(blockersOf(w, "left-finish"), []);
});

test("another spec's done blocker that gets no issue counts as met", async (t) => {
  const w = await interleaved(t);
  await approve(w, w.left);
  await approve(w, w.right);
  // right-step completes before its spec ever projects; with includeDone off
  // it gets no issue, so its edge counts as met (R74).
  w.store.mutate("Finish right-step", (data) => {
    data.tasks.find((task) => task.id === "right-step").status = "accepted";
  });
  await w.ops.execute("github.project", { planId: w.left.id });
  assert.equal(ready(w, "left-finish"), true);
  assert.deepEqual(blockersOf(w, "left-finish"), []);
});

test("an unapproved owner still refuses projection of its dependents", async (t) => {
  const w = await interleaved(t);
  await approve(w, w.left);
  await assert.rejects(
    w.ops.execute("github.project", { planId: w.left.id }),
    /Approve referenced spec owners/,
  );
  assert.equal(w.github.created.length, 0);
});

test("the issues preview of a Draft with another spec's reference works", async (t) => {
  const w = await interleaved(t);
  // Neither owner approved: the preview says which approval comes first.
  const held = await w.ops.execute("plan.issues.preview", {
    planId: w.right.id,
  });
  assert.deepEqual(
    held.blocked.map((entry) => [entry.code, entry.taskId]),
    [["spec.pending-owner", "right-step"]],
  );
  assert.match(held.blocked[0].message, /Approve left first/);
  await approve(w, w.left);
  const preview = await w.ops.execute("plan.issues.preview", {
    planId: w.right.id,
  });
  assert.equal(preview.simulated, true);
  assert.ok(
    preview.writes.some(
      (write) => write.kind === "issue.create" && write.taskId === "right-step",
    ),
  );
  assert.equal(w.store.get("plans", w.right.id).state, "draft");
  assert.equal(w.github.created.length, 0);
});
