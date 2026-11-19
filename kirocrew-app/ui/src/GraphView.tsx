import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { Tooltip } from './ui/Tooltip.tsx'
import { EdgeList } from './EdgeList.tsx'
import { DRAG_SLOP } from './drag-pan.ts'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import Badge from './ui/Badge.tsx'
import { graphSummary, safeHref, viewsClient, type Graph, type GraphBatch, type GraphTask, noSessionLabel } from './views-api.ts'
import {
  backLabel,
  drillCrumbs,
  drillLabel,
  popDrill,
  pushDrill,
  pushFilter,
  type DrillEntry,
  drillGraph,
  drillInto,
  groupGraph,
  type Drill,
  NODE_HEIGHT,
  NODE_WIDTH,
  STATES,
  edgePath,
  groupKey,
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
import { EpicPanel } from './EpicPanel.tsx'
import { useRead } from './useRead.ts'
import { useTaskDrawer } from './drawer-context.ts'
import { FilterBar, useSharedFilter } from './FilterBar.tsx'
import { filterChoices, filterGraph } from './filters.ts'
import { IconLabel, SectionHeading, TipBtn, ViewHeading } from './ui/controls.tsx'
import { RefreshButton } from './RefreshButton.tsx'
import { ArrowLeft, ExternalLink, Plus } from './icons.ts'
import { useNav, useRemembered } from './NavHistory.tsx'
import { linkHref } from './views-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Box } from './ui/Box'
import { PanningStyle } from './ui/PageStyles'
import { PlainButton, SvgG, SvgPath, SvgRect, SvgRoot, SvgText } from './ui/Plain'
import { STATE_COLOR } from './ui/looks/GraphView.ts'
import { TONE } from './ui/tones.ts'

// Graphs larger than this open with every group collapsed to one node.
const COLLAPSE_ABOVE = 60
const CANVAS_HEIGHT = 640

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
      <SvgText x={x} y={y} textAnchor="end" fontSize={10} css-fill="muted">
        {task.authority ?? 'local'}
      </SvgText>
    )
  const href = task.issue ? safeHref(task.issue.url) : null
  const label = !task.issue ? 'pending' : task.issue.number ? `#${task.issue.number}` : 'GitHub'
  const text = (
    <SvgText x={x} y={y} textAnchor="end" fontSize={10} css-fill={href ? 'accent' : 'muted'}>
      {label}
    </SvgText>
  )
  return href ? (
    <a href={linkHref(href)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`Issue ${label}`}>
      {text}
    </a>
  ) : (
    text
  )
}

