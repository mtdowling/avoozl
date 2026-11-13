// The page's task drawer, spec reader, task authoring and Conflicts actions.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { principalAllows } from "../app-backend.mjs";
import { classifyOperation } from "../operation-kinds.mjs";
import { fixture, snapshot } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";

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

function workspace(t) {
  const { root, store } = fixture(t),
    data = snapshot();
  data.tasks = [
    leaf("a", { status: "accepted" }),
    leaf("b"),
    leaf("c", { needsReview: true }),
    leaf("d", { decision: "choose-format" }),
    leaf("e", { status: "blocked" }),
    leaf("g", {
      needsReview: true,
      github: { number: 5, url: "https://github.com/example/fixture/issues/5" },
    }),
  ];
  data.edges = [
    { id: "a:requires:b", from: "a", to: "b", kind: "requires" },
    { id: "b:requires:c", from: "b", to: "c", kind: "requires" },
  ];
  store.importSnapshot(data);
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

test("task.detail shows the task, both directions of links, delivery, conflicts and a timeline", async (t) => {
  const { store, ops } = workspace(t);
  await ops.execute("session.bind", { taskId: "b", slot: "slot-b-1" });
  await ops.execute("session.status", { slot: "slot-b-1", status: "working" });
  const before = store.read().revision;
  const detail = await ops.execute("task.detail", { id: "b" });
  assert.equal(detail.task.title, "Task b");
  assert.deepEqual(detail.task.acceptance, ["b is observable."]);
  assert.equal(detail.task.wave, 2);
  assert.deepEqual(
    detail.waitsOn.map((e) => [e.id, e.kind, e.satisfied]),
    [["a", "requires", true]],
  );
  assert.deepEqual(
    detail.blocks.map((e) => e.id),
    ["c"],
  );
  assert.deepEqual(
    detail.delivery.sessions.map((s) => s.slot),
    ["slot-b-1"],
  );
  assert.ok(
    detail.timeline.some((entry) => /worker attempt 1/.test(entry.text)),
  );
  assert.equal(detail.locked, null);
  assert.equal(store.read().revision, before, "the read writes nothing");
  const github = await ops.execute("task.detail", { id: "g" });
  assert.equal(github.locked.reason, "github");
  // Review is one item per plan in Conflicts, not one per task.
  assert.deepEqual(github.conflicts, []);
  assert.equal(github.task.needsReview, true);
});

test("a new task from the page is a draft that waits for review, never ready", async (t) => {
  const { ops } = workspace(t);
  const revision = ops.read().revision;
  await ops.execute(
    "task.update",
    {
      id: "new-task",
      create: true,
      title: "New task",
      summary: "Do the new thing.",
      acceptance: ["It is done."],
      requires: ["a"],
      sequence: ["b"],
      needsReview: true,
    },
    revision,
  );
  const graph = await ops.execute("graph.view", {}),
    task = graph.tasks.find((entry) => entry.id === "new-task");
  assert.equal(task.ready, false);
  assert.equal(task.state, "waiting");
  assert.equal(task.review, true);
  assert.deepEqual(
    graph.edges
      .filter((e) => e.to === "new-task")
      .map((e) => [e.from, e.kind])
      .sort(),
    [
      ["a", "requires"],
      ["b", "sequence"],
    ],
  );
});

test("a prerequisite that makes a cycle is refused with its path", async (t) => {
  const { ops } = workspace(t);
  await assert.rejects(
    ops.execute(
      "task.update",
      { id: "a", requires: ["c"] },
      ops.read().revision,
    ),
    (error) =>
      error.status === 409 &&
      error.code === "cycle" &&
      /a → b → c → a/.test(error.message),
  );
  // A self edge keeps the store validator's own refusal.
  await assert.rejects(
    ops.execute(
      "task.update",
      { id: "b", sequence: ["b"] },
      ops.read().revision,
    ),
    /Self edge b/,
  );
});

test("a stale revision is refused, so the page says to reload", async (t) => {
  const { ops } = workspace(t);
  const stale = ops.read().revision;
  await ops.execute("task.update", { id: "b", title: "Moved on" }, stale);
  await assert.rejects(
    ops.execute("task.update", { id: "b", title: "Too late" }, stale),
    (error) => error.status === 409 && /Database changed/.test(error.message),
  );
});

test("a GitHub task's edit routes to a change preview that writes nothing", async (t) => {
  const { store, ops } = workspace(t);
  await assert.rejects(
    ops.execute("task.update", { id: "g", title: "Edit" }, ops.read().revision),
    (error) => error.status === 409 && error.code === "authority-github",
  );
  const before = store.read().revision,
    preview = await ops.execute("task.change.preview", {
      id: "g",
      title: "Edit",
    });
  assert.equal(preview.route, "github");
  assert.equal(preview.link, "https://github.com/example/fixture/issues/5");
  assert.equal(store.read().revision, before);
});

test("an approved spec task's edit previews the tasks.md line and manifest entry", async (t) => {
  const { root, store, ops } = workspace(t);
  writeSpec(root, "config");
  const plan = await ops.execute("plan.create", { spec: "config" }),
    preview = await ops.execute("plan.preview", { id: "config" });
  await ops.execute("plan.approve", {
    id: "config",
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
  const detail = await ops.execute("task.detail", { id: "config.1.2" });
  assert.equal(detail.locked.reason, "approved-spec");
  const tasksBefore = fs.readFileSync(
    path.join(root, ".kiro/specs/config/tasks.md"),
    "utf8",
  );
  const change = await ops.execute("task.change.preview", {
    id: "config.1.2",
    title: "Validate and report config",
    acceptance: ["Unknown keys are listed."],
  });
  assert.equal(change.route, "spec");
  assert.deepEqual(change.tasks, {
    line: 5,
    before: "  - [ ] 1.2 Validate loaded config",
    after: "  - [ ] 1.2 Validate and report config",
  });
  assert.deepEqual(change.manifest.after.acceptance, [
    "Unknown keys are listed.",
  ]);
  assert.equal(
    fs.readFileSync(path.join(root, ".kiro/specs/config/tasks.md"), "utf8"),
    tasksBefore,
  );
  assert.equal(store.get("plans", "config").hash, plan.hash);
});

test("plan.spec.read returns a folder's documents and refuses paths out of the specs root", async (t) => {
  const { root, ops } = workspace(t);
  writeSpec(root, "config");
  const read = await ops.execute("plan.spec.read", { name: "config" });
  assert.deepEqual(Object.keys(read.documents).sort(), [
    "design.md",
    "requirements.md",
    "tasks.md",
  ]);
  assert.match(read.documents["requirements.md"], /# Load configuration/);
  for (const name of ["../config", "config/../../x", "/etc", ".."])
    await assert.rejects(ops.execute("plan.spec.read", { name }));
  // A symlinked document that points out of the root reads as missing.
  const outside = path.join(root, "..", `outside-${process.pid}.md`);
  fs.writeFileSync(outside, "secret\n");
  t.after(() => fs.rmSync(outside, { force: true }));
  const design = path.join(root, ".kiro/specs/config/design.md");
  fs.rmSync(design);
  fs.symlinkSync(outside, design);
  const linked = await ops.execute("plan.spec.read", { name: "config" });
  assert.equal(linked.documents["design.md"], undefined);
});

test("conflicts.settle marks reviewed, unblocks, settles and dismisses, refusing locked rows", async (t) => {
  const { ops } = workspace(t);
  await ops.execute("session.bind", { taskId: "b", slot: "slot-b-1" });
  await ops.execute("session.status", { slot: "slot-b-1", status: "lost" });
  await assert.rejects(
    ops.execute("conflicts.settle", {
      action: "reviewed",
      items: [{ taskId: "c" }],
    }),
    (error) => error.status === 428,
  );
  const reviewed = await ops.execute(
    "conflicts.settle",
    { action: "reviewed", items: [{ taskId: "c" }, { taskId: "g" }] },
    ops.read().revision,
  );
  assert.deepEqual(reviewed.settled, [{ taskId: "c" }]);
  assert.deepEqual(
    reviewed.refused.map((item) => [
      item.taskId,
      /GitHub owns/.test(item.reason),
    ]),
    [["g", true]],
  );
  assert.equal(reviewed.revision, ops.read().revision);
  await ops.execute(
    "conflicts.settle",
    { action: "unblock", items: [{ taskId: "e" }] },
    reviewed.revision,
  );
  await ops.execute(
    "conflicts.settle",
    { action: "settle", answer: "Use JSON.", items: [{ taskId: "d" }] },
    ops.read().revision,
  );
  await ops.execute(
    "conflicts.settle",
    { action: "dismiss", items: [{ taskId: "b", slot: "slot-b-1" }] },
    ops.read().revision,
  );
  const left = (await ops.execute("conflicts.view", {})).items.map((item) => [
    item.kind,
    item.tasks?.map((task) => task.id),
  ]);
  assert.deepEqual(left, [["review", ["g"]]]);
  const d = ops.read().tasks.find((task) => task.id === "d");
  assert.equal(d.decision, undefined);
  assert.match(d.notes, /choose-format settled .*: Use JSON\./);
  assert.equal(
    ops.read().tasks.find((task) => task.id === "e").status,
    "planned",
  );
});

test("the new reads are observe; settling is the owner's alone", () => {
  for (const operation of [
    "task.detail",
    "plan.spec.read",
    "task.change.preview",
  ]) {
    assert.equal(classifyOperation(operation), "observe");
    assert.equal(principalAllows({ kind: "app-token" }, operation), true);
  }
  assert.equal(
    principalAllows({ kind: "owner-session" }, "conflicts.settle"),
    true,
  );
  for (const kind of ["app-token", "agent-tool"])
    assert.equal(principalAllows({ kind }, "conflicts.settle"), false);
});

test("task origin names where a task came from and the lines to read", async () => {
  const { taskOrigin } = await import("../page-views.mjs");
  const data = {
    documents: {
      "todo/runtime.md": {
        id: "todo/runtime.md",
        title: "Runtime",
        text: "# Runtime\n- [x] Pack\n",
      },
    },
  };
  const imported = taskOrigin(
    {
      id: "plan-4d2be3cc7ff616f29a",
      source: {
        document: "todo/runtime.md",
        key: "k",
        lineStart: 2,
        lineEnd: 2,
        checked: true,
      },
    },
    data,
  );
  assert.equal(imported.kind, "imported");
  assert.equal(imported.label, "Imported from todo/runtime.md");
  assert.match(imported.text, /line 2 when it imported/);
  assert.match(imported.text, /ticked then/);
  assert.match(imported.text, /hash of the file and the item/);
  assert.deepEqual(imported.sources, [
    {
      document: "todo/runtime.md",
      title: "Runtime",
      lineStart: 2,
      lineEnd: 2,
      checked: true,
      readable: true,
    },
  ]);
  const gone = taskOrigin(
    { id: "x", source: { document: "old.md", key: "k" } },
    data,
  );
  assert.equal(gone.sources[0].readable, false);
  const spec = taskOrigin(
    { id: "1.2", source: { document: ".kiro/specs/demo/tasks.md", key: "1.2" } },
    data,
  );
  assert.equal(spec.kind, "spec");
  assert.equal(spec.spec, "demo");
  assert.equal(
    taskOrigin({ id: "g", github: { origin: "issue" } }, data).kind,
    "github-issue",
  );
  assert.equal(
    taskOrigin({ id: "p", planId: "p1" }, data, { id: "p1", title: "P" }).kind,
    "plan",
  );
  assert.equal(taskOrigin({ id: "h" }, data).kind, "unknown");
});
