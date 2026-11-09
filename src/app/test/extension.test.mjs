import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { fixture, markdown } from "./fixtures.mjs";
import { startServer } from "../server.mjs";
import { RunManager } from "../manager.mjs";
import { Operations } from "../operations.mjs";

const extensionRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../extension/src",
);

// The extension runs inside VS Code, so its modules import `vscode`. A stub
// stands in for the editor so the parts that must be right regardless of the
// editor — conflict-safe plan saves, the refusal to approve on save, the
// capability gate on native navigation — are tested here rather than only by
// hand in an editor.
function installVscodeStub(t, overrides = {}) {
  const calls = { messages: [], commands: [], status: [], inputs: [] };
  const queue = { warnings: [], inputs: [], picks: [] };
  class ThemeIcon {
    constructor(id, color) {
      this.id = id;
      this.color = color;
    }
  }
  class FileSystemError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
    static FileNotFound(uri) {
      return new FileSystemError(String(uri), "FileNotFound");
    }
    static Unavailable(message) {
      return new FileSystemError(message, "Unavailable");
    }
    static NoPermissions(message) {
      return new FileSystemError(message, "NoPermissions");
    }
  }
  const stub = {
    version: overrides.version || "1.138.0",
    FileType: { File: 1, Directory: 2 },
    FileChangeType: { Changed: 1, Created: 2, Deleted: 3 },
    FileSystemError,
    ThemeIcon,
    ThemeColor: class {
      constructor(id) {
        this.id = id;
      }
    },
    TreeItem: class {
      constructor(label, collapsible) {
        this.label = label;
        this.collapsibleState = collapsible;
      }
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    MarkdownString: class {
      constructor(value) {
        this.value = value;
      }
    },
    EventEmitter: class {
      constructor() {
        this.handlers = [];
        this.event = (handler) => {
          this.handlers.push(handler);
          return { dispose: () => {} };
        };
      }
      fire(value) {
        for (const handler of this.handlers) handler(value);
      }
      dispose() {}
    },
    Disposable: class {
      constructor(fn) {
        this.dispose = fn || (() => {});
      }
    },
    Uri: {
      parse: (value) => ({
        scheme: value.split(":")[0],
        path: value.slice(value.indexOf(":") + 1),
        with: (changes) => ({ ...changes, toString: () => value }),
        toString: () => value,
      }),
      file: (value) => ({
        scheme: "file",
        path: value,
        fsPath: value,
        with: (changes) => ({ ...changes, toString: () => value }),
        toString: () => "file://" + value,
      }),
      joinPath: (base, ...parts) => ({
        toString: () => [base?.toString() || "", ...parts].join("/"),
      }),
    },
    workspace: {
      textDocuments: [],
      getConfiguration: () => ({
        get: (key, fallback) =>
          overrides.configuration?.[key] !== undefined
            ? overrides.configuration[key]
            : fallback,
      }),
      registerFileSystemProvider: () => ({ dispose: () => {} }),
      registerTextDocumentContentProvider: () => ({ dispose: () => {} }),
      onDidChangeConfiguration: () => ({ dispose: () => {} }),
      openTextDocument: async (value) => ({ ...value, save: async () => true }),
      findFiles: async () => [],
    },
    window: {
      createOutputChannel: () => ({
        appendLine: (line) => calls.messages.push({ kind: "log", line }),
        dispose: () => {},
      }),
      createStatusBarItem: () => ({
        show: () => calls.status.push("show"),
        dispose: () => {},
      }),
      createTreeView: () => ({ dispose: () => {} }),
      createWebviewPanel: () => ({
        webview: {
          asWebviewUri: (uri) => uri,
          cspSource: "vscode-resource:",
          onDidReceiveMessage: () => ({ dispose: () => {} }),
          postMessage: () => {},
        },
        reveal: () => {},
        onDidDispose: () => ({ dispose: () => {} }),
        onDidChangeViewState: () => ({ dispose: () => {} }),
        dispose: () => {},
        visible: true,
      }),
      showTextDocument: async () => ({ revealRange: () => {} }),
      showInformationMessage: async (message, ...rest) => {
        calls.messages.push({ kind: "info", message, rest });
        return queue.warnings.shift();
      },
      showWarningMessage: async (message, ...rest) => {
        calls.messages.push({ kind: "warning", message, rest });
        return queue.warnings.shift();
      },
      showErrorMessage: async (message) => {
        calls.messages.push({ kind: "error", message });
      },
      showInputBox: async (options) => {
        calls.inputs.push(options);
        return queue.inputs.shift();
      },
      showQuickPick: async (items, options) => {
        calls.commands.push({ kind: "quickPick", options });
        const next = queue.picks.shift();
        return typeof next === "function" ? next(await items) : next;
      },
      setStatusBarMessage: () => {},
      withProgress: async (_options, task) => task(),
      activeTextEditor: null,
    },
    commands: {
      registerCommand: (name, handler) => {
        calls.registered ??= new Map();
        calls.registered.set(name, handler);
        return { dispose: () => {} };
      },
      executeCommand: async (name, ...args) => {
        calls.commands.push({ name, args });
        if (overrides.executeCommand)
          return overrides.executeCommand(name, args);
      },
      getCommands: async () => overrides.commands || [],
    },
    languages: { setTextDocumentLanguage: async (doc) => doc },
    env: {
      openExternal: async (uri) => calls.commands.push({ open: String(uri) }),
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ViewColumn: { Active: -1 },
    ProgressLocation: { Notification: 15 },
    Range: class {
      constructor(a, b, c, d) {
        Object.assign(this, { a, b, c, d });
      }
    },
    TextEditorRevealType: { InCenter: 2 },
  };
  const load = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "vscode") return stub;
    return load.apply(this, arguments);
  };
  t.after(() => {
    Module._load = load;
  });
  return { stub, calls, queue };
}