function Node(props: { node: LaidNode; selected: boolean; dim: boolean; onSelect: (node: LaidNode) => void; onHover: (id: string | null) => void; onOpen?: (id: string) => void }) {
  const { node, selected } = props
  const color = STATE_COLOR[node.state]
  // A task of a spec not approved yet: faded, dashed, marked Draft.
  const draft = node.state === 'draft'
  const badge = node.task?.review || draft
  const sub = node.members ? `${node.members.done} of ${node.members.total} done` : `${node.id} · ${STATE_LABEL[node.state]}`
  const label = node.members
    ? `${node.title}, collapsed, ${sub}. Press to open it.`
    : `${node.title}, ${node.id}, ${STATE_LABEL[node.state]}${node.task?.review ? ', waits for review' : ''}${node.task?.planArchived ? ', archived plan' : ''}${node.task?.handSetReview ? ', review set by hand, none running' : ''}${props.onOpen ? '. Enter shows its tree; O opens its details' : ''}`
  return (
    <SvgG
      transform={`translate(${node.x},${node.y})`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={node.members ? undefined : selected}
      data-node={node.id}
      onClick={() => props.onSelect(node)}
      onKeyDown={(e) => {
        if (node.task && props.onOpen && (e.key === 'o' || e.key === 'O' || e.key === ' ')) {
          e.preventDefault()
          props.onOpen(node.id)
        } else pressed(e, () => props.onSelect(node))
      }}
      onPointerEnter={() => props.onHover(node.id)}
      onPointerLeave={() => props.onHover(null)}
      onFocus={() => props.onHover(node.id)}
      onBlur={() => props.onHover(null)}
      opacity={props.dim ? 0.3 : draft ? 0.6 : 1}
      data-draft={draft || undefined}
      css-cursor="pointer"
      css-outline="none"
    >
      <title>{draft ? `${node.title} (draft spec)` : node.title}</title>
      <SvgRect
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={6}
        strokeWidth={selected ? 2.5 : 1}
        strokeDasharray={node.members || draft ? '5 3' : undefined}
        css-fill="card"
        css-stroke={selected ? TONE.accent : color}
      />
      <SvgRect width={5} height={NODE_HEIGHT} rx={3} css-fill={color} />
      <SvgText x={12} y={15} fontSize={11} fontWeight={600} css-fill="text">
        {clip(node.title, draft ? 17 : badge ? 19 : props.onOpen && node.task ? 22 : 25)}
      </SvgText>
      {draft && node.task && (
        <SvgText x={NODE_WIDTH - (props.onOpen ? 22 : 6)} y={14} textAnchor="end" fontSize={9} fontWeight={600} data-draft-badge css-fill="muted">
          Draft
        </SvgText>
      )}
      {node.task?.review && !draft && (
        <SvgText x={NODE_WIDTH - (props.onOpen ? 22 : 6)} y={14} textAnchor="end" fontSize={9} data-review-badge css-fill="muted">
          review
        </SvgText>
      )}
      <SvgText x={12} y={29} fontSize={10} css-fill="muted">
        {clip(sub, node.task ? 20 : 28)}
      </SvgText>
      {node.task && <NodeOwner task={node.task} x={NODE_WIDTH - 6} y={29} />}
      {node.task && props.onOpen && (
        <g
          role="button"
          tabIndex={-1}
          aria-label={`Open ${node.id} details`}
          data-node-open={node.id}
          transform={`translate(${NODE_WIDTH - 18},2)`}
          onClick={(e) => {
            e.stopPropagation()
            props.onOpen!(node.id)
          }}
        >
          <title>{`Open ${node.id} details`}</title>
          <SvgRect width={16} height={16} rx={3} css-fill="card" />
          <SvgG transform="translate(3,3)" css-color="muted">
            <ExternalLink size={10} aria-hidden="true" />
          </SvgG>
        </g>
      )}
    </SvgG>
  )
}

function Legend() {
  return (
    <Box aria-label="Node colors" as="ul" flex flexWrap gap="3" size="xs" tone="muted">
      {STATES.map((state) => (
        <Box key={state.id} as="li" flex items="center" gap="1">
          <svg width={10} height={10} aria-hidden="true">
            <SvgRect width={10} height={10} rx={2} css-fill={STATE_COLOR[state.id]} />
          </svg>
          {state.label}
        </Box>
      ))}
      <li>Solid arrow: waiting · faded arrow: met · dashed arrow: sequence</li>
    </Box>
  )
}

function Details(props: { task: GraphTask; batch: GraphBatch | null; neighbors: ReturnType<typeof neighbors>; onSelect: (id: string) => void }) {
  const { task, batch } = props
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
              <TipBtn tooltip="Open this task's details in the drawer" onClick={() => drawer.openTask(task.id)}>
                All details
              </TipBtn>
              <TipBtn tooltip="Add a draft task that waits on this one" onClick={() => drawer.addTask({ prerequisite: task.id })}>
                Add a task after this
              </TipBtn>
            </>
          }
        />
        <Box mt="1" flex flexWrap items="center" gap="1.5" size="sm">
          <Hint size="xs">{task.id}</Hint>
          <Badge>{task.kind}</Badge>
          <Authority owner={task} />
          <Badge variant={task.complete ? 'success' : undefined}>{task.status ?? 'no status'}</Badge>
          <Badge variant={state === 'needs-you' ? 'warning' : state === 'ready' ? 'info' : undefined}>{STATE_LABEL[state]}</Badge>
          {task.review && <Badge>review</Badge>}
          {task.planArchived && <Badge>Archived</Badge>}
          {task.handSetReview && <Badge variant="warning">set by hand</Badge>}
        </Box>
        {task.handSetReview && (
          <Box as="p" mt="1" size="sm" data-hand-set-review>
            {noSessionLabel(task.noSession)}.{task.nextAction ? ` Next: ${task.nextAction}` : ''} All details has Discuss, Mark done and Back to planned.
          </Box>
        )}
        <Box as="dl" css-grid-template-columns="max-content-1fr" css-column-gap="12" mt="2" grid gap="1" size="sm">
          {task.repository && (
            <>
              <Hint as="dt">Repository</Hint>
              <dd>{task.repository}</dd>
            </>
          )}
          <Hint as="dt">Route</Hint>
          <dd>{task.route}</dd>
          <Hint as="dt">Done when</Hint>
          <dd>{task.completion}</dd>
          {task.decision && (
            <>
              <Hint as="dt">Decision</Hint>
              <dd>{task.decision}</dd>
            </>
          )}
          {batch && (
            <>
              <Hint as="dt">Batch</Hint>
              <dd data-batch-members={batch.members.join(',')}>
                {safeHref(batch.url) ? <a href={safeHref(batch.url) ?? undefined}>#{batch.number}</a> : `#${batch.number}`} closes{' '}
                {batch.members.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ', '}
                    {id === task.id ? (
                      id
                    ) : (
                      <PlainButton type="button" underline onClick={() => props.onSelect(id)}>
                        {id}
                      </PlainButton>
                    )}
                  </span>
                ))}
              </dd>
            </>
          )}
          {waitsOn.length > 0 && (
            <>
              <Hint as="dt">Waits on</Hint>
              <dd>
                <EdgeList label="Waits on" items={waitsOn.map((item) => ({ id: item.id, text: item.id, note: item.satisfied ? 'met' : 'waiting' }))} onOpen={props.onSelect} />
              </dd>
            </>
          )}
          {blocks.length > 0 && (
            <>
              <Hint as="dt">Blocks</Hint>
              <dd>
                <EdgeList label="Blocks" items={blocks.map((item) => ({ id: item.id, text: item.id }))} onOpen={props.onSelect} />
              </dd>
            </>
          )}
        </Box>
      </div>
    </Card>
  )
}

