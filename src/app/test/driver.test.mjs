import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { startAgentHost } from "../agent-host.mjs";
import { driverConversationTitle, RunManager } from "../manager.mjs";
import { Operations } from "../operations.mjs";
import { RemoteManager } from "../remote-manager.mjs";
import { handleMcp } from "../mcp.mjs";
import { mintRunCapability } from "../run-capabilities.mjs";
import { fixture } from "./fixtures.mjs";

function configureProject(store, root, id = "fixture") {
  store.put("projects", {
    id,
    root,
    baseBranch: "main",
    worktreeRoot: root + "/worktrees",
    checks: [],
  });
}

test("Driver titles and persisted view context stay compact", () => {
  const title = driverConversationTitle({
    name: "  A project   with a deliberately long name ".repeat(12),
  });
  assert.match(title, /^Avoozl Driver · A project with a deliberately/);
  assert.ok(title.length <= 160);
});

test("Driver is one durable idle OpenHands conversation per project", async (t) => {
  const { store, root } = fixture(t);
  configureProject(store, root);
  const starts = [];
  const manager = new RunManager(store, {
    factories: {
      openhands: ({ emit }) => ({
        async start(options) {
          starts.push(options);
          emit("session", { providerSessionId: "driver-conversation" });
        },
        async close() {},
      }),
    },
  });
  t.after(() => manager.close());
  const ops = new Operations(store, { manager });

  const first = await ops.execute("driver.open", {
    projectId: "fixture",
    provider: "openhands",
    context: { view: "activity" },
  });
  assert.equal(first.created, true);
  assert.equal(first.run.driver, true);
  assert.equal(first.run.driverRole, "project");
  assert.equal(first.run.logicalConversationId, first.run.id);
  assert.equal(first.run.projectId, "fixture");
  assert.equal(first.run.providerSessionId, "driver-conversation");
  assert.equal(first.run.worktree, root);
  assert.equal(first.run.readOnly, true);
  assert.equal(first.run.state, "completed");
  assert.equal(starts.length, 1);
  assert.equal(starts[0].prompt, undefined);
  assert.match(starts[0].systemInstructions, /persistent Avoozl Driver/);
  assert.match(starts[0].systemInstructions, /plans_run_context/);
  assert.match(starts[0].conversationId, /^avoozl-driver-/);

  const reopened = await ops.execute("driver.open", {
    projectId: "fixture",
    context: { view: "plans", planId: "plan-1" },
  });
  assert.equal(reopened.created, false);
  assert.equal(reopened.run.id, first.run.id);
  assert.deepEqual(reopened.run.context, {
    view: "plans",
    planId: "plan-1",
  });
  assert.equal(starts.length, 1);

  const listed = await ops.execute("driver.list");
  assert.equal(listed.defaultProjectId, "fixture");
  assert.equal(listed.projects[0].run.id, first.run.id);

  const updated = await ops.execute("driver.context", {
    projectId: "fixture",
    context: { view: "queue" },
  });
  assert.deepEqual(updated.run.context, { view: "queue" });
  assert.equal(starts.length, 1);

  const token = mintRunCapability(store, updated.run).token;
  const mcp = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "plans_run_context", arguments: { input: {} } },
    },
    ops,
    { runId: updated.run.id, runCapability: token },
  );
  assert.equal(mcp.body.result.structuredContent.runId, updated.run.id);
  assert.deepEqual(mcp.body.result.structuredContent.context, {
    view: "queue",
  });
  assert.equal(mcp.body.result.structuredContent.project.id, "fixture");

  const intent = await ops.execute("intent.submit", {
    action: "ask",
    prompt: "Review the queue.",
    submissionId: "driver-child-intent",
    provider: "openhands",
    projectId: "fixture",
    parentRunId: first.run.id,
  });
  assert.equal(intent.run.parentRunId, first.run.id);
  assert.equal(intent.run.parentProviderSessionId, first.run.providerSessionId);
  assert.equal(starts[1].parentConversationId, first.run.providerSessionId);
});

test("the managed agent host accepts driver.open over RPC", async (t) => {
  const { store, root } = fixture(t);
  configureProject(store, root);
  const manifestPath = path.join(root, "agent-host.json"),
    host = startAgentHost({
      dbPath: store.filename,
      manifestPath,
      factories: {
        openhands: ({ emit }) => ({
          async start() {
            emit("session", { providerSessionId: "rpc-driver" });
          },
          async close() {},
        }),
      },
    });
  await once(host, "listening");
  const remote = new RemoteManager(manifestPath);
  const opened = await remote.command("driver.open", {
    projectId: "fixture",
    provider: "openhands",
    context: { view: "activity" },
  });
  assert.equal(opened.created, true);
  assert.equal(opened.run.driver, true);
  assert.equal(opened.run.providerSessionId, "rpc-driver");
  const stopped = once(host, "close");
  await remote.control("stop");
  await stopped;
});

