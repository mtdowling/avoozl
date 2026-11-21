import type { Snapshot, Task } from "./types.ts";

export function isArchivedTask(data: Pick<Snapshot, "statuses">, task: Task) {
  return Boolean(
    task.archivedAt ||
      data.statuses?.some((s) => s.archived && s.id === task.status),
  );
}
export function isHistoricalTask(data: Snapshot, task: Task) {
  if (isArchivedTask(data, task)) return true;
  const doc = data.documents[task.source?.document ?? ""];
  return Boolean(
    task.tags?.includes("historical") ||
      doc?.historical ||
      doc?.plan?.status === "abandoned",
  );
}
