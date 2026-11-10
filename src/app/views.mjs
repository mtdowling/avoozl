import { taskIdentityIds } from "../task-identity.mjs";
const bounded = (value, fallback = 40) =>
  Math.max(1, Math.min(100, Number(value) || fallback));
export function runPage(
  store,
  { offset = 0, limit = 40, taskId, archived = false } = {},
) {
  limit = bounded(limit);
  offset = Math.max(0, Number(offset) || 0);
  if (![false, true, "all"].includes(archived))
    throw Error("archived must be true, false, or all");
  const join =
      " FROM runs LEFT JOIN meta archive ON archive.key='runArchive:'||runs.id",
    archiveWhere =
      archived === "all"
        ? ""
        : archived
          ? " AND archive.value IS NOT NULL AND archive.value<>'null'"
          : " AND (archive.value IS NULL OR archive.value='null')";
  const where =
      "json_extract(body,'$.deletedAt') IS NULL" +
      archiveWhere +
      (taskId ? " AND task_id IN (SELECT value FROM json_each(?))" : ""),
    parameters = taskId
      ? [JSON.stringify(taskIdentityIds(store.read(), taskId))]
      : [];
  const items = store.db
    .prepare(
      `SELECT id,task_id AS taskId,state,json_extract(body,'$.planId') AS planId,json_extract(body,'$.providerSessionId') AS providerSessionId,
 json_extract(body,'$.mode') AS mode,json_extract(body,'$.provider') AS provider,json_extract(body,'$.projectId') AS projectId,
 json_extract(body,'$.parentRunId') AS parentRunId,json_extract(body,'$.parentProviderSessionId') AS parentProviderSessionId,
 json_extract(body,'$.model') AS model,json_extract(body,'$.error') AS error,json_extract(body,'$.createdAt') AS createdAt,
 json_extract(archive.value,'$') AS archivedAt,json_extract(body,'$.updatedAt') AS updatedAt,json_extract(body,'$.lastObservedAt') AS lastObservedAt,
 COALESCE(json_extract(body,'$.title'),json_extract(body,'$.searchPrompt'),substr(json_extract(body,'$.prompt'),1,160),task_id) AS title
 ${join} WHERE ${where} ORDER BY CASE WHEN state IN ('starting','running','waiting-input','waiting-approval') THEN 0 ELSE 1 END,
 json_extract(body,'$.createdAt') DESC,runs.rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(...parameters, limit, offset);
  return {
    items,
    total: store.db
      .prepare(`SELECT COUNT(*) n${join} WHERE ${where}`)
      .get(...parameters).n,
    offset,
    limit,
  };
}
export function taskSessions(store, { taskId, sessionId } = {}) {
  if (typeof taskId !== "string" || !taskId) return [];
  const ids = store.db
    .prepare(
      `SELECT id FROM runs WHERE json_extract(body,'$.deletedAt') IS NULL AND
 ((?<>'' AND (id=? OR json_extract(body,'$.providerSessionId')=?)) OR
 (task_id IN (SELECT value FROM json_each(?)) AND state IN ('starting','running','waiting-input','waiting-approval')))
 ORDER BY CASE WHEN id=? OR json_extract(body,'$.providerSessionId')=? THEN 0 ELSE 1 END,
 json_extract(body,'$.createdAt') DESC,rowid DESC LIMIT 20`,
    )
    .all(
      sessionId || "",
      sessionId || "",
      sessionId || "",
      JSON.stringify(taskIdentityIds(store.read(), taskId)),
      sessionId || "",
      sessionId || "",
    );
  return ids.map(({ id }) => {
    const run = store.get("runs", id);
    return {
      id: run.id,
      taskId: run.taskId,
      providerSessionId: run.providerSessionId,
      title: run.title || run.prompt?.slice(0, 160) || run.taskId,
      state: run.state,
      provider: run.provider,
      model: run.model,
      projectId: run.projectId,
      parentRunId: run.parentRunId,
      parentProviderSessionId: run.parentProviderSessionId,
      mode: run.mode,
      createdAt: run.createdAt,
      lastObservedAt: run.lastObservedAt,
    };
  });
}
export function planPage(store, { offset = 0, limit = 40 } = {}) {
  limit = bounded(limit);
  offset = Math.max(0, Number(offset) || 0);
  const where =
    "json_extract(body,'$.deletedAt') IS NULL AND COALESCE(json_extract(body,'$.kind'),'plan')<>'conversation'";
  const items = store.db
    .prepare(
      `SELECT id,json_extract(body,'$.title') AS title,json_extract(body,'$.state') AS state,
 json_extract(body,'$.kind') AS kind,json_extract(body,'$.revision') AS revision,json_extract(body,'$.hash') AS hash,
 json_extract(body,'$.updatedAt') AS updatedAt,json_extract(body,'$.context.projectId') AS projectId
 FROM plans WHERE ${where} ORDER BY rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(limit, offset);
  return {
    items,
    total: store.db.prepare(`SELECT COUNT(*) n FROM plans WHERE ${where}`).get()
      .n,
    offset,
    limit,
  };
}
export function pendingRequests(store) {
  return store.db
    .prepare(
      "SELECT id,json_extract(body,'$.runId') AS runId,json_extract(body,'$.kind') AS kind,json_extract(body,'$.method') AS method,json_extract(body,'$.createdAt') AS createdAt FROM requests WHERE json_extract(body,'$.state')='pending' ORDER BY rowid LIMIT 100",
    )
    .all();
}
export function viewSnapshot(data) {
  return {
    ...data,
    documents: Object.fromEntries(
      Object.entries(data.documents).map(([id, { text, ...doc }]) => [
        id,
        { ...doc, textLength: text?.length || 0 },
      ]),
    ),
  };
}
export function compactEvent(event) {
  if (
    [
      "message",
      "message.delta",
      "delivery.queued",
      "delivery.updated",
      "turn.completed",
      "provider.error",
      "run.failed",
      "disconnected",
      "request.answered",
    ].includes(event.kind)
  )
    return event;
  return {
    seq: event.seq,
    runId: event.runId,
    kind: event.kind,
    at: event.at,
    tool: event.tool || event.item?.type || event.method,
    message: event.message,
    evidence: event.evidence
      ? { exitCode: event.evidence.exitCode }
      : undefined,
    request: event.request
      ? { id: event.request.id, kind: event.request.kind }
      : undefined,
  };
}

export function recentIntegrations(store) {
  return store.db
    .prepare(
      `SELECT id,task_id AS taskId,json_extract(body,'$.runId') AS runId,state,
 json_extract(body,'$.integratedCommit') AS integratedCommit,json_extract(body,'$.integratedAt') AS integratedAt,json_extract(body,'$.branch') AS branch
 FROM integration WHERE state='integrated' ORDER BY json_extract(body,'$.integratedAt') DESC,rowid DESC LIMIT 100`,
    )
    .all();
}
