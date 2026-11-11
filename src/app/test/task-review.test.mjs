import assert from "node:assert/strict";
import test from "node:test";
import { mintRunCapability, toolAllowedForRun } from "../run-capabilities.mjs";
import { taskReviewContext } from "../task-review.mjs";
import { RunManager } from "../manager.mjs";
import { fixture } from "./fixtures.mjs";

test("completed task review is evidence-bound and cannot mutate task state", (t) => {
  const { store } = fixture(t);
  store.mutate("Complete task", (data) => {
    const task = data.tasks[0];
    task.status = "accepted";
    task.acceptanceEvidence = {
      acceptedBy: "operator",
      at: "2026-11-10T10:00:00.000Z",
      evidence: "Reviewed the passing check.",
      derivedFrom: ["evidence-review"],
    };
    task.integration = {
      commit: "1234567890abcdef",
      branch: "main",
    };
  });
  store.put("runs", {
    id: "run-implementation",
    taskId: "sample-task",
    mode: "implement",
    provider: "openhands",
    state: "completed",
    branch: "avoozl/sample-task",
    worktree: "/tmp/sample-task",
    expectedCommit: "1234567890abcdef",
  });
  store.put("evidence", {
    id: "evidence-review",
    taskId: "sample-task",
    kind: "command",
    argv: ["npm", "test"],
    exitCode: 0,
    commit: "1234567890abcdef",
  });
  const data = store.read(),
    context = taskReviewContext(store, data, data.tasks[0]);
  assert.equal(context.complete, true);
  assert.equal(context.acceptanceEvidence.acceptedBy, "operator");
  assert.equal(context.checks[0].exitCode, 0);
  assert.equal(context.sessions[0].id, "run-implementation");
  assert.equal(context.codeChanges.commits[0].sha, "1234567890abcdef");

  const run = store.put("runs", {
      id: "run-review",
      taskId: "sample-task",
      mode: "ask",
      capabilityMode: "review",
      provider: "openhands",
      state: "running",
    }),
    capability = mintRunCapability(store, run).capability;
  assert.equal(
    toolAllowedForRun(capability, {
      name: "plans_propose_work",
      annotations: {},
    }),
    true,
  );
  assert.equal(
    toolAllowedForRun(capability, {
      name: "plans_capture",
      annotations: {},
    }),
    false,
  );
  assert.equal(
    toolAllowedForRun(capability, {
      name: "plans_task_accept",
      annotations: {},
    }),
    false,
  );
  assert.equal(
    toolAllowedForRun(capability, {
      name: "plans_get_task",
      annotations: { readOnlyHint: true },
    }),
    true,
  );

  const manager = new RunManager(store, { recover: false, factories: {} });
  t.after(() => manager.close());
  const prompt = manager.context({
    ...run,
    context: { conversationPurpose: "review", taskIds: ["sample-task"] },
    handoffPath: "/tmp/review-handoff.json",
    prompt: "Review this completed task.",
  });
  assert.match(prompt, /Review the finished work/);
  assert.match(prompt, /"complete":true/);
  assert.match(prompt, /"evidence-review"/);
  assert.doesNotMatch(prompt, /Implement the task, run the relevant checks/);
});
