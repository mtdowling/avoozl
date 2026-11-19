// Smart release ranking (RC31, design D36). Pure: orders the candidates that
// may take a new ready label. It never makes a task eligible, never touches a
// task that already holds its label, and reads no GitHub.

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
