// Calls and pure helpers for the Flow tab, the drawer's Timing fold, the
// Dashboard's Line stopped banner and Settings > Flow (design §4.11, §8.4).
// The backend (src/app/flow.mjs) computes every number; this module only
// formats and selects. Keep it free of JSX and runtime imports so node can
// test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export const STAGES = ['queued', 'coding', 'tests', 'commands', 'ci-wait', 'review', 'rework', 'merge', 'waiting'] as const
export type Stage = (typeof STAGES)[number]

// One color per stage, readable on light and dark cards. Waiting stages are
// muted; rework is the warm red of waste.
export const STAGE_COLORS: Record<Stage, string> = {
  queued: '#94a3b8',
  coding: '#3b82f6',
  tests: '#10b981',
  commands: '#8b5cf6',
  'ci-wait': '#0ea5e9',
  review: '#ec4899',
  rework: '#ef4444',
  merge: '#14b8a6',
  waiting: '#a8a29e',
}

export const STAGE_LABELS: Record<Stage, string> = {
  queued: 'Queued',
  coding: 'Coding',
  tests: 'Tests',
  commands: 'Commands',
  'ci-wait': 'CI wait',
  review: 'Review',
  rework: 'Rework',
  merge: 'Merge',
  waiting: 'Waiting',
}

export interface TaskTiming {
  taskId: string
  title: string
  repository: string | null
  epic: string | null
  startedAt: string | null
  finishedAt: string | null
  leadMs: number
  activeMs: number
  stages: Record<Stage, number>
  coarse: boolean
  sources: string[]
  batch: string | null
  firstPass: boolean
}

export interface Metrics {
  tasks: number
  leadTimeMs: number | null
  flowEfficiency: number | null
  firstPassRate: number | null
  changeFailureRate: number | null
  integrationsPerDay: number | null
  timeToFixMs: number | null
}

export interface LineStop {
  id: string
  projectId: string
  check: string | null
  branch: string
  culprit: string | null
  commit: string | null
  range: { from: string | null; to: string }
  openedAt: string
  closedAt: string | null
  timeToFixMs?: number
  fixTaskId: string | null
  runAnyway: { by: string; at: string } | null
  paused?: number
  fixState?: string | null
  needsYou?: boolean
  // A stop pulled by hand (R64): who, why, and what it covers.
  manual?: boolean
  by?: { kind: 'person' | 'agent'; name: string }
  reason?: string
  scope?: string
  planId?: string | null
  taskId?: string | null
  resumedBy?: { by: string; at: string }
}

export interface Proposal {
  id: string
  type: 'settings' | 'plan'
  file?: 'workspace' | 'repository'
  repository?: string
  key?: string
  from?: unknown
  to?: unknown
  spec?: string
  change?: string
  metric: string
  direction: 'up' | 'down'
  evidence: string
  status: 'open' | 'approved' | 'rejected'
  removesCheck?: boolean
  revertOf?: string
  reason?: string | null
  pdca?: { before: number | null; after?: number | null; result?: 'helped' | 'no change' | 'worse'; window: number }
}

export interface Retro {
  id: string
  n: number
  state: 'running' | 'done' | 'failed'
  triggers: { kind: string; detail: string }[]
  startedAt: string
  finishedAt?: string
  error?: string
  bottleneck: { stage: string; repository: string | null; evidence: string } | null
  proposals: Proposal[]
  dropped: { index: number; key: string | null; reason: string }[]
}

export interface FlowViewModel {
  window: { size: number; since: string | null }
  metrics: Metrics
  previous: Metrics
  bottleneck: { stage: Stage; share: number; repository: string | null; medianMs: number | null; tasks: number; evidence: string } | null
  tasks: TaskTiming[]
  stops: LineStop[]
  line: LineStop[]
  flaky: { id: string; check: string; commit: string; at: string }[]
  ciOnly: { id: string; taskId: string; commit: string; checks: string[]; at: string }[]
  retros: Retro[]
  batches: { id: string; tasks: string[]; state: string }[]
  stages: Stage[]
  repositories: string[]
  epics: { id: string; title: string }[]
  series: { day: SeriesPoint[]; week: SeriesPoint[] }
  usage: UsageView
  // Task IDs over budget, past 80%, stopped at the cap, or stopped by a
  // person (§4.17). Older backends send none.
  budget?: { over: string[]; warning: string[]; stopped: string[]; paused: string[] }
}

