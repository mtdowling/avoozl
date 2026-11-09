import { resolveTaskId } from "../task-identity.mjs";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { activityState } from "../activity.mjs";
import { applyActivity } from "../activity.mjs";
import { queryTasks } from "../query.mjs";
import { fail, canonical } from "./store.mjs";
import { digest } from "../model.mjs";
import { PLAN_FORMAT } from "./plans.mjs";
import { createWorktree, assertProjectAvailable } from "./git.mjs";
import { CodexAdapter } from "./providers/codex.mjs";
import { ClaudeAdapter, claudeModels } from "./providers/claude.mjs";
import { approvalMode } from "./approvals.mjs";
import { recordUsage } from "./telemetry.mjs";
const exec = promisify(execFile),
  ACTIVE = new Set([
    "starting",
    "running",
    "waiting-input",
    "waiting-approval",
  ]);
export class RunManager {
  constructor(
    store,
    { factories = {}, baseUrl = "http://127.0.0.1:9428", recover = true } = {},
  ) {
    this.store = store;
    this.baseUrl = baseUrl;
    this.factories = {
      codex: (opts) => new CodexAdapter(opts),
      claude: (opts) => new ClaudeAdapter(opts),
      ...factories,
    };
    this.live = new Map();
    this.tails = new Map();
    this.activityTimer = setInterval(
      () => {
        for (const run of store
          .list("runs")
          .filter((r) => ACTIVE.has(r.state) && this.live.has(r.id))) {
          this.reportActivity(run, "heartbeat");
          store.put("runs", run);
        }
      },
      10 * 60 * 1000,
    );
    this.activityTimer.unref();
    if (recover)
      for (const run of store.list("runs"))
        if (ACTIVE.has(run.state)) {
          run.state = "disconnected";
          run.disconnectedAt = new Date().toISOString();
          store.put("runs", run);
          for (const r of store
            .list("requests")
            .filter((r) => r.runId === run.id && r.state === "pending")) {
            r.state = "interrupted";
            store.put("requests", r);
          }
          for (const d of store
            .list("deliveries")
            .filter((d) => d.runId === run.id && d.state === "sending")) {
            d.state = "uncertain";
            store.put("deliveries", d);
          }
          store.event(run.id, "run.recovered", {
            state: "disconnected",
            lastObservedAt: run.lastObservedAt,
            message:
              "Agent host restarted. Resume explicitly; pending prompts are not resent.",
          });
        }
  }
  checkpoint(run) {
    if (!run.handoffPath) return;
    const data = this.store.read(),
      task = data.tasks.find((t) => t.id === resolveTaskId(data, run.taskId)),
      handoff = {
        version: 1,
        at: new Date().toISOString(),
        run,
        task,
        plan: run.planId ? this.store.get("plans", run.planId) : null,
        pendingRequests: this.store
          .list("requests")
          .filter((r) => r.runId === run.id && r.state === "pending"),
        deliveries: this.store
          .list("deliveries")
          .filter((d) => d.runId === run.id),
        reconnect:
          "The agent host outlives web reloads. If MCP is temporarily unavailable, continue only already authorized local work. Retry with backoff, reuse submission IDs, and read existing receipts before resending uncertain commands. Pause at approval boundaries. Never start duplicate workers because a check-in is stale. If recovery is needed, inspect this handoff and the worktree before continuing.",
      };
    fs.mkdirSync(path.dirname(run.handoffPath), { recursive: true });
    fs.writeFileSync(
      run.handoffPath + ".pending",
      JSON.stringify(handoff, null, 2),
      { mode: 0o600 },
    );
    fs.renameSync(run.handoffPath + ".pending", run.handoffPath);
  }
  reportActivity(run, action) {
    if (run.mode !== "implement") return;
    const data = structuredClone(this.store.read()),
      task = data.tasks.find((t) => t.id === resolveTaskId(data, run.taskId));
    if (!task) return;
    if (
      action === "start" &&
      task.activity?.state === "active" &&
      task.activity.sessionId === run.id
    ) {
      if (activityState(task) === "active") return;
      action = "heartbeat";
    }
    if (
      action === "start" &&
      task.activity?.sessionId !== run.id &&
      ["active", "stale", "paused"].includes(activityState(task))
    )
      fail(
        "Another reported session owns this task. Coordinate before continuing.",
        409,
      );
    try {
      const result = applyActivity(data, {
        id: task.id,
        action,
        owner: run.provider + " · " + run.id,
        sessionId: run.id,
        leaseId: run.activityLeaseId,
        branch: run.branch,
        worktree: run.worktree,
        summary:
          action === "finish"
            ? "Agent turn ended; implementation and acceptance require evidence."
            : "Agent session connected through Avoozl.",
      });
      run.activityLeaseId = result.activity.leaseId;
      this.store.transaction(() => this.store.commit(data, "Report " + run.id));
    } catch (error) {
      this.store.event(run.id, "activity.conflict", { message: error.message });
      if (action === "start") throw error;
    }
  }
  async providers() {
    return Promise.all(
      ["codex", "claude"].map(async (id) => {
        try {
          if (id === "codex") {
            await exec("codex", ["--version"], { timeout: 5000 });
            return {
              id,
              available: true,
              capabilities: {
                steer: true,
                queue: true,
                interrupt: true,
                resume: true,
                approvals: true,
              },
              authentication: "Checked when starting a session",
            };
          }
          await import("@anthropic-ai/claude-agent-sdk");
          return {
            id,
            available: true,
            capabilities: {
              steer: false,
              queue: true,
              interrupt: true,
              resume: true,
              approvals: true,
            },
            authentication: "Checked when starting a session",
          };
        } catch (error) {
          return {
            id,
            available: false,
            reason:
              id === "claude"
                ? "Install the official Claude Agent SDK."
                : "Install Codex CLI.",
          };
        }
      }),
    );
  }
  async models(provider) {
    if (!["codex", "claude"].includes(provider))
      fail("Choose Claude or Codex.");
    this.modelCatalogs ??= new Map();
    const cached = this.modelCatalogs.get(provider);
    if (cached && Date.now() - cached.at < 300000) return cached.value;
    let models;
    if (provider === "claude") models = await claudeModels();
    else {
      const adapter = new CodexAdapter({ emit: () => {}, onRequest: () => {} });
      try {
        models = await adapter.start({ cwd: process.cwd(), catalogOnly: true });
      } finally {
        await adapter.close();
      }
    }
    const value = {
      provider,
      models,
      source: "provider catalog",
      access: "Model access is checked by the provider when the run starts.",
    };
    this.modelCatalogs.set(provider, { at: Date.now(), value });
    return value;
  }
  serialize(id, fn) {
    const previous = this.tails.get(id) || Promise.resolve(),
      next = previous.catch(() => {}).then(fn);
    this.tails.set(id, next);
    return next.finally(() => {
      if (this.tails.get(id) === next) this.tails.delete(id);
    });
  }
  context(run) {
    const data = this.store.read(),
      task = data.tasks.find((t) => t.id === resolveTaskId(data, run.taskId)),
      plan = run.planId ? this.store.get("plans", run.planId) : null;
    const docIds = new Set([
        task?.source?.document,
        ...(task?.contextDocuments || []),
      ]),
      documents = [...docIds]
        .filter(Boolean)
        .map((id) => data.documents[id])
        .filter(Boolean)
        .map((d) => ({
          id: d.id,
          title: d.title,
          text: d.text.slice(0, 20000),
          truncated: d.text.length > 20000,
        }));
    return [
      "You are working through the Avoozl workspace. Follow workspace and repository instructions. Preserve other workers and worktrees. Routine authorized work may proceed; approval requests are delivered to the user through this app. Do not approve plans, accept tasks, or merge changes on the user's behalf through MCP. Agent and subagent reconnect contract: the agent host survives UI/API reloads. If MCP is unavailable, continue already authorized local work, retry with bounded backoff, reuse submission IDs and inspect receipts before resending. Stop at unresolved approvals. A stale check-in is not permission to replace a worker. Pass this contract to any subagents you create. Durable handoff: " +
        run.handoffPath,
      run.mode === "plan"
        ? PLAN_FORMAT
        : run.prompt?.startsWith("NUPP_PROMPT_SEARCH")
          ? "Interpret the search using read-only plans tools. Do not create visualizations or change records. Return only the requested JSON search object."
          : run.mode === "ask"
            ? "Answer the question from the supplied context and read-only repository inspection. Use plans_visualize or plans_present to show useful breakouts in the UI. Do not change source or task acceptance."
            : "Implement the task, run the relevant checks, format and commit changes using repository conventions. Do not merge or push; validation and integration are separate workspace actions.",
      JSON.stringify({
        viewContext: run.context,
        task,
        plan,
        documents,
        dependencies: task
          ? data.edges.filter((e) => e.from === task.id || e.to === task.id)
          : [],
        handoff: run.handoff || null,
      }),
      run.prompt || "",
    ].join("\n\n");
  }
  async start(input) {
    if (this.draining)
      fail("Agent host is draining. Retry after the update.", 503);
    const selectedApprovalMode = approvalMode(input.approvalMode);
    const id = input.id || "run-" + randomUUID().slice(0, 12),
      requestHash = digest(canonical(input));
    if (!/^[a-z][a-z0-9-]{2,80}$/.test(id)) fail("Invalid run ID.");
    const existing = this.store.get("runs", id);
    if (existing) {
      if (existing.requestHash !== requestHash)
        fail("Run ID already belongs to another request.", 409);
      return existing;
    }
    if (!this.factories[input.provider]) fail("Choose Claude or Codex.");
    const project = this.store.get("projects", input.projectId);
    if (!project) fail("Configure a project before starting an agent.");
    const task = this.store
        .read()
        .tasks.find(
          (t) => t.id === resolveTaskId(this.store.read(), input.taskId),
        ),
      plan = input.planId ? this.store.get("plans", input.planId) : null;
    if (!task && !plan && !(input.mode === "ask" && input.prompt?.trim()))
      fail("Select a task or draft plan.");
    if (
      task &&
      input.mode !== "ask" &&
      !queryTasks(this.store.read(), { scope: "all", q: "ready:true" }).some(
        (t) => t.id === task.id,
      )
    )
      fail(
        "Resolve this task’s prerequisites or review state before execution.",
        409,
      );
    if (
      task &&
      input.mode !== "ask" &&
      ["active", "stale", "paused"].includes(activityState(task))
    )
      fail(
        "This task has an existing reported session. Coordinate with its owner before starting.",
        409,
      );
    const resources = [
      ...new Set([...(task?.resources || []), ...(input.resources || [])]),
    ];
    const run = {
      id,
      requestHash,
      taskId: task?.id || (plan ? "plan:" + plan.id : "conversation:" + id),
      planId: plan?.id,
      projectId: project.id,
      provider: input.provider,
      approvalMode: selectedApprovalMode,
      model: input.model || undefined,
      requestedModel: input.model || null,
      mode: input.mode === "ask" ? "ask" : plan ? "plan" : "implement",
      prompt: input.prompt || "",
      title:
        input.title ||
        input.prompt?.split("\n")[0].slice(0, 160) ||
        task?.title ||
        plan?.title,
      context: input.context || {},
      resources,
      state: "starting",
      createdAt: new Date().toISOString(),
    };
    // Claim under a database lock before creating a worktree or launching a process.
    this.store.transaction(() => {
      assertProjectAvailable(this.store, project.id);
      const conflict =
        run.mode !== "ask" &&
        this.store
          .list("runs")
          .find(
            (r) =>
              r.mode !== "ask" &&
              [...ACTIVE, "disconnected"].includes(r.state) &&
              (resolveTaskId(this.store.read(), r.taskId) === run.taskId ||
                (r.projectId === project.id &&
                  (r.resources || []).some((x) => resources.includes(x)))),
          );
      if (conflict) fail("Conflicts with active run " + conflict.id, 409);
      this.store.put("runs", run);
      this.store.event(id, "run.created", { run });
    });
    const launch = async () => {
      try {
        Object.assign(
          run,
          run.mode === "ask"
            ? { worktree: project.root, readOnly: true }
            : await createWorktree(project, id),
        );
        run.handoffPath = path.join(
          path.dirname(path.resolve(this.store.filename)),
          "handoffs",
          id + ".json",
        );
        this.reportActivity(run, "start");
        this.checkpoint(run);
        this.store.put("runs", run);
        await this.connect(run, this.context(run));
        return this.store.get("runs", id);
      } catch (error) {
        run.state = "failed";
        run.error = error.message;
        this.reportActivity(run, "finish");
        this.store.put("runs", run);
        this.checkpoint(run);
        this.store.event(id, "run.failed", { message: error.message });
        throw error;
      }
    };
    if (input.background) {
      launch().catch(() => {});
      return this.store.get("runs", id);
    }
    return launch();
  }
  async connect(run, prompt) {
    const adapter = this.factories[run.provider]({
      emit: (kind, body) => this.receive(run.id, kind, body),
      onRequest: (request) => this.request(run.id, request),
    });
    this.live.set(run.id, adapter);
    try {
      await adapter.start({
        cwd: run.worktree,
        mode: run.mode,
        model: run.model,
        approvalMode: approvalMode(run.approvalMode, "manual"),
        prompt,
        resumeId: run.providerSessionId,
        mcpUrl: this.baseUrl + "/mcp?run=" + encodeURIComponent(run.id),
      });
      const latest = this.store.get("runs", run.id);
      if (latest.state === "starting") {
        latest.state = "running";
        this.store.put("runs", latest);
      }
      return adapter;
    } catch (error) {
      this.live.delete(run.id);
      await adapter.close().catch(() => {});
      throw error;
    }
  }
  receive(id, kind, body) {
    const run = this.store.get("runs", id);
    if (!run) return;
    run.lastObservedAt = new Date().toISOString();
    if (kind === "session") {
      run.providerSessionId = body.providerSessionId;
      if (body.model) run.actualModel = body.model;
    }
    if (kind === "usage") recordUsage(this.store, run, body);
    if (kind === "approvals.status") {
      run.effectiveApprovalMode = body.effectiveApprovalMode;
      run.approvalNotice = body.approvalNotice;
    }
    if (kind === "state") run.state = body.state;
    if (kind === "turn.completed") {
      run.state = body.state;
      run.error = body.error;
      run.updatedAt = new Date().toISOString();
      this.reportActivity(run, "finish");
    }
    if (kind === "disconnected") {
      run.state = "disconnected";
      run.error = body.message;
      this.live.delete(id);
    }
    if (kind === "request.resolved")
      for (const r of this.store
        .list("requests")
        .filter(
          (r) =>
            r.runId === id &&
            r.providerRequestId === body.providerRequestId &&
            r.state === "pending",
        )) {
        r.state = "resolved";
        this.store.put("requests", r);
      }
    this.store.put("runs", run);
    this.store.event(id, kind, body);
    if (["session", "turn.completed", "disconnected"].includes(kind))
      this.checkpoint(run);
    this.onEvent?.(id, kind, body);
    if (kind === "turn.completed")
      this.drain(id).catch((error) =>
        this.store.event(id, "delivery.error", { message: error.message }),
      );
  }
  request(id, request) {
    const run = this.store.get("runs", id);
    run.state = request.kind === "input" ? "waiting-input" : "waiting-approval";
    this.store.put("runs", run);
    const record = {
      ...request,
      id: "request-" + randomUUID(),
      runId: id,
      state: "pending",
      createdAt: new Date().toISOString(),
    };
    this.store.put("requests", record);
    this.store.event(id, "request.created", { request: record });
  }
  async send(input) {
    return this.serialize(input.id, async () => {
      const run = this.store.get("runs", input.id);
      if (!run) fail("Run not found.", 404);
      if (
        typeof input.text !== "string" ||
        !input.text.trim() ||
        input.text.length > 100000
      )
        fail("Write a message.");
      if (!input.submissionId || typeof input.submissionId !== "string")
        fail("A message submission ID is required.");
      if (run.state === "integrated")
        fail(
          "This worktree has landed. Create a follow-up task or a new read-only conversation.",
          409,
        );
      const previous = this.store.get("deliveries", input.submissionId);
      if (previous) {
        if (previous.runId !== run.id || previous.text !== input.text)
          fail("Submission ID belongs to another message.", 409);
        return previous;
      }
      const mode = input.mode || "queue";
      if (!["queue", "steer"].includes(mode)) fail("Choose queue or steer.");
      if (mode === "steer" && this.draining)
        fail("Agent host is draining. Retry steering after the update.", 503);
      if (mode === "steer" && run.provider !== "codex")
        fail(
          "Claude follow-ups queue; use Interrupt, then send, to redirect immediately.",
        );
      const delivery = {
        id: input.submissionId,
        runId: run.id,
        text: input.text,
        mode,
        state: "queued",
        createdAt: new Date().toISOString(),
      };
      this.store.put("deliveries", delivery);
      this.store.event(run.id, "delivery.queued", { delivery });
      if (!this.draining && (mode === "steer" || !ACTIVE.has(run.state)))
        await this.deliver(run, delivery);
      return this.store.get("deliveries", delivery.id);
    });
  }
  async deliver(run, delivery) {
    let adapter = this.live.get(run.id);
    if (!adapter && run.providerSessionId && !this.draining) {
      try {
        await this.connect(run, undefined);
        adapter = this.live.get(run.id);
      } catch (error) {
        delivery.error = error.message;
      }
    }
    if (!adapter) {
      delivery.state = "awaiting-resume";
      run.state = "disconnected";
      this.store.put("runs", run);
      this.store.put("deliveries", delivery);
      this.store.event(run.id, "delivery.updated", { delivery });
      return;
    }
    delivery.state = "sending";
    this.store.put("deliveries", delivery);
    try {
      this.reportActivity(run, "start");
      const result = await adapter.send(delivery.text, delivery.mode);
      delivery.state = run.provider === "codex" ? "accepted" : "submitted";
      delivery.receipt = result;
      delivery.sentAt = new Date().toISOString();
      run.state = "running";
      this.store.put("runs", run);
    } catch (error) {
      delivery.state = "uncertain";
      delivery.error = error.message;
    }
    this.store.put("deliveries", delivery);
    this.store.event(run.id, "delivery.updated", { delivery });
  }
  async drain(id) {
    return this.serialize(id, async () => {
      if (this.draining) return;
      const run = this.store.get("runs", id);
      if (!run || ACTIVE.has(run.state)) return;
      const next = this.store
        .list("deliveries")
        .reverse()
        .find((d) => d.runId === id && d.state === "queued");
      if (next) await this.deliver(run, next);
    });
  }
  async approvals(input) {
    return this.serialize(input.id, async () => {
      const run = this.store.get("runs", input.id);
      if (!run) fail("Run not found.", 404);
      if (run.external)
        fail("External transcripts have no permission controls.", 409);
      const mode = approvalMode(input.approvalMode),
        adapter = this.live.get(run.id);
      let result = { applies: "on-resume" };
      if (adapter) {
        if (!adapter.setApprovalMode)
          fail(
            "This provider connection must be resumed before changing approvals.",
            409,
          );
        result = await adapter.setApprovalMode(mode);
      }
      const latest = this.store.get("runs", run.id);
      latest.approvalMode = mode;
      this.store.put("runs", latest);
      this.store.event(run.id, "approvals.changed", {
        approvalMode: mode,
        ...result,
      });
      this.checkpoint(latest);
      return {
        ...result,
        approvalMode: mode,
        pendingApprovals: this.store
          .list("requests")
          .filter(
            (r) =>
              r.runId === run.id &&
              r.kind === "approval" &&
              r.state === "pending",
          ).length,
      };
    });
  }
  async interrupt(id) {
    const run = this.store.get("runs", id),
      adapter = this.live.get(id);
    if (!run || !adapter) fail("Run is disconnected.", 409);
    await adapter.interrupt();
    this.store.event(id, "interrupt.requested", {});
    return { requested: true };
  }
  async resume(input) {
    return this.serialize(input.id, async () => {
      const run = this.store.get("runs", input.id);
      if (!run) fail("Run not found.", 404);
      if (this.live.has(run.id)) return run;
      if (!run.providerSessionId)
        fail(
          "No provider session was recorded. Start a new run with this handoff.",
        );
      if (this.draining)
        fail("Agent host is draining. Retry after the update.", 503);
      if (run.state === "integrated")
        fail(
          "This worktree has landed. Start a new run with the task handoff.",
          409,
        );
      if (input.provider && input.provider !== run.provider)
        fail(
          "Switch providers by starting a new run with the task handoff; provider session IDs are not interchangeable.",
        );
      run.state = "starting";
      this.store.put("runs", run);
      await this.connect(
        run,
        input.text ||
          "Continue from the saved session. Inspect the current task and worktree before changing anything.",
      );
      return this.store.get("runs", run.id);
    });
  }
  async answer(input) {
    const request = this.store.get("requests", input.id);
    if (!request || request.state !== "pending")
      fail("Request is no longer pending.", 409);
    if (!["allow", "deny"].includes(input.decision))
      fail("Choose allow or deny.");
    const adapter = this.live.get(request.runId);
    if (!adapter) fail("Session disconnected; resume before answering.", 409);
    await adapter.answer({ ...request, ...input });
    request.state = input.decision === "allow" ? "allowed" : "denied";
    request.answeredAt = new Date().toISOString();
    this.store.put("requests", request);
    const run = this.store.get("runs", request.runId);
    run.state = "running";
    this.store.put("runs", run);
    this.store.event(run.id, "request.answered", { request });
    return request;
  }
  async close() {
    clearInterval(this.activityTimer);
    for (const adapter of this.live.values()) await adapter.close();
    this.live.clear();
  }
  async landed(id) {
    const adapter = this.live.get(id);
    if (adapter) await adapter.close();
    this.live.delete(id);
    const run = this.store.get("runs", id);
    if (run) {
      run.state = "integrated";
      this.store.put("runs", run);
    }
  }
}
