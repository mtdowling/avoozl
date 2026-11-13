// Layered (Sugiyama-style) layout for the Graph tab, written here rather than
// taken from a library: the page bundles everything it draws, its CSP forbids
// eval and network loads, and the steps below are a few hundred lines.
//
//   1. Rank: reverse the edges that close a cycle (the plan validator refuses
//      cycles, but a collapsed group can make one), then rank each node by its
//      longest path from a node that waits on nothing.
//   2. Split each edge that spans ranks with one dummy per rank in between,
//      so a long edge passes through a slot of its own, never under a node.
//   3. Order each rank to cut crossings: barycenter sweeps down and up,
//      keeping each group's nodes together, and keep the best order seen.
//   4. Grid: every node takes one cell of a uniform grid, columns in wave
//      order. A wave with more nodes than the grid has rows wraps into more
//      columns, and the row count is chosen so the drawing's shape is close
//      to the canvas's. A short wave slides its nodes level with their
//      neighbors, keeping its order.
//   5. Route: orthogonal segments in the gutters between cells: out of the
//      source's right side, along the row gutter beside the target, and into
//      its left side. No segment crosses a cell.
//
// Tasks with no drawn edge fill the same grid under the graph, row by row
// in group order. A group is the level the Graph shows: epics at the top,
// then an epic's plans, then a plan's phases (Requirement 59.10). Kept free
// of JSX so node
// can test it directly.
import type { Graph, GraphTask } from './views-api.ts'
import { nodeState as sharedNodeState } from '../../../src/delivery-lanes.mjs'

export type NodeState = 'ready' | 'running' | 'waiting' | 'needs-you' | 'done' | 'deferred'

export const STATES: { id: NodeState; label: string }[] = [
  { id: 'ready', label: 'Ready' },
  { id: 'running', label: 'Running' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'needs-you', label: 'Needs you' },
  { id: 'done', label: 'Done' },
  { id: 'deferred', label: 'Deferred' },
]

// Sizes in SVG pixels. The page draws with SPACING; `layoutGraph` takes
// another set only so a test can compare against the looser v2 drawing.
export interface Spacing {
  nodeWidth: number
  nodeHeight: number
  columnGap: number
  rowGap: number
  margin: number
  // Room above a group's block for its label, and between blocks.
  clusterLabel: number
  clusterGap: number
}

export const SPACING: Spacing = {
  nodeWidth: 168,
  nodeHeight: 36,
  // Gutters carry the edges, and the row gutter holds a group's label.
  columnGap: 28,
  rowGap: 14,
  margin: 12,
  clusterLabel: 14,
  clusterGap: 12,
}

// The gaps for a graph showing `visible` tasks in a canvas `width` px wide.
// Many tasks keep SPACING's compact grid; few tasks (a drill-in, a Focus
// chain, a narrow filter) get wider gutters so lines are easy to follow.
// The scale falls off smoothly with the count (no step), and a wider canvas
// allows a little more. Box sizes never change, so text stays readable, and
// edges still route through the (wider) gutters.
export const FEW_TASKS = 12
export const MAX_EXTRA_GAP = 1.5
export function adaptiveSpacing(visible: number, width = 1100): Spacing {
  const few = (FEW_TASKS / (FEW_TASKS + Math.max(0, visible))) ** 2
  const room = Math.max(0.6, Math.min(1.4, width / 1100))
  const scale = 1 + MAX_EXTRA_GAP * few * room
  const grow = (value: number) => Math.round(value * scale)
  return { ...SPACING, columnGap: grow(SPACING.columnGap), rowGap: grow(SPACING.rowGap), clusterGap: grow(SPACING.clusterGap) }
}

// Width over height of the canvas the page draws into (GraphView's 640 px
// tall canvas on a typical page width).
export const ASPECT = 1.8

export const NODE_WIDTH = SPACING.nodeWidth
export const NODE_HEIGHT = SPACING.nodeHeight
export const COLUMN_GAP = SPACING.columnGap
export const ROW_GAP = SPACING.rowGap
export const MARGIN = SPACING.margin
export const CLUSTER_LABEL = SPACING.clusterLabel
export const CLUSTER_GAP = SPACING.clusterGap
const DUMMY_HEIGHT = 2
const SWEEPS = 12
const PLACE_PASSES = 8

export interface LaidNode {
  id: string
  // The task, or null for a collapsed group drawn as one node.
  task: GraphTask | null
  title: string
  group: string | null
  state: NodeState
  // The column. A node that waits on nothing sits just before the first
  // node that waits on it.
  wave: number
  x: number
  y: number
  // For a collapsed group: how many tasks it holds, and how many are done.
  members?: { total: number; done: number }
  // True for a task with no drawn edge, packed in the grid below the graph.
  loose?: boolean
}

