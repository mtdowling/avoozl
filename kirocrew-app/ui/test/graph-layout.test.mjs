// Runs under node's type stripping: `node --test kirocrew-app/ui/test`.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COLUMN_GAP,
  MARGIN,
  NODE_HEIGHT,
  NODE_WIDTH,
  edgePath,
  fitView,
  ASPECT,
  SPACING,
  adaptiveSpacing,
  documentEpic,
  layoutGraph,
  lineage,
  nodeClick,
  neighbors,
  nodeState,
  waves,
  zoomAt,
} from '../src/graph-layout.ts'

const task = (id, extra = {}) => ({
  id,
  title: 'Task ' + id,
  epic: 'e1',
  kind: 'leaf',
  authority: 'local',
  route: 'local',
  completion: 'integrated',
  repository: null,
  status: 'planned',
  complete: false,
  ready: false,
  decision: null,
  issue: null,
  ...extra,
})
const edge = (from, to, extra = {}) => ({
  from,
  to,
  kind: 'requires',
  condition: null,
  blocking: true,
  satisfied: false,
  ...extra,
})

// e1: a -> b -> d, a -> c -> d; e2: x waits on b; a supports edge is ignored.
const graph = {
  revision: 1,
  epics: [
    { id: 'e1', title: 'First', count: 4 },
    { id: 'e2', title: 'Second', count: 1 },
  ],
  statuses: [],
  repositories: [],
  total: 6,
  tasks: [
    task('a', { state: 'done', complete: true }),
    task('b', { state: 'ready', ready: true }),
    task('c', { state: 'running' }),
    task('d', { state: 'waiting' }),
    task('x', {
      epic: 'e2',
      state: 'needs-you',
      authority: 'github',
      issue: { number: 7, url: 'https://github.com/o/r/issues/7', repository: 'o/r' },
    }),
    task('loose', { epic: null, state: 'deferred' }),
  ],
  edges: [
    edge('a', 'b', { satisfied: true }),
    edge('a', 'c', { satisfied: true }),
    edge('b', 'd'),
    edge('c', 'd', { kind: 'sequence' }),
    edge('b', 'x'),
    edge('a', 'loose', { kind: 'supports', blocking: false }),
  ],
}

const column = (n) => (n - 1) * (NODE_WIDTH + COLUMN_GAP) + MARGIN

// True when segment p-q enters the inside of the box (Liang-Barsky clip).
// Touching an edge, as a route does at its own ends, does not count.
function entersBox([x1, y1], [x2, y2], box, inset = 0.5) {
  const left = box.x + inset
  const right = box.x + NODE_WIDTH - inset
  const top = box.y + inset
  const bottom = box.y + NODE_HEIGHT - inset
  let t0 = 0
  let t1 = 1
  const dx = x2 - x1
  const dy = y2 - y1
  for (const [p, q] of [
    [-dx, x1 - left],
    [dx, right - x1],
    [-dy, y1 - top],
    [dy, bottom - y1],
  ]) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return false
  }
  return t1 - t0 > 1e-9
}

function assertClean(layout) {
  for (const e of layout.edges)
    for (let i = 0; i + 1 < e.points.length; i++)
      for (const node of layout.nodes)
        assert.ok(
          !entersBox(e.points[i], e.points[i + 1], node),
          `edge ${e.from}->${e.to} segment ${i} passes under ${node.id}`,
        )
  const boxes = layout.nodes
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const apart =
        a.x + NODE_WIDTH <= b.x || b.x + NODE_WIDTH <= a.x || a.y + NODE_HEIGHT <= b.y || b.y + NODE_HEIGHT <= a.y
      assert.ok(apart, `${a.id} overlaps ${b.id}`)
    }
  for (const node of layout.nodes) {
    assert.ok(node.x >= 0 && node.x + NODE_WIDTH <= layout.width, `${node.id} inside width`)
    assert.ok(node.y >= 0 && node.y + NODE_HEIGHT <= layout.height, `${node.id} inside height`)
  }
}

