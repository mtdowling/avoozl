import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi } from './host.ts'
import { Btn } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { attentionTarget, checkDot, processLine, railFor, attentionTip, summarize, type Attention, type InFlight } from './dashboard-api.ts'
import { answerLabel, ciHealth, homeTiles, landedRows, stuckRows, QUIET_MS, type CiHealth, type LandedRow, type StuckRow } from './home-api.ts'
import { attachHref, duration, relativeTime, sessionHref } from './task-api.ts'
import { useTaskDrawer } from './drawer-context.ts'
import { plansClient } from './plans-api.ts'
import { CONFLICT_LABELS, viewsClient, type ConflictItem, type LandingView, type RadarClaim, type RadarCrewStrip } from './views-api.ts'
import { useRead } from './useRead.ts'
import { LineBanner } from './FlowView.tsx'
import ArmedPulls from './ArmedPulls.tsx'
import { StartDemoButton } from './Demo.tsx'
import SetupCard from './SetupCard.tsx'
import { useInstance } from './InstanceName.tsx'
import { nameFor } from './instance-api.ts'
import { setupCards } from './setup-api.ts'
import { useSetupFacts } from './setup-facts.ts'
import ReleaseQueue from './ReleaseQueue.tsx'
import TrackerGates from './TrackerGates.tsx'
import RadarFlightGroups from './RadarFlightGroups.tsx'
import IntegrationBranches from './IntegrationBranches.tsx'
import ReviewDrafts from './ReviewDrafts.tsx'
import { LINE_EVENT, flowClient } from './flow-api.ts'
import { IconBtn, IconLink, ShowMore, SmallBtn, TaskTitleLink, useAskChat, usePages } from './controls.tsx'
import { useRefreshCountdown } from './RefreshButton.tsx'
import { usePublishRefresh } from './page-refresh.tsx'
import { Activity, CirclePlus, Copy, DetailsIcon, ExternalLink, GitBranch, MessageSquare, Check } from './icons.ts'
import { itemRef } from './chat-api.ts'
import type { Drill } from './graph-layout.ts'
import { linkHref, type TaskLinks } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import { Empty, HomeBox, HomePair, HomeSection, HomeStyle, PrLink, Tiles } from './HomeParts.tsx'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'

export type DashboardTarget = 'plans' | 'graph' | 'waiting' | 'delivery' | 'landing' | 'flow'

const KIND_LABEL: Record<string, string> = { ...CONFLICT_LABELS, delivery: 'Delivery', 'github-conflict': 'GitHub edit', manual: 'Manual' }

// Needs you shows this many cards (two rows of three); the rest are one
// click away in Needs you.
export const NEEDS_SHOWN = 6

// Kinds where something failed and stopped; the rest wait on a choice.
const FAILED_KINDS = new Set(['delivery', 'stale-session', 'budget', 'over-budget', 'provider-out', 'tick-failed'])

// One Needs you card: what waits, and the one answer that unblocks it.
function NeedCard({ item, attach, onAnswer, onInfo, onAsk, onTitle }: { item: Attention; attach: string | null; onAnswer: () => void; onInfo: () => void; onAsk: () => void; onTitle: () => void }) {
  return (
    <li data-home-need data-attention-row>
      <span className="flex items-center justify-between gap-2">
        <span data-attention-tag>
          <Badge variant={FAILED_KINDS.has(item.kind) ? 'danger' : 'warning'}>{KIND_LABEL[item.kind] ?? item.kind}</Badge>
        </span>
        {item.taskId && <span className="truncate text-xs text-muted">{item.taskId}</span>}
      </span>
      <Tooltip text={attentionTip(item)} display="inline">
        {(describedBy) => (
          <a
            role="button"
            tabIndex={0}
            className="text-sm font-medium underline"
            style={{ cursor: 'pointer', color: 'inherit' }}
            onClick={onTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onTitle()
              }
            }}
            aria-describedby={describedBy}
            data-attention-title
          >
            {item.title}
          </a>
        )}
      </Tooltip>
      <span data-home-need-detail>{item.detail}</span>
      <span data-home-need-foot>
        <SmallBtn primary onClick={onAnswer} attrs={{ 'aria-label': `${answerLabel(item)}: ${item.title}`, 'data-home-answer': item.kind }}>
          {answerLabel(item)}
        </SmallBtn>
        <Row as="span" gap={1} wrap={false} align="start">
          {item.href && <IconLink icon={ExternalLink} to={item.href} label={`Open the issue for ${item.title}`} external />}
          {attach && <IconLink icon={CirclePlus} to={attach} label={`Session: the chat for ${item.title}`} />}
          {(item.group || item.taskId) && (
            <IconBtn icon={DetailsIcon} label={`Details for ${item.title}`} tooltip={item.group ? 'Why these tasks need review, and the list of them' : 'Open the task details'} onClick={onInfo} />
          )}
          <IconBtn icon={MessageSquare} label={`Ask in a chat about ${item.title}`} tooltip="Ask in a chat: a new chat seeded with this item's full context" onClick={onAsk} />
        </Row>
      </span>
    </li>
  )
}

