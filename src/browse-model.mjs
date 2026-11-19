export function isArchivedTask(data, task) {
  return Boolean(
    task.archivedAt ||
      data.statuses?.some((s) => s.archived && s.id === task.status),
  );
}
export function isHistoricalTask(data, task) {
  if (isArchivedTask(data, task)) return true;
  const doc = data.documents[task.source?.document];
  return Boolean(
    task.tags?.includes("historical") ||
      doc?.historical ||
      doc?.plan?.status === "abandoned",
  );
}
