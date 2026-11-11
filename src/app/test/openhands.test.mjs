import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  OpenHandsAdapter,
  openHandsContextWindowReport,
  openHandsConversationModel,
  openHandsSettings,
  openHandsTokenUsageReport,
  openHandsUsageReport,
} from "../providers/openhands.mjs";
import { RunManager } from "../manager.mjs";
import { handleMcp } from "../mcp.mjs";
import {
  authorizeRunCapability,
  mintRunCapability,
} from "../run-capabilities.mjs";
import {
  authorizeOpenHandsSurface,
  mintOpenHandsSurface,
  openHandsSurfaceRouteAllowed,
  openHandsSurfaceSocketRoute,
} from "../openhands-surface.mjs";
import { Operations } from "../operations.mjs";
import { metrics } from "../telemetry.mjs";
import { fixture } from "./fixtures.mjs";

const usageFixture = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/openhands-usage.json", import.meta.url),
    "utf8",
  ),
);

function fakeOpenHands({
  activeProfile = true,
  children = [],
  rootInfo = {},
  events,
} = {}) {
  const byId = new Map(children.map((child) => [child.id, child]));
  const calls = [],
    client = {
      async createConversation(payload) {
        calls.push(["create", payload]);
        return { id: "conversation-test" };
      },
      async getConversation(id) {
        calls.push(["get", id]);
        return (
          byId.get(id) || {
            id,
            execution_status: "paused",
            ...rootInfo,
            sub_conversation_ids:
              rootInfo.sub_conversation_ids ||
              children
                .filter(
                  (child) =>
                    child.parent_conversation_id === "conversation-test",
                )
                .map((child) => child.id),
          }
        );
      },
      async getConversations(ids) {
        calls.push(["get-many", ids]);
        return ids.map((id) => byId.get(id) || null);
      },
      async updateSecrets(id, secrets) {
        calls.push(["secrets", id, secrets]);
      },
      async updateConversation(id, update) {
        calls.push(["update", id, update]);
        return { id, ...update };
      },
      async searchEvents() {
        return {
          items: events || [
            {
              id: "event-message",
              kind: "MessageEvent",
              source: "agent",
              llm_message: {
                content: [{ type: "text", text: "Recovered output" }],
              },
            },
            {
              id: "event-finished",
              kind: "ConversationStateUpdateEvent",
              source: "environment",
              key: "execution_status",
              value: "finished",
            },
          ],
        };
      },
      async setConfirmationPolicy(id, policy) {
        calls.push(["policy", id, policy]);
      },
      async sendEvent(id, event, options) {
        calls.push(["send", id, event, options]);
      },
      async interruptConversation(id) {
        calls.push(["interrupt", id]);
        return { success: true };
      },
      async respondToConfirmation(id, response) {
        calls.push(["confirm", id, response]);
      },
    },
    socket = {
      start() {
        calls.push(["socket.start"]);
      },
      stop() {
        calls.push(["socket.stop"]);
      },
    },
    http = {
      async get(url) {
        calls.push(["http.get", url]);
        if (url === "/api/agent-profiles")
          return {
            data: {
              profiles: activeProfile
                ? [
                    {
                      id: "profile-test",
                      name: "avoozl-claude-code",
                      agent_kind: "acp",
                    },
                  ]
                : [],
              active_agent_profile_id: activeProfile ? "profile-test" : null,
            },
          };
        return { data: { version: "1.61.0" } };
      },
      async post(url, body) {
        calls.push(["http.post", url, body]);
      },
      close() {},
    };
  return { calls, client, socket, http };
}

test("OpenHands normalizes cumulative conversation metrics without inventing missing fields", () => {
  const report = openHandsUsageReport(usageFixture.parent);
  assert.equal(
    openHandsConversationModel(usageFixture.parent),
    "anthropic/claude-sonnet-4-5",
  );
  assert.equal(report.provider, "openhands");
  assert.equal(report.model, "anthropic/claude-sonnet-4-5");
  assert.deepEqual(report.usage, [
    {
      model: "anthropic/claude-sonnet-4-5",
      promptTokens: 1200,
      completionTokens: 300,
      cacheReadTokens: 700,
      cacheWriteTokens: 80,
      reasoningTokens: 50,
      costUsd: 0.42,
      usageIds: ["avoozl"],
    },
  ]);
  assert.equal(openHandsUsageReport(usageFixture.unreported), null);
  assert.deepEqual(openHandsContextWindowReport(usageFixture.parent), {
    provider: "openhands",
    providerSessionId: "conversation-usage-parent",
    source: "conversation-stats",
    usageId: "avoozl",
    model: "anthropic/claude-sonnet-4-5",
    contextWindow: 200000,
    perTurnToken: 150000,
    usedPercent: 75,
    remainingPercent: 25,
    coverage:
      "OpenHands-reported per-turn tokens divided by its reported model context window. This is context capacity, not cumulative spend or plan allowance.",
  });
  assert.equal(openHandsContextWindowReport(usageFixture.unreported), null);
});

