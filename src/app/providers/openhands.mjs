import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Agent,
  HttpClient,
  WebSocketCallbackClient,
} from "@openhands/typescript-client";
import { ConversationClient } from "@openhands/typescript-client/clients";
import { fail } from "../store.mjs";

export const OPENHANDS_VERSIONS = Object.freeze({
  client: "1.61.0",
  server: "1.61.0",
  canvas: "1.38.0",
  plugin: "1.0.0",
});

export const OPENHANDS_CAPABILITIES = Object.freeze({
  steer: true,
  queue: true,
  interrupt: true,
  resume: true,
  approvals: true,
  approvalOptions: ["allow-once", "deny"],
  models: true,
  liveModelChange: true,
  modelChangeApplies: "next-turn",
  interruptStopsSpawnedWork: "unknown",
  subagents: false,
  subagentReason:
    "Child conversation ownership is not normalized into Avoozl runs yet.",
  toolOutput: "structured-events",
  surfaces: ["conversation", "terminal", "files", "browser"],
});

const pluginRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "openhands-plugin",
);

function setting(name, fallback = "") {
  return (
    process.env["AVOOZL_OPENHANDS_" + name] ||
    process.env["AICOMMANDER_OPENHANDS_" + name] ||
    process.env["NUPP_WORKSPACE_OPENHANDS_" + name] ||
    fallback
  );
}

function assertLocalAgentServer(host) {
  let url;
  try {
    url = new URL(host);
  } catch {
    fail("Configure OpenHands with a valid HTTP URL.", 409);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "::1", "localhost"].includes(url.hostname)
  )
    fail(
      "The local OpenHands executor requires a loopback Agent Server. Remote computers must connect through an Avoozl executor channel.",
      409,
    );
}

function assertServerVersion(version) {
  if (version !== OPENHANDS_VERSIONS.server)
    fail(
      `OpenHands Agent Server ${OPENHANDS_VERSIONS.server} is required; found ${version || "an unknown version"}.`,
      409,
    );
}

export function openHandsSettings() {
  return {
    host: setting("URL", "http://127.0.0.1:38100").replace(/\/$/, ""),
    apiKey: setting("API_KEY") || undefined,
    model: setting("MODEL"),
    llmApiKey: setting("LLM_API_KEY") || undefined,
    llmBaseUrl: setting("LLM_BASE_URL") || undefined,
    pluginSource: setting("PLUGIN", pluginRoot),
  };
}

export async function openHandsProviderInfo() {
  const config = openHandsSettings();
  try {
    assertLocalAgentServer(config.host);
    const client = new HttpClient({
      baseUrl: config.host,
      apiKey: config.apiKey,
      timeout: 5000,
    });
    const [{ data: health }, { data: info }] = await Promise.all([
      client.get("/health"),
      client.get("/server_info"),
    ]);
    client.close();
    assertServerVersion(info.version || health.version);
    return {
      id: "openhands",
      label: "OpenHands",
      available: true,
      version: info.version || health.version || null,
      capabilities: OPENHANDS_CAPABILITIES,
      authentication: config.apiKey
        ? "Configured server capability"
        : "Agent Server accepts this local connection without a session key",
      endpoint: config.host,
      compatibility: OPENHANDS_VERSIONS,
    };
  } catch (error) {
    return {
      id: "openhands",
      label: "OpenHands",
      available: false,
      reason:
        "Start a compatible OpenHands Agent Server and configure AVOOZL_OPENHANDS_URL and AVOOZL_OPENHANDS_API_KEY. " +
        error.message,
      capabilities: OPENHANDS_CAPABILITIES,
      compatibility: OPENHANDS_VERSIONS,
    };
  }
}

