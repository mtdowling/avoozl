import { PlanningFlow } from './PlanningFlow.tsx'
import CiFlow from './CiFlow.tsx'
// The Flow tab (design §8.4, R48): where delivery time goes. Retros and
// Proposals are the Retros pill's pages (owner note 2026-11-17). Read-only
// except Run anyway and Resume on a stopped line. Pull requests and CI runs
// stay in Issue Radar and GitHub; this tab shows graph and delivery timing only.
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useAppApi } from './host.ts'
import { Card } from './ui/Card'
import { EmptyState } from './ui/EmptyState'
import FlowBuilds from './FlowBuilds.tsx'
import Badge from './ui/Badge.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { useStoredFilter } from './FilterPanel.tsx'
import { FlowRail } from './FlowRail.tsx'
import { ICON, IconLabel, SectionHeading, ShowMore, ViewHeading, useConfirm, usePages } from './ui/controls.tsx'
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
  stopRows,
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
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'
import { Glyph } from './ui/Glyph'
import { TONE } from './ui/tones.ts'

// A stacked bar by stage, scaled to `scale` ms (the longest bar shown).
export function StageBar({ stages, scale, label }: { stages: Record<string, number>; scale: number; label: string }) {
  const parts = barSegments(stages),
    total = parts.reduce((sum, p) => sum + p.ms, 0)
  const text = `${label}: ${parts.map((p) => `${p.label} ${duration(p.ms)}`).join(', ') || 'no time yet'}`
  return (
    <Box css-width={`${Math.max(4, scale ? (100 * total) / scale : 100)}%`}>
      <Tooltip text={text} display="block">
        {(describedBy) => (
          <Box
            role="img"
            aria-label={text}
            aria-describedby={describedBy}
            tabIndex={0}
            css-display="flex"
            css-height="12"
            css-border-radius="4"
            css-overflow="hidden"
            css-background="mix-muted-15%-transparent"
          >
            {parts.map((p) => (
              <Box key={p.stage} as="span" css-width={`${p.share * 100}%`} css-background={p.color} css-display="block" css-height="100%" />
            ))}
          </Box>
        )}
      </Tooltip>
    </Box>
  )
}

export function StageLegend() {
  return (
    <Hint as="ul" flex flexWrap gapX="3" gapY="1" size="xs" aria-label="Stages">
      {STAGES.map((stage) => (
        <Box key={stage} as="li" inlineFlex items="center" gap="1">
          <Box aria-hidden="true" as="span" css-width="10" css-height="10" css-border-radius="2" css-background={STAGE_COLORS[stage]} css-display="inline-block" />
          {STAGE_LABELS[stage]}
        </Box>
      ))}
    </Hint>
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
    <Stack gap={2} data-line-banner>
      {stops.map((stop) => (
        <Box
          key={stop.id}
          role="alert"
          css-border-color="danger"
          css-background="mix-danger-10%-card"
          flex
          flexWrap
          items="center"
          gap="3"
          rounded="lg"
          border="all"
          p="3"
          size="sm"
        >
          <Glyph icon={CircleAlert} size={18} aria-hidden="true" css-color="danger" css-flex="none" />
          <Box css-min-width="14rem" flex minW0 flex1 flexCol gap="0.5">
            <Box as="span" css-overflow-wrap="anywhere">
              {bannerText(stop)}
            </Box>
            {stop.manual && (
              <Hint size="xs" data-line-pulled>
                Pulled by {stop.by?.name ?? 'someone'}, {relativeTime(stop.openedAt, Date.now())}. Only a person can resume it.
              </Hint>
            )}
            {stop.runAnyway && (
              <Hint size="xs">
                Run anyway by {stop.runAnyway.by}, {relativeTime(stop.runAnyway.at, Date.now())}.
              </Hint>
            )}
          </Box>
          <Row gap={2} align="start">
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
              <IconLabel icon={Play} tooltip="Resume new work while the check still fails; asks first" onClick={() => void runAnyway(stop)} variant="danger">
                Run anyway
              </IconLabel>
            )}
          </Row>
        </Box>
      ))}
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
    </Stack>
  )
}

// Six tiles on one full-width row; two per row on a phone so none gets narrow.
function MetricCards({ view }: { view: FlowViewModel }) {
  const phone = useMedia('(max-width: 767px)')
  return (
    <Box css-display="grid" css-width="100%" css-gap="0.75rem" css-grid-template-columns={`repeat(${phone ? 2 : 6}, minmax(0, 1fr))`} data-flow-cards>
      {metricCards(view).map((card) => (
        <Card key={card.key} css-min-width="0" flex flexCol gap="1">
          <Tooltip text={card.tip}>
            {(describedBy) => (
              <Hint
                aria-describedby={describedBy}
                tabIndex={0}
                as="span"
                css-width="fit-content"
                css-overflow-wrap="anywhere"
                css-font-weight="700"
                css-text-transform="uppercase"
                size="xs"
              >
                {card.title}
              </Hint>
            )}
          </Tooltip>
          {card.empty ? (
            <Hint size="sm">{card.empty}</Hint>
          ) : (
            <>
              <Box as="span" css-overflow-wrap="anywhere" css-font-size="1.25rem" textXl weight="semibold" tabularNums>
                {card.value}
              </Box>
              <Hint as="span" size="xs" tabularNums>
                {card.was ? `was ${card.was}` : 'no earlier window'}
              </Hint>
            </>
          )}
        </Card>
      ))}
    </Box>
  )
}

