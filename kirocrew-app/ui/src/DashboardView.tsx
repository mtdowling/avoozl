import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { SpendChip } from './Budget.tsx'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card, EmptyState } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { SMALL, attentionTarget, attentionTip, countsLayout, countsStyles, summarize, type Attention, type CountsLayout, type InFlight } from './dashboard-api.ts'
import { attachHref, duration, relativeTime, sessionHref } from './task-api.ts'
import { routingClient } from './routing-api.ts'
import { useTaskDrawer } from './drawer-context.ts'
import { useMedia } from './use-media.ts'
import { STATES, type NodeState } from './graph-layout.ts'
import { plansClient } from './plans-api.ts'
import { CONFLICT_LABELS, viewsClient, type ConflictItem } from './views-api.ts'
import { useRead } from './useRead.ts'
import { LineBanner } from './FlowView.tsx'
import { LINE_EVENT, flowClient } from './flow-api.ts'
import Logo from './Logo'
import { IconBtn, IconLabel, SectionHeading, ShowMore, TaskTitleLink, ViewHeading, useAskChat, usePages } from './controls.tsx'
import { Activity, DetailsIcon, ExternalLink, Inbox, MessageSquare, Network, RefreshCw, Check } from './icons.ts'
import { chatClient, itemRef, type ActivityItem } from './chat-api.ts'
import type { TaskFilter } from './filters.ts'
import type { Drill } from './graph-layout.ts'
import { linkHref } from './views-api.ts'

// Recent activity reads up to the backend's cap (activity.recent allows 200).
const ACTIVITY_LIMIT = 200

export type DashboardTarget = 'plans' | 'graph' | 'delivery' | 'conflicts' | 'untriaged'


const STATE_COLOR: Record<NodeState, string> = {
  ready: 'var(--accent)',
  running: 'var(--tile-purple, var(--aim))',
  waiting: 'var(--border)',
  'needs-you': 'var(--danger)',
  done: 'var(--ok)',
  deferred: 'var(--muted)',
}

const KIND_LABEL: Record<string, string> = { ...CONFLICT_LABELS, delivery: 'Delivery', 'github-conflict': 'GitHub edit' }

// Wide screens pair two cards per row. The row has a fixed height, so both
// cards are the same height, and a card with more content scrolls inside
// itself instead of growing. Narrow screens stack the cards, each at its own
// height. Inline styles, because the host CSS has no arbitrary grid classes.
export const WIDE = '(min-width: 1024px)'
export const ROW_HEIGHT = { flight: '22rem', blocked: '22rem', recent: '22rem' }

