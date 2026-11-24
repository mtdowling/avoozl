import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { Operations } from "../api/operations.ts";
import { createSpecPlan, readSpecFolder } from "../specs/spec-plans.ts";
import { fixture } from "./fixtures.ts";
import { writeSpec, syntheticSpecFiles } from "./spec-fixture.ts";
import { found, type TickResult } from "./view-shapes.ts";

// A plan row, for the fields these tests read.
interface PlanRow {
  id: string;
  hash: string;
  state: string;
}
type Workspace = ReturnType<typeof workspace>;

function workspace(t: TestContext) {
  const { root, store } = fixture(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, github: { mode: "local" } }),
  );
  store.put("repositories", {
    id: "app",
    root: "/checkout/app",
    baseBranch: "main",
  });
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}
const leaf = (summary: string, requires: string[] = []) => ({
  kind: "leaf",
  repository: "app",
  summary,
  requires,
  completion: "integrated",
  paths: ["src/example.mjs"],
  checks: ["node --check src/example.mjs"],
  acceptance: ["The synthetic task produces its expected result."],
});
function draft(
  w: Workspace,
  spec: string,
  entries: Record<string, ReturnType<typeof leaf>>,
) {
  writeSpec(w.root, spec, syntheticSpecFiles(entries));
  return createSpecPlan(
    w.store,
    { id: spec, context: { repositoryId: "app" } },
    readSpecFolder(w.root, spec),
  );
}
async function approve(w: Workspace, id: string) {
  const plan = found(w.store.get<PlanRow>("plans", id), id);
  return w.ops.execute("plan.approve", {
    id,
    expectedHash: plan.hash,
    expectedRevision: w.store.read().revision,
  });
}
async function pending(t: TestContext) {
  const w = workspace(t);
  draft(w, "source", { "source-step": leaf("Build source foundation") });
  draft(w, "consumer", {
    "consumer-step": leaf("Build dependent feature"),
  });
  // A parent spec links source, then consumer, so consumer's task waits for
  // source's.
  writeSpec(w.root, "pair", {
    "tasks.md":
      "---\nrepo: app\n---\n- [ ] `pair-1` Build [source](../source/tasks.md)\n- [ ] `pair-2` Build [consumer](../consumer/tasks.md)\n- [ ] `pair-3` Build [last](../last/tasks.md)\n",
  });
  createSpecPlan(
    w.store,
    { id: "pair", context: { repositoryId: "app" } },
    readSpecFolder(w.root, "pair"),
  );
  await approve(w, "consumer");
  return w;
}
const request = (taskId = "consumer-step", role = "worker") => ({
  taskId,
  role,
  repository: "app",
  agent: "test-worker",
});

test("session.request and legacy run.start cannot execute a pending consumer", async (t) => {
  const w = await pending(t);
  for (const operation of ["session.request", "run.start"]) {
    await assert.rejects(
      w.ops.execute(operation, request()),
      /referenced spec approval/,
    );
    assert.equal(w.store.list("session_requests").length, 0);
  }
  assert.equal(w.store.get<PlanRow>("plans", "source")?.state, "draft");
  assert.equal(
    w.store.read().tasks.some((task) => task.id === "source-step"),
    false,
  );
});

test("an explicit session cannot bypass a pending prerequisite through another task", async (t) => {
  const w = await pending(t);
  draft(w, "last", {
    "last-step": leaf("Finish dependent delivery"),
  });
  await approve(w, "last");
  assert.equal(
    w.store.read().tasks.find((task) => task.id === "last-step")
      ?.pendingSpecDependencies,
    undefined,
  );
  for (const role of ["worker", "responder"])
    await assert.rejects(
      w.ops.execute("session.request", request("last-step", role)),
      /referenced spec approval at consumer-step/,
    );
  assert.equal(w.store.list("session_requests").length, 0);
});

test("a queued request is rechecked once its source completes", async (t) => {
  const w = await pending(t);
  await approve(w, "source");
  await assert.rejects(
    w.ops.execute("session.request", request()),
    /not ready/,
  );
  w.store.mutate("Synthetic source completes", (data) => {
    found(data.tasks.find((task) => task.id === "source-step")).status =
      "accepted";
  });
  await w.ops.execute("session.request", request());
  assert.equal(
    (await w.ops.execute<TickResult>("workspace.tick")).dispatch.some(
      (row) => row.task === "consumer-step",
    ),
    true,
  );
});

test("an old queued request cannot bypass a newly uncompleted dependency", async (t) => {
  const w = workspace(t);
  w.store.mutate("Synthetic prerequisite and request target", (data) => {
    data.tasks.push({
      id: "done-source",
      title: "Done source",
      status: "accepted",
      scope: "catalog",
      track: "catalog",
    });
    data.edges.push({
      id: "done-source:requires:sample-task",
      from: "done-source",
      to: "sample-task",
      kind: "requires",
    });
  });
  await w.ops.execute("session.request", request("sample-task"));
  w.store.mutate("Synthetic source reopens", (data) => {
    found(data.tasks.find((task) => task.id === "done-source")).status =
      "planned";
  });
  assert.equal(
    (await w.ops.execute<TickResult>("workspace.tick")).dispatch.some(
      (row) => row.task === "sample-task",
    ),
    false,
  );
});
