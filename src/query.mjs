import { resolveTaskId, taskSourceRefs } from "./task-identity.mjs";
import { activityState } from "./activity.mjs";
import { isArchivedTask, isHistoricalTask } from "./browse-model.mjs";
function wantsArchived(options) {
  return (
    options.historical === true ||
    options.historical === "true" ||
    /archived/i.test(String(options.status || "")) ||
    /(?:^|\s)(?:historical:true|status:\S*archived)(?:\s|$)/i.test(
      options.q || "",
    )
  );
}
const indexes = new WeakMap();
function queryIndex(data) {
  let index = indexes.get(data);
  if (!index) {
    const prerequisites = new Map();
    for (const e of data.edges)
      if (["requires", "sequence"].includes(e.kind)) {
        if (!prerequisites.has(e.to)) prerequisites.set(e.to, []);
        prerequisites.get(e.to).push(e.from);
      }
    index = {
      lines: new Map(),
      tasks: new Map(),
      byId: new Map(data.tasks.map((t) => [t.id, t])),
      complete: new Set(
        data.statuses.filter((s) => s.complete).map((s) => s.id),
      ),
      prerequisites,
    };
    indexes.set(data, index);
  }
  return index;
}
const matches = (value, choices) =>
  choices.split("|").includes(String(value || "").toLowerCase());
function searchable(data, t) {
  const index = queryIndex(data);
  if (index.tasks.has(t.id)) return index.tasks.get(t.id);
  if (!index.aliases) {
    index.aliases = new Map();
    for (const alias of Object.keys(data.taskAliases || {})) {
      const id = resolveTaskId(data, alias);
      if (!index.aliases.has(id)) index.aliases.set(id, []);
      index.aliases.get(id).push(alias);
    }
  }
  const contexts = taskSourceRefs(t).map((ref) => {
    if (ref.approvedSource?.text) return ref.approvedSource.text;
    if (ref === t.source && t.approvedSource?.text)
      return t.approvedSource.text;
    if (!data.documents[ref.document]) return "";
    let lines = index.lines.get(ref.document);
    if (!lines) {
      lines = (data.documents[ref.document].text || "").split("\n");
      index.lines.set(ref.document, lines);
    }
    return lines.slice(ref.lineStart - 1, ref.lineEnd).join(" ");
  });
  const value = [
    t.title,
    t.summary,
    t.nextAction,
    t.notes,
    t.id,
    ...(index.aliases.get(t.id) || []),
    t.epic,
    ...(t.tags || []),
    t.owner,
    t.activity?.owner,
    t.activity?.branch,
    t.activity?.summary,
    ...contexts,
  ]
    .join(" ")
    .toLowerCase();
  index.tasks.set(t.id, value);
  return value;
}

