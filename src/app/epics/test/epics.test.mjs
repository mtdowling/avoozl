// Epics span plans, phases sit inside plans (Requirement 59, design §6.9):
// the spec reader's epic folders and validation codes, phases from the
// manifest and tasks.md headings, two-sided membership, and the reads.
import assert from "node:assert/strict";
import test from "node:test";
import { crossPlanEpics } from "../epics.mjs";
import { Operations } from "../../api/operations.mjs";
import { Store } from "../../store/store.mjs";
import { frontMatter } from "../../../front-matter.mjs";
import {
  headingPhases,
  lintSpec,
  readSpecFolder,
} from "../../specs/spec-plans.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { writeSpec } from "../../test/spec-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

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
    "avoozl/manifest.json": JSON.stringify(
      { tasks: entries, ...extra },
      null,
      2,
    ),
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
          members.map((m, i) => [
            String(i + 1),
            { plan: m, summary: `Plan ${m}.`, ...entryExtra },
          ]),
        ),
      },
      null,
      2,
    ),
  });
}

const lint = (ops, name) =>
  lintSpec({
    spec: readSpecFolder(ops.workspaceRoot, name),
    plan: { id: name },
    namespace: ops.specNamespace(),
  });
const codes = (quality) => quality.diagnostics.map((d) => [d.code, d.severity]);

test("front-matter names an epic beside a category; a bad name is a problem", () => {
  const block = frontMatter(
    "---\ncategory: Runtime\nepic: rewrite\n---\n# T\n",
  );
  assert.equal(block.category, "Runtime");
  assert.equal(block.epic, "rewrite");
  assert.equal(block.epicLine, 3);
  const bad = frontMatter("---\nepic: Not A Folder\n---\n# T\n");
  assert.equal(bad.epic, null);
  assert.match(bad.problem.message, /spec folder name/);
  assert.match(
    frontMatter("---\nepic: a\nepic: b\n---\n").problem.message,
    /twice/,
  );
});

