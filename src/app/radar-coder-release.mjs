// Release engine (RC4, design D6): which eligible tasks are released this
// tick. Pure, so the projection and the tests share it. A scope is a ready
// label with its own capacity N.

import { rankingFor } from "./release-ranking.mjs";

// A repository's release settings from the policy as written (the identity
// holds it unnormalized). N is `release.capacity`, else no cap. The older
// `concurrency` key (Avoozl's retired local workers) is ignored.
export function releaseFor(repository = {}) {
  const input = repository.release ?? {},
    capacity = Number.isSafeInteger(input.capacity) ? input.capacity : Infinity;
  return {
    capacity,
    mode: ["step", "hold"].includes(input.mode) ? input.mode : "automatic",
    ranking: rankingFor(input),
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
// claimed, ordered, blocked}. `holds` means the issue is open and already
// carries its ready label. `foreign(label)` counts open ready issues no
// candidate owns. A claimed holder, and one an allowed person labeled by hand
// (`ordered`), always keeps its label and its slot (RC4.2, RC4.3, RC4.6); an
// unclaimed holder keeps it while the scope has room; new labels go in order
// to the free slots, except to a `blocked` task (release mode Hold, or Step
// before its click); a blocked task whose label a stranger added loses it.
// Returns the ids that carry the label after this tick.
export function planRelease({ candidates, capacity, foreign = () => 0 }) {
  const keep = new Set(),
    left = new Map(),
    take = (c) => {
      if (!left.has(c.label))
        left.set(c.label, capacity(c.label) - foreign(c.label));
      return left.get(c.label);
    };
  // A person's order never takes a slot from an issue already released; it
  // may take the scope over N.
  for (const group of [
    (c) => c.holds && c.claimed,
    (c) => c.holds && !c.claimed && !c.ordered && !(c.blocked && c.stranger),
    (c) => c.holds && !c.claimed && c.ordered,
    (c) => !c.holds && !c.blocked,
  ])
    for (const c of candidates.filter(group)) {
      const free = take(c);
      if (!(c.holds && (c.claimed || c.ordered)) && free <= 0) continue;
      left.set(c.label, free - 1);
      keep.add(c.id);
    }
  return keep;
}

// A Step click records one receipt per phase of a plan; "" is the phase of
// tasks that name none.
export const stepReceiptId = (planId, task) =>
  `release-step:${planId}:${task.phase?.id ?? ""}`;
// A person's ready label on an issue is kept as an order while it stays.
export const orderReceiptId = (repository, number) =>
  `release-order:${repository}#${number}`;
