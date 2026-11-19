// Task IDs as code spans and the requirement and design refs on a tasks.md
// item (Requirement 115): parsed out of the title, checked against the
// spec's own files, and carried on each proposal.
import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../../api/operations.mjs";
import { parseSpec, specHash, specItems } from "../spec-plans.mjs";
import {
  designIds,
  requirementIds,
  splitRefs,
  taskToken,
} from "../spec-refs.mjs";
import { fixture } from "../../test/fixtures.mjs";
import { legacySpecFiles, writeSpec } from "../../test/spec-fixture.mjs";

const REQUIREMENTS = [
  "# Requirements",
  "",
  "| ID | Fact |",
  "|----|------|",
  "| F13 | A fact |",
  "",
  "## Requirement 1: Load",
  "",
  "#### Acceptance criteria",
  "",
  "1. The loader SHALL read the file.",
  "2. The loader SHALL report a bad key.",
  "2a. A key SHALL be named by its path.",
  "",
  "## Requirement DL2: Open",
  "",
  "1. A link SHALL open the decision.",
  "",
].join("\n");
const DESIGN = [
  "# Design",
  "",
  "## 4. Architecture",
  "",
  "### 4.26 The loader",
  "",
  "## D1. Shape",
  "",
  "```markdown",
  "## 9. Inside a fence",
  "```",
].join("\n");
const spec = (tasks) => ({
  name: "config",
  exists: true,
  files: {
    "requirements.md": REQUIREMENTS,
    "design.md": DESIGN,
    "tasks.md": `---\nrepo: app\n---\n# Tasks\n\n${tasks}`,
  },
});
const problems = (parsed) =>
  parsed.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => `${d.code} ${d.file}:${d.lineStart} ${d.message}`);

test("a title keeps its text and gives up its trailing refs", () => {
  assert.deepEqual(splitRefs("Open the decision [R1.2, DL2] (§4.26, §D1)"), {
    title: "Open the decision",
    requirements: ["R1.2", "DL2"],
    design: ["§4.26", "§D1"],
  });
  assert.deepEqual(splitRefs("Only design (§D1)"), {
    title: "Only design",
    requirements: [],
    design: ["§D1"],
  });
  // Brackets that are not ref-shaped are title text.
  for (const title of [
    "Retired (lessons store)",
    "Search for `[::]` and `listen(`",
    "No pull-request view (§8). Done",
  ])
    assert.deepEqual(splitRefs(title), {
      title,
      requirements: [],
      design: [],
    });
});

test("each kind's IDs come from its own file, with the line they are on", () => {
  const requirements = requirementIds(REQUIREMENTS);
  assert.deepEqual(
    [...requirements.keys()].sort(),
    ["DL2", "DL2.1", "F13", "R1", "R1.1", "R1.2", "R1.2a"].sort(),
  );
  assert.equal(requirements.get("R1.2"), 12);
  const design = designIds(DESIGN);
  assert.deepEqual([...design.keys()], ["§4", "§4.26", "§D1"]);
  assert.equal(design.get("§D1"), 7);
});

test("a task ID reads the same bare or as a code span, and neither is a lint error", () => {
  const items = specItems(
    "config",
    "- [ ] `load-1` Load [R1.1] (§4.26)\n- [ ] load-2 Load more\n- [ ] 1.1 Numbered\n",
  );
  assert.deepEqual(
    items.map(({ key, id, title }) => ({ key, id, title })),
    [
      { key: "load-1", id: "load-1", title: "Load" },
      { key: "load-2", id: "load-2", title: "Load more" },
      { key: "1.1", id: "config.1.1", title: "Numbered" },
    ],
  );
  assert.deepEqual(items[0].refs, {
    requirements: ["R1.1"],
    design: ["§4.26"],
  });
  // Avoozl's writers write a named ID as a code span.
  assert.equal(taskToken("load-1"), "`load-1`");
  assert.equal(taskToken("1.2"), "1.2");
  const parsed = parseSpec(
    spec("- [ ] load-2 Load more\n  - $done: It loads\n"),
  );
  assert.deepEqual(problems(parsed), []);
  assert.equal(
    specHash(spec("- [ ] load-2 Load more\n  - $done: It loads\n").files) ===
      specHash(spec("- [ ] `load-2` Load more\n  - $done: It loads\n").files),
    false,
    "the form is part of the spec text",
  );
});

