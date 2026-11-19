// What waits to land and what landed (Home's Landing queue and Recently
// landed, task home-radar-layout). Read from the landing queue table only:
// no GitHub call, no git, so Home never waits on either.
import { pausedBy, taskIds } from "./landing-queue.mjs";

const TABLE = "landing_queue";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const LANDED_LIMIT = 20;

const prHref = (repository, pr) =>
  repository && Number.isInteger(pr) && /^[\w.-]+\/[\w.-]+$/.test(repository)
    ? `https://github.com/${repository}/pull/${pr}`
    : null;

// Why a queued portion has not landed yet: a stop pauses it, the head
// lands on the next tick, and the rest wait behind the portions before them.
function heldReason(store, entry, position) {
  const stop = pausedBy(store, entry);
  if (stop)
    return `Paused by a line stop${typeof stop.reason === "string" && stop.reason ? `: ${stop.reason}` : ""}.`;
  if (position === 0) return "Next to land; checks run on the next tick.";
  return position === 1 ? "Behind 1 portion." : `Behind ${position} portions.`;
}

export function landingView(store, data, { now = Date.now() } = {}) {
  const titles = new Map(
    (data?.tasks ?? []).map((t) => [t.id, t.title ?? t.id]),
  );
  const repositories = new Map(
    store.list("repositories").map((p) => [p.id, p.github ?? null]),
  );
  const row = (entry) => {
    const repository = repositories.get(entry.repositoryId) ?? null,
      pr = Number.isInteger(entry.pr) ? entry.pr : null;
    return {
      key: entry.id,
      base: entry.base,
      repository,
      tasks: taskIds(entry).map((id) => ({ id, title: titles.get(id) ?? id })),
      pr,
      url: prHref(repository, pr),
    };
  };
  const entries = store.list(TABLE);
  const lines = new Map();
  for (const entry of entries.filter((e) => e.state === "queued")) {
    const key = `${entry.repositoryId}\0${entry.base}`;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(entry);
  }
  const queue = [...lines.values()].flatMap((line) =>
    line
      .sort((a, b) => a.seq - b.seq)
      .map((entry, position) => ({
        ...row(entry),
        position,
        queuedAt: entry.queuedAt ?? null,
        held: heldReason(store, entry, position),
      })),
  );
  const landed = entries
    .filter((e) => e.state === "landed" && e.finishedAt)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const since = new Date(now - WEEK_MS).toISOString();
  return {
    queue,
    landed: landed
      .slice(0, LANDED_LIMIT)
      .map((entry) => ({ ...row(entry), at: entry.finishedAt })),
    landedThisWeek: landed.filter((e) => e.finishedAt >= since).length,
  };
}
