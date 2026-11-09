import { spawn } from "node:child_process";
import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { fail } from "../store.mjs";
import { codexApprovals } from "../approvals.mjs";
import {
  requestInterruption,
  acknowledgeInterruption,
  classifyTurnEnd,
} from "./cancellation.mjs";

// Codex can steer an active turn through `turn/steer`.
export const CODEX_CAPABILITIES = Object.freeze({
  steer: true,
  queue: true,
  interrupt: true,
  resume: true,
  approvals: true,
  approvalOptions: ["allow-once", "deny"],
  models: true,
  liveModelChange: true,
  modelChangeApplies: "next-turn",
  subagents: false,
  subagentsReason:
    "Codex app-server reports no subagent attribution on its items.",
  toolOutput: "streamed",
});
export class CodexAdapter {
  constructor({ emit, onRequest, command = "codex", args = [] }) {
    this.emit = emit;
    this.onRequest = onRequest;
    this.command = command;
    this.args = args;
    this.pending = new Map();
    this.nextId = 1;
    this.requests = new Map();
    this.observations = 0;
    this.interruption = null;
    this.capabilities = CODEX_CAPABILITIES;
  }
  async start(options) {
    this.options = options;
    const config = options.mcpUrl
      ? ["-c", `mcp_servers.nupp_plans.url=${JSON.stringify(options.mcpUrl)}`]
      : [];
    this.proc = spawn(
      this.command,
      [...this.args, "app-server", "--listen", "stdio://", ...config],
      { cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"] },
    );
    this.proc.on("error", (error) => this.crash(error));
    this.proc.stderr.on("data", (chunk) =>
      this.emit("provider.log", { text: chunk.toString().slice(0, 12000) }),
    );
    this.proc.on("exit", (code, signal) => {
      if (!this.closing)
        this.crash(Error(`Codex process exited (${code ?? signal}).`));
    });
    this.lines = readline.createInterface({ input: this.proc.stdout });
    this.lines.on("line", (line) => {
      try {
        this.receive(JSON.parse(line));
      } catch (error) {
        this.emit("provider.error", { message: error.message });
      }
    });
    await this.rpc("initialize", {
      clientInfo: {
        name: "aicommander",
        title: "AICommander",
        version: "2.0.0",
      },
      capabilities: { experimentalApi: true },
    });
    this.write({ method: "initialized" });
    if (options.catalogOnly) {
      const result = await this.rpc("model/list", { limit: 100 });
      return (result.data || []).map((m) => ({
        id: m.id || m.model,
        label: m.displayName || m.model || m.id,
        description: m.description || "",
        isDefault: Boolean(m.isDefault),
        reasoningEfforts: m.supportedReasoningEfforts || [],
      }));
    }
    const params = {
      ...(options.resumeId
        ? { threadId: options.resumeId }
        : { cwd: options.cwd }),
      ...codexApprovals(options.approvalMode),
      sandbox: options.mode !== "implement" ? "read-only" : "workspace-write",
      ...(options.model ? { model: options.model } : {}),
    };
    const result = await this.rpc(
      options.resumeId ? "thread/resume" : "thread/start",
      params,
    );
    this.threadId = result.thread.id;
    this.model = result.model || options.model;
    this.emit("session", {
      providerSessionId: this.threadId,
      model: this.model,
    });
    if (options.prompt) await this.send(options.prompt, "start");
    return this;
  }
  write(value) {
    if (!this.proc?.stdin.writable) fail("Codex process is disconnected.", 409);
    this.proc.stdin.write(JSON.stringify(value) + "\n");
  }
  rpc(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("Codex request timed out: " + method));
      }, 60000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  receive(message) {
    const observation = ++this.observations;
    if (message.id !== undefined && !message.method) {
      const p = this.pending.get(message.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(message.id);
        if (message.error) p.reject(Error(message.error.message));
        else p.resolve(message.result);
      }
      return;
    }
    const p = message.params || {};
    if (message.id !== undefined) {
      const id = String(message.id),
        kind = /requestUserInput|elicitation/.test(message.method)
          ? "input"
          : "approval";
      this.requests.set(id, {
        id: message.id,
        method: message.method,
        params: p,
      });
      this.onRequest({
        providerRequestId: id,
        kind,
        method: message.method,
        payload: p,
      });
      return;
    }
    if (message.method === "turn/started") {
      this.turnId = p.turn.id;
      this.emit("state", { state: "running", turnId: this.turnId });
    } else if (message.method === "turn/completed") {
      this.turnId = null;
      const providerState =
        p.turn.status === "completed"
          ? "completed"
          : p.turn.status === "interrupted"
            ? "interrupted"
            : "failed";
      const diagnostic =
        typeof p.turn.error === "string"
          ? p.turn.error
          : p.turn.error
            ? p.turn.error.message || JSON.stringify(p.turn.error)
            : null;
      const outcome = classifyTurnEnd({
        interruption: this.interruption,
        providerState,
        isError: providerState === "failed",
        diagnostic,
        observation,
      });
      this.interruption = null;
      this.emit("turn.completed", { ...outcome, providerStatus: p.turn.status });
    } else if (message.method === "item/agentMessage/delta")
      this.emit("message.delta", { text: p.delta || "", itemId: p.itemId });
    else if (
      message.method === "item/completed" &&
      p.item?.type === "agentMessage"
    )
      this.emit("message", { text: p.item.text || "", itemId: p.item.id });
    else if (
      [
        "item/started",
        "item/completed",
        "item/commandExecution/outputDelta",
      ].includes(message.method)
    )
      this.emit("tool.activity", { method: message.method, ...p });
    else if (message.method === "serverRequest/resolved")
      this.emit("request.resolved", { providerRequestId: String(p.requestId) });
    else if (message.method === "thread/tokenUsage/updated")
      this.emit("usage", { ...p, model: this.model });
    else if (message.method === "error")
      this.emit("provider.error", {
        message: p.error?.message || JSON.stringify(p),
      });
  }
  async send(text, mode = "steer") {
    if (mode !== "steer" || !this.turnId) this.interruption = null;
    if (mode === "steer" && this.turnId)
      return this.rpc("turn/steer", {
        threadId: this.threadId,
        expectedTurnId: this.turnId,
        input: [{ type: "text", text }],
      });
    if (this.turnId)
      fail("The active turn must finish before a new turn starts.", 409);
    const result = await this.rpc("turn/start", {
      threadId: this.threadId,
      ...codexApprovals(this.options.approvalMode),
      input: [{ type: "text", text }],
    });
    this.turnId = result.turn.id;
    return { turnId: this.turnId };
  }
  async setApprovalMode(value) {
    await this.rpc("thread/settings/update", {
      threadId: this.threadId,
      ...codexApprovals(value),
    });
    this.options.approvalMode = value;
    return { applies: "next-turn" };
  }
  async interrupt(reason = "client-cancel") {
    if (!this.turnId)
      return {
        requested: true,
        acknowledged: true,
        noActiveTurn: true,
        requestedAt: new Date().toISOString(),
      };
    this.interruption = requestInterruption(this.observations, reason);
    const turnId = this.turnId;
    await this.rpc("turn/interrupt", { threadId: this.threadId, turnId });
    acknowledgeInterruption(this.interruption, {
      api: "codex turn/interrupt",
      turnId,
    });
    return {
      requested: true,
      acknowledged: true,
      turnId,
      requestedAt: this.interruption.requestedAt,
      acknowledgedAt: this.interruption.acknowledgedAt,
    };
  }
  async setModel(model) {
    await this.rpc("thread/settings/update", {
      threadId: this.threadId,
      model,
    });
    this.model = model;
    this.options.model = model;
    // Codex applies thread settings from the next turn onward.
    return { applies: "next-turn", api: "codex thread/settings/update", model };
  }
  async answer({ providerRequestId, decision, answers }) {
    const request = this.requests.get(providerRequestId);
    if (!request) fail("This provider request is no longer pending.", 409);
    let result;
    if (/requestUserInput/.test(request.method))
      result = { answers: answers || {} };
    else if (/elicitation/.test(request.method))
      result = {
        action: decision === "allow" ? "accept" : "decline",
        content: answers || null,
      };
    else if (request.method === "item/permissions/requestApproval")
      result = {
        permissions: decision === "allow" ? request.params.permissions : {},
        scope: "turn",
      };
    else if (/requestApproval/.test(request.method))
      result = { decision: decision === "allow" ? "accept" : "decline" };
    else fail("Unsupported provider request " + request.method);
    this.write({ id: request.id, result });
    this.requests.delete(providerRequestId);
    return { accepted: true };
  }
  crash(error) {
    if (this.failed) return;
    this.failed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.emit("disconnected", { message: error.message });
  }
  async close() {
    this.closing = true;
    this.lines?.close();
    this.proc?.stdin.end();
    this.proc?.kill("SIGTERM");
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("Session closed."));
    }
    this.pending.clear();
  }
}