// The Flow tab's budget mark for one task's bar, or null.
export function budgetMark(budget: FlowViewModel['budget'], taskId: string): 'over budget' | 'stopped at budget' | '80% of budget' | null {
  if (!budget) return null
  if (budget.stopped.includes(taskId) || budget.paused.includes(taskId)) return 'stopped at budget'
  if (budget.over.includes(taskId)) return 'over budget'
  if (budget.warning.includes(taskId)) return '80% of budget'
  return null
}

export interface SeriesPoint {
  key: string
  tasks: number
  leadTimeMs: number | null
  flowEfficiency: number | null
  firstPassRate: number | null
  timeToFixMs: number | null
  stages: Record<Stage, number>
}

export interface UsageRow {
  key: string
  input: number
  output: number
  credits: number
  turns: number
}

export interface UsageView {
  available: boolean
  total: Omit<UsageRow, 'key'>
  byTask: UsageRow[]
  byPlan: UsageRow[]
  byStage: UsageRow[]
  byModel: UsageRow[]
  byDay: UsageRow[]
  byWeek: UsageRow[]
}

// "12.3k", "1.2M"; credits keep two decimals.
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '–'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(Math.round(n))
}
export const credits = (n: number) => (n ? n.toFixed(2) : '0')

// The usage card's one message when it has nothing to show, or null.
export function usageMessage(usage: FlowViewModel['usage']): string | null {
  if (!usage?.available) return 'Not available: Kiro Crew has not reported usage for this workspace\'s chats yet.'
  if (!usage.total.turns) return 'No turns recorded for these tasks yet.'
  return null
}

// One usage row in words: tokens, credits, or both.
export function usageText(row: Omit<UsageRow, 'key'>): string {
  const parts = []
  if (row.input || row.output) parts.push(`${compact(row.input)} in · ${compact(row.output)} out`)
  if (row.credits) parts.push(`${credits(row.credits)} credits`)
  return parts.join(' · ') || 'none'
}

// Kiro Crew's /api/models answer, in any of the shapes its backends give:
// a list, or {models: [...]}, of names or {model_name|id|model_id, display_name|name}.
export function parseModels(body: unknown): { value: string; label: string }[] {
  const list = Array.isArray(body) ? body : Array.isArray((body as { models?: unknown })?.models) ? (body as { models: unknown[] }).models : []
  const out: { value: string; label: string }[] = []
  for (const entry of list) {
    const row = entry as Record<string, unknown>
    const value = typeof entry === 'string' ? entry : String(row?.model_name ?? row?.model_id ?? row?.id ?? '')
    if (!value || value === 'auto' || out.some((o) => o.value === value)) continue
    const label = typeof entry === 'string' ? entry : String(row?.display_name ?? row?.name ?? value)
    out.push({ value, label })
  }
  return out
}

// The model choices for a picker: auto first, then Kiro Crew's, and a saved
// value Kiro Crew no longer offers, kept and marked.
export function modelOptions(models: { value: string; label: string }[], current: string) {
  const options = [{ value: 'auto', label: 'auto (Kiro Crew picks)' }, ...models]
  if (current && !options.some((o) => o.value === current)) options.push({ value: current, label: `${current} (not offered now)` })
  return options
}

export interface TimingSpan {
  id: string
  stage: Stage
  startedAt: string
  endedAt: string | null
  lengthMs: number
  source: 'tool-calls' | 'markers' | 'events'
  detail: string | null
  attempt: number | null
  role: string | null
  batchId: string | null
}

export interface TaskTimingDetail extends TaskTiming {
  spans: TimingSpan[]
}

export interface FlowFilter {
  repository?: string
  epic?: string
  window?: string
  stage?: string
}
const FLOW_KEY = 'avoozl.flow.filter.'
export const FLOW_FILTER_STORE = {
  event: 'avoozl:flow-filter',
  empty: {} as FlowFilter,
  read(storage: Storage | null, workspaceId: string): FlowFilter {
    try {
      const value = JSON.parse(storage?.getItem(FLOW_KEY + workspaceId) ?? '{}')
      return value && typeof value === 'object' && !Array.isArray(value) ? (value as FlowFilter) : {}
    } catch {
      return {}
    }
  },
  write(storage: Storage | null, workspaceId: string, value: FlowFilter) {
    try {
      storage?.setItem(FLOW_KEY + workspaceId, JSON.stringify(value))
    } catch {}
  },
}
export const WINDOW_OPTIONS = [
  { value: '10', label: 'Last 10 tasks' },
  { value: '20', label: 'Last 20 tasks' },
  { value: '50', label: 'Last 50 tasks' },
]