function LandingQueueList({ landing }: { landing: { value: LandingView | null; error: string | null } }) {
  if (landing.error) return <Empty>Landing data is not available from this backend yet.</Empty>
  if (!landing.value) return <Empty>Loading…</Empty>
  if (!landing.value.queue.length) return <Empty>Nothing waits to land. Checked work queues here before it lands.</Empty>
  return (
    <ul data-home-list>
      {landing.value.queue.map((row) => {
        const [first, ...rest] = row.tasks
        return (
          <li key={row.key} data-home-row data-landing-row>
            <span data-home-num>{row.position + 1}</span>
            <span data-home-row-main>
              {first ? <TaskTitleLink id={first.id} title={first.title} /> : row.key}
              {rest.length > 0 && <Hint size="xs"> and {rest.length} more</Hint>}
              <span data-home-sub>
                {row.base} · {row.held}
              </span>
            </span>
            {row.pr && linkHref(row.url) && <PrLink number={row.pr} url={row.url} label={`Open pull request ${row.pr} on GitHub`} />}
          </li>
        )
      })}
    </ul>
  )
}

const percent = (value: number) => `${Math.round(value * 100)}%`

function CiHealthList({ ci, loading }: { ci: CiHealth; loading: boolean }) {
  if (loading) return <Empty>Loading…</Empty>
  if (!ci.available) return <Empty>CI data is not available from this backend yet.</Empty>
  return (
    <ul data-home-list>
      <li data-home-row data-ci-summary>
        <span data-home-row-main>
          {ci.flaky === 0 && ci.ciOnly === 0 ? 'No flaky checks or CI-only failures in this window.' : `${ci.flaky} flaky ${ci.flaky === 1 ? 'check' : 'checks'} · ${ci.ciOnly} CI-only ${ci.ciOnly === 1 ? 'failure' : 'failures'}`}
        </span>
      </li>
      {ci.repositories.length === 0 && (
        <li data-home-row>
          <Hint data-home-row-main>No CI runs recorded yet. They fill in as pull requests close.</Hint>
        </li>
      )}
      {ci.repositories.map((row) => (
        <li key={row.repository} data-home-row data-ci-health={row.repository}>
          <span data-home-row-main>
            {row.repository}
            <span data-home-sub>
              {row.waitShare === null ? 'CI wait not measured yet' : `CI wait ${percent(row.waitShare)} of lead time`} · limit {percent(row.waitLimit)} · {row.closed} closed · {row.repeats} repeat {row.repeats === 1 ? 'run' : 'runs'}
            </span>
          </span>
          <Badge variant={row.waitShare === null ? undefined : row.over ? 'danger' : 'success'}>{row.waitShare === null ? 'No data' : row.over ? 'Over limit' : 'OK'}</Badge>
        </li>
      ))}
    </ul>
  )
}

function LandedList({ rows, now, loading }: { rows: LandedRow[]; now: number; loading: boolean }) {
  if (loading) return <Empty>Loading…</Empty>
  if (!rows.length) return <Empty>Nothing has landed yet.</Empty>
  return (
    <ul data-home-list>
      {rows.map((row) => (
        <li key={row.key} data-home-row data-landed-row>
          {row.pr && row.url ? <PrLink number={row.pr} url={row.url} label={`Open pull request ${row.pr} on GitHub`} /> : <span data-home-num>–</span>}
          <span data-home-row-main>{row.taskId ? <TaskTitleLink id={row.taskId} title={row.title} /> : row.title}</span>
          <span data-home-row-side>{relativeTime(row.at, now)}</span>
        </li>
      ))}
    </ul>
  )
}

