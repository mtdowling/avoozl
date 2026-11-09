"use strict";
// Sidebar views: Now, tasks, plans, and conversations.
//
// Rows stay dense and every row carries the identifiers a command needs, so a
// command never has to guess which run or task the user meant.
const vscode = require("vscode");
const { ACTIVE } = require("./state");

function stateIcon(run) {
  if (run.state === "waiting-approval")
    return new vscode.ThemeIcon(
      "shield",
      new vscode.ThemeColor("notificationsWarningIcon.foreground"),
    );
  if (run.state === "waiting-input")
    return new vscode.ThemeIcon(
      "question",
      new vscode.ThemeColor("notificationsWarningIcon.foreground"),
    );
  if (run.state === "running" || run.state === "starting")
    return new vscode.ThemeIcon("sync~spin");
  if (run.state === "failed")
    return new vscode.ThemeIcon(
      "error",
      new vscode.ThemeColor("notificationsErrorIcon.foreground"),
    );
  // A run that was stopped on purpose is not a failure and must not look
  // like one.
  if (run.state === "interrupted") return new vscode.ThemeIcon("debug-stop");
  if (run.state === "disconnected")
    return new vscode.ThemeIcon("debug-disconnect");
  if (run.state === "integrated") return new vscode.ThemeIcon("git-merge");
  if (run.state === "observing") return new vscode.ThemeIcon("eye");
  return new vscode.ThemeIcon("check");
}

function runLabel(run) {
  return run.title || run.prompt?.split("\n")[0]?.slice(0, 80) || run.id;
}

function runDescription(run) {
  const parts = [run.state];
  if (run.provider) parts.push(run.provider);
  if (run.actualModel || run.model) parts.push(run.actualModel || run.model);
  return parts.join(" · ");
}

function runTooltip(run) {
  const lines = [
    "**" + runLabel(run) + "**",
    "",
    "- Run: `" + run.id + "`",
    "- State: `" + run.state + "`",
    "- Task: `" + (run.taskId || "none") + "`",
  ];
  if (run.requestedModel && run.requestedModel !== run.actualModel)
    lines.push(
      "- Model requested `" +
        run.requestedModel +
        "`, provider last reported `" +
        (run.actualModel || "unknown") +
        "`",
    );
  // Keep cancellation and failure visibly different.
  if (run.state === "interrupted") {
    lines.push("- Stopped at your request.");
    if (run.providerDiagnostic)
      lines.push(
        "- The provider additionally reported: `" +
          String(run.providerDiagnostic).slice(0, 300) +
          "`",
      );
    if (run.cancellation?.completionRace === "possible")
      lines.push(
        "- This provider reports no interruption status of its own, so the turn may have finished just before the stop landed.",
      );
  }
  if (run.error)
    lines.push("- Error: `" + String(run.error).slice(0, 300) + "`");
  const tooltip = new vscode.MarkdownString(lines.join("\n"));
  tooltip.supportThemeIcons = true;
  return tooltip;
}

class Row extends vscode.TreeItem {
  constructor(label, options = {}) {
    super(label, options.collapsible || vscode.TreeItemCollapsibleState.None);
    Object.assign(this, options);
  }
}

function taskRow(task, { contextSuffix = "" } = {}) {
  const row = new Row(task.title || task.id, {
    id: "task:" + task.id,
    description: [task.status, task.epic].filter(Boolean).join(" · "),
    contextValue: "aicommander.task" + contextSuffix,
    iconPath: new vscode.ThemeIcon(
      task.status === "accepted"
        ? "pass-filled"
        : task.status === "blocked"
          ? "circle-slash"
          : task.integration
            ? "git-merge"
            : "circle-outline",
    ),
    taskId: task.id,
    command: {
      command: "aicommander.openTask",
      title: "Open task",
      arguments: [task.id],
    },
  });
  const lines = [
    "**" + (task.title || task.id) + "**",
    "",
    "`" + task.id + "`",
  ];
  if (task.summary) lines.push("", task.summary);
  if (task.nextAction) lines.push("", "Next: " + task.nextAction);
  if (task.acceptance?.length)
    lines.push("", ...task.acceptance.map((a) => "- " + a));
  row.tooltip = new vscode.MarkdownString(lines.join("\n"));
  return row;
}

