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
import { Modal } from './ui/Modal.tsx'
import { SmallBtn, ViewHeading } from './ui/controls.tsx'
import { RefreshButton } from './RefreshButton.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
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
import { Box } from './ui/Box'
import { TreeStyle } from './ui/PageStyles'
import { PlainButton, PlainInput, SvgG, SvgPath, SvgRect, SvgRoot, SvgText } from './ui/Plain'
import { COLOR } from './ui/looks/FocusTree.ts'
import { StatusDot } from './ui/StatusDot'
import { TONE } from './ui/tones.ts'

const STATE_WORD = Object.fromEntries(STATES.map((s) => [s.id, s.label])) as Record<NodeState, string>
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
              trail={
                draftCount > 0 ? (
                  <Box as="span" css-font-size="12" css-font-variant-numeric="tabular-nums" css-opacity="0.7">
                    {draftCount}
                  </Box>
                ) : undefined
              }
            />
          </RailBlock>
        </div>
      </NavSlotFor>
      <ViewHeading id="avoozl-graph-title" view="graph">
        Graph
      </ViewHeading>
      <Box
        css-border-color="border"
        css-font-family="ui-monospace-SFMono-Regular-Menlo-monospace"
        css-letter-spacing=".08em"
        flex
        flexWrap
        items="center"
        gapX="3"
        gapY="2"
        border="b"
        pb="2"
        size="11"
        tone="muted"
        data-graph-header
      >
        <Box as="span" whitespace="nowrap">
          DEPENDENCIES ·{' '}
          <Box as="span" css-color="text-strong-text" weight="semibold">
            {props.workspaceName ?? workspaceId ?? ''}
          </Box>
        </Box>
        <Row role="tablist" aria-label="Dependency views" gap={1} wrap={false}>
          {TABS.map((t) => (
            <PlainButton
              key={t.key}
              type="button"
              role="tab"
              aria-selected={place.tab === t.key}
              data-graph-tab={t.key}
              onClick={() => go({ tab: t.key, root: t.key === 'focus' ? (root ?? null) : null })}
              css-border-color={place.tab === t.key ? 'border-strong-border' : 'transparent'}
              css-color={place.tab === t.key ? 'accent' : 'muted'}
              css-background={place.tab === t.key ? 'card' : 'transparent'}
              css-letter-spacing={place.tab === t.key ? '.08em' : '.08em'}
              h6
              cursorPointer
              whitespace="nowrap"
              rounded="sm"
              border="all"
              px="3"
            >
              {t.label}
            </PlainButton>
          ))}
        </Row>
        <Box ml="auto" flex items="center" gap="1.5">
          <NavArrow label="Back" icon="back" disabled={trail.at <= 0} onClick={back} />
          <NavArrow label="Forward" icon="forward" disabled={trail.at >= trail.list.length - 1} onClick={forward} />
          <Box
            as="form"
            contents
            onSubmit={(event) => {
              event.preventDefault()
              onJump()
            }}
          >
            <PlainInput
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
              css-background="card"
              css-border-color="border-strong-border"
              css-color="text"
              css-font-family="ui-monospace-SFMono-Regular-Menlo-monospace"
              w40
              rounded="sm"
              border="all"
              px="2.5"
              py="1"
              size="11"
              mdW52
            />
          </Box>
          <datalist id="avoozl-graph-jump-list">
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {clip(o.label, 50)}
              </option>
            ))}
          </datalist>
          {workspaceId && <RefreshButton workspaceId={workspaceId} onRefresh={() => void source.reload()} busy={source.busy} />}
        </Box>
      </Box>
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
        <Hint as="p" size="sm">
          Choose a workspace in the header.
        </Hint>
      ) : !graph ? (
        <Hint as="p" size="sm" role="status">
          {source.busy ? 'Loading…' : ''}
        </Hint>
      ) : graph.total === 0 ? (
        <Hint as="p" size="sm">
          No tasks yet. Store and approve a spec in the Specs tab to fill the graph.
        </Hint>
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
        <Box
          id={HINT_ID}
          css-border-color="border"
          css-font-family="ui-monospace-SFMono-Regular-Menlo-monospace"
          flex
          flexWrap
          items="baseline"
          justify="between"
          gapX="4"
          gapY="1"
          border="t"
          pt="2"
          size="11"
          tone="muted"
          data-graph-hint
        >
          <Box as="span" minW0 flex1>
            {place.tab === 'frontier'
              ? 'Newly unlocked tasks have every blocker on record done. Open a row to see why, or open its tree.'
              : 'The live dependency tree of the selected task or spec. Click a card or press Enter to drill into its tree; O, Space or ↗ opens its details. Arrow keys move between cards. Dashed = sequence only, struck = done.'}
          </Box>
          <Box as="span" flexNone tabularNums>
            {lists?.ready.length ?? 0} newly unlocked
          </Box>
        </Box>
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
        <PlainButton
          type="button"
          aria-label={props.label}
          aria-describedby={describedBy}
          aria-disabled={props.disabled || undefined}
          data-graph-nav={props.icon}
          onClick={() => !props.disabled && props.onClick()}
          css-border-color="border"
          css-color={props.disabled ? 'muted' : 'text'}
          css-opacity={props.disabled ? '0.4' : '1'}
          css-background="transparent"
          inlineFlex
          h7
          w7
          cursorPointer
          items="center"
          justify="center"
          rounded="md"
          border="all"
        >
          <Icon size={13} aria-hidden="true" />
        </PlainButton>
      )}
    </Tooltip>
  )
}