function textContent(event) {
  if (typeof event.message === "string") return event.message;
  if (typeof event.text === "string") return event.text;
  const content =
    event.content || event.message?.content || event.llm_message?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function executionState(event) {
  if (
    event.kind === "ConversationStateUpdateEvent" &&
    event.key === "execution_status"
  )
    return event.value;
  return (
    event.execution_status ||
    event.agent_status ||
    event.status ||
    event.state?.execution_status ||
    event.state?.agent_status
  );
}

function normalizedState(value) {
  return {
    running: "running",
    awaiting_confirmation: "waiting-approval",
    paused: "interrupted",
    finished: "completed",
    idle: "completed",
    error: "failed",
    stopped: "interrupted",
  }[value];
}

function agentForMode(adapter, mode, model) {
  const readOnly =
      mode === "ask"
        ? "Answer from the provided repository and planning context. Do not modify source, Git state, plans, tasks, or execution state."
        : "Develop a plan using the planning context. You may submit append-only proposals through the authorized planning tools. Do not modify source or approve the plan.",
    persona =
      mode === "implement"
        ? "Implement only the assigned Avoozl task in the bound worktree. Read and obey its AGENTS.md. Do not push, integrate, accept work, approve plans, or add AI attribution or co-authors unless the repository explicitly requires them."
        : readOnly;
  return new Agent({
    llm: adapter.modelConfig(model),
    persona,
    tools:
      mode === "implement"
        ? [
            { name: "terminal" },
            { name: "file_editor" },
            { name: "browser_tool_set" },
          ]
        : [],
  });
}

export class OpenHandsAdapter {
  constructor({
    emit,
    onRequest,
    settings = openHandsSettings(),
    clientFactory = (options) => new ConversationClient(options),
    httpFactory = (options) => new HttpClient(options),
    socketFactory = (options) => new WebSocketCallbackClient(options),
  }) {
    this.emit = emit;
    this.onRequest = onRequest;
    this.settings = settings;
    this.clientFactory = clientFactory;
    this.httpFactory = httpFactory;
    this.socketFactory = socketFactory;
    this.capabilities = OPENHANDS_CAPABILITIES;
    this.seen = new Set();
    this.active = false;
    this.interruption = null;
  }
  modelConfig(model) {
    const selected = model || this.settings.model;
    if (!selected)
      fail(
        "Configure AVOOZL_OPENHANDS_MODEL before starting an OpenHands run.",
        409,
      );
    return {
      kind: "LLM",
      usage_id: "avoozl",
      model: selected,
      ...(this.settings.llmApiKey ? { api_key: this.settings.llmApiKey } : {}),
      ...(this.settings.llmBaseUrl
        ? { base_url: this.settings.llmBaseUrl }
        : {}),
    };
  }
  async start(options) {
    this.options = options;
    if (options.catalogOnly) {
      const model = this.settings.model;
      return model ? [{ id: model, label: model, isDefault: true }] : [];
    }
    this.client = this.clientFactory({
      host: this.settings.host,
      apiKey: this.settings.apiKey,
    });
    this.http = this.httpFactory({
      baseUrl: this.settings.host,
      apiKey: this.settings.apiKey,
      timeout: 60000,
    });
    assertLocalAgentServer(this.settings.host);
    const { data: serverInfo } = await this.http.get("/server_info");
    assertServerVersion(serverInfo.version);
    this.serverVersion = serverInfo.version;
    if (options.resumeId) {
      const info = await this.client.getConversation(options.resumeId);
      this.conversationId = info.id;
      if (options.mcpUrl)
        await this.client.updateSecrets(this.conversationId, {
          secrets: {
            AVOOZL_MCP_URL: {
              kind: "StaticSecret",
              value: options.mcpUrl,
              description: "Run-scoped Avoozl planning capability",
            },
            ...(options.mcpToken
              ? {
                  AVOOZL_MCP_TOKEN: {
                    kind: "StaticSecret",
                    value: options.mcpToken,
                    description: "Run-scoped Avoozl bearer token",
                  },
                }
              : {}),
          },
        });
    } else {
      const agent = agentForMode(this, options.mode, options.model),
        info = await this.client.createConversation({
          conversation_id: options.conversationId,
          agent,
          max_iterations: 500,
          stuck_detection: true,
          conversation_runtime: "local",
          workspace: { type: "local", working_dir: options.cwd },
          plugins: [{ source: this.settings.pluginSource }],
          secrets: options.mcpUrl
            ? {
                AVOOZL_MCP_URL: {
                  kind: "StaticSecret",
                  value: options.mcpUrl,
                  description: "Run-scoped Avoozl planning capability",
                },
                ...(options.mcpToken
                  ? {
                      AVOOZL_MCP_TOKEN: {
                        kind: "StaticSecret",
                        value: options.mcpToken,
                        description: "Run-scoped Avoozl bearer token",
                      },
                    }
                  : {}),
              }
            : {},
          tags: { executor: "avoozl" },
        });
      this.conversationId = info.id;
    }
    this.emit("session", {
      providerSessionId: this.conversationId,
      model: options.model || this.settings.model,
      workspace: options.cwd,
      executor: "openhands",
      server: this.settings.host,
      versions: { ...OPENHANDS_VERSIONS, server: this.serverVersion },
    });
    await this.reconcile();
    this.socket = this.socketFactory({
      host: this.settings.host,
      conversationId: this.conversationId,
      apiKey: this.settings.apiKey,
      callback: (event) => this.receive(event),
      onError: (error) =>
        this.emit("provider.log", {
          text: "OpenHands event stream: " + error.message,
        }),
    });
    this.socket.start();
    await this.setApprovalMode(options.approvalMode);
    if (options.prompt) await this.send(options.prompt, "start");
    else {
      const info = await this.client.getConversation(this.conversationId);
      const state = normalizedState(info.execution_status);
      if (state) this.emit("state", { state });
    }
    return this;
  }
  async reconcile() {
    let pageId;
    do {
      const page = await this.client.searchEvents(this.conversationId, {
        limit: 100,
        page_id: pageId,
        sort_order: "TIMESTAMP",
      });
      for (const event of page.items || []) this.receive(event);
      pageId = page.next_page_id;
    } while (pageId);
  }
  receive(event) {
    if (!event || typeof event !== "object") return;
    if (event.id && this.seen.has(event.id)) return;
    if (event.id) this.seen.add(event.id);
    const providerEventId = event.id,
      common = providerEventId ? { providerEventId } : {};
    if (event.kind === "StreamingDeltaEvent") {
      this.emit("message.delta", {
        ...common,
        text: event.delta || event.text || "",
      });
      return;
    }
    if (event.kind === "MessageEvent") {
      const text = textContent(event);
      if (text && event.source === "agent")
        this.emit("message", { ...common, text });
      else if (event.source === "user") this.emit("input.received", common);
      return;
    }
    if (event.kind === "ConfirmationRequestEvent") {
      this.onRequest({
        providerRequestId: event.action_id,
        kind: "approval",
        method:
          event.action?.action?.kind ||
          event.action?.tool_call?.name ||
          "OpenHands action",
        payload: event,
      });
      return;
    }
    if (event.kind === "ActionEvent" || event.kind === "ACPToolCallEvent") {
      const tool =
        event.action?.kind ||
        event.tool_call?.name ||
        event.tool_name ||
        event.tool_kind ||
        "tool";
      this.emit("tool.started", {
        ...common,
        id: event.id,
        tool,
      });
      this.emit("tool.activity", { ...common, id: event.id, tool, event });
      return;
    }
    if (
      event.kind === "ObservationEvent" ||
      event.kind === "UserRejectObservation"
    ) {
      this.emit("tool.finished", {
        ...common,
        id: event.action_id || event.id,
        isError:
          event.kind !== "ObservationEvent" ||
          event.observation?.is_error === true,
        content: JSON.stringify(event.observation || event.error || event),
      });
      return;
    }
    if (event.kind === "TokenEvent") {
      this.emit("usage", { ...common, ...event });
      return;
    }
    if (
      event.kind === "ConversationErrorEvent" ||
      event.kind === "AgentErrorEvent"
    )
      this.emit("provider.error", {
        ...common,
        message: event.message || event.error || JSON.stringify(event),
      });
    const providerState = executionState(event),
      state = normalizedState(providerState);
    if (state === "running") {
      this.active = true;
      this.emit("state", { ...common, state, providerState });
    } else if (
      state &&
      (this.active ||
        ["paused", "finished", "error", "stopped"].includes(providerState))
    ) {
      const interrupted = state === "interrupted" || Boolean(this.interruption);
      this.active = false;
      this.emit("turn.completed", {
        ...common,
        state:
          state === "failed"
            ? "failed"
            : interrupted
              ? "interrupted"
              : "completed",
        providerStatus: providerState,
        ...(state === "failed"
          ? {
              error: event.message || event.error || "OpenHands run failed.",
            }
          : {}),
      });
      this.interruption = null;
    } else
      this.emit("provider.event", {
        ...common,
        providerKind: event.kind || "unknown",
        event,
      });
  }
  async send(text, mode = "queue") {
    if (mode === "steer" && this.active) await this.interrupt("steer");
    await this.client.sendEvent(
      this.conversationId,
      {
        role: "user",
        content: [{ type: "text", text }],
      },
      { run: true },
    );
    this.active = true;
    return { conversationId: this.conversationId, accepted: true };
  }
  async interrupt(reason = "client-cancel") {
    this.interruption = { reason, requestedAt: new Date().toISOString() };
    const response = await this.client.interruptConversation(
      this.conversationId,
    );
    return { requested: true, acknowledged: true, response };
  }
  async setApprovalMode(value) {
    const policy =
      value === "manual" ? { kind: "AlwaysConfirm" } : { kind: "NeverConfirm" };
    await this.client.setConfirmationPolicy(this.conversationId, policy);
    this.options.approvalMode = value;
    return { applies: "immediately" };
  }
  async setModel(model) {
    await this.http.post(
      `/api/conversations/${this.conversationId}/switch_llm`,
      {
        llm: this.modelConfig(model),
      },
    );
    this.options.model = model;
    return { applies: "next-turn", model };
  }
  async answer(request) {
    await this.client.respondToConfirmation(this.conversationId, {
      accept: request.decision === "allow",
      reason:
        request.decision === "allow"
          ? "Authorized once through Avoozl."
          : "Denied through Avoozl.",
    });
  }
  async close() {
    this.socket?.stop();
    this.http?.close();
  }
}
