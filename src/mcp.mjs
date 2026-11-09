import { resolveTaskId } from "./task-identity.mjs";
import { applyActivity, activityState } from "./activity.mjs";
import { randomUUID } from "node:crypto";
import { queryTasks, statusComplete } from "./query.mjs";
import { planSummaries } from "./plan-model.mjs";
import { epicProgress } from "./progress-model.mjs";
export const MCP_VERSIONS = [
  "2026-07-28",
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
];
const identity = { name: "aicommander", version: "0.1.0" };
const queryProperties = {
  scope: { type: "string", enum: ["all", "runtime"], default: "all" },
  activity: {
    type: "string",
    enum: ["", "active", "stale", "paused", "finished", "none"],
  },
  q: {
    type: "string",
    description:
      "Text or status:, epic:, tag:, ready:true, inflight:true, activity:stale, owner:NAME, depends:ID, unblocks:ID, neighbors:ID.",
  },
  status: { type: "string" },
  epic: { type: "string" },
  track: { type: "string" },
  tag: { type: "string" },
  node: { type: "string" },
  relation: { type: "string", enum: ["", "upstream", "downstream", "both"] },
};
const schema = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export const MCP_TOOLS = [
  {
    name: "plans_query",
    description:
      "Search workspace plans and tasks, including dependency-ready work. Returns exact total, revision and concise task records. Does not alter task status.",
    inputSchema: schema({
      ...queryProperties,
      limit: { type: "integer", minimum: 1, maximum: 200 },
      offset: { type: "integer", minimum: 0 },
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "plans_activity",
    description:
      "Report actual work separately from task progress. Start a session with owner and sessionId, heartbeat at least every ten minutes, then pause or finish. Default lease is 30 minutes; expired records are stale, never silently active. Heartbeat/pause/finish require the returned leaseId; a fresh foreign session rejects replacement. Does not run, stop or complete implementation work.",
    inputSchema: schema(
      {
        id: { type: "string" },
        action: {
          type: "string",
          enum: ["start", "heartbeat", "pause", "finish"],
        },
        owner: { type: "string", maxLength: 240 },
        sessionId: { type: "string", maxLength: 240 },
        leaseId: { type: "string", maxLength: 240 },
        branch: { type: "string", maxLength: 240 },
        worktree: { type: "string", maxLength: 1000 },
        summary: { type: "string", maxLength: 2000 },
        leaseMinutes: { type: "integer", minimum: 5, maximum: 240 },
      },
      ["id", "action"],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "plans_get_task",
    description:
      "Get one task with its full plan excerpt, implementation notes, acceptance criteria, evidence, prerequisites and dependents.",
    inputSchema: schema({ id: { type: "string" } }, ["id"]),
    annotations: { readOnlyHint: true },
  },
  {
    name: "plans_status",
    description:
      "Aggregate exact task/status counts by epic. Counts are not an estimate of engineering effort or whole-head acceptance.",
    inputSchema: schema(queryProperties),
    annotations: { readOnlyHint: true },
  },
  {
    name: "plans_documents",
    description:
      "Query plan lifecycle, percent complete, feature area and target branch. Abandoned plans are hidden unless requested. Progress is task-count based or an authored estimate, not delivery acceptance.",
    inputSchema: schema({
      q: { type: "string" },
      status: {
        type: "string",
        enum: ["done", "not-started", "started", "abandoned"],
      },
      category: { type: "string" },
      branch: { type: "string" },
      includeAbandoned: { type: "boolean" },
      limit: { type: "integer", minimum: 1, maximum: 200 },
      offset: { type: "integer", minimum: 0 },
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "plans_get_document",
    description:
      "Read indexed plan design context by document ID and line range.",
    inputSchema: schema(
      {
        id: { type: "string" },
        startLine: { type: "integer", minimum: 1 },
        lineCount: { type: "integer", minimum: 1, maximum: 500 },
      },
      ["id"],
    ),
    annotations: { readOnlyHint: true },
  },
  {
    name: "plans_audit",
    description:
      "Find changed or removed plan contexts requiring reconciliation and invalid explicit task references. Review authored status; never infer acceptance from a checkbox.",
    inputSchema: schema({
      scope: { type: "string", enum: ["all", "runtime"] },
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "plans_list_visualizations",
    description:
      "List saved JSON-powered graph/epic visualizations and identify the view currently presented on the site.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "plans_visualize",
    description:
      "Create a named visualization from task queries or IDs. Saves only view configuration, not task copies or status. Activates it on the open site at its next conditional poll. The strip view zooms continuously; focus:matches animates into matching tasks while other tasks stay faint. Use expectedRevision when replacing an existing ID.",
    inputSchema: schema(
      {
        id: { type: "string", pattern: "^[a-z][a-z0-9-]{2,80}$" },
        title: { type: "string", minLength: 1, maxLength: 160 },
        caption: { type: "string", maxLength: 2000 },
        view: { type: "string", enum: ["strip", "epics", "graph"] },
        filters: schema(queryProperties),
        taskIds: { type: "array", items: { type: "string" }, maxItems: 500 },
        selected: { type: "string" },
        group: { type: "string", enum: ["epic", "track", "status", "tag"] },
        detail: { type: "string", enum: ["overview", "all"] },
        zoom: { type: "number", minimum: 45, maximum: 350 },
        stripOrder: { type: "string", enum: ["chronological", "progress"] },
        stripZoom: { type: "number", minimum: 1, maximum: 100000 },
        stripAt: { type: "number", minimum: 0, maximum: 1 },
        focus: { type: "string", enum: ["", "matches"] },
        activate: { type: "boolean", default: true },
        expectedRevision: { type: "integer", minimum: 1 },
      },
      ["title", "view"],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "plans_present",
    description:
      "Present a narrated sequence of saved views, with animated camera focus and view transitions. The site offers Next/Previous and Play/Pause. Saves JSON presentation configuration only; never alters tasks. Autoplay is opt-in.",
    inputSchema: schema(
      {
        id: { type: "string", pattern: "^[a-z][a-z0-9-]{2,80}$" },
        title: { type: "string", minLength: 1, maxLength: 160 },
        steps: {
          type: "array",
          maxItems: 12,
          items: schema(
            {
              viewId: { type: "string" },
              target: {
                type: "string",
                enum: [
                  "selection",
                  "chart",
                  "search",
                  "filters",
                  "tasks",
                  "documents",
                ],
              },
              caption: { type: "string", maxLength: 2000 },
              durationMs: { type: "integer", minimum: 1500, maximum: 30000 },
            },
            ["viewId"],
          ),
        },
        autoplay: { type: "boolean" },
        expectedRevision: { type: "integer", minimum: 1 },
      },
      ["title", "steps"],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "plans_activate_visualization",
    description:
      "Present an existing saved visualization on the open site. Does not change tasks.",
    inputSchema: schema({ id: { type: "string" } }, ["id"]),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];
const cleanTask = (t) => ({
  id: t.id,
  title: t.title,
  status: t.status,
  scope: t.scope,
  epic: t.epic,
  track: t.track,
  tags: t.tags,
  nextAction: t.nextAction,
  needsReview: t.needsReview,
  owner: t.owner,
  activity: t.activity,
  activityState: activityState(t),
});
function checkedArgs(tool, args) {
  if (!args || typeof args !== "object" || Array.isArray(args))
    throw Error("arguments must be an object");
  function check(value, s, path) {
    if (s.type === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw Error(path + " must be an object");
      for (const key of s.required || [])
        if (!Object.hasOwn(value, key))
          throw Error("Missing " + path + "." + key);
      for (const [key, v] of Object.entries(value)) {
        if (!s.properties[key]) throw Error("Unknown " + path + "." + key);
        check(v, s.properties[key], path + "." + key);
      }
    } else if (s.type === "array") {
      if (!Array.isArray(value) || value.length > (s.maxItems ?? Infinity))
        throw Error(path + " must be a bounded array");
      for (const v of value) check(v, s.items, path);
    } else if (s.type === "string") {
      if (
        typeof value !== "string" ||
        value.length < (s.minLength || 0) ||
        value.length > (s.maxLength ?? 10000) ||
        (s.pattern && !new RegExp(s.pattern).test(value))
      )
        throw Error("Invalid " + path);
    } else if (s.type === "boolean") {
      if (typeof value !== "boolean") throw Error(path + " must be boolean");
    } else if (
      !Number.isFinite(value) ||
      (s.type === "integer" && !Number.isInteger(value)) ||
      value < (s.minimum ?? -Infinity) ||
      value > (s.maximum ?? Infinity)
    )
      throw Error("Invalid " + path);
    if (s.enum && !s.enum.includes(value)) throw Error("Invalid " + path);
  }
  check(args, tool.inputSchema, "arguments");
  return args;
}
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
function callTool(name, args, ctx) {
  const data = ctx.read();
  if (["plans_get_task", "plans_activity"].includes(name))
    args = { ...args, id: resolveTaskId(data, args.id) };
  if (name === "plans_visualize")
    args = {
      ...args,
      selected: resolveTaskId(data, args.selected),
      taskIds: args.taskIds?.map((id) => resolveTaskId(data, id)),
    };
  const filters = { scope: "all", ...args };
  if (name === "plans_activity") {
    const next = structuredClone(data),
      result = applyActivity(next, args);
    ctx.commit(next, "Activity " + args.action + ": " + args.id);
    return { revision: ctx.read().revision, ...result };
  }
  if (name === "plans_query") {
    const rows = queryTasks(data, filters);
    return {
      revision: data.revision,
      total: rows.length,
      tasks: rows
        .slice(args.offset || 0, (args.offset || 0) + (args.limit || 60))
        .map(cleanTask),
    };
  }
  if (name === "plans_status") {
    const rows = queryTasks(data, filters),
      matchingIds = new Set(rows.map((t) => t.id));
    return {
      revision: data.revision,
      total: rows.length,
      complete: rows.filter((t) => statusComplete(data, t.status)).length,
      statuses: data.statuses.map((s) => ({
        id: s.id,
        label: s.label,
        count: rows.filter((t) => t.status === s.id).length,
      })),
      epics: epicProgress(data, { scope: filters.scope, matchingIds })
        .filter((e) => e.matches)
        .map(({ tasks, ...e }) => e),
      note: "Epic completion denominators retain all tasks in scope; matching counts reflect filters. Task counts are not effort estimates.",
    };
  }
  if (name === "plans_get_task") {
    const task = data.tasks.find((t) => t.id === args.id);
    if (!task) throw Error("Unknown task " + args.id);
    const doc = data.documents[task.source?.document];
    return {
      revision: data.revision,
      ...task,
      context: doc
        ? doc.text
            .split("\n")
            .slice(task.source.lineStart - 1, task.source.lineEnd)
            .join("\n")
        : "",
      relationships: data.edges.filter(
        (e) => e.from === task.id || e.to === task.id,
      ),
      additionalContext: (task.contextDocuments || []).map((id) => ({
        id,
        title: data.documents[id]?.title,
      })),
    };
  }
  if (name === "plans_documents") {
    const plans = planSummaries(data).filter(
      (p) =>
        (args.includeAbandoned ||
          args.status === "abandoned" ||
          p.status !== "abandoned") &&
        (!args.status || p.status === args.status) &&
        (!args.category || p.category === args.category) &&
        (!args.branch || p.branch === args.branch) &&
        (!args.q ||
          (p.doc.title + " " + p.doc.id + " " + p.category + " " + p.branch)
            .toLowerCase()
            .includes(args.q.toLowerCase())),
    );
    return {
      revision: data.revision,
      total: plans.length,
      plans: plans
        .slice(args.offset || 0, (args.offset || 0) + (args.limit || 60))
        .map(({ doc, tasks, ...p }) => ({
          ...p,
          id: doc.id,
          title: doc.title,
        })),
    };
  }
  if (name === "plans_get_document") {
    const doc = data.documents[args.id];
    if (!doc) throw Error("Unknown document " + args.id);
    const lines = doc.text.split("\n"),
      start = (args.startLine || 1) - 1,
      count = args.lineCount || 250;
    const {
      tasks: ownedTasks,
      doc: record,
      ...progress
    } = planSummaries(data).find((p) => p.doc.id === doc.id) || {};
    return {
      revision: data.revision,
      id: doc.id,
      title: doc.title,
      plan: doc.plan,
      progress,
      hash: doc.hash,
      startLine: start + 1,
      totalLines: lines.length,
      text: lines.slice(start, start + count).join("\n"),
      taskIds: data.tasks
        .filter(
          (t) =>
            t.source?.document === doc.id ||
            t.contextDocuments?.includes(doc.id),
        )
        .map((t) => t.id),
    };
  }
  if (name === "plans_audit") return auditPlans(data, args);
  if (name === "plans_list_visualizations")
    return {
      revision: data.revision,
      active: data.presentation?.activeVisualization,
      views: data.presentation?.views || [],
      tours: data.presentation?.tours || [],
      activeTour: data.presentation?.activeTour,
    };

  if (name === "plans_present") {
    if (!args.steps.length)
      throw Error("A presentation needs at least one step");
    const next = structuredClone(data);
    next.presentation ??= {};
    next.presentation.tours ??= [];
    const id = args.id || "tour-" + randomUUID().slice(0, 12),
      existing = next.presentation.tours.find((t) => t.id === id);
    if (
      (existing || args.expectedRevision !== undefined) &&
      args.expectedRevision !== data.revision
    )
      throw Error(
        "Database changed or replacing an existing presentation; reread and supply expectedRevision.",
      );
    for (const step of args.steps)
      if (!next.presentation.views?.some((v) => v.id === step.viewId))
        throw Error("Unknown saved view " + step.viewId);
    const record = {
      id,
      title: args.title,
      steps: args.steps.map((s) => ({
        ...s,
        caption: s.caption || "",
        durationMs: s.durationMs || 6000,
      })),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    next.presentation.tours = next.presentation.tours.filter(
      (t) => t.id !== id,
    );
    next.presentation.tours.push(record);
    next.presentation.activeTour = {
      id,
      token: randomUUID(),
      autoplay: Boolean(args.autoplay),
      at: new Date().toISOString(),
    };
    delete next.presentation.activeVisualization;
    ctx.commit(next, "MCP presentation: " + record.title);
    return {
      revision: ctx.read().revision,
      presentation: record,
      url: ctx.base + "/?tour=" + encodeURIComponent(id),
      notice:
        "The site opens the presentation at its next visible poll; animations respect reduced-motion preferences. Autoplay pauses when hidden.",
    };
  }
  const next = structuredClone(data);
  next.presentation ??= {};
  next.presentation.views ??= [];
  let record;
  if (name === "plans_visualize") {
    const id = args.id || "view-" + randomUUID().slice(0, 12);
    const existing = next.presentation.views.find((v) => v.id === id);
    if (existing && args.expectedRevision !== data.revision)
      throw Error(
        "Replacing a view requires the current expectedRevision; reread before editing.",
      );
    if (
      args.expectedRevision !== undefined &&
      args.expectedRevision !== data.revision
    )
      throw Error("Database changed; reread before saving.");
    for (const id of args.taskIds || [])
      if (!data.tasks.some((t) => t.id === id))
        throw Error("Unknown task " + id);
    if (
      args.selected &&
      !data.tasks.some((t) => t.id === args.selected) &&
      !data.epics.some((e) => "epic:" + e.id === args.selected)
    )
      throw Error("Unknown selected task or epic");
    const f = { scope: "all", ...(args.filters || {}) };
    if (
      f.status &&
      ![
        "remaining",
        "needs-review",
        ...data.statuses.map((s) => s.id),
      ].includes(f.status)
    )
      throw Error("Unknown status filter");
    if (f.track && !data.tracks.some((t) => t.id === f.track))
      throw Error("Unknown track filter");
    if (
      f.epic &&
      !data.epics.some((t) => t.id === f.epic) &&
      !data.documents[f.epic.replace(/^doc:/, "")]
    )
      throw Error("Unknown epic filter");
    record = {
      id,
      title: args.title,
      caption: args.caption || "",
      view: args.view,
      filters: f,
      taskIds: [...new Set(args.taskIds || [])],
      selected: args.selected || "",
      group: args.group || "epic",
      detail: args.detail || "all",
      zoom: args.zoom || 100,
      stripOrder: args.stripOrder || "chronological",
      stripZoom: args.stripZoom || 1,
      stripAt: args.stripAt ?? 0.5,
      focus: args.focus || "",
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    next.presentation.views = next.presentation.views.filter(
      (v) => v.id !== id,
    );
    next.presentation.views.push(record);
  } else {
    record = next.presentation.views.find((v) => v.id === args.id);
    if (!record) throw Error("Unknown saved visualization");
  }
  if (args.activate !== false) {
    next.presentation.activeVisualization = {
      id: record.id,
      token: randomUUID(),
      at: new Date().toISOString(),
    };
    delete next.presentation.activeTour;
  }
  ctx.commit(next, "MCP visualization: " + record.title);
  const params = new URLSearchParams({
    visualization: record.id,
    view: record.view,
    scope: record.filters.scope,
  });
  return {
    revision: ctx.read().revision,
    visualization: record,
    url: ctx.base + "/?" + params,
    active: args.activate !== false,
    notice:
      "Open pages apply an activated view at the next visible conditional poll. Task records were not changed.",
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
export function dispatchMcp(message, ctx, { versionHeader } = {}) {
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
        "Query workspace plans. Use plans_visualize to present JSON-backed epic bars or dependency graphs on the site. Read full task context before interpreting acceptance.",
    };
  else if (method === "server/discover")
    result = {
      supportedVersions: MCP_VERSIONS,
      capabilities: { tools: {}, resources: {} },
      instructions:
        "SQLite owns live plan execution state; database.json is an export. Visualizations save display configuration only. Use plans_audit for prose/task reconciliation.",
    };
  else if (method === "ping") result = {};
  else if (method === "tools/list") result = { tools: MCP_TOOLS };
  else if (method === "resources/list")
    result = {
      resources: [
        {
          uri: "nupp-plans://status",
          name: "Workspace plan status",
          mimeType: "application/json",
        },
        {
          uri: "nupp-plans://visualizations",
          name: "Saved plan visualizations",
          mimeType: "application/json",
        },
      ],
    };
  else if (method === "resources/templates/list")
    result = { resourceTemplates: [] };
  else if (method === "resources/read") {
    const name =
      args.uri === "nupp-plans://status"
        ? "plans_status"
        : args.uri === "nupp-plans://visualizations"
          ? "plans_list_visualizations"
          : null;
    if (!name) return error(-32602, "Unknown resource");
    result = {
      contents: [
        {
          uri: args.uri,
          mimeType: "application/json",
          text: JSON.stringify(callTool(name, {}, ctx)),
        },
      ],
    };
  } else if (method === "tools/call") {
    const tool = MCP_TOOLS.find((t) => t.name === args.name);
    if (!tool) return error(-32602, "Unknown tool");
    try {
      const output = callTool(
        tool.name,
        checkedArgs(tool, args.arguments || {}),
        ctx,
      );
      result = {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
        isError: false,
      };
    } catch (e) {
      result = { content: [{ type: "text", text: e.message }], isError: true };
    }
  } else return error(-32601, "Method not found");
  if (modern)
    result = {
      ...result,
      resultType: "complete",
      _meta: { "io.modelcontextprotocol/serverInfo": identity },
    };
  return { status: 200, body: { jsonrpc: "2.0", id: message.id, result } };
}
