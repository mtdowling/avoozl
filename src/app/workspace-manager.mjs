import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store, fail } from "./store.mjs";
import { workspaceConfig } from "./config.mjs";
import { WorkspaceRegistry } from "./host-config.mjs";
import { HostScheduler } from "./host-scheduler.mjs";
import { RunManager } from "./manager.mjs";
import { Operations } from "./operations.mjs";
import { RepositorySettings } from "./repository-settings.mjs";
import { watchSources } from "./source-sync.mjs";
import { OpenHandsAutomations } from "./openhands-automations.mjs";
import { openHandsSettings } from "./providers/openhands.mjs";

const ACTIVE = new Set([
  "queued",
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
]);

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function aggregate(store) {
  const data = store.read();
  const runs = store.list("runs").filter((run) => !run.deletedAt);
  return {
    tasks: data.tasks.length,
    documents: Object.keys(data.documents).length,
    running: runs.filter((run) => ACTIVE.has(run.state)).length,
    blocked: data.tasks.filter((task) => task.status === "blocked").length,
    review: data.tasks.filter(
      (task) => task.status === "review" || task.needsReview,
    ).length,
    queue: store.list("github_queue_items").length,
  };
}

function validateWorkspaceRoot(id, root) {
  if (!fs.existsSync(root) || !fs.lstatSync(root).isDirectory())
    fail(`Workspace ${id} root is unavailable: ${root}`, 409);
  if (fs.lstatSync(root).isSymbolicLink())
    fail(`Workspace ${id} root cannot be a symlink.`, 409);
}

/**
 * Owns isolated workspace runtimes inside one machine-level Avoozl process.
 * Stores and operations remain unchanged and are never shared across entries.
 */
export class WorkspaceManager {
  constructor({
    registry,
    registryOptions,
    factories,
    github,
    openhandsAutomations,
    scheduler,
    hostInstanceId = randomUUID(),
    watch = true,
    idleTimeoutMs = 5 * 60 * 1000,
  } = {}) {
    this.registry = registry || new WorkspaceRegistry(registryOptions);
    this.hostInstanceId = hostInstanceId;
    this.factories = factories;
    this.github = github;
    this.openhandsAutomations = openhandsAutomations;
    this.scheduler =
      scheduler ||
      new HostScheduler({
        maxConcurrentRuns: this.registry.config.maxConcurrentRuns,
      });
    this.runtimes = new Map();
    this.opening = new Map();
    this.repositoryBindingReservations = new Map();
    this.hostBaseUrl = null;
    this.watch = watch;
    this.idleTimeoutMs = idleTimeoutMs;
    this.idleTimer =
      idleTimeoutMs > 0
        ? setInterval(
            () => this.closeIdle().catch(() => {}),
            Math.min(idleTimeoutMs, 60_000),
          )
        : null;
    this.idleTimer?.unref();
    for (const workspace of this.registry.list())
      this.scheduler.configureWorkspace(workspace.id, {
        maxConcurrentRuns: workspace.maxConcurrentRuns,
      });
  }

  get defaultWorkspaceId() {
    return this.registry.config.defaultWorkspace;
  }

  setHostBaseUrl(baseUrl) {
    this.hostBaseUrl = baseUrl;
    for (const runtime of this.runtimes.values())
      runtime.manager.baseUrl =
        baseUrl + "/api/workspaces/" + encodeURIComponent(runtime.id);
  }

  async startEnabled() {
    const results = [];
    for (const workspace of this.registry.list().filter((item) => item.enabled))
      try {
        results.push(await this.open(workspace.id));
      } catch (error) {
        results.push({
          id: workspace.id,
          name: workspace.name,
          state: "quarantined",
          error: error.message,
        });
      }
    return results;
  }

