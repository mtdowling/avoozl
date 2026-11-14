import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi } from './host.ts'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { TraceDrawer } from './TraceView.tsx'
import type { TraceTarget } from './trace-api.ts'
import { SMALL, attentionTarget, railFor, attentionTip, summarize, type Attention, type InFlight } from './dashboard-api.ts'
import { attachHref, duration, relativeTime, sessionHref } from './task-api.ts'
import { useTaskDrawer } from './drawer-context.ts'
import { useMedia } from './use-media.ts'
import { plansClient } from './plans-api.ts'
import { CONFLICT_LABELS, viewsClient, type ConflictItem, type RadarClaim, type RadarCrewStrip } from './views-api.ts'
import { useRead } from './useRead.ts'
import { LineBanner } from './FlowView.tsx'
import ArmedPulls from './ArmedPulls.tsx'
import { StartDemoButton } from './Demo.tsx'
import DriverSessionBox, { useDriverSession } from './DriverSessionBox.tsx'
import SetupCard from './SetupCard.tsx'
import { useInstance } from './InstanceName.tsx'
import { nameFor } from './instance-api.ts'
import { setupCards, type SetupId } from './setup-api.ts'
import { useSetupFacts } from './setup-facts.ts'
import ReleaseQueue from './ReleaseQueue.tsx'
import IntegrationBranches from './IntegrationBranches.tsx'
import ReviewDrafts from './ReviewDrafts.tsx'
import { LINE_EVENT, flowClient } from './flow-api.ts'
import { IconBtn, IconLabel, SectionHeading, ShowMore, TaskTitleLink, ViewHeading, useAskChat, usePages } from './controls.tsx'
import { Activity, DetailsIcon, ExternalLink, MessageSquare, RefreshCw, Check } from './icons.ts'
import { itemRef } from './chat-api.ts'
import type { Drill } from './graph-layout.ts'
import { linkHref } from './views-api.ts'

export type DashboardTarget = 'plans' | 'graph' | 'waiting'


const KIND_LABEL: Record<string, string> = { ...CONFLICT_LABELS, delivery: 'Delivery', 'github-conflict': 'GitHub edit', manual: 'Manual' }

// Wide screens pair two cards per row. The row has a fixed height, so both
// cards are the same height, and a card with more content scrolls inside
// itself instead of growing. Narrow screens stack the cards, each at its own
// height. Inline styles, because the host CSS has no arbitrary grid classes.
export const WIDE = '(min-width: 1024px)'
export const ROW_HEIGHT = { flight: '22rem' }