test("every ref must exist in the spec, and lint names the ref, file and line", () => {
  const parsed = parseSpec(
    spec(
      [
        "- [ ] `ok-1` Fine [R1, R1.2a, DL2.1, F13, R1.1–R1.2] (§4.26, §D1)",
        "  - $done: Fine",
        "- [ ] `bad-1` Broken [R9, DL2.4, R1.1–R1.7] (§4.99, §9)",
        "  - $done: Broken",
        "- [ ] `bad-2` Wrong form [DL2 step 3] (D1)",
        "  - $done: Wrong",
      ].join("\n"),
    ),
  );
  assert.deepEqual(problems(parsed), [
    'task.ref-unknown tasks.md:8 Task "bad-1" names requirement R9, which requirements.md does not define.',
    'task.ref-unknown tasks.md:8 Task "bad-1" names requirement DL2.4, which requirements.md does not define.',
    'task.ref-unknown tasks.md:8 Task "bad-1" names requirement R1.7, which requirements.md does not define.',
    'task.ref-unknown tasks.md:8 Task "bad-1" names design §4.99, which design.md does not define.',
    'task.ref-unknown tasks.md:8 Task "bad-1" names design §9, which design.md does not define.',
    'task.ref-form tasks.md:10 Task "bad-2" names requirement ref "DL2 step 3". Write a requirement as R12 or R12.3 (DL2 or DL2.3 where its heading is Requirement DL2), or a fact as F13.',
    'task.ref-form tasks.md:10 Task "bad-2" names design ref "D1". Write a design section as § and its heading\'s number, such as §4.26 or §D1, or a fact as F13.',
  ]);
  // Each diagnostic has its own ID, so none hides another.
  assert.equal(
    new Set(parsed.diagnostics.map((d) => d.id)).size,
    parsed.diagnostics.length,
  );
  const ok = parsed.proposals.find((p) => p.id === "ok-1");
  assert.equal(ok.title, "Fine");
  assert.deepEqual(ok.refs, [
    { kind: "requirement", ref: "R1", file: "requirements.md", line: 7 },
    { kind: "requirement", ref: "R1.2a", file: "requirements.md", line: 13 },
    { kind: "requirement", ref: "DL2.1", file: "requirements.md", line: 17 },
    { kind: "requirement", ref: "F13", file: "requirements.md", line: 5 },
    {
      kind: "requirement",
      ref: "R1.1–R1.2",
      file: "requirements.md",
      line: 11,
    },
    { kind: "design", ref: "§4.26", file: "design.md", line: 5 },
    { kind: "design", ref: "§D1", file: "design.md", line: 7 },
  ]);
});

test("refs and the ID's form are part of the revision hash", () => {
  const files = (line) => spec(`${line}\n  - $done: Fine\n`).files;
  const base = specHash(files("- [ ] `ok-1` Fine [R1] (§D1)"));
  assert.notEqual(specHash(files("- [ ] `ok-1` Fine [R1.1] (§D1)")), base);
  assert.notEqual(specHash(files("- [ ] `ok-1` Fine [R1]")), base);
  assert.notEqual(specHash(files("- [ ] ok-1 Fine [R1] (§D1)")), base);
});

test("approval puts a task's refs on it, and graph.view shows them", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root }),
    legacy = legacySpecFiles();
  writeSpec(root, "config", {
    "requirements.md": REQUIREMENTS,
    "design.md": DESIGN,
    "tasks.md": legacy["tasks.md"].replace(
      "1.2 Validate loaded config",
      "1.2 Validate loaded config [R1.2] (§D1)",
    ),
  });
  const plan = await ops.execute("plan.create", { spec: "config" }),
    preview = await ops.execute("plan.preview", { id: "config" });
  await ops.execute("plan.approve", {
    id: "config",
    expectedHash: plan.hash,
    expectedRevision: preview.expectedRevision,
  });
  const refs = [
    { kind: "requirement", ref: "R1.2", file: "requirements.md", line: 12 },
    { kind: "design", ref: "§D1", file: "design.md", line: 7 },
  ];
  const task = store.read().tasks.find((row) => row.id === "config.1.2");
  assert.equal(task.title, "Validate loaded config");
  assert.deepEqual(task.refs, refs);
  const graph = await ops.execute("graph.view", {});
  assert.deepEqual(
    graph.tasks.find((row) => row.id === "config.1.2").refs,
    refs,
  );
  assert.deepEqual(graph.tasks.find((row) => row.id === "config.1.1").refs, []);
});
