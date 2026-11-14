// Release engine for `coder: issue-radar` (RC4, design D6): which eligible
// tasks get the ready label this tick. Pure, so the projection and the tests
// share it. A scope is a ready label with its own capacity N.

// A repository's release settings from the policy as written (the identity
// holds it unnormalized). N is `release.capacity`, else 2 for Issue Radar,
// else the older `concurrency`, else no cap.
export function isRadarRepository(repository = {}, mode = null) {
  return (
    (repository?.coder ??
      (mode === "single-repo" ? "issue-radar" : "worker")) === "issue-radar"
  );
}

export function releaseFor(repository = {}, mode = null) {
  const input = repository.release ?? {},
    radar = isRadarRepository(repository, mode),
    capacity = Number.isSafeInteger(input.capacity)
      ? input.capacity
      : radar
        ? 2
        : Number.isSafeInteger(repository.concurrency)
          ? repository.concurrency
          : Infinity;
  return {
    capacity,
    scopes: (input.scopes ?? []).map((scope) => ({
      label: scope.label,
      capacity: Number.isSafeInteger(scope.capacity)
        ? scope.capacity
        : capacity,
    })),
  };
}

// The label a task's ready label comes from: its manifest `scope` (stored as `releaseScope`) when the
// repository's `release.scopes` names it, else the repository's ready label.
export function scopeLabelOf(task, release, readyLabel) {
  const wanted = String(task.releaseScope ?? "").toLocaleLowerCase(),
    hit = (release?.scopes ?? []).find(
      (scope) => scope.label.toLocaleLowerCase() === wanted,
    );
  return hit ? hit.label : readyLabel;
}

export function capacityOf(release, label, readyLabel) {
  if (label === readyLabel) return release.capacity;
  return release.scopes.find((scope) => scope.label === label)?.capacity;
}

// `candidates` are eligible tasks in release order: {id, label, holds,
// claimed}. `holds` means the issue is open and already carries its ready
// label. `foreign(label)` counts open ready issues no candidate owns.
// A claimed holder always keeps its label and its slot (RC4.2, RC4.3); an
// unclaimed holder keeps it while the scope has room; new labels go in order
// to the free slots. Returns the ids that carry the label after this tick.
export function planRelease({ candidates, capacity, foreign = () => 0 }) {
  const keep = new Set(),
    left = new Map(),
    take = (c) => {
      if (!left.has(c.label))
        left.set(c.label, capacity(c.label) - foreign(c.label));
      return left.get(c.label);
    };
  for (const group of [
    (c) => c.holds && c.claimed,
    (c) => c.holds && !c.claimed,
    (c) => !c.holds,
  ])
    for (const c of candidates.filter(group)) {
      const free = take(c);
      if (!(c.holds && c.claimed) && free <= 0) continue;
      left.set(c.label, free - 1);
      keep.add(c.id);
    }
  return keep;
}

// The one comment a claimed issue gets when release stops around it (RC4.3).
// It says what Avoozl did and what only Issue Radar's own pause can stop.
export const STOP_NOTICE =
  "Avoozl: release is paused for this issue's scope" +
  " (the line is stopped, or a blocker is open again)." +
  " Avoozl releases nothing new there and leaves this issue's labels as they are." +
  " It cannot stop a running crew: only Issue Radar's own pause does that." +
  " A person resumes the line in Avoozl.";