test("OpenHands token events are an exact fallback with explicit limitations", () => {
  const report = openHandsTokenUsageReport(
    {
      promptTokens: 5,
      completionTokens: 3,
      events: 2,
    },
    {
      providerSessionId: "conversation-token-fallback",
      model: "acp/default",
    },
  );
  assert.equal(report.usage[0].promptTokens, 5);
  assert.equal(report.usage[0].completionTokens, 3);
  assert.equal(report.usage[0].cacheReadTokens, null);
  assert.match(report.coverage, /does not report cache usage/);
});

test("OpenHands adapter prefers cumulative metrics and falls back to TokenEvent counts", async () => {
  const canonical = fakeOpenHands({
      rootInfo: usageFixture.parent,
      events: usageFixture.events,
    }),
    canonicalEvents = [],
    canonicalAdapter = new OpenHandsAdapter({
      emit: (kind, body) => canonicalEvents.push({ kind, ...body }),
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        apiKey: "server-key",
        pluginSource: "/application/openhands-plugin",
      },
      clientFactory: () => canonical.client,
      httpFactory: () => canonical.http,
      socketFactory: () => canonical.socket,
    });
  await canonicalAdapter.start({
    cwd: "/worktrees/usage",
    mode: "implement",
    approvalMode: "manual",
  });
  const canonicalUsage = canonicalEvents.filter(
    (event) => event.kind === "usage",
  );
  assert.ok(canonicalUsage.length);
  assert.ok(canonicalUsage.every((event) => event.source !== "token-events"));
  assert.equal(canonicalUsage.at(-1).model, "anthropic/claude-sonnet-4-5");
  const context = canonicalEvents.filter((event) => event.kind === "context");
  assert.ok(context.length);
  assert.equal(context.at(-1).remainingPercent, 25);
  await canonicalAdapter.close();

  const fallback = fakeOpenHands({
      rootInfo: usageFixture.unreported,
      events: usageFixture.events,
    }),
    fallbackEvents = [],
    fallbackAdapter = new OpenHandsAdapter({
      emit: (kind, body) => fallbackEvents.push({ kind, ...body }),
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        apiKey: "server-key",
        pluginSource: "/application/openhands-plugin",
      },
      clientFactory: () => fallback.client,
      httpFactory: () => fallback.http,
      socketFactory: () => fallback.socket,
    });
  await fallbackAdapter.start({
    cwd: "/worktrees/usage",
    mode: "implement",
    model: "acp/default",
    approvalMode: "manual",
  });
  const fallbackUsage = fallbackEvents.find((event) => event.kind === "usage");
  assert.equal(fallbackUsage.source, "token-events");
  assert.equal(fallbackUsage.usage[0].promptTokens, 4);
  assert.equal(fallbackUsage.usage[0].completionTokens, 3);
  await fallbackAdapter.close();
});

test("OpenHands discovers the permission-restricted Agent Canvas key", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-openhands-key-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const keyDir = path.join(home, ".openhands", "agent-canvas"),
    keyFile = path.join(keyDir, "api-key.txt");
  fs.mkdirSync(keyDir, { recursive: true });
  fs.writeFileSync(keyFile, "local-canvas-key\n", { mode: 0o600 });

  const settings = openHandsSettings({ env: {}, home, platform: "darwin" });

  assert.equal(settings.host, "http://127.0.0.1:38100");
  assert.equal(settings.apiKey, "local-canvas-key");
});

test("explicit OpenHands credentials win over local discovery", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-openhands-key-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const keyDir = path.join(home, ".openhands", "agent-canvas");
  fs.mkdirSync(keyDir, { recursive: true });
  fs.writeFileSync(path.join(keyDir, "api-key.txt"), "local-canvas-key\n", {
    mode: 0o600,
  });

  const settings = openHandsSettings({
    env: {
      AVOOZL_OPENHANDS_URL: "http://localhost:38100/",
      AVOOZL_OPENHANDS_API_KEY: "explicit-key",
    },
    home,
    platform: "darwin",
  });

  assert.equal(settings.host, "http://localhost:38100");
  assert.equal(settings.apiKey, "explicit-key");
});

