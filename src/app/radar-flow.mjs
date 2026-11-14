// Flow from GitHub data (RC8.5, design D10): Ready to Claim, Claim to PR, PR
// to green, green to merge, and flow efficiency, for the issues crews have
// finished. The times are GitHub's (radar-events.mjs); the arithmetic is
// flow-github.mjs. Reads only. The reading is cached, since each issue costs
// a few GitHub calls.
import { flowFromEvents } from "./flow-github.mjs";
import { flowTimes, readIssueFacts } from "./radar-events.mjs";
import { READY_LABEL_DEFAULT } from "./github-policy.mjs";

export const FLOW_INTERVAL_MS = 10 * 60 * 1000;
// shortcut: the latest 20 closed issues carrying the ready label. An issue
// whose ready label was removed is not found; read the repository's merged
// pull requests instead if that leaves the view too thin.
export const FLOW_LIMIT = 20;
const META = "radarFlow";

// One repository's finished issues as flow rows: closed, with a merged pull
// request the claim named. An issue with no pull request is not a delivery.
async function readRows(github, repository, settings) {
  const label = settings.managedLabels?.ready ?? READY_LABEL_DEFAULT,
    issues = (
      await github.listIssues(repository, { state: "closed", label })
    ).slice(-FLOW_LIMIT),
    rows = [];
  for (const { number } of issues) {
    const facts = await readIssueFacts(github, repository, number, settings);
    if (facts.pull?.merged_at) rows.push(flowTimes(facts));
  }
  return rows;
}

export async function refreshFlow(
  store,
  github,
  policy,
  { now = Date.now(), force = false } = {},
) {
  const old = store.getMeta(META) ?? { readAt: null, repositories: {} };
  if (!policy?.mode || !github) return old;
  if (!force && old.readAt && now - Date.parse(old.readAt) < FLOW_INTERVAL_MS)
    return old;
  const next = { readAt: new Date(now).toISOString(), repositories: {} };
  for (const [repository, settings] of Object.entries(
    policy.repositories || {},
  )) {
    if (settings.coder !== "issue-radar") continue;
    try {
      next.repositories[repository] = {
        rows: await readRows(github, repository, settings),
        error: null,
      };
    } catch (error) {
      next.repositories[repository] = {
        rows: old.repositories?.[repository]?.rows ?? [],
        error: `GitHub could not be read: ${error.message}`,
      };
    }
  }
  store.setMeta(META, next);
  return next;
}

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
    errors: entries
      .filter(([, entry]) => entry.error)
      .map(([repository, entry]) => ({ repository, error: entry.error })),
    repositories: entries.map(([repository]) => repository),
    interval: FLOW_INTERVAL_MS,
  };
}
