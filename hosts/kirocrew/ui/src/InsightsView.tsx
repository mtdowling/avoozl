// The Insights view, the page's home (simplify §D13): a read-only look at
// what waits, how each spec burns down, and where task time goes, from what
// Avoozl already keeps (insights.view), plus the saved retros (retro.list,
// retro.read). The filters sit in the left nav under its open section.
// Charts are plain SVG in theme colors, with no motion.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAppApi } from './host.ts'
import { NavSlotFor } from './nav-slot.tsx'
import { RailBlock, RailChips, RailRow, RailStyle } from './NavRail.tsx'
import { IconLabel, ShowMore, ViewHeading, useRunInChat } from './ui/controls.tsx'
import { useRefreshCountdown } from './RefreshButton.tsx'
import { usePublishRefresh } from './page-refresh.tsx'
import { Clock, Layers, MessageSquare, Package, X } from './icons.ts'
import { errorMessage } from './workspace-api.ts'
import { DocumentReader } from './DocumentReader.tsx'
import {
  CHART,
  EMPTY,
  RANGES,
  barRects,
  burndownLine,
  burndownPaths,
  duration,
  insightsClient,
  retroScope,
  retroWhen,
  stripItems,
  type InsightsFilter,
  type InsightsView as View,
  type RetroItem,
  type StripItem,
} from './insights-api.ts'
import { TONE } from './ui/tones.ts'
import { Box } from './ui/Box'
import { Card } from './ui/Card'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { PlainButton, SvgPath, SvgRect, SvgRoot } from './ui/Plain'

const STRIP_TONE = { warn: TONE.warn, ok: TONE.ok, danger: TONE.danger, muted: TONE.muted } as const
// Burndown cards shown before Show more.
const FIRST_SPECS = 6

function Strip(props: { items: StripItem[]; onOpen: (item: StripItem) => void }) {
  return (
    <Box as="ul" aria-label="Right now" flex flexWrap gap="2" listNone m0 css-padding="0" data-insights-strip>
      {props.items.map((item) => (
        <li key={item.key}>
          <PlainButton
            type="button"
            onClick={() => props.onOpen(item)}
            flex
            items="center"
            gap="1.5"
            px="3"
            py="1.5"
            rounded="full"
            border="all"
            size="sm"
            hoverBgAccent10
            css-border-color="border"
            css-background="card"
            css-color="text"
            data-strip-item={item.key}
          >
            <Box as="span" aria-hidden="true" w2 h2 rounded="full" shrink0 css-background-color={STRIP_TONE[item.tone]} />
            <Hint>{item.label}</Hint>
            <Box as="span" weight="semibold" tabularNums>
              {item.value}
            </Box>
          </PlainButton>
        </li>
      ))}
    </Box>
  )
}

function ChartCard(props: { id: string; title: string; meta?: ReactNode; empty?: string | null; children?: ReactNode }) {
  return (
    <Card flex flexCol gap="2" p="4" minW0>
      <Box as="section" aria-label={props.title} flex flexCol gap="2" minW0 data-insights-chart={props.id}>
        <Box as="h3" m0 size="sm" weight="semibold">
          {props.title}
        </Box>
        {props.meta && (
          <Hint as="p" m0 size="xs">
            {props.meta}
          </Hint>
        )}
        {props.empty ? (
          <Hint as="p" m0 size="sm" data-insights-empty>
            {props.empty}
          </Hint>
        ) : (
          props.children
        )}
      </Box>
    </Card>
  )
}

function Chart(props: { label: string; children: ReactNode }) {
  return (
    <SvgRoot role="img" aria-label={props.label} viewBox={`0 0 ${CHART.width} ${CHART.height}`} width="100%" css-max-width="100%">
      <SvgRect x={0} y={CHART.height - CHART.pad} width={CHART.width} height={0.5} css-fill={TONE.border} />
      {props.children}
    </SvgRoot>
  )
}