export function statusComplete(data, id) {
  return queryIndex(data).complete.has(id);
}
const graphIndexes = new WeakMap();
export function graphNeighbors(
  data,
  id,
  direction = "both",
  transitive = false,
) {
  let index = graphIndexes.get(data);
  if (!index || index.length !== data.edges.length) {
    index = {
      length: data.edges.length,
      incoming: new Map(),
      outgoing: new Map(),
    };
    for (const edge of data.edges) {
      if (!index.incoming.has(edge.to)) index.incoming.set(edge.to, []);
      if (!index.outgoing.has(edge.from)) index.outgoing.set(edge.from, []);
      index.incoming.get(edge.to).push(edge);
      index.outgoing.get(edge.from).push(edge);
    }
    graphIndexes.set(data, index);
  }
  id = resolveTaskId(data, id);
  const found = new Set([id]),
    queue = [id];
  for (let at = 0; at < queue.length; at++) {
    const current = queue[at],
      edges = [
        ...(direction !== "downstream"
          ? index.incoming.get(current) || []
          : []),
        ...(direction !== "upstream" ? index.outgoing.get(current) || [] : []),
      ];
    for (const edge of edges) {
      if (direction !== "both" && edge.kind !== "requires") continue;
      const other = edge.to === current ? edge.from : edge.to;
      if (!found.has(other)) {
        found.add(other);
        if (transitive) queue.push(other);
      }
    }
  }
  return found;
}
export function queryTasks(data, options = {}) {
  options = { ...options, node: resolveTaskId(data, options.node) };
  const scope = options.scope || "runtime",
    index = queryIndex(data);
  let rows = data.tasks.filter((t) => scope === "all" || t.scope === scope);
  if (!wantsArchived(options))
    rows = rows.filter((t) => !isArchivedTask(data, t));
  if (options.historical === false || options.historical === "false")
    rows = rows.filter((t) => !isHistoricalTask(data, t));
  if (options.activity)
    rows = rows.filter(
      (t) => activityState(t, options.now ?? Date.now()) === options.activity,
    );
  if (options.status === "needs-review")
    rows = rows.filter((t) => t.needsReview || t.status === "review");
  else if (options.status === "remaining")
    rows = rows.filter((t) => !statusComplete(data, t.status));
  else if (options.status)
    rows = rows.filter((t) => matches(t.status, options.status));
  if (options.epic) rows = rows.filter((t) => matches(t.epic, options.epic));
  if (options.track) rows = rows.filter((t) => matches(t.track, options.track));
  if (options.tag) rows = rows.filter((t) => t.tags?.includes(options.tag));
  if (options.node && options.relation) {
    const ids = graphNeighbors(data, options.node, options.relation, true);
    rows = rows.filter((t) => ids.has(t.id));
  }
  const tokens = (options.q || "").match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  for (const raw of tokens) {
    const token = raw.replace(/^"|"$/g, "");
    const colon = token.indexOf(":");
    const key = colon > 0 ? token.slice(0, colon) : "";
    const value =
      colon > 0
        ? token
            .slice(colon + 1)
            .replace(/^"|"$/g, "")
            .toLowerCase()
        : token.toLowerCase();
    if (key === "historical") {
      if (value === "false")
        rows = rows.filter((t) => !isHistoricalTask(data, t));
    } else if (key === "scope")
      rows = rows.filter((t) => value === "all" || t.scope === value);
    else if (key === "status" && value === "remaining")
      rows = rows.filter((t) => !statusComplete(data, t.status));
    else if (key === "status" && value === "needs-review")
      rows = rows.filter((t) => t.needsReview || t.status === "review");
    else if (key === "id") {
      const ids = value.split("|").map((id) => resolveTaskId(data, id));
      rows = rows.filter((t) => ids.includes(t.id));
    } else if (["status", "epic", "track", "tag", "kind"].includes(key))
      rows = rows.filter((t) =>
        key === "tag"
          ? t.tags?.some((x) => matches(x, value))
          : matches(t[key], value),
      );
    else if (key === "inflight")
      rows = rows.filter(
        (t) =>
          (activityState(t, options.now ?? Date.now()) === "active") ===
          (value === "true"),
      );
    else if (key === "activity")
      rows = rows.filter((t) =>
        matches(activityState(t, options.now ?? Date.now()), value),
      );
    else if (key === "owner")
      rows = rows.filter((t) =>
        (t.activity?.owner || t.owner || "").toLowerCase().includes(value),
      );
    else if (key === "ready")
      rows = rows.filter(
        (t) =>
          (!statusComplete(data, t.status) &&
            !isArchivedTask(data, t) &&
            !["blocked", "deferred", "review"].includes(t.status) &&
            !t.needsReview &&
            !t.source?.removed &&
            t.dispatch?.ready !== false &&
            (index.prerequisites.get(t.id) || []).every((id) =>
              index.complete.has(index.byId.get(id)?.status),
            )) ===
          (value === "true"),
      );
    else if (["depends", "unblocks", "neighbors"].includes(key)) {
      const ids = graphNeighbors(
        data,
        value,
        key === "depends"
          ? "upstream"
          : key === "unblocks"
            ? "downstream"
            : "both",
        true,
      );
      rows = rows.filter((t) => ids.has(t.id));
    } else
      rows = rows.filter((t) =>
        searchable(data, t).includes(token.toLowerCase()),
      );
  }
  return rows;
}
