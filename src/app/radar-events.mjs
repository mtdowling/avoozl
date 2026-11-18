// Check state of a pull request's head (RC8.2). The Issue Radar issue reads
// that Trace and Flow used went with Who codes (R91.6); In flight still reads
// checks this way (panel-view.mjs).

const FAILED = new Set([
  "failure",
  "timed_out",
  "cancelled",
  "action_required",
  "startup_failure",
]);

// The checks on the pull request's head: the latest run of each name.
// `green` is the last completion time once every one has passed.
export function checkState(runs) {
  const byName = new Map(),
    rounds = new Map();
  for (const run of runs || []) {
    rounds.set(run.name, (rounds.get(run.name) ?? 0) + 1);
    const seen = byName.get(run.name);
    if (
      !seen ||
      Date.parse(run.completed_at ?? run.started_at ?? 0) >=
        Date.parse(seen.completed_at ?? seen.started_at ?? 0)
    )
      byName.set(run.name, run);
  }
  const latest = [...byName.values()],
    done = latest.filter((run) => run.status === "completed"),
    failed = latest.filter((run) => FAILED.has(run.conclusion)),
    passed = done.length === latest.length && !failed.length;
  return {
    total: latest.length,
    done: done.length,
    failed: failed.map((run) => run.name),
    rounds: Math.max(0, ...rounds.values()),
    green:
      passed && latest.length
        ? done
            .map((run) => run.completed_at)
            .sort((a, b) => Date.parse(b) - Date.parse(a))[0]
        : null,
  };
}
