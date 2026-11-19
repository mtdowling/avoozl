// The stable client contract shared by any client of a workspace.
//
// Everything here delegates to the same operations the website, CLI, and MCP
// use. The point of the layer is a named, versioned surface with one place to
// document conflict handling and idempotency rules, not a second state model.
// It deliberately exposes no way to write run records directly.
import { workspaceIdentity } from "./identity.mjs";
import { fail } from "./store.mjs";

const CLIENT_API_VERSION = "1.0.0";

// Operations a client may invoke. Anything absent is refused by name instead
// of being forwarded, so a client cannot reach an unreviewed operation.
export const CLIENT_OPERATIONS = Object.freeze([
  "client.describe",
  "workspace",
  "workspace.examples",
  "workspace.seed",
  "configuration.get",
  "configuration.update",
  "local.ignore.status",
  "local.ignore.fix",
  "state",
  "query",
  "queue",
  "queue.design.triage",
  "conversations.settings.get",
  "conversations.settings.update",
  "task.get",
  "task.update",
  "task.archive",
  "task.unarchive",
  "task.sessions",
  "task.accept",
  "task.supersede",
  "task.duplicates",
  "activity",
  "report.save",
  "report.delete",
  "agent.instructions.source",
  "agent.instructions.toggle",
  "document.get",
  "document.update",
  "plan.list",
  "plan.specs",
  "plan.get",
  "plan.create",
  "plan.save",
  "plan.lint",
  "plan.preview",
  "plan.approve",
  "plan.approveMany",
  "plan.approvalBatches",
  "approval.delegates",
  "approval.delegate.grant",
  "approval.delegate.revoke",
  "plan.extract",
  "plan.extract.get",
  "plan.extraction.submit",
  "plan.extraction.dispose",
  "plan.classify",
  "plan.review.list",
  "plan.reviewSummary",
  "plan.review.submit",
  "plan.review.reply",
  "plan.review.dispose",
  "plan.review.finding.decide",
  "plan.review.view",
  "plan.review.apply",
  "plan.review.pipeline.get",
  "run.start",
  "integration.merge",
  "intent.submit",
  "intent.get",
  "handoff",
  "repository.configure",
  "repository.remove",
  "github.configure",
  "github.repositories",
  "github.issues",
  "github.sync",
  "github.authorize",
  "repositories.list",
  "repositories.detect",
  "repositories.configure",
  "repositories.remove",
  "workspace.repository.configure",
  "workspace.repository.status",
  "workspace.repository.publish",
  "workspace.repository.sync",
  "planning.publish",
  "planning.reconcile",
]);

// Rules a client must follow. Published through `client.describe` so a client
// cannot be written against guesses about them.
const CLIENT_CONTRACT = Object.freeze({
  idempotency: Object.freeze({
    "intent.submit":
      "Reuse submissionId to retry. A different prompt under the same submissionId is rejected with 409.",
    "workspace.seed":
      "Seeding is transactional and installed once; a retry returns the first receipt.",
    "plan.approve":
      "Approving the same reviewed hash again returns the original approval receipt.",
  }),
  conflicts: Object.freeze({
    "plan.save": "Send expectedHash. A stale hash is rejected with 409.",
    "document.update": "Send expectedHash. A stale hash is rejected with 409.",
    "plan.approve":
      "Send expectedHash and expectedRevision. Saving never approves.",
    "task.update":
      "Send expectedRevision to refuse a write against a changed database.",
  }),
  ordering:
    "Events are ordered by a durable server sequence. Read history with run.get using after/before cursors; never order by arrival time.",
  states: Object.freeze([
    "starting",
    "running",
    "waiting-input",
    "waiting-approval",
    "completed",
    "interrupted",
    "failed",
    "disconnected",
    "integrated",
    "observing",
  ]),
});

export function describeWorkspace(store) {
  return {
    application: "avoozl",
    apiVersion: CLIENT_API_VERSION,
    workspaceId: workspaceIdentity(store),
    revision: store.read().revision,
    mode: store.getMeta("mode"),
    authority: store.filename,
    operations: CLIENT_OPERATIONS,
    contract: CLIENT_CONTRACT,
  };
}

// Transport over an in-process `Operations` instance.
function localTransport(ops) {
  return {
    kind: "local",
    async call(operation, input, expectedRevision) {
      return ops.execute(operation, input, expectedRevision);
    },
  };
}

