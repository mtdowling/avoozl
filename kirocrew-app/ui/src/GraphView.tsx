import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { graphSummary, safeHref, viewsClient, type GraphTask, noSessionLabel } from './views-api.ts'
import {
  backLabel,
  drillCrumbs,
  drillLabel,
  popDrill,
  pushDrill,
  pushFilter,
  type DrillEntry,
  drillGraph,
  documentEpic,
  type Drill,
  NODE_HEIGHT,
  NODE_WIDTH,
  STATES,
  edgePath,
  epicKey,
  fitView,
  layoutGraph,
  lineage,
  neighbors,
  nodeClick,
  nodeState,
  zoomAt,
  type LaidNode,
  type NodeState,
  type View,
  adaptiveSpacing,
} from './graph-layout.ts'
import { Authority } from './Authority.tsx'
import { useRead } from './useRead.ts'
import { useTaskDrawer } from './drawer-context.ts'
import { FilterBar, useSharedFilter } from './FilterBar.tsx'
import { filterChoices, filterGraph } from './filters.ts'
import { IconLabel, SectionHeading, TipBtn, ViewHeading } from './controls.tsx'
import { ArrowLeft, Plus, RefreshCw } from './icons.ts'
import { useNav, useRemembered } from './NavHistory.tsx'
import { linkHref } from './views-api.ts'

// Graphs larger than this open with every epic collapsed to one node.
const COLLAPSE_ABOVE = 60
const CANVAS_HEIGHT = 640

// Theme variables only, so the drawing follows light and dark mode.
const STATE_COLOR: Record<NodeState, string> = {
  ready: 'var(--accent)',
  running: 'var(--tile-purple, var(--aim))',
  waiting: 'var(--border)',
  'needs-you': 'var(--danger)',
  done: 'var(--ok)',
  deferred: 'var(--muted)',
}
const STATE_LABEL = Object.fromEntries(STATES.map((s) => [s.id, s.label])) as Record<NodeState, string>

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + '…' : text)

// A key on a focusable SVG element acts like a button press.
const pressed = (event: KeyboardEvent, action: () => void) => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}

// The owner on a node: the issue as a link for a github task, else its
// authority. Same rule as the Authority badge in the other views.
function NodeOwner({ task, x, y }: { task: GraphTask; x: number; y: number }) {
  if (task.authority !== 'github')
    return (
      <text x={x} y={y} textAnchor="end" fontSize={10} style={{ fill: 'var(--muted)' }}>
        {task.authority ?? 'local'}
      </text>
    )
  const href = task.issue ? safeHref(task.issue.url) : null
  const label = !task.issue ? 'pending' : task.issue.number ? `#${task.issue.number}` : 'GitHub'
  const text = (
    <text x={x} y={y} textAnchor="end" fontSize={10} style={{ fill: href ? 'var(--accent)' : 'var(--muted)' }}>
      {label}
    </text>
  )
  return href ? (
    <a href={linkHref(href)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`Issue ${label}`}>
      {text}
    </a>
  ) : (
    text
  )
}

