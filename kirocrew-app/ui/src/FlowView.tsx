import { PlanningFlow } from './PlanningFlow.tsx'
import CiFlow from './CiFlow.tsx'
// The Flow tab (design §8.4, R48): where delivery time goes. Retros and
// Proposals are the Retros pill's pages (owner note 2026-11-17). Read-only
// except Run anyway and Resume on a stopped line. Pull requests and CI runs
// stay in Issue Radar and GitHub; this tab shows graph and delivery timing only.
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useAppApi } from './host.ts'
import { Card, EmptyState } from '@kirocrew/app-sdk/ui'
import GithubFlow from './GithubFlow.tsx'
import Badge from './Badge.tsx'
import { Tooltip } from './Tooltip.tsx'
import { useStoredFilter } from './FilterPanel.tsx'
import { FlowRail } from './FlowRail.tsx'
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
  FLOW_ORDER,
  bannerText,
  barSegments,
  duration,
  flowChoices,
  sortTasks,
  LINE_EVENT,
  flowClient,
  lineChanged,
  metricCards,
  scopeText,
  type FlowFilter,
  type FlowViewModel,
  type LineStop,
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
      lineChanged()
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
      lineChanged()
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

// Six tiles on one full-width row; two per row on a phone so none gets narrow.
function MetricCards({ view }: { view: FlowViewModel }) {
  const phone = useMedia('(max-width: 767px)')
  return (
    <div style={{ display: 'grid', width: '100%', gap: '0.75rem', gridTemplateColumns: `repeat(${phone ? 2 : 6}, minmax(0, 1fr))` }} data-flow-cards>
      {metricCards(view).map((card) => (
        <Card key={card.key} className="flex flex-col gap-1" style={{ minWidth: 0 }}>
          <Tooltip text={card.tip}>
            {(describedBy) => (
              <span aria-describedby={describedBy} tabIndex={0} className="text-xs text-muted" style={{ width: 'fit-content', overflowWrap: 'anywhere', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem' }}>
                {card.title}
              </span>
            )}
          </Tooltip>
          {card.empty ? (
            <span className="text-sm text-muted">{card.empty}</span>
          ) : (
            <>
              <span className="text-xl font-semibold tabular-nums" style={{ overflowWrap: 'anywhere', fontSize: '1.25rem' }}>
                {card.value}
              </span>
              <span className="text-xs text-muted tabular-nums">{card.was ? `was ${card.was}` : 'no earlier window'}</span>
            </>
          )}
        </Card>
      ))}
    </div>
  )
}

function TaskBars({ tasks }: { tasks: TaskTiming[] }) {
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
  // The nav's chips and their counts come from a read with no filter, so a
  // pick does not hide the other values.
  const loadAll = useCallback((id: string) => client.view(id, {}), [client])
  const { value: all, reload: reloadAll } = useRead(workspaceId, loadAll)
  // The top row's Stop the line reads the banner again here too.
  useEffect(() => {
    const again = () => {
      void reload()
      void reloadAll()
    }
    window.addEventListener(LINE_EVENT, again)
    return () => window.removeEventListener(LINE_EVENT, again)
  }, [reload, reloadAll])
  const [unit, setUnit] = useState<Unit>('day')
  const [order, setOrder] = useState(FLOW_ORDER)
  const choices = useMemo(() => (all ? flowChoices(all, view?.phases) : null), [all, view?.phases])
  return (
    <section aria-labelledby="avoozl-flow-title" className="flex flex-col gap-3.5">
      <ViewHeading id="avoozl-flow-title" view="flow">
        Flow
      </ViewHeading>
      <p className="text-sm text-muted">Where delivery time goes. Retros and their proposals are under Retros.</p>
      {/* The sort and filters sit in the left nav under the open Flow section (nav-slot.tsx). */}
      {choices && <FlowRail filter={filter} onFilter={setFilter} order={order} onOrder={setOrder} choices={choices} />}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!view ? (
        <p className="text-sm text-muted">{busy ? 'Loading…' : 'Not loaded'}</p>
      ) : (
        <>
          <LineBanner stops={view.line} workspaceId={workspaceId} onChanged={() => void reload()} />
          <GithubFlow workspaceId={workspaceId} />
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
            <TaskBars tasks={sortTasks(view.tasks, order)} />
          ) : (
            <Card data-no-timing>
              <EmptyState icon={<Gauge size={36} aria-hidden="true" />} title="No timing yet" subtitle="Avoozl records where each task's time goes as soon as a task is dispatched." />
            </Card>
          )}
          <FlowCharts view={view} unit={unit} onUnit={setUnit} />
          <PlanningFlow groups={view.planning ?? []} />
          <CiFlow value={view.ci} />
          <UsagePanel view={view} unit={unit} />
          <Records view={view} />
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
