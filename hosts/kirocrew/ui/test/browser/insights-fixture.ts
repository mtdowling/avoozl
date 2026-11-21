// The Insights view's fake replies (harness ?page=app). With &insights=full
// every chart, the strip and two saved retros have data; otherwise each is
// empty, as on a new workspace.
import { answer } from './stubs.tsx'

const DAY = 24 * 3600 * 1000
const NOW = Date.parse('2026-11-21T12:00:00Z')
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString()
const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(NOW - (n - 1 - i) * DAY).toISOString().slice(0, 10))

const EMPTY = (range: number) => ({
  range: { days: range, spec: null, repo: null },
  strip: { needsYou: 0, inFlight: 0, ready: 0, main: { state: 'unknown', repositories: [] }, loop: false },
  burndown: [],
  finished: days(range).map((day) => ({ day, count: 0 })),
  leadTime: { tasks: [], median: null, p85: null },
  stages: [],
  review: {
    tasks: 0,
    average: null,
    rounds: [
      { label: '1', tasks: 0 },
      { label: '2', tasks: 0 },
      { label: '3+', tasks: 0 },
    ],
  },
  rework: { finished: 0, reworked: 0, firstPass: 0, judged: 0 },
  filters: { specs: [], repos: [] },
})

const COUNTS = [0, 1, 0, 2, 3, 1, 0, 0, 4, 2, 1, 3, 0, 2, 5, 1, 0, 2, 3, 1, 0, 1, 2, 4, 3, 0, 1, 2, 1, 3]

function full(range: number, spec: string | null) {
  const finished = days(range).map((day, i) => ({ day, count: COUNTS[(COUNTS.length - range + i + 90) % COUNTS.length] }))
  const lead = [5400, 14400, 7200, 28800, 3600, 86400, 10800, 18000, 9000, 43200, 6300, 21600].map((seconds, i) => ({
    taskId: `meal-planner.${i + 1}`,
    spec: 'meal-planner',
    at: at(12 - i),
    seconds,
  }))
  const burndown = [
    {
      spec: 'meal-planner',
      points: [
        { at: at(range), open: 12, done: 2 },
        { at: at(Math.round(range * 0.7)), open: 10, done: 4 },
        { at: at(Math.round(range * 0.5)), open: 11, done: 5 },
        { at: at(Math.round(range * 0.3)), open: 7, done: 9 },
        { at: at(2), open: 4, done: 12 },
        { at: at(0), open: 4, done: 12 },
      ],
    },
    {
      spec: 'shopping-list',
      points: [
        { at: at(range), open: 6, done: 0 },
        { at: at(Math.round(range * 0.4)), open: 3, done: 3 },
        { at: at(0), open: 3, done: 3 },
      ],
    },
  ].filter((b) => !spec || b.spec === spec)
  return {
    ...EMPTY(range),
    range: { days: range, spec, repo: null },
    strip: { needsYou: 3, inFlight: 2, ready: 5, main: { state: 'passing', repositories: [{ repository: 'acme/recipe-box', state: 'passing' }] }, loop: true },
    burndown,
    finished,
    leadTime: { tasks: lead, median: 12600, p85: 43200 },
    stages: [
      { stage: 'queued', seconds: 5400, spans: 12, tasks: 12 },
      { stage: 'coding', seconds: 86400, spans: 14, tasks: 12 },
      { stage: 'checks', seconds: 14400, spans: 16, tasks: 12 },
      { stage: 'ci-wait', seconds: 36000, spans: 15, tasks: 12 },
      { stage: 'review', seconds: 21600, spans: 19, tasks: 12 },
      { stage: 'rework', seconds: 10800, spans: 4, tasks: 3 },
      { stage: 'merge', seconds: 1800, spans: 12, tasks: 12 },
    ],
    review: {
      tasks: 12,
      average: 1.6,
      rounds: [
        { label: '1', tasks: 7 },
        { label: '2', tasks: 3 },
        { label: '3+', tasks: 2 },
      ],
    },
    rework: { finished: 12, reworked: 3, firstPass: 9, judged: 12 },
    filters: { specs: ['meal-planner', 'shopping-list'], repos: ['acme/recipe-box'] },
  }
}

const RETROS = [
  {
    name: '2026-11-21-0930-meal-planner.md',
    at: '2026-11-21T09:30:00.000Z',
    scope: 'meal-planner',
    title: 'Retro: meal-planner, last 30 days',
    path: '.avoozl/local/retros/2026-11-21-0930-meal-planner.md',
  },
  {
    name: '2026-11-14-1615-workspace.md',
    at: '2026-11-14T16:15:00.000Z',
    scope: 'workspace',
    title: 'Retro: workspace, last 7 days',
    path: '.avoozl/local/retros/2026-11-14-1615-workspace.md',
  },
]
const TEXT =
  '# Retro: meal-planner, last 30 days\n\n## Biggest slowdown\n\nReview waited 6 h across 12 tasks in `acme/recipe-box`.\n\n## Changes\n\n1. Set `flow.batch.max` from 3 to 5.\n'

export function answerInsights(shown: boolean) {
  answer('insights.view', ({ input }) => {
    const { days: range = 30, spec = null } = (input ?? {}) as { days?: number; spec?: string | null }
    return shown ? full(range, spec) : EMPTY(range)
  })
  answer('retro.list', () => ({ items: shown ? RETROS : [] }))
  answer('retro.read', ({ input }) => ({ ...RETROS.find((r) => r.name === (input as { name: string }).name)!, text: TEXT }))
}