function TaskBars({ tasks }: { tasks: TaskTiming[] }) {
  const drawer = useTaskDrawer()
  const narrow = useMedia('(max-width: 767px)')
  const pages = usePages(String(tasks.length))
  const scale = Math.max(0, ...tasks.map((t) => STAGES.reduce((sum, s) => sum + (t.stages[s] || 0), 0)))
  const shown = pages.take('flow-bars', tasks)
  return (
    <Card flex flexCol gap="2">
      <SectionHeading title="Time per task" />
      <StageLegend />
      <Box as="ul" flex flexCol gap="1.5">
        {shown.map((task) => {
          const name = (
            <Box as="span" minW0 truncate>
              <Box as="span" tabularNums>
                {task.taskId}
              </Box>{' '}
              <Hint>{task.title}</Hint>
            </Box>
          )
          const bar = <StageBar stages={task.stages} scale={scale} label={task.taskId} />
          const info = (
            <Box as="span" inlineFlex items="center" gap="1.5" whitespace="nowrap" tabularNums>
              {task.coarse && (
                <Tooltip text="Built from phase markers or events, not from tool calls">
                  {(describedBy) => (
                    <Hint aria-describedby={describedBy} tabIndex={0} size="xs">
                      (coarse)
                    </Hint>
                  )}
                </Tooltip>
              )}
              {task.batch && <Badge>batch</Badge>}
              {duration(task.leadMs)}
              <Tooltip text="Open this task's details in the drawer">
                {(describedBy) => (
                  <PlainButton
                    type="button"
                    aria-label={`Details for ${task.taskId}`}
                    aria-describedby={describedBy}
                    onClick={() => drawer.openTask(task.taskId)}
                    css-display="inline-flex"
                    css-color="muted"
                  >
                    <DetailsIcon size={ICON} aria-hidden="true" />
                  </PlainButton>
                )}
              </Tooltip>
            </Box>
          )
          // Narrow screens: the bar gets its own full-width row.
          return narrow ? (
            <Box key={task.taskId} as="li" flex flexCol gap="1" size="sm" data-flow-bar={task.taskId}>
              <Box as="span" flex items="center" justify="between" gap="2">
                {name}
                {info}
              </Box>
              {bar}
            </Box>
          ) : (
            <Box key={task.taskId} as="li" css-grid-template-columns="minmax-6rem-14rem-minmax-0-1fr-auto" grid items="center" gap="2" size="sm" data-flow-bar={task.taskId}>
              {name}
              {bar}
              {info}
            </Box>
          )
        })}
      </Box>
      <ShowMore {...pages.more('flow-bars', tasks.length)} />
      <Hint as="p" size="xs">
        (coarse) marks bars built from reports, not tool calls.
      </Hint>
    </Card>
  )
}

// Every line stop in the window, pulled and automatic (R64.11): what it was,
// who pulled it, when, and its time to fix.
function LineStops({ stops }: { stops: LineStop[] }) {
  const rows = useMemo(() => stopRows(stops, relativeTime), [stops])
  const pages = usePages(String(rows.length))
  if (!rows.length) return null
  return (
    <section data-line-stops aria-label="Line stops">
      <Card flex flexCol gap="2" size="sm">
        <SectionHeading title="Line stops" />
        <Stack as="ul" gap={2}>
          {pages.take('line-stops', rows).map((row) => (
            // Badge and title on one line that wraps; the meta line under it.
            <Stack key={row.id} as="li" gap={1} data-line-stop={row.id}>
              <Row gap={2} wrap={false} align="start">
                {/* Its own box, so a two-line title does not stretch the badge. */}
                <Box as="span" css-flex="none">
                  <Badge variant={row.kind === 'Automatic' ? 'warning' : 'danger'}>{row.kind}</Badge>
                </Box>
                <Box as="span" minW0 flex1 css-overflow-wrap="anywhere">
                  {row.check && (
                    <>
                      <Box as="code" size="xs">
                        {row.check}
                      </Box>{' '}
                    </>
                  )}
                  {row.title}
                </Box>
              </Row>
              <Hint as="span" size="xs" data-stop-meta>
                {row.meta.join(' · ')}
              </Hint>
            </Stack>
          ))}
        </Stack>
        <ShowMore {...pages.more('line-stops', rows.length)} />
      </Card>
    </section>
  )
}

