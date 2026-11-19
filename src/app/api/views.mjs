const bounded = (value, fallback = 40) =>
  Math.max(1, Math.min(100, Number(value) || fallback));
export function planPage(store, { offset = 0, limit = 40 } = {}) {
  limit = bounded(limit);
  offset = Math.max(0, Number(offset) || 0);
  const where =
    "json_extract(body,'$.deletedAt') IS NULL AND COALESCE(json_extract(body,'$.kind'),'plan')<>'conversation'";
  const items = store.db
    .prepare(
      `SELECT id,json_extract(body,'$.title') AS title,json_extract(body,'$.state') AS state,
 json_extract(body,'$.kind') AS kind,json_extract(body,'$.revision') AS revision,json_extract(body,'$.hash') AS hash,
 json_extract(body,'$.updatedAt') AS updatedAt,json_extract(body,'$.context.repositoryId') AS repositoryId,
 json_extract(body,'$.archivedAt') AS archivedAt
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
export function recentIntegrations(store) {
  return store.db
    .prepare(
      `SELECT id,task_id AS taskId,json_extract(body,'$.runId') AS runId,state,
 json_extract(body,'$.integratedCommit') AS integratedCommit,json_extract(body,'$.integratedAt') AS integratedAt,json_extract(body,'$.branch') AS branch
 FROM integration WHERE state='integrated' ORDER BY json_extract(body,'$.integratedAt') DESC,rowid DESC LIMIT 100`,
    )
    .all();
}
