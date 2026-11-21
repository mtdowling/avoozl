// The stable client contract shared by any client of a workspace.
//
// Everything here delegates to the same operations the website, CLI, and MCP
// use. The point of the layer is a named, versioned surface with one place to
// document conflict handling and idempotency rules, not a second state model.
// It deliberately exposes no way to write run records directly.
import { workspaceIdentity } from "../store/identity.ts";
import { fail, type Store } from "../store/store.ts";
import type { Operations } from "./operations.ts";

type Input = Record<string, unknown>;
// Where an event read starts and how much it returns.
type EventsQuery = {
  after?: number;
  cursor?: number;
  runId?: string;
  limit?: number;
};
// How a client reaches a workspace: in process, or over its server.
interface Transport {
  kind: string;
  endpoint?: string;
  workspaceId?: string | null;
  call(
    operation: string,
    input: Input,
    expectedRevision?: number,
  ): Promise<unknown>;
  events?(query?: EventsQuery): Promise<unknown>;
}
// A server reply: its result, events, or the error it names.
type Reply = { result?: unknown; events?: unknown; error?: string };

const CLIENT_API_VERSION = "1.0.0";

// Operations a client may invoke. Anything absent is refused by name instead
// of being forwarded, so a client cannot reach an unreviewed operation.
export const CLIENT_OPERATIONS = Object.freeze([
  "client.describe",
  "workspace",
  "configuration.get",
  "configuration.update",
  "local.ignore.status",
  "local.ignore.fix",
  "state",
  "query",
  "queue",
  "conversations.settings.get",
  "conversations.settings.update",
  "task.get",
  "task.update",
  "task.archive",
  "task.unarchive",
  "task.sessions",
  "task.accept",
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
  "plan.classify",
  "run.start",
  "integration.merge",
  "intent.submit",
  "intent.get",
  "handoff",
  "repository.configure",
  "repository.remove",
  "github.configure",
  "github.repositories",
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

export function describeWorkspace(store: Store) {
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
function localTransport(ops: Pick<Operations, "execute">): Transport {
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
}: {
  endpoint: string;
  workspaceId?: string | null;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Transport {
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
      let response: Response | undefined;
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
            (error instanceof Error ? error.message : String(error)) +
            ")",
          503,
        );
      }
      if (!response) return fail("The workspace server did not answer.", 503);
      // The server's JSON reply.
      const body = (await response.json().catch(() => ({}))) as Reply;
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
      // The server's JSON reply.
      const body = (await response.json()) as Reply;
      if (!response.ok) fail(body.error || "Request failed.", response.status);
      return body.events;
    },
  };
}

export class WorkspaceClient {
  transport: Transport;
  constructor(transport: Transport) {
    this.transport = transport;
  }
  async call(operation: string, input: Input = {}, expectedRevision?: number) {
    if (!CLIENT_OPERATIONS.includes(operation))
      fail("Operation " + operation + " is not part of the client API.", 400);
    return this.transport.call(operation, input, expectedRevision);
  }
  // Compatibility check. A client must refuse to drive a workspace whose
  // major API version it does not speak rather than guessing.
  async describe() {
    // The workspace's reply, as client.describe answers.
    const described = (await this.call("client.describe")) as {
      apiVersion?: string;
    };
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
  tasks(query: Input = {}) {
    return this.call("query", { scope: "all", ...query });
  }
  task(id: string) {
    return this.call("task.get", { id });
  }
  queue(input: Input = {}) {
    return this.call("queue", input);
  }
  conversationSettings() {
    return this.call("conversations.settings.get");
  }
  updateConversationSettings(input: Input) {
    return this.call("conversations.settings.update", input);
  }
  updateTask(input: Input, expectedRevision?: number) {
    return this.call("task.update", input, expectedRevision);
  }
  taskSessions(id: string) {
    return this.call("task.sessions", { id });
  }
  document(id: string) {
    return this.call("document.get", { id });
  }
  saveDocument({ id, text, expectedHash }: Input) {
    return this.call("document.update", { id, text, expectedHash });
  }
  plans(input: Input = {}) {
    return this.call("plan.list", input);
  }
  plan(id: string) {
    return this.call("plan.get", { id });
  }
  createPlan(input: Input) {
    return this.call("plan.create", input);
  }
  // Saving records a new draft revision. It never approves.
  savePlan({ id, text, expectedHash }: Input) {
    return this.call("plan.save", { id, text, expectedHash });
  }
  // What approving a revision would extract, without changing anything.
  previewPlan({ id, text }: Input) {
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
  }: Input) {
    return this.call("plan.approve", {
      id,
      expectedHash,
      expectedRevision,
      approvedBy,
      evidence,
      retitled,
    });
  }
  events(input: EventsQuery = {}) {
    if (this.transport.events) return this.transport.events(input);
    return this.call("state").then(() => {
      fail("This transport cannot read the event stream.", 400);
    });
  }
  submit(input: Input) {
    if (!input.submissionId) fail("A submission ID is required.");
    return this.call("intent.submit", input);
  }
  submission(submissionId: string) {
    return this.call("intent.get", { submissionId });
  }
  integrate({ id, expectedCommit }: Input) {
    return this.call("integration.merge", { id, expectedCommit });
  }
  handoff(id: string) {
    return this.call("handoff", { id });
  }
}