export interface LaidEdge {
  from: string
  to: string
  kind: string
  satisfied: boolean
  // The route, source side first.
  points: [number, number][]
}

// One group's nodes in one column, drawn as a box behind them.
export interface ClusterBox {
  group: string | null
  title: string
  count: number
  collapsed: boolean
  x: number
  y: number
  width: number
  height: number
  // Only one box per group carries the label.
  label: boolean
}

// A heading over one group's unconnected tasks in the grid.
export interface LooseGroup {
  group: string | null
  title: string
  count: number
  // Where the label goes, and how many characters fit there.
  x: number
  y: number
  chars: number
}

export interface Layout {
  nodes: LaidNode[]
  edges: LaidEdge[]
  clusters: ClusterBox[]
  loose: LooseGroup[]
  waves: number
  crossings: number
  // Rows in the grid; a wave with more nodes wraps into more columns.
  rows: number
  width: number
  height: number
}

// Older backends send no `state`; the shared rule derives the same order
// from the fields they do send (src/delivery-lanes.mjs).
export const nodeState: (task: GraphTask) => NodeState = sharedNodeState

// wave = 1 + the highest wave of what a task waits on (its blocking
// prerequisites). A cycle, which the plan validator refuses, is cut at the
// edge that closes it so the count still finishes.
export function waves(graph: Graph): Map<string, number> {
  const before = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (!edge.blocking) continue
    if (!before.has(edge.to)) before.set(edge.to, [])
    before.get(edge.to)!.push(edge.from)
  }
  const wave = new Map<string, number>()
  const visiting = new Set<string>()
  const visit = (id: string): number => {
    const known = wave.get(id)
    if (known !== undefined) return known
    if (visiting.has(id)) return 0
    visiting.add(id)
    let highest = 0
    for (const from of before.get(id) ?? []) highest = Math.max(highest, visit(from))
    visiting.delete(id)
    wave.set(id, highest + 1)
    return highest + 1
  }
  for (const task of graph.tasks) visit(task.id)
  return wave
}

export const groupKey = (group: string | null) => group ?? '(none)'

// The drawn nodes (tasks, or one node per collapsed group) and the blocking
// edges between them, merged and without self loops. Each task's `group`
// and the graph's `groups` (titles, in order) come from groupGraph; a group
// with no ID is the level's "No epic", "No spec" or "No phase".
function drawnGraph(graph: Graph, collapsed: ReadonlySet<string>) {
  const groups = graph.groups ?? []
  const titles = new Map(groups.map((g) => [g.id, g.title]))
  const order = new Map(groups.map((g, i) => [g.id, i]))
  const groupTitle = (group: string | null) => titles.get(group) ?? (group === null ? 'No epic' : group)
  const members = new Map<string | null, GraphTask[]>()
  for (const task of graph.tasks) {
    const group = task.group ?? null
    if (!members.has(group)) members.set(group, [])
    members.get(group)!.push(task)
  }
  const keys = [...members.keys()].sort(
    (a, b) => (a === null ? 1e9 : (order.get(a) ?? 1e8)) - (b === null ? 1e9 : (order.get(b) ?? 1e8)),
  )
  const nodeOf = new Map<string, string>()
  const nodes: LaidNode[] = []
  for (const group of keys) {
    const tasks = members.get(group)!
    if (collapsed.has(groupKey(group))) {
      const id = `group:${groupKey(group)}`
      const states = new Set(tasks.map(nodeState))
      // The most urgent member state colors the whole group.
      const state =
        (['needs-you', 'running', 'ready', 'waiting', 'deferred', 'done'] as NodeState[]).find((s) =>
          states.has(s),
        ) ?? 'waiting'
      for (const task of tasks) nodeOf.set(task.id, id)
      nodes.push({
        id,
        task: null,
        title: groupTitle(group),
        group,
        state,
        wave: 1,
        x: 0,
        y: 0,
        members: { total: tasks.length, done: tasks.filter((t) => nodeState(t) === 'done').length },
      })
    } else
      for (const task of tasks) {
        nodeOf.set(task.id, task.id)
        nodes.push({ id: task.id, task, title: task.title, group, state: nodeState(task), wave: 1, x: 0, y: 0 })
      }
  }
  const edges: Omit<LaidEdge, 'points'>[] = []
  const byKey = new Map<string, Omit<LaidEdge, 'points'>>()
  for (const edge of graph.edges) {
    if (!edge.blocking) continue
    const from = nodeOf.get(edge.from)
    const to = nodeOf.get(edge.to)
    if (!from || !to || from === to) continue
    const key = `${from}\u0000${to}`
    const known = byKey.get(key)
    // A merged edge is met only when every edge it stands for is met.
    if (known) {
      if (!edge.satisfied) known.satisfied = false
      continue
    }
    const drawn = { from, to, kind: edge.kind, satisfied: edge.satisfied }
    byKey.set(key, drawn)
    edges.push(drawn)
  }
  return { nodes, edges, groupTitle, members }
}

