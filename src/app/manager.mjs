import { resolveTaskId } from "../task-identity.mjs";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { activityState } from "../activity.mjs";
import { applyActivity } from "../activity.mjs";
import { queryTasks } from "../query.mjs";
import { fail, canonical } from "./store.mjs";
import { digest } from "../model.mjs";
import { PLAN_FORMAT } from "./plans.mjs";
import { createWorktree, assertProjectAvailable } from "./git.mjs";
import { providerModels, providerRegistry } from "./providers/executor.mjs";
import { claudeUsage } from "./providers/claude.mjs";
import {
  mintRunCapability,
  revokeRunCapabilities,
} from "./run-capabilities.mjs";
import { approvalMode } from "./approvals.mjs";
import { recordUsage } from "./telemetry.mjs";
const ACTIVE = new Set([
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
]);
// Provider permission scopes we do not implement yet. Recording them keeps
// "allow once or deny" honest instead of pretending the provider offered
// nothing else.
function providerDecisions(request) {
  const list = request.payload?.availableDecisions;
  if (!Array.isArray(list)) return undefined;
  return list.map((entry) =>
    typeof entry === "string" ? entry : Object.keys(entry)[0] || "unknown",
  );
}
export class RunManager {
  constructor(
    store,
    { factories = {}, baseUrl = "http://127.0.0.1:9428", recover = true } = {},
  ) {
    this.store = store;
    this.baseUrl = baseUrl;
    this.registry = providerRegistry(factories);
    this.factories = Object.fromEntries(
      [...this.registry].map(([id, spec]) => [id, spec.create]),
    );
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
      [...this.registry.values()].map(async (spec) => {
        try {
          return await spec.inspect();
        } catch (error) {
          return {
            id: spec.id,
            label: spec.label,
            available: false,
            capabilities: spec.capabilities,
            reason: error.message,
          };
        }
      }),
    );
  }
  async models(provider) {
    const spec = this.registry.get(provider);
    if (!spec) fail("Choose an available executor.");
    this.modelCatalogs ??= new Map();
    const cached = this.modelCatalogs.get(provider);
    if (cached && Date.now() - cached.at < 300000) return cached.value;
    // Read the catalog through the same factory that will run the session, so
    // a model offered to a client is one that session could actually use.
    const models = await providerModels(spec);
    const value = {
      provider,
      models,
      source: "provider catalog",
      access: "Model access is checked by the provider when the run starts.",
    };
    this.modelCatalogs.set(provider, { at: Date.now(), value });
    return value;
  }
  // Reading plan usage starts a provider session, so it is cached briefly. Only
  // Claude reports a remaining plan allowance; Codex's app-server gives per
  // thread token counts, which is spend, not what is left.
  async usage(provider = "claude") {
    if (!["codex", "claude"].includes(provider)) fail("Choose Claude or Codex.");
    if (provider === "codex")
      return {
        provider: "codex",
        available: false,
        reason:
          "Codex does not report a remaining plan allowance. Its token counts appear under Insights.",
      };
    this.usageReports ??= new Map();
    const cached = this.usageReports.get(provider);
    if (cached && Date.now() - cached.at < 120000) return cached.value;
    let value;
    try {
      value = await claudeUsage();
    } catch (error) {
      value = {
        provider,
        available: false,
        reason: error?.message || "Plan usage could not be read.",
      };
    }
    this.usageReports.set(provider, { at: Date.now(), value });
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
    if (!this.registry.has(input.provider))
      fail("Choose an available executor.");
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
      executor: input.provider,
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
      review: input.review || undefined,
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
            : await createWorktree(this.store, project, id),
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
        revokeRunCapabilities(this.store, run.id);
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
      const { token, capability } = mintRunCapability(this.store, run);
      run.mcpCapability = {
        id: capability.id,
        mode: capability.mode,
        expiresAt: capability.expiresAt,
      };
      this.store.put("runs", run);
      await adapter.start({
        cwd: run.worktree,
        mode: run.mode,
        model: run.model,
        approvalMode: approvalMode(run.approvalMode, "manual"),
        prompt,
        resumeId: run.providerSessionId,
        mcpUrl: this.baseUrl + "/mcp?run=" + encodeURIComponent(run.id),
        mcpToken: token,
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
    if (!this.store.get("runs", id)) return;
    if (body?.providerEventId) {
      return this.store.transaction(() => {
        const inserted = this.store.db
          .prepare(
            "INSERT OR IGNORE INTO provider_events(run_id,provider_event_id,at) VALUES (?,?,?)",
          )
          .run(id, body.providerEventId, new Date().toISOString());
        if (!inserted.changes) return;
        return this.receiveRecorded(id, kind, body);
      });
    }
    return this.receiveRecorded(id, kind, body);
  }
  receiveRecorded(id, kind, body) {
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
      // Only a genuine failure carries an error. An intentional interruption
      // keeps the provider's wording in a separate field so a stopped run is
      // never displayed as a failure and a real failure is never hidden.
      run.error = body.error || undefined;
      run.providerDiagnostic = body.providerDiagnostic || undefined;
      run.cancellation = body.cancellation || undefined;
      if (run.cancellation) {
        const observed = this.store
          .events({ runId: id })
          .filter((event) => event.kind === "interrupt.acknowledged")
          .at(-1);
        if (observed?.spawnedWork)
          run.cancellation = {
            ...run.cancellation,
            spawnedWork: observed.spawnedWork,
          };
      }
      run.interruptRequestedAt = undefined;
      run.updatedAt = new Date().toISOString();
      this.reportActivity(run, "finish");
    }
    if (kind === "disconnected") {
      run.state = "disconnected";
      run.error = body.message;
      this.live.delete(id);
    }
    if (kind === "request.interrupted")
      for (const r of this.store
        .list("requests")
        .filter(
          (r) =>
            r.runId === id &&
            r.providerRequestId === body.providerRequestId &&
            r.state === "pending",
        )) {
        // The request stopped before any decision reached the provider. It is
        // neither allowed nor denied, and the tool never executed.
        r.state = "interrupted";
        r.executed = false;
        r.interruptedReason = body.reason;
        r.resolvedAt = new Date().toISOString();
        this.store.put("requests", r);
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
      // Only the decisions this host can actually deliver are offered. The
      // provider's own list is retained so an unsupported permission scope is
      // visible instead of being silently dropped.
      options:
        request.kind === "approval"
          ? [
              { id: "allow-once", label: "Allow once", kind: "approve" },
              { id: "deny", label: "Deny", kind: "deny" },
            ]
          : undefined,
      providerOptions: providerDecisions(request),
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
      if (
        mode === "steer" &&
        this.registry.get(run.provider)?.capabilities?.steer !== true
      )
        fail(
          this.registry.get(run.provider)?.capabilities?.steerReason ||
            "This executor cannot steer an active turn.",
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
  // The queue is ordered oldest-first unless the user has reordered it. The
  // order lives beside the deliveries so reordering never rewrites or loses a
  // durable delivery record.
  queueOrder(runId) {
    const queued = this.store
      .list("deliveries")
      .reverse()
      .filter((d) => d.runId === runId && d.state === "queued");
    const preferred = this.store.getMeta("queueOrder:" + runId) || [];
    const byId = new Map(queued.map((d) => [d.id, d]));
    const ordered = [];
    for (const id of preferred) {
      const delivery = byId.get(id);
      if (delivery) {
        ordered.push(delivery);
        byId.delete(id);
      }
    }
    // Anything the caller did not name keeps its original relative order, so a
    // stale view can never silently drop a queued message.
    return [...ordered, ...byId.values()];
  }
  async reorderQueue({ id, order }) {
    return this.serialize(id, async () => {
      const run = this.store.get("runs", id);
      if (!run) fail("Run not found.", 404);
      if (!Array.isArray(order) || order.some((v) => typeof v !== "string"))
        fail("Provide the queued submission IDs in their new order.");
      this.store.setMeta("queueOrder:" + id, order);
      const result = this.queueOrder(id).map((d) => d.id);
      this.store.event(id, "queue.reordered", { order: result });
      return { order: result };
    });
  }
  async cancelDelivery({ id, submissionId }) {
    return this.serialize(id, async () => {
      const delivery = this.store.get("deliveries", submissionId);
      if (!delivery) fail("Queued message not found.", 404);
      if (delivery.runId !== id)
        fail("That queued message belongs to another conversation.", 409);
      // Only a message that never reached the provider can be withdrawn.
      // Anything sent, accepted, or uncertain stays on the record.
      if (delivery.state !== "queued")
        fail(
          "This message is already " +
            delivery.state +
            " and cannot be withdrawn.",
          409,
        );
      delivery.state = "canceled";
      delivery.canceledAt = new Date().toISOString();
      this.store.put("deliveries", delivery);
      this.store.event(id, "delivery.updated", { delivery });
      return delivery;
    });
  }
  async drain(id) {
    return this.serialize(id, async () => {
      if (this.draining) return;
      const run = this.store.get("runs", id);
      if (!run || ACTIVE.has(run.state)) return;
      const next = this.queueOrder(id)[0];
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
  async interrupt(id, { reason = "client-cancel" } = {}) {
    const run = this.store.get("runs", id);
    if (!run) fail("Run not found.", 404);
    const adapter = this.live.get(id);
    if (!adapter) fail("Run is disconnected.", 409);
    // Record the intent before asking the provider, so a crash between the
    // two leaves evidence that a stop was requested.
    const requestedAt = new Date().toISOString();
    run.interruptRequestedAt = requestedAt;
    this.store.put("runs", run);
    this.store.event(id, "interrupt.requested", {
      at: requestedAt,
      reason,
      state: run.state,
    });
    let acknowledgment;
    try {
      acknowledgment = (await adapter.interrupt(reason)) || {
        requested: true,
      };
    } catch (error) {
      this.store.event(id, "interrupt.failed", { message: error.message });
      throw error;
    }
    // What the acknowledgment covers. A provider can end its turn without
    // stopping a command it already spawned, so the record says which of the
    // two actually happened rather than implying both.
    const capabilities = adapter.capabilities || {};
    this.store.event(id, "interrupt.acknowledged", {
      ...acknowledgment,
      requestedAt,
      scope: "turn",
      spawnedWork:
        capabilities.interruptStopsSpawnedWork === true
          ? "stopped"
          : capabilities.interruptStopsSpawnedWork === false
            ? "keeps-running"
            : "unknown",
    });
    // The run's terminal state still comes from the provider's own turn end.
    return { ...acknowledgment, requestedAt, runId: id };
  }
  async setModel(input) {
    return this.serialize(input.id, async () => {
      const run = this.store.get("runs", input.id);
      if (!run) fail("Run not found.", 404);
      if (typeof input.model !== "string" || !input.model.trim())
        fail("Choose a model.");
      const catalog = await this.models(run.provider);
      if (!catalog.models.some((m) => m.id === input.model))
        fail("That model is not in the provider catalog for this session.");
      if (ACTIVE.has(run.state) && run.state !== "running")
        fail("Answer the pending request before changing models.", 409);
      const adapter = this.live.get(run.id);
      let result = { applies: "on-resume", model: input.model };
      if (adapter) {
        if (!adapter.setModel)
          fail("This provider connection cannot change models.", 409);
        result = await adapter.setModel(input.model);
      }
      const latest = this.store.get("runs", run.id);
      latest.requestedModel = input.model;
      latest.model = input.model;
      // `actualModel` stays as the provider last reported it until the change
      // takes effect, so requested and effective models remain separable.
      latest.modelChange = {
        requested: input.model,
        previous: run.model || null,
        actual: latest.actualModel || null,
        applies: result.applies,
        at: new Date().toISOString(),
      };
      this.store.put("runs", latest);
      this.store.event(run.id, "model.changed", latest.modelChange);
      this.checkpoint(latest);
      return { ...result, ...latest.modelChange };
    });
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
    if (!request) fail("Request not found.", 404);
    // A client may hold a stale view: the request can already be answered,
    // interrupted by a cancellation, or invalidated by a host restart.
    if (request.state !== "pending")
      fail("This request is no longer pending (" + request.state + ").", 409);
    if (!["allow", "deny"].includes(input.decision))
      fail("Choose allow or deny.");
    // Callers that know which run they are answering must match it, so a
    // mismatched client cannot answer another conversation's request.
    if (input.runId && input.runId !== request.runId)
      fail("This request belongs to another conversation.", 409);
    if (
      input.providerRequestId &&
      String(input.providerRequestId) !== String(request.providerRequestId)
    )
      fail("This request belongs to another provider request.", 409);
    const allowed = (request.options || []).map((o) => o.id);
    if (input.optionId && allowed.length && !allowed.includes(input.optionId))
      fail("That option is not offered for this request.");
    const adapter = this.live.get(request.runId);
    if (!adapter) fail("Session disconnected; resume before answering.", 409);
    return this.serialize("answer:" + request.id, async () => {
      // Re-read inside the serialized section: two clients answering at once
      // must produce exactly one delivery to the provider.
      const current = this.store.get("requests", request.id);
      if (!current || current.state !== "pending")
        fail(
          "This request was already answered (" +
            (current?.state || "missing") +
            ").",
          409,
        );
      await adapter.answer({ ...current, ...input });
      current.state = input.decision === "allow" ? "allowed" : "denied";
      current.answeredAt = new Date().toISOString();
      current.answeredBy = input.answeredBy || "client";
      current.optionId = input.optionId || null;
      current.executed = input.decision === "allow";
      this.store.put("requests", current);
      const run = this.store.get("runs", current.runId);
      run.state = "running";
      this.store.put("runs", run);
      this.store.event(run.id, "request.answered", { request: current });
      return current;
    });
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
      revokeRunCapabilities(this.store, id);
    }
  }
}
