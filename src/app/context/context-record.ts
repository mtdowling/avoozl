// @ts-nocheck: typing debt
// What epic context gave each task's last session, read from the record the
// worker paths keep (workers/epic-context.mjs recordContext): the chip, the
// task read and Settings. Reads only; it holds no paths' contents, MCP
// arguments or environment values (epic-context EC9).
const META = "epicContext";

export const EPIC_CONTEXT_META = META;

export const taskContext = (store, taskId) =>
  store.getMeta(META)?.tasks?.[taskId] ?? null;

export const recentContextSessions = (store) =>
  store.getMeta(META)?.recent ?? [];

// The chip on a task row and in its drawer: **Epic context**, or **Epic
// context (brief only)** on a chat. Null when its last session got none.
export function contextChip(store, taskId) {
  const last = taskContext(store, taskId);
  if (!last?.given) return null;
  return {
    label: last.briefOnly ? "Epic context (brief only)" : "Epic context",
    sources: last.sources,
    items: last.items,
  };
}