test("OpenHands refuses an exposed local key file", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-openhands-key-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const keyDir = path.join(home, ".openhands", "agent-canvas"),
    keyFile = path.join(keyDir, "api-key.txt");
  fs.mkdirSync(keyDir, { recursive: true });
  fs.writeFileSync(keyFile, "exposed-key\n", { mode: 0o644 });

  assert.throws(
    () => openHandsSettings({ env: {}, home, platform: "darwin" }),
    /accessible to other users/,
  );
});

test("OpenHands binds one Avoozl worktree, plugin and run-scoped MCP secret", async () => {
  const fake = fakeOpenHands(),
    events = [],
    adapter = new OpenHandsAdapter({
      emit: (kind, body) => events.push({ kind, ...body }),
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        apiKey: "server-key",
        pluginSource: "/application/openhands-plugin",
      },
      clientFactory: () => fake.client,
      httpFactory: () => fake.http,
      socketFactory: () => fake.socket,
    });
  await adapter.start({
    cwd: "/worktrees/run-test",
    mode: "implement",
    approvalMode: "manual",
    mcpUrl: "http://127.0.0.1:9428/mcp?run=run-test",
    mcpToken: "avoozl_run_secret",
    prompt: "Implement the task.",
  });
  const create = fake.calls.find(([kind]) => kind === "create")[1];
  assert.deepEqual(create.workspace, {
    type: "local",
    working_dir: "/worktrees/run-test",
  });
  assert.equal(create.plugins[0].source, "/application/openhands-plugin");
  assert.equal(create.agent_profile_id, "profile-test");
  assert.equal(create.agent, undefined);
  assert.equal(create.worktree, false);
  assert.equal(
    create.secrets.AVOOZL_MCP_URL.value,
    "http://127.0.0.1:9428/mcp?run=run-test",
  );
  assert.equal(create.secrets.AVOOZL_MCP_TOKEN.value, "avoozl_run_secret");
  assert.ok(
    events.some(
      (event) =>
        event.kind === "session" &&
        event.providerSessionId === "conversation-test",
    ),
  );
  assert.ok(
    events.some(
      (event) => event.kind === "message" && event.text === "Recovered output",
    ),
  );
  assert.ok(
    events.some(
      (event) => event.kind === "turn.completed" && event.state === "completed",
    ),
  );
  assert.ok(fake.calls.some(([kind]) => kind === "send"));
  await adapter.setModel("next-model");
  assert.ok(
    fake.calls.some(
      ([kind, pathname, body]) =>
        kind === "http.post" &&
        pathname === "/api/conversations/conversation-test/switch_acp_model" &&
        body.model === "next-model",
    ),
  );
  await adapter.close();
});

test("OpenHands lifecycle reconciliation completes and archives durable runs without losing attachment", async (t) => {
  const { store } = fixture(t),
    rootInfo = {
      execution_status: "running",
      updated_at: "2026-11-11T00:00:00.000Z",
    },
    fake = fakeOpenHands({ rootInfo, events: [] }),
    manager = new RunManager(store, { recover: false }),
    run = store.put("runs", {
      id: "run-lifecycle",
      taskId: "sample-task",
      provider: "openhands",
      providerSessionId: "conversation-test",
      mode: "implement",
      state: "running",
      createdAt: "2026-11-11T00:00:00.000Z",
    }),
    adapter = new OpenHandsAdapter({
      emit: (kind, body) => manager.receive(run.id, kind, body),
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        apiKey: "server-key",
        pluginSource: "/application/openhands-plugin",
        statePollMs: 0,
      },
      clientFactory: () => fake.client,
      httpFactory: () => fake.http,
      socketFactory: () => fake.socket,
    });
  t.after(() => manager.close());
  t.after(() => adapter.close());

  await adapter.start({
    cwd: "/worktrees/run-lifecycle",
    resumeId: "conversation-test",
    mode: "implement",
    approvalMode: "manual",
  });
  assert.equal(store.get("runs", run.id).state, "running");

  rootInfo.execution_status = "finished";
  rootInfo.updated_at = "2026-11-11T00:01:00.000Z";
  await adapter.refreshState();
  await adapter.refreshState();

  const completed = store.get("runs", run.id);
  assert.equal(completed.state, "completed");
  assert.equal(completed.providerSessionId, "conversation-test");
  assert.ok(store.getMeta("runArchive:" + run.id));
  assert.equal(
    store
      .events({ runId: run.id })
      .filter((event) => event.kind === "turn.completed").length,
    1,
  );
});

