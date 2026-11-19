import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Tooltip } from './ui/Tooltip.tsx'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import Badge from './ui/Badge.tsx'
import { safeHref, sessionLabel, viewsClient, type ContentReport } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import { ItemDetails, type Act, type Supersede } from './DeliveryDetails.tsx'
import { useTaskDrawer } from './drawer-context.ts'
import { Authority } from './Authority.tsx'
import { useRead } from './useRead.ts'
import {
  DONE_LANE,
  LANES,
  LANE_LABEL_WIDTH,
  canStartNow,
  chipCounts,
  deliveryLanes,
  loadLabel,
  machineLoads,
  drawnLane,
  filterLanes,
  laneBackground,
  laneColumns,
  laneForState,
  laneWidth,
  progressGroups,
  resumeStatus,
  type DrawnLaneId,
  type LaneCard,
  THIS_MAC,
  type LaneId,
  type MachineLoad,
} from './delivery-api.ts'
import { useMedia } from './use-media.ts'
import { HandSetReview, ReviewRuns } from './ReviewState.tsx'
import type { Graph } from './views-api.ts'
import { useSharedFilter } from './FilterBar.tsx'
import { NO_GROUP, NO_REPOSITORY, filterActive, filterChoices, planKey, type TaskFilter } from './filters.ts'
import { STATES } from './graph-layout.ts'
import { IconLabel, SectionHeading, ShowMore, TaskTitleLink, ViewHeading, usePages } from './ui/controls.tsx'
import { DetailsIcon, FileText, Folder, Layers, ListFilter, Pause, Play, RefreshCw, RotateCcw, X } from './icons.ts'
import { chatClient } from './chat-api.ts'
import { DEFER_TIP, RESUME_TIP, RETRY_TIP, START_TIP } from './delivery-api.ts'
import { linkHref } from './views-api.ts'
import { Picker } from './Picker.tsx'
import { StopLineButton } from './StopLine.tsx'
import { NAV_ICON } from './LeftNav.tsx'
import { NavSlotFor } from './nav-slot.tsx'
import { RailBlock, RailChips, RailDivider, RailRow, RailStyle } from './NavRail.tsx'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { TextLink } from './ui/TextLink'
import { Box } from './ui/Box'
import { LaneStyle } from './ui/PageStyles'
import { PlainButton, PlainInput, PlainLink } from './ui/Plain'

