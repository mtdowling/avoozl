// The Graph's Frontier and Focus tree (Issue Radar's dependency views, in
// Avoozl's terms). Pure: it reads the graph.view reply the page already has
// and makes no call of its own, so node can test it.
//
// Frontier: what just unlocked (every blocker on record met) and what still
// waits. Focus tree: one task's or one spec's live chain, everything it waits
// on and everything that waits on it over edges whose blocker is not done,
// plus the root's met blockers drawn faded. Re-rooting on another node shows
// that node's own chain, so each click drills in.
import type { Graph, GraphEdge, GraphTask } from './views-api.ts'
import { nodeState, type LaidNode } from './graph-layout.ts'

export type TreeRoot = { kind: 'task' | 'spec'; id: string }

export const sameRoot = (a: TreeRoot | null | undefined, b: TreeRoot | null | undefined) =>
  Boolean(a && b && a.kind === b.kind && a.id === b.id)

// Where the Graph is: its tab, and for the Focus tree its root (null is
// the default root).
export type GraphTab = 'frontier' | 'focus' | 'all'
export interface GraphPlace {
  tab: GraphTab
  root: TreeRoot | null
}

export const samePlace = (a: GraphPlace | null | undefined, b: GraphPlace | null | undefined) =>
  Boolean(a && b && a.tab === b.tab && (a.root === b.root || sameRoot(a.root, b.root)))

// ?tree=task:<id> or ?tree=spec:<plan id> for a tree, ?graph=frontier or
// ?graph=all for the other tabs, so a view can be linked.
export const placeLink = (place: GraphPlace) =>
  place.tab === 'focus' && place.root ? `?tree=${encodeURIComponent(`${place.root.kind}:${place.root.id}`)}` : `?graph=${place.tab}`

export function parseGraphLink(search: string): GraphPlace | null {
  const query = new URLSearchParams(search)
  const match = /^(task|spec):(.{1,200})$/.exec(query.get('tree') ?? '')
  if (match) return { tab: 'focus', root: { kind: match[1] as TreeRoot['kind'], id: match[2] } }
  const tab = query.get('graph')
  return tab === 'frontier' || tab === 'focus' || tab === 'all' ? { tab, root: null } : null
}

// The host route a step can push a browser entry on: Kiro Crew's
// /apps/<name>, and nothing else (a popout's prefixed route, a test page),
// where the step stays in the page's own history.
export function urlBase(pathname: string): string | null {
  return /^\/apps\/[\w.-]+\/?$/.test(pathname) ? pathname : null
}

// The Graph's deep link to a spec's tree (?tree=spec:<plan id>); only on Kiro
// Crew's app route, the one place a link can reach the Graph.
export const specGraphHref = (pathname: string, planId: string) => {
  const base = urlBase(pathname)
  return base ? base + placeLink({ tab: 'focus', root: { kind: 'spec', id: planId } }) : null
}

const done = (task: GraphTask | undefined) => !task || nodeState(task) === 'done'

// An edge the tree draws: blocking ones, and sequence order shown dashed.
const drawn = (edge: GraphEdge) => edge.blocking || edge.kind === 'sequence'

// A live edge still holds its target back: its blocker is not done and, for
// a blocking edge, its condition is not met.
export function isLive(edge: GraphEdge, byId: Map<string, GraphTask>): boolean {
  if (!drawn(edge) || done(byId.get(edge.from))) return false
  return !edge.blocking || !edge.satisfied
}

export interface FrontierItem {
  task: GraphTask
  // Every blocker on record, met or not, and the ones still open.
  blockers: { task: GraphTask; met: boolean }[]
  waitingOn: GraphTask[]
}

// Newly unlocked: not done, at least one blocker on record, all of them met.
// Waiting: not done, at least one blocker still open. A task that never had
// a blocker is in neither list, and a draft is never newly unlocked: its
// spec is not approved. Both in the graph's own order.
export function frontier(graph: Graph): { ready: FrontierItem[]; waiting: FrontierItem[] } {
  const byId = new Map(graph.tasks.map((t) => [t.id, t]))
  const ready: FrontierItem[] = []
  const waiting: FrontierItem[] = []
  for (const task of graph.tasks) {
    if (done(task)) continue
    const blockers = graph.edges
      .filter((e) => e.blocking && e.to === task.id && byId.has(e.from))
      .map((e) => ({ task: byId.get(e.from)!, met: e.satisfied || done(byId.get(e.from)) }))
    if (!blockers.length) continue
    const waitingOn = blockers.filter((b) => !b.met).map((b) => b.task)
    if (waitingOn.length) waiting.push({ task, blockers, waitingOn })
    else if (nodeState(task) !== 'draft') ready.push({ task, blockers, waitingOn })
  }
  return { ready, waiting }
}

// The tasks a root names: one task, or every task of one spec (its plan).
export function rootTasks(graph: Graph, root: TreeRoot): string[] {
  if (root.kind === 'task') return graph.tasks.some((t) => t.id === root.id) ? [root.id] : []
  return graph.tasks.filter((t) => (t.planId ?? null) === root.id || (t.spec ?? null) === root.id).map((t) => t.id)
}

export function rootTitle(graph: Graph, root: TreeRoot): string {
  if (root.kind === 'task') return graph.tasks.find((t) => t.id === root.id)?.title ?? root.id
  return graph.plans?.find((p) => p.id === root.id)?.title ?? root.id
}

export interface FocusTree {
  // The tree as a graph layoutGraph can draw: one group, every drawn edge
  // marked blocking, `satisfied` true when the edge no longer holds back.
  graph: Graph
  roots: Set<string>
  // The roots' met blockers, drawn faded and struck through.
  ghosts: Set<string>
  live: number
}