// Ranks from the longest path, after reversing the edges a depth-first
// search finds closing a cycle. Every returned pair has rank(lo) < rank(hi).
function rank(ids: string[], edges: { from: string; to: string }[]) {
  const out = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const edge of edges) out.get(edge.from)!.push(edge.to)
  const state = new Map<string, 1 | 2>()
  const reversed = new Set<string>()
  for (const root of ids) {
    if (state.has(root)) continue
    // Iterative DFS: each frame is a node and the index of its next child.
    const stack: [string, number][] = [[root, 0]]
    state.set(root, 1)
    while (stack.length) {
      const frame = stack[stack.length - 1]
      const children = out.get(frame[0])!
      if (frame[1] >= children.length) {
        state.set(frame[0], 2)
        stack.pop()
        continue
      }
      const child = children[frame[1]++]
      const seen = state.get(child)
      if (seen === 1) reversed.add(`${frame[0]}\u0000${child}`)
      else if (!seen) {
        state.set(child, 1)
        stack.push([child, 0])
      }
    }
  }
  const pairs = edges.map((edge) =>
    reversed.has(`${edge.from}\u0000${edge.to}`) ? { lo: edge.to, hi: edge.from } : { lo: edge.from, hi: edge.to },
  )
  const before = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const pair of pairs) before.get(pair.hi)!.push(pair.lo)
  const ranks = new Map<string, number>()
  const visit = (start: string) => {
    const stack: [string, number][] = [[start, 0]]
    while (stack.length) {
      const frame = stack[stack.length - 1]
      const parents = before.get(frame[0])!
      if (frame[1] < parents.length) {
        const parent = parents[frame[1]++]
        if (!ranks.has(parent)) stack.push([parent, 0])
        continue
      }
      ranks.set(frame[0], 1 + Math.max(0, ...parents.map((p) => ranks.get(p) ?? 0)))
      stack.pop()
    }
  }
  for (const id of ids) if (!ranks.has(id)) visit(id)
  // Pull each node that waits on nothing to just before the first node that
  // waits on it. Longest-path ranks put every such node in column 1, which
  // made one very tall first column and long edges with a dummy per column.
  const after = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const pair of pairs) after.get(pair.lo)!.push(pair.hi)
  for (const id of ids) {
    if (before.get(id)!.length || !after.get(id)!.length) continue
    ranks.set(id, Math.min(...after.get(id)!.map((next) => ranks.get(next)!)) - 1)
  }
  return { ranks, pairs }
}

interface Item {
  id: string
  // A dummy's cluster key is its own id, so it never joins a group's block.
  cluster: string
  height: number
  rank: number
  up: string[]
  down: string[]
}

// Crossings between two adjacent ranks: inversions among their edges once
// the edges are sorted by upper end, counted by merge sort.
function inversions(values: number[]): number {
  if (values.length < 2) return 0
  const mid = values.length >> 1
  const left = values.slice(0, mid)
  const right = values.slice(mid)
  let count = inversions(left) + inversions(right)
  let i = 0
  let j = 0
  let k = 0
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) values[k++] = left[i++]
    else {
      values[k++] = right[j++]
      count += left.length - i
    }
  }
  while (i < left.length) values[k++] = left[i++]
  while (j < right.length) values[k++] = right[j++]
  return count
}

export function countCrossings(layers: string[][], items: Map<string, Item>): number {
  let total = 0
  for (let r = 0; r + 1 < layers.length; r++) {
    const below = new Map(layers[r + 1].map((id, i) => [id, i]))
    const pairs: [number, number][] = []
    layers[r].forEach((id, i) => {
      for (const next of items.get(id)!.down) pairs.push([i, below.get(next)!])
    })
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    total += inversions(pairs.map((p) => p[1]))
  }
  return total
}

// Reorder one rank by the barycenter of each item's neighbors in the fixed
// rank, keeping each group's items together: blocks go by their mean, items
// inside a block by their own. An item with no neighbor keeps its place.
function reorder(layer: string[], items: Map<string, Item>, fixed: string[], side: 'up' | 'down') {
  const at = new Map(fixed.map((id, i) => [id, i]))
  const bary = new Map<string, number>()
  layer.forEach((id, i) => {
    const near = items.get(id)![side].map((n) => at.get(n)!).filter((n) => n !== undefined)
    bary.set(id, near.length ? near.reduce((a, b) => a + b, 0) / near.length : (i / Math.max(1, layer.length - 1)) * fixed.length)
  })
  const blocks = new Map<string, number[]>()
  for (const id of layer) {
    const key = items.get(id)!.cluster
    if (!blocks.has(key)) blocks.set(key, [])
    blocks.get(key)!.push(bary.get(id)!)
  }
  const mean = new Map([...blocks].map(([key, values]) => [key, values.reduce((a, b) => a + b, 0) / values.length]))
  const index = new Map(layer.map((id, i) => [id, i]))
  return [...layer].sort((a, b) => {
    const ca = items.get(a)!.cluster
    const cb = items.get(b)!.cluster
    return (
      mean.get(ca)! - mean.get(cb)! ||
      (ca < cb ? -1 : ca > cb ? 1 : 0) ||
      bary.get(a)! - bary.get(b)! ||
      index.get(a)! - index.get(b)!
    )
  })
}