function LaneCardView(props: {
  card: LaneCard
  canDefer: boolean
  resume: string | null
  busy: boolean
  act: Act
  client: ReturnType<typeof viewsClient>
  workspaceId: string
  revision: number
  onSupersede: Supersede
  onStart: (id: string) => void
  ready: boolean
  phase?: 'running' | 'reviewing'
  graph: Graph | null
  // The machines this task's chats run on (In progress cards show them).
  machines: string[]
  // A narrow lane: buttons show their icons alone.
  compact?: boolean
}) {
  const { card, busy, act, client, workspaceId } = props
  const label = (text: string) => (props.compact ? { 'aria-label': text, children: null } : { children: text })
  const drawer = useTaskDrawer()
  const local = card.authority === 'local'
  const issue = safeHref(card.issue?.url ?? null)
  const done = card.item?.complete ?? false
  return (
    <li data-lane-card>
      <Box css-overflow-wrap="break-word">
          {/* In a narrow lane the title wraps below its icon rather than split words. */}
          <div className={`flex items-start gap-2 ${props.compact ? 'flex-wrap' : ''}`}>
            {props.phase && <StateIcon phase={props.phase} />}
            <TaskTitleLink id={card.id} title={card.title} size={props.compact ? 'sm' : 'base'} weight="semibold" tight />
          </div>
          <Box mt="1" flex flexWrap items="center" gap="1.5" size="xs" tone="muted">
            <span>{card.id}</span>
            {card.epic && <Badge>{card.epic}</Badge>}
            {card.plan && <span>{card.plan}{card.phase ? ` · ${card.phase.title}` : ''}</span>}
            <Authority owner={{ authority: card.authority, issue: card.issue }} />
            {props.phase && (
              <span data-machine-badge>
                <Badge>{props.machines.join(', ')}</Badge>
              </span>
            )}
            {card.attempt !== null && <Badge>attempt {card.attempt}</Badge>}
            {card.reviewRounds > 0 && <Badge>{card.reviewRounds} review rounds</Badge>}
            {card.deliveryState && <Badge variant={card.deliveryState === 'decision' ? 'warning' : undefined}>{card.deliveryState}</Badge>}
            {card.manual && <Badge variant="warning">Manual</Badge>}
            {card.deferred && <Badge>deferred</Badge>}
            {card.review && <Badge>review</Badge>}
            {card.planArchived && <Badge>Archived</Badge>}
          </Box>
          {card.subIssue && (
            <Box as="p" css-color="warning-muted" mt="1" size="xs" data-sub-issue>
              {card.subIssue.reason}
            </Box>
          )}
          {card.batch && (
            <Box mt="1.5" size="xs" data-batch-card={card.batch.id}>
              <Box flex flexWrap items="center" gap="1.5">
                <Badge>Batch of {card.batch.members.length}</Badge>
                {card.batch.reason && <Hint>{card.batch.reason}</Hint>}
              </Box>
              <Box as="ul" mt="1" flex flexCol gap="0.5" aria-label="Tasks in this batch">
                {card.batch.members.map((member) => (
                  <li key={member.id} data-batch-member={member.id}>
                    <TaskTitleLink id={member.id} title={`${member.id} ${member.title}`} size="xs" />
                  </li>
                ))}
              </Box>
            </Box>
          )}
          {card.alone && (
            <Box as="p" mt="1" size="xs" tone="muted" data-runs-alone>
              Runs alone: {card.alone}
            </Box>
          )}
          {card.item && (
            <Box mt="1.5">
              <ReviewRuns item={card.item} compact onInfo={() => drawer.openTask(card.id)} />
            </Box>
          )}
          {card.handSetReview && (
            <Box mt="1.5">
              <HandSetReview
                compact
                workspaceId={workspaceId}
                task={{ id: card.id, title: card.title, authority: card.authority, nextAction: card.nextAction, noSession: card.noSession }}
                graph={props.graph}
                revision={props.revision}
                onChanged={() => act(() => Promise.resolve())}
              />
            </Box>
          )}
          {card.sessions.length > 0 && (
            <Box as="ul" mt="1.5" flex flexCol gap="1" size="xs">
              {card.sessions.map((session) => (
                <li key={session.slot}>
                  {session.link ? (
                    <TextLink href={linkHref(session.link)}>
                      {sessionLabel(session)}
                    </TextLink>
                  ) : (
                    sessionLabel(session)
                  )}
                </li>
              ))}
            </Box>
          )}
          <Box mt="1.5" flex flexWrap gap="2">
            {props.ready && canStartNow(card) && (
              <IconLabel icon={Play} disabled={busy} tooltip={START_TIP} onClick={() => props.onStart(card.id)} {...label('Start now')} />
            )}
            {card.deliveryState === 'decision' && (
              <IconLabel icon={RotateCcw} disabled={busy} tooltip={RETRY_TIP} onClick={() => act(() => client.retry(workspaceId, card.id))} {...label('Retry')} />
            )}
            {!done && local && props.canDefer && !card.deferred && (
              <IconLabel
                icon={Pause}
                disabled={busy}
                tooltip={DEFER_TIP}
                onClick={() => act(() => client.updateTask(workspaceId, card.id, { status: 'deferred' }, props.revision))}
                {...label('Defer')}
              />
            )}
            {!done && local && card.deferred && props.resume && (
              <IconLabel
                icon={Play}
                disabled={busy}
                tooltip={RESUME_TIP}
                onClick={() => act(() => client.updateTask(workspaceId, card.id, { status: props.resume }, props.revision))}
                {...label('Resume')}
              />
            )}
            {!done && !local && issue && (
              <Tooltip text="Open the issue; move its Project card to Deferred to pause it">
                <PlainLink href={linkHref(issue)} target="_blank" rel="noreferrer" self="center" size="xs" underline>
                  Defer on the board
                </PlainLink>
              </Tooltip>
            )}
            <IconLabel icon={DetailsIcon} tooltip="Open this task's details in the drawer" onClick={() => drawer.openTask(card.id)} {...label('Details')} />
          </Box>
      </Box>
    </li>
  )
}