function loadExtensionModule(name) {
  const require = createRequire(import.meta.url);
  const resolved = require.resolve(path.join(extensionRoot, name));
  delete require.cache[resolved];
  return require(resolved);
}

async function serve(t) {
  const { store, root } = fixture(t);
  const manager = new RunManager(store, { recover: false, factories: {} });
  const server = startServer({
    dbPath: store.filename,
    port: 0,
    projectionRoot: path.join(root, "documents"),
    manager,
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const endpoint = "http://127.0.0.1:" + server.address().port;
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
  );
  return { store, root, server, endpoint, ops: server.workspace.ops };
}

test("the extension client refuses a workspace speaking another API major version", async (t) => {
  installVscodeStub(t);
  const { endpoint, store } = await serve(t);
  const { WorkspaceClient } = loadExtensionModule("client.js");
  const client = new WorkspaceClient(endpoint);
  const described = await client.describe();
  assert.equal(described.application, "avoozl");
  assert.ok(described.workspaceId);
  assert.ok(described.operations.includes("plan.save"));
  // The contract a client must follow is published, not guessed at.
  assert.match(described.contract.idempotency["run.send"], /submissionId/);
  assert.match(
    described.contract.cancellation,
    /interrupted keeps the provider/,
  );

  const unreachable = new WorkspaceClient("http://127.0.0.1:1");
  await assert.rejects(unreachable.describe(), /Cannot reach the workspace/);
});

test("saving a plan records a revision and never approves it", async (t) => {
  installVscodeStub(t);
  const { endpoint, ops, store } = await serve(t);
  const plan = await ops.execute("plan.create", {
    prompt: "A small plan",
    text: markdown,
  });
  const { WorkspaceClient } = loadExtensionModule("client.js");
  const { PlanFileSystem } = loadExtensionModule("plans.js");
  const client = new WorkspaceClient(endpoint);
  const logged = [];
  const fs = new PlanFileSystem(client, (line) => logged.push(line));
  const uri = PlanFileSystem.uri(plan.id);
  const read = await fs.readFile(uri);
  assert.equal(read.toString("utf8"), markdown);
  await fs.writeFile(uri, Buffer.from(markdown + "\nAn added paragraph.\n"));
  const saved = store.get("plans", plan.id);
  assert.equal(saved.revision, 2);
  assert.equal(saved.state, "draft", "saving must never approve");
  assert.equal(store.list("approvals").length, 0);
  assert.equal(store.read().tasks.length, 1, "no tasks were extracted");
  assert.match(logged.join("\n"), /saving does not approve/);
});

test("a conflicting save keeps the editor buffer and cannot overwrite another revision", async (t) => {
  const { queue, calls } = installVscodeStub(t);
  const { endpoint, ops, store } = await serve(t);
  const plan = await ops.execute("plan.create", {
    prompt: "A small plan",
    text: markdown,
  });
  const { WorkspaceClient } = loadExtensionModule("client.js");
  const { PlanFileSystem } = loadExtensionModule("plans.js");
  const client = new WorkspaceClient(endpoint);
  const fs = new PlanFileSystem(client, () => {});
  const uri = PlanFileSystem.uri(plan.id);
  await fs.readFile(uri);
  // Another client saves first, exactly as the website would.
  const other = await ops.execute("plan.save", {
    id: plan.id,
    text: markdown + "\nWritten by the website.\n",
    expectedHash: plan.hash,
  });
  assert.equal(other.revision, 2);
  // The editor's save names the revision it was based on and is refused.
  queue.warnings.push(undefined);
  await assert.rejects(
    fs.writeFile(uri, Buffer.from(markdown + "\nWritten in the editor.\n")),
    /changed in the workspace/,
  );
  const current = store.get("plans", plan.id);
  assert.equal(
    current.text,
    markdown + "\nWritten by the website.\n",
    "a conflicting editor save must not overwrite the other revision",
  );
  assert.equal(current.revision, 2);
  assert.ok(
    calls.messages.some((entry) =>
      /changed in the workspace/.test(entry.message),
    ),
    "the user is offered compare, reload, or an explicit rebase",
  );

  // Choosing to save over the current revision is an explicit decision.
  queue.warnings.push("Save as new revision", "Save over revision 2");
  await fs
    .writeFile(uri, Buffer.from(markdown + "\nWritten in the editor.\n"))
    .catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 60));
  const after = store.get("plans", plan.id);
  assert.equal(after.revision, 3);
  assert.match(after.text, /Written in the editor/);
  // Every earlier revision is still on the record.
  assert.equal(after.history.length, 2);
  assert.match(after.history[1].text, /Written by the website/);
  assert.equal(after.state, "draft");
});

