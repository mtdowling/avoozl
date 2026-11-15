// The projection's ranking step (RC31, design D36): reorders the candidates
// that may take a new ready label, and leaves a note per task for the Release
// queue. It adds no GitHub call beyond the cached open-pull-request read.
import { releaseFor } from "./radar-coder-release.mjs";
import {
  pathsOverlap,
  rankCandidates,
  unblockCounts,
} from "./release-ranking.mjs";

const META = "releaseRanking";
const BLOCKING = new Set(["requires", "sequence"]);
const HOUR = 3_600_000;

// What the Release queue shows: {taskId: {kind, reason}}.
export const rankingNotes = (store) => store.getMeta(META)?.notes ?? {};

// `eligible` is in release order (holders first, then priority, then plan
// order). `rank(item)` is the priority-label rank: ranking never crosses it.
// Returns the new order. A repository with ranking off, or no
// candidate that needs a label, keeps its order.
export async function rankEligible({
  store,
  github,
  data,
  identity,
  items,
  eligible,
  holds,
  rank,
  claimed,
  complete,
  skipPull = new Set(),
  dryRun = false,
  now = Date.now(),
}) {
  const meta = store.getMeta(META) ?? {},
    heldSince = { ...(meta.heldSince ?? {}) },
    notes = { ...(meta.notes ?? {}) },
    byId = new Map(data.tasks.map((task) => [task.id, task])),
    counts = unblockCounts(
      data.edges.filter((edge) => BLOCKING.has(edge.kind)),
      (id) => byId.has(id) && !complete(byId.get(id).status),
    ),
    out = [];
  for (const item of items) delete notes[item.task.id];
  const repositories = [...new Set(eligible.map((item) => item.config.id))];
  for (const id of repositories) {
    const list = eligible.filter((item) => item.config.id === id),
      settings = releaseFor(identity.repositories?.[id], identity.mode).ranking,
      waiting = list.filter((item) => !holds(item));
    out.push(...list.filter((item) => holds(item)));
    if (!settings.enabled || waiting.length < 1) {
      out.push(...waiting);
      continue;
    }
    // Work in flight in this repository: claimed tasks, and tasks whose
    // issue an open pull request closes.
    const flight = items
      .filter((item) => item.config.id === id && claimed(item))
      .map((item) => ({ name: `#${item.current.number} (claimed)`, item }));
    if (
      !skipPull.has(id) &&
      waiting.some((item) => item.task.paths?.length) &&
      typeof github.openPullRequests === "function"
    ) {
      const pulls = await github
        .openPullRequests(waiting[0].config)
        .catch(() => []);
      for (const pull of pulls)
        for (const ref of pull.closingIssuesReferences?.nodes ?? []) {
          const item = items.find(
            (entry) =>
              entry.config.id === id && entry.current?.number === ref.number,
          );
          if (item)
            flight.push({ name: `#${pull.number} (open pull request)`, item });
        }
    }
    const overlap = (taskId) => {
        const item = waiting.find((entry) => entry.task.id === taskId);
        if (!item.task.paths?.length) return [];
        return [
          ...new Set(
            flight
              .filter(
                (entry) =>
                  entry.item !== item &&
                  pathsOverlap(item.task.paths, entry.item.task.paths ?? []),
              )
              .map((entry) => entry.name),
          ),
        ];
      },
      hits = new Map(
        waiting.map((item) => [item.task.id, overlap(item.task.id)]),
      );
    for (const item of waiting) {
      const taskId = item.task.id;
      if (hits.get(taskId).length)
        heldSince[taskId] ??= new Date(now).toISOString();
      else delete heldSince[taskId];
    }
    // Priority labels are a person's order: rank inside each run of equal rank.
    for (let start = 0; start < waiting.length; ) {
      let end = start;
      while (
        end < waiting.length &&
        rank(waiting[end]) === rank(waiting[start])
      )
        end += 1;
      const run = waiting.slice(start, end),
        { order, notes: ranked } = rankCandidates({
          candidates: run.map((item) => item.task.id),
          unblocks: (taskId) => counts.get(taskId) ?? 0,
          overlap: (taskId) => hits.get(taskId),
          heldHours: (taskId) =>
            Math.floor((now - Date.parse(heldSince[taskId])) / HOUR),
          agingHours: settings.agingHours,
        });
      out.push(
        ...order.map((taskId) => run.find((item) => item.task.id === taskId)),
      );
      for (const [taskId, note] of ranked) notes[taskId] = note;
      start = end;
    }
  }
  if (!dryRun) store.setMeta(META, { heldSince, notes });
  return out;
}