function Bars(props: { values: number[]; label: string; tone?: string }) {
  const { bars } = barRects(props.values)
  return (
    <Chart label={props.label}>
      {bars.map((bar, i) => (
        <SvgRect key={i} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx={1} css-fill={props.tone ?? TONE.accent} />
      ))}
    </Chart>
  )
}

// A labeled horizontal bar: the stage rows and the review rounds.
function BarRow(props: { label: string; value: string; share: number; tone?: string }) {
  return (
    <Box as="li" flex flexCol gap="0.5" minW0>
      <Box flex justify="between" gap="2" size="xs">
        <Box as="span" truncate>
          {props.label}
        </Box>
        <Hint tabularNums>{props.value}</Hint>
      </Box>
      <Box h2 rounded="full" overflow="hidden" css-background={'mix-muted-12%-transparent'}>
        <Box hFull rounded="full" css-width={`${Math.round(Math.max(0.02, props.share) * 100)}%`} css-background-color={props.tone ?? TONE.accent} />
      </Box>
    </Box>
  )
}

function Legend(props: { items: [string, string][] }) {
  return (
    <Hint as="div" flex flexWrap gap="3" size="xs">
      {props.items.map(([label, color]) => (
        <Box as="span" key={label} inlineFlex items="center" gap="1">
          <Box as="span" aria-hidden="true" w2 h2 rounded="full" css-background-color={color} />
          {label}
        </Box>
      ))}
    </Hint>
  )
}

function Burndown(props: { spec: string; points: View['burndown'][number]['points'] }) {
  const { open, done, max } = burndownPaths(props.points)
  return (
    <Box as="li" flex flexCol gap="1" minW0 data-burndown={props.spec}>
      <Box flex justify="between" gap="2" size="xs">
        <Box as="span" weight="medium" truncate>
          {props.spec}
        </Box>
        <Hint tabularNums>max {max}</Hint>
      </Box>
      <Chart label={`${props.spec}: ${burndownLine(props.points)}`}>
        <SvgPath d={open} fill="none" strokeWidth={1.5} strokeDasharray="4 2" css-stroke={TONE.purpleOrAccent} />
        <SvgPath d={done} fill="none" strokeWidth={1.5} css-stroke={TONE.ok} />
      </Chart>
      <Hint as="p" m0 size="xs">
        {burndownLine(props.points)}
      </Hint>
    </Box>
  )
}

function Retros(props: { items: RetroItem[] | null; onOpen: (item: RetroItem) => void; onRun: () => void }) {
  return (
    <Card flex flexCol gap="2" p="4" minW0>
      <Box as="section" aria-label="Retros" flex flexCol gap="2" data-insights-retros>
        <Box flex flexWrap items="center" justify="between" gap="2">
          <Box as="h3" m0 size="sm" weight="semibold">
            Retros
          </Box>
          <IconLabel icon={MessageSquare} tooltip="Run in a chat: the avoozl-retro skill reads where the time went and saves its report here" onClick={props.onRun}>
            Run a retro
          </IconLabel>
        </Box>
        {props.items === null ? (
          <Hint as="p" m0 size="sm">
            Reading…
          </Hint>
        ) : props.items.length === 0 ? (
          <Hint as="p" m0 size="sm" data-insights-empty>
            {EMPTY.retros}
          </Hint>
        ) : (
          <Box as="ul" listNone m0 css-padding="0" flex flexCol gap="1">
            {props.items.map((item) => (
              <li key={item.name}>
                <PlainButton type="button" align="left" hoverUnderline flex items="baseline" gap="2" wFull minW0 onClick={() => props.onOpen(item)} data-retro={item.name}>
                  <Box as="span" truncate flex1 minW0>
                    {item.title}
                  </Box>
                  <Hint size="xs" tabularNums shrink0>
                    {retroWhen(item.at)}
                  </Hint>
                </PlainButton>
              </li>
            ))}
          </Box>
        )}
      </Box>
    </Card>
  )
}