function Pair({ height, children }: { height: string; children: ReactNode }) {
  const wide = useMedia(WIDE)
  return (
    <div data-dashboard-row className="grid gap-3.5" style={wide ? { gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', height } : undefined}>
      {children}
    </div>
  )
}

function Section({ title, children, empty, actions, emptyAction }: { title: string; children: ReactNode; empty?: string | false; actions?: ReactNode; emptyAction?: ReactNode }) {
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <SectionHeading title={title} className="mb-2" actions={actions} />
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <>
            <p className="mt-2 text-sm text-muted">{empty}</p>
            {emptyAction && <div className="mt-2">{emptyAction}</div>}
          </>
        ) : (
          children
        )}
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
      <Badge variant={['decision', 'needs-human', 'review', 'manual'].includes(item.kind) ? 'warning' : 'danger'}>
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
          icon={item.tab === 'waiting' ? Check : ExternalLink}
          label={item.tab === 'waiting' ? `Resolve ${item.title}` : `Open ${item.title} in the drawer`}
          tooltip={item.tab === 'waiting' ? 'Resolve it in Waiting on you' : 'Open the task drawer'}
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

// A live Issue Radar claim, read from GitHub: any machine's crew. GitHub
// does not show whether the crew is paused, which machine it runs on, or
// its chat, so there is no Attach here.
export function RadarFlightRow({ row, now, onTrace, cost }: { row: RadarClaim; now: number; onTrace?: (row: RadarClaim) => void; cost?: RadarCrewStrip['cost'][string] }) {
  return (
    <li data-radar-flight-row className="flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0" style={{ borderColor: 'var(--border)' }}>
      <span data-in-flight-role style={{ flex: '0 0 7.5rem' }}>
        <Badge>Issue Radar</Badge>
      </span>
      <span className="min-w-0 flex-1" style={{ flexBasis: '12rem' }}>
        <span className="font-medium">{row.title}</span>{' '}
        <span className="text-xs text-muted">
          {row.repository} #{row.number}
        </span>{' '}
        {row.stale && <Badge variant="warning">Stale</Badge>}
        <span data-rail className="ml-1 inline-flex items-center gap-0.5 align-middle" role="img" aria-label={railFor(row).map((step) => `${step.label} ${step.state === 'done' ? 'done' : step.state === 'now' ? 'now' : 'next'}`).join(', ')}>
          {railFor(row).map((step) => (
            <i
              key={step.label}
              data-rail-step={step.state}
              title={step.label}
              style={{ display: 'block', width: 16, height: 8, borderRadius: 3, background: step.state === 'done' ? 'var(--ok)' : step.state === 'now' ? 'var(--accent)' : 'var(--border)' }}
            />
          ))}
        </span>
        <span className="block text-xs text-muted">
          {row.crewName ?? row.crewId ?? 'no crew named'} · {row.phase ?? 'claim label, no claim comment'}
          {row.updated ? ` · updated ${relativeTime(row.updated, now)}` : ''}
        </span>
        {cost && cost.stages.length > 0 && (
          <span data-radar-cost className="block text-xs text-muted">
            Credits: {cost.stages.map((entry) => `${entry.stage} ${entry.credits.toFixed(1)}`).join(', ')} (total {cost.credits.toFixed(1)}, {cost.turns} turns)
          </span>
        )}
      </span>
      <span data-in-flight-actions className="flex items-center justify-end gap-3" style={{ flex: '0 0 11rem' }}>
        {onTrace && (
          <button type="button" className="text-sm underline" aria-label={`Trace issue ${row.number}`} onClick={() => onTrace(row)}>
            Trace
          </button>
        )}
        {linkHref(row.url) && (
          <a href={linkHref(row.url)} target="_blank" rel="noreferrer" className="text-sm underline" aria-label={`Open issue ${row.number} on GitHub`}>
            Issue
          </a>
        )}
        {linkHref(row.prUrl) && (
          <a href={linkHref(row.prUrl)} target="_blank" rel="noreferrer" className="text-sm underline" aria-label={`Open pull request ${row.pr} on GitHub`}>
            PR #{row.pr}
          </a>
        )}
      </span>
    </li>
  )
}

export function InFlightRow({ row, now, onInfo }: { row: InFlight; now: number; onInfo: () => void }) {
  const href = attachHref(row.session),
    remote = row.session.crew && row.session.crew !== 'local'
  return (
    <li data-in-flight-row className="flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0" style={{ borderColor: 'var(--border)' }}>
      {/* Fixed columns, so every row's title and actions start at the same x. */}
      <span data-in-flight-role style={{ flex: '0 0 7.5rem' }}>
        <Badge>{roleLabel(row)}</Badge>
      </span>
      <span className="min-w-0 flex-1" style={{ flexBasis: '12rem' }}>
        <TaskTitleLink id={row.taskId} title={row.title} className="font-medium" />{' '}
        <span className="text-xs text-muted">
          {row.taskId}
          {row.epic ? ` · ${row.epic}` : ''} · attempt {row.attempt}
        </span>{' '}
        {row.focus && <span className="block text-xs text-muted">{row.focus}</span>}
        <span className="block text-xs text-muted">
          {row.session.agent ? `${row.session.agent} / ` : ''}
          {row.model ?? 'model not named'}
          {remote ? ` · on ${row.session.crew}` : ''} · running {duration(row.startedAt, now)} ·{' '}
          {row.session.crewUnreachable ? 'crew unreachable' : (row.status ?? 'not observed')} {relativeTime(row.lastAt, now)}
        </span>
      </span>
      <span data-in-flight-actions className="flex items-center justify-end gap-1.5" style={{ flex: '0 0 11rem' }}>
        <IconBtn icon={DetailsIcon} label={`Details for ${row.title}`} tooltip="Open the task drawer" onClick={onInfo} />
        {!href ? (
          <span className="text-xs text-muted">Attach waits on Kiro Crew</span>
        ) : (
        <a
          href={linkHref(href)}
          className="text-sm underline"
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

export default function DashboardView(props: {
  workspaceId: string | null
  onNavigate: (tab: DashboardTarget, taskId?: string) => void
  onDrill?: (drill: Drill) => void
  // Open one issue's Trace as a page (the drawer's Open page button).
  onTrace?: (target: TraceTarget) => void
  // Open a Settings section (Repository setup, Crews and rules).
  onOpenSettings?: (section: string) => void
  onPlanEpic?: () => void
}) {
  const { workspaceId, onNavigate } = props
  const [tracing, setTracing] = useState<TraceTarget | null>(null)
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const plans = useMemo(() => plansClient(api), [api])
  const chat = useAskChat(workspaceId)
  const small = useMedia(SMALL)
  // One failed read leaves its section empty rather than the whole page.
  const load = useCallback(
    async (id: string) => {
      const [graph, delivery, conflicts, stored, radar] = await Promise.allSettled([
        views.graph(id),
        views.delivery(id),
        views.conflicts(id),
        plans.stored(id),
        views.radarCrews(id),
      ])
      const value = <T,>(result: PromiseSettledResult<T>) => (result.status === 'fulfilled' ? result.value : null)
      const failed = [graph, delivery, conflicts, stored].filter((r) => r.status === 'rejected').length
      const items = value(conflicts)
      return {
        summary: summarize({ graph: value(graph), delivery: value(delivery), conflicts: items, plans: value(stored), radar: value(radar), limit: Infinity }),
        conflicts: items ?? [],
        total: value(graph)?.total ?? 0,
        failed,
      }
    },
    [views, plans],
  )
  const { value, error, busy, reload } = useRead(workspaceId, load)
  const flows = useMemo(() => flowClient(api), [api])
  const flowLoad = useCallback((id: string) => flows.view(id, { window: '10' }), [flows])
  const flow = useRead(workspaceId, flowLoad)
  const summary = value?.summary
  const driver = useDriverSession(workspaceId)
  const instance = useInstance(workspaceId)
  const facts = useSetupFacts(workspaceId)
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
  const openRow = (item: Attention) => (item.tab === 'waiting' ? onNavigate('waiting', item.taskId ?? undefined) : item.taskId && drawer.openTask(item.taskId))
  // What each empty state's button does.
  const setupAction: Record<Exclude<SetupId, 'driver'>, () => void> = {
    repository: () => props.onOpenSettings?.('repositories'),
    epics: () => props.onPlanEpic?.(),
    crew: () => props.onOpenSettings?.('repositories'),
  }
  const cards = setupCards({
    ...facts,
    radarCrews: summary?.radarCrewStrip ? summary.radarCrewStrip.crews.length : null,
    driver: driver.read?.state ?? 'unknown',
    plans: summary ? summary.plans.total : 1,
  })

  return (
    <section aria-labelledby="avoozl-dashboard-title" className="flex flex-col gap-3.5">
      <ViewHeading
        id="avoozl-dashboard-title"
        view="dashboard"
        meta={
          <>
            {small ? (
              <IconBtn icon={RefreshCw} label="Refresh" tooltip="Read Home again" onClick={() => void reload()} disabled={busy} />
            ) : (
              <IconLabel icon={RefreshCw} onClick={() => void reload()} disabled={busy}>
                Refresh
              </IconLabel>
            )}
            <span role="status" className={busy || value?.failed ? 'text-xs text-muted' : 'sr-only'}>
              {busy ? 'Loading…' : value?.failed ? `${value.failed} of 4 reads failed; those sections are empty.` : ''}
            </span>
          </>
        }
      >
        Home
      </ViewHeading>
      {/* Line stopped (R44.9, R48.5): above every other section. */}
      <LineBanner stops={flow.value?.line ?? []} workspaceId={workspaceId} onChanged={() => void flow.reload()} />
      <ArmedPulls workspaceId={workspaceId} stopped={(flow.value?.line ?? []).length > 0} />
      <DriverSessionBox workspaceId={workspaceId} />
      {(error || chat.error) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? chat.error}
        </p>
      )}
      {cards.filter((card) => card.id !== 'driver').map((card) => (
        <SetupCard
          key={card.id}
          id={card.id}
          title={card.title}
          line={card.line}
          action={
            <>
              <Btn type="button" primary onClick={setupAction[card.id as Exclude<SetupId, 'driver'>]}>
                {card.action}
              </Btn>
              {card.id === 'crew' && (
                <a href="/issue-radar" className="text-sm underline">
                  Open Radar › Crews
                </a>
              )}
              {card.id === 'repository' && <StartDemoButton label="Try the demo" />}
            </>
          }
        />
      ))}
      {summary ? (
        <>
          <Pair height={ROW_HEIGHT.flight}>
            {/* Anything that stops until you act: decisions, handbacks, conflicts. */}
            <Section
              title={`Needs you (${summary.attention.length})`}
              empty={summary.attention.length === 0 && 'Nothing waits on you. When a crew hands work back, it shows here.'}
              actions={
                <button type="button" className="text-sm underline" onClick={() => onNavigate('waiting')}>
                  Open Waiting on you
                </button>
              }
            >
              <ul className="mt-1">
                {pages.take('attention', summary.attention).map((item) => (
                  <AttentionRow
                    key={item.key}
                    item={item}
                    attach={attachOf(summary.running, item.taskId)}
                    onOpen={() => openRow(item)}
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
            <Section
              title={`In flight (${summary.inFlight.length + summary.radarFlight.length})${nameFor(instance, 'other') ? ` · ${nameFor(instance, 'other')}` : ''}`}
              empty={summary.inFlight.length + summary.radarFlight.length === 0 && 'No crew or chat is working right now. Released issues show here once a crew claims them.'}
              // Only while nothing has ever run; the header never has it.
              emptyAction={summary.neverRan ? <StartDemoButton label="Start demo" /> : undefined}
            >
              <ul className="mt-1">
                {pages.take('flight', summary.inFlight).map((row) => (
                  <InFlightRow key={row.slot} row={row} now={now} onInfo={() => drawer.openTask(row.taskId)} />
                ))}
              </ul>
              <ShowMore {...pages.more('flight', summary.inFlight.length)} />
              {summary.radarFlight.length > 0 && (
                <>
                  <h4 data-on-the-line className="mt-2 text-xs font-semibold text-muted">
                    On the line ({summary.radarFlight.length}): Ready, Claimed, PR, CI, Merge
                  </h4>
                  <ul className="mt-1">
                    {pages.take('radar', summary.radarFlight).map((row) => (
                      <RadarFlightRow key={`${row.repository}#${row.number}`} row={row} now={now} cost={summary.radarCrewStrip?.cost[`${row.repository}#${row.number}`]} onTrace={(claim) => setTracing({ repository: claim.repository, number: claim.number })} />
                    ))}
                  </ul>
                  <ShowMore {...pages.more('radar', summary.radarFlight.length)} />
                  <p className="mt-1 text-xs text-muted">
                    {summary.radarCrewStrip
                      ? 'Issue Radar rows come from GitHub. It does not show which machine a crew is on or its chat.'
                      : 'Issue Radar rows come from GitHub. It does not show if a crew is paused, which machine it is on, or its chat.'}
                  </p>
                </>
              )}
              {summary.radarCrewStrip && summary.radarCrewStrip.crews.length > 0 && (
                <p data-crews-strip className="mt-2 text-xs text-muted">
                  <span className="font-semibold">Crews:</span> {summary.radarCrewStrip.counts.onDuty} on duty, {summary.radarCrewStrip.counts.working} working, {summary.radarCrewStrip.counts.paused} paused.{' '}
                  {summary.radarCrewStrip.crews.map((crew) => `${crew.name} (${crew.status ?? 'unknown'})`).join(', ')}
                </p>
              )}
            </Section>
          </Pair>
          <ReleaseQueue workspaceId={workspaceId} onOpenSettings={() => props.onOpenSettings?.('repositories')} />
          <div data-progress-by-epic>
            <Section
              title="Progress by epic"
              empty={summary.progress.length === 0 && `No epics yet. ${summary.plans.approved} approved and ${summary.plans.draft} draft specs.`}
              emptyAction={
                <Btn type="button" onClick={() => onNavigate('plans')}>
                  Open Epics
                </Btn>
              }
            >
              <p className="mt-1 text-xs text-muted">
                {summary.plans.approved} approved and {summary.plans.draft} draft specs.{' '}
                <button type="button" className="underline" onClick={() => onNavigate('plans')}>
                  Open Epics
                </button>
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {summary.progress.map((entry) => {
                  const percent = entry.total ? Math.round((entry.done / entry.total) * 100) : 0
                  const title = entry.title
                  return (
                    <li key={entry.epic ?? '(none)'}>
                      <Tooltip text={`Show only ${title} in its spec graph${entry.running > 0 ? `. ${entry.running} Avoozl chats running now.` : ''}`} display="block">
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
          </div>
          <IntegrationBranches workspaceId={workspaceId} />
          <ReviewDrafts workspaceId={workspaceId} />
          <p className="text-sm text-muted" data-issue-graph-link>
            Issues on GitHub and their graph:{' '}
            <a href="/issue-radar" className="underline">
              open the Issue Radar graph
            </a>
            .
          </p>
        </>
      ) : (
        !error && <p className="text-sm text-muted">Loading…</p>
      )}
      {tracing && (
        <TraceDrawer
          workspaceId={workspaceId}
          target={tracing}
          onClose={() => setTracing(null)}
          onOpenPage={() => {
            const target = tracing
            setTracing(null)
            props.onTrace?.(target)
          }}
        />
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