test("authoritative OpenHands status repairs a stale durable run after replay deduplication", async (t) => {
  const { store } = fixture(t),
    fake = fakeOpenHands({
      rootInfo: {
        execution_status: "finished",
        updated_at: "2026-11-11T00:02:00.000Z",
      },
      events: [
        {
          id: "already-recorded-finish",
          kind: "ConversationStateUpdateEvent",
          key: "execution_status",
          value: "finished",
        },
      ],
    }),
    manager = new RunManager(store, { recover: false }),
    run = store.put("runs", {
      id: "run-stale-lifecycle",
      taskId: "sample-task",
      provider: "openhands",
      providerSessionId: "conversation-test",
      mode: "implement",
      state: "running",
      createdAt: "2026-11-11T00:00:00.000Z",
    }),
    adapter = new OpenHandsAdapter({
      emit: (kind, body) => manager.receive(run.id, kind, body),
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        apiKey: "server-key",
        pluginSource: "/application/openhands-plugin",
        statePollMs: 0,
      },
      clientFactory: () => fake.client,
      httpFactory: () => fake.http,
      socketFactory: () => fake.socket,
    });
  store.db
    .prepare(
      "INSERT INTO provider_events(run_id,provider_event_id,at) VALUES (?,?,?)",
    )
    .run(run.id, "already-recorded-finish", "2026-11-11T00:01:00.000Z");
  t.after(() => manager.close());
  t.after(() => adapter.close());

  await adapter.start({
    cwd: "/worktrees/run-stale-lifecycle",
    resumeId: "conversation-test",
    mode: "implement",
    approvalMode: "manual",
  });

  assert.equal(store.get("runs", run.id).state, "completed");
  assert.equal(
    store.get("runs", run.id).providerSessionId,
    "conversation-test",
  );
  assert.ok(store.getMeta("runArchive:" + run.id));
});

test("OpenHands marks a missing active conversation unavailable without deleting its attachment", async (t) => {
  const { store } = fixture(t),
    rootInfo = { execution_status: "running" },
    fake = fakeOpenHands({ rootInfo, events: [] }),
    manager = new RunManager(store, { recover: false }),
    run = store.put("runs", {
      id: "run-missing-conversation",
      taskId: "sample-task",
      provider: "openhands",
      providerSessionId: "conversation-test",
      mode: "implement",
      state: "running",
      createdAt: "2026-11-11T00:00:00.000Z",
    }),
    adapter = new OpenHandsAdapter({
      emit: (kind, body) => manager.receive(run.id, kind, body),
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        apiKey: "server-key",
        pluginSource: "/application/openhands-plugin",
        statePollMs: 0,
      },
      clientFactory: () => fake.client,
      httpFactory: () => fake.http,
      socketFactory: () => fake.socket,
    });
  t.after(() => manager.close());
  t.after(() => adapter.close());

  await adapter.start({
    cwd: "/worktrees/run-lifecycle",
    resumeId: "conversation-test",
    mode: "implement",
    approvalMode: "manual",
  });
  fake.client.getConversation = async () => {
    const error = Error("Conversation not found");
    error.status = 404;
    throw error;
  };
  await adapter.refreshState();

  const unavailable = store.get("runs", run.id);
  assert.equal(unavailable.state, "disconnected");
  assert.equal(unavailable.providerAvailability, "not-found");
  assert.equal(unavailable.providerSessionId, "conversation-test");
  assert.match(unavailable.error, /preserved/);
  assert.ok(store.get("runs", run.id));
});

test("OpenHands creates an idle parented conversation with invisible instructions", async () => {
  const fake = fakeOpenHands(),
    adapter = new OpenHandsAdapter({
      emit: () => {},
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        apiKey: "server-key",
        pluginSource: "/application/openhands-plugin",
      },
      clientFactory: () => fake.client,
      httpFactory: () => fake.http,
      socketFactory: () => fake.socket,
    });
  await adapter.start({
    cwd: "/worktrees/run-test",
    mode: "ask",
    title: "Avoozl Driver",
    conversationId: "b3d8cf56-ff1f-5d61-9d7f-b108e7bf1d90",
    parentConversationId: "conversation-parent",
    systemInstructions: "Remain the project Driver.",
    approvalMode: "manual",
  });

  const create = fake.calls.find(([kind]) => kind === "create")[1];
  assert.equal(create.conversation_id, "b3d8cf56-ff1f-5d61-9d7f-b108e7bf1d90");
  assert.equal(create.parent_conversation_id, "conversation-parent");
  assert.equal(create.worktree, false);
  assert.deepEqual(create.agent_launch_additions, {
    system_message_suffix_append: "Remain the project Driver.",
  });
  assert.equal(
    fake.calls.some(([kind]) => kind === "send"),
    false,
  );
  await adapter.close();
});