test("Driver requires explicit project selection when several are configured", async (t) => {
  const { store, root } = fixture(t);
  configureProject(store, root);
  configureProject(store, root + "/second", "second");
  const manager = new RunManager(store, {
    factories: {
      openhands: () => ({
        async start() {},
        async close() {},
      }),
    },
  });
  t.after(() => manager.close());

  await assert.rejects(
    manager.openDriver({ provider: "openhands" }),
    /Choose which configured project/,
  );
  assert.equal(store.list("runs").length, 0);
});

test("reopening Driver after a host restart reconnects without sending a turn", async (t) => {
  const { store, root } = fixture(t);
  configureProject(store, root);
  const options = [];
  const manager = new RunManager(store, {
    factories: {
      openhands: ({ emit }) => ({
        async start(input) {
          options.push(input);
          emit("session", { providerSessionId: "conversation-existing" });
        },
        async close() {},
      }),
    },
  });
  t.after(() => manager.close());
  const id = manager.driverRunId("fixture");
  store.put("runs", {
    id,
    logicalConversationId: id,
    taskId: "conversation:" + id,
    projectId: "fixture",
    provider: "openhands",
    providerSessionId: "conversation-existing",
    driver: true,
    driverRole: "project",
    mode: "ask",
    state: "completed",
    context: {},
    createdAt: "2026-11-10T00:00:00.000Z",
  });

  const opened = await manager.openDriver({ projectId: "fixture" });
  assert.equal(opened.created, false);
  assert.equal(options.length, 1);
  assert.equal(options[0].resumeId, "conversation-existing");
  assert.equal(options[0].prompt, undefined);
});

test("child launches require the same-project top-level OpenHands Driver", async (t) => {
  const { store, root } = fixture(t);
  configureProject(store, root);
  configureProject(store, root + "/second", "second");
  let sequence = 0;
  const starts = [];
  const manager = new RunManager(store, {
    factories: {
      openhands: ({ emit }) => ({
        async start(options) {
          starts.push(options);
          emit("session", {
            providerSessionId: `conversation-${++sequence}`,
          });
        },
        async close() {},
      }),
      codex: ({ emit }) => ({
        async start(options) {
          starts.push(options);
          emit("session", { providerSessionId: "codex-session" });
        },
        async close() {},
      }),
    },
  });
  t.after(() => manager.close());
  const driver = await manager.openDriver({
    projectId: "fixture",
    provider: "openhands",
  });
  const child = await manager.start({
    id: "run-driver-child",
    mode: "ask",
    prompt: "Review the selected task.",
    provider: "openhands",
    projectId: "fixture",
    parentRunId: driver.run.id,
  });
  assert.equal(child.parentRunId, driver.run.id);
  assert.equal(child.parentProviderSessionId, driver.run.providerSessionId);
  assert.equal(starts[1].parentConversationId, driver.run.providerSessionId);
  assert.equal(child.worktree, root);

  await assert.rejects(
    manager.start({
      id: "run-cross-project-child",
      mode: "ask",
      prompt: "Wrong project.",
      provider: "openhands",
      projectId: "second",
      parentRunId: driver.run.id,
    }),
    /same project/,
  );
  const logicalChild = await manager.start({
    id: "run-cross-provider-child",
    mode: "ask",
    prompt: "Review with another provider.",
    provider: "codex",
    projectId: "fixture",
    parentRunId: driver.run.id,
  });
  assert.equal(logicalChild.parentRunId, driver.run.id);
  assert.equal(logicalChild.parentProviderSessionId, undefined);
  assert.equal(starts[2].parentConversationId, undefined);
});

