// Dashboards › Graph: Issue Radar's dependency views in Avoozl's terms.
// FRONTIER lists what just unlocked and what still waits; FOCUS TREE draws
// one task's or one spec's live chain, and every click on a card drills into
// that card's own chain; ALL TASKS is the whole graph (GraphView), where a
// click drills into the task's tree. Back and Forward walk those steps; on
// Kiro Crew's /apps/<name> route each step is also a browser history entry
// (?tree=task:<id>), so the browser's Back and a pasted link land the same.
// Everything comes from the one graph.view read the page already makes.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useAppApi, useNavigate } from './host.ts'
import { viewsClient, withDrafts, type Graph, type GraphTask } from './views-api.ts'
import { useRead } from './useRead.ts'
import { useNav, useRemembered } from './NavHistory.tsx'
import { useTaskDrawer } from './drawer-context.ts'
import { Modal } from './Modal.tsx'
import { SmallBtn, ViewHeading } from './controls.tsx'
import { RefreshButton } from './RefreshButton.tsx'
import { Tooltip } from './Tooltip.tsx'
import { ArrowLeft, ArrowRight, ExternalLink, ListFilter } from './icons.ts'
import { NavSlotFor } from './nav-slot.tsx'
import { RailBlock, RailRow, RailStyle } from './NavRail.tsx'
import { usePhone } from './list-detail.ts'
import { useScrollPan } from './drag-pan.ts'
import GraphView from './GraphView.tsx'
import { EdgeList } from './EdgeList.tsx'
import { edgePath, layoutGraph, nodeState, STATES, type Drill, type NodeState, type Spacing } from './graph-layout.ts'
import {
  arrive,
  EMPTY_TRAIL,
  focusTree,
  frontier,
  jumpTarget,
  nextNode,
  parseGraphLink,
  placeLink,
  rootTitle,
  samePlace,
  STATE_CHIP,
  step,
  trailPlace,
  urlBase,
  visit,
  type FrontierItem,
  type GraphPlace,
  type GraphTab,
  type TreeRoot,
} from './focus-tree.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'

// Theme variables only (Radar's rule): go is the accent, a hold is warn.
const COLOR: Record<NodeState, string> = {
  ready: 'var(--accent)',
  running: 'var(--accent)',
  waiting: 'var(--warn, var(--muted))',
  'needs-you': 'var(--danger)',
  done: 'var(--muted-strong, var(--muted))',
  deferred: 'var(--muted)',
  draft: 'var(--muted)',
}
const STATE_WORD = Object.fromEntries(STATES.map((s) => [s.id, s.label])) as Record<NodeState, string>
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const CARD = { w: 204, h: 52 }
const TREE_SPACING: Spacing = { nodeWidth: CARD.w, nodeHeight: CARD.h, columnGap: 48, rowGap: 16, margin: 16, clusterLabel: 0, clusterGap: 0 }
const TABS: { key: GraphTab; label: string }[] = [
  { key: 'frontier', label: 'FRONTIER' },
  { key: 'focus', label: 'FOCUS TREE' },
  { key: 'all', label: 'ALL TASKS' },
]
const HINT_ID = 'avoozl-tree-hint'

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + '…' : text)

// The root a Focus tree opens on with none named: the first newly unlocked
// task, else the first task not done, else the first task.
function defaultRoot(graph: Graph): TreeRoot | null {
  const { ready } = frontier(graph)
  const task = ready[0]?.task ?? graph.tasks.find((t) => nodeState(t) !== 'done') ?? graph.tasks[0]
  return task ? { kind: 'task', id: task.id } : null
}

// Where a drill from another view lands (a task's Open tree, a spec's).
function placeOf(drill: Drill | null, focus: string | null): GraphPlace | null {
  if (focus) return { tab: 'focus', root: { kind: 'task', id: focus } }
  if (drill?.kind === 'focus') return { tab: 'focus', root: { kind: 'task', id: drill.id } }
  if (drill?.kind === 'spec') return { tab: 'focus', root: { kind: 'spec', id: drill.id } }
  if (drill) return { tab: 'all', root: null }
  return null
}

// A pasted link is read once per page load.
let linkRead = false

