"use strict";
// Graph, epic progress, and timeline webviews.
//
// Rendering reuses the workspace's own model modules, loaded from the server
// that owns the data, rather than a second copy of the same logic kept in step
// by hand. The content policy allows exactly that one origin and nothing else.
//
// Views are bounded: the node set is capped and paged, and animation stops
// when the panel is hidden.
const vscode = require("vscode");

const VIEWS = {
  graph: { title: "Task graph", module: "graph" },
  progress: { title: "Epic progress", module: "progress" },
  strip: { title: "Timeline", module: "strip" },
};

class VisualPanels {
  constructor({ client, state, context, log }) {
    this.client = client;
    this.state = state;
    this.context = context;
    this.log = log;
    this.panels = new Map();
    state.onDidChange(() => this.pushAll());
  }
  open(kind) {
    const spec = VIEWS[kind];
    if (!spec) return;
    const existing = this.panels.get(kind);
    if (existing) {
      existing.panel.reveal();
      return existing;
    }
    const panel = vscode.window.createWebviewPanel(
      "avoozl." + kind,
      "Avoozl: " + spec.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "media"),
        ],
      },
    );
    const entry = { panel, kind, visible: true };
    this.panels.set(kind, entry);
    panel.webview.html = this.html(panel.webview, kind);
    panel.onDidDispose(() => this.panels.delete(kind));
    // Stop pushing updates into a hidden panel; it cannot render them and the
    // work is wasted.
    panel.onDidChangeViewState(() => {
      entry.visible = panel.visible;
      if (panel.visible) this.push(entry);
    });
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.kind === "ready") this.push(entry);
      else if (message.kind === "selectTask")
        await vscode.commands.executeCommand("avoozl.openTask", message.taskId);
      else if (message.kind === "openConversation")
        await vscode.commands.executeCommand("avoozl.openConversation", {
          taskId: message.taskId,
        });
      else if (message.kind === "page") {
        entry.offset = message.offset;
        this.push(entry);
      } else if (message.kind === "log")
        this.log("[" + kind + "] " + message.text);
    });
    return entry;
  }
  pushAll() {
    for (const entry of this.panels.values())
      if (entry.visible) this.push(entry);
  }
  push(entry) {
    if (!this.state.ready) return;
    const data = this.state.snapshot;
    const limit = 400;
    const offset = entry.offset || 0;
    const tasks = data.tasks.slice(offset, offset + limit);
    const ids = new Set(tasks.map((task) => task.id));
    entry.panel.webview.postMessage({
      kind: "state",
      view: entry.kind,
      // The payload is bounded by the viewport page, not by the whole graph.
      total: data.tasks.length,
      offset,
      limit,
      tasks,
      edges: (data.edges || []).filter(
        (edge) => ids.has(edge.from) && ids.has(edge.to),
      ),
      runs: data.workspace.runs.map((run) => ({
        id: run.id,
        taskId: run.taskId,
        state: run.state,
        title: run.title,
      })),
      at: data.at,
    });
  }
  html(webview, kind) {
    const nonce = String(Math.random()).slice(2);
    const origin = this.client.origin;
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "panel.js"),
    );
    const style = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "panel.css"),
    );
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${origin}; connect-src ${origin};">
<link rel="stylesheet" href="${style}">
<title>Avoozl</title>
</head>
<body data-view="${kind}" data-origin="${origin}">
<header>
  <strong id="title">${VIEWS[kind].title}</strong>
  <span id="summary"></span>
  <span id="paging"></span>
</header>
<main id="surface" tabindex="0" role="application" aria-label="${VIEWS[kind].title}"></main>
<footer id="detail" role="status"></footer>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
  dispose() {
    for (const entry of this.panels.values()) entry.panel.dispose();
  }
}

module.exports = { VisualPanels, VIEWS };