test("OpenHands applies Driver model overrides through the selected agent kind", async () => {
  const acp = fakeOpenHands(),
    acpAdapter = new OpenHandsAdapter({
      emit: () => {},
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        apiKey: "server-key",
        pluginSource: "/application/openhands-plugin",
      },
      clientFactory: () => acp.client,
      httpFactory: () => acp.http,
      socketFactory: () => acp.socket,
    });
  await acpAdapter.start({
    cwd: "/worktrees/run-test",
    mode: "ask",
    agentProfile: "profile-test",
    model: "opus",
    approvalMode: "manual",
  });
  assert.ok(
    acp.calls.some(
      ([kind, pathname, body]) =>
        kind === "http.post" &&
        pathname === "/api/conversations/conversation-test/switch_acp_model" &&
        body.model === "opus",
    ),
  );
  await acpAdapter.close();

  const native = fakeOpenHands(),
    nativeAdapter = new OpenHandsAdapter({
      emit: () => {},
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        apiKey: "server-key",
        pluginSource: "/application/openhands-plugin",
      },
      clientFactory: () => native.client,
      httpFactory: () => ({
        ...native.http,
        async get(url) {
          if (url === "/api/agent-profiles")
            return {
              data: {
                profiles: [
                  {
                    id: "native-profile",
                    name: "default",
                    agent_kind: "openhands",
                  },
                ],
                active_agent_profile_id: "native-profile",
              },
            };
          return native.http.get(url);
        },
      }),
      socketFactory: () => native.socket,
    });
  await nativeAdapter.start({
    cwd: "/worktrees/run-test",
    mode: "ask",
    agentProfile: "native-profile",
    model: "gpt-6.1-sol",
    systemInstructions: "Remain the project Driver.",
    approvalMode: "manual",
  });
  const create = native.calls.find(([kind]) => kind === "create")[1];
  assert.deepEqual(create.agent_launch_additions, {
    llm_profile_ref: "gpt-6.1-sol",
    system_message_suffix_append: "Remain the project Driver.",
  });
  await nativeAdapter.close();
});

test("OpenHands reports its persisted child-conversation tree", async () => {
  const fake = fakeOpenHands({
      children: [
        {
          id: "conversation-child",
          parent_conversation_id: "conversation-test",
          execution_status: "running",
          title: "Inspect the parser",
          workspace: { working_dir: "/worktrees/child" },
          selected_branch: "avoozl/child",
          sub_conversation_ids: ["conversation-grandchild"],
        },
        {
          id: "conversation-grandchild",
          parent_conversation_id: "conversation-child",
          execution_status: "finished",
          title: "Compare fixtures",
          workspace: { working_dir: "/worktrees/grandchild" },
          sub_conversation_ids: [],
        },
      ],
    }),
    events = [],
    adapter = new OpenHandsAdapter({
      emit: (kind, body) => events.push({ kind, ...body }),
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        apiKey: "server-key",
        pluginSource: "/application/openhands-plugin",
      },
      clientFactory: () => fake.client,
      httpFactory: () => fake.http,
      socketFactory: () => fake.socket,
    });
  await adapter.start({
    cwd: "/worktrees/run-test",
    mode: "implement",
    approvalMode: "manual",
    prompt: "Implement the task.",
  });

  const children = events.find((event) => event.kind === "children");
  assert.equal(adapter.capabilities.subagents, true);
  assert.equal(adapter.capabilities.subagentMode, "child-conversations");
  assert.deepEqual(
    children.children.map((child) => ({
      id: child.providerSessionId,
      parent: child.parentProviderSessionId,
      state: child.state,
      worktree: child.worktree,
    })),
    [
      {
        id: "conversation-child",
        parent: "conversation-test",
        state: "running",
        worktree: "/worktrees/child",
      },
      {
        id: "conversation-grandchild",
        parent: "conversation-child",
        state: "completed",
        worktree: "/worktrees/grandchild",
      },
    ],
  );
  await adapter.close();
});

