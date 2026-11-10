import { randomUUID } from "node:crypto";
import { fail } from "../store.mjs";
import { claudeApprovals } from "../approvals.mjs";
import { MCP_TOOLS } from "../../mcp.mjs";
import { WORKSPACE_TOOLS } from "../mcp.mjs";
import {
  requestInterruption,
  acknowledgeInterruption,
  classifyTurnEnd,
} from "./cancellation.mjs";

class InputQueue {
  constructor() {
    this.items = [];
    this.waiters = [];
    this.ended = false;
  }
  push(value) {
    if (this.ended) fail("Claude session is closed.", 409);
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.items.push(value);
  }
  end() {
    this.ended = true;
    for (const waiter of this.waiters) waiter({ done: true });
    this.waiters = [];
  }
  [Symbol.asyncIterator]() {
    return {
      next: () =>
        this.items.length
          ? Promise.resolve({ value: this.items.shift(), done: false })
          : this.ended
            ? Promise.resolve({ done: true })
            : new Promise((resolve) => this.waiters.push(resolve)),
    };
  }
}
// Advertised to clients so unsupported controls are disabled with a reason
// rather than silently accepted. Claude redirects an active turn by
// interrupting and then sending; it has no active-steering API.
export const CLAUDE_CAPABILITIES = Object.freeze({
  steer: false,
  steerReason:
    "Claude follow-ups queue. Interrupt, then send, to redirect immediately.",
  queue: true,
  interrupt: true,
  resume: true,
  approvals: true,
  approvalOptions: ["allow-once", "deny"],
  models: true,
  liveModelChange: true,
  modelChangeApplies: "next-turn",
  // Not verified on this machine. Treat the fate of an already-spawned
  // command as unknown rather than assuming interruption reaches it.
  interruptStopsSpawnedWork: "unknown",
  subagents: true,
  toolOutput: "result-blocks",
});
// Tool results arrive as a string or as MCP-style content blocks.
function toolResultText(content) {
  if (typeof content === "string") return content.slice(0, 20000);
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      typeof block === "string"
        ? block
        : block?.type === "text"
          ? block.text || ""
          : block?.type
            ? "[" + block.type + "]"
            : "",
    )
    .join("\n")
    .slice(0, 20000);
}
export class ClaudeAdapter {
  constructor({ emit, onRequest, query }) {
    this.emit = emit;
    this.onRequest = onRequest;
    this.queryFactory = query;
    this.permissions = new Map();
    // Provider-message counter. Interruption intent is ordered against this,
    // not against wall-clock timestamps.
    this.observations = 0;
    this.interruption = null;
    this.capabilities = CLAUDE_CAPABILITIES;
  }
  async start(options) {
    const query =
      this.queryFactory ||
      (await import("@anthropic-ai/claude-agent-sdk")).query;
    // The catalog is read through this adapter so the models offered to a
    // client come from the same SDK the session would use.
    if (options.catalogOnly) return claudeModels({ query });
    this.queue = new InputQueue();
    this.options = options;
    this.query = query({
      prompt: this.queue,
      options: {
        cwd: options.cwd,
        ...(options.model ? { model: options.model } : {}),
        ...(options.resumeId ? { resume: options.resumeId } : {}),
        ...claudeApprovals(options.mode, options.approvalMode),
        allowedTools:
          options.mcpUrl && options.approvalMode !== "manual"
            ? [...MCP_TOOLS, ...WORKSPACE_TOOLS]
                .filter((t) => t.annotations?.readOnlyHint)
                .map((t) => "mcp__nupp_plans__" + t.name)
            : [],
        settingSources: ["project"],
        includePartialMessages: true,
        ...(options.mcpUrl
          ? {
              mcpServers: {
                nupp_plans: {
                  type: "http",
                  url: options.mcpUrl,
                  ...(options.mcpToken
                    ? {
                        headers: {
                          Authorization: "Bearer " + options.mcpToken,
                        },
                      }
                    : {}),
                },
              },
            }
          : {}),
        canUseTool: async (tool, input, context) => {
          const providerRequestId = context.requestId || randomUUID(),
            kind = tool === "AskUserQuestion" ? "input" : "approval";
          return new Promise((resolve) => {
            this.permissions.set(providerRequestId, {
              resolve,
              tool,
              input,
              toolUseId: context.toolUseID,
            });
            context.signal?.addEventListener(
              "abort",
              () => {
                this.permissions.delete(providerRequestId);
                resolve({
                  behavior: "deny",
                  message: "The request was interrupted.",
                });
                // The tool never ran: acquisition was interrupted before the
                // decision. This is not the same as a user denial.
                this.emit("request.interrupted", {
                  providerRequestId,
                  toolUseId: context.toolUseID,
                  executed: false,
                  reason: this.interruption
                    ? "canceled-before-acquisition"
                    : "provider-aborted-acquisition",
                });
                this.emit("request.resolved", { providerRequestId });
              },
              { once: true },
            );
            this.onRequest({
              providerRequestId,
              kind,
              method: tool,
              payload: { tool, input, toolUseId: context.toolUseID },
            });
          });
        },
      },
    });
    this.consume();
    if (options.prompt) await this.send(options.prompt);
    return this;
  }
  async consume() {
    try {
      for await (const message of this.query) {
        const observation = ++this.observations;
        // Claude attributes subagent work with the delegating tool use.
        const subagent = message.parent_tool_use_id || null;
        if (
          message.type === "system" &&
          message.permissionMode &&
          this.options.mode === "implement"
        )
          this.emit("approvals.status", {
            effectiveApprovalMode:
              message.permissionMode === "auto" ? "automatic" : "manual",
            approvalNotice:
              this.options.approvalMode !== "manual" &&
              message.permissionMode !== "auto"
                ? "Claude is using manual approvals; automatic review is unavailable for this session."
                : "",
          });
        if (message.session_id) {
          this.sessionId = message.session_id;
          if (!this.reportedSession) {
            this.reportedSession = true;
            this.emit("session", {
              providerSessionId: this.sessionId,
              model: message.model || this.options.model,
            });
          }
        }
        if (message.type === "stream_event") {
          const e = message.event;
          if (
            e.type === "content_block_delta" &&
            e.delta?.type === "text_delta"
          )
            this.emit("message.delta", {
              text: e.delta.text,
              itemId: String(e.index),
              ...(subagent ? { subagent } : {}),
            });
          else if (
            e.type === "content_block_delta" &&
            (e.delta?.type === "thinking_delta" ||
              e.delta?.type === "signature_delta")
          )
            this.emit("reasoning.delta", {
              text: e.delta.thinking || "",
              itemId: "thinking-" + e.index,
              ...(subagent ? { subagent } : {}),
            });
        } else if (message.type === "assistant") {
          const text = (message.message?.content || [])
            .filter((x) => x.type === "text")
            .map((x) => x.text)
            .join("\n");
          if (text)
            this.emit("message", { text, ...(subagent ? { subagent } : {}) });
          for (const block of message.message?.content || [])
            if (block.type === "tool_use") {
              this.emit("tool.started", {
                tool: block.name,
                id: block.id,
                ...(subagent ? { subagent } : {}),
              });
              this.emit("tool.activity", {
                tool: block.name,
                input: block.input,
                id: block.id,
                ...(subagent ? { subagent } : {}),
              });
            }
        } else if (message.type === "result") {
          this.emit("usage", {
            reportId: message.uuid,
            modelUsage: message.modelUsage,
            totalCostUsd: message.total_cost_usd,
            mainLoopUsage: message.usage,
            providerDurationMs: message.duration_ms,
            providerApiDurationMs: message.duration_api_ms,
          });
          // Claude reports no interruption status of its own: an interrupted
          // turn arrives as an error result. Classify it against our recorded
          // intent rather than matching the diagnostic text, and keep the
          // provider's own wording either way.
          const diagnostic =
            message.errors?.join("\n") ||
            (message.is_error ? message.result || null : null);
          const outcome = classifyTurnEnd({
            interruption: this.interruption,
            isError: Boolean(message.is_error),
            diagnostic,
            observation,
          });
          this.interruption = null;
          this.emit("turn.completed", {
            ...outcome,
            result: message.result,
          });
        } else if (message.type === "user") {
          this.emit("input.received", { messageId: message.uuid });
          for (const block of message.message?.content || [])
            if (block.type === "tool_result")
              this.emit("tool.finished", {
                id: block.tool_use_id,
                // The SDK reports tool failure on the result block. Dropping
                // it would turn a failed tool into a silent success.
                isError: Boolean(block.is_error),
                content: toolResultText(block.content),
                ...(subagent ? { subagent } : {}),
              });
        } else if (message.type === "system")
          this.emit("provider.info", { subtype: message.subtype });
      }
      if (!this.closing)
        this.emit("disconnected", {
          message: "Claude session ended; resume to continue.",
        });
    } catch (error) {
      if (!this.closing) this.emit("disconnected", { message: error.message });
    }
  }
  async send(text) {
    this.interruption = null;
    const id = randomUUID();
    this.queue.push({
      type: "user",
      uuid: id,
      session_id: this.sessionId || "",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
    });
    return { messageId: id, delivery: "submitted" };
  }
  async interrupt(reason = "client-cancel") {
    // Held locally: the SDK may end the turn while this request is in flight,
    // which clears the adapter's record.
    const interruption = requestInterruption(this.observations, reason);
    this.interruption = interruption;
    await this.query.interrupt();
    // The SDK resolves once it has asked the session to stop. Record that
    // acknowledgment; the truthful terminal state still comes from the turn.
    acknowledgeInterruption(interruption, { api: "Claude SDK interrupt" });
    return {
      requested: true,
      acknowledged: true,
      requestedAt: interruption.requestedAt,
      acknowledgedAt: interruption.acknowledgedAt,
    };
  }
  async setModel(model) {
    if (typeof this.query.setModel !== "function")
      fail("This Claude session cannot change models.", 409);
    await this.query.setModel(model);
    this.options.model = model;
    // Claude applies a model change to the next turn, not retroactively.
    return { applies: "next-turn", api: "Claude SDK setModel", model };
  }
  async setApprovalMode(value) {
    const settings = claudeApprovals(this.options.mode, value);
    await this.query.applyFlagSettings(settings.settings);
    await this.query.setPermissionMode(settings.permissionMode);
    this.options.approvalMode = value;
    return { applies: "session" };
  }
  async answer({ providerRequestId, decision, answers }) {
    const pending = this.permissions.get(providerRequestId);
    if (!pending) fail("This provider request is no longer pending.", 409);
    pending.resolve(
      decision === "allow"
        ? {
            behavior: "allow",
            updatedInput: {
              ...pending.input,
              ...(pending.tool === "AskUserQuestion"
                ? { answers: answers || {} }
                : {}),
            },
          }
        : { behavior: "deny", message: "Declined by the user." },
    );
    this.permissions.delete(providerRequestId);
    return { accepted: true };
  }
  async close() {
    this.closing = true;
    this.queue?.end();
    for (const p of this.permissions.values())
      p.resolve({ behavior: "deny", message: "Session closed." });
    this.permissions.clear();
    this.query?.close();
  }
}
// The windows the plan reports, in the order an operator cares about: the
// short rolling window first, then the weekly ones, then per-model buckets.
function planWindows(limits) {
  const named = [
    ["five_hour", "5-hour"],
    ["seven_day", "7-day"],
    ["seven_day_opus", "7-day Opus"],
    ["seven_day_sonnet", "7-day Sonnet"],
    ["seven_day_oauth_apps", "7-day apps"],
  ];
  const windows = [];
  for (const [key, label] of named) {
    const window = limits[key];
    if (window && typeof window.utilization === "number")
      windows.push({
        id: key,
        label,
        utilization: window.utilization,
        resetsAt: window.resets_at || null,
      });
  }
  for (const window of limits.model_scoped || [])
    if (typeof window?.utilization === "number")
      windows.push({
        id: "model:" + window.display_name,
        label: window.display_name,
        utilization: window.utilization,
        resetsAt: window.resets_at || null,
      });
  return windows;
}
// Plan usage comes from the SDK's /usage control request. Its method name says
// it may change or disappear in any release, so a missing method or a failed
// call is reported as unavailable rather than failing the caller.
export async function claudeUsage({ query: queryFactory } = {}) {
  const query =
      queryFactory || (await import("@anthropic-ai/claude-agent-sdk")).query,
    queue = new InputQueue();
  const session = query({
    prompt: queue,
    options: { permissionMode: "plan", settingSources: [] },
  });
  try {
    const read =
      session.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET;
    if (typeof read !== "function")
      return {
        provider: "claude",
        available: false,
        reason: "This Claude Agent SDK build does not report plan usage.",
      };
    const result = await read.call(session, { skipBehaviors: true });
    const subscription = result?.subscription_type || null;
    if (!result?.rate_limits_available || !result.rate_limits)
      return {
        provider: "claude",
        available: false,
        subscription,
        reason:
          "This Claude session has no plan limits: API key, Bedrock and Vertex sessions are billed per request.",
      };
    return {
      provider: "claude",
      available: true,
      subscription,
      windows: planWindows(result.rate_limits),
      extraUsage: result.rate_limits.extra_usage?.is_enabled
        ? {
            utilization: result.rate_limits.extra_usage.utilization ?? null,
            monthlyLimit: result.rate_limits.extra_usage.monthly_limit ?? null,
            usedCredits: result.rate_limits.extra_usage.used_credits ?? null,
            currency: result.rate_limits.extra_usage.currency || null,
          }
        : null,
    };
  } finally {
    queue.end();
    session.close();
  }
}
export async function claudeModels({ query: queryFactory } = {}) {
  const query =
      queryFactory || (await import("@anthropic-ai/claude-agent-sdk")).query,
    queue = new InputQueue();
  const session = query({
    prompt: queue,
    options: { permissionMode: "plan", settingSources: [] },
  });
  try {
    return (await session.supportedModels()).map((m) => ({
      id: m.value,
      label: m.displayName || m.value,
      description: m.description || "",
      isDefault: m.value === "default",
    }));
  } finally {
    queue.end();
    session.close();
  }
}