// Isotonic regression (pool adjacent violators): the positions nearest the
// wanted ones that keep `order` and at least `gaps[i]` between item i-1 and i.
function place(wanted: number[], gaps: number[]): number[] {
  const offset: number[] = []
  let sum = 0
  for (let i = 0; i < wanted.length; i++) {
    sum += i ? gaps[i] : 0
    offset.push(sum)
  }
  const blocks: { value: number; weight: number; count: number }[] = []
  wanted.forEach((value, i) => {
    blocks.push({ value: value - offset[i], weight: 1, count: 1 })
    while (blocks.length > 1 && blocks[blocks.length - 2].value > blocks[blocks.length - 1].value) {
      const last = blocks.pop()!
      const prev = blocks[blocks.length - 1]
      prev.value = (prev.value * prev.weight + last.value * last.weight) / (prev.weight + last.weight)
      prev.weight += last.weight
      prev.count += last.count
    }
  })
  const out: number[] = []
  for (const block of blocks) for (let k = 0; k < block.count; k++) out.push(block.value + offset[out.length])
  return out
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Lay the graph out. Groups in `collapsed` draw as one node; edges to and
// from their tasks attach to that node. `options.naive` skips the crossing
// sweeps, for comparison in tests.
export function layoutGraph(
  graph: Graph,
  collapsed: ReadonlySet<string> = new Set(),
  options: { naive?: boolean; looseColumns?: number; rows?: number; aspect?: number; spacing?: Spacing } = {},
): Layout {
  const {
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    columnGap: COLUMN_GAP,
    rowGap: ROW_GAP,
    margin: MARGIN,
    clusterLabel: CLUSTER_LABEL,
    clusterGap: CLUSTER_GAP,
  } = options.spacing ?? SPACING
  const columnX = (rank: number) => MARGIN + (rank - 1) * (NODE_WIDTH + COLUMN_GAP)
  const { nodes, edges, groupTitle } = drawnGraph(graph, collapsed)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]))
  const placed = nodes.filter((n) => linked.has(n.id))
  const loose = nodes.filter((n) => !linked.has(n.id))

  // 1-2. Ranks, then dummies for edges that span ranks.
  const { ranks, pairs } = rank(
    placed.map((n) => n.id),
    edges,
  )
  const items = new Map<string, Item>()
  for (const node of placed)
    items.set(node.id, {
      id: node.id,
      cluster: `group:${groupKey(node.group)}`,
      height: NODE_HEIGHT,
      rank: ranks.get(node.id)!,
      up: [],
      down: [],
    })
  const chains: string[][] = []
  pairs.forEach((pair, e) => {
    const chain = [pair.lo]
    for (let r = ranks.get(pair.lo)! + 1; r < ranks.get(pair.hi)!; r++) {
      const id = `\u0000d${e}:${r}`
      items.set(id, { id, cluster: id, height: DUMMY_HEIGHT, rank: r, up: [], down: [] })
      chain.push(id)
    }
    chain.push(pair.hi)
    for (let i = 0; i + 1 < chain.length; i++) {
      items.get(chain[i])!.down.push(chain[i + 1])
      items.get(chain[i + 1])!.up.push(chain[i])
    }
    chains.push(chain)
  })
  const depth = Math.max(0, ...[...items.values()].map((item) => item.rank))
  let layers: string[][] = Array.from({ length: depth }, () => [])
  for (const item of items.values()) layers[item.rank - 1].push(item.id)
  // Start in group order, then input order: the order a naive drawing uses.
  const first = new Map(placed.map((n, i) => [n.id, i]))
  const groupOrder = new Map<string, number>()
  for (const node of placed) if (!groupOrder.has(groupKey(node.group))) groupOrder.set(groupKey(node.group), groupOrder.size)
  const startKey = (id: string) => {
    const node = byId.get(id)
    return node ? groupOrder.get(groupKey(node.group))! * 1e6 + first.get(id)! : 1e12
  }
  for (const layer of layers) layer.sort((a, b) => startKey(a) - startKey(b))

  // 3. Barycenter sweeps; keep the order with the fewest crossings.
  let crossings = countCrossings(layers, items)
  if (!options.naive) {
    let best = layers.map((layer) => [...layer])
    for (let sweep = 0; sweep < SWEEPS && crossings > 0; sweep++) {
      const down = sweep % 2 === 0
      const next = layers.map((layer) => [...layer])
      if (down) for (let r = 1; r < next.length; r++) next[r] = reorder(next[r], items, next[r - 1], 'up')
      else for (let r = next.length - 2; r >= 0; r--) next[r] = reorder(next[r], items, next[r + 1], 'down')
      const count = countCrossings(next, items)
      layers = next
      if (count < crossings) {
        crossings = count
        best = next.map((layer) => [...layer])
      }
    }
    layers = best
  }

  // 4. Grid. Every node takes one cell of a uniform grid. A wave's nodes
  // fill its column top to bottom; a wave with more nodes than the grid has
  // rows wraps into more columns beside it. The row count is the one that
  // brings the whole drawing, unconnected tasks included, closest to the
  // canvas's shape, so a big wave never makes one very tall column.
  const cellW = NODE_WIDTH + COLUMN_GAP
  const cellH = NODE_HEIGHT + ROW_GAP
  const top = MARGIN + CLUSTER_LABEL
  const aspect = options.aspect ?? ASPECT
  const ranked = layers.map((layer) => layer.filter((id) => byId.has(id)))
  const longest = Math.max(0, ...ranked.map((layer) => layer.length))
  const looseColumnsFor = (mainColumns: number) =>
    options.looseColumns ??
    (mainColumns || Math.max(1, Math.round(Math.sqrt((loose.length * aspect * cellH) / cellW))))
  const shape = (rows: number) => {
    const columns = ranked.reduce((n, layer) => n + Math.max(1, Math.ceil(layer.length / rows)), 0)
    const looseColumns = looseColumnsFor(columns)
    const looseRows = loose.length ? Math.ceil(loose.length / looseColumns) : 0
    const width = Math.max(columns, loose.length ? Math.min(looseColumns, loose.length) : 0) * cellW
    const height = (rows + looseRows) * cellH + (looseRows && rows ? cellH : 0)
    return { columns, looseColumns, score: Math.abs(Math.log(width / Math.max(1, height) / aspect)) }
  }
  let rows = longest
  if (!options.rows)
    for (let r = 1; r <= longest; r++) if (shape(r).score < shape(rows).score - 1e-9) rows = r
  if (options.rows) rows = Math.min(longest, options.rows)
  const { columns, looseColumns } = rows ? shape(rows) : { columns: 0, looseColumns: looseColumnsFor(0) }

  // Real neighbors, for pulling a short wave's nodes level with the nodes
  // they connect to.
  const near = new Map<string, string[]>(placed.map((n) => [n.id, []]))
  for (const pair of pairs) {
    near.get(pair.lo)!.push(pair.hi)
    near.get(pair.hi)!.push(pair.lo)
  }
  const column = new Map<string, number>()
  const row = new Map<string, number>()
  let start = 0
  const short: string[][] = []
  for (const layer of ranked) {
    const wraps = Math.max(1, Math.ceil(layer.length / rows))
    layer.forEach((id, i) => {
      column.set(id, start + Math.floor(i / rows))
      row.set(id, wraps > 1 ? i % rows : i)
    })
    if (wraps === 1) short.push(layer)
    start += wraps
  }
  // A wave that fits in one column keeps its order but slides each node
  // toward the median row of its neighbors (isotonic regression on rows),
  // so chains run level and related tasks sit side by side.
  for (let pass = 0; pass < PLACE_PASSES; pass++) {
    const order = pass % 2 === 0 ? short : [...short].reverse()
    for (const layer of order) {
      const wanted = layer.map((id) => {
        const rowsNear = near.get(id)!.map((n) => row.get(n)!)
        return rowsNear.length ? median(rowsNear) : row.get(id)!
      })
      const n = layer.length
      place(
        wanted,
        layer.map(() => 1),
      ).forEach((value, i) => row.set(layer[i], Math.min(Math.max(Math.round(value), i), rows - n + i)))
    }
  }
  for (const node of placed) {
    node.wave = ranks.get(node.id)!
    node.x = MARGIN + column.get(node.id)! * cellW
    node.y = top + row.get(node.id)! * cellH
  }

  // 5. Orthogonal routes in the gutters. An edge leaves the source's right
  // side into the gutter after its column, runs along the row gutter beside
  // the target, then down the gutter before the target's column and into its
  // left side. Gutters lie between cells, so no segment crosses a node. Each
  // source and each target gets its own lane in a gutter, so edges that share
  // a gutter stay apart.
  const lanes = new Map<string, Map<string, number>>()
  const lane = (gutter: string, owner: string) => {
    if (!lanes.has(gutter)) lanes.set(gutter, new Map())
    const taken = lanes.get(gutter)!
    if (!taken.has(owner)) taken.set(owner, taken.size)
    return taken.get(owner)!
  }
  const laidEdges: LaidEdge[] = edges.map((edge) => {
    const source = byId.get(edge.from)!
    const target = byId.get(edge.to)!
    const sc = column.get(source.id)!
    const tc = column.get(target.id)!
    const sy = source.y + NODE_HEIGHT / 2
    const ty = target.y + NODE_HEIGHT / 2
    // The left half of a gutter carries edges leaving the column before it,
    // the right half edges entering the column after it.
    const step = (COLUMN_GAP / 2 - 4) / 2
    const out = source.x + NODE_WIDTH + 3 + (lane(`c${sc}:out`, source.id) % 3) * step
    const into = target.x - 3 - (lane(`c${tc - 1}:in`, target.id) % 3) * step
    if (tc === sc + 1)
      return {
        ...edge,
        points:
          sy === ty
            ? [[source.x + NODE_WIDTH, sy], [target.x, ty]]
            : [[source.x + NODE_WIDTH, sy], [out, sy], [out, ty], [target.x, ty]],
      }
    // The row gutter beside the target on the source's side.
    const above = target.y - ROW_GAP / 2
    const below = target.y + NODE_HEIGHT + ROW_GAP / 2
    const gutterY = Math.abs(sy - above) <= Math.abs(sy - below) ? above : below
    const y = gutterY + ((lane(`r${Math.round(gutterY)}`, source.id) % 3) - 1) * 3
    return {
      ...edge,
      points: [
        [source.x + NODE_WIDTH, sy],
        [out, sy],
        [out, y],
        [into, y],
        [into, ty],
        [target.x, ty],
      ],
    }
  })

  // Group boxes: each run of one group's nodes in a grid column. The label
  // sits in the row gutter above the run's first node. A collapsed group's
  // node already shows its title, so its box has no label.
  const clusters: ClusterBox[] = []
  const labelled = new Set<string>()
  const counts = new Map<string, number>()
  for (const node of nodes) counts.set(groupKey(node.group), (counts.get(groupKey(node.group)) ?? 0) + (node.members?.total ?? 1))
  const byColumn = new Map<number, LaidNode[]>()
  for (const node of placed) {
    const c = column.get(node.id)!
    if (!byColumn.has(c)) byColumn.set(c, [])
    byColumn.get(c)!.push(node)
  }
  for (const c of [...byColumn.keys()].sort((a, b) => a - b)) {
    const list = byColumn.get(c)!.sort((a, b) => a.y - b.y)
    let run: LaidNode[] = []
    const flush = () => {
      if (!run.length) return
      const key = groupKey(run[0].group)
      const folded = collapsed.has(key)
      clusters.push({
        group: run[0].group,
        title: groupTitle(run[0].group),
        count: counts.get(key) ?? run.length,
        collapsed: folded,
        x: run[0].x - 4,
        y: run[0].y - ROW_GAP + 2,
        width: NODE_WIDTH + 8,
        height: run[run.length - 1].y + NODE_HEIGHT + 2 - (run[0].y - ROW_GAP + 2),
        label: !folded && !labelled.has(key),
      })
      if (!folded) labelled.add(key)
      run = []
    }
    for (const node of list) {
      if (run.length && groupKey(run[0].group) !== groupKey(node.group)) flush()
      run.push(node)
    }
    flush()
  }

  // Unconnected tasks: the same grid under the graph, filled row by row in
  // group order, with each group's name in the gutter above its first task.
  const graphBottom = placed.length ? top + rows * cellH - ROW_GAP : 0
  const looseTop = placed.length ? graphBottom + cellH : top
  const groups: LooseGroup[] = []
  // `loose` is already in group order: drawnGraph builds nodes group by group.
  const ordered = loose
  ordered.forEach((node, i) => {
    node.loose = true
    node.wave = 0
    node.x = MARGIN + (i % looseColumns) * cellW
    node.y = looseTop + Math.floor(i / looseColumns) * cellH
    const key = groupKey(node.group)
    const last = groups[groups.length - 1]
    if (last && groupKey(last.group) === key) last.count++
    else if (!collapsed.has(key))
      groups.push({
        group: node.group,
        title: groupTitle(node.group),
        count: 1,
        x: node.x,
        y: node.y - ROW_GAP - 1,
        chars: Math.max(8, Math.floor((cellW * Math.max(1, looseColumns - (i % looseColumns)) - COLUMN_GAP) / 6)),
      })
  })
  const looseRows = ordered.length ? Math.ceil(ordered.length / looseColumns) : 0
  const used = Math.max(columns, ordered.length ? Math.min(looseColumns, ordered.length) : 0, 1)
  return {
    nodes: [...placed, ...ordered],
    edges: laidEdges,
    clusters,
    loose: groups,
    waves: depth,
    crossings,
    rows,
    width: MARGIN * 2 + used * cellW - COLUMN_GAP,
    height: Math.max(
      looseRows ? looseTop + looseRows * cellH - ROW_GAP + MARGIN : 0,
      graphBottom + MARGIN,
      MARGIN * 2,
    ),
  }
}