// A small moving icon for an In progress card: a turning gear while a worker
// codes, a magnifier sweeping while a reviewer or checks chat reads. Theme
// colors only, never the warning yellow ("needs you"). Under
// prefers-reduced-motion the icon is drawn without its animation.
export function StateIcon({ phase }: { phase: 'running' | 'reviewing' }) {
  const still = useMedia('(prefers-reduced-motion: reduce)')
  const label = phase === 'running' ? 'Running: a worker is coding' : 'Reviewing: a reviewer or checks chat is reading'
  const color = phase === 'running' ? 'var(--tile-purple, var(--accent))' : 'var(--accent)'
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" role="img" aria-label={label} style={{ flex: 'none', marginTop: 2, color }}>
      <title>{label}</title>
      {phase === 'running' ? (
        <g>
          <path
            fill="currentColor"
            d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.9 2.4-2-.3a7 7 0 0 0-.8-1.9l1.2-1.6-1.6-1.6-1.6 1.2a7 7 0 0 0-1.9-.8l-.3-2h-2.2l-.3 2a7 7 0 0 0-1.9.8L7.9 5.5 6.3 7.1l1.2 1.6a7 7 0 0 0-.8 1.9l-2 .3v2.2l2 .3c.2.7.4 1.3.8 1.9l-1.2 1.6 1.6 1.6 1.6-1.2c.6.4 1.2.6 1.9.8l.3 2h2.2l.3-2c.7-.2 1.3-.4 1.9-.8l1.6 1.2 1.6-1.6-1.2-1.6c.4-.6.6-1.2.8-1.9l2-.3v-2.2Z"
          />
          {!still && (
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="3s" repeatCount="indefinite" />
          )}
        </g>
      ) : (
        <g>
          <circle cx={10.5} cy={10.5} r={5.5} fill="none" stroke="currentColor" strokeWidth={2} />
          <path d="M14.6 14.6 20 20" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
          {!still && (
            <animateTransform
              attributeName="transform"
              type="translate"
              values="-2 0; 2 0; -2 0"
              dur="2.4s"
              repeatCount="indefinite"
            />
          )}
        </g>
      )}
    </svg>
  )
}

const LANE_GAP = 16


// The width a box has, kept current as it resizes.
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(1200)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(element.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// The lanes, sharing the width: all in one row above phone width, 1 per row on a phone.
export function DeliveryBoard(props: {
  lanes: Record<LaneId, LaneCard[]>
  only?: DrawnLaneId
  narrow: boolean
  // Chats running per machine; one line above the In progress cards.
  machines?: MachineLoad[]
  card: (card: LaneCard, phase?: 'running' | 'reviewing', compact?: boolean) => ReactNode
  // A filter change: every lane starts over at its first page.
  reset?: string
}) {
  const { lanes, narrow } = props
  const { ref, width } = useWidth<HTMLDivElement>()
  const drawn = props.only === 'done' ? [DONE_LANE] : LANES.filter((lane) => !props.only || lane.id === props.only)
  const columns = laneColumns(width, drawn.length, LANE_GAP, narrow)
  const [folded, setFolded] = useState<Set<DrawnLaneId>>(new Set(['waiting']))
  const pages = usePages(props.reset ?? '')
  const single = columns === 1
  const compact = !single && laneWidth(width, columns, LANE_GAP) < LANE_LABEL_WIDTH
  const list = (id: string, cards: LaneCard[], phase?: 'running' | 'reviewing') => (
    <Stack as="ul">
      {pages.take(id, cards).map((card) => props.card(card, phase, compact))}
      {pages.more(id, cards.length).left > 0 && (
        <li className={compact ? 'px-2' : 'px-3'}>
          <ShowMore {...pages.more(id, cards.length)} />
        </li>
      )}
    </Stack>
  )
  return (
    <>
      <LaneStyle />
    <div
      ref={ref}
      data-lane-columns={columns}
      data-lane-compact={compact || undefined}
      style={{ display: 'grid', gap: LANE_GAP, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, alignItems: 'start' }}
    >
      {drawn.map((lane) => {
        const cards = drawnLane(lanes, lane.id)
        const shut = (single || narrow) && folded.has(lane.id)
        return (
          <section
            key={lane.id}
            aria-label={`${lane.label}: ${cards.length}`}
            className={`flex min-w-0 flex-col gap-2 rounded-lg border ${compact ? 'py-2' : 'py-3'}`}
            style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)', ['--lane-line' as string]: laneBackground(lane.tint) }}
          >
            <button
              type="button"
              className={`flex items-center gap-2 text-left text-sm font-semibold ${compact ? 'px-2' : 'px-3'}`}
              aria-expanded={!shut}
              onClick={() => {
                const next = new Set(folded)
                if (next.has(lane.id)) next.delete(lane.id)
                else next.add(lane.id)
                setFolded(next)
              }}
              disabled={!(single || narrow)}
            >
              {(single || narrow) && <span aria-hidden="true">{shut ? '▸' : '▾'}</span>}
              {lane.label}
              <Badge variant={lane.id === 'needs-you' && cards.length ? 'warning' : undefined}>{cards.length}</Badge>
            </button>
            {!shut &&
              (cards.length === 0 ? (
                <p className={`text-xs text-muted ${compact ? 'px-2' : 'px-3'}`}>None</p>
              ) : lane.id === 'in-progress' ? (
                <>
                  {props.machines?.length ? (
                    <p className={`text-xs text-muted ${compact ? 'px-2' : 'px-3'}`} data-machine-counts>
                      {props.machines.map(loadLabel).join(' · ')}
                    </p>
                  ) : null}
                  {progressGroups(lanes).map((group) => (
                    <Stack key={group.id} gap={2} role="group" aria-label={`${group.label}: ${group.cards.length}`}>
                      <h4 className={`flex items-center gap-1.5 ${compact ? 'px-2' : 'px-3'} text-xs font-semibold uppercase tracking-wide text-muted`}>
                        {group.label} <Badge>{group.cards.length}</Badge>
                      </h4>
                      {list(`${lane.id}:${group.id}`, group.cards, group.id)}
                    </Stack>
                  ))}
                </>
              ) : (
                list(lane.id, cards)
              ))}
          </section>
        )
      })}
    </div>
    </>
  )
}