function Node(props: {
  node: LaidNode
  selected: boolean
  dim: boolean
  onSelect: (node: LaidNode) => void
  onHover: (id: string | null) => void
}) {
  const { node, selected } = props
  const color = STATE_COLOR[node.state]
  const sub = node.members
    ? `${node.members.done} of ${node.members.total} done`
    : `${node.id} · ${STATE_LABEL[node.state]}`
  const label = node.members
    ? `Epic ${node.title}, collapsed, ${sub}. Press to show only this epic.`
    : `${node.title}, ${node.id}, ${STATE_LABEL[node.state]}${node.task?.review ? ', waits for review' : ''}${node.task?.planArchived ? ', archived plan' : ''}${node.task?.handSetReview ? ', review set by hand, none running' : ''}`
  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={node.members ? undefined : selected}
      data-node={node.id}
      onClick={() => props.onSelect(node)}
      onKeyDown={(e) => pressed(e, () => props.onSelect(node))}
      onPointerEnter={() => props.onHover(node.id)}
      onPointerLeave={() => props.onHover(null)}
      onFocus={() => props.onHover(node.id)}
      onBlur={() => props.onHover(null)}
      opacity={props.dim ? 0.3 : 1}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      <title>{node.title}</title>
      <rect
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={6}
        strokeWidth={selected ? 2.5 : 1}
        strokeDasharray={node.members ? '5 3' : undefined}
        style={{ fill: 'var(--card)', stroke: selected ? 'var(--accent)' : color }}
      />
      <rect width={5} height={NODE_HEIGHT} rx={3} style={{ fill: color }} />
      <text x={12} y={15} fontSize={11} fontWeight={600} style={{ fill: 'var(--text)' }}>
        {clip(node.title, node.task?.review ? 19 : 25)}
      </text>
      {node.task?.review && (
        <text x={NODE_WIDTH - 6} y={14} textAnchor="end" fontSize={9} data-review-badge style={{ fill: 'var(--muted)' }}>
          review
        </text>
      )}
      <text x={12} y={29} fontSize={10} style={{ fill: 'var(--muted)' }}>
        {clip(sub, node.task ? 20 : 28)}
      </text>
      {node.task && <NodeOwner task={node.task} x={NODE_WIDTH - 6} y={29} />}
    </g>
  )
}

function Legend() {
  return (
    <ul aria-label="Node colors" className="flex flex-wrap gap-3 text-xs text-muted">
      {STATES.map((state) => (
        <li key={state.id} className="flex items-center gap-1">
          <svg width={10} height={10} aria-hidden="true">
            <rect width={10} height={10} rx={2} style={{ fill: STATE_COLOR[state.id] }} />
          </svg>
          {state.label}
        </li>
      ))}
      <li>Solid arrow: waiting · faded arrow: met · dashed arrow: sequence</li>
    </ul>
  )
}

function Details(props: { task: GraphTask; neighbors: ReturnType<typeof neighbors>; onSelect: (id: string) => void }) {
  const { task } = props
  const drawer = useTaskDrawer()
  const { waitsOn, blocks } = props.neighbors
  const state = nodeState(task)
  return (
    <Card>
      <div aria-label="Task details" role="region">
        <SectionHeading
          title={task.title}
          actions={
            <>
              <TipBtn tooltip="Open this task's details in the drawer" onClick={() => drawer.openTask(task.id)}>All details</TipBtn>
              <TipBtn tooltip="Add a draft task that waits on this one" onClick={() => drawer.addTask({ prerequisite: task.id })}>Add a task after this</TipBtn>
            </>
          }
        />
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-xs text-muted">{task.id}</span>
          <Badge>{task.kind}</Badge>
          <Authority owner={task} />
          <Badge variant={task.complete ? 'success' : undefined}>{task.status ?? 'no status'}</Badge>
          <Badge variant={state === 'needs-you' ? 'warning' : state === 'ready' ? 'info' : undefined}>
            {STATE_LABEL[state]}
          </Badge>
          {task.review && <Badge>review</Badge>}
          {task.planArchived && <Badge>Archived</Badge>}
          {task.handSetReview && <Badge variant="warning">set by hand</Badge>}
        </div>
        {task.handSetReview && (
          <p className="mt-1 text-sm" data-hand-set-review>
            {noSessionLabel(task.noSession)}.{task.nextAction ? ` Next: ${task.nextAction}` : ''} All details has Discuss, Mark done and Back to planned.
          </p>
        )}
        <dl className="mt-2 grid gap-1 text-sm" style={{ gridTemplateColumns: 'max-content 1fr', columnGap: 12 }}>
          {task.repository && (
            <>
              <dt className="text-muted">Repository</dt>
              <dd>{task.repository}</dd>
            </>
          )}
          <dt className="text-muted">Route</dt>
          <dd>{task.route}</dd>
          <dt className="text-muted">Done when</dt>
          <dd>{task.completion}</dd>
          {task.decision && (
            <>
              <dt className="text-muted">Decision</dt>
              <dd>{task.decision}</dd>
            </>
          )}
          <dt className="text-muted">Waits on</dt>
          <dd>
            {waitsOn.length === 0
              ? 'nothing'
              : waitsOn.map((item, i) => (
                  <span key={item.id}>
                    {i > 0 && ', '}
                    <button type="button" className="underline" onClick={() => props.onSelect(item.id)}>
                      {item.id}
                    </button>{' '}
                    <span className="text-muted">({item.satisfied ? 'met' : 'waiting'})</span>
                  </span>
                ))}
          </dd>
          <dt className="text-muted">Blocks</dt>
          <dd>
            {blocks.length === 0
              ? 'nothing'
              : blocks.map((item, i) => (
                  <span key={item.id}>
                    {i > 0 && ', '}
                    <button type="button" className="underline" onClick={() => props.onSelect(item.id)}>
                      {item.id}
                    </button>
                  </span>
                ))}
          </dd>
        </dl>
      </div>
    </Card>
  )
}