test("OpenHands children become durable attachable runs without changing acceptance", async (t) => {
  const { store } = fixture(t),
    parent = store.put("runs", {
      id: "run-parent",
      taskId: "sample-task",
      projectId: "fixture",
      provider: "openhands",
      providerSessionId: "conversation-parent",
      mode: "implement",
      state: "running",
      title: "Parent implementation",
      branch: "avoozl/parent",
      worktree: "/worktrees/parent",
      createdAt: "2026-11-10T20:00:00.000Z",
    }),
    manager = new RunManager(store, { recover: false });
  t.after(() => manager.close());

  manager.receive(parent.id, "children", {
    children: [
      {
        providerSessionId: "conversation-child",
        parentProviderSessionId: "conversation-parent",
        title: "Inspect the parser",
        state: "running",
        worktree: "/worktrees/child",
        branch: "avoozl/child",
        model: openHandsConversationModel(usageFixture.child),
        usage: openHandsUsageReport(usageFixture.child, {
          providerSessionId: "conversation-child",
          source: "child-conversation-stats",
        }),
      },
      {
        providerSessionId: "conversation-grandchild",
        parentProviderSessionId: "conversation-child",
        title: "Compare fixtures",
        state: "completed",
        worktree: "/worktrees/grandchild",
      },
    ],
  });

  const runs = store.list("runs"),
    child = runs.find((run) => run.providerSessionId === "conversation-child"),
    grandchild = runs.find(
      (run) => run.providerSessionId === "conversation-grandchild",
    ),
    detail = new Operations(store, { manager }).detail("sample-task");
  assert.equal(child.parentRunId, parent.id);
  assert.equal(child.taskId, parent.taskId);
  assert.equal(child.projectId, parent.projectId);
  assert.equal(child.worktree, "/worktrees/child");
  assert.equal(child.model, "codex/default");
  assert.equal(child.actualModel, "openai/gpt-6.1-sol");
  assert.equal(grandchild.parentRunId, child.id);
  assert.ok(store.getMeta("runArchive:" + grandchild.id));
  assert.ok(detail.runs.some((run) => run.id === child.id));
  assert.ok(detail.runs.some((run) => run.id === grandchild.id));
  assert.equal(store.read().tasks[0].status, "planned");
  assert.equal(store.read().tasks[0].integration, undefined);
  const childUsage = metrics(store, {
    runId: child.id,
    groupBy: "model",
  });
  assert.equal(childUsage.samples, 1);
  assert.equal(childUsage.groups[0].key, "openai/gpt-6.1-sol");
  assert.equal(childUsage.groups[0].totalTokens, 625);
  await assert.rejects(
    manager.send({
      id: child.id,
      text: "Do something else.",
      submissionId: "child-send",
    }),
    /Open this child conversation in OpenHands/,
  );
});

test("OpenHands retains direct model launch as a compatibility fallback", async () => {
  const fake = fakeOpenHands({ activeProfile: false }),
    adapter = new OpenHandsAdapter({
      emit: () => {},
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        model: "test-model",
        llmApiKey: "model-key",
        pluginSource: "/application/openhands-plugin",
      },
      clientFactory: () => fake.client,
      httpFactory: () => fake.http,
      socketFactory: () => fake.socket,
    });
  await adapter.start({
    cwd: "/worktrees/run-test",
    mode: "implement",
    title: "Fix the editor toolbar",
    approvalMode: "manual",
    prompt: "Implement the task.",
  });
  const create = fake.calls.find(([kind]) => kind === "create")[1];
  assert.equal(create.autotitle, false);
  assert.ok(
    fake.calls.some(
      ([kind, id, update]) =>
        kind === "update" &&
        id === "conversation-test" &&
        update.title === "Fix the editor toolbar",
    ),
  );
  assert.deepEqual(
    create.agent.tools.map((tool) => tool.name),
    ["terminal", "file_editor", "browser_tool_set"],
  );
  assert.equal(create.agent_profile_id, undefined);
  await adapter.close();
});

