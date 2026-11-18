// The Flow tab's charts over time and its token and credit totals (owner
// addition 2026-11-13). Each chart reads the same filtered flow.view, so the
// shared filter panel narrows them all. Theme colors only, readable at 320px.
import { Card } from './ui/Card'
import { SectionHeading } from './ui/controls.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import {
  STAGES,
  STAGE_COLORS,
  STAGE_LABELS,
  duration,
  percent,
  usageMessage,
  usageText,
  type FlowViewModel,
  type SeriesPoint,
  type UsageRow,
} from './flow-api.ts'
import { StageLegend } from './FlowView.tsx'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

const W = 300,
  H = 90,
  PAD = 4

// One small line chart: the bucket's value or a gap where there is none.
function Line({ points, value, format, color }: { points: SeriesPoint[]; value: (p: SeriesPoint) => number | null; format: (v: number) => string; color: string }) {
  const values = points.map(value),
    known = values.filter((v): v is number => v !== null),
    max = Math.max(...known, 0) || 1,
    x = (i: number) => (points.length < 2 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (points.length - 1)),
    y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD)
  const path = values
    .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
    .reduce<string[][]>((runs, p) => {
      if (p === null) runs.push([])
      else runs[runs.length - 1].push(p)
      return runs
    }, [[]])
    .filter((run) => run.length)
  const last = known.at(-1)
  return (
    <Stack gap={1}>
      <Box as="span" size="lg" weight="semibold" tabularNums>{last === undefined ? '–' : format(last)}</Box>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={points.map((p, i) => `${p.key}: ${values[i] === null ? 'none' : format(values[i]!)}`).join(', ')} preserveAspectRatio="none">
        <line x1={0} x2={W} y1={H - PAD} y2={H - PAD} stroke="var(--border)" strokeWidth={1} />
        {path.map((run, i) => (
          <polyline key={i} points={run.join(' ')} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
        {values.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={color} />))}
      </svg>
    </Stack>
  )
}

// Stacked bars per bucket: each stage's share of that bucket's time.
function StageMix({ points }: { points: SeriesPoint[] }) {
  return (
    <Stack gap={1}>
      <div className="flex items-end gap-1" style={{ height: H }} role="img" aria-label="Stage mix per period">
        {points.map((p) => {
          const total = STAGES.reduce((sum, s) => sum + p.stages[s], 0)
          return (
            <Tooltip key={p.key} text={`${p.key}: ${STAGES.filter((s) => p.stages[s]).map((s) => `${STAGE_LABELS[s]} ${duration(p.stages[s])}`).join(', ') || 'no time'}`}>
              {(describedBy) => (
                <div tabIndex={0} aria-describedby={describedBy} className="flex flex-col-reverse overflow-hidden rounded-sm" style={{ height: H, width: 14, background: 'color-mix(in srgb, var(--muted) 12%, transparent)' }}>
                  {STAGES.filter((s) => p.stages[s]).map((s) => (
                    <span key={s} style={{ height: `${(100 * p.stages[s]) / (total || 1)}%`, background: STAGE_COLORS[s], display: 'block' }} />
                  ))}
                </div>
              )}
            </Tooltip>
          )
        })}
      </div>
    </Stack>
  )
}

function Bars({ rows }: { rows: UsageRow[] }) {
  const value = (r: UsageRow) => r.credits || r.input + r.output,
    max = Math.max(...rows.map(value), 0) || 1
  return (
    <div className="flex items-end gap-1" style={{ height: H }} role="img" aria-label={rows.map((r) => `${r.key}: ${usageText(r)}`).join(', ')}>
      {rows.map((r) => (
        <span key={r.key} className="rounded-sm" style={{ display: 'block', flex: 'none', height: Math.max(2, Math.round((H * value(r)) / max)), width: 14, background: 'var(--accent)' }} />
      ))}
    </div>
  )
}

function Chart({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <Box css-border-color="border" flex minW0 flexCol gap="1" rounded="lg" border="all" p="3">
      <SectionHeading level={4} title={title} />
      {empty ? <Hint size="sm">Nothing finished in this window yet.</Hint> : children}
    </Box>
  )
}

export type Unit = 'day' | 'week'

