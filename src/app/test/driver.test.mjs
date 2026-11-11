import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { startAgentHost } from "../agent-host.mjs";
import {
  DRIVER_INSTRUCTION_VERSION,
  driverConversationTitle,
  openHandsDriverConversationId,
  RunManager,
} from "../manager.mjs";
import { Operations } from "../operations.mjs";
import { updateConversationSettings } from "../conversation-settings.mjs";
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

async function waitFor(check, timeout = 1000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw Error("Timed out waiting.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("Driver titles and persisted view context stay compact", () => {
  const title = driverConversationTitle({
    name: "  A project   with a deliberately long name ".repeat(12),
  });
  assert.match(title, /^Chat with Avoozl · A project with a deliberately/);
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
  assert.equal(first.run.driverInstructionVersion, DRIVER_INSTRUCTION_VERSION);
  assert.equal(first.run.capabilityMode, "driver");
  assert.equal(first.run.logicalConversationId, first.run.id);
  assert.equal(first.run.projectId, "fixture");
  assert.equal(first.run.providerSessionId, "driver-conversation");
  assert.equal(first.run.worktree, root);
  assert.equal(first.run.readOnly, true);
  assert.equal(first.run.state, "completed");
  assert.equal(starts.length, 1);
  assert.equal(starts[0].prompt, undefined);
  assert.match(starts[0].systemInstructions, /persistent Avoozl Driver/);
  assert.match(starts[0].systemInstructions, /installed Avoozl skill/);
  assert.match(
    starts[0].conversationId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(
    starts[0].conversationId,
    openHandsDriverConversationId(first.run.id),
  );

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

test("Driver creation retries the same idle OpenHands UUID after rejection", async (t) => {
  const { store, root } = fixture(t);
  configureProject(store, root);
  const starts = [];
  let attempt = 0;
  const manager = new RunManager(store, {
    factories: {
      openhands: ({ emit }) => ({
        async start(options) {
          starts.push(options);
          attempt += 1;
          if (attempt === 1)
            throw Error("OpenHands rejected the conversation.");
          emit("session", { providerSessionId: options.conversationId });
        },
        async close() {},
      }),
    },
  });
  t.after(() => manager.close());
  const ops = new Operations(store, { manager });

  await assert.rejects(
    ops.execute("driver.open", {
      projectId: "fixture",
      provider: "openhands",
    }),
    /rejected the conversation/,
  );
  const failed = manager.activeDriver("fixture");
  assert.equal(failed.state, "failed");
  assert.equal(failed.providerSessionId, undefined);

  const retried = await ops.execute("driver.open", {
    projectId: "fixture",
    provider: "openhands",
  });
  assert.equal(retried.created, false);
  assert.equal(retried.run.state, "completed");
  assert.equal(retried.run.providerSessionId, starts[0].conversationId);
  assert.equal(starts[1].conversationId, starts[0].conversationId);
  assert.equal(starts[0].prompt, undefined);
  assert.equal(starts[1].prompt, undefined);
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
    driverInstructionVersion: DRIVER_INSTRUCTION_VERSION,
    title: "Avoozl Driver · Fixture",
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
  assert.equal(options[0].title, "Chat with Avoozl · fixture");
  assert.equal(opened.run.title, "Chat with Avoozl · fixture");
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
    context: { conversationPurpose: "project-chat" },
  });
  assert.equal(child.parentRunId, driver.run.id);
  assert.equal(child.parentProviderSessionId, driver.run.providerSessionId);
  assert.equal(child.capabilityMode, "driver-chat");
  assert.equal(starts[1].parentConversationId, driver.run.providerSessionId);
  assert.match(starts[1].systemInstructions, /fresh user-facing Avoozl/);
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

test("task worktrees keep logical Driver ownership without an invalid OpenHands parent", async (t) => {
  const { store, root } = fixture(t);
  const { execFileSync } = await import("node:child_process");
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Avoozl test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "avoozl@example.test"], {
    cwd: root,
  });
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["commit", "-m", "Initialize"], { cwd: root });
  configureProject(store, root);
  store.read().tasks[0].projectId = "fixture";
  store.write(store.read(), "Bind task to project");
  const starts = [];
  let sequence = 0;
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
    },
  });
  t.after(() => manager.close());

  const driver = await manager.openDriver({ projectId: "fixture" });
  const child = await manager.start({
    id: "run-task-child",
    taskId: "sample-task",
    provider: "openhands",
    projectId: "fixture",
    parentRunId: driver.run.id,
  });

  assert.equal(child.parentRunId, driver.run.id);
  assert.equal(child.parentProviderSessionId, undefined);
  assert.notEqual(child.worktree, driver.run.worktree);
  assert.equal(starts[1].parentConversationId, undefined);
  assert.equal(
    starts[1].prompt,
    "Implement task sample-task: Implement fixture.\n\n" +
      "Load the full task and current run context with the run-scoped Avoozl tools before acting.",
  );
  assert.doesNotMatch(
    starts[1].prompt,
    /viewContext|activityHistory|documents/,
  );
  assert.match(starts[1].systemInstructions, /plans_get_task/);
  assert.match(starts[1].systemInstructions, /plans_run_context/);
  assert.doesNotMatch(
    starts[1].systemInstructions,
    /"viewContext"|"activityHistory"/,
  );
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