/* FRONTIER */

export function Frontier(props: { ready: FrontierItem[]; waiting: FrontierItem[]; onOpenTree: (id: string) => void; onOpen: (id: string) => void }) {
  const { ready, waiting } = props
  return (
    <Box css-font-family="ui-monospace-SFMono-Regular-Menlo-monospace" flex flexCol data-frontier>
      <Box as="h3" css-letter-spacing=".26em" css-color="text-strong-text" m0 size="11" weight="semibold">
        FRONTIER
      </Box>
      <Box as="p" css-color="muted-strong-muted" mb="3.5" mt="0.5" size="10" data-frontier-sub>
        {ready.length} newly unlocked · {waiting.length} still waiting
      </Box>
      {ready.length === 0 && waiting.length === 0 && (
        <Box as="p" size="11" tone="muted">
          No task has a blocker on record.
        </Box>
      )}
      {ready.map((item) => (
        <FrontierRow key={item.task.id} item={item} unlocked {...props} />
      ))}
      {waiting.length > 0 && (
        <Box css-max-width="820" css-border-color="border" css-letter-spacing=".24em" css-color="muted-strong-muted" mb="2.5" mt="5" border="t" pt="2.5" size="9">
          WAITING ({waiting.length})
        </Box>
      )}
      {waiting.map((item) => (
        <FrontierRow key={item.task.id} item={item} unlocked={false} {...props} />
      ))}
    </Box>
  )
}

function Chip({ task }: { task: GraphTask }) {
  const state = nodeState(task)
  const go = state === 'ready' || state === 'running'
  return (
    <Box as="span" inlineFlex flexNone items="center" gap="1.5" data-state-chip={state}>
      <StatusDot size={7} color={COLOR[state]} hollow={!go} />
      <Box as="span" css-color={COLOR[state]} css-letter-spacing=".12em" size="9">
        {STATE_CHIP[state]}
        <Box as="span" srOnly>
          {' '}
          ({STATE_WORD[state]})
        </Box>
      </Box>
    </Box>
  )
}

