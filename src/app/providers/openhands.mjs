import fs from "node:fs";
import os from "node:os";
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
  plugin: "1.3.1",
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
  subagents: true,
  subagentMode: "child-conversations",
  toolOutput: "structured-events",
  surfaces: ["conversation", "terminal", "files", "browser"],
});

export const OPENHANDS_PLUGIN = Object.freeze({
  name: "avoozl",
  version: "1.3.1",
  source: path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "openhands-plugin",
  ),
});

function setting(name, fallback = "", env = process.env) {
  return (
    env["AVOOZL_OPENHANDS_" + name] ||
    env["AICOMMANDER_OPENHANDS_" + name] ||
    env["NUPP_WORKSPACE_OPENHANDS_" + name] ||
    fallback
  );
}

function readSessionApiKey(file, { platform, required }) {
  let descriptor;
  try {
    const noFollow = platform === "win32" ? 0 : fs.constants.O_NOFOLLOW || 0;
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
  } catch (error) {
    if (error.code === "ENOENT" && !required) return undefined;
    if (error.code === "ELOOP")
      fail("Refusing a symlinked OpenHands API key file.", 409);
    fail(
      `Cannot read the configured OpenHands API key file: ${error.message}`,
      409,
    );
  }
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile())
      fail("The configured OpenHands API key path is not a regular file.", 409);
    if (platform !== "win32" && (stat.mode & 0o077) !== 0)
      fail(
        "Refusing an OpenHands API key file accessible to other users.",
        409,
      );
    const key = fs.readFileSync(descriptor, "utf8").trim();
    if (!key) fail("The configured OpenHands API key file is empty.", 409);
    return key;
  } finally {
    fs.closeSync(descriptor);
  }
}

function isStandardCanvasServer(host) {
  try {
    const url = new URL(host);
    return (
      url.port === "38100" &&
      ["127.0.0.1", "::1", "localhost"].includes(url.hostname)
    );
  } catch {
    return false;
  }
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

export function openHandsSettings({
  env = process.env,
  home = os.homedir(),
  platform = process.platform,
} = {}) {
  const host = setting("URL", "http://127.0.0.1:38100", env).replace(/\/$/, ""),
    explicitKey = setting("API_KEY", "", env),
    configuredKeyFile = setting("API_KEY_FILE", "", env),
    keyFile =
      configuredKeyFile ||
      (isStandardCanvasServer(host)
        ? path.join(home, ".openhands", "agent-canvas", "api-key.txt")
        : "");
  return {
    host,
    automationHost:
      setting("AUTOMATION_URL", "", env).replace(/\/$/, "") || undefined,
    apiKey:
      explicitKey ||
      (keyFile
        ? readSessionApiKey(keyFile, {
            platform,
            required: Boolean(configuredKeyFile),
          })
        : undefined),
    model: setting("MODEL", "", env),
    agentProfile: setting("AGENT_PROFILE", "", env) || undefined,
    llmApiKey: setting("LLM_API_KEY", "", env) || undefined,
    llmBaseUrl: setting("LLM_BASE_URL", "", env) || undefined,
    pluginSource: setting("PLUGIN", OPENHANDS_PLUGIN.source, env),
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
        "Start a compatible OpenHands Agent Server. Avoozl discovers the standard local Agent Canvas key, or accepts AVOOZL_OPENHANDS_API_KEY or AVOOZL_OPENHANDS_API_KEY_FILE. " +
        error.message,
      capabilities: OPENHANDS_CAPABILITIES,
      compatibility: OPENHANDS_VERSIONS,
    };
  }
}