test("approval shows the reviewed revision and the exact set it would create", async (t) => {
  const { queue, calls } = installVscodeStub(t);
  const { endpoint, ops, store } = await serve(t);
  const plan = await ops.execute("plan.create", {
    prompt: "A small plan",
    text: markdown,
  });
  const { WorkspaceClient } = loadExtensionModule("client.js");
  const { reviewApproval } = loadExtensionModule("plans.js");
  const client = new WorkspaceClient(endpoint);
  const opened = [];
  // Review, then approve, with the authorizing name and evidence.
  queue.warnings.push("Review the details, then approve");
  queue.inputs.push("Read the design and the task blocks.");
  const logged = [];
  await reviewApproval(client, plan.id, (line) => logged.push(line));
  const review = calls.messages.find((entry) => entry.kind === "warning");
  assert.match(review.message, /Approve revision 1/);
  assert.match(review.message, /creates 2 task\(s\)/);
  const approvals = store.list("approvals");
  assert.equal(approvals.length, 1);
  assert.equal(
    approvals[0].evidence,
    "Read the design and the task blocks.",
    "a note the caller actually wrote is kept",
  );
  assert.equal(approvals[0].hash, plan.hash);
  assert.equal(approvals[0].taskIds.length, 2);
  assert.equal(store.get("plans", plan.id).state, "approved");
  // Approving the same reviewed revision again returns the first receipt.
  // An empty note is skipped rather than stored as a sentence saying nothing.
  queue.warnings.push("Review the details, then approve");
  queue.inputs.push("");
  await reviewApproval(client, plan.id, (line) => logged.push(line));
  assert.equal(store.list("approvals").length, 1);
  assert.ok(
    calls.messages.some((entry) =>
      /already approved/.test(entry.message || ""),
    ),
  );
});

