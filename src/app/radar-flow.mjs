// Flow from GitHub data (RC8.5, design D10): Ready to Claim, Claim to PR, PR
// to green, green to merge, and flow efficiency, for the issues crews
// finished. Crews no longer code Avoozl's tasks (R91.6), so nothing new is
// read: the view shows rows cached before, plus every stored build
// observation. The arithmetic is flow-github.mjs.
import { flowFromEvents } from "./flow-github.mjs";
import { buildView, observationsFor } from "./build-receipt-read.mjs";
import { peekInstance } from "./instance.mjs";

export const FLOW_INTERVAL_MS = 10 * 60 * 1000;
const META = "radarFlow";

// `radar.flow`: the cached rows, computed. A repository that was never
// read is simply absent.
export function flowView(store) {
  const cache = store.getMeta(META) ?? { readAt: null, repositories: {} },
    entries = Object.entries(cache.repositories),
    rows = entries.flatMap(([repository, entry]) =>
      entry.rows.map((row) => ({ ...row, repository })),
    );
  return {
    readAt: cache.readAt,
    ...flowFromEvents(rows),
    builds: buildView([...rows, ...storedBuildRows(store, rows)], {
      instanceName: (id) =>
        id && id === peekInstance(store)?.id ? peekInstance(store).name : null,
    }),
    errors: entries
      .filter(([, entry]) => entry.error)
      .map(([repository, entry]) => ({ repository, error: entry.error })),
    repositories: entries.map(([repository]) => repository),
    interval: FLOW_INTERVAL_MS,
  };
}

// Every merged pull request with stored build observations (the tick's CI
// step reads them for any repository with buildReceipts on, §4.31) that no
// Radar row above already carries. No call.
function storedBuildRows(store, radarRows) {
  const seen = new Set(
      radarRows
        .filter((row) => row.builds?.length)
        .map(
          (row) => `${String(row.repository).toLowerCase()}#${row.pullNumber}`,
        ),
    ),
    heads = store.db
      .prepare(
        "SELECT DISTINCT repository, pr_number, head_sha FROM build_observations WHERE pr_number IS NOT NULL",
      )
      .all(),
    out = [];
  for (const { repository, pr_number: number, head_sha: head } of heads) {
    if (seen.has(`${repository}#${number}`)) continue;
    seen.add(`${repository}#${number}`);
    const builds = observationsFor(store, repository, head, number);
    if (builds.length)
      out.push({ repository, pullNumber: number, instance: null, builds });
  }
  return out;
}
