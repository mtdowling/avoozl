import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";

test("task.sessions lists the task's Kiro Crew sessions and refuses an unknown task", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  assert.deepEqual(
    await ops.execute("task.sessions", { id: "sample-task" }),
    [],
  );
  await assert.rejects(
    ops.execute("task.sessions", { id: "missing" }),
    /Task not found/,
  );
});

test("external landing metadata remains separate from acceptance and workspace receipts stay bounded", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store),
    at = new Date(Date.now() - 1000).toISOString(),
    integration = {
      commit: "abcdef0123456789",
      at,
      repo: "/fixture/repo",
      branch: "main",
      evidence: ["evidence/landing.json"],
    };
  await ops.execute("task.update", { id: "sample-task", integration });
  const task = store.read().tasks[0];
  assert.equal(task.integration.commit, integration.commit);
  assert.equal(task.status, "planned");
  assert.equal(task.acceptanceEvidence, undefined);
  assert.ok(task.integration.recordedAt);
  assert.ok(task.evidence.includes("evidence/landing.json"));
  for (const invalid of [
    { ...integration, commit: 1234567 },
    { ...integration, evidence: [] },
    { ...integration, at: "tomorrow" },
    { ...integration, repo: "" },
  ])
    await assert.rejects(
      ops.execute("task.update", { id: "sample-task", integration: invalid }),
      /Integration requires/,
    );
  assert.equal(
    store.read().tasks[0].integration.commit,
    integration.commit,
    "Invalid writes roll back.",
  );
  for (let i = 0; i < 110; i++)
    store.put("integration", {
      id: "landing-" + i,
      taskId: "sample-task",
      state: "integrated",
      integratedCommit: "abcdef0",
      integratedAt: new Date(i * 1000).toISOString(),
      evidenceIds: ["x".repeat(100000)],
    });
  store.put("integration", {
    id: "not-landed",
    taskId: "sample-task",
    state: "ready",
    commit: "abcdef0",
  });
  const workspace = await ops.execute("workspace");
  assert.equal(workspace.recentIntegrations.length, 100);
  assert.equal(workspace.recentIntegrations[0].id, "landing-109");
  assert.equal(workspace.recentIntegrations[0].evidenceIds, undefined);
  assert.ok(JSON.stringify(workspace.recentIntegrations).length < 30000);
  assert.equal(workspace.integrations.length, 1);
});
