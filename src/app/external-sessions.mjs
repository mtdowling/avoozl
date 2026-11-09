import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { digest } from "../model.mjs";
import { fail } from "./store.mjs";

export const transcriptCapabilities = Object.freeze({
  transcript: true,
  queue: false,
  steer: false,
  interrupt: false,
  resume: false,
  approvals: false,
});
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const bounded = (n, max = 200) => Math.max(1, Math.min(max, Number(n) || max));
export class ExternalSessions {
  constructor(store, { sdk } = {}) {
    this.store = store;
    this.sdkFactory = sdk;
    this.cache = new Map();
    this.pending = new Map();
  }
  async sdk() {
    return this.sdkFactory || import("@anthropic-ai/claude-agent-sdk");
  }
  task(id) {
    const task = this.store.read().tasks.find((t) => t.id === id);
    if (!task) fail("Task not found.", 404);
    return task;
  }
  roots(task) {
    return [
      ...new Set(
        [
          task.activity?.worktree,
          ...this.store.list("projects").map((p) => p.root),
        ]
          .filter(Boolean)
          .map((p) => path.resolve(p)),
      ),
    ];
  }
  allowed(task, cwd) {
    return (
      typeof cwd === "string" &&
      this.roots(task).some(
        (root) => cwd === root || cwd.startsWith(root + path.sep),
      )
    );
  }
  async discover({ taskId, offset = 0, limit = 40, providerSessionId } = {}) {
    const task = this.task(taskId),
      sdk = await this.sdk(),
      roots = this.roots(task);
    if (!roots.length)
      fail(
        "Record this task’s worktree or configure a project before linking sessions.",
      );
    if (providerSessionId) {
      if (!uuid.test(providerSessionId))
        fail("Use the actual Claude session UUID.");
      const info = await sdk.getSessionInfo(providerSessionId);
      if (!info || !this.allowed(task, info.cwd))
        fail("Session not found in this task’s configured projects.", 404);
      const all = await sdk.listSubagents(providerSessionId, { dir: info.cwd }),
        start = Math.max(0, Number(offset) || 0),
        size = bounded(limit, 40);
      return {
        items: [],
        subagents: all.slice(start, start + size),
        offset: start,
        limit: size,
        hasMore: start + size < all.length,
      };
    }
    const pages = await Promise.all(
      roots.map((dir) =>
        sdk.listSessions({
          dir,
          offset: Math.max(0, Number(offset) || 0),
          limit: bounded(limit, 40),
        }),
      ),
    );
    const items = [
      ...new Map(
        pages
          .flat()
          .filter((s) => this.allowed(task, s.cwd))
          .map((s) => [s.sessionId, s]),
      ).values(),
    ]
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, bounded(limit, 40))
      .map((s) => ({
        provider: "claude",
        providerSessionId: s.sessionId,
        title: s.customTitle || s.summary || s.sessionId,
        worktree: s.cwd,
        branch: s.gitBranch,
        lastModified: s.lastModified,
      }));
    return {
      items,
      offset: Math.max(0, Number(offset) || 0),
      limit: bounded(limit, 40),
      hasMore: pages.some((p) => p.length >= bounded(limit, 40)),
    };
  }
  async register(input) {
    if (input.provider !== "claude")
      fail(
        "External transcript attachment currently supports Claude. Managed Claude and Codex runs already connect automatically.",
      );
    if (input.machine && input.machine !== os.hostname())
      fail(
        "This transcript is on another machine. Register through the workspace on that machine.",
      );
    if (!uuid.test(input.providerSessionId || ""))
      fail("Use the actual Claude session UUID, not an agent nickname.");
    if (
      input.agentId !== undefined &&
      !/^[a-zA-Z0-9_-]{1,120}$/.test(input.agentId)
    )
      fail("Invalid Claude subagent ID.");
    const task = this.task(input.taskId);
    if (!task.activity || task.activity.leaseId !== input.leaseId)
      fail(
        "The activity lease changed. Read the task before linking its session.",
        409,
      );
    const sdk = await this.sdk(),
      info = await sdk.getSessionInfo(input.providerSessionId);
    if (!info || !this.allowed(task, info.cwd))
      fail("Session not found in this task’s configured projects.", 404);
    if (
      input.agentId &&
      !(
        await sdk.listSubagents(input.providerSessionId, { dir: info.cwd })
      ).includes(input.agentId)
    )
      fail("Subagent transcript not found in this session.", 404);
    const id =
        "external-" +
        digest(
          [
            input.taskId,
            input.provider,
            input.providerSessionId,
            input.agentId || "",
          ].join(":"),
        ).slice(0, 24),
      now = new Date().toISOString();
    return this.store.transaction(() => {
      const current = this.task(input.taskId);
      if (current.activity?.leaseId !== input.leaseId)
        fail(
          "The activity lease changed. Read the task before linking its session.",
          409,
        );
      const old = this.store.get("runs", id);
      if (old && !old.deletedAt && current.activity.connection?.runId === id)
        return old;
      const run = {
        ...old,
        id,
        taskId: task.id,
        provider: "claude",
        providerSessionId: input.providerSessionId,
        agentId: input.agentId || undefined,
        parentSessionId: input.agentId ? input.providerSessionId : undefined,
        machine: os.hostname(),
        worktree: info.cwd,
        branch: info.gitBranch,
        title: task.title,
        mode: "observe",
        state: "observing",
        external: true,
        capabilities: { ...transcriptCapabilities },
        createdAt: old?.createdAt || now,
        registeredAt: now,
      };
      delete run.deletedAt;
      const data = structuredClone(this.store.read()),
        target = data.tasks.find((t) => t.id === task.id);
      target.activity.connection = {
        runId: id,
        provider: run.provider,
        providerSessionId: run.providerSessionId,
        agentId: run.agentId,
        machine: run.machine,
        registeredAt: now,
      };
      this.store.put("runs", run);
      this.store.commit(data, "Link external session for " + task.id);
      this.store.event(id, "session.linked", {
        providerSessionId: run.providerSessionId,
        agentId: run.agentId,
      });
      return run;
    });
  }
  async messages(run) {
    const sdk = await this.sdk(),
      info = await sdk.getSessionInfo(run.providerSessionId, {
        dir: run.worktree,
      });
    if (!info)
      fail("Claude transcript is no longer available on this machine.", 404);
    // Subagent writes do not necessarily change their parent's metadata. Only an
    // open transcript polls; idle parent sessions reuse their SDK result.
    let signature = info.lastModified + ":" + info.fileSize;
    if (run.agentId) {
      try {
        const file = path.join(
            process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"),
            "projects",
            run.worktree.replace(/[^a-zA-Z0-9]/g, "-"),
            run.providerSessionId,
            "subagents",
            "agent-" + run.agentId + ".jsonl",
          ),
          stat = await fs.stat(file);
        signature = stat.mtimeMs + ":" + stat.size;
      } catch {
        signature = Math.floor(Date.now() / 5000);
      }
    }
    const cached = this.cache.get(run.id);
    if (cached?.signature === signature) return cached;
    if (this.pending.has(run.id)) return this.pending.get(run.id);
    const pending = (async () => {
      const all = run.agentId
        ? await sdk.getSubagentMessages(run.providerSessionId, run.agentId, {
            dir: run.worktree,
          })
        : await sdk.getSessionMessages(run.providerSessionId, {
            dir: run.worktree,
          });
      const total = all.length,
        offset = Math.max(0, total - 400),
        result = {
          signature,
          total,
          offset,
          messages: all.slice(offset),
          lastObservedAt: new Date().toISOString(),
        };
      this.cache.delete(run.id);
      this.cache.set(run.id, result);
      while (this.cache.size > 4)
        this.cache.delete(this.cache.keys().next().value);
      return result;
    })();
    this.pending.set(run.id, pending);
    try {
      return await pending;
    } finally {
      this.pending.delete(run.id);
    }
  }
  async get(run, input = {}) {
    const snapshot = await this.messages(run),
      limit = bounded(input.limit),
      end =
        input.before === undefined
          ? snapshot.total
          : Math.min(snapshot.total, Math.max(0, Number(input.before) - 1)),
      start =
        input.after !== undefined
          ? Math.max(0, Number(input.after))
          : Math.max(0, end - limit),
      stop = Math.min(end, start + limit);
    let messages;
    if (start >= snapshot.offset)
      messages = snapshot.messages.slice(
        start - snapshot.offset,
        stop - snapshot.offset,
      );
    else {
      const sdk = await this.sdk(),
        options = { dir: run.worktree, offset: start, limit: stop - start };
      messages =
        stop > start
          ? run.agentId
            ? await sdk.getSubagentMessages(
                run.providerSessionId,
                run.agentId,
                options,
              )
            : await sdk.getSessionMessages(run.providerSessionId, options)
          : [];
    }
    const events = messages.map((m, i) => {
      const content = m.message?.content,
        blocks = Array.isArray(content) ? content : [],
        text =
          typeof content === "string"
            ? content
            : blocks
                .filter((b) => b.type === "text")
                .map((b) => b.text)
                .join("\n");
      return {
        seq: start + i + 1,
        kind: "message",
        role: m.type || m.message?.role,
        text: text.slice(0, 60000),
        messageId: m.uuid,
        tools: blocks
          .filter((b) => ["tool_use", "tool_result"].includes(b.type))
          .slice(0, 20)
          .map((b) => ({
            tool: b.name || "Tool result",
            text: JSON.stringify(b.input ?? b.content ?? "").slice(0, 12000),
          })),
      };
    });
    return {
      ...run,
      lastObservedAt: snapshot.lastObservedAt,
      events,
      hasEarlier: start > 0,
      requests: [],
      deliveries: [],
      transcriptTotal: snapshot.total,
    };
  }
}