export default function GraphView({
  workspaceId,
  focus = null,
  drill = null,
  onDrill,
  source,
  bare = false,
  onTree,
  onOpenItem,
}: {
  workspaceId: string | null
  focus?: string | null
  drill?: Drill | null
  onDrill?: (drill: Drill | null) => void
  // The Graph page's own read of graph.view, so this view reads nothing more.
  source?: ReturnType<typeof useRead<Graph>>
  // Inside the Graph page: no heading or Refresh of its own.
  bare?: boolean
  // A task click drills into its Focus tree; the ↗ on a node opens its details.
  onTree?: (id: string) => void
  onOpenItem?: (id: string) => void
}) {
  const api = useAppApi()
  const client = useMemo(() => viewsClient(api), [api])
  const drawer = useTaskDrawer()
  const [filter, setFilter] = useSharedFilter(workspaceId)
  const load = useCallback((id: string) => client.graph(id), [client])
  const own = useRead(source ? null : workspaceId, load)
  const { value: full, error, busy, reload } = source ?? own
  // The shared filter, then the drill-in, decide what is drawn; the level
  // decides the groups: epics, an epic's plans, or a plan's phases.
  const graph = useMemo(() => (full ? groupGraph(drillGraph(filterGraph(full, filter), drill), drill) : null), [full, filter, drill])
  const choices = useMemo(() => filterChoices(full, {}, filter.plan), [full, filter.plan])
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
  const [panning, setPanning] = useState(false)

  const groupKeys = useMemo(() => [...new Set((graph?.tasks ?? []).map((t) => groupKey(t.group ?? null)))], [graph])
  // All and an epic's level open folded when big, so a large epic shows its
  // plans before their tasks.
  const shut = useMemo(
    () => collapsed ?? new Set((!drill || drill.kind === 'epic') && (graph?.tasks.length ?? 0) > COLLAPSE_ABOVE ? groupKeys : []),
    [collapsed, graph, groupKeys, drill],
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
  const groupTitle = (group: string | null) => graph?.groups?.find((g) => g.id === group)?.title ?? group ?? 'None'
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
  // A group label opens the next level: an epic, a plan, then a phase.
  const drillGroup = (group: string | null) => {
    const next = drillInto(drill, group, groupTitle(group))
    if (next) onDrill?.(next)
  }

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
  // A click on a task opens it in the drawer; a click on a collapsed group
  // opens its level.
  const select = (node: LaidNode) => {
    const action = nodeClick(node, moved.current)
    if (action === 'drill') {
      const next = drillInto(drill, node.group, node.title)
      if (next) onDrill?.(next)
      else toggle(groupKey(node.group))
      return
    }
    if (action !== 'open') return
    setSelected(node.id)
    if (onTree) onTree(node.id)
    else drawer.openTask(node.id)
  }
  const selectId = (id: string) => {
    const node = graph?.tasks.find((t) => t.id === id)
    if (node && shut.has(groupKey(node.group ?? null))) toggle(groupKey(node.group ?? null))
    setSelected(id)
  }
  // A task named from another tab (the Dashboard's Ready next) opens selected.
  const focused = useRef<string | null>(null)
  useEffect(() => {
    if (!graph || !focus || focused.current === focus) return
    focused.current = focus
    selectId(focus)
  }, [graph, focus])

  // Drag anywhere to pan, with the left or the middle button. A drag that
  // moves is not a click on a node, and a middle drag opens no link.
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    moved.current = false
    if (event.button !== 0 && event.button !== 1) return
    // No autoscroll on a middle press.
    if (event.button === 1) event.preventDefault()
    drag.current = { x: event.clientX, y: event.clientY, view, moved: false }
  }
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const start = drag.current
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.moved && Math.hypot(dx, dy) < DRAG_SLOP) return
    if (!start.moved) {
      event.currentTarget.setPointerCapture(event.pointerId)
      setPanning(true)
    }
    start.moved = moved.current = true
    setView({ ...start.view, x: start.view.x + dx, y: start.view.y + dy })
  }
  const onPointerUp = () => {
    drag.current = null
    setPanning(false)
  }
  const noLinkAfterDrag = (event: MouseEvent) => {
    if (event.button === 1 && moved.current) {
      event.preventDefault()
      event.stopPropagation()
    }
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
  const edgeLit = (from: string, to: string) => !lit || (lit.up.has(from) && lit.up.has(to)) || (lit.down.has(from) && lit.down.has(to))

  return (
    <Box aria-labelledby={bare ? undefined : 'avoozl-graph-title'} aria-label={bare ? 'All tasks' : undefined} as="section" flex flexCol gap="3.5" data-graph-view>
      {!bare && (
        <ViewHeading id="avoozl-graph-title" view="graph">
          Graph
        </ViewHeading>
      )}
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
      {!workspaceId ? (
        <Hint as="p" size="sm">
          Choose a workspace in the header.
        </Hint>
      ) : (
        <FilterBar id="avoozl-graph" filter={filter} choices={choices} onChange={changeFilter}>
          {!bare && (
            <Row gap={2} align="start">
              <RefreshButton workspaceId={workspaceId} onRefresh={() => void reload()} busy={busy} />
            </Row>
          )}
          <Box role="status" as="p" mt="2" size="sm" tone="muted">
            {busy
              ? 'Loading…'
              : summary
                ? `${summary.tasks} of ${full!.total} tasks · ${summary.blocking} blocking edges · ${summary.ready} ready · ${layout?.waves ?? 0} waves`
                : ''}
          </Box>
        </FilterBar>
      )}
      {workspaceId && drill?.kind === 'epic' && drill.id && <EpicPanel workspaceId={workspaceId} id={drill.id} client={client} onDrill={(next) => onDrill?.(next)} />}
      {graph && graph.total === 0 && (
        <Hint as="p" size="sm">
          No tasks yet. Store and approve a spec in the Specs tab to fill the graph.
        </Hint>
      )}
      {layout && layout.nodes.length > 0 && (
        <Card>
          <Row gap={2}>
            {stack.length > 0 && (
              <>
                <IconLabel icon={ArrowLeft} tooltip={backLabel(stack) ?? undefined} onClick={() => back()} aria-label={backLabel(stack) ?? 'Back'}>
                  Back
                </IconLabel>
                <Box aria-label="Graph drill-in" as="nav" flex flexWrap items="center" gap="1" size="sm" data-graph-crumbs>
                  {drillCrumbs(stack, drill).map(({ at, label }) => (
                    <Box key={at} as="span" inlineFlex items="center" gap="1">
                      <PlainButton type="button" css-max-width="14rem" truncate underline onClick={() => back(at)}>
                        {label}
                      </PlainButton>
                      <Hint aria-hidden="true">›</Hint>
                    </Box>
                  ))}
                  <Box as="span" css-max-width="min-28rem-60vw" truncate weight="medium" aria-current="page">
                    {drillLabel(drill)}
                  </Box>
                </Box>
              </>
            )}
            <TipBtn tooltip="Fold each group into one box" onClick={() => setCollapsed(new Set(groupKeys))}>
              Collapse all
            </TipBtn>
            <TipBtn tooltip="Show every task inside each group" onClick={() => setCollapsed(new Set())}>
              Expand all
            </TipBtn>
            <Box as="span" grow />
            <TipBtn tooltip="Zoom out" onClick={() => zoom(1 / 1.25)} aria-label="Zoom out">
              −
            </TipBtn>
            <Hint size="xs" aria-live="polite">
              {Math.round(view.scale * 100)}%
            </Hint>
            <TipBtn tooltip="Zoom in" onClick={() => zoom(1.25)} aria-label="Zoom in">
              +
            </TipBtn>
            <TipBtn tooltip="Fit the whole graph in view" onClick={fit}>
              Fit
            </TipBtn>
          </Row>
          <Box mt="2">
            <Legend />
          </Box>
          <Box ref={canvas} css-border-color="border" css-height="640" css-touch-action="none" mt="2" overflow="hidden" rounded="base" border="all">
            <SvgRoot
              role="group"
              aria-label="Task graph. Drag to pan; pinch or hold Ctrl or Cmd and scroll to zoom."
              width="100%"
              height={CANVAS_HEIGHT}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onMouseDown={(e) => e.button === 1 && e.preventDefault()}
              onAuxClickCapture={noLinkAfterDrag}
              data-panning={panning || undefined}
              css-cursor={panning ? 'grabbing' : 'grab'}
              css-user-select="none"
            >
              {panning && <PanningStyle />}
              <defs>
                <marker id="avoozl-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto">
                  <SvgPath d="M0,0 L10,5 L0,10 z" css-fill="muted" />
                </marker>
                <marker id="avoozl-arrow-on" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto">
                  <SvgPath d="M0,0 L10,5 L0,10 z" css-fill="accent" />
                </marker>
              </defs>
              <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
                {layout.clusters.map((cluster, i) => {
                  const key = groupKey(cluster.group)
                  return (
                    <g key={`${key}:${i}`} opacity={lit ? 0.5 : 1}>
                      <SvgRect x={cluster.x} y={cluster.y} width={cluster.width} height={cluster.height} rx={8} css-fill="bg-elevated" css-stroke="border" css-opacity="0.7" />
                      {cluster.label && (
                        <SvgText
                          x={cluster.x + 6}
                          y={cluster.y + 9}
                          fontSize={10}
                          role="button"
                          tabIndex={0}
                          aria-expanded={!cluster.collapsed}
                          aria-label={`${cluster.title}, ${cluster.count} tasks. Press to open it.`}
                          onClick={() => !moved.current && drillGroup(cluster.group)}
                          onKeyDown={(e) => pressed(e, () => drillGroup(cluster.group))}
                          css-fill="muted"
                          css-cursor="pointer"
                        >
                          {clip(cluster.title, 30)} ›
                        </SvgText>
                      )}
                    </g>
                  )
                })}
                {layout.loose.map((group) => {
                  const key = groupKey(group.group)
                  return (
                    <SvgText
                      key={`loose:${key}`}
                      x={group.x}
                      y={group.y + 11}
                      fontSize={10}
                      role="button"
                      tabIndex={0}
                      aria-label={`${group.title}: ${group.count} with no dependencies. Press to open it.`}
                      onClick={() => !moved.current && drillGroup(group.group)}
                      onKeyDown={(e) => pressed(e, () => drillGroup(group.group))}
                      css-fill="muted"
                      css-cursor="pointer"
                    >
                      {clip(`${group.title} · ${group.count} with no dependencies`, group.chars)}
                    </SvgText>
                  )
                })}
                {layout.edges.map((edge) => {
                  const on = lit !== null && edgeLit(edge.from, edge.to)
                  const dim = lit !== null && !on
                  const touches = highlighted(edge.from, edge.to)
                  return (
                    <SvgPath
                      key={`${edge.from}->${edge.to}`}
                      d={edgePath(edge.points)}
                      fill="none"
                      data-edge={`${edge.from}->${edge.to}`}
                      strokeWidth={on || touches ? 2.25 : 1.25}
                      strokeLinejoin="round"
                      strokeDasharray={edge.kind === 'sequence' ? '6 4' : undefined}
                      markerEnd={on ? 'url(#avoozl-arrow-on)' : 'url(#avoozl-arrow)'}
                      css-stroke={on ? 'accent' : 'muted'}
                      css-opacity={dim ? 0.12 : on ? 1 : edge.satisfied ? 0.35 : 0.8}
                    />
                  )
                })}
                {layout.nodes.map((node) => (
                  <Node key={node.id} node={node} selected={node.id === selected} dim={!nodeLit(node.id)} onSelect={select} onHover={setHovered} onOpen={onOpenItem} />
                ))}
              </g>
            </SvgRoot>
          </Box>
        </Card>
      )}
      {graph && task && <Details task={task} batch={graph.batches?.find((entry) => entry.id === task.batch) ?? null} neighbors={neighbors(graph, task.id)} onSelect={selectId} />}
    </Box>
  )
}