test("OpenHands reattaches to a recorded conversation and rotates its MCP secret", async () => {
  const fake = fakeOpenHands(),
    adapter = new OpenHandsAdapter({
      emit: () => {},
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        model: "test-model",
        pluginSource: "/application/openhands-plugin",
      },
      clientFactory: () => fake.client,
      httpFactory: () => fake.http,
      socketFactory: () => fake.socket,
    });
  await adapter.start({
    cwd: "/worktrees/run-test",
    resumeId: "conversation-existing",
    title: "Fix the existing conversation title",
    approvalMode: "automatic",
    mcpUrl: "http://127.0.0.1:9428/mcp?run=run-test",
    mcpToken: "avoozl_run_rotated",
  });
  assert.ok(
    fake.calls.some(
      ([kind, id, request]) =>
        kind === "secrets" &&
        id === "conversation-existing" &&
        request.secrets.AVOOZL_MCP_TOKEN.value === "avoozl_run_rotated",
    ),
  );
  assert.ok(
    fake.calls.some(
      ([kind, id, update]) =>
        kind === "update" &&
        id === "conversation-existing" &&
        update.title === "Fix the existing conversation title",
    ),
  );
  await adapter.close();
});

test("run capabilities fail closed and cannot be widened by a tool call", async (t) => {
  const { store } = fixture(t),
    run = store.put("runs", {
      id: "run-capability",
      taskId: "sample-task",
      provider: "openhands",
      mode: "implement",
      state: "running",
    }),
    { token } = mintRunCapability(store, run),
    ops = new Operations(store);
  assert.throws(
    () => authorizeRunCapability(store, run.id, "avoozl_run_forged"),
    /refused/,
  );
  const list = await handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ops,
    { runId: run.id, runCapability: token },
  );
  const names = list.body.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("plans_get_task"));
  assert.ok(names.includes("plans_propose_work"));
  assert.ok(!names.includes("plans_approve_plan"));
  assert.ok(!names.includes("plans_capture"));
  const denied = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "plans_approve_plan",
        arguments: { input: { id: "anything" } },
      },
    },
    ops,
    { runId: run.id, runCapability: token },
  );
  assert.equal(denied.body.result.isError, true);
  assert.match(denied.body.result.content[0].text, /does not authorize/);
});

test("new-task conversations can record requests but cannot authorize them", async (t) => {
  const { store } = fixture(t),
    run = store.put("runs", {
      id: "run-new-task",
      taskId: "conversation:run-new-task",
      provider: "openhands",
      mode: "ask",
      capabilityMode: "new-task",
      state: "running",
    }),
    { token } = mintRunCapability(store, run),
    ops = new Operations(store);
  const list = await handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ops,
    { runId: run.id, runCapability: token },
  );
  const names = list.body.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("plans_capture"));
  assert.ok(names.includes("plans_propose_work"));
  assert.ok(!names.includes("plans_approve_plan"));
  assert.ok(!names.includes("plans_start_run"));
  assert.ok(!names.includes("plans_accept_task"));
});

test("Driver can create tracked child work without gaining acceptance authority", async (t) => {
  const { store } = fixture(t),
    run = store.put("runs", {
      id: "run-driver",
      taskId: "conversation:run-driver",
      provider: "openhands",
      mode: "ask",
      capabilityMode: "driver",
      state: "completed",
    }),
    { token } = mintRunCapability(store, run),
    ops = new Operations(store);
  const list = await handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ops,
    { runId: run.id, runCapability: token },
  );
  const names = list.body.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("plans_capture"));
  assert.ok(names.includes("plans_start_run"));
  assert.ok(names.includes("plans_propose_work"));
  assert.ok(!names.includes("plans_approve_plan"));
  assert.ok(!names.includes("plans_integrate"));
  assert.ok(!names.includes("plans_accept_task"));
});

test("fresh Driver chats can create work without gaining acceptance authority", async (t) => {
  const { store } = fixture(t),
    run = store.put("runs", {
      id: "run-driver-chat",
      taskId: "conversation:run-driver-chat",
      provider: "openhands",
      mode: "ask",
      capabilityMode: "driver-chat",
      state: "completed",
    }),
    { token } = mintRunCapability(store, run),
    ops = new Operations(store);
  const list = await handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ops,
    { runId: run.id, runCapability: token },
  );
  const names = list.body.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("plans_capture"));
  assert.ok(names.includes("plans_start_run"));
  assert.ok(names.includes("plans_propose_work"));
  assert.ok(!names.includes("plans_approve_plan"));
  assert.ok(!names.includes("plans_integrate"));
  assert.ok(!names.includes("plans_accept_task"));
});