// By day or by week, for every chart over time.
function UnitPicker({ unit, onUnit }: { unit: Unit; onUnit: (unit: Unit) => void }) {
  return (
    <Box role="radiogroup" aria-label="Group by" css-background="bg-elevated" inlineFlex gap="1" rounded="lg" p="1">
      {(['day', 'week'] as const).map((u) => (
        <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => onUnit(u)} className="rounded-md px-2.5 py-1 text-xs font-medium" style={{ background: unit === u ? 'var(--card)' : 'transparent', color: 'var(--text)', boxShadow: unit === u ? 'inset 0 0 0 1px var(--accent)' : 'none' }}>
          {u === 'day' ? 'By day' : 'By week'}
        </button>
      ))}
    </Box>
  )
}

export function FlowCharts({ view, unit, onUnit }: { view: FlowViewModel; unit: Unit; onUnit: (unit: Unit) => void }) {
  const points = view.series?.[unit] ?? [],
    none = !points.length
  return (
    <Card className="flex flex-col gap-3">
      <SectionHeading title="Over time" actions={<UnitPicker unit={unit} onUnit={onUnit} />} />
      <Box css-grid-template-columns="repeat-auto-fill-minmax-min-100%-16rem-1fr" grid gap="3" data-flow-charts>
        <Chart title="Lead time (median)" empty={none}>
          <Line points={points} value={(p) => p.leadTimeMs} format={duration} color="var(--accent)" />
        </Chart>
        <Chart title="Flow efficiency" empty={none}>
          <Line points={points} value={(p) => p.flowEfficiency} format={percent} color="var(--ok)" />
        </Chart>
        <Chart title="First-pass rate" empty={none}>
          <Line points={points} value={(p) => p.firstPassRate} format={percent} color="var(--accent)" />
        </Chart>
        <Chart title="Fix work" empty={!points.some((p) => p.fixShare != null)}>
          <Line points={points} value={(p) => p.fixShare ?? null} format={percent} color="var(--accent)" />
        </Chart>
        <Chart title="Corrections" empty={!points.some((p) => (p.corrections ?? 0) > 0)}>
          <Line points={points} value={(p) => p.corrections ?? 0} format={(n) => String(n ?? 0)} color="var(--danger)" />
        </Chart>
        <Chart title="Time to fix" empty={!points.some((p) => p.timeToFixMs !== null)}>
          <Line points={points} value={(p) => p.timeToFixMs} format={duration} color="var(--danger)" />
        </Chart>
        <Chart title="Stage mix" empty={none}>
          <StageMix points={points} />
        </Chart>
      </Box>
      {!none && <StageLegend />}
    </Card>
  )
}

function UsageTable({ title, rows }: { title: string; rows: UsageRow[] }) {
  return (
    <Box flex minW0 flexCol gap="1">
      <Hint size="xs">{title}</Hint>
      <Box as="ul" flex flexCol gap="0.5" size="sm">
        {rows.slice(0, 8).map((r) => (
          <Box key={r.key} as="li" flex flexWrap justify="between" gapX="3">
            <Box as="span" minW0 truncate>{STAGE_LABELS[r.key as keyof typeof STAGE_LABELS] ?? r.key}</Box>
            <Box as="span" tabularNums tone="muted">{usageText(r)}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// Tokens and credits per task, plan, stage and model (owner addition): the
// one usage card. Its bars follow the Over time card's By day or By week,
// and it shows one message when there is nothing to show.
export function UsagePanel({ view, unit }: { view: FlowViewModel; unit: Unit }) {
  const usage = view.usage
  const message = usageMessage(usage)
  const rows = unit === 'day' ? usage?.byDay ?? [] : usage?.byWeek ?? []
  return (
    <Card className="flex flex-col gap-3" data-usage-card>
      <SectionHeading title="Tokens and credits" />
      {message || !usage ? (
        <Hint as="p" size="sm">{message}</Hint>
      ) : (
        <>
          <Box as="p" size="sm">
            Total: <Box as="span" tabularNums>{usageText(usage.total)}</Box> over {usage.total.turns} turns.
          </Box>
          {rows.length > 0 && (
            <Box flex minW0 flexCol gap="1">
              <Hint size="xs">{unit === 'day' ? 'By day' : 'By week'}</Hint>
              <Bars rows={rows} />
            </Box>
          )}
          <Box css-grid-template-columns="repeat-auto-fill-minmax-min-100%-16rem-1fr" grid gap="4">
            <UsageTable title="By stage" rows={usage.byStage} />
            <UsageTable title="By model" rows={usage.byModel} />
            <UsageTable title="By spec" rows={usage.byPlan} />
            <UsageTable title="By task (top 8)" rows={usage.byTask} />
          </Box>
        </>
      )}
    </Card>
  )
}
