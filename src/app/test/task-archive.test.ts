import test from "node:test";
import assert from "node:assert/strict";
import { Operations } from "../api/operations.ts";
import { queryTasks } from "../../query.ts";
import { fixture } from "./fixtures.ts";

// The task fields these tests read back from an operation.
interface Archived {
  status?: string;
  archivedAt?: string | null;
  acceptanceEvidence?: { at: string };
}

test("task archives hide active work and restore it", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  const archived = await ops.execute<Archived>("task.archive", {
    id: "sample-task",
  });
  assert.ok(archived.archivedAt);
  assert.equal(queryTasks(store.read(), { scope: "all" }).length, 0);
  assert.deepEqual(
    queryTasks(store.read(), { scope: "all", historical: true }).map(
      (task) => task.id,
    ),
    ["sample-task"],
  );
  const restored = await ops.execute<Archived>("task.unarchive", {
    id: "sample-task",
  });
  assert.equal(restored.archivedAt, null);
  assert.equal(queryTasks(store.read(), { scope: "all" }).length, 1);
});

test("whole-head acceptance auto-archives but component completion does not", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  const component = await ops.execute<Archived>("task.accept", {
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
  const accepted = await ops.execute<Archived>("task.accept", {
    id: "sample-task",
  });
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.archivedAt, accepted.acceptanceEvidence?.at);
});
