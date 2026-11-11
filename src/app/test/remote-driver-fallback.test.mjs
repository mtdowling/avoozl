import assert from "node:assert/strict";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { fixture } from "./fixtures.mjs";

function configureProject(store, root) {
  store.put("projects", {
    id: "fixture",
    root,
    baseBranch: "main",
    worktreeRoot: root + "/worktrees",
    checks: [],
  });
}

test("an older remote host falls back from driver.open to run.start", async (t) => {
  const { store, root } = fixture(t);
  configureProject(store, root);
  const calls = [],
    manager = {
      remote: true,
      async command(operation, input) {
        calls.push({ operation, input });
        if (operation === "driver.open")
          throw Error("Unsupported agent-host operation.");
        if (operation === "run.start")
          return {
            id: input.id,
            taskId: "conversation:" + input.id,
            projectId: input.projectId,
            provider: input.provider,
            providerSessionId: "conversation-compatibility",
            model: input.model,
            agentProfile: input.agentProfile,
            mode: "ask",
            state: "running",
            createdAt: "2026-11-10T00:00:00.000Z",
          };
        assert.fail("Unexpected remote operation " + operation);
      },
    },
    ops = new Operations(store, { manager });

  const first = await ops.execute("driver.open", {
    projectId: "fixture",
    provider: "openhands",
    agentProfile: "profile-driver",
    model: "anthropic/claude-sonnet",
    context: { view: "plans" },
  });
  assert.equal(first.created, true);
  assert.equal(first.compatibilityMode, true);
  assert.equal(first.run.driver, true);
  assert.equal(first.run.driverRole, "project");
  assert.equal(first.run.agentProfile, "profile-driver");
  assert.equal(first.run.model, "anthropic/claude-sonnet");
  assert.deepEqual(
    calls.map((call) => call.operation),
    ["driver.open", "run.start"],
  );
  assert.equal(calls[1].input.agentProfile, "profile-driver");
  assert.equal(calls[1].input.model, "anthropic/claude-sonnet");
  assert.equal(calls[1].input.prompt, undefined);

  const reopened = await ops.execute("driver.open", {
    projectId: "fixture",
    context: { view: "queue" },
  });
  assert.equal(reopened.created, false);
  assert.equal(reopened.compatibilityMode, true);
  assert.equal(reopened.run.id, first.run.id);
  assert.deepEqual(reopened.run.context, { view: "queue" });
  assert.deepEqual(
    calls.map((call) => call.operation),
    ["driver.open", "run.start", "driver.open"],
  );

  const idle = store.get("runs", first.run.id);
  idle.state = "completed";
  store.put("runs", idle);
  const replacement = await ops.execute("driver.open", {
    projectId: "fixture",
    agentProfile: "profile-driver-next",
    model: "anthropic/claude-opus",
    context: { view: "activity" },
  });
  assert.equal(replacement.handedOff, true);
  assert.equal(replacement.previousRunId, first.run.id);
  assert.notEqual(replacement.run.id, first.run.id);
  assert.equal(replacement.run.driverActive, true);
  assert.equal(store.get("runs", first.run.id).driverActive, false);
  assert.ok(store.getMeta("runArchive:" + first.run.id));
  assert.deepEqual(
    calls.map((call) => call.operation),
    ["driver.open", "run.start", "driver.open", "driver.open", "run.start"],
  );
});

test("remote Driver fallback does not hide unrelated host failures", async (t) => {
  const { store, root } = fixture(t);
  configureProject(store, root);
  const manager = {
      remote: true,
      async command() {
        throw Error("Agent host disconnected.");
      },
    },
    ops = new Operations(store, { manager });

  await assert.rejects(
    ops.execute("driver.open", {
      projectId: "fixture",
      provider: "openhands",
    }),
    /Agent host disconnected/,
  );
  assert.equal(store.list("runs").length, 0);
});
