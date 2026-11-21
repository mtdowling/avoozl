import assert from "node:assert/strict";
import test from "node:test";
import { lintPlan } from "../plan-quality.ts";

// A spec's two proposed tasks across two code repositories: the library
// lands before the client consumes it.
const proposals = () => [
  {
    id: "library",
    title: "Publish library contract",
    summary: "Expose the shared contract.",
    acceptance: ["The contract test reads the published schema."],
    repositoryId: "library",
    requires: [],
    lineStart: 3,
    lineEnd: 4,
  },
  {
    id: "client",
    title: "Adopt library contract",
    summary: "Use the shared contract from the client.",
    acceptance: [
      "The client compatibility suite passes against the published schema.",
    ],
    repositoryId: "client",
    requires: ["library"],
    lineStart: 5,
    lineEnd: 6,
  },
];

const repositories = [
  { id: "library", checks: [["npm", "test"]] },
  { id: "client", checks: [["npm", "test"]] },
];

test("plan quality reports line diagnostics and cross-repository dependencies", () => {
  const result = lintPlan({
    plan: { context: {} },
    data: { repositories, tasks: [] },
    proposals: proposals(),
  });
  assert.equal(result.canApprove, true);
  assert.equal(result.taskCount, 2);
  assert.equal(result.counts.error, 0);
  const crossRepository = result.diagnostics.find(
    (item: { code: string }) =>
      item.code === "task.cross-repository-dependency",
  );
  assert.ok(crossRepository);
  assert.equal(crossRepository.taskId, "client");
  assert.equal(crossRepository.relatedTaskId, "library");
  assert.equal(crossRepository.lineStart, 5);
});

test("plan quality blocks unknown repositories, references, and dependency cycles", () => {
  const [library, client] = proposals();
  client.repositoryId = "missing";
  client.requires = ["library", "missing-task"];
  library.requires = ["client"];
  const result = lintPlan({
    plan: { context: {} },
    data: { repositories, tasks: [] },
    proposals: [library, client],
  });
  assert.equal(result.canApprove, false);
  assert.deepEqual(
    new Set(
      result.diagnostics
        .filter((item: { severity: string }) => item.severity === "error")
        .map((item: { code: string }) => item.code),
    ),
    new Set([
      "task.unknown-repository",
      "task.unknown-dependency",
      "task.dependency-cycle",
    ]),
  );
});

test("plan quality catches an existing duplicate before approval", () => {
  const [library, client] = proposals();
  library.title = "Existing durable library contract";
  const result = lintPlan({
    plan: { id: "portable-release", context: {} },
    data: {
      repositories,
      tasks: [
        {
          id: "existing-contract",
          title: "Existing durable library contract",
          status: "planned",
        },
      ],
    },
    proposals: [library, client],
  });
  const duplicate = result.diagnostics.find(
    (item: { code: string }) => item.code === "task.possible-duplicate",
  );
  assert.ok(duplicate);
  assert.equal(result.canApprove, true);
  assert.equal(duplicate.severity, "warning");
  assert.equal(duplicate.relatedTaskId, "existing-contract");
});
