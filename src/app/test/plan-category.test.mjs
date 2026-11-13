// A plan's category comes only from YAML front-matter a person wrote
// (Requirement 30.9), and the Plans table groups and counts by it.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import {
  frontMatter,
  frontMatterCategory,
  withoutFrontMatter,
} from "../../front-matter.mjs";
import { planCategory } from "../../plan-model.mjs";
import {
  lintSpec,
  readSpecFolder,
  specCategory,
  specHash,
  specTitle,
} from "../spec-plans.mjs";
import { fixture } from "./fixtures.mjs";
import { specFiles, writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const requirements = specFiles()["requirements.md"];
const withFront = (front) => `---\n${front}\n---\n${requirements}`;

function workspace(t) {
  const { root, store } = fixture(t);
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

test("front-matter category: plain, quoted, commented, absent", () => {
  assert.equal(frontMatterCategory(withFront("category: Runtime")), "Runtime");
  assert.equal(
    frontMatterCategory(withFront('title: x\ncategory: "Language & compiler"')),
    "Language & compiler",
  );
  assert.equal(
    frontMatterCategory(withFront("category: 'It''s' # note")),
    "It's",
  );
  assert.equal(
    frontMatterCategory(withFront("category: Runtime # note")),
    "Runtime",
  );
  assert.equal(frontMatterCategory(requirements), null);
  assert.equal(frontMatterCategory(withFront("owner: me")), null);
  // A --- later in the file is a Markdown rule, not front-matter.
  assert.equal(frontMatterCategory(`# T\n\n---\ncategory: x\n---\n`), null);
  assert.equal(frontMatterCategory(undefined), null);
  assert.equal(
    frontMatter("\uFEFF---\r\ncategory: Runtime\r\n---\r\n").category,
    "Runtime",
  );
});

test("malformed front-matter is a clear problem, not a crash", () => {
  const open = frontMatter(`---\ncategory: Runtime\n${requirements}`);
  assert.equal(open.category, null);
  assert.equal(open.problem.line, 1);
  assert.match(open.problem.message, /no closing --- line/);
  for (const value of ["[a, b]", "{a: 1}", "|", ""]) {
    const result = frontMatter(withFront(`category: ${value}`));
    assert.equal(result.category, null, value);
    assert.equal(result.problem.line, 2, value);
    assert.match(result.problem.message, /one line of text/);
  }
  const twice = frontMatter(withFront("category: A\ncategory: B"));
  assert.match(twice.problem.message, /twice \(lines 2 and 3\)/);
});

test("front-matter keeps the spec reader, title and lint working", (t) => {
  const { root } = workspace(t);
  writeSpec(root, "config", {
    "requirements.md": withFront(
      "# a YAML comment, not a heading\ncategory: Runtime",
    ),
  });
  const spec = readSpecFolder(root, "config");
  assert.equal(specCategory(spec.files), "Runtime");
  assert.equal(specTitle(spec), "Load configuration");
  const quality = lintSpec({ spec, plan: { id: "config" } });
  assert.equal(quality.canApprove, true);
  assert.deepEqual(quality.diagnostics, []);
  assert.equal(quality.taskCount, 3);
  // Lines keep their numbers when front-matter is blanked.
  const text = withFront("category: Runtime");
  assert.equal(
    withoutFrontMatter(text).split("\n").length,
    text.split("\n").length,
  );
});

test("malformed front-matter is a warning with its line; approval is not blocked", (t) => {
  const { root } = workspace(t);
  writeSpec(root, "config", {
    "requirements.md": `---\ncategory: [a]\n---\n${requirements}`,
  });
  const quality = lintSpec({
    spec: readSpecFolder(root, "config"),
    plan: { id: "config" },
  });
  const found = quality.diagnostics.find((d) => d.code === "spec.front-matter");
  assert.equal(found.severity, "warning");
  assert.equal(found.file, "requirements.md");
  assert.equal(found.lineStart, 2);
  assert.equal(quality.canApprove, true);
});

test("front-matter is part of the revision, like any other text", () => {
  const files = specFiles(),
    tagged = { ...files, "requirements.md": withFront("category: Runtime") };
  assert.notEqual(specHash(files), specHash(tagged));
  assert.equal(specHash(tagged), specHash({ ...tagged }));
});

test("no category is guessed, and Avoozl's old written values do not count", () => {
  assert.equal(planCategory({ title: "Coroutine scheduler", text: "" }), null);
  assert.equal(
    planCategory({ text: withFront("category: Runtime") }),
    "Runtime",
  );
  assert.equal(
    planCategory({ plan: { category: "Authored" }, text: "" }),
    "Authored",
  );
  assert.equal(
    planCategory({ virtual: true, plan: { category: "Kiro specs" }, text: "" }),
    null,
  );
});

test("approval records the front-matter category and never invents one", async (t) => {
  const { root, store, ops } = workspace(t);
  writeSpec(root, "config", {
    "requirements.md": withFront("category: Runtime"),
  });
  writeSpec(root, "plain");
  for (const name of ["config", "plain"]) {
    const plan = await ops.execute("plan.create", { spec: name });
    const preview = await ops.execute("plan.preview", { id: plan.id });
    await ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: preview.expectedRevision,
    });
  }
  const docs = store.read().documents;
  assert.equal(docs["spec:config"].plan.category, "Runtime");
  assert.equal("category" in docs["spec:plain"].plan, false);
  // plans_documents filters on the authored value.
  const reply = await ops.execute("legacy.mcp", {
    message: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "plans_documents", arguments: { category: "Runtime" } },
    },
  });
  const body = reply.body.result.structuredContent;
  assert.deepEqual(
    body.plans.map((p) => p.id),
    ["spec:config"],
  );
});

