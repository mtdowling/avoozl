export const NODE_W = 250;
export const NODE_H = 106;
const COLUMN = 320;
const ROW = 210;

// Collapse cycles before assigning depth. Cycle members remain individually
// visible, with their return edges routed outside the dependency layers.
export function dependencyLayout(nodes, links, group = () => "") {
  const ids = new Set(nodes.map((n) => n.id));
  const next = new Map(nodes.map((n) => [n.id, []]));
  const parents = new Map(nodes.map((n) => [n.id, []]));
  for (const e of links) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.kind === "supports") continue;
    next.get(e.from).push(e.to);
    parents.get(e.to).push(e.from);
  }
  let index = 0;
  const indices = new Map(),
    low = new Map(),
    stack = [],
    active = new Set();
  const components = [],
    component = new Map();
  function visit(id) {
    indices.set(id, index);
    low.set(id, index++);
    stack.push(id);
    active.add(id);
    for (const child of next.get(id)) {
      if (!indices.has(child)) {
        visit(child);
        low.set(id, Math.min(low.get(id), low.get(child)));
      } else if (active.has(child))
        low.set(id, Math.min(low.get(id), indices.get(child)));
    }
    if (low.get(id) !== indices.get(id)) return;
    const members = [];
    let member;
    do {
      member = stack.pop();
      active.delete(member);
      component.set(member, components.length);
      members.push(member);
    } while (member !== id);
    components.push(members.reverse());
  }
  for (const n of nodes) if (!indices.has(n.id)) visit(n.id);
  const depths = new Map();
  function depth(c) {
    if (depths.has(c)) return depths.get(c);
    let value = 0;
    for (const id of components[c])
      for (const parent of parents.get(id)) {
        const p = component.get(parent);
        if (p !== c) value = Math.max(value, depth(p) + components[p].length);
      }
    depths.set(c, value);
    return value;
  }
  const layers = [];
  components.forEach((members, c) =>
    members.forEach((id, i) => {
      (layers[depth(c) + i] ??= []).push(nodes.find((n) => n.id === id));
    }),
  );
  const order = new Map();
  for (const layer of layers) {
    layer.sort(
      (a, b) =>
        String(group(a)).localeCompare(String(group(b))) ||
        a.id.localeCompare(b.id),
    );
    layer.forEach((n, i) => order.set(n.id, i));
  }
  // Alternating barycenter sweeps keep branches near their prerequisites.
  for (let sweep = 0; sweep < 6; sweep++) {
    const descending = sweep % 2 === 0;
    for (const layer of descending ? layers : [...layers].reverse()) {
      const adjacent = descending ? parents : next;
      const center = (n) => {
        const neighbors = adjacent.get(n.id);
        return neighbors.length
          ? neighbors.reduce((sum, id) => sum + order.get(id), 0) /
              neighbors.length
          : order.get(n.id);
      };
      layer.sort(
        (a, b) => center(a) - center(b) || order.get(a.id) - order.get(b.id),
      );
      layer.forEach((n, i) => order.set(n.id, i));
    }
  }
  const columns = Math.max(3, Math.ceil(Math.sqrt(nodes.length * 1.1)));
  const width = Math.min(columns, Math.max(0, ...layers.map((l) => l.length)));
  let row = 0;
  return Object.fromEntries(
    layers.flatMap((layer) => {
      const firstRow = row;
      row += Math.ceil(layer.length / columns);
      return layer.map((n, i) => [
        n.id,
        {
          x:
            ((i % columns) +
              (width -
                Math.min(
                  columns,
                  layer.length - Math.floor(i / columns) * columns,
                )) /
                2) *
            COLUMN,
          y: (firstRow + Math.floor(i / columns)) * ROW,
        },
      ]);
    }),
  );
}

function roundedPath(points) {
  let path = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const before = Math.hypot(b.x - a.x, b.y - a.y);
    const after = Math.hypot(c.x - b.x, c.y - b.y);
    if (!before || !after) continue;
    const r = Math.min(12, before / 2, after / 2);
    path += ` L${b.x + ((a.x - b.x) * r) / before},${b.y + ((a.y - b.y) * r) / before} Q${b.x},${b.y} ${b.x + ((c.x - b.x) * r) / after},${b.y + ((c.y - b.y) * r) / after}`;
  }
  const end = points.at(-1);
  return path + ` L${end.x},${end.y}`;
}

export function dependencyRoute(edge, positions, links = []) {
  const a = positions[edge.from],
    b = positions[edge.to];
  if (!a || !b) return [];
  const outgoing = links
    .filter((e) => e.from === edge.from)
    .sort((e, f) => (positions[e.to]?.x ?? 0) - (positions[f.to]?.x ?? 0));
  const incoming = links
    .filter((e) => e.to === edge.to)
    .sort((e, f) => (positions[e.from]?.x ?? 0) - (positions[f.from]?.x ?? 0));
  const port = (list) =>
    NODE_W / 2 +
    (list.indexOf(edge) - (list.length - 1) / 2) *
      Math.min(16, 160 / Math.max(1, list.length));
  const from = { x: a.x + port(outgoing), y: a.y + NODE_H };
  const to = { x: b.x + port(incoming), y: b.y };
  const middle = (from.y + to.y) / 2;
  if (to.y > from.y && to.y - from.y <= ROW) {
    return [from, { x: from.x, y: middle }, { x: to.x, y: middle }, to];
  }
  const all = Object.values(positions);
  const left = Math.min(...all.map((p) => p.x)) - 45;
  const right = Math.max(...all.map((p) => p.x)) + NODE_W + 45;
  const side = from.x + to.x < left + right ? left : right;
  const lane = side + (side === left ? -1 : 1) * (links.indexOf(edge) % 5) * 12;
  return [
    from,
    { x: from.x, y: from.y + 30 },
    { x: lane, y: from.y + 30 },
    { x: lane, y: to.y - 30 },
    { x: to.x, y: to.y - 30 },
    to,
  ];
}

export function dependencyPath(edge, positions, links) {
  const points = dependencyRoute(edge, positions, links);
  return points.length ? roundedPath(points) : "";
}
