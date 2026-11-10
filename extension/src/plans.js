"use strict";
// Native Markdown editing of plan drafts, backed by the shared plan
// operations.
//
// Two rules shape this file:
//
//   * Saving records a draft revision. It never approves anything. Approval is
//     a separate, explicit command that shows the exact reviewed revision and
//     the task and dependency set it would extract.
//   * A save carries the hash the editor last read. If the draft changed
//     underneath, the save is refused, the editor keeps the user's buffer, and
//     the user chooses to reload, compare, or resolve. A conflicting save can
//     never overwrite another client's revision.
const vscode = require("vscode");

const SCHEME = "avoozl-plan";

class PlanFileSystem {
  constructor(client, log) {
    this.client = client;
    this.log = log;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeFile = this.emitter.event;
    // The hash each open document was last read or saved at. This, not the
    // server's current hash, is what a save must be checked against.
    this.reviewed = new Map();
    this.cache = new Map();
  }
  static planId(uri) {
    return decodeURIComponent(uri.path.replace(/^\//, "").replace(/\.md$/, ""));
  }
  static uri(planId) {
    return vscode.Uri.parse(SCHEME + ":/" + encodeURIComponent(planId) + ".md");
  }
  watch() {
    return new vscode.Disposable(() => {});
  }
  async stat(uri) {
    const plan = await this.load(uri);
    const modified = Date.parse(plan.updatedAt || plan.createdAt) || Date.now();
    return {
      type: vscode.FileType.File,
      ctime: Date.parse(plan.createdAt) || modified,
      mtime: modified,
      size: Buffer.byteLength(plan.text || "", "utf8"),
      permissions:
        plan.state === "approved"
          ? // An approved revision is a receipt. Amending it means saving a new
            // draft revision, which the plan operations allow; the file itself
            // is not frozen, so no readonly flag is claimed here.
            undefined
          : undefined,
    };
  }
  async load(uri) {
    const id = PlanFileSystem.planId(uri);
    const plan = await this.client.call("plan.get", { id });
    this.cache.set(uri.toString(), plan);
    return plan;
  }
  async readFile(uri) {
    let plan;
    try {
      plan = await this.load(uri);
    } catch (error) {
      if (error.status === 404) throw vscode.FileSystemError.FileNotFound(uri);
      throw error;
    }
    this.reviewed.set(uri.toString(), plan.hash);
    return Buffer.from(plan.text || "", "utf8");
  }
  async writeFile(uri, content) {
    const id = PlanFileSystem.planId(uri);
    const text = Buffer.from(content).toString("utf8");
    const expectedHash = this.reviewed.get(uri.toString());
    if (!expectedHash)
      throw vscode.FileSystemError.Unavailable(
        "Open this plan before saving it, so the save can name the revision it was based on.",
      );
    try {
      const saved = await this.client.call("plan.save", {
        id,
        text,
        expectedHash,
      });
      this.reviewed.set(uri.toString(), saved.hash);
      this.cache.set(uri.toString(), saved);
      this.log(
        "Saved plan " +
          id +
          " as revision " +
          saved.revision +
          " (still " +
          saved.state +
          "; saving does not approve)",
      );
      return;
    } catch (error) {
      if (error.status !== 409) throw error;
      // Keep the buffer. The user decides what to do with the divergence.
      this.conflict(uri, id, text);
      throw vscode.FileSystemError.Unavailable(
        "This draft changed in the workspace since you opened it. Your edits are still here; choose Compare, Reload, or Save as new revision.",
      );
    }
  }
  async conflict(uri, id, localText) {
    const choice = await vscode.window.showWarningMessage(
      "Plan " +
        id +
        " changed in the workspace. Your editor still has your edits.",
      { modal: false },
      "Compare",
      "Save as new revision",
      "Discard my edits",
    );
    if (choice === "Compare")
      await vscode.commands.executeCommand("avoozl.comparePlan", id);
    else if (choice === "Discard my edits")
      await vscode.commands.executeCommand("avoozl.reloadPlan", id);
    else if (choice === "Save as new revision") {
      // Explicitly rebase this save onto the revision now in the workspace.
      // This is a user decision, never an automatic overwrite.
      const current = await this.client.call("plan.get", { id });
      const confirm = await vscode.window.showWarningMessage(
        "Save your text over revision " +
          current.revision +
          "? The workspace keeps every earlier revision in the plan's history.",
        { modal: true },
        "Save over revision " + current.revision,
      );
      if (!confirm) return;
      const saved = await this.client.call("plan.save", {
        id,
        text: localText,
        expectedHash: current.hash,
      });
      this.reviewed.set(uri.toString(), saved.hash);
      this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
      vscode.window.showInformationMessage(
        "Saved plan " +
          id +
          " as revision " +
          saved.revision +
          ". Still a draft.",
      );
    }
  }
  // Called when the workspace reports the plan changed, so an open editor can
  // pick up the new revision without being silently overwritten.
  notifyChanged(planId) {
    const uri = PlanFileSystem.uri(planId);
    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }
  async readDirectory() {
    return [];
  }
  async createDirectory() {
    throw vscode.FileSystemError.NoPermissions(
      "Plans are created through the workspace, not by creating files.",
    );
  }
  async delete() {
    throw vscode.FileSystemError.NoPermissions(
      "Delete a plan through the workspace so its approval history is handled.",
    );
  }
  async rename() {
    throw vscode.FileSystemError.NoPermissions("Plan identifiers are stable.");
  }
}

// A read-only view of the revision currently saved in the workspace, so the
// editor's diff view can compare it against the buffer.
class SavedRevisionProvider {
  // Resolved lazily: the endpoint can change while an editor is open.
  constructor(resolve) {
    this.resolve = resolve;
  }
  async provideTextDocumentContent(uri) {
    const plan = await this.resolve().call("plan.get", {
      id: decodeURIComponent(uri.path.replace(/^\//, "").replace(/\.md$/, "")),
    });
    return plan.text || "";
  }
}

async function reviewApproval(client, planId, log) {
  const plan = await client.call("plan.get", { id: planId });
  const document = vscode.workspace.textDocuments.find(
    (doc) =>
      doc.uri.scheme === SCHEME && PlanFileSystem.planId(doc.uri) === planId,
  );
  if (document?.isDirty) {
    const choice = await vscode.window.showWarningMessage(
      "This plan has unsaved edits. Approval always applies a saved revision, never the editor buffer.",
      { modal: true },
      "Save the draft first",
    );
    if (choice !== "Save the draft first") return;
    if (!(await document.save())) return;
  }
  const preview = await client.call("plan.preview", { id: planId });
  const lines = [
    "# Approve " + (plan.title || planId),
    "",
    "Reviewed revision **" +
      plan.revision +
      "**, hash `" +
      preview.reviewedHash +
      "`.",
    "Database revision **" + preview.expectedRevision + "**.",
    "",
    preview.approved
      ? "> This exact revision is already approved. Approving again returns the original receipt."
      : "> Approving extracts the tasks and dependencies below in one transaction. Nothing below exists yet unless marked existing.",
    "",
    "## Tasks this revision would establish",
    "",
    ...preview.tasks.map(
      (task) =>
        "- `" +
        task.taskId +
        "` — " +
        task.title +
        (task.existing ? " _(updates an existing task)_" : " _(new)_"),
    ),
    "",
    "## Dependencies",
    "",
    ...(preview.dependencies.length
      ? preview.dependencies.map(
          (edge) =>
            "- `" + edge.from + "` " + edge.kind + " → `" + edge.to + "`",
        )
      : ["_None._"]),
  ];
  if (preview.retiring.length)
    lines.push(
      "",
      "## Refused",
      "",
      "This revision drops previously approved task blocks (" +
        preview.retiring.join(", ") +
        "). Retire them explicitly before amending.",
    );
  const panel = await vscode.workspace.openTextDocument({
    content: lines.join("\n"),
    language: "markdown",
  });
  await vscode.window.showTextDocument(panel, { preview: true });
  if (preview.retiring.length) return;
  const confirm = await vscode.window.showWarningMessage(
    "Approve revision " +
      plan.revision +
      " of " +
      (plan.title || planId) +
      "? This creates " +
      preview.tasks.length +
      " task(s) and an immutable approval receipt.",
    { modal: true },
    "Review the details, then approve",
  );
  if (!confirm) return;
  // Only the two hashes are required. Who approved is recorded from the
  // workspace's operator, and a note is kept only if there is one worth
  // keeping: an empty answer leaves the field off the receipt rather than
  // filling it with a sentence that says nothing.
  const note = await vscode.window.showInputBox({
    title: "Approval note (optional)",
    prompt:
      "Anything worth recording beyond the reviewed revision. Leave empty to skip.",
    placeHolder: "Optional",
    ignoreFocusOut: true,
  });
  if (note === undefined) return;
  const receipt = await client.call("plan.approve", {
    id: planId,
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
    ...(note.trim() ? { evidence: note.trim() } : {}),
  });
  log(
    "Approved plan " +
      planId +
      " hash " +
      preview.reviewedHash.slice(0, 16) +
      " receipt " +
      receipt.id,
  );
  vscode.window.showInformationMessage(
    receipt.existing
      ? "This revision was already approved; its original receipt " +
          receipt.id +
          " still applies."
      : "Approved. Receipt " +
          receipt.id +
          " established " +
          receipt.taskIds.length +
          " task(s).",
  );
}

module.exports = {
  PlanFileSystem,
  SavedRevisionProvider,
  reviewApproval,
  SCHEME,
};
