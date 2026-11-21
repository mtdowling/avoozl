// The Insights view (simplify §D13): its calls (insights.view, retro.list,
// retro.read), the top strip's items, the charts' shapes and the words each
// empty chart shows. Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { MAIN_WORDS, duration } from '../../../../src/app/insights/format.ts'

export { duration }

export const RANGES = [7, 30, 90] as const
export type Range = (typeof RANGES)[number]

export interface InsightsFilter {
  days?: Range
  spec?: string
  repo?: string
}

export interface BurndownPoint {
  at: string
  open: number
  done: number
}

export interface InsightsView {
  range: { days: Range; spec: string | null; repo: string | null }
  strip: {
    needsYou: number
    inFlight: number
    ready: number
    main: { state: 'passing' | 'stopped' | 'unknown'; repositories: { repository: string; state: string }[] }
    loop: boolean
  }
  burndown: { spec: string; points: BurndownPoint[] }[]
  finished: { day: string; count: number }[]
  leadTime: { tasks: { taskId: string; spec: string | null; at: string; seconds: number }[]; median: number | null; p85: number | null }
  stages: { stage: string; seconds: number; spans: number; tasks: number }[]
  review: { tasks: number; average: number | null; rounds: { label: string; tasks: number }[] }
  rework: { finished: number; reworked: number; firstPass: number; judged: number }
  filters: { specs: string[]; repos: string[] }
}

export interface RetroItem {
  name: string
  at: string
  scope: string
  title: string
  path: string
}

export function insightsClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })).result
  return {
    view: (workspaceId: string, filter: InsightsFilter) => run<InsightsView>('insights.view', { ...filter }, workspaceId),
    retros: (workspaceId: string) => run<{ items: RetroItem[] }>('retro.list', {}, workspaceId).then((r) => r.items),
    retro: (workspaceId: string, name: string) => run<RetroItem & { text: string }>('retro.read', { name }, workspaceId),
  }
}

// The strip's five items, each with the view it opens: [tab, settings tab].
export interface StripItem {
  key: string
  label: string
  value: string
  tab: 'waiting' | 'delivery' | 'graph' | 'settings'
  settingsTab?: 'delivery'
  tone: 'warn' | 'ok' | 'danger' | 'muted'
}

export function stripItems(strip: InsightsView['strip']): StripItem[] {
  const main = strip.main.state
  return [
    { key: 'needs-you', label: 'Needs you', value: String(strip.needsYou), tab: 'waiting', tone: strip.needsYou ? 'warn' : 'muted' },
    { key: 'in-flight', label: 'In flight', value: String(strip.inFlight), tab: 'delivery', tone: 'muted' },
    { key: 'ready', label: 'Ready', value: String(strip.ready), tab: 'graph', tone: 'muted' },
    { key: 'main', label: 'Main', value: MAIN_WORDS[main] ?? main, tab: 'delivery', tone: main === 'passing' ? 'ok' : main === 'stopped' ? 'danger' : 'muted' },
    { key: 'autopilot', label: 'Autopilot', value: strip.loop ? 'on' : 'off', tab: 'settings', settingsTab: 'delivery', tone: strip.loop ? 'ok' : 'muted' },
  ]
}

// What each chart says when its range holds nothing.
export const EMPTY = {
  burndown: 'No task list changed in this range yet. A spec shows here once a commit ticks or adds one of its tasks.',
  finished: 'No finished tasks in this range yet.',
  leadTime: 'No lead times in this range yet. A task records one when it finishes.',
  stages: 'No stage time recorded in this range yet.',
  review: 'No review rounds in this range yet.',
  rework: 'No finished tasks in this range yet, so no rework to count.',
  retros: 'No saved retros yet. Run a retro and its report is saved here.',
} as const

export const CHART = { width: 320, height: 120, pad: 4 } as const

// A rounded maximum for an axis: 1, 2, 5, 10, 20, 50, …
export function niceMax(value: number): number {
  if (!(value > 0)) return 1
  const step = 10 ** Math.floor(Math.log10(value))
  return [1, 2, 5, 10].map((n) => n * step).find((n) => n >= value) ?? 10 * step
}

// Bars across the chart, one per value, with a 2-unit gap.
export function barRects(values: number[], { width, height, pad } = CHART) {
  const max = niceMax(Math.max(0, ...values)),
    slot = (width - pad * 2) / Math.max(1, values.length),
    gap = Math.min(2, slot / 4)
  return {
    max,
    bars: values.map((value, index) => {
      const h = (Math.max(0, value) / max) * (height - pad * 2)
      return { x: pad + index * slot + gap / 2, y: height - pad - h, width: Math.max(0.5, slot - gap), height: h }
    }),
  }
}

// The burndown's two lines, open and ticked, as SVG paths over time. Steps:
// a count holds until the next commit changes it.
export function burndownPaths(points: BurndownPoint[], { width, height, pad } = CHART) {
  const times = points.map((p) => Date.parse(p.at)),
    first = Math.min(...times),
    span = Math.max(1, Math.max(...times) - first),
    max = niceMax(Math.max(1, ...points.map((p) => Math.max(p.open, p.done)))),
    x = (t: number) => pad + ((t - first) / span) * (width - pad * 2),
    y = (n: number) => height - pad - (n / max) * (height - pad * 2)
  const path = (pick: (p: BurndownPoint) => number) =>
    points
      .map((p, i) => {
        const at = x(times[i]).toFixed(1),
          to = y(pick(p)).toFixed(1)
        return i === 0 ? `M${at},${to}` : `H${at}V${to}`
      })
      .join('')
  return { max, open: path((p) => p.open), done: path((p) => p.done) }
}

// One line about a burndown: where it started and where it is now.
export function burndownLine(points: BurndownPoint[]): string {
  const first = points[0],
    last = points.at(-1)!
  return `${last.open} open, ${last.done} ticked (from ${first.open} open, ${first.done} ticked)`
}

// "2026-11-21 09:30" from an ISO time, in UTC as the retro's file name.
export const retroWhen = (at: string) => at.slice(0, 16).replace('T', ' ')

// The seed of Run a retro: the skill and the view's scope.
export function retroScope(filter: InsightsFilter): string {
  return filter.spec ?? filter.repo ?? 'workspace'
}