// Lanes sit side by side on a wide page and stack, folded, on a narrow one.
function useNarrow() {
  return useMedia('(max-width: 767px)')
}

// The Delivery page's filters in the left nav, under Dashboards, drawn as
// the Specs rail draws its own (NavRail.tsx): search, state rows, Needs me,
// Show archived and Show superseded, then Epic, Spec and Repository chips.
// The filter is the one Graph shares (useSharedFilter).
function DeliveryFilters(props: {
  filter: TaskFilter
  onChange: (filter: TaskFilter) => void
  cards: LaneCard[]
  choices: ReturnType<typeof filterChoices>
  superseded: number
  showSuperseded: boolean
  onSuperseded: (on: boolean) => void
}) {
  const { filter, cards, choices } = props
  const set = (change: Partial<TaskFilter>) => {
    const next: Record<string, unknown> = { ...filter, ...change }
    for (const key of Object.keys(next)) if (next[key] === undefined || next[key] === '' || next[key] === false) delete next[key]
    props.onChange(next as TaskFilter)
  }
  const active = filterActive(filter)
  const states = new Map<string, number>()
  for (const card of cards) states.set(card.state, (states.get(card.state) ?? 0) + 1)
  return (
    <NavSlotFor section="dashboard">
      <div role="search" aria-label="Filter delivery" data-nav-filters="avoozl-delivery" data-rail>
        <RailStyle />
        <RailBlock
          first
          id="filters"
          icon={ListFilter}
          title="Filters"
          action={
            active && (
              <PlainButton type="button" data-rail-icon onClick={() => props.onChange({})} css-gap="2" css-align-items="center" css-font-size="12">
                <X size={11} aria-hidden="true" /> Clear
              </PlainButton>
            )
          }
        >
          {/* The search sits under the Filters header, above All states. */}
          <PlainInput
            type="search"
            aria-label="Search tasks"
            placeholder="Task name or ID"
            value={filter.q ?? ''}
            onChange={(event) => set({ q: event.target.value || undefined })}
            css-width="100%" css-box-sizing="border-box" css-margin-bottom="8" css-font-size="13" css-padding="6px-12px" css-border-radius="6" css-background="bg" css-color="text" css-border="1px-solid-border"
          />
          <RailRow label="All states" active={!filter.state} onClick={() => set({ state: undefined })} attrs={{ 'data-rail-state': '' }} />
          {STATES.filter((state) => states.has(state.id) || filter.state === state.id).map((state) => (
            <RailRow
              key={state.id}
              label={state.label}
              active={filter.state === state.id}
              onClick={() => set({ state: filter.state === state.id ? undefined : state.id })}
              attrs={{ 'data-rail-state': state.id }}
              trail={<Box as="span" css-font-size="12" css-color="muted" css-font-variant-numeric="tabular-nums">{states.get(state.id) ?? 0}</Box>}
            />
          ))}
          <RailDivider />
          <RailRow label="Needs me" active={Boolean(filter.needsYou)} onClick={() => set({ needsYou: !filter.needsYou })} />
          <RailRow label="Show archived" active={Boolean(filter.archived)} onClick={() => set({ archived: !filter.archived })} />
          {props.superseded > 0 && <RailRow label={`Show superseded (${props.superseded})`} active={props.showSuperseded} onClick={() => props.onSuperseded(!props.showSuperseded)} />}
        </RailBlock>
        <RailChips id="epics" icon={Layers} title="Epics" noun="epic" items={chipCounts(choices.epics, cards, (card) => card.epicId ?? NO_GROUP)} picked={filter.epic} onPick={(epic) => set({ epic })} />
        <RailChips id="specs" icon={FileText} title="Specs" noun="spec" items={chipCounts(choices.plans, cards, planKey)} picked={filter.plan} onPick={(plan) => set({ plan, phase: undefined })} />
        <RailChips id="repositories" icon={Folder} title="Repositories" noun="repository" items={chipCounts(choices.repositories, cards, (card) => card.repository ?? NO_REPOSITORY)} picked={filter.repository} onPick={(repository) => set({ repository })} />
      </div>
    </NavSlotFor>
  )
}

