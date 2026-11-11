import { resolveTaskId } from "../task-identity.mjs";
import { workspaceIdentity } from "./identity.mjs";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { activityState } from "../activity.mjs";
import { applyActivity } from "../activity.mjs";
import { queryTasks } from "../query.mjs";
import { fail, canonical } from "./store.mjs";
import { digest } from "../model.mjs";
import { PLAN_FORMAT } from "./plans.mjs";
import { createWorktree, assertProjectAvailable } from "./git.mjs";
import {
  matchingAgentInstructions,
  workflowCategory,
} from "./agent-instructions.mjs";
import { providerModels, providerRegistry } from "./providers/executor.mjs";
import { claudeUsage } from "./providers/claude.mjs";
import {
  mintRunCapability,
  revokeRunCapabilities,
} from "./run-capabilities.mjs";
import { approvalMode } from "./approvals.mjs";
import {
  autoArchiveCompletedRun,
  conversationSettings,
} from "./conversation-settings.mjs";
import {
  openHandsRoutingAvailability,
  selectAgentRoute,
} from "./agent-routing.mjs";
import { openHandsAgentProfiles } from "./providers/openhands.mjs";
import { taskReviewContext } from "./task-review.mjs";
import { recordUsage } from "./telemetry.mjs";
const ACTIVE = new Set([
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
]);
const DRIVER_INSTRUCTIONS =
  "You are the persistent Avoozl Driver for this project workspace. Load and follow the installed Avoozl skill for Driver context, task creation, delegation, and tracking. Do not approve plans, accept tasks, integrate, or merge on the user's behalf. Skill instructions do not expand the server-enforced capability allowlist.";
export const DRIVER_INSTRUCTION_VERSION = 3;
const DRIVER_CONTEXT_TASK_LIMIT = 12;

