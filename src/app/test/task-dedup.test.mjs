import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fixture, markdown } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { digest, blocks, queryTasks, validate } from "../../model.mjs";
import { canonical } from "../store.mjs";
import { planSummaries } from "../../plan-model.mjs";
import { resolveTaskId, taskSourceRefs } from "../../task-identity.mjs";
import { reconcileSource } from "../source-sync.mjs";
import { handleMcp } from "../mcp.mjs";

function prepare(t) {
  const { store, root } = fixture(t),
    text =
      "- [ ] Deliver shared frame validation\n  Keep scope and proof together.\n",
    block = blocks(text)[0];
  store.mutate("Prepare copied source", (data) => {
    for (const id of ["one.md", "two.md"])
      data.documents[id] = {
        id,
        path: id,
        title: id,
        text,
        hash: digest(text),
        links: [],
        rawLinks: [],
      };
    Object.assign(data.tasks[0], {
      title: block.title,
      source: { document: "one.md", key: block.key, lineStart: 1, lineEnd: 2 },
      acceptance: ["Keep existing criterion"],
      notes: "Primary notes",
    });
    data.tasks.push({
      ...data.tasks[0],
      id: "copied-task",
      source: { ...data.tasks[0].source, document: "two.md" },
      acceptance: ["Keep additional criterion"],
      notes: "Other notes",
      capture: { submissionId: "copied-submission" },
      prompt: "Copied prompt",
    });
    data.tasks.push({
      id: "dependent-task",
      title: "Run dependent validation",
      status: "planned",
      scope: "catalog",
      epic: "sample",
      track: "catalog",
      tags: [],
    });
    data.edges.push({
      id: "old-edge",
      from: "copied-task",
      to: "dependent-task",
      kind: "requires",
      reason: "Keep prerequisite",
    });
    data.presentation = {
      views: [
        { id: "old-view", selected: "copied-task", taskIds: ["copied-task"] },
      ],
      tours: [],
    };
  });
  return { store, root, ops: new Operations(store) };
}
const input = (store) => ({
  targetId: "sample-task",
  duplicateIds: ["copied-task"],
  reason: "Reviewed identical source deliverable in both documents.",
  expectedHashes: Object.fromEntries(
    store.read().tasks.map((t) => [t.id, digest(canonical(t))]),
  ),
});
test("consolidation retains provenance, criteria, evidence, graph semantics and old task links", async (t) => {
  const { store, ops } = prepare(t);
  store.put("runs", {
    id: "old-run",
    taskId: "copied-task",
    state: "completed",
    mode: "ask",
    prompt: "Old history",
  });
  const before = store.read().revision,
    result = await ops.execute("task.merge", input(store), before),
    data = store.read();
  assert.equal(data.tasks.length, 2);
  assert.equal(resolveTaskId(data, "copied-task"), "sample-task");
  assert.equal(result.task.status, "planned");
  assert.equal(taskSourceRefs(result.task).length, 2);
  assert.deepEqual(result.task.acceptance, [
    "Keep existing criterion",
    "Keep additional criterion",
  ]);
  assert.match(result.task.notes, /Other notes/);
  assert.equal(data.edges[0].from, "sample-task");
  assert.equal(data.edges[0].kind, "requires");
  assert.deepEqual(data.presentation.views[0].taskIds, ["sample-task"]);
  const old = await ops.execute("task.get", { id: "copied-task" });
  assert.equal(old.id, "sample-task");
  assert.equal(old.requestedId, "copied-task");
  assert.equal(old.runs[0].id, "old-run");
  assert.equal(
    queryTasks(data, { scope: "all", q: "id:copied-task" })[0].id,
    "sample-task",
  );
  assert.equal(
    (await ops.execute("run.list", { taskId: "sample-task" })).items[0].id,
    "old-run",
  );
  assert.deepEqual(validate(data), []);
  const receipt = await ops.execute("task.merge.get", { id: result.receiptId });
  assert.equal(receipt.originalTasks[1].notes, "Other notes");
  assert.equal(receipt.originalEdges[0].from, "copied-task");
  assert(
    planSummaries(data)
      .filter((p) => p.doc.id === "two.md")[0]
      .tasks.some((t) => t.id === "sample-task"),
  );
  const retry = await ops.execute("task.capture", {
    submissionId: "copied-submission",
    prompt: "Copied prompt",
  });
  assert.equal(retry.task.id, "sample-task");
  assert.equal(retry.existing, true);
  const mcp = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "plans_get_task", arguments: { id: "copied-task" } },
    },
    ops,
  );
  assert.equal(mcp.body.result.structuredContent.id, "sample-task");
});
test("stale merge reviews, conflicting live statuses and active workers cannot be consolidated", async (t) => {
  const { store, ops } = prepare(t),
    stale = input(store);
  await ops.execute("task.update", {
    id: "copied-task",
    notes: "Changed after review",
  });
  await assert.rejects(ops.execute("task.merge", stale), /Task changed/);
  assert.equal(store.read().tasks.length, 3);
  await ops.execute("task.update", { id: "copied-task", status: "partial" });
  await assert.rejects(
    ops.execute("task.merge", input(store)),
    /different current task statuses/,
  );
  await ops.execute("task.update", { id: "copied-task", status: "planned" });
  await ops.execute("activity", {
    id: "copied-task",
    action: "start",
    owner: "Do not interrupt",
    sessionId: "existing-worker",
  });
  await assert.rejects(
    ops.execute("task.merge", input(store)),
    /current worker/,
  );
  assert.equal(store.read().taskAliases, undefined);
});
test("merges reject cycles through requires and sequence without partial aliases or evidence", async (t) => {
  const { store, ops } = prepare(t);
  store.mutate("Prepare prospective cycle", (data) =>
    data.edges.push({
      id: "back",
      from: "dependent-task",
      to: "sample-task",
      kind: "sequence",
    }),
  );
  await assert.rejects(ops.execute("task.merge", input(store)), /cycle/);
  assert.equal(store.read().taskAliases, undefined);
  assert.equal(store.list("evidence").length, 0);
});
test("secondary source changes and removal still flag the canonical task for review", async (t) => {
  const { store, ops, root } = prepare(t);
  await ops.execute("task.merge", input(store));
  fs.writeFileSync(
    root + "/two.md",
    "- [ ] Deliver shared frame validation\n  Changed acceptance context.\n",
  );
  reconcileSource(store, root, "two.md");
  assert.equal(store.read().tasks[0].needsReview, true);
  assert.equal(store.read().tasks.length, 2);
  fs.unlinkSync(root + "/two.md");
  reconcileSource(store, root, "two.md");
  assert(
    taskSourceRefs(store.read().tasks[0]).find((r) => r.document === "two.md")
      .removed,
  );
});
test("capture reuses identical requests and requires explicit scope for same-name separate tasks", async (t) => {
  const { store, ops } = prepare(t);
  const first = await ops.execute("task.capture", {
      prompt: "Build a separate viewport widget",
      submissionId: "first-widget",
    }),
    same = await ops.execute("task.capture", {
      prompt: "Build a separate viewport widget",
      submissionId: "second-widget",
    });
  assert.equal(first.task.id, same.task.id);
  assert.equal(same.existing, true);
  await assert.rejects(
    ops.execute("task.capture", {
      prompt: "Deliver shared frame validation",
      submissionId: "same-title-new",
    }),
    /Possible existing task/,
  );
  const distinct = await ops.execute("task.capture", {
    prompt: "Deliver shared frame validation",
    submissionId: "distinct-scope",
    distinctReason: "This task targets the other platform.",
  });
  assert(distinct.task.distinctFrom["sample-task"]);
  assert.equal(store.read().tasks.length, 5);
});
test("approved plans link canonical work without overwriting it or creating duplicate tasks", async (t) => {
  const { store, ops } = prepare(t),
    title = store.read().tasks[0].title,
    proposal = JSON.stringify({
      id: "reuse-existing",
      title,
      taskId: "copied-task",
      acceptance: ["New document context, not new task acceptance"],
    });
  await ops.execute("task.merge", input(store));
  const before = store.read().tasks[0],
    plan = await ops.execute("plan.create", {
      prompt: "Link existing work",
      text: "# Shared design\n\n```task\n" + proposal + "\n```\n",
    });
  const receipt = await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
    approvedBy: "User",
    evidence: "Explicitly reuse the existing task",
  });
  assert.equal(receipt.taskIds[0], "sample-task");
  assert.equal(store.read().tasks.length, 2);
  assert.equal(store.read().tasks[0].title, before.title);
  assert.deepEqual(store.read().tasks[0].acceptance, before.acceptance);
  assert(
    taskSourceRefs(store.read().tasks[0]).some((r) => r.planId === plan.id),
  );
  const duplicate = await ops.execute("plan.create", {
    prompt: "Accidental duplicate",
    text:
      "# Duplicate\n\n```task\n" +
      JSON.stringify({
        id: "copy-existing",
        title,
        acceptance: ["Same work"],
      }) +
      "\n```\n",
  });
  await assert.rejects(
    ops.execute("plan.approve", {
      id: duplicate.id,
      expectedHash: duplicate.hash,
      expectedRevision: store.read().revision,
      approvedBy: "User",
      evidence: "Review",
    }),
    /Possible existing task/,
  );
  assert.equal(store.read().tasks.length, 2);
});