function StuckList({ rows, loading }: { rows: StuckRow[]; loading: boolean }) {
  if (loading) return <Empty>Loading…</Empty>
  if (!rows.length) return <Empty>Every running chat spoke in the last {QUIET_MS / 60000} minutes.</Empty>
  return (
    <ul data-home-list>
      {rows.map((row) => (
        <li key={row.key} data-home-row data-stuck-row>
          <span data-home-row-main>
            {row.taskId ? <TaskTitleLink id={row.taskId} title={row.title} /> : row.title}
            <span data-home-sub>{row.why}</span>
          </span>
          {row.href &&
            (row.external ? (
              <a href={linkHref(row.href)} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                Issue
              </a>
            ) : (
              <a href={linkHref(row.href)} className="text-xs underline">
                Session
              </a>
            ))}
        </li>
      ))}
    </ul>
  )
}

const ROLE_LABEL: Record<string, string> = { worker: 'Worker', checks: 'Checks', planner: 'Planner' }
const roleLabel = (row: InFlight) =>
  ROLE_LABEL[row.role] ?? (row.role === 'worker' ? 'Worker' : `Reviewer · ${row.role}`)

// How often the Dashboard reads again while it is on screen, so In flight
// stays current. Paused while the page is hidden.

// A live Issue Radar claim, read from GitHub: any machine's crew. GitHub
// does not show whether the crew is paused, which machine it runs on, or
// its chat, so there is no Session here.
export function RadarFlightRow({ row, now, cost }: { row: RadarClaim; now: number; cost?: RadarCrewStrip['cost'][string] }) {
  return (
    <li data-radar-flight-row className="flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0" style={{ borderColor: 'var(--border)' }}>
      <span data-in-flight-role style={{ flex: '0 0 7.5rem' }}>
        <Badge>Issue Radar</Badge>
      </span>
      <span className="min-w-0 flex-1" style={{ flexBasis: '12rem' }}>
        <span className="font-medium">{row.title}</span>{' '}
        <Hint size="xs">
          {row.repository} #{row.number}
        </Hint>{' '}
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
        <Hint size="xs" block>
          {row.crewName ?? row.crewId ?? 'no crew named'} · {row.phase ?? 'claim label, no claim comment'}
          {row.updated ? ` · updated ${relativeTime(row.updated, now)}` : ''}
        </Hint>
        {cost && cost.stages.length > 0 && (
          <Hint data-radar-cost size="xs" block>
            Credits: {cost.stages.map((entry) => `${entry.stage} ${entry.credits.toFixed(1)}`).join(', ')} (total {cost.credits.toFixed(1)}, {cost.turns} turns)
          </Hint>
        )}
      </span>
      <span data-in-flight-actions className="flex items-center justify-end gap-3" style={{ flex: '0 0 11rem' }}>
        {linkHref(row.url) && (
          <a href={linkHref(row.url)} target="_blank" rel="noopener noreferrer" className="text-sm underline" aria-label={`Open issue ${row.number} on GitHub`}>
            Issue
          </a>
        )}
        {linkHref(row.prUrl) && (
          <a href={linkHref(row.prUrl)} target="_blank" rel="noopener noreferrer" className="text-sm underline" aria-label={`Open pull request ${row.pr} on GitHub`}>
            PR #{row.pr}
          </a>
        )}
      </span>
    </li>
  )
}

// Copy a `process` session's attach command (R98.1). The command shows in
// the tooltip, so a person reads what they copy.
export function CopyAttach({ command, title }: { command: string; title: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip text={command}>
      {(describedBy) => (
        <Btn
          type="button"
          aria-label={`Copy the attach command for ${title}`}
          aria-describedby={describedBy}
          data-copy-attach
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px', minHeight: 0 }}
          onClick={() =>
            void navigator.clipboard?.writeText(command).then(
              () => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              },
              () => setCopied(false),
            )
          }
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? 'Copied' : 'Attach'}
        </Btn>
      )}
    </Tooltip>
  )
}