export default function GraphPage(props: {
  workspaceId: string | null
  workspaceName?: string | null
  focus?: string | null
  drill?: Drill | null
  onDrill?: (drill: Drill | null) => void
  // Opens Specs, where a draft spec is approved.
  onOpenSpecs?: () => void
}) {
  const { workspaceId } = props
  const api = useAppApi()
  const client = useMemo(() => viewsClient(api), [api])
  const load = useCallback((id: string) => client.graph(id), [client])
  const read = useRead(workspaceId, load)
  // Draft spec tasks are drawn too unless the nav's toggle turns them off.
  const [showDrafts, setShowDrafts] = useRemembered('graph-drafts', true)
  const graph = useMemo(() => (read.value ? withDrafts(read.value, showDrafts) : null), [read.value, showDrafts])
  const source = useMemo(() => ({ ...read, value: graph }), [read, graph])
  const draftCount = read.value?.drafts?.total ?? 0
  const nav = useNav()
  const navigate = useNavigate()
  const [trail, setTrail] = useRemembered('graph-trail', EMPTY_TRAIL)
  const latest = useRef(trail)
  latest.current = trail
  const [modal, setModal] = useState<TreeRoot | null>(null)
  const drawer = useTaskDrawer()
  // A task's ↗ opens its full task details, as Specs does; closing them
  // returns focus to the card. A spec, or a draft spec's task, which has no
  // task details yet, opens the summary modal.
  const openItem = (item: TreeRoot) => {
    const task = item.kind === 'task' ? graph?.tasks.find((t) => t.id === item.id) : undefined
    if (task && !task.draft) drawer.openTask(task.id)
    else setModal(item)
  }

  // Start: a drill from another view, else a pasted link, else where Back
  // left it, else the Frontier.
  const asked = placeOf(props.drill ?? null, props.focus ?? null)
  useEffect(() => {
    const link = !linkRead ? parseGraphLink(window.location.search) : null
    linkRead = true
    const start = asked ?? link
    if (start) setTrail((t) => visit(t, start))
    else if (!trailPlace(latest.current)) setTrail((t) => visit(t, { tab: 'frontier', root: null }))
    // A new drill or focus from another view is a new step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.drill, props.focus])

  const place = trailPlace(trail) ?? { tab: 'frontier', root: null }
  const root = place.tab === 'focus' ? (place.root ?? (graph ? defaultRoot(graph) : null)) : null

  // Go somewhere: one step, and on Kiro Crew's route one browser entry.
  const go = (next: GraphPlace) => {
    if (samePlace(trailPlace(latest.current), next)) return
    const base = urlBase(window.location.pathname)
    let url = false
    if (base) {
      const link = placeLink(next)
      try {
        navigate(base + link)
        url = window.location.search === link
      } catch {
        url = false
      }
    }
    setTrail((t) => visit(t, next, url))
  }
  const back = () => {
    const t = latest.current
    if (t.at <= 0) return
    if (t.url[t.at]) window.history.back()
    else setTrail(step(t, -1))
  }
  const forward = () => {
    const t = latest.current
    if (t.at >= t.list.length - 1) return
    if (t.url[t.at + 1]) window.history.forward()
    else setTrail(step(t, 1))
  }
  // The browser's own Back and Forward move along the same steps.
  useEffect(() => {
    const onPop = () => {
      const at = parseGraphLink(window.location.search)
      setTrail((t) => (at ? arrive(t, at) : t.at > 0 ? { ...t, at: 0 } : t))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [setTrail])
  // Each step back is one step in the page's Back history too, so the mouse
  // back button and Alt+Left walk it (NavHistory.tsx).
  const backNow = useRef(back)
  backNow.current = back
  useEffect(() => {
    const handler = () => backNow.current()
    nav.handlers.set('tree', handler)
    return () => {
      if (nav.handlers.get('tree') === handler) nav.handlers.delete('tree')
    }
  }, [nav])
  useEffect(() => {
    nav.history.sync('tree', Math.max(0, trail.at), () => ({ label: 'Back in the Graph', back: () => nav.handlers.get('tree')?.() }))
  }, [nav, trail.at])

  const openTree = (next: TreeRoot) => go({ tab: 'focus', root: next })
  const [jump, setJump] = useState('')
  const [jumpError, setJumpError] = useState<string | null>(null)
  const onJump = () => {
    if (!graph) return
    const target = jumpTarget(graph, jump)
    if (!target) return setJumpError(`No single task or spec matches “${jump.trim()}”.`)
    setJumpError(null)
    setJump('')
    openTree(target)
  }
  const options = useMemo(
    () => [...(graph?.plans ?? []).map((p) => ({ value: p.id, label: `spec · ${p.title}` })), ...(graph?.tasks ?? []).map((t) => ({ value: t.id, label: t.title }))],
    [graph],
  )
  const lists = useMemo(() => (graph ? frontier(graph) : null), [graph])

  return (
    <Stack aria-labelledby="avoozl-graph-title" as="section" gap={3} data-graph-page>
      <NavSlotFor section="dashboard">
        <div role="group" aria-label="Graph filters" data-nav-filters="avoozl-graph" data-rail>
          <RailStyle />
          <RailBlock first id="graph-filters" icon={ListFilter} title="Graph">
            <RailRow
              label="Show draft tasks"
              active={showDrafts}
              onClick={() => setShowDrafts(!showDrafts)}
              attrs={{ 'data-rail-drafts': '' }}
              trail={draftCount > 0 ? <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>{draftCount}</span> : undefined}
            />
          </RailBlock>
        </div>
      </NavSlotFor>
      <ViewHeading id="avoozl-graph-title" view="graph">
        Graph
      </ViewHeading>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-2 text-[11px] text-muted"
        style={{ borderColor: 'var(--border)', fontFamily: MONO, letterSpacing: '.08em' }}
        data-graph-header
      >
        <span className="whitespace-nowrap">
          DEPENDENCIES · <span className="font-semibold" style={{ color: 'var(--text-strong, var(--text))' }}>{props.workspaceName ?? workspaceId ?? ''}</span>
        </span>
        <Row role="tablist" aria-label="Dependency views" gap={1} wrap={false}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={place.tab === t.key}
              data-graph-tab={t.key}
              onClick={() => go({ tab: t.key, root: t.key === 'focus' ? (root ?? null) : null })}
              className="h-6 cursor-pointer whitespace-nowrap rounded-sm border px-3"
              style={
                place.tab === t.key
                  ? { borderColor: 'var(--border-strong, var(--border))', color: 'var(--accent)', background: 'var(--card)', letterSpacing: '.08em' }
                  : { borderColor: 'transparent', color: 'var(--muted)', background: 'transparent', letterSpacing: '.08em' }
              }
            >
              {t.label}
            </button>
          ))}
        </Row>
        <div className="ml-auto flex items-center gap-1.5">
          <NavArrow label="Back" icon="back" disabled={trail.at <= 0} onClick={back} />
          <NavArrow label="Forward" icon="forward" disabled={trail.at >= trail.list.length - 1} onClick={forward} />
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              onJump()
            }}
          >
            <input
              list="avoozl-graph-jump-list"
              value={jump}
              onChange={(e) => {
                setJump(e.target.value)
                setJumpError(null)
              }}
              placeholder="jump to task or spec…"
              aria-label="Jump to a task or spec"
              aria-invalid={jumpError ? true : undefined}
              aria-describedby={jumpError ? 'avoozl-graph-jump-error' : undefined}
              data-graph-jump
              className="w-40 rounded-sm border px-2.5 py-1 text-[11px] md:w-52"
              style={{ background: 'var(--card)', borderColor: 'var(--border-strong, var(--border))', color: 'var(--text)', fontFamily: MONO }}
            />
          </form>
          <datalist id="avoozl-graph-jump-list">
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {clip(o.label, 50)}
              </option>
            ))}
          </datalist>
          {workspaceId && <RefreshButton workspaceId={workspaceId} onRefresh={() => void source.reload()} busy={source.busy} />}
        </div>
      </div>
      {jumpError && (
        <ErrorText id="avoozl-graph-jump-error" role="alert" size="xs" flush>
          {jumpError}
        </ErrorText>
      )}
      {source.error && (
        <ErrorText role="alert" size="sm" flush>
          {source.error}
        </ErrorText>
      )}
      {!workspaceId ? (
        <Hint as="p" size="sm">Choose a workspace in the header.</Hint>
      ) : !graph ? (
        <Hint as="p" size="sm" role="status">
          {source.busy ? 'Loading…' : ''}
        </Hint>
      ) : graph.total === 0 ? (
        <Hint as="p" size="sm">No tasks yet. Store and approve a spec in the Specs tab to fill the graph.</Hint>
      ) : place.tab === 'frontier' ? (
        <Frontier ready={lists!.ready} waiting={lists!.waiting} onOpenTree={(id) => openTree({ kind: 'task', id })} onOpen={(id) => openItem({ kind: 'task', id })} />
      ) : place.tab === 'focus' ? (
        root && <FocusTreeView graph={graph} root={root} onReRoot={openTree} onOpen={openItem} />
      ) : (
        <GraphView
          workspaceId={workspaceId}
          drill={props.drill?.kind === 'focus' || props.drill?.kind === 'spec' ? null : (props.drill ?? null)}
          onDrill={props.onDrill}
          source={source}
          bare
          onTree={(id) => openTree({ kind: 'task', id })}
          onOpenItem={(id) => openItem({ kind: 'task', id })}
        />
      )}
      {place.tab !== 'all' && graph && graph.total > 0 && (
        <div id={HINT_ID} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-2 text-[11px] text-muted" style={{ borderColor: 'var(--border)', fontFamily: MONO }} data-graph-hint>
          <span className="min-w-0 flex-1">
            {place.tab === 'frontier'
              ? 'Newly unlocked tasks have every blocker on record done. Open a row to see why, or open its tree.'
              : 'The live dependency tree of the selected task or spec. Click a card or press Enter to drill into its tree; O, Space or ↗ opens its details. Arrow keys move between cards. Dashed = sequence only, struck = done.'}
          </span>
          <span className="flex-none tabular-nums">{lists?.ready.length ?? 0} newly unlocked</span>
        </div>
      )}
      {modal && graph && (
        <ItemModal
          graph={graph}
          item={modal}
          onClose={() => setModal(null)}
          onTree={(r) => (setModal(null), openTree(r))}
          onOpenSpecs={props.onOpenSpecs ? () => (setModal(null), props.onOpenSpecs!()) : undefined}
        />
      )}
    </Stack>
  )
}