// What a click on a drawn node does. A press that panned the canvas is a
// drag, not a click. A collapsed group drills into its own level; a task
// opens in the drawer.
export function nodeClick(node: { members?: unknown }, dragged: boolean): 'none' | 'drill' | 'open' {
  if (dragged) return 'none'
  return node.members ? 'drill' : 'open'
}

// A drill-in (Requirement 59.10): one epic's member plans (id null is No
// epic), one plan's phases, one phase's tasks, or one task's whole upstream
// and downstream chain (Focus).
export type Drill =
  | { kind: 'epic'; id: string | null; title: string }
  | { kind: 'plan'; id: string | null; title: string }
  | { kind: 'phase'; plan: string | null; id: string | null; title: string }
  | { kind: 'focus'; id: string; title: string }

// The graph a drill-in shows: only those tasks and the edges between them.
export function drillGraph(graph: Graph, drill: Drill | null): Graph {
  if (!drill) return graph
  let keep: Set<string>
  const pick = (test: (t: GraphTask) => boolean) => new Set(graph.tasks.filter(test).map((t) => t.id))
  if (drill.kind === 'epic') keep = pick((t) => (t.epic ?? null) === drill.id)
  else if (drill.kind === 'plan') keep = pick((t) => (t.planId ?? null) === drill.id)
  else if (drill.kind === 'phase')
    keep = pick((t) => (t.planId ?? null) === drill.plan && (t.phase?.id ?? null) === drill.id)
  else {
    const { up, down } = lineage(graph.edges.filter((e) => e.blocking), drill.id)
    keep = new Set([drill.id, ...up, ...down])
  }
  return {
    ...graph,
    tasks: graph.tasks.filter((t) => keep.has(t.id)),
    edges: graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
  }
}

