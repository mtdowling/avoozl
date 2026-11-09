import { MCP_TOOLS, validateMcpRequest } from "../mcp.mjs";
const operations = {
  plans_examples: [
    "workspace.examples",
    "List optional example packs. Reading this list does not change the workspace.",
  ],
  plans_seed_example: [
    "workspace.seed",
    "Load an example pack only when requested. Adds example epics, tasks, designs and views once; preserves existing work and subsequent edits.",
  ],
  plans_workspace: [
    "workspace",
    "Inspect projects, plan drafts, agent sessions, integration queue and provider availability.",
  ],
  plans_metrics: [
    "metrics",
    "Query measured run/task wall time and provider-reported token/cache usage, grouped by task, model, provider or day. Costs are estimates; missing history is not reconstructed.",
  ],
  plans_models: [
    "models",
    "List the chosen provider’s model catalog for explicit run model selection.",
  ],
  plans_prompt_search: [
    "search.prompt",
    "Interpret a natural-language task search with a selected Claude or Codex model. Returns a durable read-only run; submissionId is required.",
  ],
  plans_prompt_search_result: [
    "search.result",
    "Read a prompt search result and retain its validated query or exact task IDs as a saved task view.",
  ],
  plans_duplicates: [
    "task.duplicates",
    "List repeated-title task candidates, or find similarly worded work with a title. Matching wording does not prove duplicate scope.",
  ],
  plans_merge_tasks: [
    "task.merge",
    "Consolidate reviewed duplicates into targetId using duplicateIds, reason and expectedHashes. Preserves source references, evidence and aliases; refuses active work and cycles.",
  ],
  plans_merge_receipt: [
    "task.merge.get",
    "Read original task records and relationship provenance for a consolidation receipt.",
  ],
  plans_capture: [
    "task.capture",
    "Record a person's own request from the view they are looking at, as an untriaged inbox task awaiting planning. Not a channel for work an agent discovered: do the in-scope part and record its evidence, propose adjacent work on the current plan with plans_propose_work, or draft a new plan.",
  ],
  plans_update_task: [
    "task.update",
    "Update task metadata or dependencies; does not imply acceptance.",
  ],
  plans_create_plan: [
    "plan.create",
    "Create one Markdown draft. Does not publish execution tasks.",
  ],
  plans_save_plan: [
    "plan.save",
    "Save a Markdown draft with expectedHash; amendments flag affected tasks for review.",
  ],
  plans_propose_work: [
    "plan.propose",
    "Append one proposed task block to a plan without rewriting its prose: {id, proposal:{id,title,acceptance,...}, expectedHash?}. Use it for work discovered while implementing that belongs to this plan. The proposal is not executable; the plan reads as changed against its approval receipt and its tasks need review until an authorized plan.approve converts it.",
  ],
  plans_get_plan: [
    "plan.get",
    "Read a draft, its immutable revision history and approval receipts.",
  ],
  plans_approve_plan: [
    "plan.approve",
    "Extract an explicitly authorized revision into tasks atomically. Requires expectedHash, expectedRevision, approvedBy and approval evidence.",
  ],
  plans_start_run: [
    "run.start",
    "Start an authorized Claude or Codex run on a task or draft in a configured isolated project worktree.",
  ],
  plans_send_message: [
    "run.send",
    "Queue a follow-up or steer Codex. submissionId makes retries idempotent.",
  ],
  plans_interrupt_run: [
    "run.interrupt",
    "Request interruption of an agent turn.",
  ],
  plans_resume_run: [
    "run.resume",
    "Resume the saved provider session without automatically resending uncertain messages.",
  ],
  plans_set_run_approvals: [
    "run.approvals",
    "Set automatic provider review or manual approvals for a managed session. Requires explicit user authorization; does not approve pending requests.",
  ],
  plans_answer_request: [
    "run.answer",
    "Answer a specific pending approval or question from a live run.",
  ],
  plans_task_sessions: [
    "task.sessions",
    "Resolve a task to connected run/provider sessions; external activity without a connected transcript remains a check-in.",
  ],
  plans_discover_sessions: [
    "session.discover",
    "List existing local Claude sessions or subagents in the task’s projects. Reads metadata without starting agents.",
  ],
  plans_register_session: [
    "session.register",
    "Link the real Claude provider session UUID and optional subagent ID to a task activity lease. Requires taskId, leaseId, provider and providerSessionId. Attaches a read-only transcript without launching or taking over the worker.",
  ],
  plans_archive_run: [
    "run.archive",
    "Archive a conversation without stopping its agent or removing its transcript.",
  ],
  plans_unarchive_run: [
    "run.unarchive",
    "Restore an archived conversation to the main chat list.",
  ],
  plans_list_runs: [
    "run.list",
    "List conversations; archived defaults to false, true lists archived chats, and all includes both.",
  ],
  plans_get_run: [
    "run.get",
    "Read a run, messages, requests and delivery receipts.",
  ],
  plans_ready_queue: [
    "queue",
    "Find ready work, active resource conflicts, unblocking value and queued integration.",
  ],
  plans_start_batch: [
    "batch.start",
    "Execute an explicitly authorized task set with 1–4 parallel runs and optional validation/integration.",
  ],
  plans_control_batch: [
    "batch.control",
    "Pause new dispatch or resume an authorized task batch; existing runs retain their work.",
  ],
  plans_handoff: [
    "handoff",
    "Read a provider-neutral task handoff with design, dependencies, runs and evidence.",
  ],
  plans_validate_run: [
    "run.validate",
    "Run configured acceptance checks at the committed worktree head; queue integration only on success.",
  ],
  plans_integrate: [
    "integration.merge",
    "Rebase, revalidate and fast-forward a reviewed integration head.",
  ],
  plans_accept_task: [
    "task.accept",
    "Record explicit acceptance evidence separately from implementation and integration.",
  ],
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
        "workspace.examples",
        "workspace",
        "models",
        "metrics",
        "plan.get",
        "run.get",
        "run.list",
        "task.sessions",
        "task.duplicates",
        "task.merge.get",
        "session.discover",
        "queue",
        "handoff",
      ].includes(operation),
    },
  }),
);
export async function handleMcp(
  message,
  ops,
  { base, runId, versionHeader } = {},
) {
  const invalid = validateMcpRequest(message, { versionHeader });
  if (invalid) return invalid;
  const id = message?.id;
  const ok = (result) => ({
    status: 200,
    body: { jsonrpc: "2.0", id, result },
  });
  const search =
    runId &&
    ops.store.get("runs", runId)?.prompt?.startsWith("NUPP_PROMPT_SEARCH");
  const tools = [...MCP_TOOLS, ...WORKSPACE_TOOLS],
    readOnly = (name) =>
      tools.find((t) => t.name === name)?.annotations?.readOnlyHint === true;
  if (search && message?.method === "tools/list")
    return ok({ tools: tools.filter((t) => readOnly(t.name)) });
  if (
    search &&
    message?.method === "tools/call" &&
    !readOnly(message.params?.name)
  )
    return ok({
      isError: true,
      content: [
        {
          type: "text",
          text: "Prompt searches may only query records. Return the interpreted search to the UI; do not change tasks or presentations.",
        },
      ],
    });
  if (message?.method === "tools/list")
    return ok({
      tools: [...MCP_TOOLS, ...WORKSPACE_TOOLS].filter(
        (t) =>
          !runId ||
          ![
            "plans_seed_example",
            "plans_approve_plan",
            "plans_integrate",
            "plans_accept_task",
            "plans_set_run_approvals",
            "plans_start_run",
            "plans_start_batch",
          ].includes(t.name),
      ),
    });
  if (message?.method === "tools/call" && operations[message.params?.name]) {
    const [operation] = operations[message.params.name],
      args = message.params.arguments || {};
    if (
      runId &&
      [
        "workspace.seed",
        "plan.approve",
        "integration.merge",
        "task.accept",
        "run.approvals",
        "run.start",
        "batch.start",
      ].includes(operation)
    )
      return ok({
        isError: true,
        content: [
          {
            type: "text",
            text: "This operation requires user authorization through the workspace UI or CLI.",
          },
        ],
      });
    try {
      const result = await ops.execute(
        operation,
        args.input || {},
        args.expectedRevision,
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
        content: [{ type: "text", text: error.message }],
      });
    }
  }
  return ops.execute("legacy.mcp", { message, base, versionHeader });
}