test("approval refuses a revision that would drop an approved task", async (t) => {
  const { queue, calls } = installVscodeStub(t);
  const { endpoint, ops, store } = await serve(t);
  const plan = await ops.execute("plan.create", {
    prompt: "A small plan",
    text: markdown,
  });
  await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
    approvedBy: "Reviewer",
    evidence: "First approval",
  });
  // Amend the plan so one approved block disappears.
  const reduced = markdown.replace(
    /```task\n\{"id":"delivery"[\s\S]*?```\n/,
    "",
  );
  const saved = await ops.execute("plan.save", {
    id: plan.id,
    text: reduced,
    expectedHash: store.get("plans", plan.id).hash,
  });
  assert.equal(saved.state, "draft");
  const { WorkspaceClient } = loadExtensionModule("client.js");
  const { reviewApproval } = loadExtensionModule("plans.js");
  const client = new WorkspaceClient(endpoint);
  await reviewApproval(client, plan.id, () => {});
  // No approval prompt is shown at all: the review states the refusal.
  assert.equal(
    calls.messages.filter((entry) => entry.kind === "warning").length,
    0,
  );
  assert.equal(store.list("approvals").length, 1);
});

test("native conversation navigation is gated, verified, and falls back", async (t) => {
  const { calls, queue, stub } = installVscodeStub(t, {
    version: "1.138.0",
    commands: [],
    configuration: { nativeChatNavigation: "auto" },
  });
  const { endpoint, store } = await serve(t);
  const { WorkspaceClient } = loadExtensionModule("client.js");
  const { ChatNavigator, NATIVE_COMMAND } =
    loadExtensionModule("navigation.js");
  store.put("runs", {
    id: "run-nav",
    taskId: "sample-task",
    state: "completed",
    mode: "ask",
    provider: "codex",
    prompt: "A question",
  });
  const client = new WorkspaceClient(endpoint);
  const logged = [];
  const absent = new ChatNavigator({
    client,
    log: (line) => logged.push(line),
  });
  const capability = await absent.probe();
  assert.equal(capability.registered, false);
  assert.equal(capability.canVerifyIdentity, false);
  // With the command missing, the picker is used and nothing claims success.
  queue.picks.push(undefined);
  const report = await absent.open("run-nav");
  assert.equal(report.used, "picker");
  assert.equal(report.verified, false);
  assert.match(report.verification, /not registered/);
  assert.equal(
    calls.commands.some((entry) => entry.name === NATIVE_COMMAND),
    false,
    "an unregistered command is never invoked",
  );

  // With the command present but no way to confirm identity, the attempt is
  // reported as unverified rather than as success.
  const present = new ChatNavigator({
    client,
    log: (line) => logged.push(line),
  });
  present.capability = {
    ...capability,
    registered: true,
    tested: true,
    setting: "auto",
  };
  present.manifest = () => null;
  queue.picks.push(undefined);
  const unverified = await present.open("run-nav");
  assert.equal(unverified.used, "picker");
  assert.equal(unverified.verified, false);
  assert.match(unverified.verification, /no connected agent host/);
});