// An edge's route as an SVG path of straight segments.
export function edgePath(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(' ')
}

// Everything upstream (what `id` waits on, transitively) and downstream
// (what waits on it), over the drawn edges, for highlighting.
export function lineage(edges: { from: string; to: string }[], id: string): { up: Set<string>; down: Set<string> } {
  const walk = (next: (e: { from: string; to: string }) => [string, string]) => {
    const seen = new Set<string>()
    const queue = [id]
    while (queue.length) {
      const at = queue.pop()!
      for (const edge of edges) {
        const [here, there] = next(edge)
        if (here === at && !seen.has(there) && there !== id) {
          seen.add(there)
          queue.push(there)
        }
      }
    }
    return seen
  }
  return { up: walk((e) => [e.to, e.from]), down: walk((e) => [e.from, e.to]) }
}

// What a task waits on and what waits on it, for the details panel.
export function neighbors(graph: Graph, id: string) {
  const title = new Map(graph.tasks.map((t) => [t.id, t.title]))
  const blocking = graph.edges.filter((e) => e.blocking)
  return {
    waitsOn: blocking
      .filter((e) => e.to === id)
      .map((e) => ({ id: e.from, title: title.get(e.from) ?? e.from, satisfied: e.satisfied, condition: e.condition })),
    blocks: blocking.filter((e) => e.from === id).map((e) => ({ id: e.to, title: title.get(e.to) ?? e.to })),
  }
}