export function flowClient(api: AppApi) {
  const run = <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    view: (workspaceId: string, filter: FlowFilter = {}) =>
      run<FlowViewModel>(workspaceId, 'flow.view', {
        ...(filter.repository ? { repository: filter.repository } : {}),
        ...(filter.epic ? { epic: filter.epic } : {}),
        ...(filter.window ? { window: Number(filter.window) } : {}),
        ...(filter.stage ? { stage: filter.stage } : {}),
      }),
    runAnyway: (workspaceId: string, stopId: string) => run(workspaceId, 'flow.runAnyway', { stopId, confirm: true }),
    stop: (workspaceId: string, input: PullInput) => run<{ stop: LineStop }>(workspaceId, 'flow.stop', { ...input }),
    resume: (workspaceId: string, stopId: string) => run<{ stop: LineStop }>(workspaceId, 'flow.resume', { stopId }),
    startRetro: (workspaceId: string) => run(workspaceId, 'flow.retro.start'),
    decide: (workspaceId: string, input: Record<string, unknown>) => run(workspaceId, 'flow.retro.decide', input),
    settings: (workspaceId: string) => run<FlowSettings>(workspaceId, 'flow.settings.get'),
    saveSettings: (workspaceId: string, input: { flow: FlowSection; repository?: string | null; expectedHash: string }) =>
      run<FlowSettings>(workspaceId, 'flow.settings.update', input),
    models: () => api.get<unknown>('/api/models').then(parseModels),
    saveInstructions: (workspaceId: string, instructions: string) =>
      run<{ instructions: string }>(workspaceId, 'flow.instructions.update', { instructions }),
  }
}

