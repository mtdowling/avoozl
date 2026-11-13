// Supersede by hand (design §5.2, Requirement 39). A person replaces a wrong
// local task with a new one in one transaction. The old task keeps its
// sessions, deliveries, verdicts and evidence as history and takes status
// `superseded`. Edges are not rewritten: readiness resolves an edge from the
// old task through `supersededBy` on read (work-model.mjs supersedingTask),
// because plan approval rebuilds plan edges and would undo a rewrite.
import { resolveTaskId } from "../task-identity.mjs";
import { COMPLETIONS, supersedingTask, taskAuthority } from "../work-model.mjs";
import { fail } from "./store.mjs";

// Not complete, so dependents wait for the replacement; archived, so it is
// hidden by default and never dispatched.
export const SUPERSEDED_STATUS = Object.freeze({
  id: "superseded",
  label: "Superseded",
  complete: false,
  archived: true,
});

const TASK_ID = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/;
// What the replacement takes from the old task unless `create` says otherwise.
const COPIED = [
  "scope",
  "kind",
  "epic",
  "track",
  "tags",
  "summary",
  "nextAction",
  "acceptance",
  "checks",
  "acceptFrom",
  "completion",
  "route",
  "repository",
  "projectId",
  "parent",
  "rank",
  "resources",
  "contextDocuments",
];
// What a person may set on the replacement. acceptFrom is not among them: it
// changes only through plan approval (R38.4), so the replacement keeps it.
const SETTABLE = {
  title: "text",
  summary: "text",
  nextAction: "text",
  notes: "text",
  acceptance: "list",
  checks: "list",
  tags: "list",
};

function taken(data, id) {
  return (
    data.tasks.some((t) => t.id === id) ||
    Object.hasOwn(data.taskAliases || {}, id)
  );
}

function newId(data, old, requested) {
  if (requested !== undefined) {
    if (
      typeof requested !== "string" ||
      requested.length > 160 ||
      !TASK_ID.test(requested)
    )
      fail("The new task ID must be lowercase letters, digits, - and .");
    if (taken(data, requested)) fail(`Task ${requested} already exists.`, 409);
    return requested;
  }
  for (let n = 2; ; n++) {
    const id = `${old.id}-r${n}`;
    if (!taken(data, id)) return id;
  }
}

function requiresEdges(data, entries, to) {
  if (
    !Array.isArray(entries) ||
    entries.some(
      (x) =>
        typeof x !== "string" &&
        (typeof x?.task !== "string" || !COMPLETIONS.includes(x.condition)),
    )
  )
    fail(
      "Requires must contain task IDs or {task, condition} with a known completion.",
    );
  const conditions = new Map();
  for (const entry of entries) {
    const from = resolveTaskId(
      data,
      typeof entry === "string" ? entry : entry.task,
    );
    if (!data.tasks.some((t) => t.id === from))
      fail(`Required task ${from} was not found.`, 404);
    if (!conditions.has(from) || typeof entry !== "string")
      conditions.set(
        from,
        typeof entry === "string" ? undefined : entry.condition,
      );
  }
  return [...conditions].map(([from, condition]) => ({
    id: `${from}:requires:${to}`,
    from,
    to,
    kind: "requires",
    ...(condition ? { condition } : {}),
    reason: "Authored task dependency.",
  }));
}

// Readiness follows edges through the chain, so a cycle counts once both ends
// are resolved: a replacement that requires a task depending on the old one
// would wait on itself.
function refuseResolvedCycle(data) {
  const byId = new Map(data.tasks.map((t) => [t.id, t])),
    graph = new Map(),
    active = new Set(),
    seen = new Set();
  for (const e of data.edges) {
    if (!["requires", "sequence"].includes(e.kind)) continue;
    const from = supersedingTask(byId, e.from)?.id ?? e.from;
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push(e.to);
  }
  const visit = (id) => {
    if (active.has(id)) fail("Superseding would make a dependency cycle.", 409);
    if (seen.has(id)) return;
    active.add(id);
    for (const to of graph.get(id) || []) visit(to);
    active.delete(id);
    seen.add(id);
  };
  for (const id of graph.keys()) visit(id);
}

export function supersedeTask(data, input = {}, { operator } = {}) {
  const create = input.create ?? {};
  if (!create || typeof create !== "object" || Array.isArray(create))
    fail("Describe the new task as an object in create.");
  const old = data.tasks.find((t) => t.id === resolveTaskId(data, input.id));
  if (!old) fail("Task not found.", 404);
  const authority = taskAuthority(old);
  if (authority !== "local") {
    const error = Error(
      `Task ${old.id} is owned by ${authority}; replace it in its plan or its tracker instead.`,
    );
    error.status = 409;
    error.code = "authority-" + authority.replace(/:.*/, "");
    throw error;
  }
  if (old.supersededBy || old.status === SUPERSEDED_STATUS.id)
    fail(
      `Task ${old.id} is already superseded${old.supersededBy ? " by " + old.supersededBy : ""}; supersede that task instead.`,
      409,
    );
  const id = newId(data, old, create.id),
    at = new Date().toISOString(),
    task = { id, title: old.title };
  for (const key of COPIED)
    if (old[key] !== undefined) task[key] = structuredClone(old[key]);
  if (old.authority === "local") task.authority = "local";
  for (const [key, type] of Object.entries(SETTABLE)) {
    if (!Object.hasOwn(create, key)) continue;
    const value = create[key];
    if (
      type === "text"
        ? typeof value !== "string"
        : !Array.isArray(value) || value.some((v) => typeof v !== "string")
    )
      fail(`${key} must be ${type === "text" ? "text" : "a list of strings"}.`);
    task[key] = value;
  }
  for (const key of Object.keys(create))
    if (!Object.hasOwn(SETTABLE, key) && !["id", "requires"].includes(key))
      fail(`create.${key} cannot be set on a replacement task.`);
  if (
    typeof task.title !== "string" ||
    !task.title.trim() ||
    task.title.length > 240
  )
    fail("Title must contain 1–240 characters.");
  Object.assign(task, {
    status: "planned",
    supersedes: old.id,
    statusAuthority: "database",
    needsReview: false,
    createdAt: at,
    updatedAt: at,
  });
  const edges =
    create.requires !== undefined
      ? requiresEdges(data, create.requires, id)
      : data.edges
          .filter(
            (e) => e.to === old.id && ["requires", "sequence"].includes(e.kind),
          )
          .map((e) => ({
            id: `${e.from}:${e.kind}:${id}`,
            from: e.from,
            to: id,
            kind: e.kind,
            ...(e.condition ? { condition: e.condition } : {}),
            reason: `Copied from superseded task ${old.id}.`,
          }));
  data.tasks.push(task);
  data.edges.push(...edges);
  old.supersededBy = id;
  old.status = SUPERSEDED_STATUS.id;
  old.supersededAt = at;
  if (operator) old.supersededByOperator = operator;
  if (typeof input.reason === "string" && input.reason.trim())
    old.supersedeReason = input.reason.trim().slice(0, 2000);
  old.statusAuthority = "database";
  old.updatedAt = at;
  if (!data.statuses.some((s) => s.id === SUPERSEDED_STATUS.id))
    data.statuses.push({ ...SUPERSEDED_STATUS });
  refuseResolvedCycle(data);
  return { superseded: old, task };
}
