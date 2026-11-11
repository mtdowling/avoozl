import { resolveTaskId, requireDistinctTask } from "../task-identity.mjs";
import {
  duplicateAudit,
  duplicateCandidates,
  mergeTasks,
} from "./task-dedup.mjs";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { queryTasks, statusComplete, digest, validate } from "../model.mjs";
import { captureTask } from "../capture.mjs";
import { applyActivity } from "../activity.mjs";
import { applyPlanMetadata, planSummaries } from "../plan-model.mjs";
import { auditPlans, dispatchMcp } from "../mcp.mjs";
import { fail, canonical } from "./store.mjs";
import {
  runPage,
  taskSessions,
  planPage,
  pendingRequests,
  compactEvent,
  recentIntegrations,
} from "./views.mjs";
import {
  createPlan,
  savePlan,
  proposeWork,
  approvePlan,
  extractPlan,
} from "./plans.mjs";
import {
  projectConfig,
  projectGitHubRepository,
  validateRun,
  integrateRun,
  runChanges,
  WORKING_STATES,
} from "./git.mjs";
import { workspaceIdentity } from "./identity.mjs";
import { compactDriverContext, driverConversationTitle } from "./manager.mjs";
import { Batches } from "./batches.mjs";
import { metrics } from "./telemetry.mjs";
import { taskSignals, isPlanInventory } from "../workbench-model.mjs";
import { ExternalSessions } from "./external-sessions.mjs";
import { listExamples, seedExample } from "./examples.mjs";
import { describeWorkspace } from "./client.mjs";
import { defaultGitHubClient, requirePrivateRepository } from "./github.mjs";
import {
  configureGitHubRepository,
  machineIdentity,
  projectPlanIssues,
  startAuthorizedIssue,
  syncGitHubIssues,
} from "./github-sync.mjs";
import {
  configureGitHubQueueRepository,
  createTaskFromQueueItem,
  githubQueueItems,
  removeGitHubQueueRepository,
  syncGitHubQueue,
} from "./github-queue.mjs";
import { confirmQueueItemLink } from "./github-overlap.mjs";
import {
  configureWorkspaceRepository,
  publishPlanningPullRequest,
  publishWorkspaceRepository,
  syncWorkspaceRepository,
  workspaceRepositoryStatus,
} from "./workspace-repository.mjs";
import {
  applyReviewSuggestion,
  createReviewThreads,
  disposeReview,
  listReviewThreads,
  replyToReview,
  reviewPrompt,
} from "./plan-reviews.mjs";
import { lintPlan } from "./plan-quality.mjs";
import {
  matchingAgentInstructions,
  toggleAgentInstruction,
} from "./agent-instructions.mjs";
import {
  autoArchiveCompletedRun,
  conversationSettings,
  updateConversationSettings,
} from "./conversation-settings.mjs";
import { openHandsAgentProfiles } from "./providers/openhands.mjs";
import { OpenHandsAutomations } from "./openhands-automations.mjs";

// Acceptance evidence a caller did not type, when validateRun already recorded
// passing checks for the commit being accepted. A failed or absent validation
// derives nothing: acceptance stays the operator's own statement.
function validatedEvidence(store, data, task) {
  const records = store
      .list("evidence")
      .filter(
        (e) =>
          e.kind === "command" &&
          typeof e.commit === "string" &&
          resolveTaskId(data, e.taskId) === task.id,
      ),
    commit = task.integration?.commit || records[0]?.commit;
  if (!commit) return "";
  const matching = records.filter((e) => e.commit === commit);
  if (!matching.length || matching.some((e) => e.exitCode !== 0)) return "";
  // Validation and integration revalidation record the same command twice.
  // Report the distinct checks, not how many times they ran.
  const checks = [
    ...new Set(matching.map((e) => (e.argv || []).join(" ")).filter(Boolean)),
  ];
  if (!checks.length) return "";
  return (
    `${checks.length} configured check${checks.length === 1 ? "" : "s"} passed at commit ${commit.slice(0, 12)}: ` +
    checks.join("; ")
  ).slice(0, 2000);
}

function repositoryBase(store, task, projectId) {
  if (typeof task.github?.url === "string") {
    try {
      const url = new URL(task.github.url);
      const marker = url.pathname.match(/\/(?:issues|pull)\/\d+(?:\/|$)/);
      if (marker) {
        url.pathname = url.pathname.slice(0, marker.index);
        url.search = "";
        url.hash = "";
        return url.href.replace(/\/$/, "");
      }
    } catch {}
  }
  const repository =
    task.github?.repository ||
    store
      .list("github_repositories")
      .find((entry) => entry.projectId === projectId)?.id ||
    store.get("projects", projectId)?.repository ||
    "";
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    ? `https://github.com/${repository}`
    : "";
}

function taskLocalChanges(store, task, runs, projectId, repositoryUrl) {
  const worktreeRuns = runs.filter((run) => run.worktree && !run.readOnly),
    diffRun =
      worktreeRuns.find((run) => WORKING_STATES.includes(run.state)) ||
      worktreeRuns.at(-1),
    diffAvailable = Boolean(diffRun && fs.existsSync(diffRun.worktree)),
    project = store.get("projects", projectId);
  if (!project && !diffAvailable) return null;
  return {
    projectId,
    root: project?.root || "",
    branch: diffRun?.branch || task.integration?.branch || "",
    worktree: diffRun?.worktree || "",
    diffRunId: diffAvailable ? diffRun.id : "",
    repositoryUrl,
  };
}

function taskCodeChanges(store, data, task, runs, evidenceRecords) {
  const projectId =
      task.projectId || runs.map((run) => run.projectId).find(Boolean) || "",
    base = repositoryBase(store, task, projectId),
    commits = new Map(),
    pulls = new Map();
  const addCommit = (sha, source) => {
    if (typeof sha !== "string" || !/^[a-f0-9]{7,64}$/i.test(sha)) return;
    const existing = commits.get(sha);
    commits.set(sha, {
      sha,
      source: existing?.source || source,
      url: existing?.url || (base ? `${base}/commit/${sha}` : ""),
    });
  };
  const addPull = (value) => {
    if (typeof value === "string") value = { url: value };
    if (!value || typeof value.url !== "string" || !value.url) return;
    pulls.set(value.nodeId || value.url, {
      nodeId: value.nodeId || null,
      number: Number(value.number) || null,
      url: value.url,
      title: typeof value.title === "string" ? value.title : "",
      state: typeof value.state === "string" ? value.state : "",
      repository:
        typeof value.repository === "string"
          ? value.repository
          : task.github?.repository || "",
    });
  };
  addCommit(task.integration?.commit, "Integrated");
  for (const evidence of evidenceRecords)
    addCommit(
      evidence.commit,
      evidence.kind === "command" ? "Validated" : "Evidence",
    );
  for (const run of runs) {
    addCommit(run.expectedCommit, "Run output");
    addCommit(run.integratedCommit, "Integrated");
    addPull(run.pullRequest);
    for (const pull of run.pullRequests || []) addPull(pull);
  }
  for (const pull of task.github?.pullRequests || []) addPull(pull);
  for (const pull of task.pullRequests || []) addPull(pull);
  for (const receipt of store.list("receipts")) {
    if (
      typeof receipt.taskId === "string" &&
      resolveTaskId(data, receipt.taskId) === task.id &&
      typeof receipt.url === "string" &&
      /\/pull\/\d+(?:\/|$)/.test(receipt.url)
    )
      addPull(receipt);
  }
  const issueNumber = Number(task.github?.number) || null,
    issue = issueNumber
      ? {
          number: issueNumber,
          repository: task.github?.repository || "",
          url:
            task.github?.url || (base ? `${base}/issues/${issueNumber}` : ""),
        }
      : null;
  return {
    issue,
    commits: [...commits.values()],
    pullRequests: [...pulls.values()],
    local: taskLocalChanges(store, task, runs, projectId, base),
  };
}

