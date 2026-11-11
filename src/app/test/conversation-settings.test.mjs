import assert from "node:assert/strict";
import test from "node:test";
import { RunManager } from "../manager.mjs";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

const disabledRouting = {
  enabled: false,
  fallback: { agentProfile: null, model: null },
  rules: [],
};

test("completed task and child conversations auto-archive but Driver does not", (t) => {
  const { store } = fixture(t),
    manager = new RunManager(store, { recover: false });
  t.after(() => manager.close());
  const taskRun = store.put("runs", {
    id: "run-task",
    taskId: "sample-task",
    provider: "codex",
    mode: "implement",
    state: "running",
  });
  const childRun = store.put("runs", {
    id: "run-child",
    taskId: "conversation:run-child",
    provider: "codex",
    mode: "ask",
    parentRunId: "driver-fixture",
    state: "running",
  });
  const driver = store.put("runs", {
    id: "driver-fixture",
    taskId: "conversation:driver-fixture",
    provider: "openhands",
    mode: "ask",
    driver: true,
    driverRole: "project",
    state: "running",
  });

  manager.receive(taskRun.id, "turn.completed", { state: "completed" });
  manager.receive(childRun.id, "turn.completed", { state: "completed" });
  manager.receive(driver.id, "turn.completed", { state: "completed" });

  assert.ok(store.getMeta("runArchive:" + taskRun.id));
  assert.ok(store.getMeta("runArchive:" + childRun.id));
  assert.equal(store.getMeta("runArchive:" + driver.id), null);
});

test("conversation auto-archive can be disabled without disabling manual archive", async (t) => {
  const { store } = fixture(t),
    manager = new RunManager(store, { recover: false }),
    ops = new Operations(store, { manager });
  t.after(() => manager.close());
  assert.deepEqual(await ops.execute("conversations.settings.get"), {
    autoArchiveCompleted: true,
    driverAgentProfile: null,
    driverModel: null,
    routing: disabledRouting,
  });
  assert.deepEqual(
    await ops.execute("conversations.settings.update", {
      autoArchiveCompleted: false,
    }),
    {
      autoArchiveCompleted: false,
      driverAgentProfile: null,
      driverModel: null,
      routing: disabledRouting,
    },
  );
  const run = store.put("runs", {
    id: "run-no-auto-archive",
    taskId: "sample-task",
    provider: "codex",
    mode: "implement",
    state: "running",
  });
  manager.receive(run.id, "turn.completed", { state: "completed" });
  assert.equal(store.getMeta("runArchive:" + run.id), null);

  const archived = await ops.execute("run.archive", { id: run.id });
  assert.ok(archived.archivedAt);
});

test("task acceptance follows the auto-archive preference", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  await ops.execute("conversations.settings.update", {
    autoArchiveCompleted: false,
  });
  store.mutate("Record fixture integration", (data) => {
    data.tasks[0].integration = {
      commit: "abc123",
      at: "2026-11-10T00:00:00.000Z",
    };
  });
  store.put("runs", {
    id: "run-accepted-task",
    taskId: "sample-task",
    provider: "codex",
    mode: "implement",
    state: "completed",
  });

  const accepted = await ops.execute(
    "task.accept",
    { id: "sample-task", evidence: "Reviewed locally." },
    store.read().revision,
  );
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.archivedAt, undefined);
  assert.equal(store.getMeta("runArchive:run-accepted-task"), null);
});

test("Driver profile and model settings persist, trim, clear, and preserve omitted fields", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  assert.deepEqual(
    await ops.execute("conversations.settings.update", {
      driverAgentProfile: "  profile-reviewer  ",
      driverModel: "  anthropic/claude-sonnet  ",
    }),
    {
      autoArchiveCompleted: true,
      driverAgentProfile: "profile-reviewer",
      driverModel: "anthropic/claude-sonnet",
      routing: disabledRouting,
    },
  );
  assert.deepEqual(
    await new Operations(store).execute("conversations.settings.get"),
    {
      autoArchiveCompleted: true,
      driverAgentProfile: "profile-reviewer",
      driverModel: "anthropic/claude-sonnet",
      routing: disabledRouting,
    },
  );
  assert.deepEqual(
    await ops.execute("conversations.settings.update", {
      autoArchiveCompleted: false,
      driverModel: " ",
    }),
    {
      autoArchiveCompleted: false,
      driverAgentProfile: "profile-reviewer",
      driverModel: null,
      routing: disabledRouting,
    },
  );
  assert.deepEqual(
    await ops.execute("conversations.settings.update", {
      driverAgentProfile: null,
    }),
    {
      autoArchiveCompleted: false,
      driverAgentProfile: null,
      driverModel: null,
      routing: disabledRouting,
    },
  );
});

test("Driver profile and model settings reject non-text values atomically", async (t) => {
  const { store } = fixture(t),
    ops = new Operations(store);
  await ops.execute("conversations.settings.update", {
    driverAgentProfile: "profile-stable",
    driverModel: "model-stable",
  });

  for (const input of [
    { driverAgentProfile: 42 },
    { driverModel: { id: "model-other" } },
    { autoArchiveCompleted: "yes" },
  ])
    await assert.rejects(
      ops.execute("conversations.settings.update", input),
      /Driver agent and model choices must be text|Choose whether completed conversations auto-archive/,
    );

  assert.deepEqual(await ops.execute("conversations.settings.get"), {
    autoArchiveCompleted: true,
    driverAgentProfile: "profile-stable",
    driverModel: "model-stable",
    routing: disabledRouting,
  });
});
