import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { lintPlan } from "../plan-quality.mjs";
import { fixture } from "./fixtures.mjs";

const design = `# Portable release

## Intent

Ship one reviewed release across two code repositories.

## Design

The library lands before the client consumes it.

## Proposed work

\`\`\`task
{"id":"library","title":"Publish library contract","summary":"Expose the shared contract.","acceptance":["The contract test reads the published schema."],"projectId":"library","requires":[]}
\`\`\`

\`\`\`task
{"id":"client","title":"Adopt library contract","summary":"Use the shared contract from the client.","acceptance":["The client compatibility suite passes against the published schema."],"projectId":"client","requires":["library"]}
\`\`\`
`;

test("ordinary design prose is valid without prescribed headings or task blocks", () => {
  const result = lintPlan({
    text: "Ship the portable release after its compatibility check succeeds.",
    plan: { context: {} },
    data: { projects: [], tasks: [] },
  });
  assert.equal(result.canApprove, true);
  assert.equal(result.taskCount, 0);
  assert.deepEqual(result.diagnostics, []);
});

test("plan quality reports reusable line diagnostics and cross-project dependencies", () => {
  const result = lintPlan({
    text: design,
    plan: { context: {} },
    data: {
      projects: [
        { id: "library", checks: [["npm", "test"]] },
        { id: "client", checks: [["npm", "test"]] },
      ],
      tasks: [],
    },
  });
  assert.equal(result.canApprove, true);
  assert.equal(result.taskCount, 2);
  assert.equal(result.counts.error, 0);
  const crossProject = result.diagnostics.find(
    (item) => item.code === "task.cross-project-dependency",
  );
  assert.equal(crossProject.taskId, "client");
  assert.equal(crossProject.relatedTaskId, "library");
  assert.ok(crossProject.lineStart > 1);
});

test("plan quality blocks unknown projects, references, and dependency cycles", () => {
  const text = design
    .replace('"projectId":"client"', '"projectId":"missing"')
    .replace('"requires":["library"]', '"requires":["library","missing-task"]')
    .replace('"requires":[]', '"requires":["client"]');
  const result = lintPlan({
    text,
    plan: { context: {} },
    data: {
      projects: [
        { id: "library", checks: [["npm", "test"]] },
        { id: "client", checks: [["npm", "test"]] },
      ],
      tasks: [],
    },
  });
  assert.equal(result.canApprove, false);
  assert.deepEqual(
    new Set(
      result.diagnostics
        .filter((item) => item.severity === "error")
        .map((item) => item.code),
    ),
    new Set([
      "task.unknown-project",
      "task.unknown-dependency",
      "task.dependency-cycle",
    ]),
  );
});

test("plan quality catches an existing duplicate before approval", () => {
  const result = lintPlan({
    text: design.replace(
      '"title":"Publish library contract"',
      '"title":"Existing durable library contract"',
    ),
    plan: { id: "portable-release", context: {} },
    data: {
      projects: [
        { id: "library", checks: [["npm", "test"]] },
        { id: "client", checks: [["npm", "test"]] },
      ],
      tasks: [
        {
          id: "existing-contract",
          title: "Existing durable library contract",
        },
      ],
    },
  });
  const duplicate = result.diagnostics.find(
    (item) => item.code === "task.possible-duplicate",
  );
  assert.equal(result.canApprove, true);
  assert.equal(duplicate.severity, "warning");
  assert.equal(duplicate.relatedTaskId, "existing-contract");
});

test("operations expose live quality checks and refuse a blocking approval", async (t) => {
  const { store } = fixture(t);
  store.put("projects", {
    id: "library",
    root: "/tmp/library",
    baseBranch: "main",
    worktreeRoot: "/tmp/worktrees",
    checks: [["npm", "test"]],
  });
  const ops = new Operations(store);
  const plan = await ops.execute("plan.create", {
    id: "plan-quality",
    prompt: "Plan a portable release.",
    text: design.replace('"projectId":"client"', '"projectId":"missing"'),
  });
  const quality = await ops.execute("plan.lint", { id: plan.id });
  assert.equal(quality.canApprove, false);
  assert.equal(
    quality.diagnostics.some((item) => item.code === "task.unknown-project"),
    true,
  );
  const preview = await ops.execute("plan.preview", { id: plan.id });
  assert.equal(preview.quality.canApprove, false);
  await assert.rejects(
    ops.execute("plan.approve", {
      id: plan.id,
      expectedHash: plan.hash,
      expectedRevision: preview.expectedRevision,
    }),
    /task\.unknown-project/,
  );
});
