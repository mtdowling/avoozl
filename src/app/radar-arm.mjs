// What is left of arming auto-merge on crew pull requests (RC5): the stop
// banner's list of armed pull requests, Disarm, and the merge-method rows.
// Nothing arms a pull request any more; the entries these read were written
// earlier. shortcut: retire with the rest of the Radar merge path (task 45.4).
import { fail } from "./store.mjs";

const KEY = "radarMerge";

// `{armed: {"repo#pr": time}, disarmed, methodRows, notified: [keys]}`.
const readState = (store) => ({
  armed: {},
  notified: [],
  ...(store.getMeta(KEY) || {}),
});

// Armed pull requests still open with auto-merge on, for the stop banner
// (RC5.4). Read from GitHub; a repository that cannot be read lists none.
export async function armedPullRequests(store, github) {
  const { armed, disarmed = {} } = readState(store),
    byRepository = new Map();
  for (const key of Object.keys(armed))
    if (!disarmed[key]) {
      const at = key.lastIndexOf("#"),
        list = byRepository.get(key.slice(0, at)) || [];
      list.push(Number(key.slice(at + 1)));
      byRepository.set(key.slice(0, at), list);
    }
  const out = [];
  for (const [repository, numbers] of byRepository) {
    const config = store.get("github_repositories", repository);
    if (!config) continue;
    try {
      for (const pull of await github.listPullRequests(config, {
        state: "open",
      }))
        if (numbers.includes(pull.number) && pull.auto_merge)
          out.push({
            repository,
            number: pull.number,
            armedAt: armed[`${repository}#${pull.number}`],
          });
    } catch {
      // Shown again on the next read.
    }
  }
  return { pullRequests: out };
}

// Disarm (RC5.4): a person turns auto-merge off on one armed pull request.
// The tick never arms it again.
export async function disarmPullRequest(store, github, input = {}) {
  const key = `${input.repository}#${input.pullRequest}`,
    state = readState(store),
    config = store.get("github_repositories", input.repository);
  if (!config || !state.armed[key])
    fail("Avoozl did not arm that pull request.", 404);
  const pull = await github.pullRequest(config, input.pullRequest);
  if (pull?.node_id) await github.disarmAutoMerge(config, pull.node_id);
  store.setMeta(KEY, {
    ...state,
    disarmed: { ...(state.disarmed || {}), [key]: new Date().toISOString() },
  });
  return { repository: input.repository, pullRequest: input.pullRequest };
}

// One Needs you row per repository whose merge method GitHub refuses (RC28.7).
export function mergeMethodNeedsYou(store) {
  return Object.entries(readState(store).methodRows ?? {}).map(
    ([repository, row]) => ({
      kind: "needs-human",
      reason: "merge-method",
      id: `merge-method:${repository}`,
      taskId: null,
      authority: "github",
      repository,
      link: `https://github.com/${repository}/settings`,
      title: `${repository} does not allow ${row.method} merges`,
      detail: row.detail,
      openedAt: row.at,
    }),
  );
}