// One small link chip; the label shrinks with an ellipsis, so a long branch
// name never widens a 390 px row.
const CHIP: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  maxWidth: '100%',
  minWidth: 0,
  padding: '0 6px',
  border: '1px solid var(--border)',
  borderRadius: 999,
  color: 'var(--text)',
  lineHeight: '18px',
  textDecoration: 'none',
}
const CHIP_TEXT: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

// In flight's `PR #N` chip with its check dot, and the branch chip (R92.6).
// Both open GitHub in a new tab (R92.9).
export function FlightChips({ links, title }: { links: TaskLinks; title: string }) {
  const pr = links.pr && linkHref(links.pr.url),
    branch = links.branch && linkHref(links.branch.url)
  if (!pr && !branch) return null
  const dot = checkDot(links.checks)
  return (
    // contain: inline-size keeps the chips out of the row's min-content, so a
    // long branch name shrinks instead of widening the card on a phone.
    <span data-in-flight-links className="mt-1 flex items-center gap-1 text-xs" style={{ minWidth: 0, contain: 'inline-size' }}>
      {pr && links.pr && (
        // The PR chip never shrinks; the branch chip gives way.
        <span style={{ display: 'inline-flex', flex: '0 0 auto' }}>
          <Tooltip text={dot.label}>
            <a
              data-pr-chip
              href={linkHref(links.pr.url)}
              target="_blank"
              rel="noopener noreferrer"
              style={CHIP}
              aria-label={`Pull request ${links.pr.number} for ${title}${links.pr.state === 'open' || links.pr.state === 'unknown' ? '' : `, ${links.pr.state}`}. ${dot.label}`}
            >
              <i data-check-dot={dot.dot} aria-hidden="true" style={{ display: 'block', flex: '0 0 auto', width: 8, height: 8, borderRadius: 999, background: dot.color }} />
              PR #{links.pr.number}
              {links.pr.state === 'merged' || links.pr.state === 'closed' ? <Hint>{links.pr.state}</Hint> : null}
            </a>
          </Tooltip>
        </span>
      )}
      {branch && links.branch && (
        <Tooltip text={links.branch.ref}>
          <a data-branch-chip href={linkHref(links.branch.url)} target="_blank" rel="noopener noreferrer" style={CHIP} aria-label={`Branch ${links.branch.ref} for ${title}`}>
            <GitBranch size={12} aria-hidden="true" style={{ flex: '0 0 auto' }} />
            <span style={CHIP_TEXT}>{links.branch.ref}</span>
          </a>
        </Tooltip>
      )}
    </span>
  )
}

// Send message on a `process` session (R98.2): the text is queued as a
// `send`; the supervisor resumes the child with it when its run ends.
function SendMessage({ title, onSend, onClose }: { title: string; onSend: (text: string) => Promise<void>; onClose: () => void }) {
  const [text, setText] = useState('')
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'queued' } | { kind: 'error'; message: string }>({ kind: 'idle' })
  const send = async () => {
    setState({ kind: 'sending' })
    try {
      await onSend(text)
      setText('')
      setState({ kind: 'queued' })
    } catch (error) {
      setState({ kind: 'error', message: errorMessage(error) })
    }
  }
  return (
    <form
      data-send-message
      className="mt-1 flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <textarea
        aria-label={`Message for ${title}`}
        className="rounded border p-1.5 text-sm"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)', minHeight: '3.5em' }}
        maxLength={8000}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <span className="flex flex-wrap items-center gap-1.5">
        <SmallBtn primary disabled={!text.trim() || state.kind === 'sending'} attrs={{ type: 'submit', 'data-send-submit': true }}>
          {state.kind === 'sending' ? 'Sending…' : 'Send'}
        </SmallBtn>
        <SmallBtn onClick={onClose}>Close</SmallBtn>
        <Hint role="status" size="xs" data-send-state={state.kind}>
          {state.kind === 'queued' ? 'Queued; it goes in when the run ends.' : state.kind === 'error' ? state.message : ''}
        </Hint>
      </span>
    </form>
  )
}