test("plan.table: one row per plan with counts, grouped by authored category", async (t) => {
  const { root, ops } = workspace(t);
  writeSpec(root, "config", {
    "requirements.md": withFront("category: Runtime"),
  });
  writeSpec(root, "broken", {
    "requirements.md": `---\ncategory: Runtime\n${requirements}`,
  });
  const plan = await ops.execute("plan.create", { spec: "config" });
  const preview = await ops.execute("plan.preview", { id: plan.id });
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
  const before = ops.read().revision;
  const table = await ops.execute("plan.table", {});
  assert.equal(ops.read().revision, before, "plan.table writes nothing");
  const byName = Object.fromEntries(table.items.map((row) => [row.spec, row]));
  assert.equal(byName.config.category, "Runtime");
  assert.equal(byName.config.status, "approved");
  assert.equal(byName.config.planId, "config");
  // Two leaves under one epic.
  assert.deepEqual(byName.config.tasks, { total: 2, done: 0 });
  assert.equal(byName.config.epics, 1);
  assert.equal(
    byName.config.now.ready +
      byName.config.now.running +
      byName.config.now.needsYou <=
      2,
    true,
  );
  assert.ok(byName.config.lastChange);
  assert.equal(byName.broken.category, null);
  assert.match(byName.broken.categoryProblem, /no closing ---/);
  assert.equal(byName.broken.status, "not imported");
  assert.equal(table.specs.length, 2);
  // The Graph filter shows one plan's tasks.
  const graph = await ops.execute("graph.view", { plan: "config" });
  assert.deepEqual(graph.tasks.map((task) => task.id).sort(), [
    "config.1",
    "config.1.1",
    "config.1.2",
  ]);
  assert.equal(
    (await ops.execute("graph.view", { plan: "other" })).tasks.length,
    0,
  );
});

test("plan.table still lists stored plans when the mode has no spec folders", async (t) => {
  const { root, ops } = workspace(t);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, github: { mode: "single-repo" } }),
  );
  const table = await ops.execute("plan.table", {});
  assert.match(table.problem, /code repository/);
  assert.deepEqual(table.items, []);
});
