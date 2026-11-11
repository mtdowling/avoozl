export function isArchivedTask(data, task) {
  return Boolean(
    task.archivedAt ||
      data.statuses?.some((s) => s.archived && s.id === task.status),
  );
}
export function isHistoricalTask(data, task) {
  if (isArchivedTask(data, task)) return true;
  const doc =
    data.documents[task.source?.document || task.epic?.replace(/^doc:/, "")];
  return Boolean(
    task.tags?.includes("historical") ||
      doc?.historical ||
      doc?.plan?.status === "abandoned",
  );
}
export function includeHistorical(state) {
  return Boolean(
    state.historical ||
      state.tag === "historical" ||
      /(?:^|\s)(?:tag:historical|historical:true)(?:\s|$)/.test(state.q || ""),
  );
}
export function browseRows(data, tasks, { historical = false } = {}) {
  return historical
    ? tasks
    : tasks.filter((task) => !isHistoricalTask(data, task));
}