export function InFlightRow({ row, now, onInfo, onSend }: { row: InFlight; now: number; onInfo: () => void; onSend?: (text: string) => Promise<void> }) {
  const [writing, setWriting] = useState(false)
  const child = row.session.executor === 'process' ? (row.session.process ?? null) : null,
    processRow = row.session.executor === 'process',
    href = processRow ? null : attachHref(row.session),
    remote = row.session.crew && row.session.crew !== 'local'
  return (
    <li data-in-flight-row className="flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0" style={{ borderColor: 'var(--border)' }}>
      {/* Fixed columns, so every row's title and actions start at the same x. */}
      <span data-in-flight-role style={{ flex: '0 0 7.5rem' }}>
        <Badge>{roleLabel(row)}</Badge>
      </span>
      <span className="min-w-0 flex-1" style={{ flexBasis: '12rem' }}>
        <TaskTitleLink id={row.taskId} title={row.title} className="font-medium" />{' '}
        <Hint size="xs">
          {row.taskId}
          {row.epic ? ` · ${row.epic}` : ''} · attempt {row.attempt}
        </Hint>{' '}
        {row.focus && <Hint size="xs" block>{row.focus}</Hint>}
        {processRow ? (
          <Hint size="xs" block data-process-status>
            {child ? processLine(child) : 'process · no supervisor record'} · {row.model ?? 'model not named'} · running {duration(row.startedAt, now)}
          </Hint>
        ) : (
          <Hint size="xs" block>
            {row.session.agent ? `${row.session.agent} / ` : ''}
            {row.model ?? 'model not named'}
            {remote ? ` · on ${row.session.crew}` : ''} · running {duration(row.startedAt, now)} ·{' '}
            {row.session.crewUnreachable ? 'crew unreachable' : (row.status ?? 'not observed')} {relativeTime(row.lastAt, now)}
          </Hint>
        )}
        {row.links && <FlightChips links={row.links} title={row.title} />}
        {processRow && (
          // column-reverse keeps the newest line in view without a scroll effect.
          <span
            data-process-log
            className="mt-1 block rounded border text-xs"
            tabIndex={0}
            aria-label={`Log tail for ${row.title}`}
            style={{ borderColor: 'var(--border)', maxHeight: '7.5em', overflow: 'auto', display: 'flex', flexDirection: 'column-reverse' }}
          >
            <pre className="m-0 p-1.5" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
              {child?.logTail || 'No output yet.'}
            </pre>
          </span>
        )}
        {processRow && writing && onSend && <SendMessage title={row.title} onSend={onSend} onClose={() => setWriting(false)} />}
      </span>
      <span data-in-flight-actions className="flex items-center justify-end gap-1.5" style={{ flex: '0 0 11rem' }}>
        <IconBtn icon={DetailsIcon} label={`Details for ${row.title}`} tooltip="Open the task drawer" onClick={onInfo} />
        {processRow && onSend && (
          <IconBtn icon={MessageSquare} label={`Send message to the ${row.role} for ${row.title}`} tooltip="Send message" onClick={() => setWriting((open) => !open)} />
        )}
        {processRow ? (
          child?.attach ? <CopyAttach command={child.attach} title={row.title} /> : <Hint size="xs">No attach command</Hint>
        ) : !href ? (
          <Hint size="xs">Session waits on Kiro Crew</Hint>
        ) : (
        <a
          href={linkHref(href)}
          className="text-sm underline"
          aria-label={`Session: the ${row.role} chat for ${row.title}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <CirclePlus size={14} aria-hidden="true" />
          Session
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
  // Open a Settings section (Repository setup, Crews and rules).
  onOpenSettings?: (section: string) => void
  onPlanEpic?: () => void
}) {
  const { workspaceId, onNavigate } = props
  const api = useAppApi()
  const views = useMemo(() => viewsClient(api), [api])
  const plans = useMemo(() => plansClient(api), [api])
  const chat = useAskChat(workspaceId)
  // Each read fills its part of Home as it lands; none waits on another.
  // Radar's crews read GitHub and Kiro Crew, so it is the slow one, and the
  // rest of Home shows before it. One failed read leaves its section empty.
  const load = useCallback(
    async (id: string) => {
      const [graph, delivery, conflicts, stored] = await Promise.allSettled([views.graph(id), views.delivery(id), views.conflicts(id), plans.stored(id)])
      const value = <T,>(result: PromiseSettledResult<T>) => (result.status === 'fulfilled' ? result.value : null)
      const failed = [graph, delivery, conflicts, stored].filter((r) => r.status === 'rejected').length
      return { graph: value(graph), delivery: value(delivery), conflicts: value(conflicts), plans: value(stored), failed }
    },
    [views, plans],
  )
  const { value: core, error, busy, reload: reloadCore } = useRead(workspaceId, load)
  const radarLoad = useCallback((id: string) => views.radarCrews(id), [views])
  const radarRead = useRead(workspaceId, radarLoad)
  // The landing queue and landings, from Avoozl's own store (no GitHub).
  const landingLoad = useCallback((id: string) => views.landing(id), [views])
  const landing = useRead(workspaceId, landingLoad)
  const value = useMemo(
    () =>
      core && {
        summary: summarize({ graph: core.graph, delivery: core.delivery, conflicts: core.conflicts, plans: core.plans, radar: radarRead.value ?? null, limit: Infinity }),
        conflicts: core.conflicts ?? [],
        total: core.graph?.total ?? 0,
        failed: core.failed,
      },
    [core, radarRead.value],
  )
  const flows = useMemo(() => flowClient(api), [api])
  const flowLoad = useCallback((id: string) => flows.view(id, { window: '10' }), [flows])
  const flow = useRead(workspaceId, flowLoad)
  const reload = useCallback(async () => {
    await Promise.all([reloadCore(), radarRead.reload(), landing.reload(), flow.reload()])
  }, [reloadCore, radarRead.reload, landing.reload, flow.reload]) // eslint-disable-line react-hooks/exhaustive-deps
  const summary = value?.summary
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
  // The Refresh button counts down and reads again at 0.
  const refreshHome = useCallback(() => {
    setNow(Date.now())
    void reload()
  }, [reload])
  // The nav already says Home: no heading row. Refresh, with its countdown,
  // is in the left nav.
  usePublishRefresh(useRefreshCountdown(workspaceId, refreshHome, busy))
  // The conflict items an attention row stands for, for its chat seed.
  const askAbout = (item: Attention) => {
    const matching = item.group
      ? [item.group]
      : (value?.conflicts ?? []).filter((c) => c.taskId === item.taskId && (item.kind === 'delivery' || c.kind === item.kind))
    void chat.ask(matching.length ? { items: matching.map(itemRefOf) } : { tasks: item.taskId ? [item.taskId] : [] })
  }
  // The one answer: a review opens its list, a Needs you item opens there,
  // and the rest open the task's drawer.
  const answer = (item: Attention) => {
    if (item.group) drawer.openReview(item.group, () => void reload())
    else if (item.tab === 'waiting') onNavigate('waiting', item.taskId ?? undefined)
    else if (item.taskId) drawer.openTask(item.taskId)
  }
  // What the repository empty state's button does. No epics has no button:
  // New spec on Specs starts one.
  const openRepositories = () => props.onOpenSettings?.('repositories')
  const cards = setupCards({
    repositories: facts.repositories,
    plans: summary ? summary.plans.total : 1,
  })
  const attention = summary?.attention ?? []
  const ci = ciHealth(flow.value ?? null)
  const ciDays = flow.value?.ci?.repositories[0]?.windowDays
  const landed = landedRows(landing.value ?? null, core?.delivery ?? null)
  const stuck = stuckRows(summary ?? null, now, (row) => attachHref(row.session))

  return (
    <section aria-labelledby="avoozl-dashboard-title" data-home>
      <HomeStyle />
      <h2 id="avoozl-dashboard-title" className="sr-only">
        Home
      </h2>
      <span role="status" className={busy || value?.failed ? 'text-xs text-muted' : 'sr-only'}>
        {busy ? 'Loading…' : value?.failed ? `${value.failed} of 4 reads failed; those sections are empty.` : ''}
      </span>
      {/* Line stopped (R44.9, R48.5): above every other section. */}
      <LineBanner stops={flow.value?.line ?? []} workspaceId={workspaceId} onChanged={() => void flow.reload()} />
      <ArmedPulls workspaceId={workspaceId} stopped={(flow.value?.line ?? []).length > 0} />
      {(error || chat.error) && (
        <ErrorText role="alert" size="sm">
          {error ?? chat.error}
        </ErrorText>
      )}
      {cards.map((card) => (
        <SetupCard
          key={card.id}
          id={card.id}
          title={card.title}
          line={card.line}
          action={
            card.id === 'repository' ? (
              <>
                {/* Short words on the button; its name is the whole action. */}
                <SmallBtn primary onClick={openRepositories} attrs={{ 'aria-label': card.action }}>
                  {card.action}
                </SmallBtn>
                <StartDemoButton label="Try the demo" />
              </>
            ) : undefined
          }
        />
      ))}
      {/* The layout shows at once; each part fills when its read lands. */}
      <Tiles tiles={homeTiles(summary ?? null, landing.value ?? null)} onOpen={(tile) => onNavigate(tile.target)} />
      <HomeSection
        id="needs-you"
        title={`Needs you (${attention.length})`}
        hint={
          <>
            One answer unblocks each ·{' '}
            <button type="button" onClick={() => onNavigate('waiting')}>
              Open Needs you
            </button>
          </>
        }
      >
        {!summary ? (
          <Empty>Loading…</Empty>
        ) : attention.length === 0 ? (
          <Empty>Nothing waits on you. When a crew hands work back, it shows here.</Empty>
        ) : (
          <>
            <ul data-home-needs>
              {attention.slice(0, NEEDS_SHOWN).map((item) => (
                <NeedCard
                  key={item.key}
                  item={item}
                  attach={attachOf(summary.running, item.taskId)}
                  onAnswer={() => answer(item)}
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
            {attention.length > NEEDS_SHOWN && (
              <button type="button" className="mt-2 self-start text-xs underline" onClick={() => onNavigate('waiting')} data-home-needs-more>
                Show all {attention.length} in Needs you
              </button>
            )}
          </>
        )}
      </HomeSection>
      <HomePair id="landing-ci">
        <HomeSection id="landing-queue" title="Landing queue" hint="In landing order, with why each waits">
          <HomeBox>
            <LandingQueueList landing={landing} />
          </HomeBox>
        </HomeSection>
        <HomeSection id="ci-health" title="CI health" hint={ciDays ? `Recorded runs, last ${ciDays} days` : 'Recorded runs'}>
          <HomeBox>
            <CiHealthList ci={ci} loading={!flow.value && !flow.error} />
          </HomeBox>
        </HomeSection>
      </HomePair>
      <HomePair id="landed-stuck">
        <HomeSection id="landed" title="Recently landed" hint="Newest first">
          <HomeBox>
            <LandedList rows={landed} now={now} loading={!core && !landing.value} />
          </HomeBox>
        </HomeSection>
        <HomeSection id="stuck" title="Stuck or quiet" hint={`No word for ${QUIET_MS / 60000} min`}>
          <HomeBox>
            <StuckList rows={stuck} loading={!summary} />
          </HomeBox>
        </HomeSection>
      </HomePair>
      <HomePair id="flight-progress">
        <HomeSection id="in-flight" title={`In flight (${summary ? summary.inFlight.length + summary.radarFlight.length : 0})${nameFor(instance, 'other') ? ` · ${nameFor(instance, 'other')}` : ''}`}>
          <HomeBox>
            {!summary ? (
              <Empty>Loading…</Empty>
            ) : summary.inFlight.length + summary.radarFlight.length === 0 ? (
              <>
                <Empty>No crew or chat is working right now. Released issues show here once a crew claims them.</Empty>
                {/* Only while nothing has ever run. */}
                {summary.neverRan && (
                  <div className="mb-2">
                    <StartDemoButton label="Start demo" />
                  </div>
                )}
              </>
            ) : (
              <>
                <ul className="m-0 list-none p-0">
                  {pages.take('flight', summary.inFlight).map((row) => (
                    <InFlightRow
                      key={row.slot}
                      row={row}
                      now={now}
                      onInfo={() => drawer.openTask(row.taskId)}
                      onSend={
                        workspaceId && row.session.executor === 'process'
                          ? async (text) => {
                              await views.sendSession(workspaceId, row.slot, text)
                            }
                          : undefined
                      }
                    />
                  ))}
                </ul>
                <ShowMore {...pages.more('flight', summary.inFlight.length)} />
                {summary.radarFlight.length > 0 && (
                  <>
                    <h4 data-on-the-line className="mt-2 text-xs font-semibold text-muted">
                      On the line ({summary.radarFlight.length}): Ready, Claimed, PR, CI, Merge
                    </h4>
                    {summary.radarGroups.length > 0 ? (
                      <RadarFlightGroups groups={summary.radarGroups} now={now} cost={summary.radarCrewStrip?.cost} />
                    ) : (
                      <>
                        <ul className="m-0 list-none p-0">
                          {pages.take('radar', summary.radarFlight).map((row) => (
                            <RadarFlightRow key={`${row.repository}#${row.number}`} row={row} now={now} cost={summary.radarCrewStrip?.cost[`${row.repository}#${row.number}`]} />
                          ))}
                        </ul>
                        <ShowMore {...pages.more('radar', summary.radarFlight.length)} />
                      </>
                    )}
                    <p className="my-2 text-xs text-muted">Issue Radar rows come from GitHub. It does not show which machine a crew is on or its chat.</p>
                  </>
                )}
                {summary.radarCrewStrip && summary.radarCrewStrip.crews.length > 0 && (
                  <p data-crews-strip className="my-2 text-xs text-muted">
                    <span className="font-semibold">Crews:</span> {summary.radarCrewStrip.counts.onDuty} on duty, {summary.radarCrewStrip.counts.working} working, {summary.radarCrewStrip.counts.paused} paused.{' '}
                    {summary.radarCrewStrip.crews.map((crew) => `${crew.name} (${crew.status ?? 'unknown'})`).join(', ')}
                  </p>
                )}
              </>
            )}
          </HomeBox>
        </HomeSection>
        <HomeSection
          id="progress-by-epic"
          title="Progress by epic"
          hint={
            summary && (
              <>
                {summary.plans.approved} approved, {summary.plans.draft} draft specs ·{' '}
                <button type="button" onClick={() => onNavigate('plans')}>
                  Open Specs
                </button>
              </>
            )
          }
        >
          <HomeBox>
            {!summary ? (
              <Empty>Loading…</Empty>
            ) : summary.progress.length === 0 ? (
              <>
                <Empty>No epics yet. {summary.plans.approved} approved and {summary.plans.draft} draft specs.</Empty>
                <div className="mb-2">
                  <Btn type="button" onClick={() => onNavigate('plans')}>
                    Open Specs
                  </Btn>
                </div>
              </>
            ) : (
              <ul data-progress-by-epic className="my-1 flex list-none flex-col gap-1 p-0 text-sm">
                {summary.progress.map((entry) => {
                  const percent = entry.total ? Math.round((entry.done / entry.total) * 100) : 0
                  const title = entry.title
                  return (
                    <li key={entry.epic ?? '(none)'}>
                      <Tooltip text={`Show only ${title} in its spec graph${entry.running > 0 ? `. ${entry.running} Avoozl chats running now.` : ''}`} display="block">
                        <button type="button" className="w-full rounded px-1 py-1 text-left hover:bg-accent/10" onClick={() => props.onDrill?.({ kind: 'epic', id: entry.epic, title })}>
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate">{title}</span>
                            <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                              {entry.running > 0 && (
                                <span className="inline-flex items-center gap-1" style={{ color: 'var(--tile-purple, var(--aim))' }} aria-label={`${entry.running} Avoozl chats running`}>
                                  <Activity size={12} aria-hidden="true" />
                                  {entry.running}
                                </span>
                              )}
                              {entry.done} of {entry.total}
                            </span>
                          </span>
                          <span role="progressbar" aria-label={`${title} progress`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-1 block h-1.5 overflow-hidden rounded" style={{ background: 'var(--border)' }}>
                            <span className="block h-full" style={{ width: `${percent}%`, background: 'var(--ok)' }} />
                          </span>
                        </button>
                      </Tooltip>
                    </li>
                  )
                })}
              </ul>
            )}
          </HomeBox>
        </HomeSection>
      </HomePair>
      <TrackerGates workspaceId={workspaceId} />
      <ReleaseQueue workspaceId={workspaceId} onOpenSettings={() => props.onOpenSettings?.('repositories')} />
      <IntegrationBranches workspaceId={workspaceId} />
      <ReviewDrafts workspaceId={workspaceId} />
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
