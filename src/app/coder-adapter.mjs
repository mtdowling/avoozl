// The coder adapter (radar-coder D19, RC14.2, RC14.3, RC14.6). One small
// object per coder with three calls. The tick, the release queue and the
// merge path call it and never a coder's name:
//   handOver({github, config, issue, label})  give the task to the coder
//   readState({issue, pulls, claimed})        what the coder has done so far
//   countsAsDone(state)                       true only for a merged pull request
// `usesMergePath` says the coder's pull requests go through Avoozl's merge
// path (conflict label, ready list, auto-merge arming).

const names = (issue) =>
  (issue?.labels ?? []).map((label) => (label.name ?? label).toString());

export const issueRadarAdapter = Object.freeze({
  usesMergePath: true,
  // Radar's crew picks up an issue that carries the ready label.
  async handOver({ github, config, issue, label }) {
    if (names(issue).includes(label)) return false;
    await github.addLabels(config, issue.number, [label]);
    return true;
  },
  readState({ issue, pulls = [], claimed = false }) {
    const merged = pulls.find((pull) => pull.merged === true || pull.merged_at),
      open = pulls.find((pull) => pull.state === "open");
    return {
      state: merged
        ? "merged"
        : open
          ? "pr-open"
          : claimed
            ? "claimed"
            : issue?.state === "closed"
              ? "closed"
              : "handed-over",
      pull: merged ?? open ?? null,
    };
  },
  // A closed issue, a finished session or a "complete" label is not done.
  countsAsDone: (state) => state?.state === "merged",
});

const adapters = new Map([["issue-radar", issueRadarAdapter]]);

// shortcut: the worker and remote adapters arrive in rc-14.3 and Phase 15;
// until then every coder without one gets the label hand-over it has today.
export function adapterFor(coder) {
  return adapters.get(coder) ?? issueRadarAdapter;
}

// Tests add a coder's adapter; the returned function removes it.
export function registerCoderAdapter(coder, adapter) {
  const before = adapters.get(coder);
  adapters.set(coder, adapter);
  return () => (before ? adapters.set(coder, before) : adapters.delete(coder));
}

// Radar's merge path runs for a repository whose coder's adapter says so.
export const usesMergePath = (coder) =>
  Boolean(adapters.get(coder)?.usesMergePath);