test("updating Driver instructions hands off to a fresh skilled conversation", async (t) => {
  const { store, root } = fixture(t);
  configureProject(store, root);
  const starts = [];
  const manager = new RunManager(store, {
    factories: {
      openhands: ({ emit }) => ({
        async start(options) {
          starts.push(options);
          emit("session", {
            providerSessionId: `driver-instructions-${starts.length}`,
          });
        },
        async close() {},
      }),
    },
  });
  t.after(() => manager.close());

  const first = await manager.openDriver({ projectId: "fixture" });
  const stale = store.get("runs", first.run.id);
  stale.driverInstructionVersion = DRIVER_INSTRUCTION_VERSION - 1;
  store.put("runs", stale);

  const replacement = await manager.openDriver({ projectId: "fixture" });
  assert.equal(replacement.handedOff, true);
  assert.equal(replacement.previousRunId, first.run.id);
  assert.equal(replacement.run.driverHandoffReason, "instruction-update");
  assert.equal(
    replacement.run.driverInstructionVersion,
    DRIVER_INSTRUCTION_VERSION,
  );
  assert.equal(store.get("runs", first.run.id).driverActive, false);
  assert.equal(starts.length, 2);
});

test("reported low context hands off Driver only after the active turn completes", async (t) => {
  const { store, root } = fixture(t);
  configureProject(store, root);
  updateConversationSettings(store, {
    routing: {
      enabled: true,
      fallback: { agentProfile: "baseline-agent" },
      rules: [
        {
          id: "low-driver-context",
          priority: 100,
          categories: ["chat.project"],
          contextRemainingAtMost: 20,
          agentProfile: "fresh-agent",
          model: "fresh-model",
        },
      ],
    },
  });
  let sequence = 0;
  const starts = [];
  const manager = new RunManager(store, {
    routingCatalog: async () => ({
      profiles: [
        { id: "baseline-agent", name: "Baseline" },
        { id: "fresh-agent", name: "Fresh" },
      ],
    }),
    factories: {
      openhands: ({ emit }) => ({
        async start(options) {
          starts.push(options);
          emit("session", {
            providerSessionId: `driver-context-${++sequence}`,
            model: options.model,
            agentProfileId: options.agentProfile,
          });
        },
        async close() {},
      }),
    },
  });
  t.after(() => manager.close());

  const first = await manager.openDriver({ projectId: "fixture" });
  manager.receive(first.run.id, "state", { state: "running" });
  manager.receive(first.run.id, "context", {
    source: "conversation-state",
    model: "baseline-model",
    contextWindow: 200000,
    perTurnToken: 180000,
    usedPercent: 90,
    remainingPercent: 10,
    coverage: "OpenHands-reported context capacity.",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(starts.length, 1);
  assert.equal(manager.activeDriver("fixture").id, first.run.id);

  manager.receive(first.run.id, "turn.completed", { state: "completed" });
  await waitFor(() => manager.activeDriver("fixture")?.id !== first.run.id);

  const replacement = manager.activeDriver("fixture"),
    retired = store.get("runs", first.run.id);
  assert.equal(starts.length, 2);
  assert.equal(replacement.driverGeneration, 2);
  assert.equal(replacement.driverPredecessorId, first.run.id);
  assert.equal(replacement.driverHandoffReason, "context-threshold");
  assert.equal(replacement.agentProfile, "fresh-agent");
  assert.equal(replacement.model, "fresh-model");
  assert.equal(replacement.routingDecision.ruleId, "low-driver-context");
  assert.equal(retired.driverActive, false);
  assert.equal(retired.contextRemainingPercent, 10);
  assert.equal(retired.contextTelemetry.contextWindow, 200000);
  assert.equal(retired.automaticHandoffRuleId, "low-driver-context");

  configureProject(store, root, "pinned");
  const pinned = await manager.openDriver({
    projectId: "pinned",
    agentProfile: "baseline-agent",
  });
  manager.receive(pinned.run.id, "state", { state: "running" });
  manager.receive(pinned.run.id, "context", {
    source: "conversation-state",
    contextWindow: 200000,
    perTurnToken: 190000,
    usedPercent: 95,
    remainingPercent: 5,
  });
  manager.receive(pinned.run.id, "turn.completed", { state: "completed" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(manager.activeDriver("pinned").id, pinned.run.id);
  assert.ok(
    store
      .events({ runId: pinned.run.id })
      .some(
        (event) =>
          event.kind === "driver.handoff.skipped" &&
          event.reason === "explicit-override",
      ),
  );
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