// "3 h 10 m", "42 m", "50 s"; null is a dash.
export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '–'
  const minutes = Math.round(ms / 60_000)
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`
  if (minutes < 60) return `${minutes} m`
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60
  if (hours < 48) return rest ? `${hours} h ${rest} m` : `${hours} h`
  return `${Math.round(hours / 24)} d`
}

export const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? '–' : `${Math.round(value * 100)}%`

// The four metric cards (R48.2): value, the previous window's value, and
// what produces a value when there is none yet.
export function metricCards(view: FlowViewModel) {
  const m = view.metrics,
    p = view.previous
  return [
    { key: 'lead', title: 'Lead time', value: duration(m.leadTimeMs), was: p.tasks ? duration(p.leadTimeMs) : null, empty: m.leadTimeMs === null ? 'Finish a task to see lead time.' : null, tip: 'Median time from ready to integrated or merged.' },
    { key: 'efficiency', title: 'Flow efficiency', value: percent(m.flowEfficiency), was: p.tasks ? percent(p.flowEfficiency) : null, empty: m.flowEfficiency === null ? 'Finish a task to see how much of its time was active.' : null, tip: 'Coding, tests, commands, rework and merge over lead time. Queued, CI wait, review and waiting count as waiting.' },
    { key: 'first-pass', title: 'First-pass rate', value: percent(m.firstPassRate), was: p.tasks ? percent(p.firstPassRate) : null, empty: m.firstPassRate === null ? 'Finish a task to see how many pass the first time.' : null, tip: 'Tasks accepted on their first attempt with no rework.' },
    { key: 'fix', title: 'Time to fix', value: duration(m.timeToFixMs), was: p.tasks && p.timeToFixMs !== null ? duration(p.timeToFixMs) : null, empty: m.timeToFixMs === null ? 'No line stop yet.' : null, tip: 'From the line stopping to the check passing on the branch again.' },
  ]
}

// One stacked bar's parts, each a share of the whole, in stage order.
export function barSegments(stages: Record<string, number>) {
  const total = STAGES.reduce((sum, s) => sum + (stages[s] || 0), 0)
  if (!total) return []
  return STAGES.filter((s) => stages[s] > 0).map((stage) => ({
    stage,
    ms: stages[stage],
    share: stages[stage] / total,
    color: STAGE_COLORS[stage],
    label: STAGE_LABELS[stage],
  }))
}

export const SOURCE_TEXT = {
  'tool-calls': 'from tool calls',
  markers: 'from phase markers (coarse)',
  events: 'from events',
} as const

// "flow.batch.max 3 → 5" or the plan change in words.
export function proposalText(p: Proposal): string {
  if (p.type === 'plan') return `${p.change} (spec ${p.spec})`
  const where = p.file === 'repository' ? ` in ${p.repository}` : ''
  return `${p.key} ${JSON.stringify(p.from)} → ${JSON.stringify(p.to)}${where}`
}

export const directionText = (p: Proposal) => `${p.metric} ${p.direction === 'down' ? '↓' : '↑'}`

export function pdcaText(p: Proposal): string | null {
  if (p.status !== 'approved' || !p.pdca) return null
  if (!p.pdca.result) return `PDCA: measuring over the next ${p.pdca.window} tasks.`
  const verdict = p.pdca.result === 'helped' ? 'helped' : p.pdca.result === 'worse' ? 'worse' : 'did not help'
  const fmt = (v: number | null | undefined) =>
    v === null || v === undefined ? '–' : /rate|efficiency/.test(p.metric) ? percent(v) : duration(v)
  return `PDCA: ${p.metric} ${fmt(p.pdca.before)} → ${fmt(p.pdca.after)}, ${verdict}.`
}

// What a pulled stop covers, in words.
export function scopeText(stop: Pick<LineStop, 'scope' | 'projectId' | 'planId' | 'taskId'>): string {
  if (stop.scope === 'repo') return `repository ${stop.projectId}`
  if (stop.scope === 'spec') return `spec ${stop.planId}`
  if (stop.scope === 'task') return `task ${stop.taskId} and its dependents`
  return 'everything in this workspace'
}

// Pull the Andon cord (R64): the dialog's choices and its checks, which
// match the backend's so a bad pull never leaves the page.
export type PullScope = 'all' | 'repo' | 'spec' | 'task'
export interface PullForm {
  scope: PullScope
  repository: string
  spec: string
  taskId: string
  reason: string
}
export interface PullInput {
  scope: PullScope
  reason: string
  repository?: string
  spec?: string
  taskId?: string
}
export const PULL_SCOPES: { value: PullScope; label: string; line: string }[] = [
  { value: 'all', label: 'Everything', line: 'No new work starts anywhere in this workspace.' },
  { value: 'repo', label: 'One repository', line: 'No new work starts in the repository you pick.' },
  { value: 'spec', label: 'One spec', line: 'No new work starts for the tasks of the spec you pick.' },
  { value: 'task', label: 'One task and its dependents', line: 'The task and everything that waits on it hold.' },
]
export const MAX_REASON = 200
export const emptyPull = (): PullForm => ({ scope: 'all', repository: '', spec: '', taskId: '', reason: '' })

export function toPull(form: PullForm): { input?: PullInput; error?: string } {
  const reason = form.reason.trim()
  if (!reason) return { error: 'Reason is required.' }
  if (/[\r\n]/.test(reason)) return { error: 'Keep the reason to one line.' }
  if (reason.length > MAX_REASON) return { error: `Keep the reason to ${MAX_REASON} characters or fewer.` }
  if (form.scope === 'repo') return form.repository ? { input: { scope: 'repo', repository: form.repository, reason } } : { error: 'Pick a repository.' }
  if (form.scope === 'spec') return form.spec ? { input: { scope: 'spec', spec: form.spec, reason } } : { error: 'Pick a spec.' }
  if (form.scope === 'task') return form.taskId ? { input: { scope: 'task', taskId: form.taskId, reason } } : { error: 'Pick a task.' }
  return { input: { scope: 'all', reason } }
}

// The banner's sentence (§8.4).
export function bannerText(stop: LineStop): string {
  if (stop.manual) {
    const paused = ` ${stop.paused ?? 0} task${stop.paused === 1 ? '' : 's'} paused.`
    return `Line stopped by ${stop.by?.name ?? 'someone'}: ${stop.reason ?? ''}. Scope: ${scopeText(stop)}.${paused}`
  }
  const what = stop.check ? `\`${stop.check}\` fails on ${stop.branch}` : `a worker named ${stop.culprit} as the cause`
  const since = stop.commit ? ` since ${stop.commit.slice(0, 7)}` : ''
  const culprit = stop.culprit ? ` (task ${stop.culprit})` : ' (culprit unknown)'
  const fix = stop.fixTaskId ? ` Fix: ${stop.fixTaskId}, ${stop.fixState ?? 'ready'}.` : ''
  const paused = stop.runAnyway ? ' Dispatch resumed by Run anyway.' : ` ${stop.paused ?? 0} task${stop.paused === 1 ? '' : 's'} paused.`
  return `Line stopped: ${what}${since}${culprit}.${fix}${paused}`
}