function Records({ view }: { view: FlowViewModel }) {
  if (!view.flaky.length && !view.ciOnly.length) return null
  return (
    <Card flex flexCol gap="1" size="sm">
      <SectionHeading title="Checks that disagree" />
      {view.ciOnly.slice(0, 10).map((r) => (
        <span key={r.id}>
          CI only: {r.checks.join(', ')} failed in CI on {r.taskId} ({r.commit.slice(0, 7)}) after passing here.
        </span>
      ))}
      {view.flaky.slice(0, 10).map((r) => (
        <span key={r.id}>
          Flaky:{' '}
          <Box as="code" size="xs">
            {r.check}
          </Box>{' '}
          failed, then passed on {r.commit.slice(0, 7)}.
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
    <Box aria-labelledby="avoozl-flow-title" as="section" flex flexCol gap="3.5">
      <ViewHeading id="avoozl-flow-title" view="flow">
        Flow
      </ViewHeading>
      <Hint as="p" size="sm">
        Where delivery time goes. Retros and their proposals are under Retros.
      </Hint>
      {/* The sort and filters sit in the left nav under the open Flow section (nav-slot.tsx). */}
      {choices && <FlowRail filter={filter} onFilter={setFilter} order={order} onOrder={setOrder} choices={choices} />}
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
      {!view ? (
        <Hint as="p" size="sm">
          {busy ? 'Loading…' : 'Not loaded'}
        </Hint>
      ) : (
        <>
          <LineBanner stops={view.line} workspaceId={workspaceId} onChanged={() => void reload()} />
          <FlowBuilds workspaceId={workspaceId} />
          <MetricCards view={view} />
          {view.bottleneck && (
            <Card flex items="start" gap="2" size="sm">
              <Glyph icon={Gauge} size={18} aria-hidden="true" css-color={STAGE_COLORS[view.bottleneck.stage]} css-flex="none" />
              <span>
                <Box as="span" weight="semibold">
                  Biggest bottleneck: {STAGE_LABELS[view.bottleneck.stage]}
                </Box>
                , {Math.round(view.bottleneck.share * 100)}% of lead time
                {view.bottleneck.repository ? ` in ${view.bottleneck.repository}` : ''} (median {duration(view.bottleneck.medianMs)} per task).
              </span>
            </Card>
          )}
          {view.tasks.length ? (
            <TaskBars tasks={sortTasks(view.tasks, order)} />
          ) : (
            <Card data-no-timing>
              <EmptyState
                icon={<Gauge size={36} aria-hidden="true" />}
                title="No timing yet"
                subtitle="Avoozl records where each task's time goes as soon as a task is dispatched."
              />
            </Card>
          )}
          <FlowCharts view={view} unit={unit} onUnit={setUnit} />
          <LineStops stops={view.stops} />
          <PlanningFlow groups={view.planning ?? []} />
          <CiFlow value={view.ci} />
          <UsagePanel view={view} unit={unit} />
          <Records view={view} />
        </>
      )}
    </Box>
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
  if (!timing)
    return (
      <Hint as="p" size="sm">
        No timing yet: Avoozl records it from the task's first dispatch.
      </Hint>
    )
  return (
    <Box flex flexCol gap="2" size="sm" data-timing-fold>
      <Row gap={2} wrap={false}>
        <Box minW0 flex1>
          <StageBar stages={timing.stages} scale={0} label={timing.taskId} />
        </Box>
        <Box as="span" tabularNums>
          {duration(timing.leadMs)}
        </Box>
      </Row>
      {timing.batch && <Hint size="xs">Ran in {timing.batch}.</Hint>}
      <Box as="ul" flex flexCol gap="0.5">
        {timing.spans.map((span) => (
          <Box key={span.id} as="li" flex items="center" gap="2">
            <Box
              aria-hidden="true"
              as="span"
              css-width="8"
              css-height="8"
              css-border-radius="2"
              css-background={STAGE_COLORS[span.stage as keyof typeof STAGE_COLORS] ?? TONE.muted}
              css-flex="none"
            />
            <span>{STAGE_LABELS[span.stage as keyof typeof STAGE_LABELS] ?? span.stage}</span>
            {span.detail && (
              <Box as="code" size="xs">
                {span.detail}
              </Box>
            )}
            <Box as="span" tabularNums>
              {duration(span.lengthMs)}
            </Box>
            <Hint size="xs">{SOURCE_TEXT[span.source]}</Hint>
          </Box>
        ))}
      </Box>
      {timing.versions && timing.versions.length > 0 && (
        <Hint as="ul" flex flexCol gap="0.5" size="xs" data-timing-versions>
          {timing.versions.map((v) => (
            <Box key={v.attempt} as="li" css-overflow-wrap="anywhere">
              Attempt {v.attempt} ran on {Object.values(v.prompts).join(', ') || 'the built-in prompts'}
              {Object.keys(v.skills).length
                ? `; skills ${Object.entries(v.skills)
                    .map(([target, sha]) => `${target}@${sha.slice(0, 8)}`)
                    .join(', ')}`
                : ''}
              .
            </Box>
          ))}
        </Hint>
      )}
    </Box>
  )
}