test("changing Driver agent or model safely hands off and retains history", async (t) => {
  const { store, root } = fixture(t);
  configureProject(store, root);
  let sequence = 0;
  const starts = [],
    closed = [];
  const manager = new RunManager(store, {
    factories: {
      openhands: ({ emit }) => {
        const adapterId = ++sequence;
        return {
          async start(options) {
            starts.push(options);
            emit("session", {
              providerSessionId: `conversation-${adapterId}`,
            });
          },
          async close() {
            closed.push(adapterId);
          },
        };
      },
    },
  });
  t.after(() => manager.close());
  const ops = new Operations(store, { manager });

  const first = await manager.openDriver({
    projectId: "fixture",
    agentProfile: "agent-one",
    model: "model-one",
  });
  const child = await manager.start({
    id: "run-driver-history-child",
    mode: "ask",
    prompt: "Keep this child unchanged.",
    provider: "openhands",
    projectId: "fixture",
    parentRunId: first.run.id,
    model: "child-model",
  });
  const replacement = await manager.openDriver({
    projectId: "fixture",
    agentProfile: "agent-two",
    model: "model-two",
  });

  assert.equal(replacement.created, true);
  assert.equal(replacement.handedOff, true);
  assert.equal(replacement.previousRunId, first.run.id);
  assert.notEqual(replacement.run.id, first.run.id);
  assert.equal(replacement.run.driverActive, true);
  assert.equal(replacement.run.driverGeneration, 2);
  assert.equal(replacement.run.driverPredecessorId, first.run.id);
  assert.equal(replacement.run.agentProfile, "agent-two");
  assert.equal(replacement.run.requestedModel, "model-two");
  const retired = store.get("runs", first.run.id);
  assert.equal(retired.driverActive, false);
  assert.equal(retired.driverSuccessorId, replacement.run.id);
  assert.equal(retired.providerSessionId, "conversation-1");
  assert.ok(retired.driverRetiredAt);
  assert.equal(
    store.getMeta("runArchive:" + retired.id),
    retired.driverRetiredAt,
  );
  assert.deepEqual(closed, [1]);
  assert.equal(store.get("runs", child.id).parentRunId, first.run.id);
  assert.equal(store.get("runs", child.id).model, "child-model");
  assert.equal(manager.listDrivers().projects[0].run.id, replacement.run.id);
  assert.equal(
    (await ops.execute("driver.list")).projects[0].run.id,
    replacement.run.id,
  );
  await assert.rejects(
    manager.start({
      id: "run-retired-driver-child",
      mode: "ask",
      prompt: "Do not attach to retired Driver.",
      provider: "openhands",
      projectId: "fixture",
      parentRunId: first.run.id,
    }),
    /top-level OpenHands Driver/,
  );

  const current = store.get("runs", replacement.run.id);
  current.state = "running";
  store.put("runs", current);
  await assert.rejects(
    manager.openDriver({
      projectId: "fixture",
      agentProfile: "agent-three",
      model: "model-three",
    }),
    /Wait for the current Driver turn/,
  );
  assert.equal(starts.length, 3);
  assert.equal(manager.listDrivers().projects[0].run.id, replacement.run.id);
});

test("Driver bootstrap omits inventories and scoped context stays bounded", async (t) => {
  const { store, root } = fixture(t);
  configureProject(store, root);
  const starts = [];
  const manager = new RunManager(store, {
    factories: {
      openhands: ({ emit }) => ({
        async start(options) {
          starts.push(options);
          emit("session", { providerSessionId: "bounded-driver" });
        },
        async close() {},
      }),
    },
  });
  t.after(() => manager.close());
  const taskIds = Array.from({ length: 3000 }, (_, index) => `task-${index}`);

  const projectDriver = await manager.openDriver({
    projectId: "fixture",
    context: {
      revision: 42,
      view: "activity",
      projectId: "fixture",
      scoped: true,
      taskIds,
      filters: { status: "remaining" },
    },
  });
  assert.equal(projectDriver.run.context.taskIds, undefined);
  assert.ok(JSON.stringify(projectDriver.run.context).length < 1000);
  assert.equal(starts[0].prompt, undefined);
  assert.ok(starts[0].systemInstructions.length < 1000);
  assert.doesNotMatch(starts[0].systemInstructions, /task-2999/);

  const scoped = await manager.openDriver({
    projectId: "fixture",
    context: {
      revision: 43,
      view: "tasks",
      projectId: "fixture",
      scoped: true,
      selected: "task-2999",
      taskIds,
    },
  });
  assert.equal(scoped.created, false);
  assert.equal(scoped.run.context.taskIds.length, 12);
  assert.equal(scoped.run.context.taskIds[0], "task-2999");
  assert.deepEqual(scoped.run.context.contextTruncation.taskIds, {
    provided: 3000,
    retained: 12,
    truncated: true,
  });
  assert.ok(JSON.stringify(scoped.run.context).length < 1000);
  assert.equal(starts.length, 1);
});
