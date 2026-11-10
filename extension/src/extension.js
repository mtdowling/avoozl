"use strict";
// Avoozl VS Code client.
//
// The extension is a client of a workspace that already exists. It does not
// own execution state, does not start provider processes, and does not keep a
// second copy of the task model. Everything it changes goes through the
// workspace's shared operations, which route agent commands to the one
// persistent host that owns each provider session.
const vscode = require("vscode");
const path = require("node:path");
const {
  WorkspaceClient,
  WorkspaceError,
  CLIENT_API_VERSION,
} = require("./client");
const { WorkspaceState, ACTIVE } = require("./state");
const {
  NowProvider,
  TaskProvider,
  PlanProvider,
  SessionProvider,
} = require("./trees");
const {
  PlanFileSystem,
  SavedRevisionProvider,
  reviewApproval,
  SCHEME,
} = require("./plans");
const {
  ChatNavigator,
  NATIVE_COMMAND,
  TESTED_BUILDS,
} = require("./navigation");
const { VisualPanels } = require("./webviews");

function activate(context) {
  const channel = vscode.window.createOutputChannel("Avoozl");
  const log = (text) =>
    channel.appendLine(new Date().toISOString() + " " + text);
  context.subscriptions.push(channel);

  let client = new WorkspaceClient(endpoint());
  const state = new WorkspaceState(client);
  context.subscriptions.push(state);
  const plans = new PlanFileSystem(client, log);
  const navigator = new ChatNavigator({ client, log });
  const panels = new VisualPanels({ client, state, context, log });
  context.subscriptions.push({ dispose: () => panels.dispose() });

  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    40,
  );
  status.command = "avoozl.diagnostics";
  context.subscriptions.push(status);

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(SCHEME, plans, {
      isCaseSensitive: true,
    }),
    vscode.workspace.registerTextDocumentContentProvider(
      "avoozl-plan-saved",
      new SavedRevisionProvider(() => client),
    ),
    // The base revision of a file a conversation changed, so the editor's own
    // diff view can show what the run did.
    vscode.workspace.registerTextDocumentContentProvider("avoozl-run-base", {
      async provideTextDocumentContent(uri) {
        const [, runId, ...rest] = uri.path.split("/");
        const result = await client.call("run.changes", {
          id: decodeURIComponent(runId),
          path: rest.join("/"),
        });
        return result.before;
      },
    }),
  );

  const views = {
    now: new NowProvider(state),
    tasks: new TaskProvider(state),
    plans: new PlanProvider(state),
    sessions: new SessionProvider(state),
  };
  for (const [name, provider] of Object.entries(views))
    context.subscriptions.push(
      vscode.window.createTreeView("avoozl." + name, {
        treeDataProvider: provider,
        showCollapseAll: name !== "now",
      }),
    );

  // ─── Connection ────────────────────────────────────────────────────────────

  let stopStream = null;
  let pollTimer = null;
  let compatible = false;

  function endpoint() {
    return setting("endpoint", "http://127.0.0.1:9428");
  }
  // The extension was previously published under another name. A setting
  // written against the old key still applies until the user moves it.
  function setting(key, fallback) {
    const current = vscode.workspace.getConfiguration("avoozl").get(key);
    if (current !== undefined && current !== "") return current;
    const previous = vscode.workspace.getConfiguration("aicommander").get(key);
    if (previous !== undefined && previous !== "") {
      log(
        'Using the earlier "aicommander.' +
          key +
          '" setting. Move it to "avoozl.' +
          key +
          '" when convenient.',
      );
      return previous;
    }
    return fallback;
  }

  function renderStatus() {
    if (!compatible) {
      status.text = "$(warning) Avoozl";
      status.tooltip =
        state.error?.message || "Not connected to a workspace server.";
      status.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
    } else {
      const attention = state.requests().length;
      const active = state.activeRuns().length;
      status.text =
        "$(checklist) " +
        (attention ? "$(bell) " + attention + " " : "") +
        (active ? "$(pulse) " + active : "idle");
      status.tooltip = new vscode.MarkdownString(
        [
          "**Avoozl**",
          "",
          "- Endpoint: `" + client.origin + "`",
          "- Workspace: `" +
            (state.snapshot?.workspace.mode || "unknown") +
            "`",
          "- Attention needed: " + attention,
          "- Active conversations: " + active,
        ].join("\n"),
      );
      status.backgroundColor = attention
        ? new vscode.ThemeColor("statusBarItem.warningBackground")
        : undefined;
    }
    status.show();
  }
  state.onDidChange(renderStatus);

  async function connect() {
    stopStream?.();
    stopStream = null;
    clearInterval(pollTimer);
    client = new WorkspaceClient(endpoint());
    state.client = client;
    plans.client = client;
    navigator.client = client;
    panels.client = client;
    try {
      const described = await client.describe();
      compatible = true;
      log(
        "Connected to " +
          client.origin +
          " workspace " +
          described.workspaceId +
          " (client API " +
          described.apiVersion +
          ", this extension " +
          CLIENT_API_VERSION +
          ")",
      );
    } catch (error) {
      compatible = false;
      state.error = error;
      log("Not connected: " + error.message);
      renderStatus();
      for (const provider of Object.values(views)) provider.emitter.fire();
      return;
    }
    await state.refresh();
    // Follow the durable event sequence. Polling is only a fallback, so a
    // dropped stream degrades to slower updates rather than to stale views.
    stopStream = client.events({
      after: state.lastEvent,
      onEvent: (event) => {
        state.lastEvent = Math.max(state.lastEvent, event.seq || 0);
        if (event.kind === "plan.changed" && event.planId)
          plans.notifyChanged(event.planId);
        schedule();
      },
      onError: (error) => {
        log(
          "Event stream unavailable, falling back to polling: " + error.message,
        );
        startPolling();
      },
    });
  }

  let scheduled = null;
  function schedule() {
    if (scheduled) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      state.refresh();
    }, 250);
  }
  function startPolling() {
    clearInterval(pollTimer);
    const seconds = setting("refreshSeconds", 5);
    pollTimer = setInterval(() => state.refresh(), seconds * 1000);
  }
  context.subscriptions.push({
    dispose: () => {
      stopStream?.();
      clearInterval(pollTimer);
      clearTimeout(scheduled);
    },
  });
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("avoozl.endpoint") ||
        event.affectsConfiguration("aicommander.endpoint")
      )
        connect();
      else if (
        event.affectsConfiguration("avoozl.refreshSeconds") ||
        event.affectsConfiguration("aicommander.refreshSeconds")
      )
        startPolling();
    }),
  );

  // ─── Commands ──────────────────────────────────────────────────────────────

  async function guard(fn) {
    try {
      return await fn();
    } catch (error) {
      const message =
        error instanceof WorkspaceError && error.status === 409
          ? error.message
          : error.message;
      log("Refused: " + message);
      vscode.window.showErrorMessage(message);
      await state.refresh();
    }
  }

  function runFrom(argument) {
    if (!argument) return null;
    if (typeof argument === "string")
      return state.runs().find((run) => run.id === argument) || null;
    if (argument.runId)
      return state.runs().find((run) => run.id === argument.runId) || null;
    if (argument.taskId) {
      const candidates = state.runsForTask(argument.taskId);
      // Prefer live work, then the most recent, so "this task's conversation"
      // resolves to one specific run rather than an arbitrary one.
      return (
        candidates.find((run) => ACTIVE.has(run.state)) ||
        candidates.sort((a, b) =>
          String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
        )[0] ||
        null
      );
    }
    return null;
  }

  const register = (name, handler) =>
    context.subscriptions.push(
      vscode.commands.registerCommand("avoozl." + name, handler),
    );

  register("refresh", () => connect());
  register("openSettings", () =>
    vscode.commands.executeCommand("workbench.action.openSettings", "avoozl"),
  );

  register("diagnostics", () =>
    guard(async () => {
      const capability = await navigator.probe();
      let health = null;
      try {
        health = await client.health();
      } catch (error) {
        health = { error: error.message };
      }
      const lines = [
        "# Avoozl diagnostics",
        "",
        "## Client",
        "",
        "- Extension client API: `" + CLIENT_API_VERSION + "`",
        "- VS Code build: `" + vscode.version + "`",
        "- Builds this navigation has been exercised on: `" +
          TESTED_BUILDS.join("`, `") +
          "`",
        "- Endpoint: `" + client.origin + "`",
        "",
        "## Workspace",
        "",
        "```json",
        JSON.stringify(health, null, 2),
        "```",
        "",
        "## Workspace client contract",
        "",
        "```json",
        JSON.stringify(state.client.described || null, null, 2),
        "```",
        "",
        "## Native conversation navigation",
        "",
        "- Command `" +
          NATIVE_COMMAND +
          "` registered: **" +
          capability.registered +
          "**",
        "- This build is one of the tested builds: **" +
          capability.tested +
          "**",
        "- Setting: `" + capability.setting + "`",
        "- Can confirm which transcript opened: **" +
          capability.canVerifyIdentity +
          "**" +
          (capability.canVerifyIdentity
            ? ""
            : " — set `avoozl.facadeManifest` to the facade's `ahp-facade.json` to enable confirmation"),
        "",
        "This command is not a published extension API. It is used behind the",
        "checks above and falls back to a session picker.",
      ];
      const document = await vscode.workspace.openTextDocument({
        content: lines.join("\n"),
        language: "markdown",
      });
      await vscode.window.showTextDocument(document, { preview: true });
    }),
  );

  register("openTask", (id) =>
    guard(async () => {
      const taskId = typeof id === "string" ? id : id?.taskId;
      if (!taskId) return;
      const task = await client.call("task.get", { id: taskId });
      const lines = [
        "# " + (task.title || task.id),
        "",
        "`" + task.id + "` · " + task.status + " · " + (task.epic || "inbox"),
        "",
        task.summary || "",
        "",
        "## Acceptance",
        "",
        ...(task.acceptance?.length
          ? task.acceptance.map((item) => "- " + item)
          : ["_None recorded._"]),
        "",
        "## Next action",
        "",
        task.nextAction || "_None recorded._",
        "",
        "## Dependencies",
        "",
        ...(task.relationships.length
          ? task.relationships.map(
              (edge) =>
                "- `" + edge.from + "` " + edge.kind + " → `" + edge.to + "`",
            )
          : ["_None._"]),
        "",
        "## Delivery",
        "",
        "- Integration: " +
          (task.integration
            ? "`" +
              task.integration.commit +
              "` on `" +
              task.integration.branch +
              "`"
            : "_not integrated_"),
        "- Acceptance evidence: " +
          (task.acceptanceEvidence
            ? (task.acceptanceEvidence.componentOnly
                ? "component only — "
                : "whole head — ") + task.acceptanceEvidence.evidence
            : "_not accepted_"),
        "",
        "## Conversations",
        "",
        ...(task.runs.length
          ? task.runs.map(
              (run) =>
                "- `" +
                run.id +
                "` " +
                run.state +
                " (" +
                (run.provider || "?") +
                ")",
            )
          : ["_None._"]),
        "",
        "## Source context",
        "",
        "```markdown",
        (task.context || "").slice(0, 8000),
        "```",
      ];
      const document = await vscode.workspace.openTextDocument({
        content: lines.join("\n"),
        language: "markdown",
      });
      await vscode.window.showTextDocument(document, { preview: true });
    }),
  );

  register("openTaskSource", (argument) =>
    guard(async () => {
      const taskId = typeof argument === "string" ? argument : argument?.taskId;
      const task = await client.call("task.get", { id: taskId });
      const documentId = task.source?.document;
      if (!documentId) {
        vscode.window.showInformationMessage(
          "This task has no source document. It was captured directly.",
        );
        return;
      }
      // Prefer the file on the machine that owns the repository; fall back to
      // the workspace's own copy of the document text.
      const matches = await vscode.workspace.findFiles(
        "**/" + documentId.split("/").pop(),
        "**/node_modules/**",
        5,
      );
      if (matches.length === 1) {
        const editor = await vscode.window.showTextDocument(matches[0]);
        if (task.source.lineStart)
          editor.revealRange(
            new vscode.Range(
              Math.max(0, task.source.lineStart - 1),
              0,
              Math.max(0, task.source.lineEnd - 1),
              0,
            ),
            vscode.TextEditorRevealType.InCenter,
          );
        return;
      }
      const document = await client.call("document.get", { id: documentId });
      const opened = await vscode.workspace.openTextDocument({
        content: document.text,
        language: "markdown",
      });
      await vscode.window.showTextDocument(opened, { preview: true });
    }),
  );

  register("openConversation", (argument) =>
    guard(async () => {
      const run = runFrom(argument);
      if (!run) {
        vscode.window.showInformationMessage(
          "No conversation is linked to this task yet. Start one from the website or the CLI; this client never starts a second writer for an existing session.",
        );
        return;
      }
      const report = await navigator.open(run.id);
      if (report.used === "native" && report.verified)
        vscode.window.setStatusBarMessage(
          "Opened " + run.id + " and confirmed its transcript",
          4000,
        );
    }),
  );

  register("openPlan", (argument) =>
    guard(async () => {
      const planId = typeof argument === "string" ? argument : argument?.planId;
      if (!planId) return;
      const uri = PlanFileSystem.uri(planId);
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.languages.setTextDocumentLanguage(document, "markdown");
      await vscode.window.showTextDocument(document, { preview: false });
      vscode.window.setStatusBarMessage(
        "Saving records a draft revision. It does not approve the plan.",
        6000,
      );
    }),
  );

  register("comparePlan", (argument) =>
    guard(async () => {
      const planId = typeof argument === "string" ? argument : argument?.planId;
      const left = vscode.Uri.parse(
        "avoozl-plan-saved:/" + encodeURIComponent(planId) + ".md",
      );
      await vscode.commands.executeCommand(
        "vscode.diff",
        left,
        PlanFileSystem.uri(planId),
        "Saved revision ↔ your edits",
      );
    }),
  );

  register("reloadPlan", (argument) =>
    guard(async () => {
      const planId = typeof argument === "string" ? argument : argument?.planId;
      const uri = PlanFileSystem.uri(planId);
      const document = vscode.workspace.textDocuments.find(
        (doc) => doc.uri.toString() === uri.toString(),
      );
      if (!document) return;
      const confirm = await vscode.window.showWarningMessage(
        "Discard your edits to " + planId + " and reload the saved revision?",
        { modal: true },
        "Discard my edits",
      );
      if (!confirm) return;
      await vscode.commands.executeCommand(
        "workbench.action.files.revertResource",
        uri,
      );
      plans.notifyChanged(planId);
    }),
  );

  register("previewApproval", (argument) =>
    guard(async () => {
      let planId = typeof argument === "string" ? argument : argument?.planId;
      if (!planId) {
        const active = vscode.window.activeTextEditor?.document.uri;
        if (active?.scheme === SCHEME) planId = PlanFileSystem.planId(active);
      }
      if (!planId) {
        const picked = await vscode.window.showQuickPick(
          state.plans().map((plan) => ({
            label: plan.title || plan.id,
            description: plan.state,
            planId: plan.id,
          })),
          { title: "Review a plan for approval" },
        );
        planId = picked?.planId;
      }
      if (!planId) return;
      await reviewApproval(client, planId, log);
      await state.refresh();
    }),
  );
  register("approvePlan", (argument) =>
    vscode.commands.executeCommand("avoozl.previewApproval", argument),
  );

  register("graph", () => panels.open("graph"));
  register("progress", () => panels.open("progress"));
  register("strip", () => panels.open("strip"));

  register("answerRequest", (argument) =>
    guard(async () => {
      const requestId =
        typeof argument === "string" ? argument : argument?.requestId;
      const request = state.requests().find((entry) => entry.id === requestId);
      if (!request) {
        vscode.window.showInformationMessage(
          "That request is no longer pending.",
        );
        return;
      }
      if (request.kind === "input") {
        vscode.window.showInformationMessage(
          "Structured questions are answered in the conversation itself so every option and its description are visible.",
        );
        await vscode.commands.executeCommand("avoozl.openConversation", {
          runId: request.runId,
        });
        return;
      }
      const detail = JSON.stringify(request.payload, null, 2).slice(0, 1500);
      const choice = await vscode.window.showWarningMessage(
        "Allow " + (request.method || "this request") + "?",
        { modal: true, detail },
        "Allow once",
        "Deny",
      );
      if (!choice) return;
      await client.call("run.answer", {
        id: request.id,
        runId: request.runId,
        decision: choice === "Allow once" ? "allow" : "deny",
        optionId: choice === "Allow once" ? "allow-once" : "deny",
      });
      await state.refresh();
    }),
  );

  register("cancelSession", (argument) =>
    guard(async () => {
      const run = runFrom(argument);
      if (!run) return;
      const confirm = await vscode.window.showWarningMessage(
        "Stop " + (run.title || run.id) + "?",
        {
          modal: true,
          detail: "Work already committed in its worktree is kept.",
        },
        "Stop it",
      );
      if (!confirm) return;
      const result = await client.call("run.interrupt", {
        id: run.id,
        reason: "client-cancel:vscode",
      });
      log("Interrupt " + run.id + ": " + JSON.stringify(result));
      // The provider decides the terminal state; report what was requested.
      vscode.window.setStatusBarMessage(
        "Stop requested and acknowledged. The provider reports the final state.",
        5000,
      );
      await state.refresh();
    }),
  );

  register("resumeSession", (argument) =>
    guard(async () => {
      const run = runFrom(argument);
      if (!run) return;
      const confirm = await vscode.window.showInformationMessage(
        "Resume " +
          (run.title || run.id) +
          " through its existing provider session?",
        { modal: true, detail: "No duplicate session is created." },
        "Resume",
      );
      if (!confirm) return;
      await client.call("run.resume", { id: run.id });
      await state.refresh();
    }),
  );

  register("setModel", (argument) =>
    guard(async () => {
      const run = runFrom(argument);
      if (!run) return;
      const catalog = await client.call("models", { provider: run.provider });
      const picked = await vscode.window.showQuickPick(
        catalog.models.map((model) => ({
          label: model.label || model.id,
          description: model.id === run.model ? "current" : undefined,
          detail: model.description || undefined,
          id: model.id,
        })),
        {
          title: "Model for " + (run.title || run.id),
          placeHolder: catalog.access,
        },
      );
      if (!picked) return;
      const result = await client.call("run.model", {
        id: run.id,
        model: picked.id,
      });
      vscode.window.showInformationMessage(
        "Requested `" +
          result.requested +
          "`. Applies " +
          (result.applies || "on resume") +
          ". The provider last reported `" +
          (result.actual || "unknown") +
          "`.",
      );
      await state.refresh();
    }),
  );

  register("openChanges", (argument) =>
    guard(async () => {
      const run = runFrom(argument);
      if (!run) return;
      const changes = await client.call("run.changes", { id: run.id });
      const items = [
        ...changes.files.map((file) => ({
          label: file.path,
          description:
            "+" + (file.additions ?? "?") + " -" + (file.deletions ?? "?"),
          detail: "committed on " + changes.branch,
          file,
        })),
        ...changes.uncommitted.map((file) => ({
          label: file.path,
          description: file.status,
          detail: "not committed yet",
          file,
        })),
      ];
      if (!items.length) {
        vscode.window.showInformationMessage(
          "This conversation has not changed any files in its worktree.",
        );
        return;
      }
      const picked = await vscode.window.showQuickPick(items, {
        title:
          "Changes in " +
          (run.title || run.id) +
          (changes.truncated ? " (list truncated)" : ""),
        placeHolder: changes.worktree,
      });
      if (!picked) return;
      // Diff against the revision the run started from, read through the
      // workspace that owns the repository.
      const base = vscode.Uri.parse(
        "avoozl-run-base:/" +
          encodeURIComponent(run.id) +
          "/" +
          picked.file.path,
      );
      const current = vscode.Uri.file(
        path.join(changes.worktree, picked.file.path),
      );
      await vscode.commands.executeCommand(
        "vscode.diff",
        base,
        current,
        picked.file.path + " (" + changes.base.slice(0, 10) + " ↔ worktree)",
      );
    }),
  );

  register("validate", (argument) =>
    guard(async () => {
      const run = runFrom(argument);
      if (!run) return;
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Running the project's acceptance checks",
        },
        () => client.call("run.validate", { id: run.id }),
      );
      log("Validation for " + run.id + ": " + JSON.stringify(result.passed));
      const failed = result.results.filter((entry) => entry.exitCode !== 0);
      if (result.passed)
        vscode.window.showInformationMessage(
          "Checks passed at `" +
            result.commit.slice(0, 10) +
            "`. This is implementation evidence, not acceptance.",
        );
      else
        vscode.window.showWarningMessage(
          "Checks did not pass: " +
            (failed[0]
              ? failed[0].argv.join(" ") + " exited " + failed[0].exitCode
              : result.unchanged
                ? "the worktree changed during validation"
                : "see the conversation"),
        );
      await state.refresh();
    }),
  );

  register("integrate", (argument) =>
    guard(async () => {
      const id =
        typeof argument === "string" ? argument : argument?.integrationId;
      const entry = state.snapshot.workspace.integrations.find(
        (candidate) => candidate.id === id,
      );
      if (!entry) {
        vscode.window.showInformationMessage(
          "That work is not queued for integration.",
        );
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        "Integrate " + entry.taskId + " at " + entry.commit.slice(0, 10) + "?",
        {
          modal: true,
          detail:
            "The work is rebased onto the base branch, revalidated, and fast-forward merged. Integration is not whole-head acceptance.",
        },
        "Integrate",
      );
      if (!confirm) return;
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Integrating",
        },
        () =>
          client.call("integration.merge", {
            id: entry.id,
            expectedCommit: entry.commit,
          }),
      );
      vscode.window.showInformationMessage(
        "Integrated `" +
          result.integratedCommit.slice(0, 10) +
          "`. Record acceptance separately.",
      );
      await state.refresh();
    }),
  );

  register("acceptTask", (argument) =>
    guard(async () => {
      const taskId = typeof argument === "string" ? argument : argument?.taskId;
      const task = await client.call("task.get", { id: taskId });
      const scope = await vscode.window.showQuickPick(
        [
          {
            label: "Whole-head acceptance",
            detail:
              "Requires a recorded integration. Marks the task accepted." +
              (task.integration
                ? ""
                : " Not available: nothing is integrated."),
            componentOnly: false,
          },
          {
            label: "Component acceptance only",
            detail:
              "Marks the task implemented without claiming whole-head acceptance.",
            componentOnly: true,
          },
        ],
        { title: "Acceptance for " + (task.title || task.id) },
      );
      if (!scope) return;
      // Optional: when a run has been validated, the workspace records what
      // ran and against which commit, so there is nothing to retype.
      const evidence = await vscode.window.showInputBox({
        title: "Acceptance evidence (optional)",
        prompt:
          "Leave empty to record the validated run's own checks, if there are any.",
        placeHolder: "Optional",
        ignoreFocusOut: true,
      });
      if (evidence === undefined) return;
      const accepted = await client.call("task.accept", {
        id: task.id,
        ...(evidence.trim() ? { evidence: evidence.trim() } : {}),
        componentOnly: scope.componentOnly,
      });
      vscode.window.showInformationMessage(
        accepted.acceptanceEvidence?.evidence
          ? "Recorded: " + accepted.acceptanceEvidence.evidence
          : "Recorded acceptance with no evidence note.",
      );
      await state.refresh();
    }),
  );

  register("installExample", () =>
    guard(async () => {
      const { examples } = await client.call("workspace.examples");
      const picked = await vscode.window.showQuickPick(
        examples.map((pack) => ({
          label: pack.title,
          description: pack.id,
          detail: pack.description,
          id: pack.id,
        })),
        { title: "Install an example pack" },
      );
      if (!picked) return;
      const confirm = await vscode.window.showInformationMessage(
        "Install the " + picked.label + " example pack into this workspace?",
        {
          modal: true,
          detail:
            "Example data is installed once and preserves your existing records. It approves nothing, starts no agent, and configures no repository.",
        },
        "Install",
      );
      if (!confirm) return;
      const receipt = await client.call("workspace.seed", {
        example: picked.id,
      });
      vscode.window.showInformationMessage(
        receipt.existing
          ? "That pack was already installed; your edits were preserved."
          : "Installed " + receipt.taskIds.length + " example tasks.",
      );
      await state.refresh();
    }),
  );

  // Deep links, so a task or conversation can be opened from the website, the
  // CLI, or a script without retyping identifiers.
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri) {
        const query = new URLSearchParams(uri.query || "");
        if (!state.ready) await state.refresh();
        if (uri.path === "/conversation") {
          const runId = query.get("run");
          const taskId = query.get("task");
          await vscode.commands.executeCommand(
            "avoozl.openConversation",
            runId ? { runId } : { taskId },
          );
        } else if (uri.path === "/task")
          await vscode.commands.executeCommand(
            "avoozl.openTask",
            query.get("id"),
          );
        else if (uri.path === "/plan")
          await vscode.commands.executeCommand(
            "avoozl.openPlan",
            query.get("id"),
          );
        else if (uri.path === "/graph") panels.open("graph");
        else if (uri.path === "/diagnostics")
          await vscode.commands.executeCommand("avoozl.diagnostics");
        else
          vscode.window.showWarningMessage(
            "Avoozl does not handle the link " + uri.path + ".",
          );
      },
    }),
  );

  connect();
  return { client: () => client, state, navigator };
}

function deactivate() {}

module.exports = { activate, deactivate };
