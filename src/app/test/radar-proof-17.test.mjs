// Proof 17 (rc-p17): epic types. Run on a scratch workspace with three fake
// repositories, local files only; no real repository is written.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { applicationRoot } from "../config.mjs";
import { Operations } from "../operations.mjs";
import { lintSpec, readSpecFolder } from "../spec-plans.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const REPOS = ["repo-a", "repo-b", "repo-c"];
const leaf = (repository) => ({
  kind: "leaf",
  repository,
  summary: "Do it.",
  acceptance: ["It works."],
  checks: ["npm test"],
  completion: "integrated",
});
const errors = (quality) =>
  quality.diagnostics.filter((d) => d.severity === "error");
const read = (root, spec, file) =>
  fs.readFileSync(path.join(root, ".kiro", "specs", spec, file), "utf8");

test("Proof 17: a migration from the template, a three-repository proposal and a gap report", async (t) => {
  const { root, store } = fixture(t),
    ops = new Operations(store, { workspaceRoot: root });
  for (const id of ["code", ...REPOS])
    store.put("projects", {
      id,
      root,
      baseBranch: "main",
      checks: [["npm", "test"]],
    });
  const approve = async (spec) => {
    const plan = await ops.execute("plan.create", {
      spec,
      context: { projectId: "code" },
    });
    return ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
    });
  };

  // 1. A migration from the template is a valid spec and can be approved.
  fs.cpSync(
    path.join(applicationRoot, "examples", "epic-templates", "migration"),
    path.join(root, ".kiro", "specs", "migration"),
    { recursive: true },
  );
  const migration = lintSpec({
    spec: readSpecFolder(root, "migration"),
    plan: { id: "migration" },
  });
  assert.deepEqual(errors(migration), []);
  await approve("migration");
  assert.equal(store.list("approvals").length, 1);

  // 2. A proposal: a parent with no repository task and three sub-specs.
  for (const repository of REPOS)
    writeSpec(root, repository, {
      "requirements.md": "---\nepic: parent\n---\n# Sub\n\nThe goal.\n",
      "tasks.md": `# Tasks\n\n- [ ] ${repository}-1 Task\n`,
      "avoozl/manifest.json": JSON.stringify({
        tasks: { [`${repository}-1`]: leaf(repository) },
      }),
    });
  writeSpec(root, "parent", {
    "requirements.md": "# Parent\n\nShared requirements: R1, R2 and R3.\n",
    "design.md": "# Design\n\nOne sub-spec per repository.\n",
    "tasks.md": `# Sub-specs\n\n${REPOS.map((m, i) => `- [ ] ${i + 1} Sub-spec ${m}\n`).join("")}`,
    "avoozl/manifest.json": JSON.stringify({
      kind: "epic",
      tasks: Object.fromEntries(
        REPOS.map((m, i) => [
          String(i + 1),
          { plan: m, summary: `Sub-spec ${m}.` },
        ]),
      ),
    }),
  });
  assert.deepEqual(
    errors(
      lintSpec({
        spec: readSpecFolder(root, "parent"),
        plan: { id: "parent" },
        namespace: ops.specNamespace(),
      }),
    ),
    [],
  );
  const before = store.list("approvals").length;
  await approve("repo-a");
  assert.equal(
    store.list("approvals").length,
    before + 1,
    "one approval alone",
  );
  await approve("repo-b");
  await approve("repo-c");
  assert.equal(
    store.list("approvals").length,
    before + 3,
    "three separate approvals",
  );

  // 3. A gap report: three failing cells and six passing ones.
  const report = path.join(root, "gap.md");
  fs.writeFileSync(
    report,
    [
      "| Repository | R1 | R2 | R3 |",
      "| ---------- | ---- | ---- | ---- |",
      "| repo-a | pass | fail | pass |",
      "| repo-b | fail | pass | pass |",
      "| repo-c | pass | pass | fail |",
    ].join("\n"),
  );
  const tasksBefore = REPOS.map((r) => read(root, r, "tasks.md"));
  const preview = await ops.execute("gap.preview", {
    parent: "parent",
    path: report,
  });
  assert.equal(preview.proposals.length, 3, "one proposal per failing cell");
  assert.deepEqual(
    REPOS.map((r) => read(root, r, "tasks.md")),
    tasksBefore,
    "the preview writes nothing",
  );
  const accepted = await ops.execute("gap.accept", {
    parent: "parent",
    path: report,
  });
  assert.deepEqual(accepted.added.sort(), [
    "repo-a:close-gap-r2",
    "repo-b:close-gap-r1",
    "repo-c:close-gap-r3",
  ]);
  for (const [repository, gap] of [
    ["repo-a", "r2"],
    ["repo-b", "r1"],
    ["repo-c", "r3"],
  ]) {
    const text = read(root, repository, "tasks.md");
    assert.match(text, new RegExp(`close-gap-${gap}`));
    for (const other of ["r1", "r2", "r3"].filter((x) => x !== gap))
      assert.doesNotMatch(
        text,
        new RegExp(`close-gap-${other}`),
        "passing cells add none",
      );
  }
});