// A seeded generator for a Nupp-sized plan: 141 tasks in 7 epics and 130
// blocking edges, a third of them across epics, and many tasks with none.
function nuppSized(seed = 7) {
  let state = seed
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
  const tasks = []
  for (let i = 0; i < 141; i++) tasks.push(task(`t${i}`, { epic: `e${Math.floor(i / 21)}` }))
  const edges = []
  const seen = new Set()
  while (edges.length < 130) {
    const to = 1 + Math.floor(random() * 140)
    const sameEpic = random() < 0.66
    const base = Math.floor(to / 21) * 21
    const from = sameEpic && to > base ? base + Math.floor(random() * (to - base)) : Math.floor(random() * to)
    const key = `${from}-${to}`
    // Leave about a third of the tasks without edges, as Nupp's are.
    if (seen.has(key) || from % 3 === 2 || to % 3 === 2) continue
    seen.add(key)
    edges.push(edge(`t${from}`, `t${to}`))
  }
  return {
    ...graph,
    epics: Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, title: `Epic ${i}`, count: 21 })),
    total: 141,
    tasks,
    edges,
  }
}

test('a wave is one more than the highest wave a task waits on', () => {
  assert.deepEqual(Object.fromEntries(waves(graph)), { a: 1, b: 2, c: 2, d: 3, x: 3, loose: 1 })
})

test('a cycle is cut so the layout still finishes, with no edge under a node', () => {
  const cyclic = { ...graph, tasks: [task('p'), task('q'), task('r')], edges: [edge('p', 'q'), edge('q', 'r'), edge('r', 'p')] }
  const w = waves(cyclic)
  assert.equal(w.size, 3)
  const layout = layoutGraph(cyclic)
  assert.equal(layout.edges.length, 3)
  assertClean(layout)
})

test('nodes sit in columns by rank, and only blocking edges are drawn', () => {
  const layout = layoutGraph(graph)
  const at = Object.fromEntries(layout.nodes.map((n) => [n.id, n]))
  assert.equal(at.a.x, column(1))
  assert.equal(at.b.x, column(2))
  assert.equal(at.c.x, column(2))
  assert.equal(at.d.x, column(3))
  assert.equal(at.x.x, column(3))
  assert.deepEqual(Object.fromEntries(layout.nodes.map((n) => [n.id, n.state])), {
    a: 'done',
    b: 'ready',
    c: 'running',
    d: 'waiting',
    x: 'needs-you',
    loose: 'deferred',
  })
  assert.deepEqual(
    layout.edges.map((e) => `${e.from}->${e.to}`),
    ['a->b', 'a->c', 'b->d', 'c->d', 'b->x'],
  )
  assert.equal(layout.waves, 3)
  // A task with no blocking edge goes to the grid, labelled by its epic.
  assert.equal(at.loose.loose, true)
  assert.deepEqual(layout.loose.map((g) => [g.title, g.count]), [['No epic', 1]])
  assert.ok(at.loose.y > Math.max(at.a.y, at.b.y, at.c.y, at.d.y, at.x.y))
  // Each epic's nodes in a column share one box; one box per epic is labelled.
  assert.deepEqual(
    layout.clusters.filter((c) => c.label).map((c) => c.title),
    ['First', 'Second'],
  )
  assertClean(layout)
})

