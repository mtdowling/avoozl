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

// The Avoozl worker (RC14.4, rc-14.3). Its dispatch is the label hand-over it
// has today; its sessions are opened by Avoozl's own driver, not here. Its
// pull requests do not use Radar's merge path. Local integration counts as
// done as well as a merged pull request (design D19).
// shortcut: frozen, upgrade only for security, bugs and compatibility
export const workerAdapter = Object.freeze({
  ...issueRadarAdapter,
  usesMergePath: false,
  readState(input) {
    const read = issueRadarAdapter.readState(input);
    return input?.integrated === true && read.state !== "merged"
      ? { ...read, state: "integrated" }
      : read;
  },
  countsAsDone: (state) =>
    state?.state === "merged" || state?.state === "integrated",
});

const adapters = new Map([
  ["issue-radar", issueRadarAdapter],
  ["worker", workerAdapter],
]);

// shortcut: the remote adapter arrives in Phase 15; until then a coder
// without an adapter gets the label hand-over it has today.
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

// The coder a task goes to (RC14.5). A task already handed over (`held`) and
// still open keeps the coder it was handed to; every other task uses the
// repository's current coder.
// shortcut: an open issue counts as in flight; upgrade if a coder can leave an
// issue open after its pull request merged.
export function coderForTask({ held, current, open = true }) {
  const kept = Boolean(held) && open && held !== current;
  return { coder: kept ? held : current, kept, held: Boolean(held) && open };
}