test("legacy Driver records receive Driver capabilities when reconnected", async (t) => {
  const { store } = fixture(t),
    run = store.put("runs", {
      id: "run-legacy-driver",
      taskId: "conversation:run-legacy-driver",
      provider: "openhands",
      driver: true,
      driverRole: "project",
      mode: "ask",
      state: "completed",
    }),
    { token, capability } = mintRunCapability(store, run),
    ops = new Operations(store);
  assert.equal(capability.mode, "driver");
  const list = await handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ops,
    { runId: run.id, runCapability: token },
  );
  const names = list.body.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("plans_capture"));
  assert.ok(names.includes("plans_propose_work"));
  assert.ok(!names.includes("plans_approve_plan"));
  assert.ok(!names.includes("plans_integrate"));
  assert.ok(!names.includes("plans_accept_task"));
});

test("OpenHands surface capabilities bind one run and one conversation", (t) => {
  const { store } = fixture(t);
  store.put("runs", {
    id: "run-surface",
    taskId: "sample-task",
    provider: "openhands",
    providerSessionId: "conversation-one",
    mode: "implement",
    state: "completed",
  });
  const surface = mintOpenHandsSurface(store, "run-surface");
  assert.equal(
    authorizeOpenHandsSurface(store, "run-surface", surface.token)
      .conversationId,
    "conversation-one",
  );
  assert.throws(
    () =>
      authorizeOpenHandsSurface(store, "run-surface", "avoozl_surface_forged"),
    /refused/,
  );
});

test("OpenHands surface routes deny server authority and read-only workspace mutation", () => {
  const conversation = "conversation-one",
    route = (tail, method, mode = "implement", query = "") =>
      openHandsSurfaceRouteAllowed(
        `/api/conversations/${conversation}${tail}`,
        conversation,
        method,
        mode,
        new URLSearchParams(query),
      );
  assert.equal(route("", "GET"), true);
  assert.equal(route("/events", "POST", "ask"), true);
  assert.equal(route("/events/search", "GET", "ask"), true);
  assert.equal(route("/file/download", "GET", "ask"), true);
  assert.equal(route("/secrets", "GET"), false);
  assert.equal(route("/bash/execute_bash_command", "POST", "ask"), false);
  assert.equal(route("/bash/execute_bash_command", "POST", "implement"), true);
  assert.equal(route("/file/upload", "POST", "implement"), true);
  assert.equal(route("/switch_llm", "POST"), false);
  assert.equal(route("/secrets", "POST"), false);
  assert.equal(route("/children", "POST"), false);
  assert.equal(route("/runtime/reprovision", "POST"), false);
  assert.equal(route("/../other", "GET"), false);
  assert.equal(
    openHandsSurfaceRouteAllowed(
      "/api/conversations",
      conversation,
      "GET",
      "implement",
      new URLSearchParams({ ids: conversation }),
    ),
    true,
  );
  assert.equal(
    openHandsSurfaceRouteAllowed(
      "/api/conversations",
      conversation,
      "GET",
      "implement",
      new URLSearchParams({ ids: "conversation-two" }),
    ),
    false,
  );
  assert.equal(
    openHandsSurfaceRouteAllowed(
      "/api/conversations",
      conversation,
      "GET",
      "implement",
      new URLSearchParams({
        ids: conversation,
        limit: "100",
      }),
    ),
    false,
  );
  assert.equal(
    openHandsSurfaceRouteAllowed(
      `/api/conversations/${conversation}-other`,
      conversation,
      "GET",
      "implement",
    ),
    false,
  );
});

test("OpenHands surface sockets allow only one bound session cursor", () => {
  const path = "/openhands/run-surface/sockets/session/conversation-one";
  assert.deepEqual(
    openHandsSurfaceSocketRoute(path, new URLSearchParams({ after_seq: "8" })),
    {
      runId: "run-surface",
      upstreamPath: "/sockets/session/conversation-one",
      kind: "session",
      conversationId: "conversation-one",
    },
  );
  assert.ok(
    openHandsSurfaceSocketRoute(path, new URLSearchParams({ after_seq: "-1" })),
  );
  assert.equal(
    openHandsSurfaceSocketRoute(
      path,
      new URLSearchParams({ after_seq: "8", session_api_key: "server-key" }),
    ),
    null,
  );
  assert.equal(
    openHandsSurfaceSocketRoute(
      path.replace("conversation-one", "conversation-one/extra"),
    ),
    null,
  );
  assert.ok(openHandsSurfaceSocketRoute(path.replace("/session/", "/events/")));
  assert.equal(
    openHandsSurfaceSocketRoute(
      path.replace("/session/", "/events/"),
      new URLSearchParams({ after_seq: "8" }),
    ),
    null,
  );
});
