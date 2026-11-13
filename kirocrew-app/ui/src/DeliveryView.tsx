import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { safeHref, sessionLabel, viewsClient, type ContentReport } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import { ItemDetails, type Act, type Supersede } from './DeliveryDetails.tsx'
import { useTaskDrawer } from './drawer-context.ts'
import { Authority } from './Authority.tsx'
import { useRead } from './useRead.ts'
import {
  DONE_LANE,
  LANES,
  canStartNow,
  deliveryLanes,
  drawnLane,
  filterLanes,
  laneBackground,
  laneColumns,
  laneForState,
  progressGroups,
  resumeStatus,
  type DrawnLaneId,
  type LaneCard,
  type LaneId,
} from './delivery-api.ts'
import { useMedia } from './TaskDrawer.tsx'
import { HandSetReview, ReviewRuns } from './ReviewState.tsx'
import type { Graph } from './views-api.ts'
import { FilterBar, useSharedFilter } from './FilterBar.tsx'
import { filterChoices } from './filters.ts'
import { IconLabel, SectionHeading, ShowMore, ViewHeading, usePages } from './controls.tsx'
import { DetailsIcon, Pause, Play, RefreshCw, RotateCcw } from './icons.ts'
import { chatClient } from './chat-api.ts'
import { DEFER_TIP, RESUME_TIP, RETRY_TIP, START_TIP } from './delivery-api.ts'
import { routingClient } from './routing-api.ts'

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
}) {
  const { card, busy, act, client, workspaceId } = props
  const drawer = useTaskDrawer()
  const api = useAppApi()
  const routing = useMemo(() => routingClient(api), [api])
  // Pick again (R53.6): offered once a worker's agent and model were chosen.
  const picked = card.sessions.some((s) => s.role === 'worker' && s.sessionReason)
  const local = card.authority === 'local'
  const issue = safeHref(card.issue?.url ?? null)
  const done = card.item?.complete ?? false
  return (
    <li>
      <Card>
        <div className="p-1">
          <div className="flex items-start gap-2">
            {props.phase && <StateIcon phase={props.phase} />}
            <button type="button" className="text-left text-base font-semibold leading-snug hover:underline" onClick={() => drawer.openTask(card.id)}>
              {card.title}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{card.id}</span>
            {card.epic && <Badge>{card.epic}</Badge>}
            <Authority owner={{ authority: card.authority, issue: card.issue }} />
            {card.attempt !== null && <Badge>attempt {card.attempt}</Badge>}
            {card.reviewRounds > 0 && <Badge>{card.reviewRounds} review rounds</Badge>}
            {card.deliveryState && <Badge variant={card.deliveryState === 'decision' ? 'warning' : undefined}>{card.deliveryState}</Badge>}
            {card.deferred && <Badge>deferred</Badge>}
            {card.review && <Badge>review</Badge>}
            {card.planArchived && <Badge>Archived</Badge>}
          </div>
          {card.item && (
            <div className="mt-2.5">
              <ReviewRuns item={card.item} compact onInfo={() => drawer.openTask(card.id)} />
            </div>
          )}
          {card.handSetReview && (
            <div className="mt-2.5">
              <HandSetReview
                compact
                workspaceId={workspaceId}
                task={{ id: card.id, title: card.title, authority: card.authority, nextAction: card.nextAction, noSession: card.noSession }}
                graph={props.graph}
                revision={props.revision}
                onChanged={() => act(() => Promise.resolve())}
              />
            </div>
          )}
          {card.sessions.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1 text-xs">
              {card.sessions.map((session) => (
                <li key={session.slot}>
                  {session.link ? (
                    <a href={session.link} className="underline">
                      {sessionLabel(session)}
                    </a>
                  ) : (
                    sessionLabel(session)
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {props.ready && canStartNow(card) && (
              <IconLabel icon={Play} disabled={busy} tooltip={START_TIP} onClick={() => props.onStart(card.id)}>
                Start now
              </IconLabel>
            )}
            {picked && !done && (
              <IconLabel icon={RefreshCw} disabled={busy} tooltip="The next attempt picks its agent and model afresh" onClick={() => act(() => routing.pickAgain(workspaceId, card.id))}>
                Pick again
              </IconLabel>
            )}
            {card.deliveryState === 'decision' && (
              <IconLabel icon={RotateCcw} disabled={busy} tooltip={RETRY_TIP} onClick={() => act(() => client.retry(workspaceId, card.id))}>
                Retry
              </IconLabel>
            )}
            {!done && local && props.canDefer && !card.deferred && (
              <IconLabel
                icon={Pause}
                disabled={busy}
                tooltip={DEFER_TIP}
                onClick={() => act(() => client.updateTask(workspaceId, card.id, { status: 'deferred' }, props.revision))}
              >
                Defer
              </IconLabel>
            )}
            {!done && local && card.deferred && props.resume && (
              <IconLabel
                icon={Play}
                disabled={busy}
                tooltip={RESUME_TIP}
                onClick={() => act(() => client.updateTask(workspaceId, card.id, { status: props.resume }, props.revision))}
              >
                Resume
              </IconLabel>
            )}
            {!done && !local && issue && (
              <Tooltip text="Open the issue; move its Project card to Deferred to pause it">
                <a href={issue} target="_blank" rel="noreferrer" className="self-center text-xs underline">
                  Defer on the board
                </a>
              </Tooltip>
            )}
            <IconLabel icon={DetailsIcon} tooltip="Open this task's details in the drawer" onClick={() => drawer.openTask(card.id)}>
              Details
            </IconLabel>
          </div>
        </div>
      </Card>
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

// The lanes, sharing the width: 4, 2 or 1 per row as the page narrows.
export function DeliveryBoard(props: {
  lanes: Record<LaneId, LaneCard[]>
  only?: DrawnLaneId
  narrow: boolean
  card: (card: LaneCard, phase?: 'running' | 'reviewing') => ReactNode
  // A filter change: every lane starts over at its first page.
  reset?: string
}) {
  const { lanes, narrow } = props
  const { ref, width } = useWidth<HTMLDivElement>()
  const drawn = props.only === 'done' ? [DONE_LANE] : LANES.filter((lane) => !props.only || lane.id === props.only)
  const columns = laneColumns(width, drawn.length, LANE_GAP)
  const [folded, setFolded] = useState<Set<DrawnLaneId>>(new Set(['waiting']))
  const pages = usePages(props.reset ?? '')
  const single = columns === 1
  const list = (id: string, cards: LaneCard[], phase?: 'running' | 'reviewing') => (
    <ul className="flex flex-col gap-3">
      {pages.take(id, cards).map((card) => props.card(card, phase))}
      {pages.more(id, cards.length).left > 0 && (
        <li>
          <ShowMore {...pages.more(id, cards.length)} />
        </li>
      )}
    </ul>
  )
  return (
    <div
      ref={ref}
      data-lane-columns={columns}
      style={{ display: 'grid', gap: LANE_GAP, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, alignItems: 'start' }}
    >
      {drawn.map((lane) => {
        const cards = drawnLane(lanes, lane.id)
        const shut = (single || narrow) && folded.has(lane.id)
        return (
          <section
            key={lane.id}
            aria-label={`${lane.label}: ${cards.length}`}
            className="flex min-w-0 flex-col gap-3 rounded-lg border p-3"
            style={{ background: laneBackground(lane.tint), borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            <button
              type="button"
              className="flex items-center gap-2 text-left text-sm font-semibold"
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
                <p className="text-xs text-muted">None</p>
              ) : lane.id === 'in-progress' ? (
                progressGroups(lanes).map((group) => (
                  <div key={group.id} className="flex flex-col gap-2" role="group" aria-label={`${group.label}: ${group.cards.length}`}>
                    <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                      {group.label} <Badge>{group.cards.length}</Badge>
                    </h4>
                    {list(`${lane.id}:${group.id}`, group.cards, group.id)}
                  </div>
                ))
              ) : (
                list(lane.id, cards)
              ))}
          </section>
        )
      })}
    </div>
  )
}

// Lanes sit side by side on a wide page and stack, folded, on a narrow one.
function useNarrow() {
  return useMedia('(max-width: 767px)')
}

export default function DeliveryView({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => viewsClient(api), [api])
  const chats = useMemo(() => chatClient(api), [api])
  const load = useCallback(
    async (id: string) => {
      const [page, graph] = await Promise.all([client.deliveryPage(id), client.graph(id).catch(() => null)])
      return { items: page.items, graph, reports: page.contentReports ?? [] }
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

  const all = value ? deliveryLanes(value.graph, value.items) : null
  const lanes = all ? filterLanes(all, filter) : null
  const choices = useMemo(() => filterChoices(value?.graph ?? null), [value])
  const members = lanes ? new Set(Object.values(lanes).flat().map((card) => card.id)) : null
  const reports = (value?.reports ?? []).filter((r) => !members || !r.taskId || members.has(r.taskId))
  const superseded = value?.items.filter((item) => item.status === 'superseded') ?? []
  const canDefer = Boolean(value?.graph?.statuses.some((s) => s.id === 'deferred'))
  const resume = resumeStatus(value?.graph ?? null)
  const revision = value?.graph?.revision ?? 0

  return (
    <section aria-labelledby="avoozl-delivery-title" className="flex flex-col gap-3.5">
      <ViewHeading
        id="avoozl-delivery-title"
        view="delivery"
        meta={
          <span role="status" className="text-xs text-muted">
            {acting ? 'Working…' : ''}
          </span>
        }
        actions={
          workspaceId && (
            <IconLabel icon={RefreshCw} onClick={() => void reload()} disabled={busy || acting}>
              Refresh
            </IconLabel>
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
        <p className="text-sm text-muted">Choose a workspace in the header.</p>
      ) : !lanes ? (
        <p className="text-sm text-muted">{busy ? 'Loading…' : 'Not loaded'}</p>
      ) : (
        <>
          <FilterBar id="avoozl-delivery" filter={filter} choices={choices} onChange={setFilter} />
          <DeliveryBoard
            lanes={lanes}
            only={laneForState(filter.state)}
            narrow={narrow}
            reset={JSON.stringify(filter)}
            card={(card, phase) => (
              <LaneCardView
                key={card.id}
                card={card}
                phase={phase}
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
              />
            )}
          />
          {reports.length > 0 && <ContentReports reports={reports} />}
          {superseded.length > 0 && (
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={showSuperseded} onChange={(event) => setShowSuperseded(event.target.checked)} />
              Show superseded ({superseded.length})
            </label>
          )}
          {showSuperseded && (
            <ul className="flex flex-col gap-2">
              {superseded.map((item) => (
                <li key={item.id}>
                  <Card>
                    <SectionHeading title={item.title} meta={<span className="text-sm text-muted">{item.id}</span>} className="mb-2" />
                    <ItemDetails item={item} onSupersede={onSupersede} />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

// `report` content rules (design §4.9): matches in content that was written.
// Each names the rule set, rule and place, never the matched text.
function ContentReports({ reports }: { reports: ContentReport[] }) {
  return (
    <Card>
      <SectionHeading title="Content rule reports" className="mb-2" />
      <p className="mt-1 text-xs text-muted">
        A rule set whose action is report lets the content through and records the match here. Change the set to block once
        its rules are right.
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {reports.map((report) => (
          <li key={report.id} className="flex flex-wrap items-center gap-1.5">
            <Badge>{report.set}</Badge>
            <span>
              Rule {report.rule} at {report.target}
              {report.line ? ` line ${report.line}` : ''} ({report.boundary})
            </span>
            {report.taskId && <span className="text-xs text-muted">{report.taskId}</span>}
            {report.at && <span className="text-xs text-muted">{report.at.slice(0, 16).replace('T', ' ')}</span>}
          </li>
        ))}
      </ul>
    </Card>
  )
}
