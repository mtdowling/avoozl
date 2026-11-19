// Smart release ranking (RC31, design D36). Pure: orders the candidates that
// may take a new ready label. It never makes a task eligible, never touches a
// task that already holds its label, and reads no GitHub.

const RANKING_DEFAULT = Object.freeze({ enabled: true, agingHours: 12 });
// A held task is released whatever it overlaps after this many waits.
const AGING_LIMIT = 4;

// Settings from a repository's `release.ranking` as written.
export function rankingFor(release = {}) {
  const input = release?.ranking ?? {};
  return {
    enabled: input.enabled !== false,
    agingHours:
      Number.isSafeInteger(input.agingHours) && input.agingHours >= 1
        ? input.agingHours
        : RANKING_DEFAULT.agingHours,
  };
}

// Open tasks reachable from each task over `edges` ({from, to}) that block.
// `open(id)` says whether a task still counts.
export function unblockCounts(edges, open) {
  const next = new Map();
  for (const edge of edges)
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  const counts = new Map();
  for (const id of next.keys()) {
    const seen = new Set(),
      todo = [...next.get(id)];
    while (todo.length) {
      const at = todo.pop();
      if (seen.has(at) || at === id) continue;
      seen.add(at);
      todo.push(...(next.get(at) ?? []));
    }
    counts.set(id, [...seen].filter(open).length);
  }
  return counts;
}

// The fixed part of a path before its first glob character, as segments.
const baseOf = (path) => {
  const parts = String(path)
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .split("/")
      .filter(Boolean),
    glob = parts.findIndex((part) => /[*?[{]/.test(part));
  return glob < 0 ? parts : parts.slice(0, glob);
};
// shortcut: a glob counts as its fixed directory prefix, so `src/a/*.mjs` also
// overlaps `src/a/x.ts`. Compare the globs themselves if that holds work back.
export function pathsOverlap(left = [], right = []) {
  const a = left.map(baseOf),
    b = right.map(baseOf);
  return a.some((x) =>
    b.some((y) => {
      const n = Math.min(x.length, y.length);
      return x.slice(0, n).join("/") === y.slice(0, n).join("/");
    }),
  );
}

const plural = (n) => `${n} task${n === 1 ? "" : "s"}`;

// `candidates`: ids in plan order. `unblocks(id)`: count. `overlap(id)`: names
// of what it overlaps (empty for none). `heldHours(id)`: hours it has been held
// for overlap. Returns {order, notes}: notes maps an id ranking affected to
// {kind: "next" | "held", reason}.
export function rankCandidates({
  candidates,
  unblocks = () => 0,
  overlap = () => [],
  heldHours = () => 0,
  agingHours = RANKING_DEFAULT.agingHours,
}) {
  const notes = new Map(),
    clear = [],
    held = [];
  for (const id of candidates) {
    const hits = overlap(id),
      hours = hits.length ? Math.max(0, heldHours(id)) : 0;
    if (!hits.length) clear.push(id);
    else if (hours >= AGING_LIMIT * agingHours) {
      clear.push(id);
      notes.set(id, { kind: "next", reason: `Next: waited ${hours}h.` });
    } else held.push(id);
  }
  const byUnblocks = (list) =>
    list
      .map((id, index) => ({ id, index, n: unblocks(id) }))
      .sort((x, y) => y.n - x.n || x.index - y.index);
  const order = byUnblocks(clear).map((entry) => entry.id);
  for (const entry of byUnblocks(clear))
    if (entry.n > 0 && !notes.has(entry.id))
      notes.set(entry.id, {
        kind: "next",
        reason: `Next: unblocks ${plural(entry.n)}.`,
      });
  for (const { id } of byUnblocks(held)) {
    const hours = Math.max(0, heldHours(id)),
      up = Math.floor(hours / agingHours),
      at = Math.max(0, order.length - up);
    order.splice(at, 0, id);
    notes.set(id, {
      kind: "held",
      reason: `Held: paths overlap ${overlap(id).join(", ")}; moves up in ${
        agingHours - (hours % agingHours)
      }h.`,
    });
  }
  return { order, notes };
}
