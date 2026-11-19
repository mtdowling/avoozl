import { complete, validateMcpRequest } from "../mcp.mjs";
import { workspaceIdentity } from "./identity.mjs";
import { classifyOperation } from "./operation-table.mjs";
import { mcpRefusal, PERSON_ONLY } from "./mcp-policy.mjs";
import { GROUPED_TOOLS, groupedCall, groupedToolList } from "./mcp-tools.mjs";
import {
  VIEW_TOOLS,
  viewCall,
  viewResult,
  viewToolList,
  withViewLink,
} from "./mcp-views.mjs";
// Single-operation tools. Each narrow tool is the one a role's agent, prompt
// or brief names, so the agent's allowedTools grant that one operation and
// not a grouped tool's other actions.
export const NARROW_TOOLS = {
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
  plans_duplicates: [
    "task.duplicates",
    "Narrow tool for the planner. List repeated-title task candidates, or find similarly worded work with a title. Matching wording does not prove duplicate scope.",
  ],
  plans_create_plan: [
    "plan.create",
    "Narrow tool for the planner. Store one Kiro spec folder as a draft plan: {spec: <name>, prompt?, id?}. Avoozl reads .kiro/specs/<name>/ in the planning repository; the plan ID defaults to the name and its hash is the folder revision. {prompt, text} stores a free-form design for extraction instead. Does not publish execution tasks.",
  ],
  plans_save_plan: [
    "plan.save",
    "Narrow tool for the planner. Reload a spec plan's folder from disk as its next revision: {id, expectedHash}. An unchanged folder writes nothing. A free-form design saves {id, text, expectedHash}. An old-style plan with no spec links its folder as a draft revision with {id, spec, expectedHash}; every task it maps must be in tasks.md, and linking never approves. Amendments flag affected tasks for review.",
  ],
  plans_get_plan: [
    "plan.get",
    "Narrow tool for planner and plan answer chats. Read a draft, its immutable revision history and approval receipts.",
  ],
  plans_submit_review: [
    "plan.review.submit",
    "Narrow tool for the plan review chat. Submit substantive, exact-revision design review comments with unique quoted anchors, and for a spec an optional summary of 2-3 sentences for the spec page. This records feedback only; it cannot edit or approve the plan.",
  ],
  plans_submit_extraction: [
    "plan.extraction.submit",
    "Narrow tool for the design extraction chat. Submit one extraction round. Stated and inferred facts require one exact unique quote; this cannot approve the plan.",
  ],
  plans_prepare_worktree: [
    "worktree.prepare",
    "Narrow tool for worker chats. Create or return a leaf's isolated worktree on branch avoozl/<task-id>: {taskId}. A retry returns the same worktree with its commits; nothing is removed or reset.",
  ],
  plans_report: [
    "session.report",
    "Narrow tool for worker, verifier, reviewer and falsifier chats. Report on your bound task from its worker, verifier, falsifier, or review session: {taskId, kind: progress|done|blocked|question|findings, text?, commit?, checks?, verdict?, findings?, closures?}. A local worker's done needs no commit: Avoozl reads HEAD of its task worktree and refuses a different one. Other done reports need the full commit SHA; a verifier's done also lists checks: [{command, exitCode}], one per declared check, and a check it could not run as {command, exitCode: null, notRun: reason}. A review's done names the commit it judged with verdict approved|changes-requested, findings [{id, kind: defect|observation, paths, text}], and closures [{finding: \"<attempt>:<role>:<id>\", state: fixed|unchanged, note?}] for every open finding of its role. blocked and question need text. A progress report may mark phase coding|tests|commands|ci-wait for timing, and a check entry may add durationMs. A worker told to investigate first reports kind findings with findings {read, cause, plan, check, confidence: low|medium|high}, changes no file, and reports done only after Avoozl's Go ahead; a falsifier's done has no commit and carries falsifier {verdict: stands|refuted, evidence, confidence}. Any report may attach evidence: [{kind: file, path, note?}] (an image or video of at most 20 MB, by absolute path) or [{kind: note, text}]. Only the session bound to the task's newest attempt may report.",
  ],
  plans_post_reply: [
    "reply.post",
    "Narrow tool for the responder. Post your one reply on the GitHub issue your responder session is bound to: {body}. Avoozl picks the issue from your session, refuses a reply with a secret-looking token, a URL with credentials, or an absolute or home path, or (on a public repository) one that quotes another repository on this machine (nothing is posted; fix it and post again), posts at most one comment per issue snapshot, and removes the responding label.",
  ],
  plans_submit_task_summary: [
    "tasksummary.submit",
    "Narrow tool for the task summary chat. Send your one task summary: {summary}, 2 to 4 short plain sentences (at most 800 characters). Avoozl picks the task from your session. It changes nothing else.",
  ],
  plans_submit_triage: [
    "triage.submit",
    "Narrow tool for the triage chat. Send your one triage result for the issue or pull request your session is bound to: {class: question|bug|optimization|feature|pull-request|unclear, reason, labels?, duplicateOf?, answer?: {body, citations: [path]}, question?, reproduction?: {path, text}, fix?: {bounded, why}, review?: {body, comments: [{path, line, side?, body}], partial, notCovered}, toOwner?: {reason}}. Avoozl checks it, runs the reproduction itself and makes every GitHub write after its content rules. It never closes, approves or requests changes.",
  ],
  plans_post_review_draft: [
    "reviewdraft.post",
    "Narrow tool for the review draft chat. Post your one draft review on the pull request your review draft chat is bound to: {body, comments?: [{path, line, start_line?, side?: RIGHT|LEFT, body}]}. Avoozl picks the pull request from your session and posts a PENDING review on the head commit your brief names, under the login of the person who asked; they edit and submit it. It refuses text with a secret-looking token, a URL with credentials or an absolute or home path (nothing is posted; fix it and post again), returns GitHub's refusal of a line outside the diff with nothing posted, and swaps the review label for the drafted label. It never submits, approves or requests changes.",
  ],
  plans_next: [
    "runner.next",
    "Narrow tool for the avoozl skill. Every local leaf in one list: ready, running, waiting (with the blockers each waits on), needsYou (blocked, review, questions, and stopped deliveries), and done. The tick starts ready work. Reads only.",
  ],
  plans_run_checks: [
    "flow.checks.run",
    "Narrow tool for worker chats. Local checks first: run your task's declared checks at HEAD of your worktree before each push, and record the pass the pre-push hook reads: {taskId, cwd: <absolute worktree path>}. Commit first. Returns {commit, checks: [{command, exitCode, durationMs, commit}], passed}; put that checks list in your done report.",
  ],
  plans_claim_task: [
    "runner.claim",
    "Refused over MCP: a manual claim is a person's, with avoozl claim TASK at the command line. The tick starts every other task.",
  ],
  plans_plan_review: [
    "plan.review.findings",
    "Narrow tool for planner and plan answer chats. Read spec findings and planner answers: {planId,roundId?,revisionHash?}. Each finding has severity (info|warn|blocker), category, findingState, anchor at the asked revision (moved when its quote is gone) and the person's decisions. Older revision findings stay readable and are marked stale. Read only: only a person decides a finding.",
  ],
  plans_answer_review: [
    "plan.review.answer",
    "Narrow tool for planner and plan answer chats. Answer your bound review round: {planId,roundId,answers:[{id,action:fixed|answered,revisionHash?,text}]}. Fixed names a revision this planner stored; this never closes findings or approves.",
  ],
  plans_approve_plan: [
    "plan.approve",
    "Extract an explicitly authorized revision into tasks atomically. Requires expectedHash and expectedRevision; the reviewed document hash and database revision are the authorization. approvedBy and evidence are optional: approvedBy defaults to the workspace operator, and evidence records a real statement when there is one. For a spec plan, retitled lists approved task IDs whose tasks.md item text may change in this approval. Refused here unless delegate names an approval delegate a person granted; it then approves on that person's behalf and the receipt records the delegation.",
  ],
};
const operations = NARROW_TOOLS;
// The operation and input a narrow tool call names, or {error}.
const narrowCall = (name, args) => {
  const input = args.input ?? {};
  return input && typeof input === "object" && !Array.isArray(input)
    ? { operation: operations[name][0], input }
    : { error: "input must be an object." };
};
const describe = (operation, description) =>
  PERSON_ONLY.has(operation)
    ? `Person only: refused over MCP; do it in the Avoozl app. ${description}`
    : description;
