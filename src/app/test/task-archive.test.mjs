import test from "node:test";
import assert from "node:assert/strict";
import { Operations } from "../operations.mjs";
import { queryTasks } from "../../query.mjs";
import { fixture } from "./fixtures.mjs";

test("task archives hide active work while retaining every linked conversation", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  for (const id of ["first-session", "second-session"])
    store.put("runs", {
      id,
      taskId: "sample-task",
      provider: "openhands",
      providerSessionId: "conversation-" + id,
      state: "completed",
      mode: "implement",
      createdAt: new Date().toISOString(),
    });
  const archived = await ops.execute("task.archive", { id: "sample-task" });
  assert.ok(archived.archivedAt);
  assert.equal(queryTasks(store.read(), { scope: "all" }).length, 0);
  assert.deepEqual(
    queryTasks(store.read(), { scope: "all", historical: true }).map(
      (task) => task.id,
    ),
    ["sample-task"],
  );
  assert.equal(ops.detail("sample-task").runs.length, 2);
  const restored = await ops.execute("task.unarchive", { id: "sample-task" });
  assert.equal(restored.archivedAt, null);
  assert.equal(queryTasks(store.read(), { scope: "all" }).length, 1);
});

test("whole-head acceptance auto-archives but component completion does not", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  const component = await ops.execute("task.accept", {
    id: "sample-task",
    componentOnly: true,
  });
  assert.equal(component.archivedAt, undefined);
  store.mutate("Prepare integration", (data) => {
    data.tasks[0].integration = {
      commit: "abcdef1234567",
      at: new Date().toISOString(),
      branch: "main",
      repo: "fixture",
      evidence: ["Fixture landed."],
    };
  });
  const accepted = await ops.execute("task.accept", { id: "sample-task" });
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.archivedAt, accepted.acceptanceEvidence.at);
});
