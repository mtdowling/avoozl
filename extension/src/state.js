"use strict";
// One cached read of the workspace, shared by every view.
//
// Views render from this snapshot so they cannot disagree with each other, and
// the workspace is read once per refresh rather than once per view.
const vscode = require("vscode");

const ACTIVE = new Set([
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
]);

class WorkspaceState {
  constructor(client) {
    this.client = client;
    this.emitter = new vscode.EventEmitter();
    this.onDidChange = this.emitter.event;
    this.snapshot = null;
    this.error = null;
    this.lastEvent = 0;
    this.pending = null;
  }
  get ready() {
    return Boolean(this.snapshot);
  }
  // Coalesce concurrent refreshes: a burst of events must not produce a burst
  // of identical reads.
  refresh() {
    if (this.pending) return this.pending;
    this.pending = this.read().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  async read() {
    try {
      const [workspace, queue, tasks, graph] = await Promise.all([
        this.client.call("workspace"),
        this.client.call("queue", { limit: 60 }),
        this.client.call("query", { scope: "all" }),
        // Only the shape of the dependency graph is needed for the visuals;
        // task bodies already arrive above.
        this.client
          .call("state")
          .then((data) =>
            data.edges.map((edge) => ({
              from: edge.from,
              to: edge.to,
              kind: edge.kind,
            })),
          )
          .catch(() => []),
      ]);
      this.snapshot = {
        workspace,
        queue,
        tasks,
        edges: graph,
        taskById: new Map(tasks.map((task) => [task.id, task])),
        at: new Date().toISOString(),
      };
      this.lastEvent = workspace.lastEvent || this.lastEvent;
      this.error = null;
    } catch (error) {
      this.error = error;
    }
    this.emitter.fire(this.snapshot);
    return this.snapshot;
  }
  runs() {
    return this.snapshot?.workspace.runs || [];
  }
  activeRuns() {
    return this.runs().filter((run) => ACTIVE.has(run.state));
  }
  requests() {
    return this.snapshot?.workspace.requests || [];
  }
  plans() {
    return this.snapshot?.workspace.plans || [];
  }
  task(id) {
    return this.snapshot?.taskById.get(id) || null;
  }
  // Runs linked to a task, including one reported through an external session.
  runsForTask(taskId) {
    return this.runs().filter((run) => run.taskId === taskId);
  }
  dispose() {
    this.emitter.dispose();
  }
}

module.exports = { WorkspaceState, ACTIVE };