export function focusTree(graph: Graph, root: TreeRoot): FocusTree | null {
  const roots = rootTasks(graph, root)
  if (!roots.length) return null
  const byId = new Map(graph.tasks.map((t) => [t.id, t]))
  const live = graph.edges.filter((e) => isLive(e, byId))
  const keep = new Set(roots)
  // Upstream and downstream, each on its own: a sibling of an ancestor is
  // not part of this chain.
  for (const [here, there] of [
    ['to', 'from'],
    ['from', 'to'],
  ] as const) {
    const queue = [...roots]
    const seen = new Set(roots)
    while (queue.length) {
      const at = queue.pop()!
      for (const edge of live)
        if (edge[here] === at && !seen.has(edge[there])) {
          seen.add(edge[there])
          keep.add(edge[there])
          queue.push(edge[there])
        }
    }
  }
  const ghosts = new Set<string>()
  for (const edge of graph.edges)
    if (edge.blocking && roots.includes(edge.to) && byId.has(edge.from) && !keep.has(edge.from) && !isLive(edge, byId)) ghosts.add(edge.from)
  ghosts.forEach((id) => keep.add(id))
  const edges = graph.edges
    .filter((e) => drawn(e) && keep.has(e.from) && keep.has(e.to))
    .map((e) => ({ ...e, blocking: true, satisfied: !isLive(e, byId) }))
  return {
    graph: {
      ...graph,
      groups: [{ id: null, title: '' }],
      total: keep.size,
      tasks: graph.tasks.filter((t) => keep.has(t.id)).map((t) => ({ ...t, group: null })),
      edges,
    },
    roots: new Set(roots),
    ghosts,
    live: edges.filter((e) => !e.satisfied).length,
  }
}

// The jump box: a task ID or a spec's name, exact first, then the only
// task or spec whose ID or title holds the text. Null when none or several.
export function jumpTarget(graph: Graph, text: string): TreeRoot | null {
  const want = text.trim().toLowerCase()
  if (!want) return null
  const plans = graph.plans ?? []
  const task = graph.tasks.find((t) => t.id.toLowerCase() === want)
  if (task) return { kind: 'task', id: task.id }
  const plan = plans.find((p) => [p.id, p.spec, p.title].some((name) => name?.toLowerCase() === want))
  if (plan) return { kind: 'spec', id: plan.id }
  const tasks = graph.tasks.filter((t) => t.id.toLowerCase().includes(want) || t.title.toLowerCase().includes(want))
  const specs = plans.filter((p) => [p.id, p.spec, p.title].some((name) => name?.toLowerCase().includes(want)))
  if (tasks.length + specs.length !== 1) return null
  return tasks.length ? { kind: 'task', id: tasks[0].id } : { kind: 'spec', id: specs[0].id }
}

// The drill history: each re-root is a step Back and Forward walk. `url`
// marks the steps that pushed a host history entry, so Back uses the
// browser's own Back for them and the URL stays in step.
export interface Trail {
  list: GraphPlace[]
  url: boolean[]
  at: number
}

export const EMPTY_TRAIL: Trail = { list: [], url: [], at: -1 }

export const trailPlace = (trail: Trail): GraphPlace | null => trail.list[trail.at] ?? null

// Going somewhere new drops the steps ahead, as a browser does.
export function visit(trail: Trail, place: GraphPlace, url = false): Trail {
  if (samePlace(trailPlace(trail), place)) return trail
  return { list: [...trail.list.slice(0, trail.at + 1), place], url: [...trail.url.slice(0, trail.at + 1), url], at: trail.at + 1 }
}

export function step(trail: Trail, delta: -1 | 1): Trail {
  const at = trail.at + delta
  return at < 0 || at >= trail.list.length ? trail : { ...trail, at }
}

// The browser moved to `place` (its Back or Forward): the nearest matching
// step, else a new one.
export function arrive(trail: Trail, place: GraphPlace): Trail {
  if (samePlace(trailPlace(trail), place)) return trail
  let best = -1
  trail.list.forEach((p, i) => {
    if (samePlace(p, place) && (best < 0 || Math.abs(i - trail.at) < Math.abs(best - trail.at))) best = i
  })
  return best >= 0 ? { ...trail, at: best } : visit(trail, place, true)
}

// Arrow keys move between cards: the nearest card that way, favoring the
// same row (Left, Right) or the same column (Up, Down).
export function nextNode(nodes: Pick<LaidNode, 'id' | 'x' | 'y'>[], from: string, key: string): string | null {
  const here = nodes.find((n) => n.id === from)
  if (!here) return null
  const axis = key === 'ArrowLeft' || key === 'ArrowRight' ? 'x' : key === 'ArrowUp' || key === 'ArrowDown' ? 'y' : null
  if (!axis) return null
  const sign = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1
  const other = axis === 'x' ? 'y' : 'x'
  let best: string | null = null
  let score = Infinity
  for (const node of nodes) {
    const ahead = (node[axis] - here[axis]) * sign
    if (node.id === from || ahead <= 0.5) continue
    const s = ahead + 3 * Math.abs(node[other] - here[other])
    if (s < score) {
      score = s
      best = node.id
    }
  }
  return best
}

// The short word a card shows for its state, Radar's LED labels.
export const STATE_CHIP: Record<ReturnType<typeof nodeState>, string> = {
  ready: 'RDY',
  running: 'RUN',
  waiting: 'WAIT',
  'needs-you': 'YOU',
  done: 'DONE',
  deferred: 'LATER',
  draft: 'DRAFT',
}
