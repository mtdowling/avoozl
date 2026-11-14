// rc-17.2 and rc-17.3: a cross-repository proposal is a parent spec (an epic
// folder) with one sub-spec per repository, and an external gap report turns
// each failing cell into a proposed task that a person accepts. Local files
// and fake data only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  formatGapTable,
  gapProposals,
  parseGapReport,
} from "../gap-report.mjs";
import { Operations } from "../operations.mjs";
import { lintSpec, readSpecFolder } from "../spec-plans.mjs";
import { fixture } from "./fixtures.mjs";
import { writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const leaf = (extra = {}) => ({
  kind: "leaf",
  summary: "Do it.",
  acceptance: ["It works."],
  checks: ["npm test"],
  completion: "integrated",
  ...extra,
});

function workspace(t) {
  const { root, store } = fixture(t);
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

// A sub-spec for one repository, a member of `parent`.
function sub(
  root,
  name,
  repository,
  entries = { "sub-1": leaf({ repository }) },
) {
  writeSpec(root, name, {
    "requirements.md": `---\nepic: parent\n---\n# ${name}\n\nThe goal.\n`,
    "tasks.md": `# Tasks\n\n${Object.keys(entries)
      .map((id) => `- [ ] ${id} Task ${id}\n`)
      .join("")}`,
    "avoozl/manifest.json": JSON.stringify({ tasks: entries }, null, 2),
  });
}
function parent(root, members, entryExtra = {}) {
  writeSpec(root, "parent", {
    "requirements.md": "# Parent\n\nShared requirements: R1 and R2.\n",
    "design.md": "# Design\n\nOne sub-spec per repository.\n",
    "tasks.md": `# Sub-specs\n\n${members.map((m, i) => `- [ ] ${i + 1} Sub-spec ${m}\n`).join("")}`,
    "avoozl/manifest.json": JSON.stringify(
      {
        kind: "epic",
        tasks: Object.fromEntries(
          members.map((m, i) => [
            String(i + 1),
            { plan: m, summary: `Sub-spec ${m}.`, ...entryExtra },
          ]),
        ),
      },
      null,
      2,
    ),
  });
}
const errors = (quality) =>
  quality.diagnostics.filter((d) => d.severity === "error");

test("a parent that holds a repository task is refused", (t) => {
  const { root, ops } = workspace(t);
  sub(root, "repo-a", "repo-a");
  parent(root, ["repo-a"], { repository: "repo-a", kind: "leaf" });
  const quality = lintSpec({
    spec: readSpecFolder(root, "parent"),
    plan: { id: "parent" },
    namespace: ops.specNamespace(),
  });
  assert.ok(errors(quality).some((d) => d.code === "spec.epic-task-fields"));
  // A parent with only plan and summary entries is clean.
  parent(root, ["repo-a"]);
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
});

test("a cross-repository requires on a missing ID is refused naming it, and passes once the other sub-spec holds it", (t) => {
  const { root } = workspace(t);
  sub(root, "repo-b", "repo-b", {
    "b-1": leaf({ repository: "repo-b", requires: ["a-9"] }),
  });
  const spec = readSpecFolder(root, "repo-b"),
    missing = lintSpec({ spec, plan: { id: "repo-b" }, data: { tasks: [] } });
  const refused = errors(missing).find((d) => /a-9/.test(d.message));
  assert.ok(refused, "names the missing ID");
  // The other sub-spec is approved and holds the ID: the same text is clean.
  const held = lintSpec({
    spec,
    plan: { id: "repo-b" },
    data: { tasks: [{ id: "a-9", status: "planned", title: "x" }] },
  });
  assert.deepEqual(errors(held), []);
});

test("two sub-specs approve separately", async (t) => {
  const { root, store, ops } = workspace(t);
  for (const id of ["code", "repo-a", "repo-b"])
    store.put("projects", {
      id,
      root,
      baseBranch: "main",
      checks: [["npm", "test"]],
    });
  sub(root, "repo-a", "repo-a");
  sub(root, "repo-b", "repo-b", { "b-1": leaf({ repository: "repo-b" }) });
  const approvals = [];
  for (const spec of ["repo-a", "repo-b"]) {
    const plan = await ops.execute("plan.create", {
      spec,
      context: { projectId: "code" },
    });
    await ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: store.read().revision,
    });
    approvals.push(plan.id);
  }
  assert.equal(store.list("approvals").length, 2);
  assert.deepEqual(
    store
      .list("approvals")
      .map((a) => a.planId)
      .sort(),
    approvals.sort(),
  );
});

