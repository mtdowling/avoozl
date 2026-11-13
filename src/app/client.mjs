// The stable client contract shared by any client of a workspace.
//
// Everything here delegates to the same operations the website, CLI, and MCP
// use. The point of the layer is a named, versioned surface with one place to
// document conflict handling and idempotency rules, not a second state model.
// It deliberately exposes no way to write run records directly.
import { workspaceIdentity } from "./identity.mjs";
import { fail } from "./store.mjs";

export const CLIENT_API_VERSION = "1.0.0";

// Operations a client may invoke. Anything absent is refused by name instead
// of being forwarded, so a client cannot reach an unreviewed operation.
export const CLIENT_OPERATIONS = Object.freeze([
  "client.describe",
  "workspace",
  "concurrency.status",
  "workspace.examples",
  "workspace.seed",
  "safety.status",
  "safety.raise",
  "safety.note",
  "safety.interrupt.retry",
  "safety.remediation.request",
  "safety.remediation.grant",
  "safety.remediation.revoke",
  "safety.review",
  "safety.resolve",
  "safety.resume",
  "safety.coordinator.ack",
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
  "conversations.routing.preview",
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
  "plan.extract",
  "plan.extract.get",
  "plan.extraction.submit",
  "plan.extraction.dispose",
  "plan.classify",
  "plan.review.list",
  "plan.review.submit",
  "plan.review.reply",
  "plan.review.dispose",
  "plan.review.apply",
  "plan.review.pipeline",
  "plan.review.pipeline.get",
  "driver.list",
  "driver.open",
  "driver.context",
  "run.list",
  "run.get",
  "run.context",
  "run.event",
  "run.start",
  "run.send",
  "run.answer",
  "run.interrupt",
  "run.resume",
  "run.approvals",
  "run.model",
  "run.unsend",
  "run.queue",
  "run.changes",
  "run.validate",
  "run.archive",
  "run.unarchive",
  "integration.merge",
  "intent.submit",
  "intent.get",
  "models",
  "handoff",
  "metrics",
  "usage.limits",
  "project.configure",
  "project.remove",
  "github.configure",
  "github.repositories",
  "github.issues",
  "github.sync",
  "github.authorize",
  "github.project",
  "github.project.preview",
  "github.start",
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
export const CLIENT_CONTRACT = Object.freeze({
  idempotency: Object.freeze({
    "intent.submit":
      "Reuse submissionId to retry. A different prompt under the same submissionId is rejected with 409.",
    "run.send":
      "submissionId is required and deduplicates delivery. Reconnecting and retrying the same submissionId delivers once.",
    "run.answer":
      "Answers match one pending request. A second answer, or an answer to a resolved or interrupted request, is rejected with 409.",
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
  moved:
    "Run, safety, and team operations from the removed agent host answer with {moved: true, message, sessions?}: where the work went in Kiro Crew. Past runs stay readable.",
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
export function localTransport(ops) {
  return {
    kind: "local",
    async call(operation, input, expectedRevision) {
      return ops.execute(operation, input, expectedRevision);
    },
  };
}

// Transport over a running workspace server's shared command endpoint.
export function httpTransport({
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
  previewConversationRouting(input = {}) {
    return this.call("conversations.routing.preview", input);
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
  runs(input = {}) {
    return this.call("run.list", input);
  }
  drivers() {
    return this.call("driver.list");
  }
  openDriver(input = {}) {
    return this.call("driver.open", input);
  }
  updateDriverContext(input) {
    return this.call("driver.context", input);
  }
  run(id, options = {}) {
    return this.call("run.get", { id, ...options });
  }
  runContext(runId) {
    return this.call("run.context", { runId });
  }
  // Durable sequence cursors, never arrival timestamps.
  history(id, { before, after, limit = 200, compact = false } = {}) {
    return this.call("run.get", { id, before, after, limit, compact });
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
  send({ id, text, submissionId, mode }) {
    if (!submissionId) fail("A message submission ID is required.");
    return this.call("run.send", { id, text, submissionId, mode });
  }
  answer(input) {
    return this.call("run.answer", input);
  }
  interrupt(id, reason) {
    return this.call("run.interrupt", { id, reason });
  }
  resume(input) {
    return this.call("run.resume", input);
  }
  approvals(input) {
    return this.call("run.approvals", input);
  }
  setModel({ id, model }) {
    return this.call("run.model", { id, model });
  }
  // Withdraw a follow-up that has not reached the provider. Anything already
  // sent stays on the record.
  unsend({ id, submissionId }) {
    return this.call("run.unsend", { id, submissionId });
  }
  reorderQueue({ id, order }) {
    return this.call("run.queue", { id, order });
  }
  // Read-only view of what a conversation changed in its own worktree.
  changes({ id, path }) {
    return this.call("run.changes", { id, path });
  }
  validate(id) {
    return this.call("run.validate", { id });
  }
  integrate({ id, expectedCommit }) {
    return this.call("integration.merge", { id, expectedCommit });
  }
  models(provider) {
    return this.call("models", { provider });
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

export function localClient(ops) {
  return new WorkspaceClient(localTransport(ops));
}
export function remoteClient(options) {
  return new WorkspaceClient(httpTransport(options));
}
