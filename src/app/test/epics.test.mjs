// Epics span plans, phases sit inside plans (Requirement 59, design §6.9):
// the spec reader's epic folders and validation codes, phases from the
// manifest and tasks.md headings, two-sided membership, and the reads.
import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { frontMatter } from "../../front-matter.mjs";
import { headingPhases, lintSpec, readSpecFolder } from "../spec-plans.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

function workspace(t) {
  const { root, store } = fixture(t);
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

const leaf = (extra = {}) => ({
  kind: "leaf",
  summary: "Do it.",
  acceptance: ["A missing file yields defaults."],
  checks: ["npm test"],
  completion: "integrated",
  ...extra,
});

const requirements = (title, front = "") =>
  `${front ? `---\n${front}\n---\n` : ""}# ${title}\n\nThe goal.\n`;

// A plan folder with the given tasks.md body and manifest entries.
function plan(root, name, { front = "", tasks, entries, extra = {} }) {
  writeSpec(root, name, {
    "requirements.md": requirements(`Plan ${name}`, front),
    "tasks.md": `# Tasks\n\n${tasks}`,
    "avoozl/manifest.json": JSON.stringify({ tasks: entries, ...extra }, null, 2),
  });
}

// An epic folder listing `members` (spec names), in order.
function epic(root, name, members, entryExtra = {}) {
  writeSpec(root, name, {
    "requirements.md": `# Epic ${name}\n\nRewrite the runtime.\n\n## What done means\n\nEvery member plan is done.\n`,
    "design.md": "# Design\n\nAlpha, then beta.\n",
    "tasks.md": `# Plans\n\n${members.map((m, i) => `- [ ] ${i + 1} Plan ${m}\n`).join("")}`,
    "avoozl/manifest.json": JSON.stringify(
      {
        kind: "epic",
        tasks: Object.fromEntries(
          members.map((m, i) => [String(i + 1), { plan: m, summary: `Plan ${m}.`, ...entryExtra }]),
        ),
      },
      null,
      2,
    ),
  });
}

const lint = (ops, name) =>
  lintSpec({ spec: readSpecFolder(ops.workspaceRoot, name), plan: { id: name }, namespace: ops.specNamespace() });
const codes = (quality) => quality.diagnostics.map((d) => [d.code, d.severity]);

test("front-matter names an epic beside a category; a bad name is a problem", () => {
  const block = frontMatter("---\ncategory: Runtime\nepic: rewrite\n---\n# T\n");
  assert.equal(block.category, "Runtime");
  assert.equal(block.epic, "rewrite");
  assert.equal(block.epicLine, 3);
  const bad = frontMatter("---\nepic: Not A Folder\n---\n# T\n");
  assert.equal(bad.epic, null);
  assert.match(bad.problem.message, /spec folder name/);
  assert.match(frontMatter("---\nepic: a\nepic: b\n---\n").problem.message, /twice/);
});

test("phases come from the manifest, then the nearest heading, then No phase", () => {
  const text = "# Tasks\n\n- [ ] 0 Before\n\n## Phase 1: Load\n\n- [ ] 1 One\n\n### Detail\n\n- [ ] 2 Two\n\n## Phase 1: Load\n\n- [ ] 3 Three\n";
  const byLine = headingPhases(text);
  assert.equal(byLine.get(3), undefined, "an item under the title only has no phase");
  assert.deepEqual(byLine.get(7), { id: "phase-1-load", title: "Phase 1: Load" });
  assert.deepEqual(byLine.get(11), { id: "detail", title: "Detail" });
  assert.deepEqual(byLine.get(15), { id: "phase-1-load-2", title: "Phase 1: Load" }, "a repeated heading gets -2");
});

test("the spec reader knows epic folders and refuses the old plan forms", (t) => {
  const { root, ops } = workspace(t);
  plan(root, "alpha", {
    front: "epic: rewrite",
    tasks: "- [ ] 0 Headless\n\n## Build\n\n- [ ] 1 Build it\n",
    entries: { 0: leaf(), 1: leaf() },
  });
  plan(root, "beta", {
    front: "epic: rewrite",
    tasks: "- [ ] 1 One\n- [ ] 2 Two\n",
    entries: { 1: leaf({ phase: "w1" }), 2: leaf({ phase: "w2" }) },
    extra: { phases: { w1: { title: "W1: core" } } },
  });
  plan(root, "gamma", { front: "epic: rewrite", tasks: "- [ ] 1 One\n", entries: { 1: leaf() } });
  epic(root, "rewrite", ["alpha", "beta"]);

  const rewrite = lint(ops, "rewrite");
  assert.deepEqual(codes(rewrite), []);
  assert.equal(rewrite.kind, "epic");
  assert.equal(rewrite.taskCount, 0, "an epic's items are not tasks");
  assert.deepEqual(rewrite.members.map((m) => m.plan), ["alpha", "beta"]);

  const alpha = lint(ops, "alpha");
  assert.deepEqual(codes(alpha), []);
  assert.deepEqual(
    alpha.proposals.map((p) => [p.specKey, p.phase]),
    [
      ["0", null],
      ["1", { id: "build", title: "Build" }],
    ],
  );
  const beta = lint(ops, "beta");
  assert.deepEqual(
    beta.proposals.map((p) => p.phase),
    [
      { id: "w1", title: "W1: core" },
      { id: "w2", title: "w2" },
    ],
    "a manifest value wins and shows its ID without a title",
  );
  // gamma names the epic, which does not list it: a warning, approvable.
  const gamma = lint(ops, "gamma");
  assert.deepEqual(codes(gamma), [["spec.epic-unknown", "warning"]]);
  assert.equal(gamma.canApprove, true);
  assert.equal(gamma.diagnostics[0].file, "requirements.md");
  assert.equal(gamma.diagnostics[0].lineStart, 2);

  // Every epic folder error, each naming its entry.
  epic(root, "bad", ["alpha", "missing", "rewrite", "alpha"]);
  assert.deepEqual(codes(lint(ops, "bad")).sort(), [
    ["spec.epic-member-missing", "error"],
    ["spec.epic-member-twice", "error"],
    ["spec.epic-member-unconfirmed", "error"],
    ["spec.epic-nested", "error"],
  ]);
  epic(root, "old-epic", ["alpha"], { kind: "plan", repository: "app" });
  const old = lint(ops, "old-epic");
  assert.ok(old.diagnostics.some((d) => d.code === "spec.epic-task-fields" && /"kind", "repository"/.test(d.message)));
  writeSpec(root, "member-plan", {
    "requirements.md": "# Old\n",
    "tasks.md": "# Plans\n\n- [ ] 1 Alpha\n",
    "avoozl/manifest.json": JSON.stringify({ kind: "epic", tasks: { 1: { memberPlan: "alpha" } } }),
  });
  const memberPlan = lint(ops, "member-plan");
  assert.deepEqual(codes(memberPlan), [["spec.epic-task-fields", "error"]]);
  assert.match(memberPlan.diagnostics[0].message, /rename "memberPlan" to "plan"/);
  writeSpec(root, "epic-bugfix", { "bugfix.md": "# Fix\n", "requirements.md": null, "tasks.md": "# Plans\n", "avoozl/manifest.json": '{"kind":"epic","tasks":{}}' });
  assert.ok(lint(ops, "epic-bugfix").diagnostics.some((d) => d.code === "spec.epic-bugfix"));

  // The old plan forms are errors, never loaded under another name.
  plan(root, "old", {
    tasks: "- [ ] 1 Parent\n  - [ ] 1.1 Child\n- [ ] 2 Grouped\n",
    entries: { 1: { kind: "epic", summary: "Goal.", requires: ["1.1"] }, 1.1: leaf(), 2: leaf({ epic: "W1" }) },
    extra: { epics: ["W1"] },
  });
  const legacy = lint(ops, "old");
  assert.deepEqual(codes(legacy).sort(), [
    ["spec.entry-epic", "error"],
    ["spec.entry-epic", "error"],
    ["spec.kind-epic", "error"],
  ]);
  assert.equal(legacy.canApprove, false);
  assert.deepEqual(legacy.diagnostics.filter((d) => d.entry).map((d) => d.entry).sort(), ["1", "2"]);
  assert.ok(!legacy.proposals.some((p) => ["1", "2"].includes(p.specKey)), "neither loads");
});

async function approve(ops, name) {
  const created = await ops.execute("plan.create", { spec: name });
  const preview = await ops.execute("plan.preview", { id: created.id });
  return ops.execute("plan.approve", {
    id: created.id,
    expectedHash: created.hash,
    expectedRevision: preview.expectedRevision,
  });
}

test("approving an epic stores its members only; membership needs both sides", async (t) => {
  const { root, store, ops } = workspace(t);
  plan(root, "alpha", {
    front: "epic: rewrite",
    tasks: "## Build\n\n- [ ] 1 Build it\n- [ ] 2 Ship it\n",
    entries: { 1: leaf(), 2: leaf({ requires: ["1"] }) },
  });
  plan(root, "beta", { tasks: "- [ ] 1 One\n", entries: { 1: leaf() } });
  epic(root, "rewrite", ["alpha"]);
  await approve(ops, "alpha");
  const receipt = await approve(ops, "rewrite");
  assert.deepEqual(receipt.taskIds, [], "an epic approval publishes no task");
  const row = store.read().epics.find((e) => e.id === "rewrite");
  assert.deepEqual([row.listed, row.plans, row.title], [["alpha"], ["alpha"], "Epic rewrite"]);
  assert.equal(store.get("plans", "alpha").state, "approved");

  const tasks = store.read().tasks.filter((task) => task.planId === "alpha");
  assert.ok(tasks.every((task) => task.epic === undefined), "a task stores no epic");
  assert.deepEqual(tasks.map((task) => task.phase), [
    { id: "build", title: "Build" },
    { id: "build", title: "Build" },
  ]);
  const got = await ops.execute("plan.get", { id: "alpha" });
  assert.deepEqual([got.epic, got.epicNamed, got.phases], ["rewrite", "rewrite", [{ id: "build", title: "Build" }]]);
  assert.equal((await ops.execute("task.get", { id: tasks[0].id })).epic, "rewrite");

  // The epic read: goal, what done means, members with computed progress.
  const view = await ops.execute("epic.get", { id: "rewrite" });
  assert.equal(view.goal, "Rewrite the runtime.");
  assert.equal(view.done, "Every member plan is done.");
  assert.deepEqual(view.members.map((m) => [m.plan, m.confirmed, m.progress]), [["alpha", true, { done: 0, total: 2 }]]);
  assert.deepEqual(view.members[0].phases, [{ id: "build", title: "Build", done: 0, total: 2 }]);
  assert.equal(view.complete, false);
  const list = await ops.execute("epic.list", {});
  assert.deepEqual(list.items.map((e) => [e.id, e.approved]), [["rewrite", true]]);

  // A graph read names each task's epic and phase; beta has no epic.
  await approve(ops, "beta");
  const graph = await ops.execute("graph.view", {});
  const byPlan = Object.fromEntries(graph.plans.map((p) => [p.id, p]));
  assert.deepEqual([byPlan.alpha.epic, byPlan.beta.epic], ["rewrite", null]);
  assert.deepEqual(graph.epics.map((e) => [e.id, e.count, e.plans]), [["rewrite", 2, ["alpha"]]]);
  const noEpic = await ops.execute("graph.view", { epic: "(none)" });
  assert.deepEqual(
    noEpic.tasks.map((task) => task.planId),
    [null, "beta"],
    "No epic holds plans in no epic and tasks with no plan",
  );
  for (const task of graph.tasks) assert.ok(!String(task.epic ?? "").startsWith("doc:"));
});

test("a task names no epic, and its phase is {id, title}", async (t) => {
  const { ops } = workspace(t);
  await assert.rejects(ops.execute("task.update", { id: "sample-task", epic: "W1" }), /names no epic/);
  await assert.rejects(ops.execute("task.update", { id: "sample-task", kind: "epic" }), /package/);
  await ops.execute("task.update", { id: "sample-task", epic: null, phase: { id: "w1", title: "W1" } });
  const task = ops.read().tasks.find((entry) => entry.id === "sample-task");
  assert.deepEqual([task.epic, task.phase], [undefined, { id: "w1", title: "W1" }]);
  await assert.rejects(ops.execute("task.update", { id: "sample-task", phase: { id: "bad id" } }), /phase is/);
  await ops.execute("task.update", { id: "sample-task", phase: null });
  assert.equal(ops.read().tasks.find((entry) => entry.id === "sample-task").phase, undefined);
  // An archive may say why; an unarchive clears it.
  await assert.rejects(ops.execute("task.archive", { id: "sample-task", reason: "two\nlines" }), /one line/);
  await ops.execute("task.archive", { id: "sample-task", reason: "plan removed" });
  assert.equal(ops.read().tasks.find((entry) => entry.id === "sample-task").archivedReason, "plan removed");
  await ops.execute("task.unarchive", { id: "sample-task" });
  assert.equal(ops.read().tasks.find((entry) => entry.id === "sample-task").archivedReason, undefined);
});