function NavArrow(props: { label: string; icon: 'back' | 'forward'; disabled: boolean; onClick: () => void }) {
  const Icon = props.icon === 'back' ? ArrowLeft : ArrowRight
  return (
    <Tooltip text={props.disabled ? `${props.label}: nothing there` : `${props.label} in the Graph`}>
      {(describedBy) => (
        <button
          type="button"
          aria-label={props.label}
          aria-describedby={describedBy}
          aria-disabled={props.disabled || undefined}
          data-graph-nav={props.icon}
          onClick={() => !props.disabled && props.onClick()}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border"
          style={{ borderColor: 'var(--border)', color: props.disabled ? 'var(--muted)' : 'var(--text)', opacity: props.disabled ? 0.4 : 1, background: 'transparent' }}
        >
          <Icon size={13} aria-hidden="true" />
        </button>
      )}
    </Tooltip>
  )
}

/* FRONTIER */

export function Frontier(props: { ready: FrontierItem[]; waiting: FrontierItem[]; onOpenTree: (id: string) => void; onOpen: (id: string) => void }) {
  const { ready, waiting } = props
  return (
    <div className="flex flex-col" style={{ fontFamily: MONO }} data-frontier>
      <h3 className="m-0 text-[11px] font-semibold" style={{ letterSpacing: '.26em', color: 'var(--text-strong, var(--text))' }}>
        FRONTIER
      </h3>
      <p className="mb-3.5 mt-0.5 text-[10px]" style={{ color: 'var(--muted-strong, var(--muted))' }} data-frontier-sub>
        {ready.length} newly unlocked · {waiting.length} still waiting
      </p>
      {ready.length === 0 && waiting.length === 0 && <p className="text-[11px] text-muted">No task has a blocker on record.</p>}
      {ready.map((item) => (
        <FrontierRow key={item.task.id} item={item} unlocked {...props} />
      ))}
      {waiting.length > 0 && (
        <div className="mb-2.5 mt-5 border-t pt-2.5 text-[9px]" style={{ maxWidth: 820, borderColor: 'var(--border)', letterSpacing: '.24em', color: 'var(--muted-strong, var(--muted))' }}>
          WAITING ({waiting.length})
        </div>
      )}
      {waiting.map((item) => (
        <FrontierRow key={item.task.id} item={item} unlocked={false} {...props} />
      ))}
    </div>
  )
}