test('routes leave the source on the right and reach the target on the left', () => {
  const chain = {
    ...graph,
    tasks: [task('a'), task('b'), task('c'), task('d')],
    edges: [edge('a', 'b'), edge('b', 'c'), edge('a', 'd'), edge('c', 'd')],
  }
  const layout = layoutGraph(chain)
  const at = Object.fromEntries(layout.nodes.map((n) => [n.id, n]))
  const long = layout.edges.find((e) => e.from === 'a' && e.to === 'd')
  assert.deepEqual(long.points[0], [at.a.x + NODE_WIDTH, at.a.y + NODE_HEIGHT / 2])
  assert.deepEqual(long.points.at(-1), [at.d.x, at.d.y + NODE_HEIGHT / 2])
  // It spans columns, so it runs out, along a row gutter, and in.
  assert.equal(long.points.length, 6)
  assertClean(layout)
  assert.match(edgePath([[0, 0], [10, 5]]), /^M0,0 L10,5$/)
})

test('a chain runs straight across', () => {
  const chain = { ...graph, tasks: [task('a'), task('b'), task('c')], edges: [edge('a', 'b'), edge('b', 'c')] }
  const ys = new Set(layoutGraph(chain).nodes.map((n) => n.y))
  assert.equal(ys.size, 1)
})

test('a collapsed epic is one node and its edges join without self loops', () => {
  const layout = layoutGraph(graph, new Set(['e1']))
  const epic = layout.nodes.find((n) => n.id === 'epic:e1')
  assert.deepEqual(epic.members, { total: 4, done: 1 })
  // The most urgent member state colors it: c is running.
  assert.equal(epic.state, 'running')
  assert.deepEqual(
    layout.edges.map(({ from, to, kind, satisfied }) => ({ from, to, kind, satisfied })),
    [{ from: 'epic:e1', to: 'x', kind: 'requires', satisfied: false }],
  )
  assert.equal(layout.clusters.find((c) => c.epic === 'e1').collapsed, true)
})

test('a merged edge is met only when every edge it stands for is met', () => {
  const two = {
    ...graph,
    tasks: [task('a'), task('b'), task('x', { epic: 'e2' })],
    edges: [edge('a', 'x', { satisfied: true }), edge('b', 'x')],
  }
  assert.equal(layoutGraph(two, new Set(['e1'])).edges[0].satisfied, false)
})

test('a Nupp-sized graph has no edge under a node and fewer crossings than the naive order', () => {
  const big = nuppSized()
  assert.equal(big.edges.length, 130)
  const layout = layoutGraph(big)
  const naive = layoutGraph(big, new Set(), { naive: true })
  assert.equal(layout.nodes.length, 141)
  assert.equal(layout.edges.length, 130)
  assertClean(layout)
  assert.ok(
    layout.crossings < naive.crossings,
    `sweeps leave ${layout.crossings} crossings, the naive order ${naive.crossings}`,
  )
  // Unconnected tasks fill rows, not one column.
  const looseRows = new Set(layout.nodes.filter((n) => n.loose).map((n) => n.y))
  const looseCount = layout.nodes.filter((n) => n.loose).length
  assert.ok(looseCount > 0 && looseRows.size < looseCount)
  const folded = layoutGraph(big, new Set(big.tasks.map((t) => t.epic)))
  assert.equal(folded.nodes.length, 7)
  assertClean(folded)
})

test('the layout is smaller than with the v2 spacing, and a source sits just before what waits on it', () => {
  const big = nuppSized()
  const v2 = { nodeWidth: 200, nodeHeight: 48, columnGap: 72, rowGap: 12, margin: 16, clusterLabel: 18, clusterGap: 30 }
  const dense = layoutGraph(big)
  const loose = layoutGraph(big, new Set(), { spacing: v2 })
  assert.ok(dense.width < loose.width && dense.height < loose.height, `${dense.width}x${dense.height} vs ${loose.width}x${loose.height}`)
  assertClean(dense)
  // p waits on nothing and only r (column 3) waits on it: p goes to column 2.
  const late = { ...graph, tasks: [task('a'), task('b'), task('p'), task('r')], edges: [edge('a', 'b'), edge('b', 'r'), edge('p', 'r')] }
  const at = Object.fromEntries(layoutGraph(late).nodes.map((n) => [n.id, n]))
  assert.equal(at.p.x, column(2))
  assert.equal(at.r.x, column(3))
})

