import { MCP_TOOLS, validateMcpRequest } from "../mcp.mjs";
import { workspaceIdentity } from "./identity.mjs";
import { classifyOperation } from "./operation-kinds.mjs";
import { mcpRefusal, PERSON_ONLY } from "./mcp-policy.mjs";
import { GROUPED_TOOLS, groupedCall, groupedToolList } from "./mcp-tools.mjs";
// The old one-tool-per-operation names (R24.5). They stay listed because a
// Kiro Crew session can only call a tool its client listed (R56.3), and each
// says which grouped tool replaces it. plans_workspace is a grouped tool now;
// its old {input} call still reads the workspace.
export const OLD_TOOLS = {
  plans_examples: [
    "workspace.examples",
    "List optional example packs. Reading this list does not change the workspace.",
  ],
  plans_seed_example: [
    "workspace.seed",
    "Load an example pack only when requested. Adds example epics, tasks, designs and views once; preserves existing work and subsequent edits.",
  ],
  plans_metrics: [
    "metrics",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Kiro Crew reports session time and usage.",
  ],
  plans_usage: [
    "usage.limits",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Kiro Crew reports account usage.",
  ],
  plans_models: [
    "models",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Kiro Crew chooses each session's model.",
  ],
  plans_prompt_search: [
    "search.prompt",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Search tasks with plans_ready_queue or the query operation.",
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
  plans_supersede_task: [
    "task.supersede",
    "Replace a local task with a new one when a person asks: {id, create: {id?, title?, summary?, acceptance?, checks?, requires?}, reason?}. Creates the new task (copying the old task's requires and sequence edges unless create.requires is given), links supersedes and supersededBy, and sets the old task to superseded, which is never ready and hidden by default. Dependents then wait on the new task. Keeps the old task's sessions and history and leaves a running session alone. Refused (409) for GitHub or plugin tasks. Not for review rework, which stays a new attempt on the same delivery.",
  ],
  plans_archive_task: [
    "task.archive",
    "Archive a task only after the user explicitly permits that closure. Archival does not approve a plan, accept the task, integrate changes, or merge work.",
  ],
  plans_create_plan: [
    "plan.create",
    "Store one Kiro spec folder as a draft plan: {spec: <name>, prompt?, id?}. Avoozl reads .kiro/specs/<name>/ in the planning repository; the plan ID defaults to the name and its hash is the folder revision. {prompt, text} stores a free-form design for extraction instead. Does not publish execution tasks.",
  ],
  plans_save_plan: [
    "plan.save",
    "Reload a spec plan's folder from disk as its next revision: {id, expectedHash}. An unchanged folder writes nothing. A free-form design saves {id, text, expectedHash}. An old-style plan with no spec links its folder as a draft revision with {id, spec, expectedHash}; every task it maps must be in tasks.md, and linking never approves. Amendments flag affected tasks for review.",
  ],
  plans_propose_work: [
    "plan.propose",
    "Propose adjacent work discovered while implementing. On a spec plan, {id, proposal:{id,title,kind?,repository?,requires?,acceptance,checks?,completion?}, expectedHash?} adds one tasks.md item and its manifest entry. On a design, {id, fact:{kind?,text,quote,derivation?,reasoning?,acceptance?}, expectedHash?} records one cited fact. Either stays a draft and is not executable until an authorized approval.",
  ],
  plans_specs: [
    "plan.specs",
    "List the Kiro spec folders under the planning repository's .kiro/specs/: root, each folder's type, files, revision hash, diagnostic counts, critique, and stored plan. Reads only.",
  ],
  plans_get_plan: [
    "plan.get",
    "Read a draft, its immutable revision history and approval receipts.",
  ],
  plans_lint_plan: [
    "plan.lint",
    "Run deterministic checks on a stored revision: spec folder files, task IDs, manifest coverage, task schema, projects, and dependencies. Returns diagnostics with file and line and never edits or approves the plan.",
  ],
  plans_project_preview: [
    "github.project.preview",
    "List every GitHub write projecting an approved plan would make, without making any: issue creates and updates, sub-issue links, blocked-by edges, labels, and Project fields (Release, Wave, Iteration; never Status). Input: planId, optional repository. Repositories this machine does not write are listed in previewOnly.",
  ],
  plans_submit_review: [
    "plan.review.submit",
    "Submit substantive, exact-revision design review comments with unique quoted anchors. This records feedback only; it cannot edit or approve the plan.",
  ],
  plans_extract: [
    "plan.extract",
    "Open a read-only, revision-bound extraction record for design prose: {planId, revisionHash?}. A Kiro Crew planner session submits its rounds with plans_submit_extraction. Provider rounds moved to Kiro Crew and answer with a pointer. This cannot approve or edit the design.",
  ],
  plans_triage_design: [
    "queue.design.triage",
    "Classify an untriaged design as context or begin revision-bound extraction. This cannot approve the design.",
  ],
  plans_extraction: [
    "plan.extract.get",
    "Read extraction rounds, cited facts, gaps, dispositions, and advisory coverage.",
  ],
  plans_submit_extraction: [
    "plan.extraction.submit",
    "Submit one extraction round. Stated and inferred facts require one exact unique quote; this cannot approve the plan.",
  ],
  plans_dispose_fact: [
    "plan.extraction.dispose",
    "Reject, edit, accept, or explicitly reuse one extracted fact before approval.",
  ],
  plans_approve_plan: [
    "plan.approve",
    "Extract an explicitly authorized revision into tasks atomically. Requires expectedHash and expectedRevision; the reviewed document hash and database revision are the authorization. approvedBy and evidence are optional: approvedBy defaults to the workspace operator, and evidence records a real statement when there is one. For a spec plan, retitled lists approved task IDs whose tasks.md item text may change in this approval.",
  ],
  plans_start_run: [
    "run.start",
    "Dispatch a task to Kiro Crew: {taskId, repository, agent, role?} asks the tick to open one session, like plans_request_session. Without a repository and agent it answers with a pointer to the task's Kiro Crew sessions. Avoozl starts no agent itself.",
  ],
  plans_send_message: [
    "run.send",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Steer the task's Kiro Crew session; the answer lists it.",
  ],
  plans_interrupt_run: [
    "run.interrupt",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Stop the task's Kiro Crew session; the answer lists it.",
  ],
  plans_resume_run: [
    "run.resume",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Resume the task's Kiro Crew session; the answer lists it.",
  ],
  plans_set_run_approvals: [
    "run.approvals",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Kiro Crew owns tool approvals.",
  ],
  plans_answer_request: [
    "run.answer",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Answer in the task's Kiro Crew session; the answer lists it.",
  ],
  plans_task_sessions: [
    "task.sessions",
    "Resolve a task to its Kiro Crew session bindings (kiroCrew) and any past run sessions (read-only history).",
  ],
  plans_discover_sessions: [
    "session.discover",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Bind sessions with plans_bind_session or plans_rediscover_sessions.",
  ],
  plans_register_session: [
    "session.register",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Bind sessions with plans_bind_session or plans_rediscover_sessions.",
  ],
  plans_bind_session: [
    "session.bind",
    "Bind a Kiro Crew session slot to a task before its first brief: {taskId, slot, role?: worker|verifier|responder|planner, attempt?, title?}. Rebinding the same slot is a no-op; a slot never moves to another task.",
  ],
  plans_rediscover_sessions: [
    "session.rediscover",
    "Rebuild lost bindings from Kiro Crew session titles of the form `avoozl:<task-id> <short title>`: {sessions: [{slot, title}]}. Already bound, non-Avoozl, and unknown-task sessions are reported, not bound.",
  ],
  plans_request_session: [
    "session.request",
    "Ask the tick to open one Kiro Crew session for a task: {taskId, repository, agent, role?: worker|verifier|responder|planner}. The repository is a registered workspace repository with a local checkout; the session opens in its `Avoozl/<repository>` folder on the named agent. The tick dispatches it while no session is bound for that task and role.",
  ],
  plans_session_status: [
    "session.status",
    "Record a bound session's Kiro Crew status: {slot, status}. status is one of working|queued|idle|closed|lost|unknown|gone, or the text of a kirocrew-dashboard session_status roster. An unchanged status or an unlisted slot writes nothing; closed and lost are final.",
  ],
  plans_tick: [
    "workspace.tick",
    "Run one bounded workspace tick: take the tick lock, load .avoozl.json, record {cron?: true, sessions?: [{target, status, model_requested?, served_model?, model_withheld?, model_changed?}]} the script read (cron: true marks the script cron; a Kiro Crew without session_status sends no sessions, and the app backend records statuses instead) (the model fields come from a Kiro Crew that reports them; a review verdict from a session whose served model is unknown, auto, changed, withheld, or the writer's is refused with a decision), and return intents {observe, dispatch, messages, notify}. Nothing new dispatches while a session the cron opened is missing from sessions. Returns {skipped: 'locked'} while another tick runs. A tick with no outside change writes nothing.",
  ],
  plans_classify_issue: [
    "github.breakdown.classify",
    "Record a planner's classification of one issue a deliver rule matched: {repository, number, kind: bounded|broad, reason}. Bounded keeps the issue as its own leaf. Broad holds it from dispatch until its child graph is drafted, critiqued, previewed on the issue and approved. Writes nothing to GitHub.",
  ],
  plans_draft_children: [
    "github.breakdown.draft",
    "Name the spec folder that holds a broad issue's child graph: {repository, number, spec}. Its one top-level epic item stands for the issue; every other item nests under it. Returns the lint diagnostics and whether a current critique exists. Writes nothing to GitHub; the next sync posts the preview.",
  ],
  plans_advance_breakdowns: [
    "github.breakdown.advance",
    "For every matched issue with a pending child graph or dependency text: post or refresh one preview comment, detect approval (an allowed actor re-applies the trigger label after the preview, or the rule sets autoPublishChildren), then create sub-issues and blocked-by edges. Nothing is published before approval.",
  ],
  plans_rebuild: [
    "github.rebuild",
    "Rebuild the SQLite rows of GitHub-authority tasks from GitHub alone: {repository?}. Reads each managed issue's marker, sub-issues, blocked-by dependencies, labels and the Project board; restores tasks, edges, parents, Release and Iteration, and close orders. Never writes to GitHub or touches local tasks. A second run writes nothing. Run the tick next to rebind sessions and judge completion.",
  ],
  plans_github_setup: [
    "github.setup",
    "Set up GitHub for this workspace (design 8.2): {mode: plans-repo|single-repo, planningRepository?, repositories?, project?: {owner, number} or {owner, title}, releases?, iteration?, tableByWave?, epic?}. Without confirm it only reads and returns every write it would make, a previewHash, the checklist of what the API cannot do, and the proposed .avoozl.json diff. With {confirm: true, previewHash} it makes exactly those writes. It never deletes or renames; save the .avoozl.json diff with github.settings.update after review.",
  ],
  plans_prepare_worktree: [
    "worktree.prepare",
    "Create or return a leaf's isolated worktree on branch avoozl/<task-id>: {taskId}. A retry returns the same worktree with its commits; nothing is removed or reset.",
  ],
  plans_report: [
    "session.report",
    "Report on your bound task from its worker, verifier, or review session: {taskId, kind: progress|done|blocked|question, text?, commit?, checks?, verdict?, findings?, closures?}. done needs the full commit SHA; a verifier's done also lists checks: [{command, exitCode}], one per declared check, and a check it could not run as {command, exitCode: null, notRun: reason}. A review's done names the commit it judged with verdict approved|changes-requested, findings [{id, kind: defect|observation, paths, text}], and closures [{finding: \"<attempt>:<role>:<id>\", state: fixed|unchanged, note?}] for every open finding of its role. blocked and question need text. A progress report may mark phase coding|tests|commands|ci-wait for timing, and a check entry may add durationMs. Only the session bound to the task's newest attempt may report. A Crew Mode conductor relays its worker's result by adding the worker's slot: {taskId, slot, kind, ...}; only the conductor that claimed the task may.",
  ],
  plans_content_allow: [
    "content.allow",
    "Allow one blocked write once: {id, reason}. Only a person allows, from the Avoozl page or the CLI; a session calling this is refused (403).",
  ],
  plans_post_reply: [
    "reply.post",
    "Post your one reply on the GitHub issue your responder session is bound to: {body}. Avoozl picks the issue from your session, refuses a reply with a secret-looking token, a URL with credentials, or an absolute or home path (nothing is posted; fix it and post again), posts at most one comment per issue snapshot, and removes the responding label.",
  ],
  plans_next: [
    "runner.next",
    "What a Crew Mode conductor does next, with every local leaf in one bucket: ready (start each, with its brief and session title), running (claimed; wait), waiting (with the blockers each waits on), needsYou (blocked, review, questions, and stopped deliveries; ask the user), and done. Rule: start ready; wait while running is not empty; ask the user about needsYou; stop only when every leaf is done. Reads only.",
  ],
  plans_flow: [
    "flow.view",
    "Where delivery time goes: {repository?, epic?, window?, stage?}. Lead time, flow efficiency, first-pass rate, time to fix and change failure rate over the last window of finished tasks beside the window before, each task's time per stage with the source of each span (tool-calls, markers, or events; anything not from tool calls is coarse), the biggest bottleneck, line stops, flaky and CI-only records, batches, and retrospectives. Reads only.",
  ],
  plans_run_checks: [
    "flow.checks.run",
    "Local checks first: run your task's declared checks at HEAD of your worktree before each push, and record the pass the pre-push hook reads: {taskId, cwd: <absolute worktree path>}. Commit first. Returns {commit, checks: [{command, exitCode, durationMs, commit}], passed}; put that checks list in your done report.",
  ],
  plans_flow_run_anyway: [
    "flow.runAnyway",
    "Resume dispatch while a line stop stays open: {stopId, confirm: true}. Only a person runs anyway, from the Avoozl page or the CLI; a session calling this is refused (403).",
  ],
  plans_claim_task: [
    "runner.claim",
    "Claim one ready leaf for the worker session a Crew Mode conductor just started: {taskId, slot, title?, model?}. Name the model you opened the worker on; review roles that must differ from the writer's model wait for a person without it. Records the structured session binding (role worker, attempt, conductor) and prepares the leaf's worktree. Refused unless the task is ready now and .avoozl.json sets delivery.runner to crew-mode; a claimed task is never ready again.",
  ],
  plans_retry_delivery: [
    "delivery.retry",
    'Resume a leaf that stopped for a decision after its retries ran out or integration was refused: {taskId, dismiss?}. Use only when the person asks. The next attempt resumes on the same worktree with a fresh retry budget. dismiss: [{finding: "<attempt>:<role>:<id>", reason}] closes open review findings and is refused from an agent session: only a person dismisses a finding.',
  ],
  plans_archive_run: [
    "run.archive",
    "Archive a past run in the conversation history. Stops nothing and keeps its transcript.",
  ],
  plans_unarchive_run: [
    "run.unarchive",
    "Restore an archived past run to the conversation history.",
  ],
  plans_list_runs: [
    "run.list",
    "List past runs (read-only history); archived defaults to false, true lists archived runs, and all includes both.",
  ],
  plans_get_run: [
    "run.get",
    "Read a past run, its messages, requests and delivery receipts (read-only history).",
  ],
  plans_run_context: [
    "run.context",
    "Moved to Kiro Crew; answers with a pointer instead of acting. A Kiro Crew session reads its brief instead.",
  ],
  plans_ready_queue: [
    "queue",
    "Find ready work, active resource conflicts, unblocking value and queued integration.",
  ],
  plans_targets: [
    "targets.list",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Execution targets were removed.",
  ],
  plans_target_status: [
    "targets.status",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Execution targets were removed.",
  ],
  plans_jobs: [
    "jobs.status",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Execution jobs were removed; see plans_next for delivery state.",
  ],
  plans_review_queue: [
    "review.queue",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Team review requests were removed.",
  ],
  plans_checkpoints: [
    "checkpoint.reconcile",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Team checkpoints were removed.",
  ],
  plans_checkpoint_publish: [
    "checkpoint.publish",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Team checkpoints were removed.",
  ],
  plans_primary_state: [
    "primary.liveState",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Team primary state was removed.",
  ],
  plans_start_batch: [
    "batch.start",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Run Crew Mode rounds with plans_next and plans_claim_task.",
  ],
  plans_control_batch: [
    "batch.control",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Pause a task with a pause rule or the Deferred column.",
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
  plans_andon_status: [
    "safety.status",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Pause and resume are repository rule actions.",
  ],
  plans_andon_raise: [
    "safety.raise",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Pause a task with a pause rule label or the Deferred column.",
  ],
  plans_andon_note: [
    "safety.note",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Pause and resume are repository rule actions.",
  ],
  plans_andon_propose_remediation: [
    "safety.remediation.request",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Pause and resume are repository rule actions.",
  ],
  plans_andon_review: [
    "safety.review",
    "Moved to Kiro Crew; answers with a pointer instead of acting. Pause and resume are repository rule actions.",
  ],
};
const operations = OLD_TOOLS;
// "plans_task {action: \"update\"}" for an operation, or null.
const replacement = (operation) => {
  for (const [tool, { actions }] of Object.entries(GROUPED_TOOLS))
    for (const [action, [target]] of Object.entries(actions))
      if (target === operation) return `${tool} {action: "${action}"}`;
  return null;
};
const deprecated = (operation, description) => {
  if (PERSON_ONLY.has(operation) && !replacement(operation))
    return `Person only: refused over MCP; do it in the Avoozl app. ${description}`;
  const next = replacement(operation);
  return `Deprecated${next ? `: use ${next}` : ""}. ${description}`;
};
export const WORKSPACE_TOOLS = Object.entries(operations).map(
  ([name, [operation, description]]) => ({
    name,
    description: deprecated(operation, description),
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
        "usage.limits",
        "metrics",
        "plan.specs",
        "plan.get",
        "plan.lint",
        "github.project.preview",
        "plan.extract.get",
        "run.get",
        "run.context",
        "run.list",
        "task.sessions",
        "task.duplicates",
        "task.merge.get",
        "session.discover",
        "runner.next",
        "queue",
        "targets.list",
        "targets.status",
        "jobs.status",
        "review.queue",
        "checkpoint.reconcile",
        "primary.liveState",
        "handoff",
        "safety.status",
        // Moved run-era operations only answer with a pointer.
        "run.send",
        "run.interrupt",
        "run.resume",
        "run.approvals",
        "run.answer",
        "search.prompt",
        "session.register",
        "checkpoint.publish",
        "batch.start",
        "batch.control",
        "safety.raise",
        "safety.note",
        "safety.remediation.request",
        "safety.review",
      ].includes(operation),
    },
  }),
);
// The caller Kiro Crew attests on a tools/call: `_meta["kirocrew.caller"]`
// (kiro_crew/mcp_caller.py, schema 1). The model supplies only `arguments`, and
// the gateway strips a forged block, so this is read only by the app's stdio
// server (app-mcp.mjs). Any other transport passes no caller.
export function kiroCrewCaller(message) {
  const block = message?.params?._meta?.["kirocrew.caller"];
  return block?.schemaVersion === 1 &&
    typeof block.sessionKey === "string" &&
    block.sessionKey.length <= 512
    ? { sessionKey: block.sessionKey }
    : null;
}
export async function handleMcp(
  message,
  ops,
  { base, versionHeader, workspaceId, attestedCaller = false } = {},
) {
  const invalid = validateMcpRequest(message, { versionHeader });
  if (invalid) return invalid;
  const id = message?.id;
  const ok = (result) => ({
    status: 200,
    body: { jsonrpc: "2.0", id, result },
  });
  if (workspaceId && workspaceIdentity(ops.store) !== workspaceId)
    return ok({
      isError: true,
      content: [
        {
          type: "text",
          text: "This MCP connection is bound to another workspace.",
        },
      ],
    });
  const tools = [
    ...groupedToolList(classifyOperation),
    ...MCP_TOOLS,
    ...WORKSPACE_TOOLS,
  ];
  if (message?.method === "tools/list") return ok({ tools });
  const name = message?.params?.name;
  if (
    message?.method === "tools/call" &&
    (Object.hasOwn(GROUPED_TOOLS, name) || Object.hasOwn(operations, name))
  ) {
    const args = message.params.arguments || {},
      route = Object.hasOwn(GROUPED_TOOLS, name)
        ? groupedCall(name, args)
        : { operation: operations[name][0], input: args.input || {} };
    const refuse = (text) =>
      ok({ isError: true, content: [{ type: "text", text }] });
    if (route.error) return refuse(route.error);
    // Checked again in Operations.perform; refusing here names the tool.
    const refusal = mcpRefusal(route.operation, route.input);
    if (refusal) return refuse(refusal);
    const { operation } = route;
    try {
      const result = await ops.execute(
        operation,
        route.input,
        args.expectedRevision,
        // `mcp`: a session's transport, never a person's (content.allow).
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
        content: [{ type: "text", text: error.message }],
      });
    }
  }
  return ops.execute("legacy.mcp", { message, base, versionHeader });
}
