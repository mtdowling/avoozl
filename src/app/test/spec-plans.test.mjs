import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { queryTasks } from "../../model.mjs";
import {
  lintSpec,
  readCritique,
  readSpecFolder,
  specItems,
} from "../spec-plans.mjs";
import { fixture } from "./fixtures.mjs";
import { specFiles, writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

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
  assert.equal(validator.lineStart, 5);
});

test("a missing folder is refused", () => {
  const root = temporaryDirectory();
  assert.deepEqual(codes(lint(root, "absent")), [
    "spec.missing-folder .kiro/specs/absent/:1",
  ]);
});

test("each missing file is named", () => {
  const root = temporaryDirectory();
  writeSpec(root, "config", { "design.md": null });
  assert.deepEqual(codes(lint(root)), ["spec.missing-file design.md:1"]);
  writeSpec(root, "tasks", { "tasks.md": null });
  assert.ok(
    codes(lint(root, "tasks")).includes("spec.missing-file tasks.md:1"),
  );
  writeSpec(root, "manifest", { "avoozl/manifest.json": null });
  assert.ok(
    codes(lint(root, "manifest")).includes(
      "spec.missing-file avoozl/manifest.json:1",
    ),
  );
});

test("a spec has exactly one of requirements.md and bugfix.md", () => {
  const root = temporaryDirectory();
  writeSpec(root, "neither", { "requirements.md": null });
  assert.deepEqual(codes(lint(root, "neither")), [
    "spec.missing-file requirements.md:1",
  ]);
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
  assert.deepEqual(byId["fix.1"].acceptance, [
    "The CLI reads, validates, and reports its config.",
  ]);
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
  writeSpec(root, "config", { "design.md": null });
  const result = lintSpec({
    spec: {
      name: "config",
      exists: true,
      files: readSpecFolder(root, "config").files,
    },
  });
  assert.equal(
    result.diagnostics.find((d) => d.file === "design.md").message,
    "Add .kiro/specs/config/design.md.",
  );
});

test("an item with no ID is refused at its line", () => {
  const root = temporaryDirectory();
  writeSpec(root, "config", {
    "tasks.md": specFiles()["tasks.md"] + "- [ ] Write the docs\n",
  });
  assert.deepEqual(codes(lint(root)), ["task.missing-id tasks.md:6"]);
});

test("a repeated ID is refused at its second line", () => {
  const root = temporaryDirectory();
  writeSpec(root, "config", {
    "tasks.md": specFiles()["tasks.md"] + "- [ ] 1.1 Read it again\n",
  });
  const result = lint(root);
  assert.deepEqual(codes(result), ["task.duplicate-id tasks.md:6"]);
  assert.match(result.diagnostics[0].message, /line 4/);
});

test("manifest entries and tasks.md items cover each other", () => {
  const root = temporaryDirectory(),
    manifest = JSON.parse(specFiles()["avoozl/manifest.json"]);
  manifest.tasks["2.1"] = manifest.tasks["1.1"];
  delete manifest.tasks["1.2"];
  manifest.tasks["1"].requires = ["1.1"];
  const text = JSON.stringify(manifest, null, 2);
  writeSpec(root, "config", { "avoozl/manifest.json": text });
  assert.deepEqual(codes(lint(root)).sort(), [
    "manifest.missing-entry tasks.md:5",
    `manifest.unknown-task avoozl/manifest.json:${lineOf(text, '"2.1":')}`,
  ]);
});

test("invalid manifest JSON is refused in the manifest", () => {
  const root = temporaryDirectory();
  writeSpec(root, "config", {
    "avoozl/manifest.json": '{\n  "tasks": {\n    "1": ,\n  }\n}\n',
  });
  const found = lint(root).diagnostics;
  assert.deepEqual(
    found.map((d) => [d.code, d.file]),
    [["manifest.json", "avoozl/manifest.json"]],
  );
});