export const WORKSPACE_TOOLS = Object.entries(operations).map(
  ([name, [operation, description]]) => ({
    name,
    description: describe(operation, description),
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
        "plan.review.findings",
        "task.duplicates",
        "runner.next",
        "query",
        "task.get",
        "plan.table",
        "document.get",
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
export { complete };

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
    body: {
      jsonrpc: "2.0",
      id,
      result: complete(message, result),
    },
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
    ...viewToolList(),
    ...WORKSPACE_TOOLS,
  ].map(withViewLink);
  if (message?.method === "tools/list") return ok({ tools });
  const name = message?.params?.name;
  if (
    message?.method === "tools/call" &&
    (Object.hasOwn(GROUPED_TOOLS, name) ||
      Object.hasOwn(VIEW_TOOLS, name) ||
      Object.hasOwn(operations, name))
  ) {
    const args = message.params.arguments || {},
      route = Object.hasOwn(GROUPED_TOOLS, name)
        ? groupedCall(name, args)
        : Object.hasOwn(VIEW_TOOLS, name)
          ? viewCall(name, args)
          : narrowCall(name, args);
    const refuse = (text) =>
      ok({ isError: true, content: [{ type: "text", text }] });
    if (route.error) return refuse(route.error);
    // Checked again in Operations.perform; refusing here names the tool.
    const refusal = mcpRefusal(route.operation, route.input);
    if (refusal) return refuse(refusal);
    const { operation } = route;
    try {
      let result = await ops.execute(
        operation,
        route.input,
        args.expectedRevision,
        // `mcp`: a session's transport, never a person's (content.allow).
        { caller: attestedCaller ? kiroCrewCaller(message) : null, mcp: true },
      );
      if (Object.hasOwn(VIEW_TOOLS, name))
        result = viewResult(name, result, args.input);
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