function Chip({ task }: { task: GraphTask }) {
  const state = nodeState(task)
  const go = state === 'ready' || state === 'running'
  return (
    <span className="inline-flex flex-none items-center gap-1.5" data-state-chip={state}>
      <span
        aria-hidden="true"
        className="inline-block h-[7px] w-[7px] rounded-full"
        style={go ? { background: COLOR[state] } : { border: `1.5px solid ${COLOR[state]}` }}
      />
      <span className="text-[9px]" style={{ color: COLOR[state], letterSpacing: '.12em' }}>
        {STATE_CHIP[state]}
        <span className="sr-only"> ({STATE_WORD[state]})</span>
      </span>
    </span>
  )
}

function Refs({ tasks, struck }: { tasks: { task: GraphTask; met?: boolean }[]; struck?: boolean }) {
  if (!tasks.length) return <span>—</span>
  return (
    <>
      {tasks.map(({ task, met }, i) => (
        <span key={task.id}>
          {i > 0 && ' · '}
          <span style={struck || met ? { textDecoration: 'line-through', color: 'var(--muted-strong, var(--muted))' } : { color: 'var(--text)' }}>{task.id}</span>
        </span>
      ))}
    </>
  )
}

function FrontierRow(props: { item: FrontierItem; unlocked: boolean; onOpenTree: (id: string) => void; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const { task, blockers, waitingOn } = props.item
  const met = blockers.filter((b) => b.met)
  const why = `avoozl-frontier-why-${task.id}`
  return (
    <div className="mb-2 rounded-[3px] border" style={{ maxWidth: 820, borderColor: 'var(--border)', background: 'var(--card)' }} data-frontier-row={task.id}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={why}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-baseline gap-2.5 px-3.5 py-2.5 text-left"
        style={{ background: 'transparent' }}
      >
        <span className="flex-none text-[12px] font-bold" style={{ color: props.unlocked ? 'var(--accent)' : 'var(--warn, var(--muted))' }}>
          {task.id}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: 'var(--text)' }}>
          {task.title}
        </span>
        <Chip task={task} />
      </button>
      {open && (
        <div id={why} className="px-3.5 pb-3 text-[10.5px] text-muted" style={{ paddingLeft: 30, lineHeight: 1.6 }} data-frontier-why>
          {props.unlocked ? (
            <>
              All blockers satisfied: <Refs tasks={met} struck />
            </>
          ) : (
            <>
              Waiting on <Refs tasks={waitingOn.map((t) => ({ task: t }))} />
              {met.length > 0 && (
                <>
                  {' '}
                  · Already satisfied: <Refs tasks={met} struck />
                </>
              )}
            </>
          )}
          {' · '}
          <button type="button" className="cursor-pointer underline underline-offset-2" style={{ color: 'var(--accent)', background: 'transparent' }} onClick={() => props.onOpenTree(task.id)}>
            open tree →
          </button>
          {' · '}
          <button type="button" className="cursor-pointer underline underline-offset-2" style={{ color: 'var(--accent)', background: 'transparent' }} onClick={() => props.onOpen(task.id)}>
            details
          </button>
        </div>
      )}
    </div>
  )
}

