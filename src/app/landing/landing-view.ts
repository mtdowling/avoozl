// What waits to land and what landed (Home's Landing queue and Recently
// landed, task home-radar-layout). Read from the landing queue table only:
// no GitHub call, no git, so Home never waits on either.
import { pausedBy, type QueueEntry, taskIds } from "./landing-queue.ts";
import type { Store } from "../store/store.ts";

const TABLE = "landing_queue";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const LANDED_LIMIT = 20;

const prHref = (repository: string | null, pr: number | null) =>
  repository && Number.isInteger(pr) && /^[\w.-]+\/[\w.-]+$/.test(repository)
    ? `https://github.com/${repository}/pull/${pr}`
    : null;

// Why a queued portion has not landed yet: a stop pauses it, the head
// lands on the next tick, and the rest wait behind the portions before them.
function heldReason(store: Store, entry: QueueEntry, position: number) {
  const stop = pausedBy(store, entry);
  if (stop?.label) return "Paused: a stop label is on its spec issue.";
  if (stop)
    return `Paused by a line stop${typeof stop.reason === "string" && stop.reason ? `: ${stop.reason}` : ""}.`;
  if (position === 0) return "Next to land; checks run on the next tick.";
  return position === 1 ? "Behind 1 portion." : `Behind ${position} portions.`;
}

export function landingView(
  store: Store,
  data: { tasks?: { id: string; title?: string }[] } | null | undefined,
  { now = Date.now() } = {},
) {
  const titles = new Map(
    (data?.tasks ?? []).map((t) => [t.id, t.title ?? t.id]),
  );
  const repositories = new Map(
    store
      .list<{ id: string; github?: string | null }>("repositories")
      .map((p) => [p.id, p.github ?? null]),
  );
  const row = (entry: QueueEntry) => {
    const repository = repositories.get(entry.repositoryId) ?? null,
      pr = Number.isInteger(entry.pr) ? (entry.pr as number) : null;
    return {
      key: entry.id,
      base: entry.base,
      repository,
      tasks: taskIds(entry).map((id) => ({
        id,
        title: titles.get(id) ?? id,
      })),
      pr,
      url: prHref(repository, pr),
    };
  };
  const entries = store.list<QueueEntry>(TABLE);
  const lines = new Map<string, QueueEntry[]>();
  for (const entry of entries.filter((e) => e.state === "queued")) {
    const key = `${entry.repositoryId}\0${entry.base}`;
    lines.set(key, [...(lines.get(key) ?? []), entry]);
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
    .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)));
  const since = new Date(now - WEEK_MS).toISOString();
  return {
    queue,
    landed: landed
      .slice(0, LANDED_LIMIT)
      .map((entry) => ({ ...row(entry), at: entry.finishedAt })),
    landedThisWeek: landed.filter((e) => String(e.finishedAt) >= since).length,
  };
}