test("archived source progress retains its pre-merge status without promoting the canonical task", async (t) => {
  const { store, ops } = prepare(t);
  store.mutate("Archive source", (data) => {
    data.documents["two.md"].historical = true;
    data.tasks.find((t) => t.id === "copied-task").status = "accepted";
  });
  await ops.execute("task.merge", input(store));
  assert.equal(store.read().tasks[0].status, "planned");
  const summaries = planSummaries(store.read());
  assert.equal(summaries.find((p) => p.doc.id === "one.md").percent, 0);
  assert.equal(summaries.find((p) => p.doc.id === "two.md").percent, 100);
});
test("alias dependencies and deliberate separate scopes survive task edits", async (t) => {
  const { store, ops } = prepare(t);
  await ops.execute("task.merge", input(store));
  await ops.execute("task.update", {
    id: "dependent-task",
    requires: ["copied-task"],
  });
  assert.equal(store.read().edges[0].from, "sample-task");
  const title = store.read().tasks[0].title;
  await ops.execute("task.update", {
    id: "other-platform-task",
    create: true,
    title,
    distinctReason: "Separate target platform.",
  });
  assert.equal(
    store.read().tasks.find((t) => t.id === "other-platform-task").distinctFrom[
      "sample-task"
    ],
    "Separate target platform.",
  );
  assert.equal((await ops.execute("task.duplicates")).total, 0);
});

test("search includes secondary design context and retired task identities", async (t) => {
  const { store, ops } = prepare(t);
  store.mutate("Add secondary context", (data) => {
    data.documents["two.md"].text += "SecondaryOnlyContext";
    data.tasks.find((t) => t.id === "copied-task").source.lineEnd = 3;
  });
  await ops.execute("task.merge", input(store));
  for (const q of ["SecondaryOnlyContext", "copied-task"])
    assert.deepEqual(
      queryTasks(store.read(), { scope: "all", q }).map((t) => t.id),
      ["sample-task"],
    );
});