function driverChoice(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function driverConversationTitle(project = {}) {
  const name = String(project.name || project.title || project.id || "Project")
    .trim()
    .replace(/\s+/g, " ");
  return `Chat with Avoozl · ${name}`.slice(0, 160);
}

export function openHandsDriverConversationId(runId) {
  const hex = createHash("sha256")
    .update("avoozl:openhands-driver:" + runId)
    .digest("hex")
    .slice(0, 32);
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "5" + hex.slice(13, 16),
    variant + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function compactDriverContext(context = {}) {
  if (!context || typeof context !== "object" || Array.isArray(context))
    fail("Driver context must be an object.");
  const compact = {};
  for (const key of [
    "revision",
    "view",
    "selected",
    "document",
    "planId",
    "projectId",
    "url",
    "conversationPurpose",
    "scoped",
    "queueItem",
  ])
    if (context[key] !== undefined)
      compact[key] = structuredClone(context[key]);
  if (context.filters && typeof context.filters === "object")
    compact.filters = Object.fromEntries(
      Object.entries(context.filters)
        .filter(
          ([key, value]) =>
            typeof key === "string" &&
            key.length <= 80 &&
            typeof value === "string" &&
            value.length <= 1000,
        )
        .slice(0, 20),
    );
  const explicitlyScoped =
      context.scoped === true &&
      Boolean(context.selected || context.document || context.planId),
    suppliedTaskIds = Array.isArray(context.taskIds)
      ? context.taskIds.filter(
          (id) => typeof id === "string" && id.length <= 240,
        )
      : [];
  if (explicitlyScoped && suppliedTaskIds.length) {
    compact.taskIds = [
      ...new Set(
        [
          typeof context.selected === "string" ? context.selected : null,
          ...suppliedTaskIds,
        ].filter(Boolean),
      ),
    ].slice(0, DRIVER_CONTEXT_TASK_LIMIT);
    const reportedProvided = Number(
      context.contextTruncation?.taskIds?.provided,
    );
    const provided = Math.max(
      suppliedTaskIds.length,
      Number.isSafeInteger(reportedProvided) && reportedProvided >= 0
        ? reportedProvided
        : 0,
    );
    compact.contextTruncation = {
      taskIds: {
        provided,
        retained: compact.taskIds.length,
        truncated: provided > compact.taskIds.length,
      },
    };
  }
  if (JSON.stringify(compact).length > 16000)
    fail("Driver context must be smaller than 16 KB after compaction.");
  return compact;
}

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
    {
      factories = {},
      baseUrl = "http://127.0.0.1:9428",
      recover = true,
      routingCatalog = null,
      scheduler = null,
      workspaceId = null,
    } = {},
  ) {
    this.store = store;
    this.baseUrl = baseUrl;
    this.registry = providerRegistry(factories);
    this.factories = Object.fromEntries(
      [...this.registry].map(([id, spec]) => [id, spec.create]),
    );
    this.routingCatalog =
      routingCatalog || (factories.openhands ? null : openHandsAgentProfiles);
    this.scheduler = scheduler;
    this.workspaceId = workspaceId || workspaceIdentity(store);
    this.live = new Map();
    this.tails = new Map();
    this.driverHandoffs = new Set();
    this.pendingAdmissions = new Set();
    this.closing = false;
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
        if (ACTIVE.has(run.state) || run.state === "queued") {
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
    if (!["codex", "claude"].includes(provider))
      fail("Choose Claude or Codex.");
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
  concurrencyStatus() {
    return this.scheduler
      ? this.scheduler.status(this.workspaceId)
      : {
          maxConcurrentRuns: null,
          running: this.store
            .list("runs")
            .filter((run) => ACTIVE.has(run.state)).length,
          waiting: 0,
          available: null,
          workspace: {
            id: this.workspaceId,
            maxConcurrentRuns: null,
            running: this.store
              .list("runs")
              .filter((run) => ACTIVE.has(run.state)).length,
            waiting: 0,
          },
          managed: false,
        };
  }
  async acquireRunSlot(run, { priority = "normal" } = {}) {
    if (!this.scheduler || this.scheduler.owns(this.workspaceId, run.id))
      return;
    if (this.closing) fail("Agent host is stopping.", 503);
    const admission = this.scheduler.acquire(this.workspaceId, run.id, {
      priority,
    });
    this.pendingAdmissions.add(admission);
    let lease;
    try {
      lease = await admission;
    } finally {
      this.pendingAdmissions.delete(admission);
    }
    if (this.closing) {
      this.scheduler.release(this.workspaceId, run.id);
      fail("Agent host is stopping.", 503);
    }
    const latest = this.store.get("runs", run.id);
    if (!latest) {
      this.scheduler.release(this.workspaceId, run.id);
      fail("Run was removed while waiting for a host slot.", 409);
    }
    latest.schedulerLease = lease;
    latest.state = "starting";
    latest.admittedAt = lease.admittedAt;
    this.store.put("runs", latest);
    this.store.event(run.id, "run.admitted", {
      workspaceId: this.workspaceId,
      lease,
    });
    Object.assign(run, latest);
  }
  releaseRunSlot(run) {
    if (!this.scheduler || !this.scheduler.release(this.workspaceId, run.id))
      return false;
    delete run.schedulerLease;
    run.releasedAt = new Date().toISOString();
    const latest = this.store.get("runs", run.id);
    if (latest) {
      delete latest.schedulerLease;
      latest.releasedAt = run.releasedAt;
      this.store.put("runs", latest);
    }
    return true;
  }
  context(run) {
    const data = this.store.read(),
      task = data.tasks.find((t) => t.id === resolveTaskId(data, run.taskId)),
      plan = run.planId ? this.store.get("plans", run.planId) : null,
      instructionCategory = workflowCategory(run),
      instructionSubject = {
        ...(task || {}),
        projectId:
          task?.projectId ||
          run.projectId ||
          run.context?.projectId ||
          plan?.projectId ||
          plan?.context?.projectId,
      },
      agentInstructions = matchingAgentInstructions(
        data,
        instructionCategory,
        instructionSubject,
      );
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
            ? run.context?.conversationPurpose === "review"
              ? `Review the finished work on the supplied task against its recorded commits, checks and evidence using read-only repository inspection. The task is already complete: do not reimplement it, resume implementation, edit source, or create a worktree or branch. Judge each acceptance criterion against the evidence that exists, name criteria the receipts do not cover, and say plainly when a judgement cannot be made. Be concise and do not narrate setup or dump inventories. Record follow-up work with plans_propose_work; do not change task status, acceptance, integration, plans, or source.`
              : run.context?.conversationPurpose === "new-task"
                ? `Help the user define one concrete task from the supplied context and read-only repository inspection. Be concise. Do not narrate setup, skill loading, or tool calls, and do not dump repository, planning, policy, runtime, or metric inventories unless the user asks. Clarify scope and acceptance without inventing work or nitpicking. After the user explicitly agrees, record their request with plans_capture. If they explicitly ask to add it to a selected design instead, use plans_propose_work. Do not approve, dispatch, integrate, or accept work, and do not change source.`
                : `Answer the user directly and concisely from the supplied context and read-only repository inspection. Do not narrate setup, skill loading, or tool calls, and do not dump repository, planning, policy, runtime, or metric inventories unless the user asks. Use plans_visualize or plans_present only when a visual materially helps answer the question. Do not change source or task acceptance.`
            : "Implement the task, run the relevant checks, format and commit changes using repository conventions. Do not merge or push; validation and integration are separate workspace actions.",
      agentInstructions.length
        ? [
            `Workspace agent instructions for ${instructionCategory}:`,
            ...agentInstructions.map(
              (rule) => `- ${rule.title}: ${rule.instruction}`,
            ),
            "These instructions are guidance only. They do not expand the run-scoped MCP capability allowlist or authorize approval, integration, acceptance, or unrelated work.",
          ].join("\n")
        : "",
      JSON.stringify({
        viewContext: run.context,
        task,
        plan,
        documents,
        dependencies: task
          ? data.edges.filter((e) => e.from === task.id || e.to === task.id)
          : [],
        ...(run.context?.conversationPurpose === "review" && task
          ? { review: taskReviewContext(this.store, data, task) }
          : {}),
        handoff: run.handoff || null,
        instructionCategory,
        agentInstructions: agentInstructions.map((rule) => ({
          id: rule.id,
          title: rule.title,
          instruction: rule.instruction,
        })),
      }),
      run.prompt || "",
    ].join("\n\n");
  }
  driverProject(projectId) {
    const projects = this.store.list("projects"),
      selected = projectId || (projects.length === 1 ? projects[0].id : null),
      project = selected ? this.store.get("projects", selected) : null;
    if (!project)
      fail(
        projects.length
          ? "Choose which configured project should own this Driver."
          : "Configure a project workspace before opening Driver.",
      );
    return project;
  }
  driverRunId(projectId) {
    return (
      "driver-" +
      digest(workspaceIdentity(this.store) + ":" + projectId).slice(0, 24)
    );
  }
  activeDriver(projectId) {
    return (
      this.store
        .list("runs")
        .filter(
          (run) =>
            run.driver === true &&
            run.projectId === projectId &&
            run.driverActive !== false &&
            !run.deletedAt,
        )
        .sort(
          (left, right) =>
            (right.driverGeneration || 1) - (left.driverGeneration || 1) ||
            String(right.createdAt || "").localeCompare(
              String(left.createdAt || ""),
            ),
        )[0] || null
    );
  }
  nextDriverIdentity(projectId) {
    const base = this.driverRunId(projectId),
      runs = this.store
        .list("runs")
        .filter((run) => run.driver && run.projectId === projectId),
      generation =
        Math.max(0, ...runs.map((run) => run.driverGeneration || 1)) + 1;
    return {
      id: generation === 1 ? base : `${base}-g${generation}`,
      generation,
    };
  }
  listDrivers() {
    return {
      projects: this.store.list("projects").map((project) => ({
        projectId: project.id,
        title: project.name || project.title || project.id,
        root: project.root,
        run: this.activeDriver(project.id),
      })),
      defaultProjectId:
        this.store.list("projects").length === 1
          ? this.store.list("projects")[0].id
          : null,
    };
  }
  async openDriver(input = {}) {
    const project = this.driverProject(input.projectId);
    return this.serialize("driver-lifecycle:" + project.id, async () => {
      const existing = this.activeDriver(project.id),
        title = driverConversationTitle(project),
        context =
          input.context === undefined
            ? existing?.context || {}
            : compactDriverContext(input.context),
        profileSpecified = Object.hasOwn(input, "agentProfile"),
        modelSpecified = Object.hasOwn(input, "model"),
        requestedProfile = driverChoice(input.agentProfile),
        requestedModel = driverChoice(input.model),
        previousProfileOverride =
          existing?.routingDecision?.overrides?.agentProfile ??
          (existing?.routingDecision
            ? null
            : driverChoice(existing?.agentProfile)),
        previousModelOverride =
          existing?.routingDecision?.overrides?.model ??
          (existing?.routingDecision
            ? null
            : driverChoice(existing?.requestedModel ?? existing?.model)),
        automaticHandoff =
          input.automaticHandoffFrom === existing?.id && Boolean(existing),
        instructionHandoff =
          Boolean(existing) &&
          existing.driverInstructionVersion !== DRIVER_INSTRUCTION_VERSION,
        configurationChanged =
          existing &&
          (automaticHandoff ||
            instructionHandoff ||
            (profileSpecified &&
              requestedProfile !== previousProfileOverride) ||
            (modelSpecified && requestedModel !== previousModelOverride));
      if (existing && !configurationChanged) {
        if (input.provider && input.provider !== existing.provider)
          fail("This project Driver already belongs to another provider.", 409);
        existing.title = title;
        this.store.put("runs", existing);
        if (input.context !== undefined)
          this.updateDriverContext({
            projectId: project.id,
            context: input.context,
          });
        if (!this.live.has(existing.id)) {
          const reconnecting = this.store.get("runs", existing.id),
            retryingCreation = !reconnecting.providerSessionId;
          if (retryingCreation) {
            reconnecting.state = "starting";
            reconnecting.error = undefined;
            this.store.put("runs", reconnecting);
            this.store.event(reconnecting.id, "driver.creation.retried", {});
          }
          try {
            await this.connect(reconnecting, undefined);
          } catch (error) {
            if (retryingCreation) {
              const failed = this.store.get("runs", reconnecting.id);
              failed.state = "failed";
              failed.error = error.message;
              this.store.put("runs", failed);
              this.store.event(failed.id, "run.failed", {
                message: error.message,
              });
            }
            throw error;
          }
        }
        return {
          project: {
            projectId: project.id,
            title: project.name || project.title || project.id,
            root: project.root,
          },
          run: this.store.get("runs", existing.id),
          created: false,
        };
      }
      if (
        existing &&
        (ACTIVE.has(existing.state) ||
          this.store
            .list("requests")
            .some(
              (request) =>
                request.runId === existing.id && request.state === "pending",
            ) ||
          this.store
            .list("deliveries")
            .some(
              (delivery) =>
                delivery.runId === existing.id &&
                ["queued", "sending", "awaiting-resume"].includes(
                  delivery.state,
                ),
            ))
      )
        fail(
          "Wait for the current Driver turn and pending requests to finish before changing its agent or model.",
          409,
        );
      const identity = this.nextDriverIdentity(project.id),
        run = await this.start({
          id: identity.id,
          driver: true,
          driverRole: "project",
          driverActive: true,
          driverGeneration: identity.generation,
          driverPredecessorId: existing?.id,
          driverHandoffReason: automaticHandoff
            ? "context-threshold"
            : instructionHandoff
              ? "instruction-update"
              : undefined,
          driverInstructionVersion: DRIVER_INSTRUCTION_VERSION,
          provider: input.provider || existing?.provider || "openhands",
          projectId: project.id,
          model: automaticHandoff
            ? undefined
            : modelSpecified
              ? requestedModel
              : previousModelOverride,
          agentProfile: automaticHandoff
            ? undefined
            : profileSpecified
              ? requestedProfile
              : previousProfileOverride,
          contextRemainingPercent: automaticHandoff
            ? existing.contextRemainingPercent
            : undefined,
          mode: "ask",
          title,
          context,
          approvalMode: "manual",
        });
      if (existing) {
        const adapter = this.live.get(existing.id);
        if (adapter) await adapter.close().catch(() => {});
        this.live.delete(existing.id);
        revokeRunCapabilities(this.store, existing.id);
        this.store.transaction(() => {
          const previous = this.store.get("runs", existing.id),
            successor = this.store.get("runs", run.id),
            retiredAt = new Date().toISOString();
          previous.driverActive = false;
          previous.driverRetiredAt = retiredAt;
          previous.driverSuccessorId = successor.id;
          successor.driverActive = true;
          successor.driverPredecessorId = previous.id;
          this.store.put("runs", previous);
          this.store.put("runs", successor);
          this.store.setMeta("runArchive:" + previous.id, retiredAt);
          this.store.event(previous.id, "driver.retired", {
            successorRunId: successor.id,
            retiredAt,
          });
          this.store.event(successor.id, "driver.handoff.completed", {
            previousRunId: previous.id,
            retiredAt,
          });
        });
      }
      return {
        project: {
          projectId: project.id,
          title: project.name || project.title || project.id,
          root: project.root,
        },
        run: this.store.get("runs", run.id),
        created: true,
        handedOff: Boolean(existing),
        previousRunId: existing?.id,
      };
    });
  }
  scheduleAutomaticDriverHandoff(runId) {
    if (this.driverHandoffs.has(runId)) return;
    this.driverHandoffs.add(runId);
    Promise.resolve()
      .then(async () => {
        const run = this.store.get("runs", runId),
          settings = conversationSettings(this.store);
        if (
          !run?.driver ||
          run.driverActive === false ||
          run.state !== "completed" ||
          run.contextTelemetry?.availability !== "reported" ||
          !settings.routing.enabled
        )
          return;
        if (
          run.routingDecision?.overrides?.agentProfile ||
          run.routingDecision?.overrides?.model
        ) {
          this.store.event(run.id, "driver.handoff.skipped", {
            reason: "explicit-override",
            message:
              "The Driver agent or model is explicitly pinned, so automatic routing did not replace it.",
          });
          return;
        }
        const decision = selectAgentRoute({
            settings: settings.routing,
            input: {
              driver: true,
              mode: "ask",
              contextRemainingPercent: run.contextRemainingPercent,
            },
            parent: run,
          }),
          rule = settings.routing.rules.find(
            (candidate) => candidate.id === decision.ruleId,
          );
        if (
          decision.source !== "policy-rule" ||
          rule?.contextRemainingAtMost === null ||
          rule?.contextRemainingAtMost === undefined
        )
          return;
        const pendingRequest = this.store
            .list("requests")
            .some(
              (request) =>
                request.runId === run.id && request.state === "pending",
            ),
          pendingDelivery = this.store
            .list("deliveries")
            .some(
              (delivery) =>
                delivery.runId === run.id &&
                ["queued", "sending", "awaiting-resume"].includes(
                  delivery.state,
                ),
            );
        if (pendingRequest || pendingDelivery) {
          this.store.event(run.id, "driver.handoff.deferred", {
            reason: pendingRequest ? "pending-request" : "pending-delivery",
            contextRemainingPercent: run.contextRemainingPercent,
            ruleId: decision.ruleId,
          });
          return;
        }
        run.automaticHandoffRequestedAt = new Date().toISOString();
        run.automaticHandoffRuleId = decision.ruleId;
        this.store.put("runs", run);
        this.store.event(run.id, "driver.handoff.requested", {
          reason: "context-threshold",
          contextRemainingPercent: run.contextRemainingPercent,
          ruleId: decision.ruleId,
          selected: decision.selected,
        });
        await this.openDriver({
          projectId: run.projectId,
          provider: run.provider,
          context: run.context,
          automaticHandoffFrom: run.id,
        });
      })
      .catch((error) =>
        this.store.event(runId, "driver.handoff.failed", {
          message: error.message,
        }),
      )
      .finally(() => this.driverHandoffs.delete(runId));
  }
  updateDriverContext(input = {}) {
    const project = this.driverProject(input.projectId),
      run = this.activeDriver(project.id);
    if (!run?.driver) fail("Open this project Driver first.", 404);
    if (
      !input.context ||
      typeof input.context !== "object" ||
      Array.isArray(input.context) ||
      JSON.stringify(input.context).length > 100000
    )
      fail("Driver context must be an object smaller than 100 KB.");
    run.context = compactDriverContext(input.context);
    run.driverContextUpdatedAt = new Date().toISOString();
    this.store.put("runs", run);
    this.store.event(run.id, "driver.context.updated", {
      projectId: project.id,
      context: run.context,
    });
    return {
      project: {
        projectId: project.id,
        title: project.name || project.title || project.id,
        root: project.root,
      },
      run,
    };
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
    const task = this.store
        .read()
        .tasks.find(
          (t) => t.id === resolveTaskId(this.store.read(), input.taskId),
        ),
      plan = input.planId ? this.store.get("plans", input.planId) : null,
      projects = this.store.list("projects"),
      associatedProjectId =
        task?.projectId || plan?.context?.projectId || plan?.projectId,
      projectId =
        input.projectId ||
        associatedProjectId ||
        (projects.length === 1 ? projects[0].id : null),
      project = projectId ? this.store.get("projects", projectId) : null;
    if (projectId && !project) fail("Choose a configured project.");
    if (!project)
      fail(
        projects.length
          ? "Choose which configured project workspace this conversation should use."
          : "Configure a project workspace before starting an agent.",
      );
    if (
      !task &&
      !plan &&
      !input.driver &&
      !(input.mode === "ask" && input.prompt?.trim())
    )
      fail("Select a task or draft plan.");
    if (input.driver && (input.parentRunId || input.provider !== "openhands"))
      fail("A Driver must be a top-level OpenHands conversation.", 409);
    let parent;
    if (input.parentRunId) {
      parent = this.store.get("runs", input.parentRunId);
      if (
        !parent?.driver ||
        parent.driverActive === false ||
        parent.driverRole !== "project" ||
        parent.parentRunId ||
        parent.provider !== "openhands"
      )
        fail(
          "The parent must be this project’s top-level OpenHands Driver.",
          409,
        );
      if (parent.projectId !== project.id)
        fail(
          "The Driver and child conversation must use the same project.",
          409,
        );
      if (input.provider === "openhands" && !parent.providerSessionId)
        fail(
          "The project Driver is still starting. Retry after it connects.",
          409,
        );
    }
    const routingSettings = conversationSettings(this.store).routing;
    let routingAvailability = null;
    if (
      routingSettings.enabled &&
      input.provider === "openhands" &&
      this.routingCatalog
    )
      try {
        routingAvailability = openHandsRoutingAvailability(
          await this.routingCatalog(),
        );
      } catch (error) {
        routingAvailability = {
          provider: "openhands",
          state: "unavailable",
          reason:
            "OpenHands profile discovery failed: " +
            (error?.message || "unknown error"),
          agentProfiles: [],
        };
      }
    const routingDecision = selectAgentRoute({
      settings: routingSettings,
      input,
      task,
      parent,
      availability: routingAvailability,
    });
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
      driver: input.driver === true,
      driverRole: input.driver ? input.driverRole || "project" : undefined,
      driverActive: input.driver ? input.driverActive !== false : undefined,
      driverGeneration: input.driver ? input.driverGeneration || 1 : undefined,
      driverPredecessorId: input.driver ? input.driverPredecessorId : undefined,
      driverHandoffReason: input.driver ? input.driverHandoffReason : undefined,
      driverInstructionVersion: input.driver
        ? input.driverInstructionVersion || DRIVER_INSTRUCTION_VERSION
        : undefined,
      logicalConversationId: input.driver ? id : undefined,
      taskId: task?.id || (plan ? "plan:" + plan.id : "conversation:" + id),
      planId: plan?.id,
      projectId: project?.id,
      provider: input.provider,
      executor: input.provider,
      approvalMode: selectedApprovalMode,
      model: routingDecision.selected.model || undefined,
      agentProfile: routingDecision.selected.agentProfile || undefined,
      requestedModel: routingDecision.selected.model,
      routingDecision,
      mode: input.mode === "ask" ? "ask" : plan ? "plan" : "implement",
      capabilityMode: input.driver
        ? "driver"
        : input.mode === "ask" &&
            ["new-task", "review"].includes(input.context?.conversationPurpose)
          ? input.context.conversationPurpose
          : undefined,
      prompt: input.prompt || "",
      title:
        input.title ||
        input.prompt?.split("\n")[0].slice(0, 160) ||
        task?.title ||
        plan?.title,
      context: input.context || {},
      parentRunId: parent?.id,
      parentProviderSessionId:
        input.provider === "openhands" ? parent?.providerSessionId : undefined,
      review: input.review || undefined,
      resources,
      state: this.scheduler ? "queued" : "starting",
      createdAt: new Date().toISOString(),
      workspaceId: this.workspaceId,
    };
    // Claim under a database lock before creating a worktree or launching a process.
    this.store.transaction(() => {
      if (project) assertProjectAvailable(this.store, project.id);
      const conflict =
        run.mode !== "ask" &&
        this.store
          .list("runs")
          .find(
            (r) =>
              r.mode !== "ask" &&
              [...ACTIVE, "queued", "disconnected"].includes(r.state) &&
              (resolveTaskId(this.store.read(), r.taskId) === run.taskId ||
                (project &&
                  r.projectId === project.id &&
                  (r.resources || []).some((x) => resources.includes(x)))),
          );
      if (conflict) fail("Conflicts with active run " + conflict.id, 409);
      this.store.put("runs", run);
      this.store.event(id, "run.created", { run });
      if (this.scheduler)
        this.store.event(id, "run.queued", {
          workspaceId: this.workspaceId,
          concurrency: this.concurrencyStatus(),
        });
    });
    const launch = async () => {
      try {
        if (this.scheduler)
          await this.acquireRunSlot(run, {
            priority: input.priority === "user" ? "user" : "normal",
          });
        Object.assign(
          run,
          run.mode === "ask"
            ? {
                worktree: project.root,
                readOnly: true,
              }
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
        await this.connect(run, run.driver ? undefined : this.context(run));
        return this.store.get("runs", id);
      } catch (error) {
        this.scheduler?.cancel(this.workspaceId, run.id);
        this.releaseRunSlot(run);
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
        title: run.title,
        model: run.model,
        agentProfile: run.agentProfile,
        approvalMode: approvalMode(run.approvalMode, "manual"),
        prompt,
        conversationId: run.driver
          ? openHandsDriverConversationId(run.id)
          : undefined,
        parentConversationId: run.parentProviderSessionId,
        systemInstructions: run.driver ? DRIVER_INSTRUCTIONS : undefined,
        resumeId: run.providerSessionId,
        mcpUrl: this.baseUrl + "/mcp?run=" + encodeURIComponent(run.id),
        mcpToken: token,
      });
      const latest = this.store.get("runs", run.id);
      if (latest.state === "starting") {
        latest.state = run.driver ? "completed" : "running";
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
  recordChildren(parent, body) {
    const children = Array.isArray(body?.children) ? body.children : [],
      runs = this.store.list("runs"),
      bySession = new Map(
        runs
          .filter(
            (run) =>
              run.provider === "openhands" &&
              typeof run.providerSessionId === "string",
          )
          .map((run) => [run.providerSessionId, run]),
      ),
      childRunIds = new Set(parent.childRunIds || []),
      now = new Date().toISOString();
    for (const child of children) {
      if (
        typeof child?.providerSessionId !== "string" ||
        !child.providerSessionId ||
        child.providerSessionId === parent.providerSessionId
      )
        continue;
      let existing = bySession.get(child.providerSessionId);
      const parentRun = bySession.get(child.parentProviderSessionId) || parent;
      if (existing && !existing.parentRunId) {
        this.store.event(parent.id, "child.conflict", {
          providerSessionId: child.providerSessionId,
          runId: existing.id,
          message:
            "OpenHands reported an existing top-level Avoozl run as a child conversation.",
        });
        continue;
      }
      const id =
          existing?.id ||
          "run-oh-child-" + digest(child.providerSessionId).slice(0, 24),
        next = {
          ...(existing || {}),
          id,
          taskId: parent.taskId,
          planId: parent.planId,
          projectId: parent.projectId,
          provider: "openhands",
          executor: "openhands",
          providerSessionId: child.providerSessionId,
          parentRunId: parentRun.id,
          parentProviderSessionId: child.parentProviderSessionId,
          mode: "child",
          state: child.state || "observing",
          title:
            child.title?.slice(0, 240) ||
            "Subagent · " + (parent.title || parent.taskId),
          worktree: child.worktree || parent.worktree,
          branch: child.branch || parent.branch,
          model: child.model || parent.model,
          actualModel:
            child.usage?.model ||
            child.model ||
            existing?.actualModel ||
            parent.actualModel ||
            undefined,
          usageStatus: child.usage
            ? {
                availability: "reported",
                source: child.usage.source,
                coverage: child.usage.coverage,
              }
            : existing?.usageStatus,
          providerAvailability:
            child.providerAvailability || existing?.providerAvailability,
          providerDiagnostic:
            child.providerDiagnostic || existing?.providerDiagnostic,
          managedBy: "openhands",
          createdAt: existing?.createdAt || child.createdAt || now,
          lastObservedAt: now,
        },
        changed =
          !existing ||
          [
            "taskId",
            "planId",
            "projectId",
            "providerSessionId",
            "parentRunId",
            "parentProviderSessionId",
            "state",
            "title",
            "worktree",
            "branch",
            "model",
            "actualModel",
            "providerAvailability",
            "providerDiagnostic",
          ].some((key) => existing[key] !== next[key]) ||
          (Boolean(child.usage) &&
            existing?.usageStatus?.availability !== "reported");
      if (changed) {
        next.updatedAt = child.updatedAt || now;
        this.store.put("runs", next);
        this.store.event(id, existing ? "child.updated" : "child.discovered", {
          parentRunId: parentRun.id,
          providerSessionId: child.providerSessionId,
          state: next.state,
        });
      }
      if (child.usage) recordUsage(this.store, next, child.usage);
      if (next.state === "completed")
        autoArchiveCompletedRun(this.store, next, next.updatedAt || now);
      existing = changed ? next : existing;
      bySession.set(child.providerSessionId, existing);
      childRunIds.add(id);
    }
    parent.childRunIds = [...childRunIds];
    parent.childrenTruncated = body?.truncated === true;
  }
  receiveRecorded(id, kind, body) {
    const run = this.store.get("runs", id);
    if (!run) return;
    run.lastObservedAt = new Date().toISOString();
    if (kind === "session") {
      run.providerSessionId = body.providerSessionId;
      if (body.model) run.actualModel = body.model;
      if (run.routingDecision)
        run.routingDecision.availability = {
          state: "confirmed-on-start",
          actualModel: body.model || null,
          agentProfile: body.agentProfileId || run.agentProfile || null,
          agentKind: body.agentKind || null,
          reason:
            "OpenHands created the conversation with this effective agent and model.",
        };
      run.providerAvailability = "available";
      run.providerDiagnostic = undefined;
      if (run.state === "starting") run.error = undefined;
    }
    if (kind === "children") this.recordChildren(run, body);
    if (kind === "usage") {
      recordUsage(this.store, run, body);
      const reportedModel =
        body.model ||
        (Array.isArray(body.usage) && body.usage.length === 1
          ? body.usage[0]?.model
          : null);
      if (reportedModel) run.actualModel = reportedModel;
      run.usageStatus = {
        availability: "reported",
        source: body.source || "provider",
        coverage: body.coverage || "Usage reported by the provider.",
      };
    }
    if (kind === "usage.status" && run.usageStatus?.availability !== "reported")
      run.usageStatus = {
        availability: body.availability || "unavailable",
        reason: body.reason || "The provider did not report usage.",
        model: body.model || run.actualModel || run.model || null,
      };
    if (kind === "context") {
      run.contextRemainingPercent = body.remainingPercent;
      run.contextTelemetry = {
        availability: "reported",
        source: body.source || "provider",
        model: body.model || run.actualModel || run.model || null,
        contextWindow: body.contextWindow,
        perTurnToken: body.perTurnToken,
        usedPercent: body.usedPercent,
        coverage: body.coverage,
      };
    }
    if (kind === "approvals.status") {
      run.effectiveApprovalMode = body.effectiveApprovalMode;
      run.approvalNotice = body.approvalNotice;
    }
    if (kind === "state") {
      run.state = body.state;
      run.providerAvailability = "available";
      run.providerDiagnostic = undefined;
      run.error = undefined;
    }
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
      const wasActive = ACTIVE.has(run.state);
      if (wasActive) run.state = "disconnected";
      if (wasActive) run.error = body.message;
      run.providerAvailability = body.providerAvailability || "unavailable";
      run.providerDiagnostic = body.providerDiagnostic || undefined;
      run.updatedAt = new Date().toISOString();
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
    if (kind === "turn.completed" || kind === "disconnected")
      this.releaseRunSlot(run);
    if (kind === "turn.completed") autoArchiveCompletedRun(this.store, run);
    this.store.event(id, kind, body);
    if (["session", "turn.completed", "disconnected"].includes(kind))
      this.checkpoint(run);
    this.onEvent?.(id, kind, body);
    if (
      run.driver &&
      run.driverActive !== false &&
      ["context", "turn.completed"].includes(kind)
    )
      this.scheduleAutomaticDriverHandoff(id);
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
      if (run.parentProviderSessionId)
        fail(
          "Open this child conversation in OpenHands to observe or steer it.",
          409,
        );
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
    if (
      this.scheduler &&
      !this.scheduler.owns(this.workspaceId, run.id) &&
      !this.draining
    ) {
      try {
        await this.acquireRunSlot(run, { priority: "user" });
        if (!adapter && run.providerSessionId) {
          await this.connect(run, undefined);
          adapter = this.live.get(run.id);
        }
      } catch (error) {
        delivery.error = error.message;
      }
    }
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
      this.releaseRunSlot(run);
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
    if (run.parentProviderSessionId)
      fail("Interrupt child conversations through OpenHands.", 409);
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
      if (run.parentProviderSessionId)
        fail("Change child-conversation models through OpenHands.", 409);
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
      if (run.parentProviderSessionId)
        fail("Resume child conversations through OpenHands.", 409);
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
      run.state = this.scheduler ? "queued" : "starting";
      this.store.put("runs", run);
      try {
        await this.acquireRunSlot(run, { priority: "user" });
        await this.connect(
          run,
          input.text ||
            "Continue from the saved session. Inspect the current task and worktree before changing anything.",
        );
        return this.store.get("runs", run.id);
      } catch (error) {
        this.scheduler?.cancel(this.workspaceId, run.id);
        this.releaseRunSlot(run);
        run.state = "disconnected";
        run.error = error.message;
        this.store.put("runs", run);
        throw error;
      }
    });
  }
  async answer(input) {
    const request = this.store.get("requests", input.id);
    if (!request) fail("Request not found.", 404);
    const run = this.store.get("runs", request.runId);
    if (run?.parentRunId)
      fail("Answer child-conversation requests through OpenHands.", 409);
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
    if (this.closed) return;
    this.closed = true;
    this.closing = true;
    clearInterval(this.activityTimer);
    if (this.scheduler) {
      for (const run of this.store.list("runs"))
        if (run.state === "queued")
          this.scheduler.cancel(
            this.workspaceId,
            run.id,
            "Agent host stopped before admission.",
          );
      await Promise.allSettled([...this.pendingAdmissions]);
    }
    for (const adapter of this.live.values()) await adapter.close();
    if (this.scheduler)
      for (const run of this.store.list("runs"))
        if (run.schedulerLease) this.releaseRunSlot(run);
    this.live.clear();
  }
  async landed(id) {
    const adapter = this.live.get(id);
    if (adapter) await adapter.close();
    this.live.delete(id);
    const run = this.store.get("runs", id);
    if (run) {
      this.releaseRunSlot(run);
      run.state = "integrated";
      this.store.put("runs", run);
      revokeRunCapabilities(this.store, id);
    }
  }
}