export default function GraphView({
  workspaceId,
  focus = null,
  drill = null,
  onDrill,
}: {
  workspaceId: string | null
  focus?: string | null
  drill?: Drill | null
  onDrill?: (drill: Drill | null) => void
}) {
  const api = useAppApi()
  const client = useMemo(() => viewsClient(api), [api])
  const drawer = useTaskDrawer()
  const [filter, setFilter] = useSharedFilter(workspaceId)
  const load = useCallback((id: string) => client.graph(id), [client])
  const { value: full, error, busy, reload } = useRead(workspaceId, load)
  // The shared filter, then the drill-in, decide what is drawn.
  const graph = useMemo(() => (full ? drillGraph(filterGraph(full, filter), drill) : null), [full, filter, drill])
  const choices = useMemo(() => filterChoices(full), [full])
  // null until the reader chooses: big graphs then start collapsed.
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null)
  useEffect(() => setCollapsed(null), [drill])
  const nav = useNav()
  // Kept while another tab is open, so Back returns to the same level,
  // selection, zoom and pan.
  const [selected, setSelected] = useRemembered<string | null>('graph-selected', null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [view, setView] = useRemembered<View>('graph-view', { x: 0, y: 0, scale: 1 })
  const [returning] = useState(() => nav.memory.has('graph-stack'))
  const canvas = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null)
  const moved = useRef(false)

  const epicKeys = useMemo(
    () => [...new Set((graph?.tasks ?? []).map((t) => t.epic ?? '(none)'))],
    [graph],
  )
  const shut = useMemo(
    () => collapsed ?? new Set(!drill && (graph?.tasks.length ?? 0) > COLLAPSE_ABOVE ? epicKeys : []),
    [collapsed, graph, epicKeys, drill],
  )
  // The canvas width, for the gaps; a resize recomputes them.
  const [canvasWidth, setCanvasWidth] = useState(1100)
  // Gaps follow how many tasks are shown, so filters, drill-in and Focus
  // all respace the drawing.
  const spacing = useMemo(() => adaptiveSpacing(graph?.tasks.length ?? 0, canvasWidth), [graph, canvasWidth])
  const layout = useMemo(() => (graph ? layoutGraph(graph, shut, { spacing }) : null), [graph, shut, spacing])
  const byId = useMemo(() => new Map(layout?.nodes.map((n) => [n.id, n]) ?? []), [layout])
  const task = graph?.tasks.find((t) => t.id === selected) ?? null
  const summary = graph ? graphSummary(graph) : null
  const epicTitle = (epic: string | null) => {
    if (!epic) return 'No epic'
    const title = full?.epics.find((e) => e.id === epic)?.title
    return title && title !== epic ? title : documentEpic(epic)
  }
  // The drill stack: every level left, with its zoom, pan and selection.
  // The app runs inside the Kiro Crew page (no iframe of its own), so
  // history.pushState would move the host page too. Each level is one step
  // in the page's Back history (NavHistory.tsx), which calls back() here.
  const [stack, setStack] = useRemembered<DrillEntry[]>('graph-stack', [])
  const last = useRef<DrillEntry>({ drill, view, selected })
  const backing = useRef(false)
  const restore = useRef<View | null>(returning ? view : null)
  useEffect(() => {
    const leaving = last.current
    if (backing.current) backing.current = false
    else if (leaving.drill !== drill) setStack((current) => pushDrill(current, leaving, drill))
    last.current = { drill, view, selected }
  }, [drill])
  useEffect(() => {
    last.current = { drill, view, selected }
  }, [view, selected])
  // A filter change inside a drill is a step Back undoes.
  const changeFilter = (next: typeof filter) => {
    setStack((current) => pushFilter(current, { drill, view, selected }, filter as Record<string, unknown>, next as Record<string, unknown>))
    setFilter(next)
  }
  const back = (at?: number) => {
    const popped = popDrill(stack, at)
    if (!popped) return
    const { entry } = popped
    // Jumping past several filter steps puts back the filter from before the first.
    const filterBefore = stack.slice(popped.stack.length).find((e) => e.filter)?.filter
    restore.current = entry.view
    setStack(popped.stack)
    setSelected(entry.selected)
    if (filterBefore) setFilter(filterBefore as typeof filter)
    if (entry.drill !== drill) {
      backing.current = true
      onDrill?.(entry.drill)
    } else setView(entry.view)
  }
  const backNow = useRef(back)
  backNow.current = back
  useEffect(() => {
    const handler = () => backNow.current()
    nav.handlers.set('graph', handler)
    return () => {
      if (nav.handlers.get('graph') === handler) nav.handlers.delete('graph')
    }
  }, [nav])
  useEffect(() => {
    nav.history.sync('graph', stack.length, () => ({ label: 'Back in the Graph', back: () => nav.handlers.get('graph')?.() }))
  }, [nav, stack.length])
  const drillEpic = (epic: string | null) => onDrill?.({ kind: 'epic', id: epic, title: epicTitle(epic) })

  const fit = useCallback(() => {
    if (!layout || !canvas.current) return
    // Back restores the zoom and pan of the level it returns to.
    if (restore.current) {
      setView(restore.current)
      restore.current = null
      return
    }
    setView(fitView(layout, canvas.current.clientWidth || 800, CANVAS_HEIGHT))
  }, [layout])
  // Refit when the graph or the set of collapsed epics changes.
  useEffect(fit, [fit])
  // Track the canvas width, so the gaps fit the room available.
  useEffect(() => {
    const element = canvas.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setCanvasWidth((w) => (Math.abs(w - element.clientWidth) > 40 ? element.clientWidth : w)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [layout !== null])

  // Pinch or ctrl/cmd + wheel zooms. Plain wheel still scrolls the page.
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const box = element.getBoundingClientRect()
      const factor = Math.exp(-event.deltaY * 0.01)
      setView((v) => zoomAt(v, factor, event.clientX - box.left, event.clientY - box.top))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [layout])

  const zoom = (factor: number) => {
    const width = canvas.current?.clientWidth || 800
    setView((v) => zoomAt(v, factor, width / 2, CANVAS_HEIGHT / 2))
  }
  const toggle = (key: string) => {
    const next = new Set(shut)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCollapsed(next)
  }
  // A click on a task opens it in the drawer; a click on a collapsed epic,
  // or on an epic task, drills into that epic's own sub-graph.
  const select = (node: LaidNode) => {
    const action = nodeClick(node, moved.current)
    if (action === 'drill') return drillEpic(node.epic)
    if (action !== 'open') return
    if (node.task?.kind === 'epic' && full?.tasks.some((t) => t.epic === node.id)) return drillEpic(node.id)
    setSelected(node.id)
    drawer.openTask(node.id)
  }
  const selectId = (id: string) => {
    const node = graph?.tasks.find((t) => t.id === id)
    if (node && shut.has(node.epic ?? '(none)')) toggle(node.epic ?? '(none)')
    setSelected(id)
  }
  // A task named from another tab (the Dashboard's Ready next) opens selected.
  const focused = useRef<string | null>(null)
  useEffect(() => {
    if (!graph || !focus || focused.current === focus) return
    focused.current = focus
    selectId(focus)
  }, [graph, focus])

  // Drag anywhere to pan. A drag that moves is not a click on a node.
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY, view, moved: false }
    moved.current = false
  }
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const start = drag.current
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.moved && Math.hypot(dx, dy) < 4) return
    if (!start.moved) event.currentTarget.setPointerCapture(event.pointerId)
    start.moved = moved.current = true
    setView({ ...start.view, x: start.view.x + dx, y: start.view.y + dy })
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const highlighted = (from: string, to: string) => selected !== null && (from === selected || to === selected)
  // Hover or selection lights the node, everything upstream and downstream,
  // and the edges on those paths; the rest dims.
  const active = hovered ?? selected
  const lit = useMemo(() => {
    if (!layout || !active || !byId.has(active)) return null
    const { up, down } = lineage(layout.edges, active)
    return { up: new Set([...up, active]), down: new Set([...down, active]) }
  }, [layout, active, byId])
  const nodeLit = (id: string) => !lit || lit.up.has(id) || lit.down.has(id)
  const edgeLit = (from: string, to: string) =>
    !lit || (lit.up.has(from) && lit.up.has(to)) || (lit.down.has(from) && lit.down.has(to))

  return (
    <section
      aria-labelledby="avoozl-graph-title"
      className="flex flex-col gap-3.5"
      data-graph-view
    >
      <ViewHeading id="avoozl-graph-title" view="graph">
        Graph
      </ViewHeading>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!workspaceId ? (
        <p className="text-sm text-muted">Choose a workspace in the header.</p>
      ) : (
        <FilterBar id="avoozl-graph" filter={filter} choices={choices} onChange={changeFilter}>
          <div className="flex flex-wrap gap-2">
            <IconLabel icon={RefreshCw} onClick={() => void reload()} disabled={busy}>
              Refresh
            </IconLabel>
            <IconLabel icon={Plus} tooltip="Add a draft task. It waits for your review." onClick={() => drawer.addTask()}>
              New task
            </IconLabel>
          </div>
          <p role="status" className="mt-2 text-sm text-muted">
            {busy
              ? 'Loading…'
              : summary
                ? `${summary.tasks} of ${full!.total} tasks · ${summary.blocking} blocking edges · ${summary.ready} ready · ${layout?.waves ?? 0} waves`
                : ''}
          </p>
        </FilterBar>
      )}
      {graph && graph.total === 0 && (
        <p className="text-sm text-muted">No tasks yet. Store and approve a plan in the Plans tab to fill the graph.</p>
      )}
      {layout && layout.nodes.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            {stack.length > 0 && (
              <>
                <IconLabel icon={ArrowLeft} tooltip={backLabel(stack) ?? undefined} onClick={() => back()} aria-label={backLabel(stack) ?? 'Back'}>
                  Back
                </IconLabel>
                <nav aria-label="Graph drill-in" className="flex flex-wrap items-center gap-1 text-sm" data-graph-crumbs>
                  {drillCrumbs(stack, drill).map(({ at, label }) => (
                    <span key={at} className="inline-flex items-center gap-1">
                      <button type="button" className="truncate underline" style={{ maxWidth: '14rem' }} onClick={() => back(at)}>
                        {label}
                      </button>
                      <span aria-hidden="true" className="text-muted">
                        ›
                      </span>
                    </span>
                  ))}
                  <span className="truncate font-medium" aria-current="page" style={{ maxWidth: 'min(28rem, 60vw)' }}>
                    {drillLabel(drill)}
                  </span>
                </nav>
              </>
            )}
            <TipBtn tooltip="Fold each epic into one box" onClick={() => setCollapsed(new Set(epicKeys))}>Collapse all</TipBtn>
            <TipBtn tooltip="Show every task inside each epic" onClick={() => setCollapsed(new Set())}>Expand all</TipBtn>
            <span className="grow" />
            <TipBtn tooltip="Zoom out" onClick={() => zoom(1 / 1.25)} aria-label="Zoom out">
              −
            </TipBtn>
            <span className="text-xs text-muted" aria-live="polite">
              {Math.round(view.scale * 100)}%
            </span>
            <TipBtn tooltip="Zoom in" onClick={() => zoom(1.25)} aria-label="Zoom in">
              +
            </TipBtn>
            <TipBtn tooltip="Fit the whole graph in view" onClick={fit}>Fit</TipBtn>
          </div>
          <div className="mt-2">
            <Legend />
          </div>
          <div
            ref={canvas}
            className="mt-2 overflow-hidden rounded border"
            style={{ borderColor: 'var(--border)', height: CANVAS_HEIGHT, touchAction: 'none' }}
          >
            <svg
              role="group"
              aria-label="Task graph. Drag to pan; pinch or hold Ctrl or Cmd and scroll to zoom."
              width="100%"
              height={CANVAS_HEIGHT}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ cursor: 'grab', userSelect: 'none' }}
            >
              <defs>
                <marker id="avoozl-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--muted)' }} />
                </marker>
                <marker id="avoozl-arrow-on" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--accent)' }} />
                </marker>
              </defs>
              <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
                {layout.clusters.map((cluster, i) => {
                  const key = epicKey(cluster.epic)
                  return (
                    <g key={`${key}:${i}`} opacity={lit ? 0.5 : 1}>
                      <rect
                        x={cluster.x}
                        y={cluster.y}
                        width={cluster.width}
                        height={cluster.height}
                        rx={8}
                        style={{ fill: 'var(--bg-elevated)', stroke: 'var(--border)', opacity: 0.7 }}
                      />
                      {cluster.label && (
                        <text
                          x={cluster.x + 6}
                          y={cluster.y + 9}
                          fontSize={10}
                          role="button"
                          tabIndex={0}
                          aria-expanded={!cluster.collapsed}
                          aria-label={`Epic ${cluster.title}, ${cluster.count} tasks. Press to show only this epic.`}
                          onClick={() => !moved.current && drillEpic(cluster.epic)}
                          onKeyDown={(e) => pressed(e, () => drillEpic(cluster.epic))}
                          style={{ fill: 'var(--muted)', cursor: 'pointer' }}
                        >
                          {clip(cluster.title, 30)} ›
                        </text>
                      )}
                    </g>
                  )
                })}
                {layout.loose.map((group) => {
                  const key = epicKey(group.epic)
                  return (
                    <text
                      key={`loose:${key}`}
                      x={group.x}
                      y={group.y + 11}
                      fontSize={10}
                      role="button"
                      tabIndex={0}
                      aria-label={`Epic ${group.title}: ${group.count} with no dependencies. Press to show only this epic.`}
                      onClick={() => !moved.current && drillEpic(group.epic)}
                      onKeyDown={(e) => pressed(e, () => drillEpic(group.epic))}
                      style={{ fill: 'var(--muted)', cursor: 'pointer' }}
                    >
                      {clip(`${group.title} · ${group.count} with no dependencies`, group.chars)}
                    </text>
                  )
                })}
                {layout.edges.map((edge) => {
                  const on = lit !== null && edgeLit(edge.from, edge.to)
                  const dim = lit !== null && !on
                  const touches = highlighted(edge.from, edge.to)
                  return (
                    <path
                      key={`${edge.from}->${edge.to}`}
                      d={edgePath(edge.points)}
                      fill="none"
                      data-edge={`${edge.from}->${edge.to}`}
                      strokeWidth={on || touches ? 2.25 : 1.25}
                      strokeLinejoin="round"
                      strokeDasharray={edge.kind === 'sequence' ? '6 4' : undefined}
                      markerEnd={on ? 'url(#avoozl-arrow-on)' : 'url(#avoozl-arrow)'}
                      style={{
                        stroke: on ? 'var(--accent)' : 'var(--muted)',
                        opacity: dim ? 0.12 : on ? 1 : edge.satisfied ? 0.35 : 0.8,
                      }}
                    />
                  )
                })}
                {layout.nodes.map((node) => (
                  <Node
                    key={node.id}
                    node={node}
                    selected={node.id === selected}
                    dim={!nodeLit(node.id)}
                    onSelect={select}
                    onHover={setHovered}
                  />
                ))}
              </g>
            </svg>
          </div>
        </Card>
      )}
      {graph && task && (
        <Details task={task} neighbors={neighbors(graph, task.id)} onSelect={selectId} />
      )}
    </section>
  )
}