  #repositoryBindingOwner(workspaceId, repositoryId, root) {
    for (const [otherWorkspaceId, workspace] of Object.entries(
      this.registry.config.workspaces,
    )) {
      if (otherWorkspaceId === workspaceId) continue;
      for (const [otherRepositoryId, candidate] of Object.entries(
        workspace.repositories || {},
      ))
        if (fs.existsSync(candidate) && fs.realpathSync(candidate) === root)
          return {
            workspaceId: otherWorkspaceId,
            repositoryId: otherRepositoryId,
          };
    }
    for (const runtime of this.runtimes.values()) {
      if (runtime.id === workspaceId) continue;
      for (const project of runtime.store.list("projects"))
        if (
          project.editable !== false &&
          fs.existsSync(project.root) &&
          fs.realpathSync(project.root) === root
        )
          return { workspaceId: runtime.id, repositoryId: project.id };
    }
    for (const reservation of this.repositoryBindingReservations.values())
      if (
        reservation.root === root &&
        (reservation.workspaceId !== workspaceId ||
          reservation.repositoryId !== repositoryId)
      )
        return reservation;
    return null;
  }

  #saveRepositoryBinding(workspaceId, repositoryId, root) {
    const next = structuredClone(this.registry.config),
      repositories = {
        ...(next.workspaces[workspaceId]?.repositories || {}),
      };
    if (root) repositories[repositoryId] = root;
    else delete repositories[repositoryId];
    if (
      JSON.stringify(repositories) ===
      JSON.stringify(next.workspaces[workspaceId].repositories || {})
    )
      return;
    next.workspaces[workspaceId].repositories = repositories;
    this.registry.save(
      next,
      root ? "bind-repository" : "unbind-repository",
      workspaceId,
      { repositoryId, root },
    );
  }

  reserveRepositoryBinding(
    workspaceId,
    { repositoryId, root, editable = true },
  ) {
    const resolvedRoot =
      editable && root ? fs.realpathSync(path.resolve(root)) : null;
    if (resolvedRoot) {
      const owner = this.#repositoryBindingOwner(
        workspaceId,
        repositoryId,
        resolvedRoot,
      );
      if (owner)
        fail(
          `Editable checkout ${resolvedRoot} is already bound to workspace ${owner.workspaceId}.`,
          409,
        );
    }
    const token = randomUUID(),
      reservation = {
        token,
        workspaceId,
        repositoryId,
        root: resolvedRoot,
      };
    this.repositoryBindingReservations.set(token, reservation);
    let committed = false;
    return {
      commit: () => {
        if (committed) return;
        this.#saveRepositoryBinding(workspaceId, repositoryId, resolvedRoot);
        committed = true;
      },
      release: () => this.repositoryBindingReservations.delete(token),
    };
  }

  #reconcileRepositoryBindings(workspaceId, store) {
    const configured = this.registry.get(workspaceId).repositories || {};
    for (const project of store.list("projects")) {
      if (project.editable === false || !project.root) continue;
      const root = fs.realpathSync(project.root),
        existing = configured[project.id];
      if (existing && fs.realpathSync(existing) === root) continue;
      const reservation = this.reserveRepositoryBinding(workspaceId, {
        repositoryId: project.id,
        root,
        editable: true,
      });
      try {
        reservation.commit();
      } finally {
        reservation.release();
      }
    }
  }

  async list() {
    return this.registry.list().map((registered) => {
      const runtime = this.runtimes.get(registered.id);
      if (runtime) runtime.aggregate = aggregate(runtime.store);
      const concurrency = this.scheduler.status(registered.id).workspace;
      return {
        ...registered,
        state: runtime?.state || registered.state,
        instanceEpoch:
          runtime?.instanceEpoch || registered.instanceEpoch || null,
        revision: runtime?.store.read().revision ?? registered.revision ?? null,
        counts: runtime?.aggregate || registered.aggregate || {},
        concurrency: {
          limit: concurrency.maxConcurrentRuns,
          active: concurrency.running,
          waiting: concurrency.waiting,
        },
        ...(runtime?.error ? { error: runtime.error } : {}),
      };
    });
  }

  describe(id) {
    const runtime = this.runtimes.get(id);
    if (runtime)
      return {
        id,
        name: runtime.name,
        root: runtime.root,
        state: runtime.state,
        instanceEpoch: runtime.instanceEpoch,
        revision: runtime.store.read().revision,
        counts: runtime.aggregate,
        concurrency: this.scheduler.status(id).workspace,
      };
    return this.registry.get(id);
  }

  async open(id) {
    const current = this.runtimes.get(id);
    if (current) {
      if (current.state === "stopped") fail(`Workspace ${id} is stopped.`, 409);
      if (current.state === "quarantined")
        fail(current.error || `Workspace ${id} is quarantined.`, 409);
      current.lastUsedAt = Date.now();
      return current;
    }
    if (this.opening.has(id)) return this.opening.get(id);
    const opening = this.#open(id).finally(() => this.opening.delete(id));
    this.opening.set(id, opening);
    return opening;
  }

  async #open(id) {
    const registered = this.registry.get(id);
    if (!registered.enabled) fail(`Workspace ${id} is stopped.`, 409);
    this.registry.catalog.setState(id, "opening", {
      hostInstanceId: this.hostInstanceId,
    });
    let store;
    try {
      this.registry.validate(id);
      validateWorkspaceRoot(id, registered.root);
      const config = workspaceConfig({ workspace: registered.root });
      if (!config.configured || !fs.existsSync(config.dbPath))
        fail(`Workspace ${id} is not initialized: ${registered.root}`, 409);
      for (const candidate of [path.dirname(config.dbPath), config.dbPath])
        if (
          fs.existsSync(candidate) &&
          fs.lstatSync(candidate).isSymbolicLink()
        )
          fail(`Workspace ${id} database paths cannot be symlinks.`, 409);
      store = new Store(config.dbPath);
      const storedWorkspaceId = store.getMeta("workspaceId");
      if (storedWorkspaceId && storedWorkspaceId !== id)
        fail(
          `Workspace ${id} database belongs to ${storedWorkspaceId}. Update the registry entry instead of reusing this database.`,
          409,
        );
      const owners = ["machineHostOwner", "webOwner", "runtimeOwner"]
        .map((key) => [key, store.getMeta(key)])
        .filter(
          ([, owner]) =>
            owner &&
            owner.id !== this.hostInstanceId &&
            processAlive(owner.pid),
        );
      if (owners.length)
        fail(
          `Workspace ${id} is already owned by another live Avoozl process.`,
          409,
        );
      this.#reconcileRepositoryBindings(id, store);
      const instanceEpoch = randomUUID();
      store.transaction(() => {
        if (!storedWorkspaceId) store.setMeta("workspaceId", id);
        store.setMeta("machineHostOwner", {
          id: this.hostInstanceId,
          pid: process.pid,
          workspaceId: id,
          instanceEpoch,
          at: new Date().toISOString(),
        });
        store.setMeta("workspaceInstanceEpoch", instanceEpoch);
      });
      this.scheduler.configureWorkspace(id, {
        maxConcurrentRuns: registered.maxConcurrentRuns,
      });
      const configuration = new RepositorySettings(store, {
        workspaceRoot: config.workspaceRoot,
        files: config.configFiles,
        sources: config.configSources,
        baseConfig: config.configWithoutRepository,
      });
      const manager = new RunManager(store, {
        factories: this.factories,
        scheduler: this.scheduler,
        workspaceId: id,
        baseUrl: this.hostBaseUrl
          ? this.hostBaseUrl + "/api/workspaces/" + encodeURIComponent(id)
          : "http://127.0.0.1:9428/api/workspaces/" + encodeURIComponent(id),
      });
      const automations =
        this.openhandsAutomations ||
        new OpenHandsAutomations({
          settings: () => openHandsSettings(),
        });
      const ops = new Operations(store, {
        manager,
        operator: config.operator,
        configuration,
        github: this.github,
        openhandsAutomations: automations,
        repositoryBindingGuard: (input) =>
          this.reserveRepositoryBinding(id, input),
      });
      const runtime = {
        id,
        name: registered.name || config.name || id,
        root: registered.root,
        state: "ready",
        instanceEpoch,
        config,
        store,
        manager,
        ops,
        configuration,
        stopSources: this.watch
          ? watchSources(store, config.plansRoot, {
              policyFile: config.configFiles?.repository,
            })
          : () => {},
        stopConfiguration: this.watch ? configuration.watch() : () => {},
        aggregate: aggregate(store),
        lastUsedAt: Date.now(),
        subscribers: 0,
      };
      this.runtimes.set(id, runtime);
      this.registry.catalog.observe(id, {
        state: "ready",
        instanceEpoch,
        revision: store.read().revision,
        health: { ok: true },
        aggregate: runtime.aggregate,
      });
      return runtime;
    } catch (error) {
      try {
        store?.close();
      } catch {}
      this.registry.catalog.setState(id, "quarantined", {
        hostInstanceId: this.hostInstanceId,
        error: error.message,
      });
      throw error;
    }
  }

  refresh(id) {
    const runtime = this.runtimes.get(id);
    if (!runtime) return this.registry.get(id);
    runtime.aggregate = aggregate(runtime.store);
    return this.registry.catalog.observe(id, {
      state: runtime.state,
      instanceEpoch: runtime.instanceEpoch,
      revision: runtime.store.read().revision,
      health: { ok: runtime.state === "ready" },
      aggregate: runtime.aggregate,
    });
  }

  async add(input = {}) {
    const id = String(input.id || "").trim();
    const registered = this.registry.add(id, input);
    this.scheduler.configureWorkspace(id, {
      maxConcurrentRuns: registered.maxConcurrentRuns,
    });
    if (registered.enabled) await this.open(id);
    return (await this.list()).find((workspace) => workspace.id === id);
  }

  retain(id) {
    const runtime = this.runtimes.get(id);
    if (!runtime) return () => {};
    runtime.subscribers += 1;
    runtime.lastUsedAt = Date.now();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      runtime.subscribers = Math.max(0, runtime.subscribers - 1);
      runtime.lastUsedAt = Date.now();
    };
  }

  async closeIdle(now = Date.now()) {
    if (!(this.idleTimeoutMs > 0)) return [];
    const closed = [];
    for (const runtime of [...this.runtimes.values()]) {
      if (
        runtime.state !== "ready" ||
        runtime.subscribers > 0 ||
        now - runtime.lastUsedAt < this.idleTimeoutMs ||
        runtime.store.list("runs").some((run) => ACTIVE.has(run.state)) ||
        runtime.store.db.prepare("SELECT COUNT(*) count FROM work_locks").get()
          .count > 0
      )
        continue;
      await this.#closeRuntime(runtime);
      this.registry.catalog.setState(runtime.id, "closed", {
        hostInstanceId: this.hostInstanceId,
        reason: "idle",
      });
      closed.push(runtime.id);
    }
    return closed;
  }

  setConcurrency(id, value) {
    const registered = this.registry.setConcurrency(id, value);
    this.scheduler.configureWorkspace(id, {
      maxConcurrentRuns: registered.maxConcurrentRuns,
    });
    return {
      workspace: registered,
      concurrency: this.scheduler.status(id),
    };
  }

  setHostConcurrency(value) {
    const next = structuredClone(this.registry.config);
    next.maxConcurrentRuns = Number(value);
    const saved = this.registry.save(next, "set-host-concurrency", null, {
      limit: Number(value),
    });
    return {
      receipt: saved.receipt,
      concurrency: this.scheduler.configureHost({
        maxConcurrentRuns: saved.config.maxConcurrentRuns,
      }),
    };
  }

  async start(id) {
    this.registry.setEnabled(id, true);
    return this.open(id);
  }

  async drain(id) {
    const runtime = await this.open(id);
    runtime.state = "draining";
    runtime.manager.draining = true;
    this.registry.catalog.setState(id, "draining", {
      hostInstanceId: this.hostInstanceId,
    });
    for (const batch of runtime.store
      .list("batches")
      .filter((entry) => entry.state === "running"))
      await runtime.ops.execute("batch.control", {
        id: batch.id,
        action: "pause",
      });
    return this.describe(id);
  }

  async resume(id) {
    const runtime = await this.open(id);
    runtime.state = "ready";
    runtime.manager.draining = false;
    this.registry.catalog.setState(id, "ready", {
      hostInstanceId: this.hostInstanceId,
    });
    return this.describe(id);
  }

  async stop(id) {
    const runtime = this.runtimes.get(id);
    if (!runtime) {
      const result = this.registry.setEnabled(id, false);
      return { ...result, state: "stopped" };
    }
    await this.drain(id);
    const active = runtime.store
      .list("runs")
      .filter((run) => ACTIVE.has(run.state));
    const protectedOperations = runtime.store.db
      .prepare("SELECT COUNT(*) count FROM work_locks")
      .get().count;
    if (active.length || protectedOperations)
      fail(
        `Workspace ${id} still has ${active.length} active runs and ${protectedOperations} protected operations.`,
        409,
      );
    await this.#closeRuntime(runtime);
    this.registry.setEnabled(id, false);
    this.registry.catalog.setState(id, "stopped", {
      hostInstanceId: this.hostInstanceId,
    });
    return { id, state: "stopped", databasePreserved: true };
  }

  async remove(id) {
    if (this.runtimes.has(id)) await this.stop(id);
    return this.registry.remove(id);
  }

  setDefault(id) {
    return this.registry.setDefault(id);
  }

  async #closeRuntime(runtime) {
    runtime.stopSources?.();
    runtime.stopConfiguration?.();
    await runtime.manager.close();
    if (runtime.store.getMeta("machineHostOwner")?.id === this.hostInstanceId)
      runtime.store.setMeta("machineHostOwner", null);
    runtime.store.close();
    this.runtimes.delete(runtime.id);
  }

  async close() {
    if (this.idleTimer) clearInterval(this.idleTimer);
    for (const runtime of [...this.runtimes.values()])
      await this.#closeRuntime(runtime);
    this.scheduler.close();
    this.registry.close();
  }
}