// Transport over a running workspace server's shared command endpoint.
function httpTransport({
  endpoint,
  workspaceId,
  fetch: fetchImpl = globalThis.fetch,
  headers = {},
  timeoutMs = 30000,
}) {
  if (!endpoint) fail("A workspace endpoint is required.");
  const base = endpoint.replace(/\/$/, "");
  const scopedBase = workspaceId
    ? base + "/api/workspaces/" + encodeURIComponent(workspaceId)
    : base;
  return {
    kind: "http",
    endpoint: scopedBase,
    workspaceId: workspaceId || null,
    async call(operation, input, expectedRevision) {
      let response;
      try {
        response = await fetchImpl(
          workspaceId
            ? scopedBase + "/operations/" + encodeURIComponent(operation)
            : base + "/api/command",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(
              workspaceId
                ? { input, expectedRevision }
                : { operation, input, expectedRevision },
            ),
            signal: AbortSignal.timeout(timeoutMs),
          },
        );
      } catch (error) {
        fail(
          "The workspace server is unreachable at " +
            base +
            ". Durable state is unchanged; retry with the same submission IDs. (" +
            error.message +
            ")",
          503,
        );
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) fail(body.error || "Request failed.", response.status);
      return body.result;
    },
    async events({ after = 0, cursor, runId, limit } = {}) {
      const url = new URL(
        workspaceId ? scopedBase + "/events" : base + "/api/events",
      );
      url.searchParams.set("after", String(cursor ?? after));
      if (runId) url.searchParams.set("run", runId);
      if (limit) url.searchParams.set("limit", String(limit));
      const response = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.json();
      if (!response.ok) fail(body.error || "Request failed.", response.status);
      return body.events;
    },
  };
}

export class WorkspaceClient {
  constructor(transport) {
    this.transport = transport;
  }
  async call(operation, input = {}, expectedRevision) {
    if (!CLIENT_OPERATIONS.includes(operation))
      fail("Operation " + operation + " is not part of the client API.", 400);
    return this.transport.call(operation, input, expectedRevision);
  }
  // Compatibility check. A client must refuse to drive a workspace whose
  // major API version it does not speak rather than guessing.
  async describe() {
    const described = await this.call("client.describe");
    const [major] = String(described.apiVersion || "").split(".");
    if (major !== CLIENT_API_VERSION.split(".")[0])
      fail(
        "This workspace speaks client API " +
          described.apiVersion +
          "; this client speaks " +
          CLIENT_API_VERSION +
          ".",
        409,
      );
    return described;
  }
  workspace() {
    return this.call("workspace");
  }
  state() {
    return this.call("state");
  }
  tasks(query = {}) {
    return this.call("query", { scope: "all", ...query });
  }
  task(id) {
    return this.call("task.get", { id });
  }
  queue(input = {}) {
    return this.call("queue", input);
  }
  conversationSettings() {
    return this.call("conversations.settings.get");
  }
  updateConversationSettings(input) {
    return this.call("conversations.settings.update", input);
  }
  updateTask(input, expectedRevision) {
    return this.call("task.update", input, expectedRevision);
  }
  taskSessions(id) {
    return this.call("task.sessions", { id });
  }
  document(id) {
    return this.call("document.get", { id });
  }
  saveDocument({ id, text, expectedHash }) {
    return this.call("document.update", { id, text, expectedHash });
  }
  plans(input = {}) {
    return this.call("plan.list", input);
  }
  plan(id) {
    return this.call("plan.get", { id });
  }
  createPlan(input) {
    return this.call("plan.create", input);
  }
  // Saving records a new draft revision. It never approves.
  savePlan({ id, text, expectedHash }) {
    return this.call("plan.save", { id, text, expectedHash });
  }
  // What approving a revision would extract, without changing anything.
  previewPlan({ id, text }) {
    return this.call("plan.preview", { id, text });
  }
  // Approval is a separate, explicit, transactional operation that names the
  // exact reviewed hash and database revision.
  approvePlan({
    id,
    expectedHash,
    expectedRevision,
    approvedBy,
    evidence,
    retitled,
  }) {
    return this.call("plan.approve", {
      id,
      expectedHash,
      expectedRevision,
      approvedBy,
      evidence,
      retitled,
    });
  }
  events(input = {}) {
    if (this.transport.events) return this.transport.events(input);
    return this.call("state").then(() => {
      fail("This transport cannot read the event stream.", 400);
    });
  }
  submit(input) {
    if (!input.submissionId) fail("A submission ID is required.");
    return this.call("intent.submit", input);
  }
  submission(submissionId) {
    return this.call("intent.get", { submissionId });
  }
  integrate({ id, expectedCommit }) {
    return this.call("integration.merge", { id, expectedCommit });
  }
  examples() {
    return this.call("workspace.examples");
  }
  seed(input) {
    return this.call("workspace.seed", input);
  }
  handoff(id) {
    return this.call("handoff", { id });
  }
}