const REPORT = [
  "# Gap report",
  "",
  "Some prose before the table is ignored.",
  "",
  "| Repository | R1   | R2   | R3   |",
  "| ---------- | ---- | ---- | ---- |",
  "| repo-a     | pass | fail | pass |",
  "| repo-b     | fail | pass | pass |",
  "",
  "After the table.",
].join("\n");

test("a report with two failing and three passing cells gives two proposals", () => {
  const report = parseGapReport(REPORT);
  assert.deepEqual(report.repositories, ["repo-a", "repo-b"]);
  assert.equal(report.cells.filter((c) => c.status === "pass").length, 4);
  const proposals = gapProposals(report, (repository) => `sub-${repository}`);
  assert.deepEqual(
    proposals.map((p) => [p.spec, p.id]),
    [
      ["sub-repo-a", "close-gap-r2"],
      ["sub-repo-b", "close-gap-r1"],
    ],
  );
  assert.match(formatGapTable(report), /repo-a\s+pass\s+fail\s+pass/);
});

test("an unreadable line is refused naming its number, and a repository with no sub-spec is refused", () => {
  const bad = REPORT.replace(
    "| repo-b     | fail | pass | pass |",
    "| repo-b     | maybe | pass | pass |",
  );
  assert.throws(() => parseGapReport(bad), /Line 8:/);
  assert.throws(
    () =>
      parseGapReport(
        REPORT.replace(
          "| repo-b     | fail | pass | pass |",
          "| repo-b | fail |",
        ),
      ),
    /Line 8: 2 cells/,
  );
  assert.throws(() => parseGapReport("no table here"), /no table/);
  assert.throws(() => parseGapReport(""), /empty/);
  assert.throws(
    () => gapProposals(parseGapReport(REPORT), () => null),
    /no sub-spec takes that repository/,
  );
});

test("preview shows the table and proposals and writes nothing; accepting adds draft tasks; an agent cannot accept", async (t) => {
  const { root, store, ops } = workspace(t);
  for (const id of ["code", "repo-a", "repo-b"])
    store.put("projects", {
      id,
      root,
      baseBranch: "main",
      checks: [["npm", "test"]],
    });
  sub(root, "repo-a", "repo-a");
  sub(root, "repo-b", "repo-b", { "b-1": leaf({ repository: "repo-b" }) });
  parent(root, ["repo-a", "repo-b"]);
  for (const spec of ["repo-a", "repo-b"])
    await ops.execute("plan.create", { spec, context: { projectId: "code" } });
  const file = path.join(root, "gap.md");
  fs.writeFileSync(file, REPORT);
  const before = fs.readFileSync(
    path.join(root, ".kiro/specs/repo-a/tasks.md"),
    "utf8",
  );
  const preview = await ops.execute("gap.preview", {
    parent: "parent",
    path: file,
  });
  assert.equal(preview.proposals.length, 2);
  assert.equal(
    fs.readFileSync(path.join(root, ".kiro/specs/repo-a/tasks.md"), "utf8"),
    before,
  );
  await assert.rejects(
    ops.execute("gap.accept", { parent: "parent", path: file }, undefined, {
      mcp: true,
    }),
    /person/,
  );
  await assert.rejects(
    ops.execute("gap.preview", { parent: "parent", path: file }, undefined, {
      mcp: true,
    }),
    /issue/,
  );
  const accepted = await ops.execute("gap.accept", {
    parent: "parent",
    path: file,
  });
  assert.deepEqual(accepted.added.sort(), [
    "repo-a:close-gap-r2",
    "repo-b:close-gap-r1",
  ]);
  assert.match(
    fs.readFileSync(path.join(root, ".kiro/specs/repo-a/tasks.md"), "utf8"),
    /close-gap-r2/,
  );
  assert.match(
    fs.readFileSync(path.join(root, ".kiro/specs/repo-b/tasks.md"), "utf8"),
    /close-gap-r1/,
  );
});
