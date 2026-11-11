import { fail } from "./store.mjs";

const DEFAULT_HOST_LIMIT = 4;
const DEFAULT_WORKSPACE_LIMIT = 2;

function limit(value, fallback, label) {
  const selected = value ?? fallback;
  if (!Number.isInteger(selected) || selected < 0 || selected > 64)
    fail(`${label} must be an integer from 0 to 64.`);
  return selected;
}

/**
 * Fair, host-wide admission control for agent runs.
 *
 * Running work owns a slot until its provider turn reaches a terminal state.
 * Waiting work is grouped by workspace and admitted round-robin, so a busy
 * workspace cannot consume every newly available slot. A workspace limit of
 * zero pauses new admission without disturbing work that is already running.
 */
export class HostScheduler {
  constructor({ maxConcurrentRuns = DEFAULT_HOST_LIMIT } = {}) {
    this.maxConcurrentRuns = limit(
      maxConcurrentRuns,
      DEFAULT_HOST_LIMIT,
      "Host concurrency",
    );
    this.workspaceLimits = new Map();
    this.running = new Map();
    this.waiting = new Map();
    this.order = [];
    this.lastWorkspace = null;
  }

  configureWorkspace(workspaceId, { maxConcurrentRuns } = {}) {
    if (typeof workspaceId !== "string" || !workspaceId)
      fail("Choose a workspace.");
    const value = limit(
      maxConcurrentRuns,
      DEFAULT_WORKSPACE_LIMIT,
      "Workspace concurrency",
    );
    this.workspaceLimits.set(workspaceId, value);
    this.#remember(workspaceId);
    this.#drain();
    return this.status(workspaceId);
  }

  configureHost({ maxConcurrentRuns } = {}) {
    this.maxConcurrentRuns = limit(
      maxConcurrentRuns,
      DEFAULT_HOST_LIMIT,
      "Host concurrency",
    );
    this.#drain();
    return this.status();
  }

  workspaceLimit(workspaceId) {
    return this.workspaceLimits.get(workspaceId) ?? DEFAULT_WORKSPACE_LIMIT;
  }

  owns(workspaceId, runId) {
    return this.running.has(this.#key(workspaceId, runId));
  }

  async acquire(workspaceId, runId, { priority = "normal" } = {}) {
    const key = this.#key(workspaceId, runId);
    if (this.running.has(key)) return this.running.get(key).lease;
    for (const entries of this.waiting.values())
      if (
        entries.some(
          (entry) => entry.workspaceId === workspaceId && entry.runId === runId,
        )
      )
        fail("Run is already waiting for a host slot.", 409);
    this.#remember(workspaceId);
    return new Promise((resolve, reject) => {
      const entries = this.waiting.get(workspaceId) || [];
      const request = {
        workspaceId,
        runId,
        priority: priority === "user" ? "user" : "normal",
        requestedAt: new Date().toISOString(),
        resolve,
        reject,
      };
      if (request.priority === "user") {
        const firstNormal = entries.findIndex(
          (entry) => entry.priority !== "user",
        );
        if (firstNormal < 0) entries.push(request);
        else entries.splice(firstNormal, 0, request);
      } else entries.push(request);
      this.waiting.set(workspaceId, entries);
      this.#drain();
    });
  }

  cancel(workspaceId, runId, reason = "Run canceled before admission.") {
    for (const [queuedWorkspaceId, entries] of this.waiting) {
      const index = entries.findIndex(
        (entry) => entry.workspaceId === workspaceId && entry.runId === runId,
      );
      if (index < 0) continue;
      const [request] = entries.splice(index, 1);
      if (!entries.length) this.waiting.delete(queuedWorkspaceId);
      const error = Error(reason);
      error.status = 409;
      request.reject(error);
      return true;
    }
    return false;
  }

  release(workspaceId, runId) {
    const key = this.#key(workspaceId, runId);
    const entry = this.running.get(key);
    if (!entry) return false;
    this.running.delete(key);
    entry.lease.releasedAt = new Date().toISOString();
    this.#drain();
    return true;
  }

  status(workspaceId) {
    const running = [...this.running.values()];
    const waiting = [...this.waiting.values()].flat();
    const workspace = workspaceId
      ? {
          id: workspaceId,
          maxConcurrentRuns: this.workspaceLimit(workspaceId),
          running: running.filter((entry) => entry.workspaceId === workspaceId)
            .length,
          waiting: waiting.filter((entry) => entry.workspaceId === workspaceId)
            .length,
        }
      : undefined;
    return {
      maxConcurrentRuns: this.maxConcurrentRuns,
      running: running.length,
      waiting: waiting.length,
      available: Math.max(0, this.maxConcurrentRuns - running.length),
      ...(workspace ? { workspace } : {}),
      workspaces: Object.fromEntries(
        this.order.map((id) => [
          id,
          {
            maxConcurrentRuns: this.workspaceLimit(id),
            running: running.filter((entry) => entry.workspaceId === id).length,
            waiting: waiting.filter((entry) => entry.workspaceId === id).length,
          },
        ]),
      ),
    };
  }

  close(reason = "Host scheduler closed.") {
    for (const entries of this.waiting.values())
      for (const request of entries) {
        const error = Error(reason);
        error.status = 503;
        request.reject(error);
      }
    this.waiting.clear();
  }

  #remember(workspaceId) {
    if (!this.order.includes(workspaceId)) this.order.push(workspaceId);
  }

  #key(workspaceId, runId) {
    return workspaceId + "\0" + runId;
  }

  #canRun(workspaceId) {
    if (this.running.size >= this.maxConcurrentRuns) return false;
    const workspaceRunning = [...this.running.values()].filter(
      (entry) => entry.workspaceId === workspaceId,
    ).length;
    return workspaceRunning < this.workspaceLimit(workspaceId);
  }

  #nextWorkspace() {
    if (!this.order.length) return null;
    const last = this.order.indexOf(this.lastWorkspace);
    const start = last < 0 ? 0 : (last + 1) % this.order.length;
    for (let offset = 0; offset < this.order.length; offset++) {
      const index = (start + offset) % this.order.length;
      const workspaceId = this.order[index];
      if (
        (this.waiting.get(workspaceId)?.length || 0) > 0 &&
        this.#canRun(workspaceId)
      ) {
        return workspaceId;
      }
    }
    return null;
  }

  #drain() {
    while (this.running.size < this.maxConcurrentRuns) {
      const workspaceId = this.#nextWorkspace();
      if (!workspaceId) break;
      const entries = this.waiting.get(workspaceId);
      const request = entries.shift();
      if (!entries.length) this.waiting.delete(workspaceId);
      const lease = {
        workspaceId,
        runId: request.runId,
        priority: request.priority,
        requestedAt: request.requestedAt,
        admittedAt: new Date().toISOString(),
      };
      this.running.set(this.#key(workspaceId, request.runId), {
        workspaceId,
        runId: request.runId,
        lease,
      });
      this.lastWorkspace = workspaceId;
      request.resolve(lease);
    }
  }
}

export const hostConcurrencyDefaults = Object.freeze({
  host: DEFAULT_HOST_LIMIT,
  workspace: DEFAULT_WORKSPACE_LIMIT,
});