// Zoom by `factor` around a point given in view pixels, keeping the scale
// between `min` and `max`.
export interface View {
  x: number
  y: number
  scale: number
}

export function zoomAt(view: View, factor: number, px: number, py: number, min = 0.1, max = 3): View {
  const scale = Math.min(max, Math.max(min, view.scale * factor))
  const ratio = scale / view.scale
  return { scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio }
}

// The view that fits the whole layout in a box of the given size.
export function fitView(layout: Layout, width: number, height: number): View {
  const scale = Math.max(0.1, Math.min(1, width / layout.width, height / layout.height))
  return { scale, x: Math.max(0, (width - layout.width * scale) / 2), y: 0 }
}

// The Graph's way back out of a drill-in: each level you leave is kept with
// its zoom, pan and selection, so Back restores exactly what you saw.
export interface DrillEntry {
  drill: Drill | null
  view: View
  selected: string | null
  // A filter change made inside a drill: the filter before it. Back puts it
  // back. `searchOnly` marks a change to the search text alone, so typing a
  // word is one step, not one per key.
  filter?: Record<string, unknown>
  searchOnly?: boolean
}

const sameDrill = (a: Drill | null, b: Drill | null) => (a?.kind ?? null) === (b?.kind ?? null) && (a?.id ?? null) === (b?.id ?? null)