export default function InsightsView(props: { workspaceId: string | null; onOpen: (tab: StripItem['tab'], settingsTab?: string) => void }) {
  const { workspaceId } = props
  const api = useAppApi()
  const client = useMemo(() => insightsClient(api), [api])
  const runInChat = useRunInChat()
  const [filter, setFilter] = useState<InsightsFilter>({})
  const [view, setView] = useState<View | null>(null)
  const [retros, setRetros] = useState<RetroItem[] | null>(null)
  const [reading, setReading] = useState<(RetroItem & { text: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [allSpecs, setAllSpecs] = useState(false)
  const key = JSON.stringify(filter)

  const load = useCallback(async () => {
    if (!workspaceId) return
    setBusy(true)
    setError(null)
    try {
      const [next, saved] = await Promise.all([client.view(workspaceId, JSON.parse(key) as InsightsFilter), client.retros(workspaceId)])
      setView(next)
      setRetros(saved)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [client, workspaceId, key])
  useEffect(() => {
    void load()
  }, [load])
  usePublishRefresh(useRefreshCountdown(workspaceId, () => void load(), busy || !workspaceId))

  const open = async (item: RetroItem) => {
    if (!workspaceId) return
    try {
      setReading(await client.retro(workspaceId, item.name))
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  const days = filter.days ?? 30
  const set = (change: Partial<InsightsFilter>) => setFilter({ ...filter, ...change })
  const chips = (names: string[] | undefined) => (names ?? []).map((name) => ({ value: name, label: name }))
  const finished = view?.finished ?? []
  const finishedCount = finished.reduce((n, d) => n + d.count, 0)
  const stageMax = Math.max(1, ...(view?.stages ?? []).map((s) => s.seconds))
  const reviewMax = Math.max(1, ...(view?.review.rounds ?? []).map((r) => r.tasks))
  const specs = view?.burndown ?? []
  const shownSpecs = allSpecs ? specs : specs.slice(0, FIRST_SPECS)
  const rework = view?.rework

  return (
    <Box aria-labelledby="avoozl-insights-title" as="section" flex flexCol gap="3.5" data-insights>
      <ViewHeading id="avoozl-insights-title" view="insights">
        Insights
      </ViewHeading>
      <Hint as="p" size="sm">
        What waits, how each spec burns down and where task time goes, from this workspace's own records. Nothing here changes anything.
      </Hint>
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
      <NavSlotFor section="insights">
        <div role="search" aria-label="Filter insights" data-nav-filters="avoozl-insights" data-rail>
          <RailStyle />
          <RailBlock
            first
            id="range"
            icon={Clock}
            title="Range"
            action={
              (filter.spec || filter.repo || filter.days) && (
                <PlainButton type="button" data-rail-icon onClick={() => setFilter({})} css-gap="2" css-align-items="center" css-font-size="12">
                  <X size={11} aria-hidden="true" /> Clear
                </PlainButton>
              )
            }
          >
            {RANGES.map((n) => (
              <RailRow key={n} label={`Last ${n} days`} active={days === n} onClick={() => set({ days: n })} attrs={{ 'data-rail-range': String(n) }} />
            ))}
          </RailBlock>
          <RailChips id="spec" icon={Layers} title="Spec" noun="spec" items={chips(view?.filters.specs)} picked={filter.spec} onPick={(spec) => set({ spec })} />
          <RailChips id="repo" icon={Package} title="Repository" noun="repository" items={chips(view?.filters.repos)} picked={filter.repo} onPick={(repo) => set({ repo })} />
        </div>
      </NavSlotFor>
      {view && <Strip items={stripItems(view.strip)} onOpen={(item) => props.onOpen(item.tab, item.settingsTab)} />}
      {!view && !error && (
        <Hint as="p" size="sm" role="status">
          Reading…
        </Hint>
      )}
      {view && (
        <Box grid gap="3" css-grid-template-columns="repeat(auto-fill, minmax(min(100%, 18rem), 1fr))" data-insights-charts>
          <ChartCard
            id="burndown"
            title="Burndown"
            meta={
              specs.length ? (
                <Legend
                  items={[
                    ['open (dashed)', TONE.purpleOrAccent],
                    ['ticked', TONE.ok],
                  ]}
                />
              ) : null
            }
            empty={specs.length ? null : EMPTY.burndown}
          >
            <Box as="ul" listNone m0 css-padding="0" flex flexCol gap="3">
              {shownSpecs.map((b) => (
                <Burndown key={b.spec} spec={b.spec} points={b.points} />
              ))}
            </Box>
            {!allSpecs && <ShowMore left={specs.length - shownSpecs.length} onMore={() => setAllSpecs(true)} />}
          </ChartCard>
          <ChartCard
            id="finished"
            title="Tasks finished per day"
            meta={finishedCount ? `${finishedCount} in the last ${days} days` : null}
            empty={finishedCount ? null : EMPTY.finished}
          >
            <Bars values={finished.map((d) => d.count)} label={`${finishedCount} tasks finished in the last ${days} days`} />
          </ChartCard>
          <ChartCard
            id="lead-time"
            title="Lead time per task"
            meta={
              view.leadTime.tasks.length ? `Median ${duration(view.leadTime.median)} · 85th percentile ${duration(view.leadTime.p85)} · ${view.leadTime.tasks.length} tasks` : null
            }
            empty={view.leadTime.tasks.length ? null : EMPTY.leadTime}
          >
            <Bars
              values={view.leadTime.tasks.map((t) => t.seconds)}
              label={`Lead time of ${view.leadTime.tasks.length} tasks, median ${duration(view.leadTime.median)}`}
              tone={TONE.purpleOrAccent}
            />
          </ChartCard>
          <ChartCard id="stages" title="Time per stage" empty={view.stages.length ? null : EMPTY.stages}>
            <Box as="ul" listNone m0 css-padding="0" flex flexCol gap="2">
              {view.stages.map((s) => (
                <BarRow key={s.stage} label={s.stage} value={`${duration(s.seconds)} · ${s.tasks} ${s.tasks === 1 ? 'task' : 'tasks'}`} share={s.seconds / stageMax} />
              ))}
            </Box>
          </ChartCard>
          <ChartCard
            id="review"
            title="Review rounds"
            meta={view.review.tasks ? `${view.review.average} on average over ${view.review.tasks} tasks` : null}
            empty={view.review.tasks ? null : EMPTY.review}
          >
            <Box as="ul" listNone m0 css-padding="0" flex flexCol gap="2">
              {view.review.rounds.map((r) => (
                <BarRow
                  key={r.label}
                  label={`${r.label} ${r.label === '1' ? 'round' : 'rounds'}`}
                  value={`${r.tasks} ${r.tasks === 1 ? 'task' : 'tasks'}`}
                  share={r.tasks / reviewMax}
                />
              ))}
            </Box>
          </ChartCard>
          <ChartCard id="rework" title="Rework" empty={rework?.finished ? null : EMPTY.rework}>
            {rework && (
              <Box as="ul" listNone m0 css-padding="0" flex flexCol gap="2">
                <BarRow label="More than one attempt" value={`${rework.reworked} of ${rework.finished}`} share={rework.reworked / Math.max(1, rework.finished)} tone={TONE.warn} />
                {rework.judged > 0 && (
                  <BarRow label="Passed first time" value={`${rework.firstPass} of ${rework.judged}`} share={rework.firstPass / rework.judged} tone={TONE.ok} />
                )}
              </Box>
            )}
          </ChartCard>
        </Box>
      )}
      <Retros items={retros} onOpen={(item) => void open(item)} onRun={() => runInChat({ kind: 'retro', scope: retroScope(filter), days })} />
      {reading && workspaceId && (
        <DocumentReader workspaceId={workspaceId} target={{ document: reading.path, lineStart: null, lineEnd: null }} text={reading.text} onClose={() => setReading(null)} />
      )}
    </Box>
  )
}
