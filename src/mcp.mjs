// The MCP protocol layer shared by every Avoozl server: request checks,
// initialize, ping and the view resources. Tools live in src/app/mcp.mjs.
import { resolveTaskId } from "./task-identity.mjs";
import { readView, viewResources } from "./app/mcp-views.mjs";
export const MCP_VERSIONS = [
  "2026-07-28",
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
];
const identity = { name: "avoozl", version: "0.1.0" };
export function auditPlans(data, { scope = "all" } = {}) {
  const ids = new Set(data.tasks.map((t) => t.id)),
    findings = [];
  for (const task of data.tasks.filter(
    (t) => scope === "all" || t.scope === scope,
  )) {
    if (task.needsReview)
      findings.push({
        taskId: task.id,
        kind: "changed-context",
        action:
          "Review the changed source against authored task status and acceptance.",
      });
    if (task.source?.removed)
      findings.push({
        taskId: task.id,
        kind: "removed-source",
        action: "Relink, retire, or explicitly retain this task.",
      });
    for (const id of task.contextDocuments || [])
      if (!data.documents[id])
        findings.push({
          taskId: task.id,
          kind: "missing-context",
          document: id,
        });
  }
  for (const doc of Object.values(data.documents))
    for (const match of doc.text.matchAll(/<!--\s*task:([a-z0-9-]+)\s*-->/g))
      if (!ids.has(resolveTaskId(data, match[1])))
        findings.push({
          kind: "unknown-task-reference",
          document: doc.id,
          taskId: match[1],
        });
  return {
    revision: data.revision,
    count: findings.length,
    findings,
    policy:
      "The database owns status/dependencies/order. Markdown owns design prose. Source checkbox disagreement alone is not proof of stale authored acceptance.",
  };
}
export function validateMcpRequest(message, { versionHeader } = {}) {
  const error = (code, text, status = 200, extra = {}) => ({
    status,
    body: {
      jsonrpc: "2.0",
      id: message?.id ?? null,
      error: { code, message: text, ...extra },
    },
  });
  if (
    !message ||
    Array.isArray(message) ||
    message.jsonrpc !== "2.0" ||
    typeof message.method !== "string" ||
    (Object.hasOwn(message, "id") &&
      typeof message.id !== "string" &&
      typeof message.id !== "number")
  )
    return error(-32600, "Invalid JSON-RPC request", 400);
  const meta = message.params?._meta || {},
    version =
      meta["io.modelcontextprotocol/protocolVersion"] ||
      versionHeader ||
      "2025-11-25",
    modern = version === "2026-07-28";
  if (!MCP_VERSIONS.includes(version))
    return error(-32022, "Unsupported protocol version", 400, {
      data: { supported: MCP_VERSIONS },
    });
  if (
    versionHeader &&
    meta["io.modelcontextprotocol/protocolVersion"] &&
    versionHeader !== version
  )
    return error(-32020, "Protocol header and request metadata disagree", 400);
  if (
    modern &&
    (!meta["io.modelcontextprotocol/clientInfo"] ||
      !meta["io.modelcontextprotocol/clientCapabilities"])
  )
    return error(
      -32602,
      "Modern MCP requests require clientInfo and clientCapabilities metadata",
      400,
    );
  if (!Object.hasOwn(message, "id")) return { status: 202, body: null };
  return null;
}
export function dispatchMcp(message, { versionHeader } = {}) {
  const invalid = validateMcpRequest(message, { versionHeader });
  if (invalid) return invalid;
  const error = (code, text, status = 200, extra = {}) => ({
    status,
    body: {
      jsonrpc: "2.0",
      id: message.id,
      error: { code, message: text, ...extra },
    },
  });
  const modern =
    (message.params?._meta?.["io.modelcontextprotocol/protocolVersion"] ||
      versionHeader) === "2026-07-28";
  let result;
  const method = message.method,
    args = message.params || {};
  if (method === "initialize")
    result = {
      protocolVersion:
        MCP_VERSIONS.includes(args.protocolVersion) &&
        args.protocolVersion !== "2026-07-28"
          ? args.protocolVersion
          : "2025-11-25",
      capabilities: { tools: {}, resources: {} },
      serverInfo: identity,
      instructions:
        "Use the plans_* grouped tools. Read full task context before interpreting acceptance.",
    };
  else if (method === "server/discover")
    result = {
      supportedVersions: MCP_VERSIONS,
      capabilities: { tools: {}, resources: {} },
      instructions:
        "SQLite owns live plan execution state; database.json is an export.",
    };
  else if (method === "ping") result = {};
  else if (method === "tools/list") result = { tools: [] };
  else if (method === "resources/list") result = { resources: viewResources() };
  else if (method === "resources/templates/list")
    result = { resourceTemplates: [] };
  else if (method === "resources/read") {
    const view = readView(String(args.uri ?? ""));
    if (!view) return error(-32602, "Unknown resource");
    result = view;
  } else return error(-32601, "Method not found");
  result = complete(message, result);
  if (modern)
    result = {
      ...result,
      _meta: { "io.modelcontextprotocol/serverInfo": identity },
    };
  return { status: 200, body: { jsonrpc: "2.0", id: message.id, result } };
}

// Results of protocol revision 2026-07-28: every one carries resultType, and
// a list also says how long a client may cache it. Kiro Crew refuses a server
// whose tools/list lacks either. Every result carries them whatever revision
// the request names: Kiro Crew's gateway primes a shared server's tool list
// itself, without the client's revision, and hands that list to 2026-07-28
// clients. Earlier revisions ignore the extra fields.
// ttlMs 0 and private: the tool list may differ by caller, so never cache it.
const LISTS = new Set([
  "tools/list",
  "prompts/list",
  "resources/list",
  "resources/templates/list",
]);
export function complete(message, result) {
  return {
    ...(LISTS.has(message?.method) ? { ttlMs: 0, cacheScope: "private" } : {}),
    ...result,
    resultType: "complete",
  };
}
