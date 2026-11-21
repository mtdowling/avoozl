import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { queryTasks } from "../../../model.mjs";
import {
  lintSpec,
  readCritique,
  readSpecFolder,
  specItems,
  taskToken,
} from "../spec-plans.mjs";
import { fixture } from "../../test/fixtures.mjs";
import {
  legacySpecFiles,
  specFiles,
  tasksWithFacts,
  writeSpec,
} from "../../test/spec-fixture.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

const lint = (root, name = "config") =>
  lintSpec({ spec: readSpecFolder(root, name), plan: { id: name } });
const lineOf = (text, needle) =>
  text.slice(0, text.indexOf(needle)).split("\n").length;
const codes = (result) =>
  result.diagnostics.map((d) => `${d.code} ${d.file}:${d.lineStart}`);

// No machine-wide Avoozl configuration leaks into these workspaces.
process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

function setMode(root, github) {
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, github }),
  );
}

function workspace(t) {
  const { root, store } = fixture(t);
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

test("tasks.md items map to stable IDs; fenced examples and plain words are not items", () => {
  const items = specItems(
    "config",
    [
      "- [ ] 1. Epic",
      "  - [x] 1.2 Done leaf",
      "```markdown",
      "- [ ] 9 An example",
      "```",
      "- [ ]* w3.reactor-timers Migrated",
      "- [ ] Write tests",
    ].join("\n"),
  );
  assert.deepEqual(
    items.map((item) => [item.id, item.title, item.line]),
    [
      ["config.1", "Epic", 1],
      ["config.1.2", "Done leaf", 2],
      ["w3.reactor-timers", "Migrated", 6],
      [null, "Write tests", 7],
    ],
  );
});

test("a valid feature spec yields its leaves and manifest edges", () => {
  const root = temporaryDirectory();
  writeSpec(root, "config");
  const result = lint(root);
  assert.deepEqual(codes(result), []);
  assert.equal(result.canApprove, true);
  assert.equal(result.type, "feature");
  const validator = result.proposals.find((p) => p.id === "config.1.2");
  assert.deepEqual(validator.requires, ["config.1.1"]);
  assert.equal(
    validator.lineStart,
    lineOf(specFiles()["tasks.md"], "1.2 Validate"),
  );
});

test("a missing folder is refused", () => {
  const root = temporaryDirectory();
  assert.deepEqual(codes(lint(root, "absent")), [
    "spec.missing-folder .kiro/specs/absent/:1",
  ]);
});

test("only tasks.md is required", () => {
  const root = temporaryDirectory();
  writeSpec(root, "config", { "design.md": null });
  assert.deepEqual(codes(lint(root)), []);
  writeSpec(root, "bare", { "design.md": null, "requirements.md": null });
  const bare = lint(root, "bare");
  assert.deepEqual(codes(bare), []);
  assert.equal(bare.type, "feature");
  assert.ok(bare.taskCount > 0);
  writeSpec(root, "tasks", { "tasks.md": null });
  assert.deepEqual(codes(lint(root, "tasks")), [
    "spec.missing-file tasks.md:1",
  ]);
});

test("a leftover avoozl/manifest.json is an error that says to delete it", () => {
  const root = temporaryDirectory(),
    directory = writeSpec(root, "config");
  fs.writeFileSync(path.join(directory, "avoozl/manifest.json"), "{}\n");
  const before = readSpecFolder(root, "config");
  const result = lint(root);
  assert.deepEqual(codes(result), [
    "spec.manifest-left avoozl/manifest.json:1",
  ]);
  assert.match(result.diagnostics[0].message, /Delete .*manifest\.json/);
  assert.equal(result.canApprove, false);
  // Nothing reads it: it is not part of the revision hash.
  fs.writeFileSync(path.join(directory, "avoozl/manifest.json"), "[]\n");
  assert.equal(readSpecFolder(root, "config").hash, before.hash);
});

test("a spec has at most one of requirements.md and bugfix.md", () => {
  const root = temporaryDirectory();
  writeSpec(root, "neither", { "requirements.md": null });
  assert.deepEqual(codes(lint(root, "neither")), []);
  writeSpec(root, "both", { "bugfix.md": "# Bug\n" });
  assert.deepEqual(codes(lint(root, "both")), ["spec.kind bugfix.md:1"]);
});

test("a bugfix spec reads the same way as a feature spec", () => {
  const root = temporaryDirectory();
  writeSpec(root, "fix", {
    "requirements.md": null,
    "bugfix.md": "# Fix the crash\n",
  });
  const result = lint(root, "fix");
  assert.deepEqual(codes(result), []);
  assert.equal(result.type, "bugfix");
});

test("a bugfix spec's unchanged behavior is acceptance on its fix leaves", () => {
  const root = temporaryDirectory();
  writeSpec(root, "fix", {
    "requirements.md": null,
    "bugfix.md": [
      "# Fix the crash",
      "",
      "### Current Behavior (Defect)",
      "",
      "1.1 WHEN the file is empty THEN the system crashes",
      "",
      "### Unchanged Behavior (Regression Prevention)",
      "",
      "3.1 WHEN keys are valid THEN the system SHALL CONTINUE TO load them",
      "- 3.2 WHEN no file exists THEN the system SHALL CONTINUE TO use defaults",
      "",
      "## Notes",
      "",
      "Not a clause.",
    ].join("\n"),
  });
  const result = lint(root, "fix"),
    clauses = [
      "WHEN keys are valid THEN the system SHALL CONTINUE TO load them",
      "WHEN no file exists THEN the system SHALL CONTINUE TO use defaults",
    ];
  assert.deepEqual(codes(result), []);
  const byId = Object.fromEntries(result.proposals.map((p) => [p.id, p]));
  assert.deepEqual(byId["fix.1.1"].acceptance, [
    "A missing file yields defaults.",
    ...clauses,
  ]);
  assert.deepEqual(byId["fix.1.2"].acceptance.slice(1), clauses);
  // A group holds no results of its own.
  assert.equal(byId["fix.1"].acceptance, undefined);
  // A feature spec gains nothing.
  writeSpec(root, "config");
  assert.deepEqual(
    lint(root, "config").proposals.find((p) => p.id === "config.1.1")
      .acceptance,
    ["A missing file yields defaults."],
  );
});

test("a missing file names its folder", () => {
  const root = temporaryDirectory();
  writeSpec(root, "config", { "tasks.md": null });
  const result = lintSpec({
    spec: {
      name: "config",
      exists: true,
      files: readSpecFolder(root, "config").files,
    },
  });
  assert.equal(
    result.diagnostics.find((d) => d.file === "tasks.md").message,
    "Add .kiro/specs/config/tasks.md, or a ## Tasks section to the spec's one file.",
  );
});

test("an item with no ID is refused at its line", () => {
  const root = temporaryDirectory();
  const text = specFiles()["tasks.md"] + "- [ ] Write the docs\n";
  writeSpec(root, "config", { "tasks.md": text, "avoozl/manifest.json": null });
  assert.deepEqual(codes(lint(root)), [
    `task.missing-id tasks.md:${lineOf(text, "Write the docs")}`,
  ]);
});

test("a repeated ID is refused at its second line", () => {
  const root = temporaryDirectory();
  const text = specFiles()["tasks.md"] + "- [ ] 1.1 Read it again\n";
  writeSpec(root, "config", { "tasks.md": text, "avoozl/manifest.json": null });
  const result = lint(root);
  assert.deepEqual(codes(result), [
    `task.duplicate-id tasks.md:${lineOf(text, "Read it again")}`,
  ]);
  assert.match(
    result.diagnostics[0].message,
    new RegExp(`line ${lineOf(text, "1.1 Read the")}`),
  );
});

test("a task with no Facts bullet is refused at its line", () => {
  const root = temporaryDirectory(),
    text = specFiles()["tasks.md"] + "- [ ] 2.1 Document it\n";
  writeSpec(root, "config", { "tasks.md": text, "avoozl/manifest.json": null });
  assert.deepEqual(codes(lint(root)), [
    `done.missing tasks.md:${lineOf(text, "2.1 Document")}`,
  ]);
});

test("an ID owned by another plan is refused", () => {
  const root = temporaryDirectory();
  writeSpec(root, "config");
  const result = lintSpec({
    spec: readSpecFolder(root, "config"),
    plan: { id: "config" },
    data: {
      tasks: [{ id: "config.1.1", title: "Other", planId: "other-plan" }],
    },
  });
  assert.deepEqual(codes(result), [
    `task.duplicate-id tasks.md:${lineOf(specFiles()["tasks.md"], "1.1 Read")}`,
  ]);
});

test("the revision hash covers the spec files but not the critique", () => {
  const root = temporaryDirectory(),
    directory = writeSpec(root, "config"),
    before = readSpecFolder(root, "config").hash;
  fs.writeFileSync(path.join(directory, "avoozl/critique.md"), "Reviewed:\n");
  assert.equal(readSpecFolder(root, "config").hash, before);
  fs.appendFileSync(path.join(directory, "design.md"), "More.\n");
  assert.notEqual(readSpecFolder(root, "config").hash, before);
});

test("a symlink out of the planning root reads as a missing file", () => {
  const root = temporaryDirectory(),
    outside = temporaryDirectory(),
    directory = writeSpec(root, "config", { "design.md": null });
  fs.writeFileSync(path.join(outside, "secret.md"), "secret");
  fs.symlinkSync(
    path.join(outside, "secret.md"),
    path.join(directory, "design.md"),
  );
  const spec = readSpecFolder(root, "config");
  assert.equal(spec.files["design.md"], undefined);
  fs.symlinkSync(outside, path.join(root, ".kiro", "specs", "linked"));
  assert.equal(readSpecFolder(root, "linked").exists, false);
});

test("a spec name cannot leave the specs directory", () => {
  const root = temporaryDirectory();
  for (const name of ["../config", "Config", "a/b", "", "x".repeat(81)])
    assert.throws(() => readSpecFolder(root, name), /Name one spec folder/);
});

test("the critique is current only for the hash it names", () => {
  const hash = "a".repeat(64),
    text = [
      `Reviewed: .kiro/specs/config/ ${hash}`,
      "",
      "```finding",
      '{"kind": "missing-edge", "task": "1.2", "text": "Add 1.1."}',
      "```",
      "```finding",
      "not json",
      "```",
    ].join("\n");
  const current = readCritique(text, hash);
  assert.equal(current.current, true);
  assert.deepEqual(
    current.findings.map((f) => [f.kind, f.task, f.line]),
    [
      ["missing-edge", "1.2", 3],
      ["unreadable", null, 6],
    ],
  );
  assert.equal(readCritique(text, "b".repeat(64)).current, false);
  assert.equal(readCritique(null, hash), null);
});

test("a spec plan is created, reloaded, and approved by its folder hash", async (t) => {
  const { root, store, ops } = workspace(t),
    directory = writeSpec(root, "config");
  await assert.rejects(
    ops.execute("plan.create", { spec: "absent" }),
    (error) => error.status === 404,
  );
  const plan = await ops.execute("plan.create", {
    spec: "config",
    prompt: "Load config",
  });
  assert.equal(plan.id, "config");
  assert.equal(plan.title, "Load configuration");
  assert.equal(plan.hash, readSpecFolder(root, "config").hash);
  assert.equal(
    (await ops.execute("plan.create", { spec: "config" })).revision,
    1,
    "creating the same folder again returns the stored plan",
  );
  // Reloading an unchanged folder writes nothing.
  assert.equal(
    (await ops.execute("plan.save", { id: "config", expectedHash: plan.hash }))
      .revision,
    1,
  );
  fs.appendFileSync(path.join(directory, "design.md"), "Edge cases.\n");
  await assert.rejects(
    ops.execute("plan.approve", {
      id: "config",
      expectedHash: plan.hash,
      expectedRevision: ops.read().revision,
    }),
    /changed on disk/,
  );
  const saved = await ops.execute("plan.save", {
    id: "config",
    expectedHash: plan.hash,
  });
  assert.equal(saved.revision, 2);
  const preview = await ops.execute("plan.preview", { id: "config" });
  assert.equal(preview.reviewedHash, saved.hash);
  assert.deepEqual(
    preview.tasks.map((task) => task.taskId),
    ["config.1", "config.1.1", "config.1.2"],
  );
  const receipt = await ops.execute("plan.approve", {
    id: "config",
    expectedHash: saved.hash,
    expectedRevision: preview.expectedRevision,
  });
  assert.equal(receipt.spec, "config");
  const data = store.read(),
    leaf = data.tasks.find((task) => task.id === "config.1.2");
  assert.equal(leaf.source.document, "spec:config");
  assert.equal(
    leaf.source.lineStart,
    lineOf(specFiles()["tasks.md"], "1.2 Validate"),
  );
  assert.equal(leaf.approvedSource.text, "  - [ ] 1.2 Validate loaded config");
  assert.ok(
    data.edges.some(
      (e) =>
        e.from === "config.1.1" &&
        e.to === "config.1.2" &&
        e.kind === "requires",
    ),
  );
  // Approval writes no plan file and queues no Markdown projection.
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM outbox").get().n, 0);
  assert.equal(fs.existsSync(path.join(root, "plans")), false);
});

test("approval is refused while the spec has an error", async (t) => {
  const { root, ops } = workspace(t);
  writeSpec(root, "config", {
    "tasks.md": specFiles()["tasks.md"] + "- [ ] Write the docs\n",
  });
  const plan = await ops.execute("plan.create", { spec: "config" });
  assert.equal(
    (await ops.execute("plan.lint", { id: "config" })).canApprove,
    false,
  );
  await assert.rejects(
    ops.execute("plan.approve", {
      id: "config",
      expectedHash: plan.hash,
      expectedRevision: ops.read().revision,
    }),
    /task\.missing-id/,
  );
});

test("plan.specs lists folders with their diagnostics, critique, and plan", async (t) => {
  const { root, ops } = workspace(t);
  writeSpec(root, "config");
  writeSpec(root, "broken", { "tasks.md": null });
  fs.mkdirSync(path.join(root, ".kiro", "specs", "Not_A_Spec"));
  await ops.execute("plan.create", { spec: "config" });
  const { items } = await ops.execute("plan.specs");
  assert.deepEqual(
    items.map((item) => [
      item.name,
      item.counts.error,
      item.plan?.state ?? null,
    ]),
    [
      ["broken", 1, null],
      ["config", 0, "draft"],
    ],
  );
  assert.equal(items[1].plan.changed, false);
  assert.equal(items[1].critique, null);
});

test("plan.get reports the folder on disk and its critique", async (t) => {
  const { root, ops } = workspace(t),
    directory = writeSpec(root, "config"),
    plan = await ops.execute("plan.create", { spec: "config" });
  fs.writeFileSync(
    path.join(directory, "avoozl/critique.md"),
    `Reviewed: .kiro/specs/config/ ${plan.hash}\n\nNo findings.\n`,
  );
  const read = await ops.execute("plan.get", { id: "config" });
  assert.equal(read.disk.changed, false);
  assert.equal(read.disk.critique.current, true);
  assert.equal(read.quality.canApprove, true);
});

test("spec folders live in the planning repository when one is configured", async (t) => {
  const { root, store, ops } = workspace(t),
    planning = temporaryDirectory();
  writeSpec(planning, "config");
  store.setMeta("workspaceRepository", { root: planning, directory: "." });
  assert.deepEqual(ops.specRoots(), [planning]);
  assert.equal(
    (await ops.execute("plan.create", { spec: "config" })).spec,
    "config",
  );
  assert.equal(fs.existsSync(path.join(root, ".kiro")), false);
});

const approve = async (ops, id = "config", input = {}) => {
  const preview = await ops.execute("plan.preview", { id });
  return ops.execute("plan.approve", {
    id,
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
    ...input,
  });
};

test("re-approval marks only the changed entry for review", async (t) => {
  const { root, ops } = workspace(t),
    directory = writeSpec(root, "config"),
    plan = await ops.execute("plan.create", { spec: "config" }),
    tasksFile = path.join(directory, "tasks.md");
  await approve(ops);
  const ready = () =>
    queryTasks(ops.read(), { scope: "all", q: "ready:true" }).map(
      (task) => task.id,
    );
  const review = () =>
    Object.fromEntries(
      ops
        .read()
        .tasks.filter((task) => task.planId === "config")
        .map((task) => [task.id, Boolean(task.needsReview)]),
    );
  assert.ok(ready().includes("config.1.1"));
  fs.writeFileSync(
    tasksFile,
    fs
      .readFileSync(tasksFile, "utf8")
      .replace(
        "    - An unknown key is reported with its path.",
        "    - An unknown key or a bad type is reported with its path.",
      ),
  );
  await ops.execute("plan.save", { id: "config", expectedHash: plan.hash });
  // The draft holds every task until it is approved.
  assert.deepEqual(review(), {
    "config.1": true,
    "config.1.1": true,
    "config.1.2": true,
  });
  await approve(ops);
  assert.deepEqual(review(), {
    "config.1": false,
    "config.1.1": false,
    "config.1.2": true,
  });
  assert.ok(ready().includes("config.1.1"));
  // Needs you can show what changed: the task text as last reviewed is kept.
  const tasks = ops.read().tasks;
  const prior = tasks.find((task) => task.id === "config.1.2").reviewPrior;
  assert.equal(prior.summary ?? null, null);
  assert.ok(prior.title);
  assert.equal(
    tasks.find((task) => task.id === "config.1.1").reviewPrior,
    undefined,
  );
});

test("Kiro's checkbox marks do not change the revision", async (t) => {
  const { root, ops } = workspace(t),
    directory = writeSpec(root, "config"),
    plan = await ops.execute("plan.create", { spec: "config" }),
    tasks = path.join(directory, "tasks.md");
  fs.writeFileSync(
    tasks,
    fs
      .readFileSync(tasks, "utf8")
      .replace("- [ ] 1.1", "- [x] 1.1")
      .replace("- [ ] 1.2", "- [-] 1.2"),
  );
  assert.equal(readSpecFolder(root, "config").hash, plan.hash);
  assert.equal(
    (await ops.execute("plan.get", { id: "config" })).disk.changed,
    false,
  );
  await approve(ops);
  // A mark is not Avoozl state: the approved leaf is not done.
  assert.notEqual(
    ops.read().tasks.find((task) => task.id === "config.1.1").status,
    "done",
  );
});

test("an item nested under an epic is its child; flat items have no parent", () => {
  const root = temporaryDirectory();
  writeSpec(root, "config");
  const parents = (result) =>
    Object.fromEntries(result.proposals.map((p) => [p.id, p.parent ?? null]));
  assert.deepEqual(parents(lint(root)), {
    "config.1": null,
    "config.1.1": "config.1",
    "config.1.2": "config.1",
  });
  const flat = temporaryDirectory();
  writeSpec(flat, "config", {
    "tasks.md":
      "- [ ] 1 Load and validate configuration\n- [ ] 1.1 Read the config file\n- [ ] 1.2 Validate loaded config\n",
  });
  assert.deepEqual(Object.values(parents(lint(flat))), [null, null, null]);
});

test("an item with sub-items is a package", () => {
  const root = temporaryDirectory(),
    text = tasksWithFacts(
      "- [ ] 1 Load and validate configuration\n  - [ ] 1.1 Read the config file\n    - [ ] 1.2 Validate loaded config\n",
    );
  writeSpec(root, "config", { "tasks.md": text });
  const kinds = Object.fromEntries(
    lint(root).proposals.map((p) => [p.specKey, [p.kind, p.parent ?? null]]),
  );
  assert.deepEqual(kinds, {
    1: ["package", null],
    1.1: ["package", "config.1"],
    1.2: ["leaf", "config.1.1"],
  });
});

test("approval sets each nested task's parent and re-approval moves it", async (t) => {
  const { root, ops } = workspace(t),
    directory = writeSpec(root, "config"),
    plan = await ops.execute("plan.create", { spec: "config" });
  await approve(ops);
  const parents = () =>
    Object.fromEntries(
      ops
        .read()
        .tasks.filter((task) => task.planId === "config")
        .map((task) => [task.id, task.parent ?? null]),
    );
  assert.deepEqual(parents(), {
    "config.1": null,
    "config.1.1": "config.1",
    "config.1.2": "config.1",
  });
  // 1.2 moves out from under the epic.
  fs.writeFileSync(
    path.join(directory, "tasks.md"),
    tasksWithFacts(
      "- [ ] 1 Load and validate configuration\n  - [ ] 1.1 Read the config file\n- [ ] 1.2 Validate loaded config\n",
    ),
  );
  await ops.execute("plan.save", { id: "config", expectedHash: plan.hash });
  await approve(ops);
  assert.equal(parents()["config.1.2"], null);
  assert.equal(
    ops.read().tasks.find((task) => task.id === "config.1.2").needsReview,
    true,
  );
});

test("an approved ID whose item text changed is refused until approved", async (t) => {
  const { root, ops } = workspace(t),
    directory = writeSpec(root, "config"),
    plan = await ops.execute("plan.create", { spec: "config" }),
    tasks = path.join(directory, "tasks.md");
  await approve(ops);
  // Renumbering: 1.2 now names other work.
  fs.writeFileSync(
    tasks,
    fs
      .readFileSync(tasks, "utf8")
      .replace("1.2 Validate loaded config", "1.2 Write the config file"),
  );
  await ops.execute("plan.save", { id: "config", expectedHash: plan.hash });
  const quality = await ops.execute("plan.lint", { id: "config" });
  assert.deepEqual(codes(quality), [
    `task.changed-text tasks.md:${lineOf(specFiles()["tasks.md"], "1.2 Validate")}`,
  ]);
  assert.equal(quality.diagnostics[0].taskId, "config.1.2");
  await assert.rejects(approve(ops), /task\.changed-text/);
  await approve(ops, "config", { retitled: ["1.2"] });
  assert.equal(
    ops.read().tasks.find((task) => task.id === "config.1.2").title,
    "Write the config file",
  );
  assert.deepEqual(codes(await ops.execute("plan.lint", { id: "config" })), []);
});

test("single-repo mode reads spec folders from code repositories only", async (t) => {
  const { root, store, ops } = workspace(t),
    app = temporaryDirectory(),
    lib = temporaryDirectory();
  writeSpec(root, "planning-only");
  writeSpec(app, "config");
  setMode(root, { mode: "single-repo" });
  store.put("repositories", {
    id: "app",
    root: app,
    baseBranch: "main",
    checks: [],
  });
  store.put("repositories", {
    id: "lib",
    root: lib,
    baseBranch: "main",
    checks: [],
  });
  const listed = await ops.execute("plan.specs");
  assert.deepEqual(
    listed.items.map((item) => [item.name, item.root]),
    [["config", app]],
  );
  assert.equal(
    (await ops.execute("plan.create", { spec: "config" })).spec,
    "config",
  );
  await assert.rejects(
    ops.execute("plan.create", { spec: "planning-only" }),
    (error) => error.status === 404,
  );
  // The same name in two code repositories is ambiguous.
  writeSpec(lib, "config");
  await assert.rejects(
    ops.execute("plan.get", { id: "config" }),
    /more than one repository/,
  );
});

// R28.5: the plan's task list says who owns each task, before and after
// approval; a stored row's owner wins over the manifest's.
test("plan preview shows each task's authority and issue link", async (t) => {
  const { root, store, ops } = workspace(t),
    app = temporaryDirectory();
  writeSpec(app, "config");
  setMode(root, { mode: "single-repo" });
  store.put("repositories", {
    id: "app",
    root: app,
    baseBranch: "main",
    checks: [],
  });
  const plan = await ops.execute("plan.create", { spec: "config" });
  const owners = async () =>
    Object.fromEntries(
      (await ops.execute("plan.preview", { id: "config" })).tasks.map(
        (task) => [task.taskId, [task.authority, task.issue?.number ?? null]],
      ),
    );
  const expected = {
    "config.1": ["local", null],
    "config.1.1": ["local", null],
    "config.1.2": ["local", null],
  };
  assert.deepEqual(await owners(), expected);
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  store.mutate("Link an issue", (data) => {
    data.tasks.find((task) => task.id === "config.1.1").github = {
      number: 4,
      url: "https://github.com/example/app/issues/4",
    };
  });
  assert.deepEqual(await owners(), {
    ...expected,
    "config.1.1": ["github", 4],
  });
});

test("plans-repo mode needs a planning repository", async (t) => {
  const { root, store, ops } = workspace(t),
    planning = temporaryDirectory();
  writeSpec(root, "config");
  setMode(root, { mode: "plans-repo", planningRepository: "example/plans" });
  await assert.rejects(ops.execute("plan.specs"), /no planning repository/);
  writeSpec(planning, "config");
  store.put("repositories", {
    id: "plans",
    root: planning,
    baseBranch: "main",
    checks: [],
    planning: true,
  });
  assert.deepEqual(ops.specRoots(), [planning]);
  assert.equal((await ops.execute("plan.specs")).items[0].root, planning);
});

// Regression: Nupp keeps .avoozl.json in its planning checkout with no
// planning repository registered, and the Plans tab read nothing.
test("plans-repo mode reads the workspace root when it is the planning checkout", async (t) => {
  const { root, ops } = workspace(t);
  writeSpec(root, "config");
  setMode(root, { mode: "plans-repo", planningRepository: "Example/Plans" });
  const git = (...args) => execFileSync("git", args, { cwd: root });
  git("init", "-q");
  git("remote", "add", "origin", "https://github.com/example/other.git");
  await assert.rejects(ops.execute("plan.specs"), /no planning repository/);
  git("remote", "set-url", "origin", "git@github.com:example/plans.git");
  const listed = await ops.execute("plan.specs");
  assert.deepEqual(
    listed.items.map((item) => [item.name, item.root]),
    [["config", root]],
  );
});

// An old-style approved plan whose tasks a spec folder now describes.
const legacyText = `# Load configuration\n\n\`\`\`task\n{"id":"load","title":"Read the config file","acceptance":["A missing file yields defaults."],"checks":["npm test"],"track":"catalog"}\n\`\`\`\n\n\`\`\`task\n{"id":"check","title":"Validate loaded config","acceptance":["An unknown key is reported."],"checks":["npm test"],"requires":["load"],"track":"catalog"}\n\`\`\`\n`;
const legacySpec = (ids = ["config-load", "config-check"]) => ({
  "tasks.md":
    "# Tasks\n\n" +
    ids.map((id) => `- [ ] ${taskToken(id)} Task ${id}\n`).join(""),
  "avoozl/manifest.json": JSON.stringify({
    tasks: Object.fromEntries(
      ids.map((id, index) => [
        id,
        {
          kind: "leaf",
          summary: `Handle the ${id} step of the loader.`,
          acceptance: [`${id} passes.`],
          checks: ["npm test"],
          ...(index ? { requires: [ids[0]] } : {}),
        },
      ]),
    ),
  }),
});
async function legacyPlan(ops) {
  const plan = await ops.execute("plan.create", {
    id: "config",
    prompt: "Load config",
    text: legacyText,
  });
  await approve(ops);
  return ops.execute("plan.get", { id: plan.id });
}

test("a failed approval writes nothing and names repeated errors once", async (t) => {
  const { root, store, ops } = workspace(t);
  writeSpec(root, "config");
  await ops.execute("plan.create", { spec: "config" });
  // A broken row already on disk makes the approval's commit fail validation.
  for (const id of ["a", "b", "c"])
    store.db.prepare("INSERT INTO entities VALUES (?,?,?,?)").run(
      "edge",
      `ghost-${id}`,
      999,
      JSON.stringify({
        id: `ghost-${id}`,
        from: "ghost",
        to: id,
        kind: "requires",
      }),
    );
  store.cache = null;
  const before = {
    revision: store.read().revision,
    plan: JSON.stringify(store.get("plans", "config")),
    approvals: store.list("approvals").length,
    rows: store.db.prepare("SELECT count(*) AS n FROM entities").get().n,
  };
  await assert.rejects(approve(ops), (error) => {
    assert.equal(
      error.message,
      "Dangling edge ×3, e.g. ghost → a",
      "one summary line",
    );
    return true;
  });
  store.cache = null;
  assert.equal(store.read().revision, before.revision);
  assert.equal(JSON.stringify(store.get("plans", "config")), before.plan);
  assert.equal(store.list("approvals").length, before.approvals);
  assert.equal(
    store.db.prepare("SELECT count(*) AS n FROM entities").get().n,
    before.rows,
  );
});

test("approval starts checked items as accepted from the approved tasks.md", async (t) => {
  const { root, store, ops } = workspace(t),
    files = specFiles(),
    marked = files["tasks.md"]
      .replace("- [ ] 1.1 Read", "- [x] 1.1 Read")
      .replace(
        "  - [ ] 1.2",
        "    - Built: `abc1234`, receipt `docs/evidence/x.md`.\n  - [-] 1.2",
      ),
    directory = writeSpec(root, "config", { "tasks.md": marked }),
    plan = await ops.execute("plan.create", { spec: "config" });
  const preview = await ops.execute("plan.preview", { id: "config" });
  assert.deepEqual(preview.baseline, {
    count: 1,
    taskIds: ["config.1.1"],
    text: "1 task starts as done from tasks.md marks",
  });
  // A mark made on disk after the reviewed revision is stored is not read:
  // marks leave the hash alone, so approval reads the stored tasks.md.
  const tasks = path.join(directory, "tasks.md");
  fs.writeFileSync(
    tasks,
    marked
      .replace("- [-] 1.2", "- [x] 1.2")
      .replace("- [ ] 1 Load", "- [x] 1 Load"),
  );
  const receipt = await approve(ops, "config", { approvedBy: "owner" });
  assert.deepEqual(receipt.baseline, ["config.1.1"]);
  const row = (id) => store.read().tasks.find((task) => task.id === id),
    leaf = row("config.1.1");
  assert.equal(leaf.status, "accepted");
  const line = lineOf(marked, "1.1 Read");
  assert.equal(
    leaf.acceptanceEvidence.evidence,
    `tasks.md line ${line} marks 1.1 [x] at approved revision ${plan.hash}. Built: \`abc1234\`, receipt \`docs/evidence/x.md\`.`,
  );
  assert.deepEqual(leaf.acceptanceEvidence.baseline, {
    file: "tasks.md",
    line,
    mark: "[x]",
    hash: plan.hash,
  });
  assert.equal(leaf.acceptanceEvidence.acceptedBy, "owner");
  assert.equal(row("config.1.2").status, "planned", "[-] keeps its meaning");
  assert.deepEqual(
    queryTasks(ops.read(), { scope: "all", q: "ready:true" })
      .map((t) => t.id)
      .filter((id) => id.startsWith("config.")),
    ["config.1.2"],
    "the accepted leaf satisfies its dependent",
  );

  // A worker that checks an item off and gets a new revision approved does
  // not accept a task that already exists.
  fs.appendFileSync(path.join(directory, "design.md"), "More.\n");
  await ops.execute("plan.save", { id: "config", expectedHash: plan.hash });
  assert.equal(
    (await ops.execute("plan.preview", { id: "config" })).baseline.count,
    0,
  );
  const again = await approve(ops);
  assert.equal(again.baseline, undefined);
  assert.equal(row("config.1.2").status, "planned");
});

test("a breakdown approval starts checked items planned", async (t) => {
  const { root, store, ops } = workspace(t),
    files = legacySpecFiles();
  // approvePlan reads marks only when its caller asks (plan.approve does;
  // a GitHub breakdown's child approval does not).
  const { approvePlan } = await import("../spec-approval.mjs");
  writeSpec(root, "other", {
    "tasks.md": files["tasks.md"].replaceAll("- [ ]", "- [x]"),
  });
  const other = await ops.execute("plan.create", { spec: "other" }),
    lint = lintSpec({ spec: readSpecFolder(root, "other"), plan: other });
  assert.deepEqual(codes(lint), []);
  approvePlan(store, {
    id: "other",
    expectedHash: other.hash,
    expectedRevision: store.read().revision,
    proposals: lint.proposals,
  });
  assert.deepEqual(
    store
      .read()
      .tasks.filter((task) => task.planId === "other")
      .map((task) => task.status),
    ["planned", "planned", "planned"],
  );
});

test("lettered IDs such as P1 and P2b are namespaced like numbers", async (t) => {
  assert.deepEqual(
    specItems(
      "config",
      [
        "- [ ] P1 Proof: it runs",
        "- [ ] P2b Proof: again",
        "- [ ] `avoozl-p3` P3 Proof: named",
        "- [ ] p4 lowercase",
        "- [ ] Add a thing",
        "- [ ] PP1 two letters",
      ].join("\n"),
    ).map((item) => item.id),
    ["config.P1", "config.P2b", "avoozl-p3", null, null, null],
  );
  const { root, store, ops } = workspace(t),
    files = legacySpecFiles(),
    manifest = JSON.parse(files["avoozl/manifest.json"]);
  manifest.tasks.P1 = {
    kind: "leaf",
    summary: "Run the loader against a real file.",
    requires: ["1.2"],
    acceptance: ["A receipt records the run."],
    checks: ["npm test"],
  };
  writeSpec(root, "config", {
    "tasks.md": files["tasks.md"] + "- [ ] P1 Proof: config loads end to end\n",
    "avoozl/manifest.json": JSON.stringify(manifest),
  });
  assert.deepEqual(codes(lint(root)), []);
  await ops.execute("plan.create", { spec: "config" });
  await approve(ops);
  assert.ok(
    store
      .read()
      .edges.some((e) => e.from === "config.1.2" && e.to === "config.P1"),
  );
});

test("an item's whole line is its title, and one over the limit is refused", () => {
  const root = temporaryDirectory(),
    files = specFiles(),
    long =
      "Add the `a, b` reader: " +
      "it reads every file and reports each problem with its line. ".repeat(5),
    item = `1.2 ${long.trim()}`;
  assert.ok(long.length > 240);
  writeSpec(root, "config", {
    "tasks.md": files["tasks.md"].replace("1.2 Validate loaded config", item),
  });
  assert.deepEqual(codes(lint(root)), [
    `task.title-length tasks.md:${lineOf(files["tasks.md"], "1.2 Validate")}`,
  ]);
  const fits =
    "Add the `a, b` reader: it reads every file and reports each problem.";
  writeSpec(root, "fits", {
    "tasks.md": files["tasks.md"].replace(
      "1.2 Validate loaded config",
      `1.2 ${fits}`,
    ),
  });
  const proposal = lint(root, "fits").proposals.find(
    (p) => p.id === "fits.1.2",
  );
  assert.equal(proposal.title, fits);
  assert.equal(proposal.summary, undefined);
});