export async function openHandsAgentProfiles() {
  const config = openHandsSettings(),
    client = new HttpClient({
      baseUrl: config.host,
      apiKey: config.apiKey,
      timeout: 5000,
    });
  try {
    assertLocalAgentServer(config.host);
    const [{ data: listing }, { data: llmListing }, { data: info }] =
      await Promise.all([
        client.get("/api/agent-profiles"),
        client.get("/api/profiles"),
        client.get("/server_info"),
      ]);
    assertServerVersion(info.version);
    return {
      activeAgentProfileId: listing.active_agent_profile_id || null,
      profiles: (listing.profiles || []).map((profile) => ({
        id: profile.id,
        name: profile.name || profile.id,
        description: profile.description || null,
        agentKind: profile.agent_kind || null,
      })),
      activeLlmProfile: llmListing.active_profile || null,
      llmProfiles: (llmListing.profiles || []).map((profile) => ({
        name: profile.name,
        model: profile.model || null,
      })),
    };
  } finally {
    client.close();
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
  if (
    event.kind === "ConversationStateUpdateEvent" &&
    event.key === "full_state"
  )
    return event.value?.execution_status;
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

function missingConversation(error) {
  const status =
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    error?.cause?.status;
  return (
    status === 404 ||
    /\b404\b|conversation (?:was )?not found|no such conversation/i.test(
      error?.message || "",
    )
  );
}

function reportedNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function conversationStats(info) {
  if (!info || typeof info !== "object") return null;
  return info.stats || info.conversation_stats || null;
}

function metricSnapshots(info) {
  const stats = conversationStats(info),
    mapped =
      stats?.usage_to_metrics &&
      typeof stats.usage_to_metrics === "object" &&
      !Array.isArray(stats.usage_to_metrics)
        ? Object.entries(stats.usage_to_metrics)
        : [];
  if (mapped.length) return mapped;
  return info?.metrics && typeof info.metrics === "object"
    ? [["conversation", info.metrics]]
    : [];
}

export function openHandsConversationModel(info, fallback = null) {
  const metricModels = metricSnapshots(info)
      .map(([, metric]) => metric?.model_name)
      .filter((model) => typeof model === "string" && model),
    candidates = [
      info?.current_model_id,
      info?.agent?.llm?.model,
      info?.llm_model,
      info?.model,
      metricModels.length === 1 ? metricModels[0] : null,
      fallback,
    ];
  return candidates.find((model) => typeof model === "string" && model) || null;
}

export function openHandsUsageReport(
  info,
  {
    providerSessionId = info?.id,
    fallbackModel = null,
    source = "conversation-stats",
    reportId = null,
  } = {},
) {
  const snapshots = metricSnapshots(info),
    byModel = new Map();
  for (const [usageId, metric] of snapshots) {
    if (!metric || typeof metric !== "object") continue;
    const tokens = metric.accumulated_token_usage,
      cost = reportedNumber(metric.accumulated_cost);
    if ((!tokens || typeof tokens !== "object") && cost === null) continue;
    const model =
        (typeof metric.model_name === "string" && metric.model_name) ||
        (typeof tokens?.model === "string" && tokens.model) ||
        openHandsConversationModel(info, fallbackModel) ||
        "unknown",
      current = byModel.get(model) || {
        model,
        promptTokens: null,
        completionTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        reasoningTokens: null,
        costUsd: null,
        usageIds: [],
      },
      add = (field, value) => {
        const number = reportedNumber(value);
        if (number === null) return;
        current[field] = (current[field] || 0) + number;
      };
    add("promptTokens", tokens?.prompt_tokens);
    add("completionTokens", tokens?.completion_tokens);
    add("cacheReadTokens", tokens?.cache_read_tokens);
    add("cacheWriteTokens", tokens?.cache_write_tokens);
    add("reasoningTokens", tokens?.reasoning_tokens);
    add("costUsd", cost);
    current.usageIds.push(usageId);
    byModel.set(model, current);
  }
  if (!byModel.size) return null;
  const usage = [...byModel.values()],
    models = usage.map((entry) => entry.model);
  return {
    reportId:
      reportId ||
      `openhands:${providerSessionId || "unknown"}:${source}:cumulative`,
    providerSessionId: providerSessionId || null,
    provider: "openhands",
    source,
    model: models.length === 1 ? models[0] : null,
    usage,
    coverage:
      "OpenHands cumulative conversation metrics. Prompt, completion, cache, reasoning, and cost fields are retained only when the selected LLM backend reports them.",
  };
}

export function openHandsContextWindowReport(
  info,
  { providerSessionId = info?.id, source = "conversation-stats" } = {},
) {
  const candidates = metricSnapshots(info)
    .flatMap(([usageId, metric]) => {
      const tokens = metric?.accumulated_token_usage,
        contextWindow = reportedNumber(tokens?.context_window),
        perTurnToken = reportedNumber(tokens?.per_turn_token);
      if (contextWindow === null || contextWindow <= 0 || perTurnToken === null)
        return [];
      const usedPercent = Math.min(100, (perTurnToken / contextWindow) * 100);
      return [
        {
          usageId,
          model:
            metric?.model_name ||
            tokens?.model ||
            openHandsConversationModel(info),
          contextWindow,
          perTurnToken,
          usedPercent,
          remainingPercent: Math.max(0, 100 - usedPercent),
        },
      ];
    })
    .sort(
      (left, right) =>
        right.usedPercent - left.usedPercent ||
        String(left.usageId).localeCompare(String(right.usageId)),
    );
  if (!candidates.length) return null;
  return {
    provider: "openhands",
    providerSessionId: providerSessionId || null,
    source,
    ...candidates[0],
    coverage:
      "OpenHands-reported per-turn tokens divided by its reported model context window. This is context capacity, not cumulative spend or plan allowance.",
  };
}

export function openHandsTokenUsageReport(
  totals,
  { providerSessionId = null, model = null, reportId = null } = {},
) {
  const promptTokens = reportedNumber(totals?.promptTokens),
    completionTokens = reportedNumber(totals?.completionTokens),
    events = reportedNumber(totals?.events);
  if (!events || (promptTokens === null && completionTokens === null))
    return null;
  return {
    reportId:
      reportId ||
      `openhands:${providerSessionId || "unknown"}:token-events:cumulative`,
    providerSessionId,
    provider: "openhands",
    source: "token-events",
    model: model || null,
    usage: [
      {
        model: model || "unknown",
        promptTokens: promptTokens || 0,
        completionTokens: completionTokens || 0,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        reasoningTokens: null,
        costUsd: null,
      },
    ],
    coverage:
      "Exact OpenHands TokenEvent prompt and response ID counts. The event does not report cache usage, reasoning-token attribution, cost, or a model name.",
  };
}

function conversationWorkspace(info) {
  if (typeof info.workspace === "string") return info.workspace;
  return (
    info.workspace?.working_dir ||
    info.working_dir ||
    info.selected_workspace ||
    null
  );
}

function childConversation(info, fallbackParentId) {
  const model = openHandsConversationModel(info),
    usage = openHandsUsageReport(info, {
      providerSessionId: info.id,
      fallbackModel: model,
      source: "child-conversation-stats",
    });
  return {
    providerSessionId: info.id,
    parentProviderSessionId: info.parent_conversation_id || fallbackParentId,
    title: info.title || null,
    state: normalizedState(info.execution_status || info.status) || "observing",
    worktree: conversationWorkspace(info),
    branch: info.selected_branch || null,
    model,
    usage,
    createdAt: info.created_at || null,
    updatedAt: info.updated_at || null,
  };
}

function agentForMode(adapter, mode, model, systemInstructions) {
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
    persona: [persona, systemInstructions].filter(Boolean).join("\n\n"),
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
    this.childLaunchActions = new Set();
    this.childReconcile = null;
    this.usageRefresh = null;
    this.metricUsageObserved = false;
    this.tokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      events: 0,
    };
    this.active = false;
    this.interruption = null;
    this.providerState = null;
    this.authoritativeStateMarker = null;
    this.stateFailures = 0;
    this.stateRefresh = null;
    this.stateTimer = null;
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
  async agentProfile(requestedProfile) {
    const { data: listing } = await this.http.get("/api/agent-profiles"),
      selectedProfile = requestedProfile || this.settings.agentProfile,
      selected = selectedProfile
        ? (listing.profiles || []).find(
            (profile) =>
              profile.id === selectedProfile ||
              profile.name === selectedProfile,
          )
        : (listing.profiles || []).find(
            (profile) => profile.id === listing.active_agent_profile_id,
          );
    if (selectedProfile && !selected)
      fail(`OpenHands agent profile ${selectedProfile} was not found.`, 409);
    return selected || null;
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
    let conversationInfo;
    if (options.resumeId) {
      const info = await this.client.getConversation(options.resumeId);
      conversationInfo = info;
      this.conversationId = info.id;
      this.agentKind =
        info.agent?.acp_server || info.agent?.kind === "ACPAgent"
          ? "acp"
          : "openhands";
      this.agentProfileId =
        info.launched_agent_profile?.agent_profile_id || null;
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
      if (options.title)
        await this.client.updateConversation(this.conversationId, {
          title: options.title.slice(0, 200),
        });
    } else {
      const profile = await this.agentProfile(options.agentProfile),
        agent =
          profile || options.model || this.settings.model
            ? profile
              ? null
              : agentForMode(
                  this,
                  options.mode,
                  options.model,
                  options.systemInstructions,
                )
            : fail(
                "No OpenHands agent is configured. Run `avoozl openhands setup-agents`, or configure an OpenHands LLM profile.",
                409,
              ),
        info = await this.client.createConversation({
          conversation_id: options.conversationId,
          ...(profile ? { agent_profile_id: profile.id } : { agent }),
          ...(options.parentConversationId
            ? { parent_conversation_id: options.parentConversationId }
            : {}),
          ...(profile && (options.systemInstructions || options.model)
            ? {
                agent_launch_additions: {
                  ...(profile.agent_kind === "openhands" && options.model
                    ? { llm_profile_ref: options.model }
                    : {}),
                  ...(options.systemInstructions
                    ? {
                        system_message_suffix_append:
                          options.systemInstructions,
                      }
                    : {}),
                },
              }
            : {}),
          max_iterations: 500,
          stuck_detection: true,
          autotitle: false,
          conversation_runtime: "local",
          worktree: false,
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
      conversationInfo = info;
      this.conversationId = info.id;
      if (
        profile?.agent_kind === "acp" &&
        typeof options.model === "string" &&
        options.model.trim()
      )
        await this.http.post(
          `/api/conversations/${encodeURIComponent(this.conversationId)}/switch_acp_model`,
          { model: options.model.trim() },
        );
      if (options.title)
        await this.client.updateConversation(this.conversationId, {
          title: options.title.slice(0, 200),
        });
      this.agentKind = profile?.agent_kind || "openhands";
      this.agentProfileId = profile?.id || null;
    }
    this.currentModel = openHandsConversationModel(
      conversationInfo,
      options.model ||
        this.settings.model ||
        this.settings.agentProfile ||
        this.agentProfileId,
    );
    this.emit("session", {
      providerSessionId: this.conversationId,
      model: this.currentModel,
      agentProfileId: this.agentProfileId,
      agentKind: this.agentKind,
      workspace: options.cwd,
      executor: "openhands",
      server: this.settings.host,
      versions: { ...OPENHANDS_VERSIONS, server: this.serverVersion },
    });
    await this.reconcile();
    await this.refreshUsage();
    await this.reconcileChildren();
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
    const statePollMs = Number(this.settings.statePollMs ?? 15000);
    if (Number.isFinite(statePollMs) && statePollMs > 0) {
      this.stateTimer = setInterval(
        () => this.queueStateRefresh(),
        Math.max(1000, statePollMs),
      );
      this.stateTimer.unref?.();
    }
    await this.setApprovalMode(options.approvalMode);
    if (options.prompt) await this.send(options.prompt, "start");
    else await this.refreshState();
    return this;
  }
  observeState(providerState, details = {}, { authoritative = false } = {}) {
    const state = normalizedState(providerState);
    if (!state) return false;
    const previous = this.providerState;
    this.providerState = providerState;
    if (["running", "waiting-approval"].includes(state)) {
      this.active = true;
      this.emit("state", { state, providerState, ...details });
      return true;
    }
    if (!authoritative && !this.active && previous === providerState)
      return true;
    const interrupted = state === "interrupted" || Boolean(this.interruption);
    this.active = false;
    this.emit("turn.completed", {
      state:
        state === "failed"
          ? "failed"
          : interrupted
            ? "interrupted"
            : "completed",
      providerStatus: providerState,
      ...details,
      ...(state === "failed" && details.error ? { error: details.error } : {}),
    });
    this.queueChildReconcile();
    this.queueUsageRefresh();
    this.interruption = null;
    return true;
  }
  async refreshState() {
    try {
      const info = await this.client.getConversation(this.conversationId);
      this.stateFailures = 0;
      const providerState = info.execution_status || info.status,
        marker = `${providerState || "unknown"}:${info.updated_at || ""}`,
        authoritative = marker !== this.authoritativeStateMarker;
      this.authoritativeStateMarker = marker;
      this.emitUsageFromInfo(info, "conversation-state");
      this.observeState(
        providerState,
        {
          providerObservedAt: info.updated_at || new Date().toISOString(),
        },
        { authoritative },
      );
      return info;
    } catch (error) {
      this.stateFailures++;
      if (missingConversation(error) || this.stateFailures >= 3) {
        clearInterval(this.stateTimer);
        this.stateTimer = null;
        this.socket?.stop();
        this.emit("disconnected", {
          message: missingConversation(error)
            ? "OpenHands no longer exposes this conversation. Its Avoozl run and transcript link were preserved."
            : "OpenHands could not be reached after three lifecycle checks. Its Avoozl run and transcript link were preserved.",
          providerAvailability: missingConversation(error)
            ? "not-found"
            : "unavailable",
          providerDiagnostic: error.message,
        });
      } else
        this.emit("provider.log", {
          text:
            "OpenHands lifecycle check failed (" +
            this.stateFailures +
            "/3): " +
            error.message,
        });
      return null;
    }
  }
  queueStateRefresh() {
    if (this.stateRefresh) return this.stateRefresh;
    this.stateRefresh = Promise.resolve()
      .then(() => this.refreshState())
      .then((info) => {
        if (info?.sub_conversation_ids?.length) this.queueChildReconcile();
        return info;
      })
      .finally(() => {
        this.stateRefresh = null;
      });
    return this.stateRefresh;
  }
  emitUsageFromInfo(info, source = "conversation-stats") {
    const model = openHandsConversationModel(info, this.currentModel);
    if (model) this.currentModel = model;
    const context = openHandsContextWindowReport(info, {
      providerSessionId: this.conversationId,
      source,
    });
    if (context) this.emit("context", context);
    const report = openHandsUsageReport(info, {
      providerSessionId: this.conversationId,
      fallbackModel: this.currentModel,
      source,
    });
    if (!report) return false;
    this.metricUsageObserved = true;
    this.emit("usage", report);
    return true;
  }
  async refreshUsage() {
    const info = await this.client.getConversation(this.conversationId);
    const model = openHandsConversationModel(info, this.currentModel);
    if (model) this.currentModel = model;
    if (this.emitUsageFromInfo(info, "conversation-stats")) return;
    if (!this.metricUsageObserved) {
      const fallback = openHandsTokenUsageReport(this.tokenUsage, {
        providerSessionId: this.conversationId,
        model: this.currentModel,
      });
      if (fallback) {
        this.emit("usage", fallback);
        return;
      }
    }
    this.emit("usage.status", {
      availability: "not-reported",
      provider: "openhands",
      providerSessionId: this.conversationId,
      model: this.currentModel,
      reason:
        "OpenHands has not reported cumulative token metrics or TokenEvent counts for this conversation.",
    });
  }
  queueUsageRefresh() {
    if (this.usageRefresh) return;
    this.usageRefresh = Promise.resolve()
      .then(() => this.refreshUsage())
      .catch((error) =>
        this.emit("usage.status", {
          availability: "unavailable",
          provider: "openhands",
          providerSessionId: this.conversationId,
          model: this.currentModel,
          reason: "OpenHands usage could not be read: " + error.message,
        }),
      )
      .finally(() => {
        this.usageRefresh = null;
      });
  }
  async reconcileChildren() {
    const root = await this.client.getConversation(this.conversationId),
      pending = [...new Set(root.sub_conversation_ids || [])],
      seen = new Set([this.conversationId]),
      children = [];
    while (pending.length && children.length < 200) {
      const ids = pending
        .splice(0, 50)
        .filter((id) => typeof id === "string" && id && !seen.has(id));
      for (const id of ids) seen.add(id);
      if (!ids.length) continue;
      const infos = await this.client.getConversations(ids);
      for (let index = 0; index < ids.length; index++) {
        const info = infos[index];
        if (!info?.id) {
          children.push({
            providerSessionId: ids[index],
            parentProviderSessionId: this.conversationId,
            state: "disconnected",
            providerAvailability: "not-found",
            providerDiagnostic:
              "OpenHands listed this child conversation but did not return it.",
          });
          continue;
        }
        children.push(childConversation(info, this.conversationId));
        for (const id of info.sub_conversation_ids || [])
          if (typeof id === "string" && id && !seen.has(id)) pending.push(id);
      }
    }
    this.emit("children", {
      children,
      truncated: pending.length > 0,
    });
  }
  queueChildReconcile() {
    if (this.childReconcile) return;
    this.childReconcile = Promise.resolve()
      .then(() => this.reconcileChildren())
      .catch((error) =>
        this.emit("provider.log", {
          text: "OpenHands child conversations: " + error.message,
        }),
      )
      .finally(() => {
        this.childReconcile = null;
      });
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
      if (
        event.id &&
        (tool === "launch_child_conversation" ||
          /ChildConversation|Delegate/.test(tool))
      )
        this.childLaunchActions.add(event.id);
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
      const childLaunch =
        this.childLaunchActions.delete(event.action_id) ||
        JSON.stringify(event.observation || event).includes(
          "[child-conversation]",
        );
      this.emit("tool.finished", {
        ...common,
        id: event.action_id || event.id,
        isError:
          event.kind !== "ObservationEvent" ||
          event.observation?.is_error === true,
        content: JSON.stringify(event.observation || event.error || event),
      });
      if (childLaunch) this.queueChildReconcile();
      return;
    }
    if (event.kind === "TokenEvent") {
      this.tokenUsage.promptTokens += Array.isArray(event.prompt_token_ids)
        ? event.prompt_token_ids.length
        : 0;
      this.tokenUsage.completionTokens += Array.isArray(
        event.response_token_ids,
      )
        ? event.response_token_ids.length
        : 0;
      this.tokenUsage.events++;
      return;
    }
    if (
      event.kind === "ConversationStateUpdateEvent" &&
      [
        "full_state",
        "stats",
        "conversation_stats",
        "metrics",
        "usage_to_metrics",
      ].includes(event.key)
    ) {
      const info =
        event.key === "full_state"
          ? { id: this.conversationId, ...event.value }
          : event.key === "metrics"
            ? { id: this.conversationId, metrics: event.value }
            : event.key === "usage_to_metrics"
              ? {
                  id: this.conversationId,
                  stats: { usage_to_metrics: event.value },
                }
              : { id: this.conversationId, [event.key]: event.value };
      this.emitUsageFromInfo(info, "conversation-state");
      if (event.key !== "full_state") return;
    }
    if (
      event.kind === "ConversationErrorEvent" ||
      event.kind === "AgentErrorEvent"
    )
      this.emit("provider.error", {
        ...common,
        message: event.message || event.error || JSON.stringify(event),
      });
    const providerState = executionState(event);
    if (
      !this.observeState(providerState, {
        ...common,
        ...(normalizedState(providerState) === "failed"
          ? {
              error: event.message || event.error || "OpenHands run failed.",
            }
          : {}),
      })
    )
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
    this.providerState = "running";
    this.authoritativeStateMarker = null;
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
    if (this.agentKind === "acp")
      await this.http.post(
        `/api/conversations/${this.conversationId}/switch_acp_model`,
        { model },
      );
    else
      await this.http.post(
        `/api/conversations/${this.conversationId}/switch_llm`,
        {
          llm: this.modelConfig(model),
        },
      );
    this.options.model = model;
    this.currentModel = model;
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
    clearInterval(this.stateTimer);
    this.stateTimer = null;
    this.socket?.stop();
    await this.stateRefresh;
    await this.childReconcile;
    await this.usageRefresh;
    this.http?.close();
  }
}