/* FOCUS TREE */

export function FocusTreeView(props: { graph: Graph; root: TreeRoot; onReRoot: (root: TreeRoot) => void; onOpen: (item: TreeRoot) => void }) {
  const { graph, root } = props
  const tree = useMemo(() => focusTree(graph, root), [graph, root])
  const layout = useMemo(() => (tree ? layoutGraph(tree.graph, new Set(), { spacing: TREE_SPACING }) : null), [tree])
  const first = tree ? [...tree.roots][0] : null
  const [cursor, setCursor] = useState<string | null>(first)
  const box = useRef<HTMLDivElement>(null)
  const phone = usePhone()
  const pan = useScrollPan(box)
  // A new root takes the cursor, and keyboard focus when it was in the tree.
  // The root card scrolls into view, so drilling right or left keeps it in
  // sight.
  useEffect(() => {
    setCursor(first)
    const inside = box.current?.contains(document.activeElement)
    if (!first) return
    requestAnimationFrame(() => {
      const card = box.current?.querySelector<HTMLElement | SVGElement>(`[data-tree-node="${CSS.escape(first)}"]`)
      card?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      if (inside) card?.focus({ preventScroll: true })
    })
  }, [first, root.kind, root.id])

  if (!tree || !layout) return <Hint as="p" size="sm">Nothing named {root.id} is in this workspace’s graph.</Hint>
  const label = root.kind === 'spec' ? `spec ${root.id}` : root.id
  const nodes = layout.nodes
  const focusNode = (id: string | null) => {
    if (!id) return
    setCursor(id)
    box.current?.querySelector<HTMLElement | SVGElement>(`[data-tree-node="${CSS.escape(id)}"]`)?.focus()
  }
  const onKey = (event: KeyboardEvent, id: string) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      props.onReRoot({ kind: 'task', id })
    } else if (event.key === ' ' || event.key === 'o' || event.key === 'O') {
      event.preventDefault()
      props.onOpen({ kind: 'task', id })
    } else if (event.key.startsWith('Arrow')) {
      // A phone's one column goes by list order; the drawing by position.
      const order = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y).map((n) => n.id)
      const at = order.indexOf(id)
      const next = phone ? order[at + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1)] ?? null : nextNode(nodes, id, event.key)
      if (next) {
        event.preventDefault()
        focusNode(next)
      }
    }
  }
  const width = layout.width + 8
  const height = layout.height + 8
  return (
    <Stack gap={2} data-focus-tree={`${root.kind}:${root.id}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 text-[11px]" style={{ fontFamily: MONO, letterSpacing: '.1em', color: 'var(--muted-strong, var(--muted))' }}>
        <span data-tree-stat>
          tree of {label}: {tree.graph.tasks.length} {tree.graph.tasks.length === 1 ? 'node' : 'nodes'} · {tree.live} live {tree.live === 1 ? 'edge' : 'edges'}
        </span>
        <span className="truncate" style={{ letterSpacing: 0, color: 'var(--text)' }}>
          {rootTitle(graph, root)}
        </span>
        {root.kind === 'task' && (
          <button type="button" className="cursor-pointer underline underline-offset-2" style={{ color: 'var(--accent)', background: 'transparent', letterSpacing: 0 }} onClick={() => props.onOpen(root)}>
            details
          </button>
        )}
      </div>
      <div
        ref={box}
        className="overflow-auto rounded border"
        // overflow inline too: panning needs a real scroll box, host CSS or not.
        style={{ borderColor: 'var(--border)', background: 'var(--bg)', overflow: 'auto', maxHeight: phone ? undefined : '70vh', cursor: pan.panning ? 'grabbing' : 'grab', userSelect: pan.panning ? 'none' : undefined }}
        data-tree-scroll
        data-panning={pan.panning || undefined}
        {...pan.handlers}
      >
        {phone ? (
          // A phone: one column of cards, upstream first, the page scrolls.
          <ol role="group" aria-label={`Dependency tree of ${label}: ${tree.graph.tasks.length} tasks, ${tree.live} live edges`} aria-describedby={HINT_ID} className="m-0 flex flex-col gap-2 p-2" style={{ listStyle: 'none', fontFamily: MONO }} data-tree-list>
            {[...nodes]
              .sort((a, b) => a.x - b.x || a.y - b.y)
              .map((node) => {
                const task = node.task!
                const isRoot = tree.roots.has(node.id)
                const faded = tree.ghosts.has(node.id) || node.state === 'done'
                const draft = node.state === 'draft'
                const waits = layout.edges.filter((e) => e.to === node.id)
                return (
                  <li key={node.id} data-tree-card={node.id} data-root={isRoot || undefined} data-draft={draft || undefined} style={{ opacity: faded ? 0.5 : draft ? 0.65 : 1 }}>
                    <div
                      role="button"
                      tabIndex={node.id === cursor ? 0 : -1}
                      aria-label={`${node.id}, ${STATE_WORD[node.state]}${faded ? ', satisfied' : ''}${isRoot ? ', root' : ''}: ${task.title}`}
                      data-tree-node={node.id}
                      onClick={() => props.onReRoot({ kind: 'task', id: node.id })}
                      onKeyDown={(e) => onKey(e, node.id)}
                      onFocus={() => setCursor(node.id)}
                      className="avoozl-tree-row flex cursor-pointer flex-col gap-0.5 rounded-[3px] border px-3 py-2"
                      style={{ background: 'var(--card)', borderColor: isRoot ? 'var(--accent)' : 'var(--border-strong, var(--border))', borderWidth: isRoot ? 2 : 1, borderStyle: draft ? 'dashed' : 'solid' }}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="text-[12px] font-bold" style={{ color: faded ? 'var(--muted-strong, var(--muted))' : COLOR[node.state], textDecoration: faded ? 'line-through' : undefined }}>
                          {node.id}
                        </span>
                        <span className="ml-auto text-[9px]" style={{ color: COLOR[node.state], letterSpacing: '.1em' }}>
                          {tree.ghosts.has(node.id) ? 'MET' : STATE_CHIP[node.state]}
                        </span>
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={`Open ${node.id} details`}
                          data-tree-open={node.id}
                          className="inline-flex cursor-pointer items-center p-0.5"
                          style={{ color: 'var(--muted)', background: 'transparent' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setCursor(node.id)
                            props.onOpen({ kind: 'task', id: node.id })
                          }}
                        >
                          <ExternalLink size={13} aria-hidden="true" />
                        </button>
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--text)' }}>
                        {task.title}
                      </span>
                      {waits.length > 0 && (
                        <span className="text-[10px] text-muted">
                          waits on{' '}
                          {waits.map((e, i) => (
                            <span key={e.from} style={e.satisfied ? { textDecoration: 'line-through' } : undefined}>
                              {i > 0 && ' · '}
                              {e.from}
                              {e.kind === 'sequence' ? ' (sequence)' : ''}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
          </ol>
        ) : (
        <svg
          role="group"
          aria-label={`Dependency tree of ${label}: ${tree.graph.tasks.length} tasks, ${tree.live} live edges`}
          aria-describedby={HINT_ID}
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMinYMin meet"
          style={{ display: 'block', fontFamily: MONO, maxWidth: width, minWidth: Math.round(width * 0.85) }}
        >
          <defs>
            <marker id="avoozl-tree-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto">
              <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--muted)' }} />
            </marker>
          </defs>
          {layout.edges.map((edge) => {
            const target = nodes.find((n) => n.id === edge.to)
            const color = edge.satisfied ? 'var(--muted-strong, var(--muted))' : COLOR[target?.state ?? 'waiting']
            return (
              <path
                key={`${edge.from}->${edge.to}`}
                d={edgePath(edge.points)}
                fill="none"
                data-tree-edge={`${edge.from}->${edge.to}`}
                data-met={edge.satisfied || undefined}
                strokeWidth={1.6}
                strokeDasharray={edge.kind === 'sequence' ? '3 6' : edge.satisfied ? '2 5' : undefined}
                markerEnd="url(#avoozl-tree-arrow)"
                style={{ stroke: color, opacity: edge.satisfied ? 0.4 : 0.8 }}
              />
            )
          })}
          {nodes.map((node) => {
            const task = node.task!
            const isRoot = tree.roots.has(node.id)
            const faded = tree.ghosts.has(node.id) || node.state === 'done'
            const draft = node.state === 'draft'
            const color = COLOR[node.state]
            return (
              <g key={node.id} transform={`translate(${node.x},${node.y})`} opacity={faded ? 0.5 : draft ? 0.65 : 1} data-tree-card={node.id} data-root={isRoot || undefined} data-draft={draft || undefined}>
                <g
                  role="button"
                  tabIndex={node.id === cursor ? 0 : -1}
                  aria-label={`${node.id}, ${STATE_WORD[node.state]}${faded ? ', satisfied' : ''}${isRoot ? ', root' : ''}: ${task.title}`}
                  data-tree-node={node.id}
                  onClick={() => props.onReRoot({ kind: 'task', id: node.id })}
                  onKeyDown={(e) => onKey(e, node.id)}
                  onFocus={() => setCursor(node.id)}
                  style={{ cursor: 'pointer', outline: 'none' }}
                  className="avoozl-tree-node"
                >
                  {isRoot && <rect x={-4} y={-4} width={CARD.w + 8} height={CARD.h + 8} rx={6} fill="none" style={{ stroke: 'var(--accent)', opacity: 0.35 }} />}
                  <rect
                    width={CARD.w}
                    height={CARD.h}
                    rx={3}
                    strokeWidth={isRoot ? 2 : 1.2}
                    strokeDasharray={draft ? '5 3' : undefined}
                    style={{ fill: 'var(--card)', stroke: isRoot ? 'var(--accent)' : 'var(--border-strong, var(--border))' }}
                  />
                  <text x={11} y={20} fontSize={13} fontWeight={700} textDecoration={faded ? 'line-through' : undefined} style={{ fill: faded ? 'var(--muted-strong, var(--muted))' : color }}>
                    {clip(node.id, 18)}
                  </text>
                  <text x={CARD.w - 30} y={20} fontSize={10.5} letterSpacing=".1em" textAnchor="end" style={{ fill: color }}>
                    {faded && tree.ghosts.has(node.id) ? 'MET' : STATE_CHIP[node.state]}
                  </text>
                  <text x={11} y={39} fontSize={11.5} style={{ fill: 'var(--muted)' }}>
                    {clip(task.title, 24)}
                  </text>
                </g>
                <g
                  role="button"
                  tabIndex={-1}
                  aria-label={`Open ${node.id} details`}
                  data-tree-open={node.id}
                  transform={`translate(${CARD.w - 24},4)`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCursor(node.id)
                    props.onOpen({ kind: 'task', id: node.id })
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <title>Open {node.id} details</title>
                  <rect width={20} height={20} rx={4} style={{ fill: 'transparent' }} />
                  <g transform="translate(4,4)" style={{ color: 'var(--muted)' }}>
                    <ExternalLink size={12} aria-hidden="true" />
                  </g>
                </g>
              </g>
            )
          })}
        </svg>
        )}
      </div>
      <style>{`.avoozl-tree-node:focus-visible > rect:last-of-type{stroke:var(--accent);stroke-width:2.5}.avoozl-tree-row:focus-visible{outline:2px solid var(--accent);outline-offset:1px}[data-tree-scroll][data-panning] *{cursor:grabbing!important}`}</style>
    </Stack>
  )
}

/* The item modal: a spec, or a draft spec's task, opened without leaving the Graph. */

export function ItemModal(props: { graph: Graph; item: TreeRoot; onClose: () => void; onTree: (root: TreeRoot) => void; onOpenSpecs?: () => void }) {
  const { graph, item } = props
  const byId = new Map(graph.tasks.map((t) => [t.id, t]))
  // Esc and Close put focus back on the card that opened it.
  const close = () => {
    props.onClose()
    requestAnimationFrame(() => document.querySelector<HTMLElement | SVGElement>(`[data-tree-node="${CSS.escape(item.id)}"]`)?.focus())
  }
  const task = item.kind === 'task' ? byId.get(item.id) : undefined
  const plan = graph.plans?.find((p) => p.id === (item.kind === 'spec' ? item.id : task?.planId))
  // A draft spec's task, or a spec root that is a draft spec.
  const draftSpec = task?.draft
    ? (props.graph.drafts?.specs.find((s) => s.name === task.draft!.spec) ?? { name: task.draft.spec, title: task.draft.spec, status: task.draft.status, count: 0 })
    : item.kind === 'spec'
      ? (props.graph.drafts?.specs.find((s) => s.name === item.id) ?? null)
      : null
  const title = item.kind === 'task' ? (task?.title ?? item.id) : (plan?.title ?? draftSpec?.title ?? item.id)
  const waitsOn = graph.edges.filter((e) => e.blocking && e.to === item.id && byId.has(e.from))
  const blocks = graph.edges.filter((e) => e.blocking && e.from === item.id && byId.has(e.to))
  const members = item.kind === 'spec' ? graph.tasks.filter((t) => (t.planId ?? null) === item.id || (t.spec ?? null) === item.id) : []
  const row = (label: string, value: ReactNode) => (
    <>
      <Hint as="dt">{label}</Hint>
      <dd className="m-0">{value}</dd>
    </>
  )
  const openTree = (id: string) => props.onTree({ kind: 'task', id })
  const link = (id: string) => (
    <button type="button" className="cursor-pointer underline" style={{ background: 'transparent', color: 'var(--text)' }} onClick={() => props.onTree({ kind: 'task', id })}>
      {id}
    </button>
  )
  return (
    <Modal
      id="avoozl-graph-item"
      title={title}
      width="36rem"
      backLabel="Close"
      onDismiss={close}
      attrs={{ 'data-graph-item': `${item.kind}:${item.id}` }}
      footer={
        <>
          {draftSpec && props.onOpenSpecs && (
            <SmallBtn attrs={{ 'data-open-specs': draftSpec.name }} onClick={props.onOpenSpecs}>
              Open Specs
            </SmallBtn>
          )}
          <SmallBtn onClick={() => props.onTree(item)}>Open tree</SmallBtn>
        </>
      }
    >
      {draftSpec && (
        <p className="m-0 mb-2 rounded border border-dashed px-3 py-2 text-sm" style={{ borderColor: 'var(--border-strong, var(--border))' }} data-draft-note>
          Spec <code>{draftSpec.name}</code> is a draft ({draftSpec.status}). {task ? 'This task' : 'Its tasks'} cannot start until the spec is approved in Specs.
        </p>
      )}
      {task ? (
        <dl className="m-0 grid gap-1 text-sm" style={{ gridTemplateColumns: 'max-content 1fr', columnGap: 12 }}>
          {row('Task', <code>{task.id}</code>)}
          {row('State', <Chip task={task} />)}
          {plan ? row('Spec', plan.title) : task.draft && row('Spec', draftSpec?.title ?? task.draft.spec)}
          {task.phase && row('Phase', task.phase.title)}
          {task.repository && row('Repository', task.repository)}
          {row('Route', task.route)}
          {row('Done when', task.completion)}
          {task.decision && row('Decision', task.decision)}
          {waitsOn.length > 0 && row('Waits on', <EdgeList label="Waits on" items={waitsOn.map((e) => ({ id: e.from, text: e.from, met: e.satisfied }))} onOpen={openTree} />)}
          {blocks.length > 0 && row('Blocks', <EdgeList label="Blocks" items={blocks.map((e) => ({ id: e.to, text: e.to }))} onOpen={openTree} />)}
        </dl>
      ) : item.kind === 'spec' ? (
        <div className="flex flex-col gap-2 text-sm">
          <Hint as="p" flush>
            Spec <code>{item.id}</code> · {members.length} tasks · {members.filter((t) => nodeState(t) === 'done').length} done
          </Hint>
          <ul className="m-0 flex flex-col gap-1 p-0" style={{ listStyle: 'none' }}>
            {members.map((t) => (
              <li key={t.id} className="flex items-baseline gap-2">
                {link(t.id)}
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <Chip task={t} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Hint as="p" size="sm" flush>{item.id} is not in this workspace’s graph.</Hint>
      )}
    </Modal>
  )
}