test('lineage walks upstream and downstream', () => {
  const { up, down } = lineage(graph.edges.filter((e) => e.blocking), 'b')
  assert.deepEqual([...up], ['a'])
  assert.deepEqual([...down].sort(), ['d', 'x'])
})

test('older backends without a state still get one', () => {
  assert.equal(nodeState(task('a', { complete: true })), 'done')
  assert.equal(nodeState(task('a', { decision: 'pick' })), 'needs-you')
  assert.equal(nodeState(task('a', { status: 'blocked' })), 'needs-you')
  assert.equal(nodeState(task('a', { status: 'deferred' })), 'deferred')
  assert.equal(nodeState(task('a', { status: 'running' })), 'running')
  assert.equal(nodeState(task('a', { ready: true })), 'ready')
  assert.equal(nodeState(task('a')), 'waiting')
})

test('details list what a task waits on and what it blocks', () => {
  assert.deepEqual(neighbors(graph, 'd'), {
    waitsOn: [
      { id: 'b', title: 'Task b', satisfied: false, condition: null },
      { id: 'c', title: 'Task c', satisfied: false, condition: null },
    ],
    blocks: [],
  })
  assert.deepEqual(neighbors(graph, 'b').blocks, [
    { id: 'd', title: 'Task d' },
    { id: 'x', title: 'Task x' },
  ])
})

test('zoom keeps the point under the cursor and stays in bounds', () => {
  const view = zoomAt({ x: 0, y: 0, scale: 1 }, 2, 100, 50)
  assert.deepEqual(view, { scale: 2, x: -100, y: -50 })
  assert.equal(zoomAt({ x: 0, y: 0, scale: 1 }, 100, 0, 0).scale, 3)
  assert.equal(zoomAt({ x: 0, y: 0, scale: 1 }, 0.001, 0, 0).scale, 0.1)
})

test('fit shrinks a wide layout to the box and never enlarges a small one', () => {
  const layout = layoutGraph(graph)
  assert.equal(fitView(layout, layout.width * 10, layout.height * 10).scale, 1)
  assert.ok(fitView(layout, layout.width / 2, layout.height * 10).scale <= 0.5)
})

// Every segment is level or upright, and none runs through a cell.
function assertOrthogonal(layout) {
  for (const e of layout.edges)
    for (let i = 0; i + 1 < e.points.length; i++) {
      const [[x1, y1], [x2, y2]] = [e.points[i], e.points[i + 1]]
      assert.ok(x1 === x2 || y1 === y2, `edge ${e.from}->${e.to} segment ${i} is diagonal`)
    }
}

test('routes are orthogonal and stay in the gutters', () => {
  for (const layout of [layoutGraph(graph), layoutGraph(nuppSized())]) {
    assertOrthogonal(layout)
    assertClean(layout)
  }
})

test('a tall wave wraps into more columns, bringing the shape nearer the canvas', () => {
  // One source and 60 tasks that wait on it: one wave of 60.
  const tasks = [task('s'), ...Array.from({ length: 60 }, (_, i) => task(`w${i}`))]
  const fan = { ...graph, tasks, edges: tasks.slice(1).map((t) => edge('s', t.id)) }
  const wrapped = layoutGraph(fan)
  const tall = layoutGraph(fan, new Set(), { rows: 60 })
  const off = (l) => Math.abs(Math.log(l.width / l.height / ASPECT))
  assert.ok(wrapped.rows < 60)
  assert.ok(off(wrapped) < off(tall), `${wrapped.width}x${wrapped.height} vs ${tall.width}x${tall.height}`)
  // The wave's tasks share rows across its columns, all after the source.
  const at = Object.fromEntries(wrapped.nodes.map((n) => [n.id, n]))
  assert.ok(new Set(tasks.slice(1).map((t) => at[t.id].x)).size > 1)
  assert.ok(tasks.slice(1).every((t) => at[t.id].x > at.s.x))
  assertOrthogonal(wrapped)
  assertClean(wrapped)
})