function Refs({ tasks, struck }: { tasks: { task: GraphTask; met?: boolean }[]; struck?: boolean }) {
  if (!tasks.length) return <span>—</span>
  return (
    <>
      {tasks.map(({ task, met }, i) => (
        <span key={task.id}>
          {i > 0 && ' · '}
          <Box as="span" css-text-decoration={struck || met ? 'line-through' : undefined} css-color={struck || met ? 'muted-strong-muted' : 'text'}>
            {task.id}
          </Box>
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
    <Box css-max-width="820" css-border-color="border" css-background="card" mb="2" rounded="[3px]" border="all" data-frontier-row={task.id}>
      <PlainButton
        type="button"
        aria-expanded={open}
        aria-controls={why}
        onClick={() => setOpen((o) => !o)}
        css-background="transparent"
        flex
        wFull
        cursorPointer
        items="baseline"
        gap="2.5"
        px="3.5"
        py="2.5"
        align="left"
      >
        <Box as="span" css-color={props.unlocked ? 'accent' : 'warn-muted'} flexNone size="12" weight="bold">
          {task.id}
        </Box>
        <Box as="span" css-color="text" minW0 flex1 truncate size="12">
          {task.title}
        </Box>
        <Chip task={task} />
      </PlainButton>
      {open && (
        <Box id={why} css-padding-left="30" css-line-height="1.6" px="3.5" pb="3" text105px tone="muted" data-frontier-why>
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
          <PlainButton type="button" css-color="accent" css-background="transparent" cursorPointer underline underlineOffset2 onClick={() => props.onOpenTree(task.id)}>
            open tree →
          </PlainButton>
          {' · '}
          <PlainButton type="button" css-color="accent" css-background="transparent" cursorPointer underline underlineOffset2 onClick={() => props.onOpen(task.id)}>
            details
          </PlainButton>
        </Box>
      )}
    </Box>
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

  if (!tree || !layout)
    return (
      <Hint as="p" size="sm">
        Nothing named {root.id} is in this workspace’s graph.
      </Hint>
    )
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
      const next = phone ? (order[at + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1)] ?? null) : nextNode(nodes, id, event.key)
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
      <Box css-font-family="ui-monospace-SFMono-Regular-Menlo-monospace" css-letter-spacing=".1em" css-color="muted-strong-muted" flex flexWrap items="baseline" gapX="3" size="11">
        <span data-tree-stat>
          tree of {label}: {tree.graph.tasks.length} {tree.graph.tasks.length === 1 ? 'node' : 'nodes'} · {tree.live} live {tree.live === 1 ? 'edge' : 'edges'}
        </span>
        <Box as="span" css-letter-spacing="0" css-color="text" truncate>
          {rootTitle(graph, root)}
        </Box>
        {root.kind === 'task' && (
          <PlainButton
            type="button"
            css-color="accent"
            css-background="transparent"
            css-letter-spacing="0"
            cursorPointer
            underline
            underlineOffset2
            onClick={() => props.onOpen(root)}
          >
            details
          </PlainButton>
        )}
      </Box>
      <Box
        ref={box}
        css-border-color="border"
        css-background="bg"
        css-overflow="auto"
        css-max-height={phone ? undefined : '70vh'}
        css-cursor={pan.panning ? 'grabbing' : 'grab'}
        css-user-select={pan.panning ? 'none' : undefined}
        overflow="auto"
        rounded="base"
        border="all"
        // overflow inline too: panning needs a real scroll box, host CSS or not.
        data-tree-scroll
        data-panning={pan.panning || undefined}
        {...pan.handlers}
      >
        {phone ? (
          // A phone: one column of cards, upstream first, the page scrolls.
          <Box
            role="group"
            aria-label={`Dependency tree of ${label}: ${tree.graph.tasks.length} tasks, ${tree.live} live edges`}
            aria-describedby={HINT_ID}
            as="ol"
            css-list-style="none"
            css-font-family="ui-monospace-SFMono-Regular-Menlo-monospace"
            m0
            flex
            flexCol
            gap="2"
            p="2"
            data-tree-list
          >
            {[...nodes]
              .sort((a, b) => a.x - b.x || a.y - b.y)
              .map((node) => {
                const task = node.task!
                const isRoot = tree.roots.has(node.id)
                const faded = tree.ghosts.has(node.id) || node.state === 'done'
                const draft = node.state === 'draft'
                const waits = layout.edges.filter((e) => e.to === node.id)
                return (
                  <Box key={node.id} data-tree-card={node.id} data-root={isRoot || undefined} data-draft={draft || undefined} as="li" css-opacity={faded ? 0.5 : draft ? 0.65 : 1}>
                    <Box
                      role="button"
                      tabIndex={node.id === cursor ? 0 : -1}
                      aria-label={`${node.id}, ${STATE_WORD[node.state]}${faded ? ', satisfied' : ''}${isRoot ? ', root' : ''}: ${task.title}`}
                      data-tree-node={node.id}
                      onClick={() => props.onReRoot({ kind: 'task', id: node.id })}
                      onKeyDown={(e) => onKey(e, node.id)}
                      onFocus={() => setCursor(node.id)}
                      data-tree-row
                      css-background="card"
                      css-border-color={isRoot ? 'accent' : 'border-strong-border'}
                      css-border-width={isRoot ? '2' : '1'}
                      css-border-style={draft ? 'dashed' : 'solid'}
                      flex
                      cursorPointer
                      flexCol
                      gap="0.5"
                      rounded="[3px]"
                      border="all"
                      px="3"
                      py="2"
                    >
                      <Box as="span" flex items="baseline" gap="2">
                        <Box
                          as="span"
                          css-color={faded ? TONE.mutedStrongMuted : COLOR[node.state]}
                          css-text-decoration={faded ? 'line-through' : undefined}
                          size="12"
                          weight="bold"
                        >
                          {node.id}
                        </Box>
                        <Box as="span" css-color={COLOR[node.state]} css-letter-spacing=".1em" ml="auto" size="9">
                          {tree.ghosts.has(node.id) ? 'MET' : STATE_CHIP[node.state]}
                        </Box>
                        <PlainButton
                          type="button"
                          tabIndex={-1}
                          aria-label={`Open ${node.id} details`}
                          data-tree-open={node.id}
                          css-color="muted"
                          css-background="transparent"
                          inlineFlex
                          cursorPointer
                          items="center"
                          p="0.5"
                          onClick={(e) => {
                            e.stopPropagation()
                            setCursor(node.id)
                            props.onOpen({ kind: 'task', id: node.id })
                          }}
                        >
                          <ExternalLink size={13} aria-hidden="true" />
                        </PlainButton>
                      </Box>
                      <Box as="span" css-color="text" size="11">
                        {task.title}
                      </Box>
                      {waits.length > 0 && (
                        <Box as="span" size="10" tone="muted">
                          waits on{' '}
                          {waits.map((e, i) => (
                            <Box key={e.from} as="span" css-text-decoration={e.satisfied ? 'line-through' : undefined}>
                              {i > 0 && ' · '}
                              {e.from}
                              {e.kind === 'sequence' ? ' (sequence)' : ''}
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>
                  </Box>
                )
              })}
          </Box>
        ) : (
          <SvgRoot
            role="group"
            aria-label={`Dependency tree of ${label}: ${tree.graph.tasks.length} tasks, ${tree.live} live edges`}
            aria-describedby={HINT_ID}
            width="100%"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMinYMin meet"
            css-display="block"
            css-font-family="ui-monospace-SFMono-Regular-Menlo-monospace"
            css-max-width={width}
            css-min-width={Math.round(width * 0.85)}
          >
            <defs>
              <marker id="avoozl-tree-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto">
                <SvgPath d="M0,0 L10,5 L0,10 z" css-fill="muted" />
              </marker>
            </defs>
            {layout.edges.map((edge) => {
              const target = nodes.find((n) => n.id === edge.to)
              const color = edge.satisfied ? TONE.mutedStrongMuted : COLOR[target?.state ?? 'waiting']
              return (
                <SvgPath
                  key={`${edge.from}->${edge.to}`}
                  d={edgePath(edge.points)}
                  fill="none"
                  data-tree-edge={`${edge.from}->${edge.to}`}
                  data-met={edge.satisfied || undefined}
                  strokeWidth={1.6}
                  strokeDasharray={edge.kind === 'sequence' ? '3 6' : edge.satisfied ? '2 5' : undefined}
                  markerEnd="url(#avoozl-tree-arrow)"
                  css-stroke={color}
                  css-opacity={edge.satisfied ? '0.4' : '0.8'}
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
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  opacity={faded ? 0.5 : draft ? 0.65 : 1}
                  data-tree-card={node.id}
                  data-root={isRoot || undefined}
                  data-draft={draft || undefined}
                >
                  <SvgG
                    role="button"
                    tabIndex={node.id === cursor ? 0 : -1}
                    aria-label={`${node.id}, ${STATE_WORD[node.state]}${faded ? ', satisfied' : ''}${isRoot ? ', root' : ''}: ${task.title}`}
                    data-tree-node={node.id}
                    onClick={() => props.onReRoot({ kind: 'task', id: node.id })}
                    onKeyDown={(e) => onKey(e, node.id)}
                    onFocus={() => setCursor(node.id)}
                    css-cursor="pointer"
                    css-outline="none"
                  >
                    {isRoot && <SvgRect x={-4} y={-4} width={CARD.w + 8} height={CARD.h + 8} rx={6} fill="none" css-stroke="accent" css-opacity="0.35" />}
                    <SvgRect
                      width={CARD.w}
                      height={CARD.h}
                      rx={3}
                      strokeWidth={isRoot ? 2 : 1.2}
                      strokeDasharray={draft ? '5 3' : undefined}
                      css-fill="card"
                      css-stroke={isRoot ? 'accent' : 'border-strong-border'}
                    />
                    <SvgText x={11} y={20} fontSize={13} fontWeight={700} textDecoration={faded ? 'line-through' : undefined} css-fill={faded ? TONE.mutedStrongMuted : color}>
                      {clip(node.id, 18)}
                    </SvgText>
                    <SvgText x={CARD.w - 30} y={20} fontSize={10.5} letterSpacing=".1em" textAnchor="end" css-fill={color}>
                      {faded && tree.ghosts.has(node.id) ? 'MET' : STATE_CHIP[node.state]}
                    </SvgText>
                    <SvgText x={11} y={39} fontSize={11.5} css-fill="muted">
                      {clip(task.title, 24)}
                    </SvgText>
                  </SvgG>
                  <SvgG
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
                    css-cursor="pointer"
                  >
                    <title>Open {node.id} details</title>
                    <SvgRect width={20} height={20} rx={4} css-fill="transparent" />
                    <SvgG transform="translate(4,4)" css-color="muted">
                      <ExternalLink size={12} aria-hidden="true" />
                    </SvgG>
                  </SvgG>
                </g>
              )
            })}
          </SvgRoot>
        )}
      </Box>
      <TreeStyle />
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
      <Box as="dd" m0>
        {value}
      </Box>
    </>
  )
  const openTree = (id: string) => props.onTree({ kind: 'task', id })
  const link = (id: string) => (
    <PlainButton type="button" css-background="transparent" css-color="text" cursorPointer underline onClick={() => props.onTree({ kind: 'task', id })}>
      {id}
    </PlainButton>
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
        <Box as="p" css-border-color="border-strong-border" m0 mb="2" rounded="base" border="all" borderDashed px="3" py="2" size="sm" data-draft-note>
          Spec <code>{draftSpec.name}</code> is a draft ({draftSpec.status}). {task ? 'This task' : 'Its tasks'} cannot start until the spec is approved in Specs.
        </Box>
      )}
      {task ? (
        <Box as="dl" css-grid-template-columns="max-content-1fr" css-column-gap="12" m0 grid gap="1" size="sm">
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
        </Box>
      ) : item.kind === 'spec' ? (
        <Box flex flexCol gap="2" size="sm">
          <Hint as="p" flush>
            Spec <code>{item.id}</code> · {members.length} tasks · {members.filter((t) => nodeState(t) === 'done').length} done
          </Hint>
          <Box as="ul" css-list-style="none" m0 flex flexCol gap="1" p="0">
            {members.map((t) => (
              <Box key={t.id} as="li" flex items="baseline" gap="2">
                {link(t.id)}
                <Box as="span" minW0 flex1 truncate>
                  {t.title}
                </Box>
                <Chip task={t} />
              </Box>
            ))}
          </Box>
        </Box>
      ) : (
        <Hint as="p" size="sm" flush>
          {item.id} is not in this workspace’s graph.
        </Hint>
      )}
    </Modal>
  )
}
