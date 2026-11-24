import {
  complete,
  type McpMessage,
  type McpReply,
  validateMcpRequest,
} from "../../mcp.ts";
import type { Store } from "../store/store.ts";
import { workspaceIdentity } from "../store/identity.ts";
import { classifyOperation } from "../api/operation-table.ts";
import { GROUPED_TOOLS, groupedCall, groupedToolList } from "./mcp-tools.ts";

// The part of Operations an MCP server calls.
export interface McpOperations {
  store: Store;
  execute(
    name: string,
    input?: Record<string, unknown>,
    expectedRevision?: number,
    context?: Record<string, unknown>,
  ): Promise<unknown>;
}

// Single-operation tools. Each narrow tool is the one a role's agent, prompt
// or brief names, so the agent's allowedTools grant that one operation and
// not a grouped tool's other actions.
export const NARROW_TOOLS: Record<
  string,
  [operation: string, description: string]
> = {
  plans_query: [
    "query",
    "Narrow tool for the planner. Search tasks: {q?, status?, epic?, tag?, scope?}. Read only.",
  ],
  plans_get_task: [
    "task.get",
    "Narrow tool for the planner. Read one task: {id}. Read only.",
  ],
  plans_documents: [
    "plan.table",
    "Narrow tool for the planner. Stored plans grouped with progress. Read only.",
  ],
  plans_get_document: [
    "document.get",
    "Narrow tool for the planner. Read one workspace document: {id}. Read only.",
  ],
  plans_create_plan: [
    "plan.create",
    "Narrow tool for the planner. Store one spec as a draft plan: {spec: <name>, prompt?, id?}. Avoozl reads <specs.path>/<name>.md or <specs.path>/<name>/ in the planning repository. The plan ID defaults to the spec name and its hash identifies the revision. Does not publish execution tasks.",
  ],
  plans_save_plan: [
    "plan.save",
    "Narrow tool for the planner. Reload a spec plan's folder from disk as its next revision: {id, expectedHash}. An unchanged folder writes nothing. Amendments flag affected tasks for review.",
  ],
  plans_get_plan: [
    "plan.get",
    "Narrow tool for the planner. Read a draft, its immutable revision history and approval receipts.",
  ],
  plans_prepare_worktree: [
    "worktree.prepare",
    "Narrow tool for worker chats. Create or return a leaf's isolated worktree on branch avoozl/<task-id>: {taskId}. A retry returns the same worktree with its commits; nothing is removed or reset.",
  ],
  plans_report: [
    "session.report",
    "Narrow tool for worker, verifier and reviewer chats. Report on your bound task from its worker, verifier, or review session: {taskId, kind: progress|done|blocked|question, text?, commit?, checks?, verdict?, findings?, closures?}. A local worker's done needs no commit: Avoozl reads HEAD of its task worktree and refuses a different one. Other done reports need the full commit SHA; a verifier's done also lists checks: [{command, exitCode}], one per declared check, and a check it could not run as {command, exitCode: null, notRun: reason}. A review's done names the commit it judged with verdict approved|changes-requested, findings [{id, kind: defect|observation, paths, text}], and closures [{finding: \"<attempt>:<role>:<id>\", state: fixed|unchanged, note?}] for every open finding of its role. blocked and question need text. A progress report may mark phase coding|tests|commands|ci-wait for timing, and a check entry may add durationMs. Only the session bound to the task's newest attempt may report.",
  ],
  plans_post_reply: [
    "reply.post",
    "Narrow tool for the responder. Post your one reply on the GitHub issue your responder session is bound to: {body}. Avoozl picks the issue from your session, refuses a reply with a secret-looking token, a URL with credentials, or an absolute or home path, or (on a public repository) one that quotes another repository on this machine (nothing is posted; fix it and post again), posts at most one comment per issue snapshot, and removes the responding label.",
  ],
  plans_submit_decide: [
    "check.decide.submit",
    "Narrow tool for the decide chat. Send your one answer for the plugin check your session is bound to: {needed: true|false, reason}, reason one line of at most 300 characters. Any other shape counts as needed. It changes nothing else.",
  ],
  plans_graph: [
    "graph.view",
    "Narrow tool for the avoozl skills. The dependency graph of {spec} or {plan}, or of every spec with {}: the same text and Mermaid `avoozl graph` prints, with its tasks and edges. Reads only.",
  ],
  plans_lint: [
    "spec.lint",
    "Narrow tool for the avoozl-spec skills. Lint one spec folder on disk, {spec}, or every one with {}: each error and warning with its code, file and line. Reads only.",
  ],
  plans_next: [
    "runner.next",
    "Narrow tool for the avoozl skill. Every local leaf in one list: ready, running, waiting (with the blockers each waits on), needsYou (blocked, review, questions, and stopped deliveries), and done. With {claim: true} it claims the best ready task by creating its claim branch avoozl/<spec>/<task> on origin, makes its worktree on that branch and returns the task, the worktree and the brief; a task another runner claimed first is skipped.",
  ],
  plans_land: [
    "runner.land",
    "Narrow tool for the avoozl-work skill. Land the task you claimed now, by its repository's landing mode: {taskId}. A verified task is queued and its repository's landing queue takes one step; returns {task, mode, state, queue?}. Refused for a task another session or runner claimed.",
  ],
  plans_run_checks: [
    "flow.checks.run",
    "Narrow tool for worker chats. Local checks first: run your task's declared checks at HEAD of your worktree before each push, and record the pass the pre-push hook reads: {taskId, cwd: <absolute worktree path>}. Commit first. Returns {commit, checks: [{command, exitCode, durationMs, commit}], passed}; put that checks list in your done report.",
  ],
  plans_take_task: [
    "runner.take",
    "Take one task by hand on this machine, as avoozl take TASK does: {taskId}. Makes its claim branch and worktree and returns the brief. Recorded in Activity with the caller.",
  ],
  plans_approve_plan: [
    "plan.approve",
    "Approve a stored spec revision as a commit on main, and create its tasks. Requires expectedHash and expectedRevision from plan.preview. approvedBy and evidence are optional. retitled lists approved task IDs whose tasks.md item text may change in this approval. Recorded in Activity with the caller.",
  ],
};
const operations = NARROW_TOOLS;
// The operation and input a narrow tool call names, or {error}.
type Route =
  | { error: string; operation?: undefined; input?: undefined }
  | { error?: undefined; operation: string; input: Record<string, unknown> };