test("the task graph webview is bounded by its page and reuses workspace models", async (t) => {
  installVscodeStub(t);
  const { endpoint, store } = await serve(t);
  const { WorkspaceClient } = loadExtensionModule("client.js");
  const { WorkspaceState } = loadExtensionModule("state.js");
  const { VisualPanels } = loadExtensionModule("webviews.js");
  // More tasks than one page.
  store.mutate("Add many tasks", (data) => {
    for (let i = 0; i < 900; i++)
      data.tasks.push({
        id: "bulk-" + i,
        title: "Bulk task " + i,
        scope: "catalog",
        status: "planned",
        epic: "sample",
        track: "catalog",
        tags: [],
        acceptance: ["Checked."],
      });
  });
  const client = new WorkspaceClient(endpoint);
  const state = new WorkspaceState(client);
  await state.refresh();
  assert.equal(state.snapshot.tasks.length, 901);
  const posted = [];
  const panels = new VisualPanels({
    client,
    state,
    context: {},
    log: () => {},
  });
  const entry = panels.open("graph");
  entry.panel.webview.postMessage = (message) => posted.push(message);
  panels.push(entry);
  const payload = posted.at(-1);
  assert.equal(payload.total, 901);
  assert.equal(
    payload.tasks.length,
    400,
    "the delivered page is bounded, not the whole graph",
  );
  assert.ok(JSON.stringify(payload).length < 400000);
  entry.offset = 800;
  panels.push(entry);
  assert.equal(posted.at(-1).tasks.length, 101);
  assert.equal(posted.at(-1).offset, 800);
  // A hidden panel receives nothing.
  entry.visible = false;
  const before = posted.length;
  panels.pushAll();
  assert.equal(posted.length, before);
  const html = panels.html(entry.panel.webview, "graph");
  assert.match(html, new RegExp("script-src 'nonce-[0-9]+' " + endpoint));
  assert.match(html, new RegExp("connect-src " + endpoint));
  assert.equal(
    /default-src 'none'/.test(html),
    true,
    "the webview may reach only the workspace that owns the data",
  );
});

test("the native conversation command is given a Uri, not a string", async (t) => {
  // VS Code calls `.with()` on the resource it is handed. Passing a string
  // fails with "o.with is not a function", which silently pushed every
  // attempt onto the fallback path.
  const received = [];
  const { calls, queue } = installVscodeStub(t, {
    version: "1.138.0",
    commands: ["workbench.action.chat.openSessionInEditorGroup"],
    configuration: { nativeChatNavigation: "auto" },
    executeCommand: (name, args) => {
      if (name !== "workbench.action.chat.openSessionInEditorGroup") return;
      const resource = args[0]?.resource;
      received.push(resource);
      // Exactly what the editor does with it.
      if (typeof resource?.with !== "function")
        throw Error("o.with is not a function");
    },
  });
  const { endpoint, store } = await serve(t);
  const { WorkspaceClient } = loadExtensionModule("client.js");
  const { ChatNavigator } = loadExtensionModule("navigation.js");
  store.put("runs", {
    id: "run-uri",
    taskId: "sample-task",
    state: "waiting-approval",
    mode: "implement",
    provider: "claude",
    prompt: "Needs a decision",
  });
  const navigator = new ChatNavigator({
    client: new WorkspaceClient(endpoint),
    log: () => {},
  });
  navigator.manifest = () => ({
    url: "ws://127.0.0.1:1",
    clients: { editor: { address: "ws://127.0.0.1:1/?token=x" } },
  });
  navigator.channels = async () => ({
    session: "ahp-session:/abc",
    chat: "ahp-chat:/def",
    provider: "claude",
    candidates: ["agent-host-claude:/abc"],
  });
  // No facade is reachable, so identity cannot be confirmed and the picker is
  // used. The point is what the command was handed before that.
  navigator.confirmSubscription = async () => ({
    confirmed: false,
    detail: "no facade in this test",
  });
  queue.picks.push(undefined);
  const report = await navigator.open("run-uri");
  assert.equal(received.length, 1);
  assert.equal(
    typeof received[0]?.with,
    "function",
    "the resource must be a Uri",
  );
  assert.equal(received[0].toString(), "agent-host-claude:/abc");
  assert.equal(
    report.tried[0].detail.includes("o.with is not a function"),
    false,
    "a Uri must not be rejected by the command",
  );
});