class NowProvider {
  constructor(state) {
    this.state = state;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
    state.onDidChange(() => this.emitter.fire());
  }
  getTreeItem(item) {
    return item;
  }
  getChildren(parent) {
    const state = this.state;
    if (!state.ready) return [];
    if (!parent) {
      const groups = [];
      const attention = [
        ...state.requests(),
        ...state.activeRuns().filter((r) => r.state.startsWith("waiting")),
      ];
      groups.push(
        new Row("Attention needed", {
          id: "group:attention",
          description: String(state.requests().length),
          collapsible: state.requests().length
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None,
          group: "attention",
          iconPath: new vscode.ThemeIcon("bell"),
        }),
        new Row("Running", {
          id: "group:running",
          description: String(state.activeRuns().length),
          collapsible: state.activeRuns().length
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None,
          group: "running",
          iconPath: new vscode.ThemeIcon("pulse"),
        }),
        new Row("Ready work", {
          id: "group:ready",
          description: String(state.snapshot.queue.summary.ready),
          collapsible: vscode.TreeItemCollapsibleState.Collapsed,
          group: "ready",
          iconPath: new vscode.ThemeIcon("play"),
        }),
        new Row("Blocked", {
          id: "group:blocked",
          description: String(state.snapshot.queue.summary.blocked),
          collapsible: vscode.TreeItemCollapsibleState.Collapsed,
          group: "blocked",
          iconPath: new vscode.ThemeIcon("circle-slash"),
        }),
        new Row("Ready to integrate", {
          id: "group:integrations",
          description: String(state.snapshot.workspace.integrations.length),
          collapsible: vscode.TreeItemCollapsibleState.Collapsed,
          group: "integrations",
          iconPath: new vscode.ThemeIcon("git-merge"),
        }),
      );
      return groups;
    }
    if (parent.group === "attention")
      return state.requests().map((request) => {
        const run = state.runs().find((r) => r.id === request.runId);
        return new Row(
          (request.kind === "approval" ? "Approve: " : "Answer: ") +
            (request.method || request.id),
          {
            id: "request:" + request.id,
            description: run ? runLabel(run) : request.runId,
            contextValue: "aicommander.request",
            iconPath: new vscode.ThemeIcon(
              request.kind === "approval" ? "shield" : "question",
            ),
            requestId: request.id,
            runId: request.runId,
            command: {
              command: "aicommander.answerRequest",
              title: "Answer",
              arguments: [request.id],
            },
          },
        );
      });
    if (parent.group === "running")
      return state.activeRuns().map((run) => sessionRow(run));
    if (parent.group === "ready")
      return state.snapshot.queue.ready
        .slice(0, 40)
        .map((task) => taskRow(task, { contextSuffix: ".ready" }));
    if (parent.group === "blocked")
      return state.snapshot.queue.blocked.map(
        (entry) =>
          new Row(entry.title || entry.id, {
            id: "blocked:" + entry.id,
            description:
              "waiting on " + entry.blockers.map((b) => b.id).join(", "),
            contextValue: "aicommander.task.blocked",
            taskId: entry.id,
            iconPath: new vscode.ThemeIcon("circle-slash"),
            command: {
              command: "aicommander.openTask",
              title: "Open task",
              arguments: [entry.id],
            },
          }),
      );
    if (parent.group === "integrations")
      return state.snapshot.workspace.integrations.map(
        (entry) =>
          new Row(entry.taskId, {
            id: "integration:" + entry.id,
            description: (entry.commit || "").slice(0, 10),
            contextValue: "aicommander.integration",
            integrationId: entry.id,
            expectedCommit: entry.commit,
            iconPath: new vscode.ThemeIcon("git-merge"),
            command: {
              command: "aicommander.integrate",
              title: "Integrate",
              arguments: [entry.id],
            },
          }),
      );
    return [];
  }
}

function sessionRow(run) {
  return new Row(runLabel(run), {
    id: "run:" + run.id,
    description: runDescription(run),
    tooltip: runTooltip(run),
    iconPath: stateIcon(run),
    contextValue:
      "aicommander.session" +
      (ACTIVE.has(run.state)
        ? ".active"
        : run.state === "disconnected"
          ? ".disconnected"
          : ""),
    runId: run.id,
    taskId: run.taskId,
    command: {
      command: "aicommander.openConversation",
      title: "Open conversation",
      arguments: [{ runId: run.id }],
    },
  });
}

class TaskProvider {
  constructor(state) {
    this.state = state;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
    state.onDidChange(() => this.emitter.fire());
  }
  getTreeItem(item) {
    return item;
  }
  getChildren(parent) {
    if (!this.state.ready) return [];
    const tasks = this.state.snapshot.tasks;
    if (!parent) {
      const byEpic = new Map();
      for (const task of tasks) {
        const key = task.epic || "inbox";
        if (!byEpic.has(key)) byEpic.set(key, []);
        byEpic.get(key).push(task);
      }
      return [...byEpic.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(
          ([epic, items]) =>
            new Row(epic, {
              id: "epic:" + epic,
              description: String(items.length),
              collapsible: vscode.TreeItemCollapsibleState.Collapsed,
              epic,
              iconPath: new vscode.ThemeIcon("folder"),
            }),
        );
    }
    if (parent.epic)
      return tasks
        .filter((task) => (task.epic || "inbox") === parent.epic)
        .map((task) => taskRow(task));
    return [];
  }
}

class PlanProvider {
  constructor(state) {
    this.state = state;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
    state.onDidChange(() => this.emitter.fire());
  }
  getTreeItem(item) {
    return item;
  }
  getChildren(parent) {
    if (!this.state.ready || parent) return [];
    return this.state.plans().map((plan) => {
      const row = new Row(plan.title || plan.id, {
        id: "plan:" + plan.id,
        // The state is the point: a saved draft is not an approved plan.
        description: plan.state + " · r" + plan.revision,
        contextValue:
          "aicommander.plan" +
          (plan.state === "approved" ? ".approved" : ".draft"),
        planId: plan.id,
        iconPath: new vscode.ThemeIcon(
          plan.state === "approved" ? "verified-filled" : "edit",
        ),
        command: {
          command: "aicommander.openPlan",
          title: "Open plan",
          arguments: [plan.id],
        },
      });
      row.tooltip = new vscode.MarkdownString(
        [
          "**" + (plan.title || plan.id) + "**",
          "",
          "- State: `" + plan.state + "`",
          "- Revision: `" + plan.revision + "`",
          "- Reviewed hash: `" + String(plan.hash || "").slice(0, 16) + "`",
          "",
          plan.state === "approved"
            ? "Approved revisions keep their extraction receipt."
            : "Saving this draft records a revision. It does not approve it.",
        ].join("\n"),
      );
      return row;
    });
  }
}

class SessionProvider {
  constructor(state) {
    this.state = state;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
    state.onDidChange(() => this.emitter.fire());
  }
  getTreeItem(item) {
    return item;
  }
  getChildren(parent) {
    if (!this.state.ready || parent) return [];
    return this.state.runs().map((run) => sessionRow(run));
  }
}

module.exports = {
  NowProvider,
  TaskProvider,
  PlanProvider,
  SessionProvider,
  sessionRow,
  runLabel,
};
