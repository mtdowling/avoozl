// The Flow tab (design §8.4, R48): where delivery time goes and what the
// last retro proposed. Read-only except Approve, Reject, Run a retro now,
// and Run anyway on a stopped line. Pull requests and CI runs stay in Issue
// Radar and GitHub; this tab shows graph and delivery timing only.
import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Card, EmptyState, SegmentedControl } from '@kirocrew/app-sdk/ui'
import { LessonsView, ProposalsView } from './FlowMemory.tsx'
import Badge from './Badge.tsx'
import { Tooltip } from './Tooltip.tsx'
import { FilterPanel, useStoredFilter } from './FilterPanel.tsx'
import { ICON, IconLabel, SectionHeading, ShowMore, ViewHeading, dangerStyle, useConfirm, usePages } from './controls.tsx'
import { useTaskDrawer } from './drawer-context.ts'
import { useMedia } from './use-media.ts'
import { CircleAlert, DetailsIcon, Gauge, Play } from './icons.ts'
import { relativeTime } from './task-api.ts'
import { useRead } from './useRead.ts'
import { FlowCharts, UsagePanel, type Unit } from './FlowCharts.tsx'
import { errorMessage } from './workspace-api.ts'
import {
  FLOW_FILTER_STORE,
  SOURCE_TEXT,
  STAGES,
  STAGE_COLORS,
  STAGE_LABELS,
  WINDOW_OPTIONS,
  bannerText,
  barSegments,
  budgetMark,
  directionText,
  duration,
  evidenceText,
  filterActive,
  flowClient,
  metricCards,
  pdcaText,
  proposalText,
  scopeText,
  type FlowFilter,
  type FlowViewModel,
  type LineStop,
  type Proposal,
  type Retro,
  type TaskTiming,
} from './flow-api.ts'

const BAR: CSSProperties = { display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden', background: 'color-mix(in srgb, var(--muted) 15%, transparent)' }

// A stacked bar by stage, scaled to `scale` ms (the longest bar shown).
export function StageBar({ stages, scale, label }: { stages: Record<string, number>; scale: number; label: string }) {
  const parts = barSegments(stages),
    total = parts.reduce((sum, p) => sum + p.ms, 0)
  const text = `${label}: ${parts.map((p) => `${p.label} ${duration(p.ms)}`).join(', ') || 'no time yet'}`
  return (
    <div style={{ width: `${Math.max(4, scale ? (100 * total) / scale : 100)}%` }}>
      <Tooltip text={text} display="block">
        {(describedBy) => (
          <div role="img" aria-label={text} aria-describedby={describedBy} tabIndex={0} style={BAR}>
            {parts.map((p) => (
              <span key={p.stage} style={{ width: `${p.share * 100}%`, background: p.color, display: 'block', height: '100%' }} />
            ))}
          </div>
        )}
      </Tooltip>
    </div>
  )
}

export function StageLegend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Stages">
      {STAGES.map((stage) => (
        <li key={stage} className="inline-flex items-center gap-1">
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: STAGE_COLORS[stage], display: 'inline-block' }} />
          {STAGE_LABELS[stage]}
        </li>
      ))}
    </ul>
  )
}