const narrowCall = (name: string, args: { input?: unknown }): Route => {
  const input = args.input ?? {};
  return input && typeof input === "object" && !Array.isArray(input)
    ? {
        operation: operations[name][0],
        input: input as Record<string, unknown>,
      }
    : { error: "input must be an object." };
};
export const WORKSPACE_TOOLS = Object.entries(operations).map(
  ([name, [operation, description]]) => ({
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "object", additionalProperties: true },
        expectedRevision: { type: "integer" },
      },
      required: ["input"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: [
        "plan.get",
        "runner.next",
        "query",
        "task.get",
        "plan.table",
        "document.get",
        "graph.view",
      ].includes(operation),
    },
  }),
);
// The caller Kiro Crew attests on a tools/call: `_meta["kirocrew.caller"]`
// (kiro_crew/mcp_caller.py, schema 1). The model supplies only `arguments`, and
// the gateway strips a forged block, so this is read only by the app's stdio
// server (app-mcp.mjs). Any other transport passes no caller.
export function kiroCrewCaller(message: McpMessage | null | undefined) {
  const block = message?.params?._meta?.["kirocrew.caller"] as
    | { schemaVersion?: unknown; sessionKey?: unknown }
    | undefined;
  return block?.schemaVersion === 1 &&
    typeof block.sessionKey === "string" &&
    block.sessionKey.length <= 512
    ? { sessionKey: block.sessionKey }
    : null;
}
export { complete };

export async function handleMcp(
  message: McpMessage | null | undefined,
  // Null only lists the tools: every other call needs a workspace.
  ops: McpOperations | null,
  {
    base,
    versionHeader,
    workspaceId,
    attestedCaller = false,
  }: {
    base?: string;
    versionHeader?: string;
    workspaceId?: string;
    attestedCaller?: boolean;
  } = {},
) {
  const invalid = validateMcpRequest(message, { versionHeader });
  if (invalid) return invalid;
  const id = message?.id;
  const ok = (result: Record<string, unknown>) => ({
    status: 200,
    body: {
      jsonrpc: "2.0",
      id,
      result: complete(message, result),
    },
  });
  if (workspaceId && ops && workspaceIdentity(ops.store) !== workspaceId)
    return ok({
      isError: true,
      content: [
        {
          type: "text",
          text: "This MCP connection is bound to another workspace.",
        },
      ],
    });
  const tools = [...groupedToolList(classifyOperation), ...WORKSPACE_TOOLS];
  if (message?.method === "tools/list") return ok({ tools });
  if (!ops) throw Error("This MCP call needs a workspace.");
  const name = String(message?.params?.name);
  if (
    message?.method === "tools/call" &&
    (Object.hasOwn(GROUPED_TOOLS, name) || Object.hasOwn(operations, name))
  ) {
    const args = (message.params?.arguments || {}) as {
        action?: unknown;
        input?: unknown;
        expectedRevision?: number;
      },
      route: Route = Object.hasOwn(GROUPED_TOOLS, name)
        ? groupedCall(name, args)!
        : narrowCall(name, args);
    const refuse = (text: string) =>
      ok({ isError: true, content: [{ type: "text", text }] });
    if (route.error !== undefined) return refuse(route.error);
    const { operation } = route;
    try {
      const result = await ops.execute(
        operation,
        route.input,
        args.expectedRevision,
        // `mcp`: an agent tool's transport, which Activity names.
        { caller: attestedCaller ? kiroCrewCaller(message) : null, mcp: true },
      );
      return ok({
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent:
          result && typeof result === "object" && !Array.isArray(result)
            ? result
            : { result },
      });
    } catch (error) {
      return ok({
        isError: true,
        content: [{ type: "text", text: (error as Error).message }],
      });
    }
  }
  return ops.execute("legacy.mcp", {
    message,
    base,
    versionHeader,
  }) as Promise<McpReply>;
}