function Pair({ height, children }: { height: string; children: ReactNode }) {
  const wide = useMedia(WIDE)
  return (
    <div data-dashboard-row className="grid gap-3.5" style={wide ? { gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', height } : undefined}>
      {children}
    </div>
  )
}

function Section({ title, children, empty, actions }: { title: string; children: ReactNode; empty?: string | false; actions?: ReactNode }) {
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <SectionHeading title={title} className="mb-2" actions={actions} />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        {empty ? <p className="mt-2 text-sm text-muted">{empty}</p> : children}
      </div>
    </Card>
  )
}

const HEAD = { textAlign: 'left', fontWeight: 500, fontSize: 12, color: 'var(--muted)', padding: '4px 8px', borderBottom: '1px solid var(--border)' } as const
const CELL = { padding: '6px 8px', borderTop: '1px solid var(--border)', verticalAlign: 'baseline' } as const

function TaskLink({ id, title, onOpen }: { id: string; title: string; onOpen: () => void }) {
  return (
    <Tooltip text={`Open ${id} in the drawer`}>
      <button type="button" className="min-w-0 text-left" onClick={onOpen}>
        <span className="underline">{title}</span> <span className="text-xs text-muted">{id}</span>
      </button>
    </Tooltip>
  )
}

function AttentionRow({
  item,
  attach,
  onOpen,
  onInfo,
  onAsk,
  onTitle,
}: {
  item: Attention
  attach: string | null
  onOpen: () => void
  onInfo: () => void
  onAsk: () => void
  onTitle: () => void
}) {
  return (
    <li className="flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0" style={{ borderColor: 'var(--border)' }}>
      <Badge variant={['decision', 'needs-human', 'review'].includes(item.kind) ? 'warning' : 'danger'}>
        {KIND_LABEL[item.kind] ?? item.kind}
      </Badge>
      <span className="min-w-0 flex-1">
        <Tooltip text={attentionTip(item)}>
          {(describedBy) => (
            <button type="button" className="text-left font-medium underline" onClick={onTitle} aria-describedby={describedBy} data-attention-title>
              {item.title}
            </button>
          )}
        </Tooltip>{' '}
        <span className="text-xs text-muted">{item.taskId}</span>
        <span className="block text-sm text-muted">{item.detail}</span>
      </span>
      <span className="flex gap-1.5">
        {item.href && (
          <a href={linkHref(item.href)} target="_blank" rel="noreferrer" className="self-center text-sm underline">
            Issue
          </a>
        )}
        {attach && (
          <Tooltip text="Open the task's running chat">
            <a href={linkHref(attach)} className="self-center text-sm underline" aria-label={`Attach to the chat for ${item.title}`}>
              Attach
            </a>
          </Tooltip>
        )}
        <IconBtn
          icon={DetailsIcon}
          label={item.group ? `Info: ${item.title}` : `Details for ${item.title}`}
          tooltip={item.group ? 'Why these tasks need review, and the list of them' : 'Open the task drawer'}
          onClick={onInfo}
        />
        <IconBtn icon={MessageSquare} label={`Ask in a chat about ${item.title}`} tooltip="Ask in a chat: a new chat seeded with this item's full context" onClick={onAsk} />
        <IconBtn
          icon={item.tab === 'conflicts' ? Check : ExternalLink}
          label={item.tab === 'conflicts' ? `Resolve ${item.title}` : `Open ${item.title} in Delivery`}
          tooltip={item.tab === 'conflicts' ? 'Resolve it in Conflicts' : 'Open it in Delivery'}
          onClick={onOpen}
        />
      </span>
    </li>
  )
}

const ROLE_LABEL: Record<string, string> = { worker: 'Worker', checks: 'Checks', planner: 'Planner' }
const roleLabel = (row: InFlight) =>
  ROLE_LABEL[row.role] ?? (row.role === 'worker' ? 'Worker' : `Reviewer · ${row.role}`)

// How often the Dashboard reads again while it is on screen, so In flight
// stays current. Paused while the page is hidden.
const REFRESH_MS = 20000

export function InFlightRow({ row, now, onInfo, onPickAgain }: { row: InFlight; now: number; onInfo: () => void; onPickAgain?: () => void }) {
  const href = attachHref(row.session),
    remote = row.session.crew && row.session.crew !== 'local'
  return (
    <li className="flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0" style={{ borderColor: 'var(--border)' }}>
      <Badge>{roleLabel(row)}</Badge>
      <span className="min-w-0 flex-1">
        <TaskTitleLink id={row.taskId} title={row.title} className="font-medium" />{' '}
        <span className="text-xs text-muted">
          {row.taskId}
          {row.epic ? ` · ${row.epic}` : ''} · attempt {row.attempt}
        </span>{' '}
        <SpendChip budget={row.budget} />
        {row.focus && <span className="block text-xs text-muted">{row.focus}</span>}
        <span className="block text-xs text-muted">
          {row.session.agent ? `${row.session.agent} / ` : ''}
          {row.model ?? 'model not named'}
          {remote ? ` · on ${row.session.crew}` : ''} · running {duration(row.startedAt, now)} ·{' '}
          {row.session.crewUnreachable ? 'crew unreachable' : (row.status ?? 'not observed')} {relativeTime(row.lastAt, now)}
        </span>
      </span>
      <span className="flex gap-1.5">
        <IconBtn icon={DetailsIcon} label={`Details for ${row.title}`} tooltip="Open the task drawer" onClick={onInfo} />
        {onPickAgain && row.role === 'worker' && (
          <IconBtn icon={RefreshCw} label={`Pick again for ${row.title}`} tooltip="The next attempt picks its agent and model afresh" onClick={onPickAgain} />
        )}
        {!href ? (
          <span className="self-center text-xs text-muted">Attach waits on Kiro Crew</span>
        ) : (
        <a
          href={linkHref(href)}
          className="self-center text-sm underline"
          aria-label={`Attach to the ${row.role} chat for ${row.title}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <ExternalLink size={14} aria-hidden="true" />
          Attach
        </a>
        )}
      </span>
    </li>
  )
}

// The state buttons on the Dashboard heading line: a colored count button
// per state, each opening Delivery filtered to that state. countsStyles
// (dashboard-api.ts) sets the layout for the width: on the title's line when
// wide, on their own right-aligned line when medium, a two-column grid when
// small. A label shortens before its count does, so long counts fit.
function StateCounts(props: { counts: Record<NodeState, number>; total: number; layout: CountsLayout; onPick: (state: NodeState) => void }) {
  const styles = countsStyles(props.layout)
  return (
    <ul className="min-w-0" style={styles.list as CSSProperties} aria-label={`Tasks by state, ${props.total} in all`} data-state-counts={props.layout}>
      {STATES.map((state) => (
        <li key={state.id} className="min-w-0">
          <Tooltip text={`Show ${state.label.toLowerCase()} tasks in Delivery`} display={props.layout === 'small' ? 'block' : undefined}>
            <button
              type="button"
              onClick={() => props.onPick(state.id)}
              aria-label={`${state.label}: ${props.counts[state.id]} tasks. Show them in Delivery`}
              className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
              style={{
                ...(styles.button as CSSProperties),
                borderColor: `color-mix(in srgb, ${STATE_COLOR[state.id]} 60%, var(--border))`,
                background: `color-mix(in srgb, ${STATE_COLOR[state.id]} 14%, var(--card, transparent))`,
                color: 'var(--text)',
              }}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <svg width={8} height={8} aria-hidden="true" style={{ flexShrink: 0 }}>
                  <circle cx={4} cy={4} r={4} style={{ fill: STATE_COLOR[state.id] }} />
                </svg>
                <span className="truncate">{state.label}</span>
              </span>
              <span className="font-semibold tabular-nums" style={{ flexShrink: 0 }}>
                {props.counts[state.id]}
              </span>
            </button>
          </Tooltip>
        </li>
      ))}
    </ul>
  )
}

// The small Untriaged count on the heading line: incoming items no rule,
// triage label or task covers, shown in the Intake tab. Accent, not yellow: they wait for someone,
// not necessarily the owner.
function UntriagedStat({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <Tooltip text="Incoming items no rule, triage label or task covers. Opens the Intake tab.">
      {(describedBy) => (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Untriaged: ${count} items. Open the Intake tab`}
          aria-describedby={describedBy}
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
          style={{
            borderColor: 'color-mix(in srgb, var(--accent) 60%, var(--border))',
            background: 'color-mix(in srgb, var(--accent) 14%, var(--card, transparent))',
            color: 'var(--text)',
          }}
          data-untriaged-stat
        >
          <Inbox size={12} aria-hidden="true" />
          Untriaged
          <span className="font-semibold tabular-nums">{count}</span>
        </button>
      )}
    </Tooltip>
  )
}

// The newest task events, newest first; the card scrolls.
function RecentActivity({
  items,
  now,
  onOpen,
  pages,
}: {
  items: ActivityItem[] | null
  now: number
  onOpen: (id: string) => void
  pages: ReturnType<typeof usePages>
}) {
  if (!items) return <p className="mt-2 text-sm text-muted">Loading…</p>
  if (!items.length) return <p className="mt-2 text-sm text-muted">Nothing has happened yet.</p>
  return (
    <>
    <ol className="mt-1 flex flex-col text-sm">
      {pages.take('activity', items).map((item, i) => (
        <li key={`${item.taskId}:${item.at}:${i}`} className="flex items-baseline gap-2 border-t py-1.5 first:border-t-0" style={{ borderColor: 'var(--border)' }}>
          <Tooltip text={item.at}>
            <span className="w-16 shrink-0 text-xs text-muted">{relativeTime(item.at, now)}</span>
          </Tooltip>
          <span className="min-w-0 flex-1">
            {item.text} ·{' '}
            <button type="button" className="underline" onClick={() => onOpen(item.taskId)}>
              {item.title}
            </button>
          </span>
        </li>
      ))}
    </ol>
    <ShowMore {...pages.more('activity', items.length)} />
    </>
  )
}

export default function DashboardView(props: {
  workspaceId: string | null
  // Untriaged items in Intake (§8.5); null when the tab is hidden.
  untriaged?: number | null
  onNavigate: (tab: DashboardTarget, taskId?: string) => void
  onScope?: (tab: 'graph' | 'delivery', filter: TaskFilter) => void
  onDrill?: (drill: Drill) => void
}) {
  const { workspaceId, onNavigate } = props
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const plans = useMemo(() => plansClient(api), [api])
  const chats = useMemo(() => chatClient(api), [api])
  const routing = useMemo(() => routingClient(api), [api])
  const chat = useAskChat(workspaceId)
  const layout = countsLayout(useMedia(WIDE), useMedia(SMALL))
  // One failed read leaves its section empty rather than the whole page.
  const load = useCallback(
    async (id: string) => {
      const [graph, delivery, conflicts, stored, activity] = await Promise.allSettled([
        views.graph(id),
        views.delivery(id),
        views.conflicts(id),
        plans.stored(id),
        chats.activity(id, ACTIVITY_LIMIT),
      ])
      const value = <T,>(result: PromiseSettledResult<T>) => (result.status === 'fulfilled' ? result.value : null)
      const failed = [graph, delivery, conflicts, stored, activity].filter((r) => r.status === 'rejected').length
      const items = value(conflicts)
      return {
        summary: summarize({ graph: value(graph), delivery: value(delivery), conflicts: items, plans: value(stored), limit: Infinity }),
        conflicts: items ?? [],
        activity: value(activity),
        total: value(graph)?.total ?? 0,
        failed,
      }
    },
    [views, plans, chats],
  )
  const { value, error, busy, reload } = useRead(workspaceId, load)
  const flows = useMemo(() => flowClient(api), [api])
  const flowLoad = useCallback((id: string) => flows.view(id, { window: '10' }), [flows])
  const flow = useRead(workspaceId, flowLoad)
  const summary = value?.summary
  // A stop pulled or resumed anywhere on the page (the top row's Stop the
  // line, a banner) reads the banner again.
  useEffect(() => {
    const again = () => void flow.reload()
    window.addEventListener(LINE_EVENT, again)
    return () => window.removeEventListener(LINE_EVENT, again)
  }, [flow.reload])
  const drawer = useTaskDrawer()
  const pages = usePages('')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      setNow(Date.now())
      void reload()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [reload])
  // The conflict items an attention row stands for, for its chat seed.
  const askAbout = (item: Attention) => {
    const matching = item.group
      ? [item.group]
      : (value?.conflicts ?? []).filter((c) => c.taskId === item.taskId && (item.kind === 'delivery' || c.kind === item.kind))
    void chat.ask(matching.length ? { items: matching.map(itemRefOf) } : { tasks: item.taskId ? [item.taskId] : [] })
  }

  return (
    <section aria-labelledby="avoozl-dashboard-title" className="flex flex-col gap-3.5">
      <ViewHeading
        id="avoozl-dashboard-title"
        view="dashboard"
        meta={
          <>
            {summary && value.total > 0 && <span className="whitespace-nowrap text-xs text-muted tabular-nums">{value.total} tasks</span>}
            {layout === 'small' ? (
              <IconBtn icon={RefreshCw} label="Refresh" tooltip="Read the Dashboard again" onClick={() => void reload()} disabled={busy} />
            ) : (
              <IconLabel icon={RefreshCw} onClick={() => void reload()} disabled={busy}>
                Refresh
              </IconLabel>
            )}
            {/* Kept in the tree for announcements; out of the flow while empty so
                its gap doesn't push the state buttons off the 1024 px line. */}
            <span role="status" className={busy || value?.failed ? 'text-xs text-muted' : 'sr-only'}>
              {busy ? 'Loading…' : value?.failed ? `${value.failed} of 5 reads failed; those sections are empty.` : ''}
            </span>
            {props.untriaged !== null && props.untriaged !== undefined && (
              <UntriagedStat count={props.untriaged} onOpen={() => onNavigate('untriaged')} />
            )}
            {summary && summary.overBudget > 0 && (
              <span data-over-budget>
                <Badge variant="danger">{summary.overBudget} over budget</Badge>
              </span>
            )}
          </>
        }
        wideActions={layout !== 'wide'}
        actions={
          <>
            {summary && value.total > 0 && (
              <StateCounts counts={summary.counts} total={value.total} layout={layout} onPick={(state) => props.onScope?.('delivery', { state })} />
            )}
          </>
        }
      >
        Dashboard
      </ViewHeading>
      {/* Line stopped (R44.9, R48.5): above every other section. */}
      <LineBanner stops={flow.value?.line ?? []} workspaceId={workspaceId} onChanged={() => void flow.reload()} />
      {(error || chat.error) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? chat.error}
        </p>
      )}
      {summary && value.total === 0 ? (
        <EmptyState
          icon={<Logo size={40} />}
          title="No tasks yet"
          subtitle="Plan a goal from the header, then approve its spec in Specs. Ready tasks start on their own."
          action={<Btn onClick={() => onNavigate('plans')}>Open Specs</Btn>}
        />
      ) : summary ? (
        <>
          <Pair height={ROW_HEIGHT.flight}>
            <Section
              title={`In flight (${summary.inFlight.length})`}
              empty={summary.inFlight.length === 0 && 'No agent is working right now.'}
            >
              <ul className="mt-1">
                {pages.take('flight', summary.inFlight).map((row) => (
                  <InFlightRow
                    key={row.slot}
                    row={row}
                    now={now}
                    onInfo={() => drawer.openTask(row.taskId)}
                    onPickAgain={
                      workspaceId && row.session.sessionReason
                        ? () => void routing.pickAgain(workspaceId, row.taskId).then(() => reload())
                        : undefined
                    }
                  />
                ))}
              </ul>
              <ShowMore {...pages.more('flight', summary.inFlight.length)} />
            </Section>
            <Section
              title="Progress by epic"
              empty={summary.progress.length === 0 && `No epics yet. ${summary.plans.approved} approved and ${summary.plans.draft} draft specs.`}
            >
              <p className="mt-1 text-xs text-muted">
                {summary.plans.approved} approved and {summary.plans.draft} draft specs.{' '}
                <button type="button" className="underline" onClick={() => onNavigate('plans')}>
                  Open Specs
                </button>
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {summary.progress.map((entry) => {
                  const percent = entry.total ? Math.round((entry.done / entry.total) * 100) : 0
                  const title = entry.title
                  return (
                    <li key={entry.epic ?? '(none)'}>
                      <Tooltip text={`Show only ${title} in the Graph${entry.running > 0 ? `. ${entry.running} Avoozl chats running now.` : ''}`} display="block">
                      <button
                        type="button"
                        className="w-full rounded px-1 py-1 text-left hover:bg-accent/10"
                        onClick={() => props.onDrill?.({ kind: 'epic', id: entry.epic, title })}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate">{title}</span>
                          <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                            {entry.running > 0 && (
                              <span
                                className="inline-flex items-center gap-1"
                                style={{ color: 'var(--tile-purple, var(--aim))' }}
                                aria-label={`${entry.running} Avoozl chats running`}
                              >
                                <Activity size={12} aria-hidden="true" />
                                {entry.running}
                              </span>
                            )}
                            {entry.done} of {entry.total}
                          </span>
                        </span>
                        <span
                          role="progressbar"
                          aria-label={`${title} progress`}
                          aria-valuenow={percent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          className="mt-1 block h-1.5 overflow-hidden rounded"
                          style={{ background: 'var(--border)' }}
                        >
                          <span className="block h-full" style={{ width: `${percent}%`, background: 'var(--ok)' }} />
                        </span>
                      </button>
                      </Tooltip>
                    </li>
                  )
                })}
              </ul>
            </Section>
          </Pair>

          <Pair height={ROW_HEIGHT.blocked}>
            {/* The blocked tasks: stalled deliveries, decisions and conflicts. */}
            <Section title={`Needs you (${summary.attention.length})`} empty={summary.attention.length === 0 && 'Nothing waits on you.'}>
              <ul className="mt-1">
                {pages.take('attention', summary.attention).map((item) => (
                  <AttentionRow
                    key={item.key}
                    item={item}
                    attach={attachOf(summary.running, item.taskId)}
                    onOpen={() => onNavigate(item.tab, item.taskId ?? undefined)}
                    onInfo={() => (item.group ? drawer.openReview(item.group, () => void reload()) : item.taskId && drawer.openTask(item.taskId))}
                    onAsk={() => askAbout(item)}
                    onTitle={() => {
                      const target = attentionTarget(item)
                      if (target.kind === 'review' && item.group) drawer.openReview(item.group, () => void reload())
                      else if (target.kind === 'task') drawer.openTask(target.id)
                      else if (target.kind === 'tab') onNavigate(target.tab)
                    }}
                  />
                ))}
              </ul>
              <ShowMore {...pages.more('attention', summary.attention.length)} />
            </Section>
            <Section title={`Up next (${summary.readyNext.length})`} empty={summary.readyNext.length === 0 && 'No task is ready.'}>
              <p className="mt-1 text-xs text-muted">In the order the tick starts them.</p>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th style={HEAD}>Wave</th>
                    <th style={HEAD}>Task</th>
                    <th style={{ ...HEAD, textAlign: 'right' }}>
                      <span className="sr-only">Graph</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pages.take('next', summary.readyNext).map((task) => (
                    <tr key={task.id}>
                      <td style={CELL}>
                        <Badge variant="wave">wave {task.wave}</Badge>
                      </td>
                      <td style={{ ...CELL, width: '100%' }}>
                        <TaskLink id={task.id} title={task.title} onOpen={() => drawer.openTask(task.id)} />
                      </td>
                      <td style={{ ...CELL, textAlign: 'right' }}>
                        <IconBtn icon={Network} label={`Show ${task.title} in the Graph`} onClick={() => onNavigate('graph', task.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ShowMore {...pages.more('next', summary.readyNext.length)} />
            </Section>
          </Pair>

          <Pair height={ROW_HEIGHT.recent}>
            <Section title={`Recently completed (${summary.recent.length})`} empty={summary.recent.length === 0 && 'Nothing delivered yet.'}>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {pages.take('recent', summary.recent).map((item) => (
                    <tr key={item.id}>
                      <td style={CELL}>
                        <span role="img" aria-label="Done" style={{ color: 'var(--ok)' }}>
                          ✓
                        </span>
                      </td>
                      <td style={{ ...CELL, width: '100%' }}>
                        <TaskLink id={item.id} title={item.title} onOpen={() => drawer.openTask(item.id)} />
                      </td>
                      <td style={CELL} className="whitespace-nowrap">
                        <span className="flex gap-2 text-xs">
                          {item.issue && (
                            <a href={linkHref(item.issue)} target="_blank" rel="noreferrer" className="underline">
                              issue
                            </a>
                          )}
                          {item.pulls.map((pull) => (
                            <a key={pull.href} href={linkHref(pull.href)} target="_blank" rel="noreferrer" className="underline">
                              PR{pull.number ? ` #${pull.number}` : ''}
                            </a>
                          ))}
                        </span>
                      </td>
                      <td style={{ ...CELL, textAlign: 'right' }} className="whitespace-nowrap text-xs text-muted">
                        <Tooltip text={item.at}>
                          <span>{relativeTime(item.at, now)}</span>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ShowMore {...pages.more('recent', summary.recent.length)} />
            </Section>
            <Section title="Recent activity">
              <RecentActivity items={value.activity} now={now} onOpen={(id) => drawer.openTask(id)} pages={pages} />
            </Section>
          </Pair>
        </>
      ) : (
        !error && <p className="text-sm text-muted">Loading…</p>
      )}
    </section>
  )
}

const itemRefOf = (item: ConflictItem) => itemRef(item)

// A task's newest running chat, worker first, to attach to.
function attachOf(running: { id: string; sessions: { role: string; slot: string; link?: string | null; attempt: number }[] }[], id: string | null) {
  const sessions = [...(running.find((r) => r.id === id)?.sessions ?? [])].sort(
    (a, b) => (a.role === 'worker' ? -1 : 0) - (b.role === 'worker' ? -1 : 0) || b.attempt - a.attempt,
  )
  return sessions[0] ? sessionHref(sessions[0]) : null
}
