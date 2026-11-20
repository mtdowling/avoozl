// Ranking ready tasks (simplify §D3.1): one pure function over the waits the
// list derives (order.mjs). Keys, in order: more open tasks waiting on it,
// then a longer open chain of waits below it, then its place in the file.

// Open tasks reachable from each task over `edges` ({from, to}).
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

// The longest chain of open tasks below each task, counting the tasks on it.
export function chainLengths(edges, open) {
  const next = new Map();
  for (const edge of edges)
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  const memo = new Map(),
    depth = (id, path) => {
      if (memo.has(id)) return memo.get(id);
      let best = 0;
      for (const to of next.get(id) ?? [])
        if (!path.has(to)) {
          path.add(to);
          best = Math.max(best, (open(to) ? 1 : 0) + depth(to, path));
          path.delete(to);
        }
      memo.set(id, best);
      return best;
    };
  return (id) => depth(id, new Set([id]));
}

// `ready` in file order, ranked: [{task, unblocks, chain, position}].
// `idOf(task)` names a task; `edges` and `open` as above.
export function rankReady(ready, { edges, open, idOf = (task) => task.id }) {
  const counts = unblockCounts(edges, open),
    chain = chainLengths(edges, open);
  return ready
    .map((task, position) => ({
      task,
      unblocks: counts.get(idOf(task)) ?? 0,
      chain: chain(idOf(task)),
      position,
    }))
    .sort(
      (a, b) =>
        b.unblocks - a.unblocks || b.chain - a.chain || a.position - b.position,
    );
}

// A comparator with the same three keys, for callers that sort in place.
export function rankKeys(edges, open) {
  const counts = unblockCounts(edges, open),
    chain = chainLengths(edges, open);
  return (id) => ({ unblocks: counts.get(id) ?? 0, chain: chain(id) });
}