test("phases come from the nearest heading, else No phase", () => {
  const text =
    "# Tasks\n\n- [ ] 0 Before\n\n## Phase 1: Load\n\n- [ ] 1 One\n\n### Detail\n\n- [ ] 2 Two\n\n## Phase 1: Load\n\n- [ ] 3 Three\n";
  const byLine = headingPhases(text);
  assert.equal(
    byLine.get(3),
    undefined,
    "an item under the title only has no phase",
  );
  assert.deepEqual(byLine.get(7), {
    id: "phase-1-load",
    title: "Phase 1: Load",
  });
  assert.deepEqual(byLine.get(11), { id: "detail", title: "Detail" });
  assert.deepEqual(
    byLine.get(15),
    { id: "phase-1-load-2", title: "Phase 1: Load" },
    "a repeated heading gets -2",
  );
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

test("a task names no epic, and its phase is {id, title}", async (t) => {
  const { ops } = workspace(t);
  await assert.rejects(
    ops.execute("task.update", { id: "sample-task", epic: "W1" }),
    /names no epic/,
  );
  await assert.rejects(
    ops.execute("task.update", { id: "sample-task", kind: "epic" }),
    /package/,
  );
  await ops.execute("task.update", {
    id: "sample-task",
    epic: null,
    phase: { id: "w1", title: "W1" },
  });
  const task = ops.read().tasks.find((entry) => entry.id === "sample-task");
  assert.deepEqual(
    [task.epic, task.phase],
    [undefined, { id: "w1", title: "W1" }],
  );
  await assert.rejects(
    ops.execute("task.update", { id: "sample-task", phase: { id: "bad id" } }),
    /phase is/,
  );
  await ops.execute("task.update", { id: "sample-task", phase: null });
  assert.equal(
    ops.read().tasks.find((entry) => entry.id === "sample-task").phase,
    undefined,
  );
  // An archive may say why; an unarchive clears it.
  await assert.rejects(
    ops.execute("task.archive", { id: "sample-task", reason: "two\nlines" }),
    /one line/,
  );
  await ops.execute("task.archive", {
    id: "sample-task",
    reason: "plan removed",
  });
  assert.equal(
    ops.read().tasks.find((entry) => entry.id === "sample-task").archivedReason,
    "plan removed",
  );
  await ops.execute("task.unarchive", { id: "sample-task" });
  assert.equal(
    ops.read().tasks.find((entry) => entry.id === "sample-task").archivedReason,
    undefined,
  );
  // A long title imported before the limit does not block another field.
  ops.store.mutate("Long title", (data) => {
    data.tasks.find((entry) => entry.id === "sample-task").title = "x".repeat(
      300,
    );
  });
  await ops.execute("task.update", {
    id: "sample-task",
    phase: { id: "w2", title: "W2" },
  });
  await assert.rejects(
    ops.execute("task.update", { id: "sample-task", title: "y".repeat(241) }),
    /1–240/,
  );
});

// Epic rows from before Requirement 59 and tasks that name them, written
// as an older Avoozl left them: no planId, and no commit to give one.
function writeLegacy(store) {
  const data = structuredClone(store.read()),
    task = (id, epic, extra = {}) => ({
      id,
      title: `Task ${id}`,
      scope: "catalog",
      status: "planned",
      track: "catalog",
      epic,
      ...extra,
    });
  data.epics = [
    ...(data.epics || []),
    {
      id: "W1",
      title: "Core execution",
      color: "#a7b8ff",
      context: { document: ".kiro/specs/alpha/design.md", lineStart: 3 },
    },
    { id: "grouped", title: "Grouped", scope: "catalog" },
    { id: "inbox", title: "Inbox", scope: "catalog" },
    { id: "mixed", title: "Mixed", scope: "catalog" },
    { id: "unnamed", title: "Named by no task", scope: "catalog" },
  ];
  data.tasks.push(
    task("w1-task", "W1"),
    task("grouped-task", "grouped", {
      contextDocuments: [".kiro/specs/alpha/design.md", "AGENTS.md"],
    }),
    task("inbox-task", "inbox"),
    task("mixed-a", "mixed", {
      contextDocuments: [".kiro/specs/alpha/design.md"],
    }),
    task("mixed-b", "mixed", {
      contextDocuments: [".kiro/specs/beta/design.md"],
    }),
  );
  data.revision += 1;
  store.write(data);
}

const owners = (store) =>
  Object.fromEntries(
    store.read().epics.map((epic) => [epic.id, [epic.kind, epic.planId]]),
  );

test("an epic from before Requirement 59 gets its plan on open, once", async (t) => {
  const { root, store, ops } = workspace(t);
  plan(root, "alpha", { tasks: "- [ ] 1 One\n", entries: { 1: leaf() } });
  plan(root, "beta", { tasks: "- [ ] 1 One\n", entries: { 1: leaf() } });
  await approve(ops, "alpha");
  await approve(ops, "beta");
  writeLegacy(store);
  const before = store.read().revision;
  store.close();

  const opened = new Store(store.filename);
  assert.deepEqual(owners(opened), {
    W1: ["plan", "alpha"],
    grouped: ["plan", "alpha"],
    inbox: ["doc", "inbox"],
    mixed: ["doc", "mixed"],
    unnamed: ["doc", "unnamed"],
  });
  const w1 = opened.read().epics.find((epic) => epic.id === "W1");
  assert.equal(w1.color, "#a7b8ff", "the row keeps what it had");
  assert.equal(opened.read().revision, before + 1);
  assert.match(opened.read().changelog[0].summary, /Requirement 59/);
  assert.equal(
    crossPlanEpics(opened.read()).length,
    0,
    "an owned row from before Requirement 59 is no cross-plan epic",
  );

  opened.close();
  const again = new Store(store.filename);
  t.after(() => again.close());
  assert.equal(
    again.read().revision,
    before + 1,
    "a second open writes nothing",
  );
});

test("a commit gives each epic from before Requirement 59 its plan", async (t) => {
  const { root, store, ops } = workspace(t);
  plan(root, "alpha", { tasks: "- [ ] 1 One\n", entries: { 1: leaf() } });
  await approve(ops, "alpha");
  writeLegacy(store);
  store.mutate("Any change", () => {});
  assert.deepEqual(owners(store).W1, ["plan", "alpha"]);
  assert.deepEqual(owners(store).inbox, ["doc", "inbox"]);
});
