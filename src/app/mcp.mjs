import { complete, MCP_TOOLS, validateMcpRequest } from "../mcp.mjs";
import { workspaceIdentity } from "./identity.mjs";
import { classifyOperation } from "./operation-kinds.mjs";
import { mcpRefusal, PERSON_ONLY } from "./mcp-policy.mjs";
import { GROUPED_TOOLS, groupedCall, groupedToolList } from "./mcp-tools.mjs";
import {
  VIEW_TOOLS,
  viewCall,
  viewResult,
  viewToolList,
  withViewLink,
} from "./mcp-views.mjs";
// The single-operation tools that are not a grouped tool's action. The two
// review names are the planner's narrow tools; the person-only names answer
// a session with a refusal that points at the app. plans_workspace is a
// grouped tool; its old {input} call still reads the workspace.
export const OLD_TOOLS = {
  plans_plan_review: [
    "plan.review.findings",
    "Read spec findings and planner answers: {planId,roundId?,revisionHash?}. Each finding has severity (info|warn|blocker), category, findingState, anchor at the asked revision (moved when its quote is gone) and the person's decisions. Older revision findings stay readable and are marked stale. Read only: only a person decides a finding.",
  ],
  plans_answer_review: [
    "plan.review.answer",
    "Answer your bound review round: {planId,roundId,answers:[{id,action:fixed|answered,revisionHash?,text}]}. Fixed names a revision this planner stored; this never closes findings or approves.",
  ],
  plans_approve_plan: [
    "plan.approve",
    "Extract an explicitly authorized revision into tasks atomically. Requires expectedHash and expectedRevision; the reviewed document hash and database revision are the authorization. approvedBy and evidence are optional: approvedBy defaults to the workspace operator, and evidence records a real statement when there is one. For a spec plan, retitled lists approved task IDs whose tasks.md item text may change in this approval. Refused here unless delegate names an approval delegate a person granted; it then approves on that person's behalf and the receipt records the delegation.",
  ],
  plans_content_allow: [
    "content.allow",
    "Allow one blocked write once: {id, reason}. Only a person allows, from the Avoozl page or the CLI; a session calling this is refused (403).",
  ],
  plans_flow_run_anyway: [
    "flow.runAnyway",
    "Resume dispatch while a line stop stays open: {stopId, confirm: true}. Only a person runs anyway, from the Avoozl page or the CLI; a session calling this is refused (403).",
  ],
};
const operations = OLD_TOOLS;
// The operation and input an old plans_* call names, or {error}.
const oldCall = (name, args) => {
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
      readOnlyHint: operation === "plan.review.findings",
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
    ...MCP_TOOLS,
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
          : oldCall(name, args);
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