test("a manifest entry breaking the task schema is refused at its line", () => {
  const root = temporaryDirectory(),
    manifest = JSON.parse(specFiles()["avoozl/manifest.json"]);
  manifest.tasks["1.2"].acceptance = [];
  const text = JSON.stringify(manifest, null, 2);
  writeSpec(root, "config", { "avoozl/manifest.json": text });
  const found = lint(root).diagnostics.filter(
    (d) => d.code === "manifest.schema",
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].file, "avoozl/manifest.json");
  assert.equal(found[0].lineStart, lineOf(text, '"1.2":'));
  assert.match(found[0].message, /observable acceptance/);
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
  assert.deepEqual(codes(result), ["task.duplicate-id tasks.md:4"]);
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
  assert.equal(leaf.source.lineStart, 5);
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
  writeSpec(root, "broken", { "design.md": null });
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
    manifest = path.join(directory, "avoozl/manifest.json");
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
  const value = JSON.parse(fs.readFileSync(manifest, "utf8"));
  value.tasks["1.2"].summary = "Report unknown keys and bad types.";
  fs.writeFileSync(manifest, JSON.stringify(value, null, 2) + "\n");
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

test("Kiro's task order and nesting are not Avoozl's graph", () => {
  const root = temporaryDirectory();
  writeSpec(root, "config", {
    "tasks.md":
      "- [ ] 1.2 Validate loaded config\n- [ ] 1 Load and validate configuration\n- [ ] 1.1 Read the config file\n",
  });
  const edges = (result) =>
    Object.fromEntries(result.proposals.map((p) => [p.id, p.requires || []]));
  const flat = lint(root),
    nested = temporaryDirectory();
  writeSpec(nested, "config");
  assert.deepEqual(codes(flat), []);
  assert.deepEqual(edges(flat), edges(lint(nested)));
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

test("nesting under a leaf, or a manifest parent, is refused at its line", () => {
  const root = temporaryDirectory(),
    manifest = JSON.parse(specFiles()["avoozl/manifest.json"]);
  writeSpec(root, "config", {
    "tasks.md":
      "- [ ] 1 Load and validate configuration\n  - [ ] 1.1 Read the config file\n    - [ ] 1.2 Validate loaded config\n",
  });
  assert.deepEqual(codes(lint(root)), ["task.parent-kind tasks.md:3"]);
  manifest.tasks["1.1"].parent = "1";
  const named = temporaryDirectory();
  writeSpec(named, "config", {
    "avoozl/manifest.json": JSON.stringify(manifest, null, 2),
  });
  const result = lint(named);
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.file, d.taskId]),
    [["manifest.schema", "avoozl/manifest.json", "config.1.1"]],
  );
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
    "- [ ] 1 Load and validate configuration\n  - [ ] 1.1 Read the config file\n- [ ] 1.2 Validate loaded config\n",
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
  assert.deepEqual(codes(quality), ["task.changed-text tasks.md:5"]);
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
  store.put("projects", {
    id: "app",
    root: app,
    baseBranch: "main",
    checks: [],
  });
  store.put("projects", {
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
    app = temporaryDirectory(),
    files = JSON.parse(specFiles()["avoozl/manifest.json"]);
  files.tasks["1.2"].authority = "local";
  writeSpec(app, "config", {
    "avoozl/manifest.json": JSON.stringify(files),
  });
  setMode(root, { mode: "single-repo" });
  store.put("projects", {
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
    "config.1": ["github", null],
    "config.1.1": ["github", null],
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
  store.put("projects", {
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
// planning project registered, and the Plans tab read nothing.
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
    "# Tasks\n\n" + ids.map((id) => `- [ ] ${id} Task ${id}\n`).join(""),
  "avoozl/manifest.json": JSON.stringify({
    tasks: Object.fromEntries(
      ids.map((id, index) => [
        id,
        {
          kind: "leaf",
          summary: `Do ${id}.`,
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

test("plan.save links an old-style plan to its spec folder as a draft", async (t) => {
  const { root, store, ops } = workspace(t),
    legacy = await legacyPlan(ops),
    taskIds = () =>
      store
        .read()
        .tasks.filter((task) => task.planId === "config")
        .map((task) => task.id)
        .sort();
  assert.deepEqual(legacy.mapping, {
    load: "config-load",
    check: "config-check",
  });
  writeSpec(root, "config", legacySpec());
  const linked = await ops.execute("plan.save", {
    id: "config",
    spec: "config",
    expectedHash: legacy.hash,
  });
  assert.equal(linked.spec, "config");
  assert.equal(linked.state, "draft");
  assert.equal(linked.revision, legacy.revision + 1);
  assert.equal(linked.hash, readSpecFolder(root, "config").hash);
  assert.deepEqual(linked.mapping, {
    "config-load": "config-load",
    "config-check": "config-check",
  });
  assert.deepEqual(
    linked.history.map((entry) => [entry.revision, entry.state]),
    [[1, "approved"]],
  );
  assert.equal(linked.history[0].text, legacyText);
  assert.equal(store.list("approvals").length, 1, "linking never approves");
  assert.ok(
    store.read().tasks.every((t) => t.planId !== "config" || t.needsReview),
  );
  await approve(ops);
  assert.deepEqual(taskIds(), ["config-check", "config-load"]);
  const data = store.read();
  assert.ok(
    data.edges.some(
      (e) =>
        e.from === "config-load" &&
        e.to === "config-check" &&
        e.kind === "requires",
    ),
  );
  assert.equal(
    data.tasks.find((task) => task.id === "config-check").source.document,
    "spec:config",
  );
  const approved = await ops.execute("plan.get", { id: "config" });
  assert.equal(approved.state, "approved");
  assert.equal(approved.history.length, 1);
  assert.equal(store.list("approvals").length, 2);
});

test("plan.save refuses to link a spec that does not fit the plan", async (t) => {
  const { root, store, ops } = workspace(t),
    legacy = await legacyPlan(ops),
    link = (spec, expectedHash = legacy.hash) =>
      ops.execute("plan.save", { id: "config", spec, expectedHash }),
    before = JSON.stringify(store.get("plans", "config"));
  writeSpec(root, "config", legacySpec(["config-load"]));
  await assert.rejects(link("config"), /config-check is missing/);
  writeSpec(root, "config", legacySpec());
  await assert.rejects(link("config", "stale"), /changed/);
  writeSpec(root, "unrelated", legacySpec());
  await assert.rejects(link("unrelated"), /not this plan's folder/);
  await ops.execute("plan.create", { spec: "config", id: "other" });
  await assert.rejects(link("config"), /belongs to another plan/);
  assert.equal(JSON.stringify(store.get("plans", "config")), before);
});

// Kiro checks off built work in tasks.md. The human-approved revision is
// the baseline: its [x] items start accepted, and nothing else does.
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
  fs.writeFileSync(tasks, marked.replace("- [-] 1.2", "- [x] 1.2"));
  const receipt = await approve(ops, "config", { approvedBy: "owner" });
  assert.deepEqual(receipt.baseline, ["config.1.1"]);
  const row = (id) => store.read().tasks.find((task) => task.id === id),
    leaf = row("config.1.1");
  assert.equal(leaf.status, "accepted");
  assert.equal(
    leaf.acceptanceEvidence.evidence,
    `tasks.md line 4 marks 1.1 [x] at approved revision ${plan.hash}. Built: \`abc1234\`, receipt \`docs/evidence/x.md\`.`,
  );
  assert.deepEqual(leaf.acceptanceEvidence.baseline, {
    file: "tasks.md",
    line: 4,
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

test("a checked item gated on validation, and a breakdown approval, start planned", async (t) => {
  const { root, store, ops } = workspace(t),
    files = specFiles(),
    manifest = JSON.parse(files["avoozl/manifest.json"]);
  manifest.tasks["1.1"].acceptFrom = "validation";
  writeSpec(root, "config", {
    "tasks.md": files["tasks.md"].replaceAll("- [ ]", "- [x]"),
    "avoozl/manifest.json": JSON.stringify(manifest),
  });
  await ops.execute("plan.create", { spec: "config" });
  assert.deepEqual(
    (await ops.execute("plan.preview", { id: "config" })).baseline.taskIds,
    ["config.1", "config.1.2"],
  );
  await approve(ops);
  assert.equal(
    store.read().tasks.find((task) => task.id === "config.1.1").status,
    "planned",
  );
  // approvePlan reads marks only when its caller asks (plan.approve does;
  // a GitHub breakdown's child approval does not).
  const { approvePlan } = await import("../plans.mjs");
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
        "- [ ] avoozl-p3 P3 Proof: named",
        "- [ ] p4 lowercase",
        "- [ ] Add a thing",
        "- [ ] PP1 two letters",
      ].join("\n"),
    ).map((item) => item.id),
    ["config.P1", "config.P2b", "avoozl-p3", null, null, null],
  );
  const { root, store, ops } = workspace(t),
    files = specFiles(),
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

test("an item over the title limit keeps its first clause as the title", () => {
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
  const result = lint(root),
    proposal = result.proposals.find((p) => p.id === "config.1.2");
  assert.deepEqual(codes(result), []);
  assert.equal(proposal.title, "Add the `a, b` reader");
  assert.equal(proposal.summary, `${long.trim()}\n\nReport unknown keys.`);
  // No clause break inside the limit: cut at a word, marked as cut.
  writeSpec(root, "plain", {
    "tasks.md": files["tasks.md"].replace(
      "1.2 Validate loaded config",
      "1.2 " + "word ".repeat(80).trim(),
    ),
  });
  const plain = lint(root, "plain").proposals.find((p) => p.id === "plain.1.2");
  assert.ok(plain.title.length <= 240 && plain.title.endsWith("word…"));
});