export function filterActive(filter: FlowFilter) {
  return Boolean(filter.repository || filter.epic || filter.window || filter.stage)
}

// ------------------------------------------------------------ settings

export interface FlowSection {
  stopTheLine?: { scope?: 'dependents' | 'repo' | 'all' }
  localChecksFirst?: boolean
  batch?: { max?: number; by?: 'epic' | 'files' }
  retro?: { everyTasks?: number; slowFactor?: number; model?: string }
}

export interface FlowSettings {
  filename: string
  exists: boolean
  hash: string
  flow: FlowSection
  repositories: Record<string, FlowSection>
  instructions: string | null
  retroPrompt: string | null
}

export const FLOW_DEFAULTS = {
  scope: 'dependents',
  localChecksFirst: true,
  max: 3,
  by: 'epic',
  everyTasks: 10,
  slowFactor: 2,
  model: 'auto',
} as const

export interface FlowForm {
  scope: '' | 'dependents' | 'repo' | 'all'
  localChecksFirst: '' | 'on' | 'off'
  max: string
  by: '' | 'epic' | 'files'
  everyTasks: string
  slowFactor: string
  model: string
}

export function toFlowForm(section: FlowSection = {}): FlowForm {
  return {
    scope: section.stopTheLine?.scope ?? '',
    localChecksFirst: section.localChecksFirst === undefined ? '' : section.localChecksFirst ? 'on' : 'off',
    max: section.batch?.max === undefined ? '' : String(section.batch.max),
    by: section.batch?.by ?? '',
    everyTasks: section.retro?.everyTasks === undefined ? '' : String(section.retro.everyTasks),
    slowFactor: section.retro?.slowFactor === undefined ? '' : String(section.retro.slowFactor),
    model: section.retro?.model ?? '',
  }
}

// The form back to a `flow` object: blank means the default, so the key is
// left out. Returns {flow} or {error} naming the field, before any save.
export function toFlowSection(form: FlowForm): { flow?: FlowSection; error?: string } {
  const flow: FlowSection = {}
  if (form.scope) flow.stopTheLine = { scope: form.scope }
  if (form.localChecksFirst) flow.localChecksFirst = form.localChecksFirst === 'on'
  const batch: FlowSection['batch'] = {}
  if (form.max.trim()) {
    const n = Number(form.max)
    if (!Number.isInteger(n) || n < 1 || n > 10) return { error: 'Most tasks per run must be a whole number 1–10.' }
    batch.max = n
  }
  if (form.by) batch.by = form.by
  if (Object.keys(batch).length) flow.batch = batch
  const retro: FlowSection['retro'] = {}
  if (form.everyTasks.trim()) {
    const n = Number(form.everyTasks)
    if (!Number.isInteger(n) || n < 1 || n > 1000) return { error: 'After this many tasks must be a whole number 1–1000.' }
    retro.everyTasks = n
  }
  if (form.slowFactor.trim()) {
    const n = Number(form.slowFactor)
    if (!Number.isFinite(n) || n < 1.1 || n > 20) return { error: 'Slow when over must be a number 1.1–20.' }
    retro.slowFactor = n
  }
  if (form.model.trim()) {
    if (!/^(?:auto|[A-Za-z0-9][A-Za-z0-9._:/-]{0,127})$/.test(form.model.trim())) return { error: 'Model must be a model name or auto.' }
    retro.model = form.model.trim()
  }
  if (Object.keys(retro).length) flow.retro = retro
  return { flow }
}
