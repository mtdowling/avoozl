// Epic lifecycle rows and approval evidence (Requirement 59.1, 102.18,
// design §4.32.6). Temporary workspaces and fakes only.
import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { mayLinkSpecIssue } from "../../github/source-backlinks.mjs";
import {
  epicMembers,
  lintSpec,
  readSpecFolder,
} from "../../specs/spec-plans.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { writeSpec } from "../../test/spec-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const leaf = {
  kind: "leaf",
  summary: "Do it.",
  acceptance: ["A missing file yields defaults."],
  checks: ["npm test"],
  completion: "integrated",
};

function plan(root, name, summary = "Do it.") {
  writeSpec(root, name, {
    "requirements.md": `---\nepic: launch\n---\n# Plan ${name}\n\nThe goal.\n`,
    "tasks.md": "# Tasks\n\n- [ ] 1 Build it\n",
    "avoozl/manifest.json": JSON.stringify({
      tasks: { 1: { ...leaf, summary } },
    }),
  });
}

// An epic folder with one row per [plan, step]; `checked` rows carry [x].
function epic(root, rows, { checked = false } = {}) {
  writeSpec(root, "launch", {
    "requirements.md": "# Epic launch\n\nShip it.\n",
    "design.md": "# Design\n",
    "tasks.md": `# Plans\n\n${rows.map((_, i) => `- [${checked ? "x" : " "}] ${i + 1} Row ${i + 1}\n`).join("")}`,
    "avoozl/manifest.json": JSON.stringify({
      kind: "epic",
      tasks: Object.fromEntries(
        rows.map(([plan, step], i) => [
          String(i + 1),
          { plan, ...(step ? { step } : {}) },
        ]),
      ),
    }),
  });
}

function workspace(t) {
  const { root, store } = fixture(t);
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}
const lint = (ops, name) =>
  lintSpec({
    spec: readSpecFolder(ops.workspaceRoot, name),
    plan: { id: name },
    namespace: ops.specNamespace(),
  });

test("epic rows take a step, default implement, once per plan and step", (t) => {
  const { root, ops } = workspace(t);
  plan(root, "alpha");
  epic(root, [["alpha", "design"], ["alpha", "review"], ["alpha"]]);
  const quality = lint(ops, "launch");
  assert.deepEqual(quality.diagnostics, []);
  assert.deepEqual(
    quality.members.map((m) => m.step),
    ["design", "review", "implement"],
  );
  assert.deepEqual(epicMembers(readSpecFolder(root, "launch").files), [
    "alpha",
  ]);
  epic(root, [["alpha", "implement"], ["alpha"]]);
  assert.deepEqual(
    lint(ops, "launch").diagnostics.map((d) => d.code),
    ["spec.epic-member-twice"],
  );
  epic(root, [["alpha", "ship"]]);
  assert.match(lint(ops, "launch").diagnostics[0].message, /step must be/);
  // Task fields stay refused on a row.
  writeSpec(root, "launch", {
    "avoozl/manifest.json": JSON.stringify({
      kind: "epic",
      tasks: { 1: { plan: "alpha", step: "design", repository: "app" } },
    }),
    "tasks.md": "# Plans\n\n- [ ] 1 Row\n",
  });
  assert.deepEqual(
    lint(ops, "launch").diagnostics.map((d) => d.code),
    ["spec.epic-task-fields"],
  );
});

test("rows derive from member state and never from checkmarks", async (t) => {
  const { root, store, ops } = workspace(t);
  plan(root, "alpha");
  epic(root, [["alpha", "design"], ["alpha", "review"], ["alpha"]], {
    checked: true,
  });
  const rows = async () =>
    (await ops.execute("epic.get", { id: "launch" })).rows.map((row) => [
      row.step,
      row.done,
    ]);
  assert.deepEqual(await rows(), [
    ["design", false],
    ["review", false],
    ["implement", false],
  ]);
  const created = await ops.execute("plan.create", { spec: "alpha" });
  assert.deepEqual(await rows(), [
    ["design", false],
    ["review", false],
    ["implement", false],
  ]);
  const preview = await ops.execute("plan.preview", { id: created.id });
  const receipt = await ops.execute("plan.approve", {
    id: created.id,
    expectedHash: created.hash,
    expectedRevision: preview.expectedRevision,
  });
  // A folder outside git: an explicit local approval.
  assert.equal(receipt.approval.kind, "local");
  assert.deepEqual(await rows(), [
    ["design", true],
    ["review", true],
    ["implement", false],
  ]);
  const [task] = store.read().tasks.filter((entry) => entry.planId === "alpha");
  await ops.execute("task.update", { id: task.id, status: "accepted" });
  assert.deepEqual(await rows(), [
    ["design", true],
    ["review", true],
    ["implement", true],
  ]);
  // An edited spec is stale: its approval no longer covers this revision.
  plan(root, "alpha", "Do it differently.");
  const saved = await ops.execute("plan.save", {
    id: created.id,
    expectedHash: created.hash,
  });
  assert.notEqual(saved.hash, created.hash);
  assert.deepEqual(await rows(), [
    ["design", false],
    ["review", false],
    ["implement", false],
  ]);
});

const SHA = "0123456789abcdef0123456789abcdef01234567";

test("a public pull request never names a private spec issue", () => {
  assert.equal(
    mayLinkSpecIssue({ pullPrivate: false, issuePrivate: false }),
    true,
  );
  assert.equal(
    mayLinkSpecIssue({ pullPrivate: true, issuePrivate: true }),
    true,
  );
  assert.equal(
    mayLinkSpecIssue({ pullPrivate: true, issuePrivate: false }),
    true,
  );
  assert.equal(
    mayLinkSpecIssue({ pullPrivate: false, issuePrivate: true }),
    false,
  );
  assert.equal(
    mayLinkSpecIssue({ pullPrivate: undefined, issuePrivate: false }),
    false,
  );
});

test("an approval read from git names the approver's commit, and review is done", async (t) => {
  const { root, store, ops } = workspace(t);
  plan(root, "alpha");
  epic(root, [["alpha", "review"]]);
  const created = await ops.execute("plan.create", { spec: "alpha" });
  assert.deepEqual(
    ops.adoptApprovals(
      new Map([
        [
          created.id,
          { spec: "alpha", commit: SHA, email: "owner@example.test" },
        ],
      ]),
    ),
    [created.id],
  );
  const receipt = store
    .list("approvals")
    .find((entry) => entry.planId === created.id);
  assert.deepEqual(receipt.approval, {
    kind: "commit",
    commit: SHA,
    approvedBy: "owner@example.test",
  });
  const rows = (await ops.execute("epic.get", { id: "launch" })).rows;
  assert.deepEqual(
    rows.map((row) => [row.step, row.done]),
    [["review", true]],
  );
});
