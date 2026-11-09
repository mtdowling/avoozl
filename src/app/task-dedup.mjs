import { randomUUID } from "node:crypto";
import { digest, validate } from "../model.mjs";
import { activityState } from "../activity.mjs";
import { isHistoricalTask } from "../browse-model.mjs";
import {
  resolveTaskId,
  taskSourceRefs,
  normalizedTaskTitle,
  duplicateCandidates,
} from "../task-identity.mjs";
import { canonical, fail } from "./store.mjs";

export function duplicateAudit(
  data,
  { historical = false, offset = 0, limit = 40 } = {},
) {
  const groups = new Map();
  for (const task of data.tasks) {
    if (!historical && isHistoricalTask(data, task)) continue;
    const title = normalizedTaskTitle(task.title);
    if (title.length < 16) continue;
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(task);
  }
  const items = [...groups.values()]
    .filter(
      (tasks) =>
        tasks.length > 1 &&
        !tasks.every((t) =>
          tasks.every(
            (o) => o === t || t.distinctFrom?.[o.id] || o.distinctFrom?.[t.id],
          ),
        ),
    )
    .map((tasks) => ({
      match: "same-title",
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        source: t.source,
        historical: isHistoricalTask(data, t),
        hash: digest(canonical(t)),
      })),
    }));
  offset = Math.max(0, Number(offset) || 0);
  limit = Math.max(1, Math.min(100, Number(limit) || 40));
  return {
    total: items.length,
    items: items.slice(offset, offset + limit),
    offset,
    limit,
    note: "Matching names are candidates. Review source scope before merging. Archived sources retain their original statuses.",
  };
}
function rewritePresentation(value, aliases, key = "") {
  if (Array.isArray(value))
    return value.map((item) => rewritePresentation(item, aliases, key));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        rewritePresentation(v, aliases, k),
      ]),
    );
  return typeof value === "string" &&
    ["taskId", "taskIds", "selected", "node", "focusTask"].includes(key)
    ? aliases[value] || value
    : value;
}
export function mergeTasks(
  store,
  { targetId, duplicateIds, reason, expectedHashes },
  expectedRevision,
) {
  if (typeof reason !== "string" || !reason.trim())
    fail("Record why these entries are the same deliverable.");
  if (
    !Array.isArray(duplicateIds) ||
    !duplicateIds.length ||
    duplicateIds.length > 100
  )
    fail("Choose 1–100 duplicate task IDs.");
  const receiptId = "task-merge-" + randomUUID(),
    now = new Date().toISOString();
  let receipt;
  const result = store.mutate(
    "Consolidate duplicate tasks",
    (data) => {
      targetId = resolveTaskId(data, targetId);
      const target = data.tasks.find((t) => t.id === targetId);
      if (!target) fail("Canonical task not found.", 404);
      const ids = [
          ...new Set(duplicateIds.map((id) => resolveTaskId(data, id))),
        ].filter((id) => id !== targetId),
        sources = ids.map((id) => data.tasks.find((t) => t.id === id));
      if (!ids.length) return { task: target, existing: true };
      if (sources.some((t) => !t)) fail("Duplicate task not found.", 404);
      const tasks = [target, ...sources];
      for (const task of tasks) {
        if (
          !expectedHashes?.[task.id] ||
          expectedHashes[task.id] !== digest(canonical(task))
        )
          fail(
            "Task changed. Review the current duplicate candidates before merging: " +
              task.id,
            409,
          );
        if (["active", "stale", "paused"].includes(activityState(task)))
          fail(
            "Coordinate with the current worker before consolidating " +
              task.id,
            409,
          );
      }
      if (
        sources.some(
          (t) =>
            !isHistoricalTask(data, t) &&
            !isHistoricalTask(data, target) &&
            t.status !== target.status,
        )
      )
        fail(
          "Resolve different current task statuses before consolidating.",
          409,
        );
      if (
        store
          .list("runs")
          .some(
            (r) =>
              [
                "starting",
                "running",
                "waiting-input",
                "waiting-approval",
                "disconnected",
              ].includes(r.state) &&
              tasks.some((t) => t.id === resolveTaskId(data, r.taskId)),
          )
      )
        fail("A task has an unfinished agent session.", 409);
      if (
        store
          .list("batches")
          .some(
            (b) =>
              b.state !== "completed" &&
              b.taskIds?.some((id) =>
                tasks.some((t) => t.id === resolveTaskId(data, id)),
              ),
          )
      )
        fail("A task belongs to an unfinished batch.", 409);
      receipt = {
        id: receiptId,
        taskId: targetId,
        kind: "task-merge",
        at: now,
        reason,
        originalTasks: structuredClone(tasks),
        originalEdges: data.edges.filter((e) =>
          tasks.some((t) => t.id === e.from || t.id === e.to),
        ),
        duplicateIds: ids,
      };
      target.sourceReferences = taskSourceRefs(target).concat(
        sources.flatMap((t) =>
          taskSourceRefs(t).map((ref) => ({
            ...ref,
            originTaskId: ref.originTaskId || t.id,
            statusAtMerge: t.status,
            progressAtMerge: t.progressPercent ?? 0,
          })),
        ),
      );
      target.sourceReferences = taskSourceRefs(target).filter(
        (ref) => ref !== target.source,
      );
      target.contextDocuments = [
        ...new Set([
          ...(target.contextDocuments || []),
          ...target.sourceReferences.map((r) => r.document),
          ...sources.flatMap((t) => t.contextDocuments || []),
        ]),
      ];
      for (const field of ["evidence", "resources", "acceptance"])
        target[field] = [...new Set(tasks.flatMap((t) => t[field] || []))];
      for (const task of sources)
        if (task.notes?.trim() && task.notes !== target.notes)
          target.notes = [
            target.notes,
            "Merged notes from " + task.id + ":\n" + task.notes,
          ]
            .filter(Boolean)
            .join("\n\n");
      target.captureSubmissions = [
        ...(target.captureSubmissions || []),
        ...sources.flatMap((t) => [
          ...(t.captureSubmissions || []),
          ...(t.capture ? [{ ...t.capture, prompt: t.prompt }] : []),
        ]),
      ];
      target.mergeReceipts = [
        ...(target.mergeReceipts || []),
        ...sources.flatMap((t) => t.mergeReceipts || []),
        receiptId,
      ];
      target.updatedAt = now;
      data.taskAliases ??= {};
      for (const id of ids) data.taskAliases[id] = targetId;
      for (const alias of Object.keys(data.taskAliases))
        data.taskAliases[alias] = resolveTaskId(data, alias);
      data.tasks = data.tasks.filter((t) => !ids.includes(t.id));
      const edges = new Map();
      for (const edge of data.edges) {
        const next = {
          ...edge,
          from: resolveTaskId(data, edge.from),
          to: resolveTaskId(data, edge.to),
        };
        if (next.from === next.to) continue;
        const key = [next.from, next.kind, next.to].join(":");
        if (edges.has(key)) {
          const old = edges.get(key);
          old.provenance = [...(old.provenance || []), { ...edge }];
        } else
          edges.set(key, {
            ...next,
            id: key,
            ...(next.from !== edge.from || next.to !== edge.to
              ? { provenance: [edge] }
              : {}),
          });
      }
      data.edges = [...edges.values()];
      if (data.presentation)
        data.presentation = rewritePresentation(
          data.presentation,
          data.taskAliases,
        );
      const errors = validate(data);
      if (errors.length) fail(errors.join("\n"), 409);
      const graph = new Map();
      for (const e of data.edges.filter((e) =>
        ["requires", "sequence"].includes(e.kind),
      )) {
        if (!graph.has(e.from)) graph.set(e.from, []);
        graph.get(e.from).push(e.to);
      }
      const active = new Set(),
        seen = new Set();
      const visit = (id) => {
        if (active.has(id))
          fail("Consolidation would create a dependency/sequence cycle.", 409);
        if (seen.has(id)) return;
        active.add(id);
        for (const next of graph.get(id) || []) visit(next);
        active.delete(id);
        seen.add(id);
      };
      for (const task of data.tasks) visit(task.id);
      store.put("evidence", receipt);
      return { task: target, aliases: ids, receiptId };
    },
    expectedRevision,
  );
  return result;
}
export { duplicateCandidates };