// The red banner while a stop is open (R44.9), on the Dashboard and here.
export function LineBanner({ stops, workspaceId, onChanged }: { stops: LineStop[]; workspaceId: string | null; onChanged?: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => flowClient(api), [api])
  const drawer = useTaskDrawer()
  const confirm = useConfirm()
  const [error, setError] = useState<string | null>(null)
  if (!stops.length) return null
  const runAnyway = async (stop: LineStop) => {
    if (!workspaceId) return
    const yes = await confirm({
      title: 'Run anyway?',
      body: `New work will start while ${stop.check ? `\`${stop.check}\`` : 'the line'} still fails on ${stop.branch}. The stop stays open and shows who ran anyway.`,
      action: 'Run anyway',
    })
    if (!yes) return
    try {
      await client.runAnyway(workspaceId, stop.id)
      onChanged?.()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  // A pulled stop closes only when a person presses Resume (R64.7).
  const resume = async (stop: LineStop) => {
    if (!workspaceId) return
    const yes = await confirm({
      title: stop.full ? 'Resume all agents?' : 'Resume the line?',
      body: stop.full
        ? `New work starts again everywhere, and each interrupted task starts again on its branch and model. The stop was pulled for: ${stop.reason ?? ''}`
        : `New work starts again in ${scopeText(stop)}. The stop was pulled for: ${stop.reason ?? ''}`,
      action: 'Resume',
    })
    if (!yes) return
    try {
      await client.resume(workspaceId, stop.id)
      onChanged?.()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  return (
    <div className="flex flex-col gap-2" data-line-banner>
      {stops.map((stop) => (
        <div key={stop.id} role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, var(--card))' }}>
          <CircleAlert size={18} aria-hidden="true" style={{ color: 'var(--danger)', flex: 'none' }} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5" style={{ minWidth: '14rem' }}>
            <span style={{ overflowWrap: 'anywhere' }}>{bannerText(stop)}</span>
            {stop.manual && (
              <span className="text-xs text-muted" data-line-pulled>
                Pulled by {stop.by?.name ?? 'someone'}, {relativeTime(stop.openedAt, Date.now())}. Only a person can resume it.
              </span>
            )}
            {stop.runAnyway && (
              <span className="text-xs text-muted">
                Run anyway by {stop.runAnyway.by}, {relativeTime(stop.runAnyway.at, Date.now())}.
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {stop.fixTaskId && (
              <IconLabel icon={DetailsIcon} tooltip="Open the fix task's details in the drawer" onClick={() => drawer.openTask(stop.fixTaskId!)}>
                Open fix task
              </IconLabel>
            )}
            {stop.manual && (
              <IconLabel icon={Play} tooltip="Start new work again in this scope; asks first" onClick={() => void resume(stop)}>
                Resume
              </IconLabel>
            )}
            {!stop.manual && !stop.runAnyway && (
              <IconLabel icon={Play} tooltip="Resume new work while the check still fails; asks first" onClick={() => void runAnyway(stop)} style={dangerStyle}>
                Run anyway
              </IconLabel>
            )}
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

function MetricCards({ view }: { view: FlowViewModel }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' }} data-flow-cards>
      {metricCards(view).map((card) => (
        <Card key={card.key} className="flex flex-col gap-1">
          <Tooltip text={card.tip}>
            {(describedBy) => (
              <span aria-describedby={describedBy} tabIndex={0} className="text-xs text-muted" style={{ width: 'fit-content' }}>
                {card.title}
              </span>
            )}
          </Tooltip>
          {card.empty ? (
            <span className="text-sm text-muted">{card.empty}</span>
          ) : (
            <>
              <span className="text-2xl font-semibold tabular-nums">{card.value}</span>
              <span className="text-xs text-muted tabular-nums">{card.was ? `was ${card.was}` : 'no earlier window'}</span>
            </>
          )}
        </Card>
      ))}
    </div>
  )
}

function TaskBars({ tasks, budget }: { tasks: TaskTiming[]; budget?: FlowViewModel['budget'] }) {
  const drawer = useTaskDrawer()
  const narrow = useMedia('(max-width: 767px)')
  const pages = usePages(String(tasks.length))
  const scale = Math.max(0, ...tasks.map((t) => STAGES.reduce((sum, s) => sum + (t.stages[s] || 0), 0)))
  const shown = pages.take('flow-bars', tasks)
  return (
    <Card className="flex flex-col gap-2">
      <SectionHeading title="Time per task" />
      <StageLegend />
      <ul className="flex flex-col gap-1.5">
        {shown.map((task) => {
          const name = (
            <span className="min-w-0 truncate">
              <span className="tabular-nums">{task.taskId}</span> <span className="text-muted">{task.title}</span>
            </span>
          )
          const bar = <StageBar stages={task.stages} scale={scale} label={task.taskId} />
          const info = (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
              {task.coarse && (
                <Tooltip text="Built from phase markers or events, not from tool calls">
                  {(describedBy) => (
                    <span aria-describedby={describedBy} tabIndex={0} className="text-xs text-muted">
                      (coarse)
                    </span>
                  )}
                </Tooltip>
              )}
              {task.batch && <Badge>batch</Badge>}
              {budgetMark(budget, task.taskId) && (
                <Badge variant={budgetMark(budget, task.taskId) === '80% of budget' ? 'warning' : 'danger'}>{budgetMark(budget, task.taskId)}</Badge>
              )}
              {duration(task.leadMs)}
              <Tooltip text="Open this task's details in the drawer">
                {(describedBy) => (
                  <button type="button" aria-label={`Details for ${task.taskId}`} aria-describedby={describedBy} onClick={() => drawer.openTask(task.taskId)} style={{ display: 'inline-flex', color: 'var(--muted)' }}>
                    <DetailsIcon size={ICON} aria-hidden="true" />
                  </button>
                )}
              </Tooltip>
            </span>
          )
          // Narrow screens: the bar gets its own full-width row.
          return narrow ? (
            <li key={task.taskId} className="flex flex-col gap-1 text-sm" data-flow-bar={task.taskId}>
              <span className="flex items-center justify-between gap-2">
                {name}
                {info}
              </span>
              {bar}
            </li>
          ) : (
            <li key={task.taskId} className="grid items-center gap-2 text-sm" style={{ gridTemplateColumns: 'minmax(6rem, 14rem) minmax(0, 1fr) auto' }} data-flow-bar={task.taskId}>
              {name}
              {bar}
              {info}
            </li>
          )
        })}
      </ul>
      <ShowMore {...pages.more('flow-bars', tasks.length)} />
      <p className="text-xs text-muted">(coarse) marks bars built from reports, not tool calls.</p>
    </Card>
  )
}

function ProposalRow({ proposal, retro, onDecide, busy }: { proposal: Proposal; retro: Retro; onDecide: (r: Retro, p: Proposal, decision: 'approve' | 'reject') => void; busy: boolean }) {
  const pdca = pdcaText(proposal)
  return (
    <li className="flex flex-wrap items-start gap-3 border-t pt-2 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--border)' }} data-proposal={`${retro.id}:${proposal.id}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm" style={{ minWidth: '14rem' }}>
        <span style={{ overflowWrap: 'anywhere' }}>
          <code className="text-xs">{proposalText(proposal)}</code> <span className="text-muted">{directionText(proposal)}</span>
          {proposal.removesCheck && (
            <>
              {' '}
              <Badge variant="warning">removes a check</Badge>
            </>
          )}
          {proposal.revertOf && (
            <>
              {' '}
              <Badge>revert</Badge>
            </>
          )}
        </span>
        <span className="text-xs text-muted" style={{ overflowWrap: 'anywhere' }}>
          Evidence: {evidenceText(proposal)}
        </span>
        {proposal.status !== 'open' && (
          <span className="text-xs">
            {proposal.status === 'approved' ? 'Approved' : `Rejected${proposal.reason ? `: ${proposal.reason}` : ''}`}
            {pdca ? ` · ${pdca}` : ''}
          </span>
        )}
      </div>
      {proposal.status === 'open' && (
        <div className="flex gap-2">
          <Btn type="button" disabled={busy} onClick={() => onDecide(retro, proposal, 'reject')}>
            Reject
          </Btn>
          <Btn type="button" primary disabled={busy} onClick={() => onDecide(retro, proposal, 'approve')}>
            Approve
          </Btn>
        </div>
      )}
    </li>
  )
}

function Retros({ view, workspaceId, onChanged }: { view: FlowViewModel; workspaceId: string | null; onChanged: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => flowClient(api), [api])
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queued, setQueued] = useState(false)
  const decide = async (retro: Retro, proposal: Proposal, decision: 'approve' | 'reject') => {
    if (!workspaceId) return
    let confirmRemoval = false
    if (decision === 'approve' && proposal.removesCheck) {
      confirmRemoval = await confirm({ title: 'Approve removing a check?', body: `${proposalText(proposal)} removes a review role or a declared check, so fewer things are checked before work lands.`, action: 'Remove the check' })
      if (!confirmRemoval) return
    }
    setBusy(true)
    setError(null)
    try {
      const { hash } = await client.settings(workspaceId)
      await client.decide(workspaceId, { retroId: retro.id, proposalId: proposal.id, decision, expectedHash: hash, ...(confirmRemoval ? { confirmRemoval: true } : {}) })
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const start = async () => {
    if (!workspaceId) return
    try {
      await client.startRetro(workspaceId)
      setQueued(true)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  const running = view.retros.some((r) => r.state === 'running')
  return (
    <Card className="flex flex-col gap-3">
      <SectionHeading
        title="Retros"
        actions={
          <IconLabel icon={Play} disabled={running || queued} tooltip="Start a retro at the next tick instead of waiting for its trigger" onClick={() => void start()}>
            {queued ? 'Starts at the next tick' : 'Run a retro now'}
          </IconLabel>
        }
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!view.retros.length ? (
        <p className="text-sm text-muted">A retro runs after 10 finished tasks.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {view.retros.map((retro) => (
            <li key={retro.id} className="flex flex-col gap-2" data-retro={retro.id}>
              <span className="text-sm font-semibold">
                Retro {retro.n} · {retro.triggers.map((t) => t.detail).join('; ') || 'started'}
                {retro.bottleneck ? ` · bottleneck ${STAGE_LABELS[retro.bottleneck.stage as keyof typeof STAGE_LABELS] ?? retro.bottleneck.stage}` : ''}
              </span>
              {retro.state === 'running' && <span className="text-sm text-muted">Running since {relativeTime(retro.startedAt, Date.now())}.</span>}
              {retro.state === 'failed' && <span className="text-sm text-danger">Failed: {retro.error}</span>}
              {retro.bottleneck && <span className="text-xs text-muted">{retro.bottleneck.evidence}</span>}
              {retro.proposals.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {retro.proposals.map((p) => (
                    <ProposalRow key={p.id} proposal={p} retro={retro} onDecide={(r, q, d) => void decide(r, q, d)} busy={busy} />
                  ))}
                </ul>
              )}
              {retro.dropped?.length > 0 && (
                <span className="text-xs text-muted">
                  Dropped: {retro.dropped.map((d) => `${d.key ?? `proposal ${d.index + 1}`} (${d.reason})`).join('; ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Records({ view }: { view: FlowViewModel }) {
  if (!view.flaky.length && !view.ciOnly.length) return null
  return (
    <Card className="flex flex-col gap-1 text-sm">
      <SectionHeading title="Checks that disagree" />
      {view.ciOnly.slice(0, 10).map((r) => (
        <span key={r.id}>
          CI only: {r.checks.join(', ')} failed in CI on {r.taskId} ({r.commit.slice(0, 7)}) after passing here.
        </span>
      ))}
      {view.flaky.slice(0, 10).map((r) => (
        <span key={r.id}>
          Flaky: <code className="text-xs">{r.check}</code> failed, then passed on {r.commit.slice(0, 7)}.
        </span>
      ))}
    </Card>
  )
}

export default function FlowView({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => flowClient(api), [api])
  const [filter, setFilter] = useStoredFilter<FlowFilter>(workspaceId, FLOW_FILTER_STORE)
  const key = JSON.stringify(filter)
  const load = useCallback((id: string) => client.view(id, JSON.parse(key)), [client, key])
  const { value: view, error, busy, reload } = useRead(workspaceId, load)
  const setField = (change: Partial<FlowFilter>) => setFilter({ ...filter, ...change })
  const [unit, setUnit] = useState<Unit>('day')
  // Overview (timing and retros), Proposals and Lessons (design §4.18).
  const [tab, setTab] = useState<'overview' | 'proposals' | 'lessons'>('overview')
  return (
    <section aria-labelledby="avoozl-flow-title" className="flex flex-col gap-3.5">
      <ViewHeading id="avoozl-flow-title" view="flow">
        Flow
      </ViewHeading>
      <p className="text-sm text-muted">Where delivery time goes, and what the last retro proposed.</p>
      <SegmentedControl
        layoutId="avoozl-flow-tabs"
        ariaLabel="Flow views"
        segments={[
          { key: 'overview', label: 'Overview' },
          { key: 'proposals', label: 'Proposals' },
          { key: 'lessons', label: 'Lessons' },
        ]}
        value={tab}
        onChange={(key) => setTab(key as typeof tab)}
        wrap
      />
      {tab === 'proposals' && <ProposalsView workspaceId={workspaceId} />}
      {tab === 'lessons' && <LessonsView workspaceId={workspaceId} />}
      {tab === 'overview' && error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {tab !== 'overview' ? null : !view ? (
        <p className="text-sm text-muted">{busy ? 'Loading…' : 'Not loaded'}</p>
      ) : (
        <>
          <LineBanner stops={view.line} workspaceId={workspaceId} onChanged={() => void reload()} />
          <FilterPanel
            id="avoozl-flow"
            label="Filter flow timing"
            active={filterActive(filter)}
            onClear={() => setFilter({})}
            fields={[
              { kind: 'select', key: 'repository', label: 'Repository', value: filter.repository ?? '', options: [...view.repositories.map((r) => ({ value: r, label: r }))], onChange: (repository) => setField({ repository: repository || undefined }) },
              { kind: 'select', key: 'epic', label: 'Epic', value: filter.epic ?? '', options: [...view.epics.map((e) => ({ value: e.id, label: e.title }))], onChange: (epic) => setField({ epic: epic || undefined }) },
              { kind: 'select', key: 'plan', label: 'Plan', value: filter.plan ?? '', options: (view.plans ?? []).map((p) => ({ value: p.id, label: p.title })), onChange: (plan) => setField({ plan: plan || undefined, phase: undefined }) },
              { kind: 'select', key: 'phase', label: 'Phase', value: filter.phase ?? '', options: (view.phases ?? []).map((p) => ({ value: p.id, label: p.title })), disabled: !filter.plan, hint: filter.plan ? undefined : 'Pick a plan first', onChange: (phase) => setField({ phase: phase || undefined }) },
              { kind: 'select', key: 'window', label: 'Window', value: filter.window ?? '20', options: WINDOW_OPTIONS, onChange: (window) => setField({ window: window || undefined }) },
              { kind: 'select', key: 'stage', label: 'Stage', value: filter.stage ?? '', options: [...STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))], onChange: (stage) => setField({ stage: stage || undefined }) },
            ]}
          />
          <MetricCards view={view} />
          {view.bottleneck && (
            <Card className="flex items-start gap-2 text-sm">
              <Gauge size={18} aria-hidden="true" style={{ color: STAGE_COLORS[view.bottleneck.stage], flex: 'none' }} />
              <span>
                <span className="font-semibold">Biggest bottleneck: {STAGE_LABELS[view.bottleneck.stage]}</span>, {Math.round(view.bottleneck.share * 100)}% of lead time
                {view.bottleneck.repository ? ` in ${view.bottleneck.repository}` : ''} (median {duration(view.bottleneck.medianMs)} per task).
              </span>
            </Card>
          )}
          {view.tasks.length ? (
            <TaskBars tasks={view.tasks} budget={view.budget} />
          ) : (
            <EmptyState icon={<Gauge size={36} aria-hidden="true" />} title="No timing yet" subtitle="Avoozl records where each task's time goes as soon as a task is dispatched." />
          )}
          <FlowCharts view={view} unit={unit} onUnit={setUnit} />
          <UsagePanel view={view} unit={unit} />
          <Records view={view} />
          <Retros view={view} workspaceId={workspaceId} onChanged={() => void reload()} />
        </>
      )}
    </section>
  )
}

// The drawer's Timing fold (R48.4): the task's bar and each span's stage,
// length and source, and the batch it ran in.
export function TimingFold({
  timing,
}: {
  timing:
    | (TaskTiming & {
        spans: { id: string; stage: string; lengthMs: number; source: keyof typeof SOURCE_TEXT; detail: string | null; attempt: number | null }[]
        versions?: { attempt: number; prompts: Record<string, string>; skills: Record<string, string> }[]
      })
    | null
}) {
  if (!timing) return <p className="text-sm text-muted">No timing yet: Avoozl records it from the task's first dispatch.</p>
  return (
    <div className="flex flex-col gap-2 text-sm" data-timing-fold>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <StageBar stages={timing.stages} scale={0} label={timing.taskId} />
        </div>
        <span className="tabular-nums">{duration(timing.leadMs)}</span>
      </div>
      {timing.batch && <span className="text-xs text-muted">Ran in {timing.batch}.</span>}
      <ul className="flex flex-col gap-0.5">
        {timing.spans.map((span) => (
          <li key={span.id} className="flex items-center gap-2">
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: STAGE_COLORS[span.stage as keyof typeof STAGE_COLORS] ?? 'var(--muted)', flex: 'none' }} />
            <span>{STAGE_LABELS[span.stage as keyof typeof STAGE_LABELS] ?? span.stage}</span>
            {span.detail && <code className="text-xs">{span.detail}</code>}
            <span className="tabular-nums">{duration(span.lengthMs)}</span>
            <span className="text-xs text-muted">{SOURCE_TEXT[span.source]}</span>
          </li>
        ))}
      </ul>
      {timing.versions && timing.versions.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted" data-timing-versions>
          {timing.versions.map((v) => (
            <li key={v.attempt} style={{ overflowWrap: 'anywhere' }}>
              Attempt {v.attempt} ran on {Object.values(v.prompts).join(', ') || 'the built-in prompts'}
              {Object.keys(v.skills).length ? `; skills ${Object.entries(v.skills).map(([target, sha]) => `${target}@${sha.slice(0, 8)}`).join(', ')}` : ''}.
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