export class Operations {
  constructor(
    store,
    {
      manager = null,
      externalSessions,
      operator,
      github,
      configuration = null,
      openhandsAutomations = null,
    } = {},
  ) {
    this.store = store;
    this.manager = manager;
    // Provenance for records this workspace mints; never an authorization.
    this.operator = operator || "";
    this.github = github || defaultGitHubClient();
    this.configuration = configuration;
    this.openhandsAutomations =
      openhandsAutomations || new OpenHandsAutomations();
    this.externalSessions = externalSessions || new ExternalSessions(store);
    this.batches =
      manager && !manager.remote ? new Batches(store, manager) : null;
    this.pendingIntents = new Map();
    this.reviewPipelines = new Set();
  }
  read() {
    return this.store.read();
  }
  async openRemoteDriver(input = {}) {
    try {
      return await this.manager.command("driver.open", input);
    } catch (error) {
      if (!/Unsupported agent-host operation/i.test(error.message)) throw error;
    }
    const projects = this.store.list("projects"),
      projectId =
        input.projectId || (projects.length === 1 ? projects[0].id : null),
      project = projectId ? this.store.get("projects", projectId) : null;
    if (!project)
      fail(
        projects.length
          ? "Choose which configured project should own this Driver."
          : "Configure a project workspace before opening Driver.",
      );
    const baseId =
        "driver-" +
        digest(workspaceIdentity(this.store) + ":" + project.id).slice(0, 24),
      drivers = this.store
        .list("runs")
        .filter(
          (run) =>
            run.driver === true &&
            run.projectId === project.id &&
            run.driverActive !== false &&
            !run.deletedAt,
        ),
      existing = drivers[0] || this.store.get("runs", baseId),
      profileSpecified = Object.hasOwn(input, "agentProfile"),
      modelSpecified = Object.hasOwn(input, "model"),
      choice = (value) =>
        typeof value === "string" && value.trim() ? value.trim() : null,
      configurationChanged =
        existing &&
        ((profileSpecified &&
          choice(input.agentProfile) !== choice(existing.agentProfile)) ||
          (modelSpecified &&
            choice(input.model) !==
              choice(existing.requestedModel ?? existing.model))),
      generation =
        Math.max(
          0,
          ...this.store
            .list("runs")
            .filter((run) => run.driver && run.projectId === project.id)
            .map((run) => run.driverGeneration || 1),
        ) + 1,
      id = !existing && generation === 1 ? baseId : `${baseId}-g${generation}`,
      context =
        input.context === undefined
          ? existing?.context || {}
          : compactDriverContext(input.context);
    if (existing && !configurationChanged) {
      if (input.provider && input.provider !== existing.provider)
        fail("This project Driver already belongs to another provider.", 409);
      existing.driver = true;
      existing.driverActive = true;
      existing.driverRole = "project";
      existing.logicalConversationId =
        existing.logicalConversationId || existing.id;
      if (input.context !== undefined) {
        existing.context = context;
        existing.driverContextUpdatedAt = new Date().toISOString();
      }
      this.store.put("runs", existing);
      return {
        project: {
          projectId: project.id,
          title: project.name || project.title || project.id,
          root: project.root,
        },
        run: existing,
        created: false,
        compatibilityMode: true,
      };
    }
    if (
      existing &&
      (["starting", "running", "waiting-input", "waiting-approval"].includes(
        existing.state,
      ) ||
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
              ["queued", "sending", "awaiting-resume"].includes(delivery.state),
          ))
    )
      fail(
        "Wait for the current Driver turn and pending requests to finish before changing its agent or model.",
        409,
      );
    const run = await this.manager.command("run.start", {
      id,
      driver: true,
      driverRole: "project",
      driverActive: true,
      driverGeneration: generation,
      driverPredecessorId: existing?.id,
      provider: input.provider || "openhands",
      projectId: project.id,
      model: modelSpecified
        ? choice(input.model)
        : (existing?.requestedModel ?? existing?.model),
      agentProfile: profileSpecified
        ? choice(input.agentProfile)
        : existing?.agentProfile,
      mode: "ask",
      title: driverConversationTitle(project),
      prompt:
        "Act as this project's persistent Avoozl Driver. Keep replies concise, use the mounted project and Avoozl context when asked, and reply only “Ready” to this initialization message.",
      context,
      approvalMode: "manual",
    });
    const durable = {
      ...(this.store.get("runs", id) || run),
      driver: true,
      driverActive: true,
      driverGeneration: generation,
      driverPredecessorId: existing?.id,
      driverRole: "project",
      logicalConversationId: id,
      agentProfile: profileSpecified
        ? choice(input.agentProfile) || undefined
        : existing?.agentProfile,
      requestedModel: modelSpecified
        ? choice(input.model)
        : (existing?.requestedModel ?? existing?.model ?? null),
      context,
      driverContextUpdatedAt: new Date().toISOString(),
    };
    this.store.put("runs", durable);
    if (existing) {
      const retiredAt = new Date().toISOString();
      existing.driverActive = false;
      existing.driverRetiredAt = retiredAt;
      existing.driverSuccessorId = durable.id;
      this.store.put("runs", existing);
      this.store.setMeta("runArchive:" + existing.id, retiredAt);
      this.store.event(existing.id, "driver.retired", {
        successorRunId: durable.id,
        retiredAt,
        compatibilityMode: true,
      });
    }
    this.store.event(id, "driver.compatibility.started", {
      projectId: project.id,
    });
    return {
      project: {
        projectId: project.id,
        title: project.name || project.title || project.id,
        root: project.root,
      },
      run: durable,
      created: true,
      handedOff: Boolean(existing),
      previousRunId: existing?.id,
      compatibilityMode: true,
    };
  }
  detail(id) {
    const data = this.read(),
      requestedId = id;
    id = resolveTaskId(data, id);
    const task = data.tasks.find((t) => t.id === id);
    if (!task) fail("Task not found.", 404);
    const doc = data.documents[task.source?.document],
      runs = this.store
        .list("runs")
        .filter((r) => resolveTaskId(data, r.taskId) === id),
      evidenceRecords = this.store
        .list("evidence")
        .filter((e) => resolveTaskId(data, e.taskId) === id),
      activeRun =
        runs.find((run) => WORKING_STATES.includes(run.state)) || runs.at(-1);
    return {
      ...task,
      ...(requestedId !== id ? { requestedId } : {}),
      context:
        task.approvedSource?.text ||
        (doc
          ? doc.text
              .split("\n")
              .slice(task.source.lineStart - 1, task.source.lineEnd)
              .join("\n")
          : ""),
      relationships: data.edges.filter((e) => e.from === id || e.to === id),
      documents: (task.contextDocuments || [])
        .map((id) => data.documents[id])
        .filter(Boolean),
      runs,
      evidenceRecords,
      executionLocation: {
        branch:
          task.activity?.branch ||
          activeRun?.branch ||
          task.integration?.branch ||
          null,
        worktree: task.activity?.worktree || activeRun?.worktree || null,
      },
      codeChanges: taskCodeChanges(
        this.store,
        data,
        task,
        runs,
        evidenceRecords,
      ),
    };
  }
  // The commands a validated run actually passed, summarized for an
  // acceptance receipt. Returns null when no validation produced evidence, so
  // acceptance is recorded without inventing a justification.
  acceptanceFromValidation(taskId) {
    const resolved = resolveTaskId(this.read(), taskId);
    const records = this.store
      .list("evidence")
      .filter(
        (entry) =>
          entry.kind === "command" &&
          resolveTaskId(this.read(), entry.taskId) === resolved,
      );
    if (!records.length) return null;
    const commit = records[0].commit;
    const latest = records.filter((entry) => entry.commit === commit);
    if (latest.some((entry) => entry.exitCode !== 0)) return null;
    return {
      summary:
        "Validation at " +
        String(commit).slice(0, 10) +
        " passed: " +
        latest.map((entry) => entry.argv.join(" ")).join("; "),
      evidenceIds: latest.map((entry) => entry.id),
    };
  }
  async waitForReviewRun(id, timeoutMs = 30 * 60 * 1000) {
    const terminal = new Set([
      "completed",
      "interrupted",
      "failed",
      "integrated",
      "disconnected",
    ]);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const run = this.store.get("runs", id);
      if (run && terminal.has(run.state)) return run;
      if (Date.now() > deadline)
        fail("Design review timed out; the run remains inspectable.", 504);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  async runReviewPipeline(id) {
    if (this.reviewPipelines.has(id)) return;
    this.reviewPipelines.add(id);
    try {
      let pipeline = this.store.get("review_rounds", id);
      for (
        let index = pipeline.nextIndex || 0;
        index < pipeline.sequence.length;
        index++
      ) {
        pipeline = this.store.get("review_rounds", id);
        if (pipeline.state !== "running") return;
        const plan = this.store.get("plans", pipeline.planId);
        if (!plan || plan.hash !== pipeline.revisionHash) {
          pipeline.state = "stale";
          pipeline.error =
            "The design changed while its review pipeline was running.";
          pipeline.endedAt = new Date().toISOString();
          this.store.put("review_rounds", pipeline);
          return;
        }
        const step = { ...pipeline.sequence[index], index },
          existing = listReviewThreads(this.store, {
            planId: plan.id,
          }).items,
          runId = `run-review-${digest(id + ":" + index).slice(0, 20)}`;
        pipeline.currentIndex = index;
        pipeline.nextIndex = index;
        pipeline.currentRunId = runId;
        pipeline.updatedAt = new Date().toISOString();
        this.store.put("review_rounds", pipeline);
        await this.execute("run.start", {
          id: runId,
          mode: "ask",
          planId: plan.id,
          projectId: pipeline.projectId,
          provider: step.provider,
          model: step.model || undefined,
          approvalMode: "manual",
          prompt: reviewPrompt({ plan, pipeline, step, existing }),
          title: `Review ${plan.title} · ${step.provider}`,
          review: {
            pipelineId: id,
            planId: plan.id,
            revisionHash: plan.hash,
            round: index + 1,
          },
          parentRunId: pipeline.parentRunId || undefined,
          background: true,
        });
        const run = await this.waitForReviewRun(runId);
        pipeline = this.store.get("review_rounds", id);
        pipeline.runs = [...(pipeline.runs || []), runId];
        pipeline.nextIndex = index + 1;
        pipeline.currentRunId = null;
        if (run.state !== "completed") {
          pipeline.state = "stopped";
          pipeline.error = `Review run ${runId} ended ${run.state}.`;
          pipeline.endedAt = new Date().toISOString();
          this.store.put("review_rounds", pipeline);
          return;
        }
        const newComments = this.store
          .list("review_threads")
          .filter((thread) => thread.runId === runId).length;
        pipeline.rounds = [
          ...(pipeline.rounds || []),
          {
            index: index + 1,
            provider: step.provider,
            model: step.model || null,
            runId,
            comments: newComments,
            completedAt: new Date().toISOString(),
          },
        ];
        this.store.put("review_rounds", pipeline);
        if (!newComments) {
          pipeline.state = "completed";
          pipeline.stopReason = "A reviewer found no new material issues.";
          pipeline.endedAt = new Date().toISOString();
          this.store.put("review_rounds", pipeline);
          return;
        }
      }
      pipeline = this.store.get("review_rounds", id);
      pipeline.state = "completed";
      pipeline.stopReason = "Configured review rounds completed.";
      pipeline.endedAt = new Date().toISOString();
      this.store.put("review_rounds", pipeline);
    } catch (error) {
      const pipeline = this.store.get("review_rounds", id);
      if (pipeline) {
        pipeline.state = "failed";
        pipeline.error = error.message;
        pipeline.endedAt = new Date().toISOString();
        this.store.put("review_rounds", pipeline);
      }
    } finally {
      this.reviewPipelines.delete(id);
    }
  }
  startReviewPipeline(input) {
    const plan = this.store.get("plans", input.planId);
    if (!plan) fail("Plan not found.", 404);
    if (!this.manager) fail("Start the Avoozl agent host first.", 503);
    if (!this.store.get("projects", input.projectId))
      fail("Choose a configured project for read-only review.");
    if (input.parentRunId) {
      const parent = this.store.get("runs", input.parentRunId);
      if (
        !parent?.driver ||
        parent.driverRole !== "project" ||
        parent.parentRunId ||
        parent.provider !== "openhands" ||
        parent.projectId !== input.projectId
      )
        fail(
          "The review parent must be this project’s top-level OpenHands Driver.",
          409,
        );
    }
    const maxRounds = Number(input.maxRounds ?? 3);
    if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 10)
      fail("Choose 1–10 review rounds.");
    const requested =
      input.sequence ||
      (input.provider
        ? [{ provider: input.provider, model: input.model }]
        : []);
    if (
      !Array.isArray(requested) ||
      !requested.length ||
      requested.some(
        (step) =>
          !step ||
          typeof step.provider !== "string" ||
          !step.provider.trim() ||
          (step.model !== undefined && typeof step.model !== "string"),
      )
    )
      fail("Choose at least one provider/model review step.");
    const sequence = Array.from(
      { length: maxRounds },
      (_, index) => requested[index % requested.length],
    );
    const pipeline = {
      id: input.id || "review-round-" + randomUUID(),
      planId: plan.id,
      revisionHash: plan.hash,
      projectId: input.projectId,
      parentRunId: input.parentRunId || null,
      sequence,
      maxRounds,
      state: "running",
      nextIndex: 0,
      rounds: [],
      runs: [],
      createdAt: new Date().toISOString(),
    };
    this.store.put("review_rounds", pipeline);
    queueMicrotask(() => this.runReviewPipeline(pipeline.id));
    return pipeline;
  }
  async reconcilePlanningPullRequests() {
    const receipts = this.store
      .list("receipts")
      .filter(
        (receipt) =>
          receipt.id.startsWith("planning-pr:") &&
          !["projected", "closed"].includes(receipt.state),
      );
    const result = [];
    for (const receipt of receipts) {
      await requirePrivateRepository(this.github, receipt.repository);
      const pull = await this.github.pullRequest(
        receipt.repository,
        receipt.number,
      );
      receipt.observedAt = new Date().toISOString();
      if (!pull.merged_at) {
        receipt.state = pull.state;
        this.store.put("receipts", receipt);
        result.push(receipt);
        continue;
      }
      receipt.state = "merged";
      receipt.mergedAt = pull.merged_at;
      receipt.mergeCommit = pull.merge_commit_sha;
      this.store.put("receipts", receipt);
      await syncWorkspaceRepository(this.store);
      const plan = this.store.get("plans", receipt.planId);
      if (!plan || plan.hash !== receipt.planHash || plan.state !== "approved")
        fail(
          "Merged planning revision did not hydrate as the approved design.",
          409,
        );
      const projection = await projectPlanIssues(this.store, this.github, {
        planId: receipt.planId,
      });
      receipt.state = "projected";
      receipt.projectedAt = new Date().toISOString();
      receipt.issueIds = projection.issues.map((issue) => issue.id);
      this.store.put("receipts", receipt);
      result.push(receipt);
    }
    return { items: result };
  }
  intentResult(receipt) {
    const run = receipt.runId ? this.store.get("runs", receipt.runId) : null,
      plan = receipt.planId ? this.store.get("plans", receipt.planId) : null,
      task = receipt.taskId
        ? this.read().tasks.find(
            (t) => t.id === resolveTaskId(this.read(), receipt.taskId),
          )
        : null,
      needsRun =
        receipt.input.action !== "task" &&
        !(
          receipt.input.action === "draft" &&
          (!receipt.input.provider || !receipt.input.projectId)
        );
    return {
      ...(run ? { run } : {}),
      ...(plan ? { plan } : {}),
      ...(task ? { task } : {}),
      ...(needsRun && !run
        ? {
            pending: true,
            submissionId: receipt.submissionId,
            runId: receipt.runId,
          }
        : {}),
    };
  }
  async submitIntent(input, expectedRevision) {
    if (
      typeof input.prompt !== "string" ||
      !input.prompt.trim() ||
      input.prompt.length > 20000
    )
      fail("Write a message.");
    const action = input.action || "task";
    if (!["task", "draft", "ask", "run"].includes(action))
      fail("Choose task, draft, ask or run.");
    const submissionId = input.submissionId || randomUUID(),
      id = "intent:" + submissionId,
      requestHash = digest(
        canonical({
          action,
          prompt: input.prompt,
          provider: input.provider,
          projectId: input.projectId,
          model: input.model,
          approvalMode: input.approvalMode,
          parentRunId: input.parentRunId,
        }),
      );
    let receipt = this.store.get("receipts", id);
    if (receipt && receipt.requestHash !== requestHash)
      fail(
        "This submission belongs to a different message. Start a new message.",
        409,
      );
    if (receipt) {
      const result = this.intentResult(receipt);
      if (!result.pending) return result;
    }
    if (this.pendingIntents.has(id)) return this.pendingIntents.get(id);
    const execute = async () => {
      if (!receipt) {
        receipt = {
          id,
          submissionId,
          requestHash,
          input: structuredClone({ ...input, submissionId }),
          runId: input.runId || "run-" + digest(submissionId).slice(0, 24),
          createdAt: new Date().toISOString(),
        };
        this.store.put("receipts", receipt);
      }
      const saved = receipt.input;
      const legacy = this.store.get("runs", receipt.runId);
      if (legacy) {
        if (
          legacy.prompt !== saved.prompt ||
          legacy.provider !== saved.provider ||
          legacy.projectId !== saved.projectId
        )
          fail("Run ID already belongs to another request.", 409);
        return this.intentResult(receipt);
      }
      if (action === "task") {
        const { task } = await this.execute(
          "task.capture",
          saved,
          expectedRevision,
        );
        receipt.taskId = task.id;
        this.store.put("receipts", receipt);
        return { task };
      }
      if (action === "draft") {
        const plan = createPlan(this.store, {
          ...saved,
          id: "plan-" + digest(submissionId).slice(0, 12),
        });
        receipt.planId = plan.id;
        this.store.put("receipts", receipt);
        if (!saved.provider || !saved.projectId) return { plan };
      }
      let taskId = resolveTaskId(this.read(), saved.context?.selected);
      if (!this.read().tasks.some((t) => t.id === taskId)) taskId = undefined;
      const contextPlanId =
        action === "ask" && typeof saved.context?.planId === "string"
          ? saved.context.planId
          : undefined;
      if (contextPlanId && !this.store.get("plans", contextPlanId))
        fail("Selected plan not found.", 404);
      if (action === "run" && !taskId) {
        const { task } = await this.execute(
          "task.capture",
          saved,
          expectedRevision,
        );
        taskId = task.id;
        receipt.taskId = taskId;
        this.store.put("receipts", receipt);
      }
      const run = await this.manager.start({
        id: receipt.runId,
        ...(receipt.planId || contextPlanId
          ? { planId: receipt.planId || contextPlanId }
          : {}),
        ...(taskId ? { taskId } : {}),
        mode:
          action === "ask" ? "ask" : action === "draft" ? "plan" : "implement",
        provider: saved.provider,
        projectId: saved.projectId,
        model: saved.model,
        approvalMode: saved.approvalMode,
        prompt: saved.prompt,
        context: saved.context,
        parentRunId: saved.parentRunId,
        // A caller-supplied title names the conversation in a client's list;
        // without one the first prompt line stands in.
        title: saved.title || saved.prompt.split("\n")[0].slice(0, 160),
        background: true,
      });
      receipt.acceptedAt = new Date().toISOString();
      this.store.put("receipts", receipt);
      return {
        ...(receipt.planId
          ? { plan: this.store.get("plans", receipt.planId) }
          : {}),
        run,
      };
    };
    const pending = execute();
    this.pendingIntents.set(id, pending);
    try {
      return await pending;
    } finally {
      if (this.pendingIntents.get(id) === pending)
        this.pendingIntents.delete(id);
    }
  }
  async execute(name, input = {}, expectedRevision) {
    const store = this.store;
    if (name === "client.describe")
      return describeWorkspace(store, { manager: this.manager });
    if (name === "workspace.examples") return listExamples();
    if (name === "workspace.seed")
      return seedExample(store, input, expectedRevision);
    if (
      [
        "task.update",
        "activity",
        "task.accept",
        "task.archive",
        "task.unarchive",
        "task.sessions",
      ].includes(name)
    )
      input = { ...input, id: resolveTaskId(this.read(), input.id) };
    if (input.taskId)
      input = { ...input, taskId: resolveTaskId(this.read(), input.taskId) };
    if (name === "task.duplicates")
      return input.title
        ? {
            items: duplicateCandidates(this.read(), input, {
              similar: true,
              limit: input.limit,
            }),
          }
        : duplicateAudit(this.read(), input);
    if (name === "task.merge")
      return mergeTasks(store, input, expectedRevision);
    if (name === "task.merge.get") {
      const receipt = store.get("evidence", input.id);
      if (receipt?.kind !== "task-merge") fail("Merge receipt not found.", 404);
      return receipt;
    }
    if (
      [
        "run.send",
        "run.interrupt",
        "run.resume",
        "run.approvals",
        "run.answer",
        "run.model",
        "run.unsend",
        "run.queue",
        "run.validate",
        "integration.merge",
      ].includes(name)
    ) {
      const id =
        name === "run.answer"
          ? store.get("requests", input.id)?.runId
          : input.id;
      if (id && store.get("runs", id)?.external)
        fail(
          "This is a read-only external transcript. Continue or steer it in its original Claude session; no duplicate agent will be launched.",
          409,
        );
    }
    if (name === "session.discover")
      return this.externalSessions.discover(input);
    if (name === "session.register")
      return this.externalSessions.register(input);
    if (this.manager?.remote && name === "driver.open")
      return this.openRemoteDriver(input);
    if (
      this.manager?.remote &&
      [
        "models",
        "usage.limits",
        "driver.context",
        "run.start",
        "run.send",
        "run.interrupt",
        "run.resume",
        "run.approvals",
        "run.answer",
        "run.model",
        "run.unsend",
        "run.queue",
        "run.validate",
        "integration.merge",
        "batch.start",
        "batch.control",
      ].includes(name)
    )
      return this.manager.command(name, input);
    if (name === "state") return this.read();
    if (name === "publication.retry") return { retryRequested: true };
    if (name === "metrics") return metrics(store, input);
    if (name === "conversations.settings.get")
      return conversationSettings(store);
    if (name === "conversations.settings.update")
      return this.configuration
        ? this.configuration.updateConversationSettings(input).settings
        : store.transaction(() => updateConversationSettings(store, input));
    if (name === "openhands.profiles") return openHandsAgentProfiles();
    if (name === "openhands.automations.capabilities")
      return this.openhandsAutomations.capabilities();
    if (name === "openhands.automations.setup")
      return this.openhandsAutomations.setup(input);
    if (name === "models") return this.manager.models(input.provider);
    if (name === "usage.limits") return this.manager.usage(input.provider);
    if (name === "query")
      return queryTasks(this.read(), { scope: "all", ...input });
    if (name === "search.prompt") {
      if (
        typeof input.prompt !== "string" ||
        !input.prompt.trim() ||
        input.prompt.length > 20000
      )
        fail("Describe the tasks to find.");
      if (!input.submissionId) fail("A search submission ID is required.");
      const data = this.read(),
        vocabulary = {
          statuses: data.statuses.map((s) => ({
            id: s.id,
            label: s.label,
            complete: s.complete,
          })),
          epics: data.epics.map((e) => ({ id: e.id, title: e.title })),
          tracks: data.tracks.map((t) => ({ id: t.id, label: t.label })),
          queryKeys: [
            "status",
            "scope",
            "epic",
            "track",
            "tag",
            "id",
            "kind",
            "ready",
            "inflight",
            "activity",
            "owner",
            "depends",
            "unblocks",
            "neighbors",
          ],
        };
      const prompt =
        'NUPP_PROMPT_SEARCH\nInterpret this task search using current evidence. Use read-only plans query/context tools as needed. Do not change tasks, plans, files or presentations. Return ONLY a JSON object {"query":"supported query terms","scope":"all or runtime","explanation":"brief interpretation"}. For a union that cannot be expressed by the AND query grammar, return {"query":"","scope":"all","ids":["exact existing task IDs"],"explanation":"..."}; at most 500 IDs. Empty ids means no results. Plain words match text. status:remaining excludes complete statuses. Repeated tags mean all those tags. Do not invent task IDs or statuses.\nVocabulary: ' +
        JSON.stringify(vocabulary) +
        "\nCurrent context: " +
        JSON.stringify(input.context || {}) +
        "\nUser search: " +
        input.prompt;
      const result = await this.execute("intent.submit", {
        ...input,
        action: "ask",
        prompt,
        context: {},
        runId: "run-search-" + digest(input.submissionId).slice(0, 12),
      });
      const run = store.get("runs", result.run.id);
      run.searchContext = input.context;
      run.searchPrompt = input.prompt;
      store.put("runs", run);
      return run;
    }
    if (name === "search.result") {
      const run = store.get("runs", input.id);
      if (!run || !run.prompt?.startsWith("NUPP_PROMPT_SEARCH"))
        fail("Prompt search not found.", 404);
      if (
        ["starting", "running", "waiting-input", "waiting-approval"].includes(
          run.state,
        )
      )
        return { pending: true, id: run.id };
      if (run.state !== "completed")
        fail(run.error || "Search stopped. Inspect its session in Workspace.");
      const row = store.db
        .prepare(
          "SELECT body FROM events WHERE run_id=? AND kind='message' ORDER BY seq DESC LIMIT 1",
        )
        .get(run.id);
      const text = row ? JSON.parse(row.body).text : "";
      let parsed;
      try {
        parsed = JSON.parse(
          text.replace(/^\s*```(?:json)?\s*/, "").replace(/\s*```\s*$/, ""),
        );
      } catch {
        fail(
          "The agent did not return a valid search. Its response is retained in Agent sessions.",
        );
      }
      if (
        typeof parsed.query !== "string" ||
        parsed.query.length > 4000 ||
        !["all", "runtime"].includes(parsed.scope)
      )
        fail("The agent returned an unsupported query.");
      const ids = parsed.ids;
      if (
        ids !== undefined &&
        (!Array.isArray(ids) ||
          ids.length > 500 ||
          ids.some((id) => !this.read().tasks.some((t) => t.id === id)))
      )
        fail("The search contains unknown or excessive task IDs.");
      const id = "search-" + run.id,
        existing = this.read().presentation?.views?.find((v) => v.id === id);
      if (existing) return { view: existing, explanation: existing.caption };
      const query = ids?.length === 0 ? "id:__no_matches__" : parsed.query,
        view = {
          id,
          title: "Search: " + (run.searchPrompt || "Tasks").slice(0, 100),
          caption: String(
            parsed.explanation || "Agent-interpreted search",
          ).slice(0, 2000),
          view: [
            "tasks",
            "activity",
            "graph",
            "epics",
            "strip",
            "report",
            "documents",
          ].includes(run.searchContext?.view)
            ? run.searchContext.view
            : "tasks",
          filters: { scope: parsed.scope, q: query },
          taskIds: ids || [],
          selected: "",
          group: run.searchContext?.group || "epic",
          detail: "all",
          createdAt: new Date().toISOString(),
          searchRunId: run.id,
        };
      store.mutate("Save prompt search", (data) => {
        data.presentation ??= { views: [] };
        data.presentation.views ??= [];
        data.presentation.views.push(view);
      });
      return { view, explanation: view.caption };
    }
    if (name === "task.get") return this.detail(input.id);
    if (name === "report.save")
      return store.mutate(
        "Save report " + (input.title || ""),
        (data) => {
          if (
            input.id !== undefined &&
            (typeof input.id !== "string" ||
              !/^report-[a-z0-9-]{4,80}$/.test(input.id))
          )
            fail("Invalid report id.");
          if (
            typeof input.title !== "string" ||
            !input.title.trim() ||
            input.title.length > 160
          )
            fail("Report title must contain 1–160 characters.");
          if (
            input.view !== undefined &&
            !["overview", "tasks", "epics", "graph", "documents"].includes(
              input.view,
            )
          )
            fail("Unknown report view.");
          if (
            input.filters !== undefined &&
            (!input.filters ||
              typeof input.filters !== "object" ||
              Array.isArray(input.filters))
          )
            fail("Report filters must be an object.");
          const filters = {};
          for (const key of [
            "query",
            "scopes",
            "work",
            "statuses",
            "epics",
            "tracks",
            "tags",
            "activity",
            "historical",
          ]) {
            if (!Object.hasOwn(input.filters || {}, key)) continue;
            const value = input.filters[key];
            if (
              key === "historical"
                ? typeof value !== "boolean"
                : key === "query"
                  ? typeof value !== "string" || value.length > 2000
                  : !Array.isArray(value) ||
                    value.length > 500 ||
                    value.some(
                      (item) => typeof item !== "string" || item.length > 2000,
                    )
            )
              fail("Invalid report filter " + key + ".");
            filters[key] = structuredClone(value);
          }
          data.savedSearches ??= [];
          const now = new Date().toISOString(),
            existing = input.id
              ? data.savedSearches.find((item) => item.id === input.id)
              : null,
            record = {
              id: existing?.id || "report-" + randomUUID().slice(0, 12),
              title: input.title.trim(),
              view: input.view || existing?.view || "tasks",
              filters,
              createdAt: existing?.createdAt || now,
              updatedAt: now,
            };
          if (input.id && !existing) fail("Saved report not found.", 404);
          if (existing)
            data.savedSearches[data.savedSearches.indexOf(existing)] = record;
          else data.savedSearches.push(record);
          return record;
        },
        expectedRevision,
      );
    if (name === "report.delete")
      return store.mutate(
        "Delete report " + input.id,
        (data) => {
          if (typeof input.id !== "string") fail("Invalid report id.");
          const existing = data.savedSearches?.find(
            (item) => item.id === input.id,
          );
          if (!existing) fail("Saved report not found.", 404);
          data.savedSearches = data.savedSearches.filter(
            (item) => item.id !== input.id,
          );
          return existing;
        },
        expectedRevision,
      );
    if (name === "agent.instructions.toggle")
      return store.mutate(
        (input.enabled ? "Enable " : "Disable ") +
          "agent instruction " +
          input.id,
        (data) =>
          toggleAgentInstruction(data, input.id, Boolean(input.enabled)),
        expectedRevision,
      );
    if (["task.archive", "task.unarchive"].includes(name))
      return store.mutate(
        (name === "task.archive" ? "Archive " : "Restore ") + input.id,
        (data) => {
          const task = data.tasks.find((item) => item.id === input.id);
          if (!task) fail("Task not found.", 404);
          task.archivedAt =
            name === "task.archive"
              ? task.archivedAt || new Date().toISOString()
              : null;
          task.updatedAt = new Date().toISOString();
          return task;
        },
        expectedRevision,
      );
    if (["run.archive", "run.unarchive"].includes(name))
      return store.transaction(() => {
        const run = store.get("runs", input.id);
        if (!run || run.deletedAt) fail("Conversation not found.", 404);
        const key = "runArchive:" + run.id,
          old = store.getMeta(key),
          archivedAt =
            name === "run.archive" ? old || new Date().toISOString() : null;
        if (old !== archivedAt) {
          store.setMeta(key, archivedAt);
          store.event(run.id, name, { id: run.id, archivedAt });
        }
        return { id: run.id, archivedAt };
      });
    if (
      ["run.delete", "plan.delete", "run.restore", "plan.restore"].includes(
        name,
      )
    )
      return store.transaction(() => {
        const kind = name.startsWith("run.") ? "runs" : "plans",
          row = store.get(kind, input.id);
        if (!row) fail("Record not found.", 404);
        if (
          kind === "runs" &&
          ["starting", "running", "waiting-input", "waiting-approval"].includes(
            row.state,
          )
        )
          fail("Stop this session before deleting it.", 409);
        if (
          kind === "plans" &&
          (row.state === "approved" || Object.keys(row.mapping || {}).length)
        )
          fail(
            "Approved plans keep their task and approval history. Abandon the linked work instead.",
            409,
          );
        if (name.endsWith(".restore")) delete row.deletedAt;
        else row.deletedAt = new Date().toISOString();
        store.put(kind, row);
        store.event(kind === "runs" ? row.id : null, name, { id: row.id });
        return { id: row.id, deletedAt: row.deletedAt || null };
      });
    // Saved views and presentations are display configuration. Deleting one
    // removes that configuration only: tasks, plans and evidence are untouched.
    if (name === "visualization.delete") {
      if (typeof input.id !== "string" || !input.id)
        fail("Name the saved view to delete.");
      const tours = input.kind === "tour",
        list = tours ? "tours" : "views",
        label = tours ? "presentation" : "view";
      let removed = null;
      store.mutate(
        "Delete saved " + label,
        (data) => {
          data.presentation ??= {};
          data.presentation[list] ??= [];
          removed =
            data.presentation[list].find((v) => v.id === input.id) || null;
          if (!removed) fail("Saved " + label + " not found.", 404);
          data.presentation[list] = data.presentation[list].filter(
            (v) => v.id !== input.id,
          );
          if (data.presentation.activeVisualization?.id === input.id)
            delete data.presentation.activeVisualization;
          if (data.presentation.activeTour?.id === input.id)
            delete data.presentation.activeTour;
          // A presentation step cannot point at a view that no longer exists.
          if (!tours) {
            const kept = [];
            for (const tour of data.presentation.tours || []) {
              tour.steps = (tour.steps || []).filter(
                (step) => step.viewId !== input.id,
              );
              if (tour.steps.length) kept.push(tour);
              else if (data.presentation.activeTour?.id === tour.id)
                delete data.presentation.activeTour;
            }
            if (data.presentation.tours) data.presentation.tours = kept;
          }
        },
        expectedRevision,
      );
      return { id: input.id, kind: label, title: removed?.title || input.id };
    }
    if (name === "trash")
      return {
        runs: store
          .list("runs")
          .filter((r) => r.deletedAt)
          .slice(-100)
          .map((r) => ({
            id: r.id,
            title: r.title || r.prompt?.slice(0, 160) || r.id,
          })),
        plans: store
          .list("plans")
          .filter((p) => p.deletedAt)
          .slice(-100)
          .map((p) => ({ id: p.id, title: p.title })),
      };
    if (name === "run.list") return runPage(store, input);
    if (name === "driver.list") {
      const projects = store.list("projects"),
        runs = store.list("runs");
      return {
        projects: projects.map((project) => ({
          projectId: project.id,
          title: project.name || project.title || project.id,
          root: project.root,
          run:
            runs
              .filter(
                (run) =>
                  run.driver === true &&
                  run.projectId === project.id &&
                  run.driverActive !== false &&
                  !run.deletedAt,
              )
              .sort(
                (left, right) =>
                  (right.driverGeneration || 1) -
                    (left.driverGeneration || 1) ||
                  String(right.createdAt || "").localeCompare(
                    String(left.createdAt || ""),
                  ),
              )[0] || null,
        })),
        defaultProjectId: projects.length === 1 ? projects[0].id : null,
      };
    }
    if (name === "driver.open") return this.manager.openDriver(input);
    if (name === "driver.context")
      return this.manager.updateDriverContext(input);
    if (name === "task.sessions") {
      const task = this.read().tasks.find((t) => t.id === input.id);
      if (!task) fail("Task not found.", 404);
      return taskSessions(store, {
        taskId: task.id,
        sessionId: task.activity?.connection?.runId || task.activity?.sessionId,
      });
    }
    if (name === "plan.list") return planPage(store, input);
    if (name === "document.get") {
      const doc = this.read().documents[input.id];
      if (!doc) fail("Document not found.", 404);
      return doc;
    }
    if (name === "workspace") {
      const runs = runPage(store, { archived: "all" }),
        plans = planPage(store);
      return {
        mode: store.getMeta("mode"),
        import: store.getMeta("import"),
        revision: this.read().revision,
        publication: {
          pending: store.db
            .prepare(
              "SELECT id,path,state FROM outbox WHERE state<>'published' LIMIT 100",
            )
            .all(),
          last: store.getMeta("publication") || [],
        },
        plans: plans.items,
        planTotal: plans.total,
        runs: runs.items,
        runTotal: runs.total,
        requests: pendingRequests(store),
        batches: store.list("batches").slice(0, 40),
        integrations: store
          .list("integration")
          .filter((i) => i.state === "ready")
          .slice(0, 40),
        recentIntegrations: recentIntegrations(store),
        conversationSettings: conversationSettings(store),
        configuration: this.configuration?.metadata() || null,
        projects: store.list("projects"),
        github: {
          available: this.github.available(),
          machine: machineIdentity(store),
          repositories: store.list("github_repositories"),
          issues: store.list("github_issues").slice(0, 100),
          lastSync: store.getMeta("githubSync"),
          queue: {
            repositories: store.list("github_queue_repositories"),
            lastSync: store.getMeta("githubQueueSync"),
          },
        },
        workspaceRepository: workspaceRepositoryStatus(store),
        agentHost: this.manager?.remote
          ? await this.manager.status()
          : { connected: true },
        providers: (await this.manager?.providers()) || [],
        audit: auditPlans(this.read()),
        lastEvent: store.db
          .prepare("SELECT COALESCE(MAX(seq),0) seq FROM events")
          .get().seq,
      };
    }
    if (name === "task.capture")
      return store.mutate(
        "Capture prompt",
        (data) => captureTask(data, input),
        expectedRevision,
      );
    if (name === "intent.submit")
      return this.submitIntent(input, expectedRevision);
    if (name === "intent.get") {
      const receipt = store.get("receipts", "intent:" + input.submissionId);
      if (!receipt) fail("Submission not found.", 404);
      return this.intentResult(receipt);
    }
    if (name === "task.update")
      return store.mutate(
        "Update " + input.id,
        (data) => {
          let task = data.tasks.find((t) => t.id === input.id);
          if (!task) {
            if (!input.create || !/^[a-z][a-z0-9-]{2,80}$/.test(input.id || ""))
              fail("Task not found.", 404);
            requireDistinctTask(data, { ...input, id: input.id });
            task = {
              id: input.id,
              scope: "catalog",
              kind: "task",
              status: "planned",
              epic: "inbox",
              track: "catalog",
              tags: [],
            };
            if (!data.epics.some((e) => e.id === "inbox"))
              data.epics.push({
                id: "inbox",
                title: "Inbox",
                scope: "catalog",
              });
            data.tasks.push(task);
          }
          if (
            input.title &&
            (input.title !== task.title || input.distinctReason)
          ) {
            const candidates = requireDistinctTask(data, {
              ...input,
              id: task.id,
            });
            if (input.distinctReason?.trim())
              task.distinctFrom = {
                ...task.distinctFrom,
                ...Object.fromEntries(
                  candidates.map((t) => [t.id, input.distinctReason.trim()]),
                ),
              };
          }
          for (const key of [
            "title",
            "summary",
            "status",
            "epic",
            "track",
            "tags",
            "notes",
            "nextAction",
            "acceptance",
            "owner",
            "overview",
            "rank",
            "needsReview",
            "evidence",
            "resources",
          ])
            if (Object.hasOwn(input, key)) task[key] = input[key];
          if (
            typeof task.title !== "string" ||
            !task.title.trim() ||
            task.title.length > 240
          )
            fail("Title must contain 1–240 characters.");
          for (const key of ["summary", "notes", "nextAction", "owner"])
            if (task[key] !== undefined && typeof task[key] !== "string")
              fail(key + " must be text.");
          for (const key of ["tags", "acceptance", "evidence", "resources"])
            if (
              task[key] !== undefined &&
              (!Array.isArray(task[key]) ||
                task[key].some((v) => typeof v !== "string"))
            )
              fail(key + " must be a list of strings.");
          if (!data.tracks.some((t) => t.id === task.track))
            fail("Unknown track.");
          if (
            !data.epics.some((e) => e.id === task.epic) &&
            !data.documents[task.epic.replace(/^doc:/, "")]
          )
            fail("Unknown epic.");
          if (input.requires !== undefined) {
            if (
              !Array.isArray(input.requires) ||
              input.requires.some((x) => typeof x !== "string")
            )
              fail("Requires must contain task IDs.");
            data.edges = data.edges.filter(
              (e) => e.to !== task.id || e.kind !== "requires",
            );
            for (const from of new Set(
              input.requires.map((id) => resolveTaskId(data, id)),
            ))
              data.edges.push({
                id: `${from}:requires:${task.id}`,
                from,
                to: task.id,
                kind: "requires",
                reason: "Authored task dependency.",
              });
          }
          if (Object.hasOwn(input, "integration")) {
            const receipt = input.integration;
            if (
              !receipt ||
              typeof receipt !== "object" ||
              Array.isArray(receipt) ||
              typeof receipt.commit !== "string" ||
              typeof receipt.at !== "string" ||
              !/^[a-f0-9]{7,64}$/i.test(receipt.commit || "") ||
              !Number.isFinite(Date.parse(receipt.at)) ||
              Date.parse(receipt.at) > Date.now() + 60000 ||
              typeof receipt.branch !== "string" ||
              !receipt.branch.trim() ||
              receipt.branch.length > 240 ||
              typeof receipt.repo !== "string" ||
              !receipt.repo.trim() ||
              receipt.repo.length > 1000 ||
              !Array.isArray(receipt.evidence) ||
              !receipt.evidence.length ||
              receipt.evidence.some(
                (e) => typeof e !== "string" || !e.trim() || e.length > 2000,
              )
            )
              fail(
                "Integration requires a commit, landing time, branch, repository and evidence.",
              );
            task.integration = {
              commit: receipt.commit,
              at: new Date(receipt.at).toISOString(),
              branch: receipt.branch,
              repo: receipt.repo,
              evidence: [...new Set(receipt.evidence)],
              recordedAt: new Date().toISOString(),
            };
            task.evidence = [
              ...new Set([...(task.evidence || []), ...receipt.evidence]),
            ];
          }
          task.statusAuthority = "database";
          task.updatedAt = new Date().toISOString();
          task.needsReview = input.needsReview ?? false;
          return task;
        },
        expectedRevision,
      );
    if (name === "activity")
      return store.mutate(
        "Report activity",
        (data) => applyActivity(data, input),
        expectedRevision,
      );
    if (name === "plan.classify")
      return store.mutate(
        "Classify " + input.id,
        (data) => {
          applyPlanMetadata(data, input.id, input);
          return data.documents[input.id];
        },
        expectedRevision,
      );
    if (name === "document.update")
      return store.mutate(
        "Edit " + input.id,
        (data) => {
          const doc = data.documents[input.id];
          if (!doc) fail("Document not found.", 404);
          if (doc.hash !== input.expectedHash) fail("Document changed.", 409);
          if (typeof input.text !== "string" || input.text.length > 1000000)
            fail("Document text is required.");
          const oldHash = doc.hash;
          doc.text = input.text;
          doc.hash = digest(input.text);
          doc.modifiedAt = new Date().toISOString();
          for (const task of data.tasks.filter(
            (t) =>
              t.source?.document === doc.id ||
              t.contextDocuments?.includes(doc.id),
          ))
            task.needsReview = true;
          store.db
            .prepare(
              "INSERT INTO outbox(id,path,text,expected_hash) VALUES (?,?,?,?)",
            )
            .run(randomUUID(), doc.path, doc.text, oldHash);
          return doc;
        },
        expectedRevision,
      );
    if (name === "plan.create") return createPlan(store, input);
    if (name === "plan.save") return savePlan(store, input);
    if (name === "plan.propose") return proposeWork(store, input);
    if (name === "plan.get") {
      const plan = store.get("plans", input.id);
      if (!plan) fail("Plan not found.", 404);
      return {
        ...plan,
        quality: lintPlan({
          text: plan.text,
          plan,
          data: { ...this.read(), projects: store.list("projects") },
        }),
        approvals: store.list("approvals").filter((a) => a.planId === plan.id),
        reviews: listReviewThreads(store, { planId: plan.id }).items,
        reviewPipelines: store
          .list("review_rounds")
          .filter((round) => round.planId === plan.id),
      };
    }
    if (name === "plan.lint") {
      const plan = store.get("plans", input.id);
      if (!plan) fail("Plan not found.", 404);
      const text = input.text ?? plan.text;
      if (typeof text !== "string" || text.length > 1000000)
        fail("Plan text is required.");
      return lintPlan({
        text,
        plan,
        data: { ...this.read(), projects: store.list("projects") },
      });
    }
    if (name === "plan.preview") {
      const plan = store.get("plans", input.id);
      if (!plan) fail("Plan not found.", 404);
      const text = input.text ?? plan.text;
      // Read-only: show exactly what approving this revision would extract,
      // without creating anything. Approval remains a separate operation.
      const data = this.read(),
        proposals = extractPlan(text),
        mapping = Object.fromEntries(
          proposals.map((p) => [
            p.id,
            resolveTaskId(
              data,
              p.taskId || plan.mapping?.[p.id] || `${plan.id}-${p.id}`,
            ),
          ]),
        );
      const existing = new Set(data.tasks.map((t) => t.id));
      const quality = lintPlan({
        text,
        plan,
        data: { ...data, projects: store.list("projects") },
      });
      return {
        planId: plan.id,
        reviewedHash: digest(text),
        currentHash: plan.hash,
        state: plan.state,
        quality,
        // Send this back as expectedRevision when approving.
        expectedRevision: data.revision,
        approved: store
          .list("approvals")
          .some((a) => a.planId === plan.id && a.hash === digest(text)),
        tasks: proposals.map((p) => ({
          localId: p.id,
          taskId: mapping[p.id],
          title: p.title,
          acceptance: p.acceptance,
          existing: existing.has(mapping[p.id]),
          lineStart: p.lineStart,
          lineEnd: p.lineEnd,
        })),
        dependencies: proposals.flatMap((p) =>
          ["requires", "sequence", "supports"].flatMap((kind) =>
            (p[kind] || []).map((ref) => ({
              kind,
              from: mapping[ref] || ref,
              to: mapping[p.id],
              known: existing.has(mapping[ref] || ref) || Boolean(mapping[ref]),
            })),
          ),
        ),
        retiring: Object.keys(plan.mapping || {}).filter((id) => !mapping[id]),
      };
    }
    if (name === "plan.approve") {
      const plan = store.get("plans", input.id);
      if (!plan) fail("Plan not found.", 404);
      if (plan.hash !== input.expectedHash)
        fail("The reviewed document hash changed.", 409);
      const quality = lintPlan({
        text: plan.text,
        plan,
        data: { ...this.read(), projects: store.list("projects") },
      });
      const blocking = quality.diagnostics.find(
        (diagnostic) => diagnostic.severity === "error",
      );
      if (blocking)
        fail(
          `Resolve plan diagnostic ${blocking.code} before approval: ${blocking.message}`,
          409,
        );
      return approvePlan(store, {
        ...input,
        approvedBy: input.approvedBy?.trim() || this.operator,
        operator: input.operator || this.operator,
        expectedRevision: input.expectedRevision ?? expectedRevision,
      });
    }
    if (name === "plan.review.list") return listReviewThreads(store, input);
    if (name === "plan.review.submit") {
      const run = input.runId ? store.get("runs", input.runId) : null;
      if (
        run &&
        (run.review?.planId !== input.planId ||
          run.review?.revisionHash !== input.revisionHash)
      )
        fail("This run is not authorized to review that plan revision.", 403);
      return createReviewThreads(store, {
        ...input,
        author: input.author || run?.provider || this.operator,
        provider: input.provider || run?.provider,
        model: input.model || run?.actualModel || run?.model,
      });
    }
    if (name === "plan.review.reply")
      return replyToReview(store, {
        ...input,
        author: input.author || this.operator,
      });
    if (name === "plan.review.dispose")
      return disposeReview(store, {
        ...input,
        author: input.author || this.operator,
      });
    if (name === "plan.review.apply")
      return applyReviewSuggestion(store, {
        ...input,
        author: input.author || this.operator,
      });
    if (name === "plan.review.pipeline") return this.startReviewPipeline(input);
    if (name === "plan.review.pipeline.get") {
      const round = store.get("review_rounds", input.id);
      if (!round) fail("Review pipeline not found.", 404);
      return round;
    }
    if (name === "github.project.detect")
      return projectGitHubRepository(store, input);
    if (name === "github.project.connect") {
      this.configuration?.assertWritable();
      const detected = input.repository
          ? { projectId: input.projectId, repository: input.repository }
          : await projectGitHubRepository(store, input),
        configuration = {
          ...input,
          repository: detected.repository,
          projectId: detected.projectId,
        },
        execution = await configureGitHubRepository(
          store,
          this.github,
          configuration,
        ),
        queue = await configureGitHubQueueRepository(
          store,
          this.github,
          configuration,
        );
      this.configuration?.updateGitHubProjectConnection(execution, queue);
      return { repository: detected.repository, execution, queue };
    }
    if (name === "github.configure") {
      this.configuration?.assertWritable();
      const configured = await configureGitHubRepository(
        store,
        this.github,
        input,
      );
      this.configuration?.updateGitHubIssueIntake(configured);
      return configured;
    }
    if (name === "github.repositories")
      return {
        available: this.github.available(),
        machine: machineIdentity(store),
        items: store.list("github_repositories"),
      };
    if (name === "github.queue.configure") {
      this.configuration?.assertWritable();
      const configured = await configureGitHubQueueRepository(
        store,
        this.github,
        input,
      );
      this.configuration?.updateGitHubQueue(configured);
      return configured;
    }
    if (name === "github.queue.remove") {
      this.configuration?.assertWritable();
      const removed = removeGitHubQueueRepository(store, input);
      this.configuration?.removeGitHubQueue(removed.id);
      return removed;
    }
    if (name === "github.issues")
      return {
        items: store.list("github_issues"),
        lastSync: store.getMeta("githubSync"),
      };
    if (name === "queue.items")
      return githubQueueItems(store, this.github, input);
    if (name === "queue.sync")
      return {
        ...(await syncGitHubQueue(store, this.github, input)),
        queue: githubQueueItems(store, this.github, input),
      };
    if (name === "queue.createTask")
      return createTaskFromQueueItem(
        store,
        this.github,
        input,
        expectedRevision,
      );
    if (name === "queue.confirmLink")
      return confirmQueueItemLink(
        store,
        {
          ...input,
          confirmedBy: this.operator || undefined,
        },
        expectedRevision,
      );
    if (name === "github.sync") {
      const result = await syncGitHubIssues(store, this.github, input);
      const starts = [];
      if (input.autoStart) {
        for (const record of result.authorized) {
          const config = store.get("github_repositories", record.repository);
          if (!config?.autoStart || !config.provider || !this.manager) continue;
          const active = store
            .list("runs")
            .some(
              (run) =>
                run.taskId === record.taskId &&
                !["completed", "interrupted", "failed", "integrated"].includes(
                  run.state,
                ),
            );
          if (!active)
            starts.push(
              await startAuthorizedIssue(this, {
                taskId: record.taskId,
                background: true,
              }),
            );
        }
      }
      return { ...result, starts };
    }
    if (name === "github.authorize")
      return syncGitHubIssues(store, this.github, {
        repository: input.repository,
        authorize: {
          id: input.id,
          bodyHash: input.bodyHash,
          labelEventId: input.labelEventId,
        },
      });
    if (name === "github.project")
      return projectPlanIssues(store, this.github, input);
    if (name === "github.start") {
      if (!this.manager) fail("Start the Avoozl agent host first.", 503);
      return startAuthorizedIssue(this, input);
    }
    if (name === "workspace.repository.configure") {
      this.configuration?.assertWritable();
      const configured = await configureWorkspaceRepository(
        store,
        input,
        this.github,
      );
      this.configuration?.updatePlanningRepository(configured);
      return configured;
    }
    if (name === "workspace.repository.status")
      return workspaceRepositoryStatus(store);
    if (name === "workspace.repository.publish") {
      const config = store.getMeta("workspaceRepository");
      if (config?.repository)
        await requirePrivateRepository(this.github, config.repository);
      return publishWorkspaceRepository(store, input);
    }
    if (name === "workspace.repository.sync") {
      const config = store.getMeta("workspaceRepository");
      if (config?.repository)
        await requirePrivateRepository(this.github, config.repository);
      return syncWorkspaceRepository(store);
    }
    if (name === "planning.publish")
      return publishPlanningPullRequest(store, this.github, input);
    if (name === "planning.reconcile")
      return this.reconcilePlanningPullRequests();
    if (name === "project.configure") {
      const project = await projectConfig(input);
      this.configuration?.assertWritable();
      const configured = store.put("projects", project);
      this.configuration?.updateExecutionProject(configured);
      return configured;
    }
    if (name === "run.start") return this.manager.start(input);
    if (name === "run.context") {
      const run = store.get("runs", input.runId);
      if (!run) fail("Run not found.", 404);
      const project = run.projectId
        ? store.get("projects", run.projectId)
        : null;
      return {
        runId: run.id,
        title: run.title || null,
        context: run.context || {},
        project: project
          ? {
              id: project.id,
              title: project.name || project.title || project.id,
              root: project.root,
            }
          : null,
        timestamp:
          run.driverContextUpdatedAt || run.updatedAt || run.createdAt || null,
      };
    }
    if (name === "run.send") return this.manager.send(input);
    if (name === "run.interrupt")
      return this.manager.interrupt(input.id, { reason: input.reason });
    if (name === "run.resume") return this.manager.resume(input);
    if (name === "run.approvals") return this.manager.approvals(input);
    if (name === "run.answer") return this.manager.answer(input);
    if (name === "run.model") return this.manager.setModel(input);
    if (name === "run.unsend") return this.manager.cancelDelivery(input);
    if (name === "run.queue") return this.manager.reorderQueue(input);
    if (name === "run.event") {
      const row = store.db
        .prepare("SELECT * FROM events WHERE seq=? AND run_id=?")
        .get(input.seq, input.id);
      if (!row) fail("Event not found.", 404);
      return {
        seq: row.seq,
        kind: row.kind,
        at: row.at,
        ...JSON.parse(row.body),
      };
    }
    if (name === "run.get") {
      const run = store.get("runs", input.id);
      if (!run) fail("Run not found.", 404);
      run.archivedAt = store.getMeta("runArchive:" + run.id);
      if (run.external) return this.externalSessions.get(run, input);
      const events = store.events({
          runId: run.id,
          after: input.after || 0,
          before: input.before,
          latest: input.after === undefined,
          limit: input.limit || 200,
        }),
        first = events[0]?.seq || 0;
      return {
        ...run,
        events: input.compact ? events.map(compactEvent) : events,
        hasEarlier: Boolean(
          first &&
            store.db
              .prepare("SELECT 1 FROM events WHERE run_id=? AND seq<? LIMIT 1")
              .get(run.id, first),
        ),
        deliveries: store.db
          .prepare(
            "SELECT body FROM deliveries WHERE run_id=? ORDER BY rowid DESC LIMIT 100",
          )
          .all(run.id)
          .map((r) => JSON.parse(r.body))
          .reverse(),
        requests: store.db
          .prepare(
            "SELECT body FROM requests WHERE json_extract(body,'$.runId')=? AND json_extract(body,'$.state')='pending' ORDER BY rowid LIMIT 100",
          )
          .all(run.id)
          .map((r) => JSON.parse(r.body)),
      };
    }
    if (name === "run.changes") return runChanges(store, input);
    if (name === "run.validate") return validateRun(store, input.id);
    if (name === "batch.start") return this.batches.start(input);
    if (name === "batch.control") return this.batches.control(input);
    if (name === "integration.merge") {
      const entry = await integrateRun(store, input);
      await this.manager?.landed(entry.runId);
      return entry;
    }
    if (name === "task.accept") {
      // Acceptance evidence that already exists should not have to be retyped:
      // a validated run recorded what ran, against which commit, and with
      // what exit code. A caller with something further to say still can.
      const recorded = input.evidence?.trim()
        ? null
        : this.acceptanceFromValidation(input.id);
      const autoArchive = conversationSettings(store).autoArchiveCompleted,
        task = store.mutate(
          "Accept " + input.id,
          (data) => {
            const task = data.tasks.find((t) => t.id === input.id);
            if (!task) fail("Task not found.", 404);
            if (!task.integration && !input.componentOnly)
              fail("Record integration before whole-head acceptance.");
            task.acceptanceEvidence = {
              at: new Date().toISOString(),
              evidence:
                input.evidence?.trim() || validatedEvidence(store, data, task),
              ...(recorded ? { derivedFrom: recorded.evidenceIds } : {}),
              ...(this.operator ? { acceptedBy: this.operator } : {}),
              componentOnly: Boolean(input.componentOnly),
            };
            task.status = input.componentOnly ? "implemented" : "accepted";
            if (!input.componentOnly && autoArchive)
              task.archivedAt = task.archivedAt || task.acceptanceEvidence.at;
            return task;
          },
          expectedRevision,
        );
      if (autoArchive && !input.componentOnly)
        for (const run of store
          .list("runs")
          .filter(
            (run) =>
              resolveTaskId(this.read(), run.taskId) === task.id &&
              run.state === "completed",
          ))
          autoArchiveCompletedRun(store, run, task.acceptanceEvidence.at);
      return task;
    }
    if (name === "handoff") {
      const run = store.get("runs", input.id);
      if (run)
        return {
          run,
          task: this.read().tasks.find((t) => t.id === run.taskId) || null,
          plan: run.planId ? store.get("plans", run.planId) : null,
          requests: store.list("requests").filter((r) => r.runId === run.id),
          deliveries: store
            .list("deliveries")
            .filter((d) => d.runId === run.id),
          evidence: store.list("evidence").filter((e) => e.runId === run.id),
          reconnect:
            "Inspect durable state and uncertain delivery receipts before resuming. Keep the same provider session ID; never start duplicate work because a check-in is stale.",
        };
      const task = this.detail(input.id);
      return {
        task,
        design: task.documents,
        prerequisites: task.relationships
          .filter((e) => e.to === task.id)
          .map((e) => this.read().tasks.find((t) => t.id === e.from)),
        runs: task.runs,
        evidence: task.evidenceRecords,
        nextAction: task.nextAction,
        agentInstructions: matchingAgentInstructions(
          this.read(),
          "task.implement",
          task,
        ),
        policy:
          "Task evidence, integration and acceptance are separate. Preserve existing worktrees and do not open GitHub issues. Work discovered while implementing has three dispositions: in scope for this task, do it and record the evidence here, which is the normal case; related to this plan but out of scope, append one proposed task block with plan.propose, which makes this plan read as changed until its next approval; needing a different design, write a new plan draft and tell the user. Filing anything is the exception; do not capture discoveries as new request tasks.",
      };
    }
    if (name === "queue") {
      const data = this.read(),
        active = store
          .list("runs")
          .filter((r) =>
            [
              "starting",
              "running",
              "waiting-input",
              "waiting-approval",
            ].includes(r.state),
          ),
        ready = queryTasks(data, {
          scope: "all",
          ...input,
          q: [input.q, "ready:true"].filter(Boolean).join(" "),
        });
      const ranked = ready
        .map((t) => ({
          ...t,
          unblocks: data.edges.filter(
            (e) =>
              ["requires", "sequence"].includes(e.kind) &&
              e.from === t.id &&
              !statusComplete(
                data,
                data.tasks.find((x) => x.id === e.to)?.status,
              ),
          ).length,
          conflicts: active
            .filter(
              (r) =>
                resolveTaskId(data, r.taskId) === t.id ||
                (r.resources || []).some((x) =>
                  (t.resources || []).includes(x),
                ),
            )
            .map((r) => r.id),
        }))
        .sort((a, b) => b.unblocks - a.unblocks);
      const visible = data.tasks.filter((t) => !isPlanInventory(data, t)),
        blocked = visible
          .map((t) => ({ task: t, signals: taskSignals(data, t) }))
          .filter(
            ({ task, signals }) =>
              !signals.complete &&
              (task.status === "blocked" || signals.blockers.length),
          ),
        taskMap = new Map(data.tasks.map((t) => [t.id, t]));
      return {
        summary: {
          ready: ranked.length,
          blocked: blocked.length,
          active: active.length,
        },
        blocked: blocked.slice(0, 40).map(({ task, signals }) => ({
          id: task.id,
          title: task.title,
          nextAction: task.nextAction,
          summary: task.summary,
          blockers: signals.blockers.map((id) => ({
            id,
            title: taskMap.get(id)?.title || id,
            status: taskMap.get(id)?.status,
          })),
        })),
        ready: ranked.slice(
          0,
          Math.max(1, Math.min(100, Number(input.limit) || 40)),
        ),
        readyTotal: ranked.length,
        active,
        integrations: store
          .list("integration")
          .filter((i) => i.state === "ready"),
      };
    }
    if (name === "legacy.mcp")
      return dispatchMcp(
        input.message,
        {
          read: () => this.read(),
          commit: (next, summary) =>
            store.transaction(() => store.commit(next, summary, next.revision)),
          base: input.base,
        },
        { versionHeader: input.versionHeader },
      );
    fail("Unknown operation " + name, 404);
  }
}
