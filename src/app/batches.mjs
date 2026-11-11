import { randomUUID } from "node:crypto";
import { queryTasks, statusComplete } from "../query.mjs";
import { resolveTaskId } from "../task-identity.mjs";
import { validateRun, integrateRun } from "./git.mjs";
import { approvalMode } from "./approvals.mjs";
import { fail } from "./store.mjs";
const ACTIVE = new Set([
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
]);
export class Batches {
  constructor(store, manager) {
    this.store = store;
    this.manager = manager;
    this.working = new Set();
    this.wake = new Set();
    manager.onEvent = (id, kind) => {
      if (["turn.completed", "disconnected"].includes(kind))
        for (const batch of store
          .list("batches")
          .filter((b) => b.state === "running" && b.runIds.includes(id)))
          queueMicrotask(() => this.advance(batch.id));
    };
    for (const batch of store
      .list("batches")
      .filter((b) => b.state === "running")) {
      batch.state = "paused";
      batch.reason =
        "Application restarted. Resume the authorized batch explicitly.";
      store.put("batches", batch);
    }
  }
  async start(input) {
    const taskIds = [...new Set(input.taskIds || [])];
    if (!taskIds.length || taskIds.length > 100)
      fail("Choose 1–100 explicitly authorized tasks.");
    if (!this.store.get("projects", input.projectId))
      fail("Configure a project first.");
    const parallelism = input.parallelism ?? 2;
    if (!Number.isInteger(parallelism) || parallelism < 1 || parallelism > 4)
      fail("Parallelism must be 1–4.");
    const providers = input.providers || [input.provider || "codex"];
    if (
      !providers.length ||
      providers.some((provider) => !this.manager.registry?.has(provider))
    )
      fail("Choose an available executor.");
    if (providers.length > 1 && input.model)
      fail("Use models keyed by provider for a mixed-provider batch.");
    const models = input.models || {};
    if (input.model) models[providers[0]] = input.model;
    const data = this.store.read();
    for (const id of taskIds)
      if (!data.tasks.some((t) => t.id === id)) fail("Unknown task " + id);
    const batch = {
      id: input.id || "batch-" + randomUUID().slice(0, 12),
      taskIds,
      projectId: input.projectId,
      providers,
      models,
      approvalMode: approvalMode(input.approvalMode),
      parallelism,
      autoIntegrate: Boolean(input.autoIntegrate),
      state: "running",
      runIds: [],
      validated: [],
      createdAt: new Date().toISOString(),
    };
    if (this.store.get("batches", batch.id)) fail("Batch already exists.", 409);
    this.store.put("batches", batch);
    this.store.event(null, "batch.started", { batch });
    await this.advance(batch.id);
    return this.store.get("batches", batch.id);
  }
  async control({ id, action }) {
    const batch = this.store.get("batches", id);
    if (!batch) fail("Batch not found.", 404);
    if (!["pause", "resume"].includes(action)) fail("Choose pause or resume.");
    if (action === "resume" && this.manager.draining)
      fail("Agent host is draining. Retry after the update.", 503);
    batch.state = action === "pause" ? "paused" : "running";
    delete batch.reason;
    this.store.put("batches", batch);
    if (action === "resume") await this.advance(id);
    return this.store.get("batches", id);
  }
  retry(id, delayMs = 250) {
    setTimeout(() => this.advance(id), delayMs).unref?.();
  }
  adoptExistingRuns(batch) {
    const data = this.store.read(),
      batchRuns = batch.runIds
        .map((id) => this.store.get("runs", id))
        .filter(Boolean),
      adopted = [];
    for (const taskId of batch.taskIds) {
      const canonicalTaskId = resolveTaskId(data, taskId);
      if (
        batchRuns.some(
          (run) => resolveTaskId(data, run.taskId) === canonicalTaskId,
        )
      )
        continue;
      const existing = this.store
        .list("runs")
        .filter(
          (run) =>
            !run.driver &&
            run.mode !== "ask" &&
            !run.deletedAt &&
            run.state !== "integrated" &&
            run.projectId === batch.projectId &&
            resolveTaskId(data, run.taskId) === canonicalTaskId &&
            (ACTIVE.has(run.state) || (run.worktree && run.providerSessionId)),
        )
        .sort((left, right) =>
          String(right.updatedAt || right.createdAt || "").localeCompare(
            String(left.updatedAt || left.createdAt || ""),
          ),
        )[0];
      if (!existing) continue;
      batch.runIds.push(existing.id);
      batchRuns.push(existing);
      adopted.push(existing.id);
      this.store.event(existing.id, "batch.run.reused", {
        batchId: batch.id,
        taskId: canonicalTaskId,
        state: existing.state,
      });
    }
    if (adopted.length) this.store.put("batches", batch);
    return adopted;
  }
  async advance(id) {
    if (this.working.has(id)) {
      this.wake.add(id);
      return;
    }
    this.working.add(id);
    try {
      let batch = this.store.get("batches", id);
      if (batch.state !== "running") return;
      this.adoptExistingRuns(batch);
      batch = this.store.get("batches", id);
      for (const runId of batch.runIds) {
        const run = this.store.get("runs", runId);
        if (["failed", "disconnected", "interrupted"].includes(run.state)) {
          batch.state = "attention";
          batch.reason = "Review " + runId + " before continuing.";
          this.store.put("batches", batch);
          return;
        }
        if (run.state === "completed" && !batch.validated.includes(runId)) {
          const result = await validateRun(this.store, runId);
          if (!result.passed) fail("Acceptance checks failed for " + runId);
          batch.validated.push(runId);
          this.store.put("batches", batch);
        }
      }
      const projectActive = this.store
        .list("runs")
        .filter((r) => r.projectId === batch.projectId && ACTIVE.has(r.state));
      // Sibling runs keep working while a validated entry lands: integration
      // holds the project work lock, rebases onto the base branch and
      // revalidates there, so a quiet window is not required.
      if (batch.autoIntegrate) {
        for (const entry of this.store
          .list("integration")
          .filter(
            (i) => batch.runIds.includes(i.runId) && i.state === "ready",
          )) {
          await integrateRun(this.store, {
            id: entry.id,
            expectedCommit: entry.commit,
          });
          await this.manager.landed(entry.runId);
        }
      }
      const data = this.store.read(),
        runs = batch.runIds.map((id) => this.store.get("runs", id)),
        started = new Set(runs.map((r) => r.taskId)),
        ready = queryTasks(data, { scope: "all", q: "ready:true" });
      let slots = batch.parallelism - projectActive.length;
      for (const task of ready.filter(
        (t) => batch.taskIds.includes(t.id) && !started.has(t.id),
      )) {
        if (slots <= 0) break;
        const dependsOnPendingIntegration = data.edges.some(
          (e) =>
            ["requires", "sequence"].includes(e.kind) &&
            e.to === task.id &&
            batch.taskIds.includes(e.from) &&
            !data.tasks.find((t) => t.id === e.from)?.integration,
        );
        if (dependsOnPendingIntegration) continue;
        const conflict = this.store
          .list("runs")
          .some(
            (r) =>
              r.projectId === batch.projectId &&
              ACTIVE.has(r.state) &&
              (r.resources || []).some((x) =>
                (task.resources || []).includes(x),
              ),
          );
        if (conflict) continue;
        const runId = "run-" + randomUUID().slice(0, 12);
        batch.runIds.push(runId);
        this.store.put("batches", batch);
        const provider =
          batch.providers[(batch.runIds.length - 1) % batch.providers.length];
        await this.manager.start({
          id: runId,
          taskId: task.id,
          projectId: batch.projectId,
          provider,
          model: batch.models?.[provider],
          approvalMode: approvalMode(batch.approvalMode, "manual"),
        });
        slots--;
      }
      batch = this.store.get("batches", id);
      const completed = batch.taskIds.every((id) => {
        const t = this.store.read().tasks.find((t) => t.id === id);
        return (
          statusComplete(this.store.read(), t?.status) &&
          (!batch.autoIntegrate || Boolean(t.integration))
        );
      });
      if (completed) {
        batch.state = "completed";
        batch.completedAt = new Date().toISOString();
        this.store.put("batches", batch);
        this.store.event(null, "batch.completed", { batch });
      }
    } catch (error) {
      // A held validation or integration lock is not a batch problem: the work
      // is still valid and the lock clears. Retry instead of demanding review.
      if (error.contention) {
        this.retry(id);
        return;
      }
      const batch = this.store.get("batches", id);
      batch.state = "attention";
      batch.reason = error.message;
      this.store.put("batches", batch);
      this.store.event(null, "batch.attention", { batch });
    } finally {
      this.working.delete(id);
      if (this.wake.delete(id)) queueMicrotask(() => this.advance(id));
    }
  }
}
