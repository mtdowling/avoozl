import test from "node:test";
import assert from "node:assert/strict";
import { OpenHandsAdapter } from "../providers/openhands.mjs";
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
import { fixture } from "./fixtures.mjs";

function fakeOpenHands() {
  const calls = [],
    client = {
      async createConversation(payload) {
        calls.push(["create", payload]);
        return { id: "conversation-test" };
      },
      async getConversation(id) {
        calls.push(["get", id]);
        return { id, execution_status: "paused" };
      },
      async updateSecrets(id, secrets) {
        calls.push(["secrets", id, secrets]);
      },
      async searchEvents() {
        return {
          items: [
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
        return { data: { version: "1.61.0" } };
      },
      async post(url, body) {
        calls.push(["http.post", url, body]);
      },
      close() {},
    };
  return { calls, client, socket, http };
}

test("OpenHands binds one Avoozl worktree, plugin and run-scoped MCP secret", async () => {
  const fake = fakeOpenHands(),
    events = [],
    adapter = new OpenHandsAdapter({
      emit: (kind, body) => events.push({ kind, ...body }),
      onRequest: () => {},
      settings: {
        host: "http://127.0.0.1:38100",
        apiKey: "server-key",
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
  assert.deepEqual(
    create.agent.tools.map((tool) => tool.name),
    ["terminal", "file_editor", "browser_tool_set"],
  );
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
  const path =
    "/openhands/run-surface/sockets/session/conversation-one";
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
    openHandsSurfaceSocketRoute(
      path,
      new URLSearchParams({ after_seq: "-1" }),
    ),
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
  assert.ok(
    openHandsSurfaceSocketRoute(
      path.replace("/session/", "/events/"),
    ),
  );
  assert.equal(
    openHandsSurfaceSocketRoute(
      path.replace("/session/", "/events/"),
      new URLSearchParams({ after_seq: "8" }),
    ),
    null,
  );
});
