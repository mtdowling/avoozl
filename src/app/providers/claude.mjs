import { randomUUID } from "node:crypto";
import { fail } from "../store.mjs";
import { claudeApprovals } from "../approvals.mjs";
import { MCP_TOOLS } from "../../mcp.mjs";
import { WORKSPACE_TOOLS } from "../mcp.mjs";

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
export class ClaudeAdapter {
  constructor({ emit, onRequest, query }) {
    this.emit = emit;
    this.onRequest = onRequest;
    this.queryFactory = query;
    this.permissions = new Map();
  }
  async start(options) {
    const query =
      this.queryFactory ||
      (await import("@anthropic-ai/claude-agent-sdk")).query;
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
              mcpServers: { nupp_plans: { type: "http", url: options.mcpUrl } },
            }
          : {}),
        canUseTool: async (tool, input, context) => {
          const providerRequestId = context.requestId || randomUUID(),
            kind = tool === "AskUserQuestion" ? "input" : "approval";
          return new Promise((resolve) => {
            this.permissions.set(providerRequestId, { resolve, tool, input });
            context.signal?.addEventListener(
              "abort",
              () => {
                this.permissions.delete(providerRequestId);
                resolve({
                  behavior: "deny",
                  message: "The request was interrupted.",
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
            });
        } else if (message.type === "assistant") {
          const text = (message.message?.content || [])
            .filter((x) => x.type === "text")
            .map((x) => x.text)
            .join("\n");
          if (text) this.emit("message", { text });
          for (const block of message.message?.content || [])
            if (block.type === "tool_use") {
              this.emit("tool.started", { tool: block.name, id: block.id });
              this.emit("tool.activity", {
                tool: block.name,
                input: block.input,
                id: block.id,
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
          this.emit("turn.completed", {
            state: message.is_error
              ? "failed"
              : this.interrupted
                ? "interrupted"
                : "completed",
            result: message.result,
            error: message.errors?.join("\n"),
          });
        } else if (message.type === "user") {
          this.emit("input.received", { messageId: message.uuid });
          for (const block of message.message?.content || [])
            if (block.type === "tool_result")
              this.emit("tool.finished", { id: block.tool_use_id });
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
    this.interrupted = false;
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
  async interrupt() {
    this.interrupted = true;
    return this.query.interrupt();
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