export default function DeliveryView({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => viewsClient(api), [api])
  const chats = useMemo(() => chatClient(api), [api])
  const load = useCallback(
    async (id: string) => {
      const [page, graph, workers] = await Promise.all([
        client.deliveryPage(id),
        client.graph(id).catch(() => null),
        client.remote(id).then((r) => r.workers, () => []),
      ])
      return { items: page.items, graph, reports: page.contentReports ?? [], workers, laneLimit: page.laneLimit ?? null }
    },
    [client],
  )
  const { value, error, busy, reload } = useRead(workspaceId, load)
  const narrow = useNarrow()
  const [filter, setFilter] = useSharedFilter(workspaceId)
  const [showSuperseded, setShowSuperseded] = useState(false)
  const [acting, setActing] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const act: Act = (call) => {
    setActing(true)
    setMessage(null)
    void (async () => {
      try {
        await call()
        await reload()
      } catch (caught) {
        setMessage({ ok: false, text: errorMessage(caught) })
      } finally {
        setActing(false)
      }
    })()
  }
  const start = (id: string) => {
    if (!workspaceId) return
    setActing(true)
    setMessage(null)
    void chats
      .start(workspaceId, id)
      .then((result) => setMessage({ ok: !result.full, text: result.message }))
      .catch((caught: unknown) => setMessage({ ok: false, text: errorMessage(caught) }))
      .finally(() => setActing(false))
  }
  const onSupersede = useCallback<Supersede>(
    async (id, create) => {
      if (!workspaceId) return
      await client.supersede(workspaceId, id, create)
      await reload()
    },
    [client, workspaceId, reload],
  )

  const all = useMemo(() => (value ? deliveryLanes(value.graph, value.items) : null), [value])
  const lanes = all ? filterLanes(all, filter) : null
  const choices = useMemo(() => filterChoices(value?.graph ?? null, {}, filter.plan), [value, filter.plan])
  // Start now (§8.9): any ready task Avoozl codes itself, by search.
  const startable = useMemo(
    () => (all?.ready ?? []).filter(canStartNow).map((card) => ({ id: card.id, title: card.title, spec: card.spec, state: card.state })),
    [all],
  )
  const machines = useMemo(() => (value ? machineLoads(value.items, value.workers, value.laneLimit) : null), [value])
  const members = lanes ? new Set(Object.values(lanes).flat().map((card) => card.id)) : null
  const totalCount = all ? Object.values(all).flat().length : 0
  const shownCount = members?.size ?? 0
  const reports = (value?.reports ?? []).filter((r) => !members || !r.taskId || members.has(r.taskId))
  const superseded = value?.items.filter((item) => item.status === 'superseded') ?? []
  const canDefer = Boolean(value?.graph?.statuses.some((s) => s.id === 'deferred'))
  const resume = resumeStatus(value?.graph ?? null)
  const revision = value?.graph?.revision ?? 0

  return (
    <Box aria-labelledby="avoozl-delivery-title" as="section" flex flexCol gap="3.5">
      <ViewHeading
        id="avoozl-delivery-title"
        view="delivery"
        meta={
          <Hint role="status" size="xs">
            {acting ? 'Working…' : ''}
          </Hint>
        }
        actions={
          workspaceId && (
            <>
              {/* One row: Start now and its box, Refresh, then Stop the line. */}
              {startable.length > 0 && (
                <Box data-start-now-picker css-min-width="14rem">
                  <Picker inline label="Start now" items={startable} value="" keep={false} onPick={start} placeholder="Find a ready task" maxWidth="24rem" />
                </Box>
              )}
              <Tooltip text="Refresh">
                <button type="button" data-delivery-refresh aria-label="Refresh" onClick={() => void reload()} disabled={busy || acting} style={{ ...NAV_ICON, color: 'var(--muted)' }}>
                  <RefreshCw size={14} aria-hidden="true" />
                </button>
              </Tooltip>
              <StopLineButton nav workspaceId={workspaceId} />
            </>
          )
        }
      >
        Delivery
      </ViewHeading>
      {(error || message) && (
        <p role={error || !message?.ok ? 'alert' : 'status'} className={`text-sm ${error || !message?.ok ? 'text-danger' : 'text-muted'}`}>
          {error ?? message?.text}
        </p>
      )}
      {!workspaceId ? (
        <Hint as="p" size="sm">Choose a workspace in the header.</Hint>
      ) : !lanes ? (
        <Hint as="p" size="sm">{busy ? 'Loading…' : 'Not loaded'}</Hint>
      ) : (
        <>
          <DeliveryFilters
            filter={filter}
            onChange={setFilter}
            cards={all ? Object.values(all).flat() : []}
            choices={choices}
            superseded={superseded.length}
            showSuperseded={showSuperseded}
            onSuperseded={setShowSuperseded}
          />
          <Hint size="xs" role="status" data-filter-status>
            {shownCount} of {totalCount} tasks
          </Hint>
          <DeliveryBoard
            lanes={lanes}
            only={laneForState(filter.state)}
            narrow={narrow}
            machines={machines?.loads ?? []}
            reset={JSON.stringify(filter)}
            card={(card, phase, compact) => (
              <LaneCardView
                key={card.id}
                card={card}
                phase={phase}
                compact={compact}
                ready={lanes.ready.includes(card)}
                canDefer={canDefer}
                resume={resume}
                busy={acting}
                act={act}
                client={client}
                workspaceId={workspaceId}
                revision={revision}
                onSupersede={onSupersede}
                onStart={start}
                graph={value?.graph ?? null}
                machines={machines?.hostsOf.get(card.id) ?? [THIS_MAC]}
              />
            )}
          />
          {reports.length > 0 && <ContentReports reports={reports} />}
          {showSuperseded && (
            <Stack as="ul" gap={2}>
              {superseded.map((item) => (
                <li key={item.id}>
                  <Card>
                    <SectionHeading title={item.title} meta={<Hint size="sm">{item.id}</Hint>} mb="2" />
                    <ItemDetails item={item} onSupersede={onSupersede} />
                  </Card>
                </li>
              ))}
            </Stack>
          )}
        </>
      )}
    </Box>
  )
}

// `report` content rules (design §4.9): matches in content that was written.
// Each names the rule set, rule and place, never the matched text.
function ContentReports({ reports }: { reports: ContentReport[] }) {
  return (
    <Card>
      <SectionHeading title="Content rule reports" mb="2" />
      <Box as="p" mt="1" size="xs" tone="muted">
        A rule set whose action is report lets the content through and records the match here. Change the set to block once
        its rules are right.
      </Box>
      <Box as="ul" mt="2" flex flexCol gap="1" size="sm">
        {reports.map((report) => (
          <Box key={report.id} as="li" flex flexWrap items="center" gap="1.5">
            <Badge>{report.set}</Badge>
            <span>
              Rule {report.rule} at {report.target}
              {report.line ? ` line ${report.line}` : ''} ({report.boundary})
            </span>
            {report.taskId && <Hint size="xs">{report.taskId}</Hint>}
            {report.at && <Hint size="xs">{report.at.slice(0, 16).replace('T', ' ')}</Hint>}
          </Box>
        ))}
      </Box>
    </Card>
  )
}