test("an epic's tasks in a column form one block", () => {
  const layout = layoutGraph(nuppSized())
  // Each (column, epic) pair is one unbroken run: one box.
  const boxes = new Map()
  for (const c of layout.clusters) {
    const key = `${c.x}:${c.epic}`
    boxes.set(key, (boxes.get(key) ?? 0) + 1)
  }
  assert.ok([...boxes.values()].every((n) => n === 1))
})

test('unconnected collapsed epics share one grid instead of one row each', () => {
  const tasks = Array.from({ length: 30 }, (_, i) => task(`t${i}`, { epic: `e${i}` }))
  const layout = layoutGraph({ ...graph, epics: [], tasks, edges: [] }, new Set(tasks.map((t) => t.epic)))
  assert.ok(new Set(layout.nodes.map((n) => n.y)).size < 30)
  assert.equal(layout.loose.length, 0)
  assertClean(layout)
})

test('a document epic is named by its spec folder or path', () => {
  assert.equal(documentEpic('doc:.kiro/specs/compression/design.md'), 'compression')
  assert.equal(documentEpic('doc:todo/nupp-runtime.md'), 'todo/nupp-runtime')
  assert.equal(documentEpic('W1'), 'W1')
})

test('a click opens a task, expands a collapsed epic, and a drag is not a click', () => {
  assert.equal(nodeClick({}, false), 'open')
  assert.equal(nodeClick({ members: { total: 2, done: 0 } }, false), 'drill')
  assert.equal(nodeClick({}, true), 'none')
})

test('fewer shown tasks get wider gaps, smoothly; many keep the compact grid', () => {
  const counts = [1, 3, 5, 8, 12, 20, 40, 80, 141, 600, 4000]
  const gaps = counts.map((n) => adaptiveSpacing(n))
  for (let i = 1; i < gaps.length; i++) {
    assert.ok(gaps[i].columnGap <= gaps[i - 1].columnGap, `columns at ${counts[i]}`)
    assert.ok(gaps[i].rowGap <= gaps[i - 1].rowGap, `rows at ${counts[i]}`)
    // Never below the compact grid.
    assert.ok(gaps[i].columnGap >= SPACING.columnGap)
  }
  assert.ok(adaptiveSpacing(5).columnGap > adaptiveSpacing(141).columnGap)
  assert.ok(adaptiveSpacing(5).rowGap > adaptiveSpacing(141).rowGap)
  // No jump: one more task never moves a gap by more than a small share of it.
  for (let n = 1; n < 200; n++) {
    const now = adaptiveSpacing(n).columnGap
    assert.ok(now - adaptiveSpacing(n + 1).columnGap <= now * 0.15 + 1, `step at ${n}`)
  }
  // The full plan stays as compact as before.
  assert.equal(adaptiveSpacing(4000).columnGap, SPACING.columnGap)
  // Boxes never change size.
  assert.equal(adaptiveSpacing(1).nodeWidth, SPACING.nodeWidth)
  assert.equal(adaptiveSpacing(1).nodeHeight, SPACING.nodeHeight)
  // More room allows a little more.
  assert.ok(adaptiveSpacing(5, 1600).columnGap >= adaptiveSpacing(5, 700).columnGap)
})

test('a few-task graph drawn with wider gaps keeps lines out of boxes', () => {
  const small = layoutGraph(graph, new Set(), { spacing: adaptiveSpacing(graph.tasks.length) })
  assertClean(small)
  const compact = layoutGraph(graph)
  assert.ok(small.width > compact.width, 'wider gaps spread the drawing')
  const big = nuppSized()
  assertClean(layoutGraph(big, new Set(), { spacing: adaptiveSpacing(big.tasks.length) }))
})
