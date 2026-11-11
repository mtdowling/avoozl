const DAY = 24 * 60 * 60 * 1000;

function updatedAt(item) {
  const parsed = Date.parse(item.updatedAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function queueItemNeedsAttention(item) {
  if (item.kind === "task") return item.attention === "approval";
  const state = String(item.state || "open").toLowerCase();
  return !["closed", "merged"].some((value) => state.includes(value));
}

export function queueItemProcessed(item) {
  if (item.processed === true || item.processedAt || item.disposition)
    return true;
  if (item.kind === "task") return false;
  return Boolean(item.taskId || item.associations?.length);
}

export function adaptiveRecentGitHubItems(
  items,
  {
    now = Date.now(),
    minPerRepository = 3,
    maxPerRepository = 6,
    maxTotal = 24,
    windowsInDays = [7, 30, 90, 365, Infinity],
  } = {},
) {
  const repositories = new Map();
  for (const item of items) {
    if (
      !["issue", "pull-request"].includes(item.kind) ||
      !queueItemNeedsAttention(item)
    )
      continue;
    const repository = item.repository || "";
    if (!repositories.has(repository)) repositories.set(repository, []);
    repositories.get(repository).push(item);
  }

  const selected = [];
  for (const repositoryItems of repositories.values()) {
    repositoryItems.sort(
      (left, right) =>
        updatedAt(right) - updatedAt(left) ||
        String(left.id).localeCompare(String(right.id)),
    );
    let recent = repositoryItems;
    for (const days of windowsInDays) {
      recent = Number.isFinite(days)
        ? repositoryItems.filter((item) => now - updatedAt(item) <= days * DAY)
        : repositoryItems;
      if (recent.length >= minPerRepository || days === Infinity) break;
    }
    selected.push(...recent.slice(0, maxPerRepository));
  }

  return selected
    .sort(
      (left, right) =>
        updatedAt(right) - updatedAt(left) ||
        String(left.id).localeCompare(String(right.id)),
    )
    .slice(0, maxTotal);
}

export function queueTriageItems(items, options) {
  const approvals = items.filter(
    (item) => item.kind === "task" && queueItemNeedsAttention(item),
  );
  return [...adaptiveRecentGitHubItems(items, options), ...approvals].sort(
    (left, right) =>
      updatedAt(right) - updatedAt(left) ||
      String(left.id).localeCompare(String(right.id)),
  );
}