// A filter change inside a drill joins the Back stack; at the top level it
// does not. A run of search-text edits keeps the filter from before the run.
export function pushFilter(
  stack: DrillEntry[],
  leaving: DrillEntry,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): DrillEntry[] {
  if (!leaving.drill) return stack
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed = [...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
  if (!changed.length) return stack
  const searchOnly = changed.every((key) => key === 'q')
  const top = stack[stack.length - 1]
  if (searchOnly && top?.searchOnly && sameDrill(top.drill, leaving.drill)) return stack
  return [...stack, { ...leaving, filter: before, searchOnly }]
}

// The crumbs to draw: one per level left. A filter step stays in the stack
// (Back undoes it) but adds no crumb, since its level is the next one.
export function drillCrumbs(stack: DrillEntry[], current: Drill | null): { at: number; label: string }[] {
  return stack
    .map((entry, at) => ({ at, entry, next: at + 1 < stack.length ? stack[at + 1].drill : current }))
    .filter(({ entry, next }) => !sameDrill(entry.drill, next))
    .map(({ at, entry }) => ({ at, label: drillLabel(entry.drill) }))
}

export const drillLabel = (drill: Drill | null) =>
  !drill ? 'All tasks' : drill.kind === 'focus' ? `Focus: ${drill.title}` : drill.title

// What each level groups by (Requirement 59.10): All by epic, an epic by
// plan, a plan by phase. A phase or a Focus chain groups by plan. Each task
// gets `group`, and the graph `groups` with titles in order, None last.
export function groupGraph(graph: Graph, drill: Drill | null): Graph {
  const level = !drill ? 'epic' : drill.kind === 'epic' ? 'plan' : drill.kind === 'plan' ? 'phase' : 'plan'
  const plans = graph.plans ?? []
  const planTitle = new Map(plans.map((p) => [p.id, p.title]))
  const of = (task: GraphTask): string | null =>
    level === 'epic' ? (task.epic ?? null) : level === 'plan' ? (task.planId ?? null) : (task.phase?.id ?? null)
  const groups: { id: string | null; title: string }[] =
    level === 'epic'
      ? graph.epics.map((e) => ({ id: e.id, title: e.title }))
      : level === 'plan'
        ? plans.map((p) => ({ id: p.id, title: p.title }))
        : (plans.find((p) => p.id === (drill as { id: string | null }).id)?.phases ?? [])
            .filter((phase) => phase.id !== null)
            .map((phase) => ({ id: phase.id, title: phase.title ?? phase.id! }))
  const titleOf = (task: GraphTask) =>
    level === 'phase' ? (task.phase?.title ?? null) : level === 'plan' ? (planTitle.get(task.planId ?? '') ?? task.planId ?? null) : null
  for (const task of graph.tasks) {
    const id = of(task)
    if (id !== null && !groups.some((g) => g.id === id)) groups.push({ id, title: titleOf(task) ?? id })
  }
  groups.push({ id: null, title: level === 'epic' ? 'No epic' : level === 'plan' ? 'No spec' : 'No phase' })
  return { ...graph, groups, tasks: graph.tasks.map((task) => ({ ...task, group: of(task) })) }
}

// The level a group label drills into from `drill`: All to an epic, an
// epic to a plan, a plan to a phase. A phase and a Focus chain go no deeper
// by group; null means the click does nothing.
export function drillInto(drill: Drill | null, group: string | null, title: string): Drill | null {
  if (!drill) return { kind: 'epic', id: group, title }
  if (drill.kind === 'epic') return { kind: 'plan', id: group, title }
  if (drill.kind === 'plan') return { kind: 'phase', plan: drill.id, id: group, title }
  return null
}

// Where Back goes, for its tooltip.
export const backLabel = (stack: DrillEntry[]) => {
  const top = stack[stack.length - 1]
  if (!top) return null
  const where = top.drill ? drillLabel(top.drill) : 'all tasks'
  return top.filter ? `Back to ${where}, before the filter change` : `Back to ${where}`
}

// Going somewhere new keeps the level you leave; going to the top clears it.
export function pushDrill(stack: DrillEntry[], leaving: DrillEntry, next: Drill | null): DrillEntry[] {
  return next ? [...stack, leaving] : []
}

// Back to crumb `at` (0 is All tasks): the entry to restore and the rest.
export function popDrill(stack: DrillEntry[], at = stack.length - 1): { entry: DrillEntry; stack: DrillEntry[] } | null {
  if (at < 0 || at >= stack.length) return null
  return { entry: stack[at], stack: stack.slice(0, at) }
}

// The mouse back button and Alt+Left or Cmd+[ go back one level. Esc never does.
export const isBackButton = (event: { button: number }) => event.button === 3
export const isBackKey = (event: { key: string; altKey?: boolean; metaKey?: boolean }) =>
  (Boolean(event.altKey) && event.key === 'ArrowLeft') || (Boolean(event.metaKey) && event.key === '[')
