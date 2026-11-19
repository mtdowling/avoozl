// Calls and pure helpers for the Flow tab, the drawer's Timing fold, the
// Dashboard's Line stopped banner and Settings > Flow (design §4.11, §8.4).
// The backend (src/app/flow.mjs) computes every number; this module only
// formats and selects. Keep it free of JSX and runtime imports so node can
// test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export const STAGES = ['queued', 'investigate', 'falsify', 'coding', 'tests', 'commands', 'checks', 'ci-wait', 'review', 'rework', 'merge', 'waiting'] as const
export type Stage = (typeof STAGES)[number]

// One color per stage, readable on light and dark cards. Waiting stages are
// muted; rework is the warm red of waste.
export const STAGE_COLORS: Record<Stage, string> = {
  queued: '#94a3b8',
  investigate: '#6366f1',
  falsify: '#f97316',
  coding: '#3b82f6',
  tests: '#10b981',
  commands: '#8b5cf6',
  checks: '#22c55e',
  'ci-wait': '#0ea5e9',
  review: '#ec4899',
  rework: '#ef4444',
  merge: '#14b8a6',
  waiting: '#a8a29e',
}

export const STAGE_LABELS: Record<Stage, string> = {
  queued: 'Queued',
  investigate: 'Investigate',
  falsify: 'Falsify',
  coding: 'Coding',
  tests: 'Tests',
  commands: 'Commands',
  checks: 'Checks',
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
  // The spec the task belongs to; older backends omit it.
  plan?: string | null
  phase?: string | null
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
  // Fix tasks over finished tasks (§4.11, R79). Older backends omit it.
  fixWork?: { fixes: number; finished: number; share: number | null }
}

export interface LineStop {
  id: string
  repositoryId: string
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
  // Stop all agents (R64.12): every running chat Avoozl opened, stopped.
  full?: boolean
  sessions?: { slot: string; taskId: string; role: string; attempt: number; stopped: boolean; error?: string; finished?: boolean }[]
}

// Structured evidence a prompt or skill proposal carries (R68.4).
export interface ChangeEvidence {
  runs: string[]
  value: string | number
  effect: string
}

export interface Proposal {
  id: string
  type: 'settings' | 'plan' | 'prompt' | 'skill' | 'rule'
  file?: 'workspace' | 'repository'
  repository?: string
  key?: string
  from?: unknown
  to?: unknown
  spec?: string
  change?: string
  // prompt and skill proposals (design §4.18)
  target?: string
  section?: string
  base?: string
  diff?: string
  revert?: boolean
  override?: { n: number; from: string; to: string }
  leaf?: string
  note?: SkillNote
  // a rule from repeated corrections (design §4.24)
  text?: string
  metric: string
  direction: 'up' | 'down'
  evidence: string | ChangeEvidence
  status: 'open' | 'approved' | 'rejected'
  removesCheck?: boolean
  revertOf?: string
  reason?: string | null
  pdca?: { before: number | null; after?: number | null; result?: 'helped' | 'no change' | 'worse'; window: number; mixed?: boolean; pendingReason?: string }
}

export interface SkillNote {
  plugin: string | null
  file: string
  diff: string
  summary: string
  at: string
  sent: false
}

export interface PromptDrift {
  section: string
  old: string
  new: string
  override: string
  rebased: string | null
  conflict: boolean
  hash: string | null
  diffs: { builtIn: string; override: string }
}

export interface PromptRow {
  target: string
  version: string
  shipped: string
  active: number
  versions: { n: number; kind: 'approve' | 'revert' | 'rebase'; section?: string; by: string; at: string }[]
  sections: { name: string; locked: string | null; override: boolean; sha256: string }[]
  drift: PromptDrift[]
}

export interface ProposalsModel {
  proposals: (Proposal & { retro: string })[]
  dropped: { retro: string; index: number | string; key: string | null; type?: string; reason: string }[]
  prompts: PromptRow[]
  notes: (SkillNote & { retro: string; proposal: string; target: string })[]
  available: boolean
}

export interface RetroChat {
  slot: string
  executor: string
  harness: string | null
  status: string | null
  // The Kiro Crew chat; null for a `process` session.
  link: string | null
  process?: { state: string; logTail: string | null; attach: string | null }
}

export interface Retro {
  id: string
  n: number
  state: 'running' | 'done' | 'failed'
  triggers: { kind: string; detail: string }[]
  startedAt: string
  finishedAt?: string
  error?: string
  // The model the retro ran on; retros from before it was recorded omit it.
  model?: string
  // Why it failed, by kind: it never started, was lost, never replied, or
  // timed out; and how long it waited.
  failure?: 'never-started' | 'lost' | 'no-reply' | 'timeout'
  waitedMs?: number
  // The chat the retro ran in; null when none was recorded (older retros).
  chat?: RetroChat | null
  bottleneck: { stage: string; repository: string | null; evidence: string } | null
  proposals: Proposal[]
  dropped: { index: number; key: string | null; reason: string }[]
}

export interface PlanningTiming {
  spec: string
  planId: string
  durationMs: number
  usage: { input: number; output: number; credits: number; turns: number }
  roles: { role: 'plan-review' | 'plan-answer'; model: string | null; durationMs: number; input: number; output: number; credits: number; turns: number }[]
}

export interface FlowViewModel {
  ci?: { repositories: RepositoryCi[] }
  planning?: PlanningTiming[]
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
  // Plans with tasks, and the picked plan's phases; older backends omit them.
  plans?: { id: string; title: string }[]
  phases?: { id: string; title: string }[]
  series: { day: SeriesPoint[]; week: SeriesPoint[] }
  // Corrections people made (§4.24); older backends omit them.
  corrections?: { lastWeek: number; total: number }
  usage: UsageView
}

export interface SeriesPoint {
  key: string
  tasks: number
  leadTimeMs: number | null
  flowEfficiency: number | null
  firstPassRate: number | null
  timeToFixMs: number | null
  // Fix work and corrections in the bucket (R79.2, R78.5).
  fixShare?: number | null
  fixes?: number
  corrections?: number
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
  if (!usage?.available) return "Not available: Kiro Crew has not reported usage for this workspace's chats yet."
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
  plan?: string
  phase?: string
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

// The page-wide signal that the line was stopped or resumed, so the top
// row's Stop the line button and every banner read again.
export const LINE_EVENT = 'avoozl:line-changed'
export const lineChanged = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LINE_EVENT))
}

export function flowClient(api: AppApi) {
  const run = <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    view: (workspaceId: string, filter: FlowFilter = {}) =>
      run<FlowViewModel>(workspaceId, 'flow.view', {
        ...(filter.repository ? { repository: filter.repository } : {}),
        ...(filter.epic ? { epic: filter.epic } : {}),
        ...(filter.plan ? { plan: filter.plan } : {}),
        ...(filter.plan && filter.phase ? { phase: filter.phase } : {}),
        ...(filter.window ? { window: Number(filter.window) } : {}),
        ...(filter.stage ? { stage: filter.stage } : {}),
      }),
    runAnyway: (workspaceId: string, stopId: string) => run(workspaceId, 'flow.runAnyway', { stopId, confirm: true }),
    stop: (workspaceId: string, input: PullInput) => run<{ stop: LineStop }>(workspaceId, 'flow.stop', { ...input }),
    resume: (workspaceId: string, stopId: string) => run<{ stop: LineStop }>(workspaceId, 'flow.resume', { stopId }),
    startRetro: (workspaceId: string) => run(workspaceId, 'flow.retro.start'),
    runRetroAgain: (workspaceId: string, id: string) => run(workspaceId, 'flow.retro.again', { id }),
    decide: (workspaceId: string, input: Record<string, unknown>) => run(workspaceId, 'flow.retro.decide', input),
    settings: (workspaceId: string) => run<FlowSettings>(workspaceId, 'flow.settings.get'),
    saveSettings: (workspaceId: string, input: { flow: FlowSection; repository?: string | null; expectedHash: string }) =>
      run<FlowSettings>(workspaceId, 'flow.settings.update', input),
    models: () => api.get<unknown>('/api/models').then(parseModels),
    saveInstructions: (workspaceId: string, instructions: string) => run<{ instructions: string }>(workspaceId, 'flow.instructions.update', { instructions }),
    // Proposals and prompt overrides (design §4.18).
    proposals: (workspaceId: string) => run<ProposalsModel>(workspaceId, 'flow.proposals'),
    revertPrompt: (workspaceId: string, target: string) => run(workspaceId, 'prompt.override.revert', { target }),
    rebasePrompt: (workspaceId: string, input: { target: string; section: string; hash: string }) => run(workspaceId, 'prompt.override.rebase', input),
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

export const percent = (value: number | null | undefined) => (value === null || value === undefined ? '–' : `${Math.round(value * 100)}%`)

// "33% (1 of 3)", or a dash before any task finished.
export const fixText = (fix: Metrics['fixWork']) => (fix && fix.share !== null && fix.finished ? `${percent(fix.share)} (${fix.fixes} of ${fix.finished})` : '–')

// The four metric cards (R48.2): value, the previous window's value, and
// what produces a value when there is none yet.
export function metricCards(view: FlowViewModel) {
  const m = view.metrics,
    p = view.previous
  return [
    {
      key: 'lead',
      title: 'Lead time',
      value: duration(m.leadTimeMs),
      was: p.tasks ? duration(p.leadTimeMs) : null,
      empty: m.leadTimeMs === null ? 'Finish a task to see lead time.' : null,
      tip: 'Median time from ready to integrated or merged.',
    },
    {
      key: 'efficiency',
      title: 'Flow efficiency',
      value: percent(m.flowEfficiency),
      was: p.tasks ? percent(p.flowEfficiency) : null,
      empty: m.flowEfficiency === null ? 'Finish a task to see how much of its time was active.' : null,
      tip: 'Coding, tests, commands, rework and merge over lead time. Queued, CI wait, review and waiting count as waiting.',
    },
    {
      key: 'first-pass',
      title: 'First-pass rate',
      value: percent(m.firstPassRate),
      was: p.tasks ? percent(p.firstPassRate) : null,
      empty: m.firstPassRate === null ? 'Finish a task to see how many pass the first time.' : null,
      tip: 'Tasks accepted on their first attempt with no rework.',
    },
    {
      key: 'fix',
      title: 'Time to fix',
      value: duration(m.timeToFixMs),
      was: p.tasks && p.timeToFixMs !== null ? duration(p.timeToFixMs) : null,
      empty: m.timeToFixMs === null ? 'No line stop yet.' : null,
      tip: 'From the line stopping to the check passing on the branch again.',
    },
    {
      key: 'fix-work',
      title: 'Fix work',
      value: fixText(m.fixWork),
      was: p.tasks ? fixText(p.fixWork) : null,
      empty: m.fixWork?.share == null ? 'Finish a task to see how much was bug fixes.' : null,
      tip: 'Finished tasks that were fixes: a bugfix spec, type fix, a stop-the-line fix, or a GitHub Bug.',
    },
    {
      key: 'corrections',
      title: 'Corrections',
      value: view.corrections ? `${view.corrections.lastWeek} this week` : '–',
      was: null,
      empty: view.corrections ? null : 'No corrections yet.',
      tip: 'How many times this week a person told an agent it got something wrong: a pull request got changes requested, or a task was sent back or reverted.',
    },
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

// "flow.retro.everyTasks 10 → 5" or the plan change in words.
export function proposalText(p: Proposal): string {
  if (p.type === 'plan') return `${p.change} (spec ${p.spec})`
  if (p.type === 'prompt') return `${p.revert ? 'Revert ' : ''}${p.target}${p.section ? ` § ${p.section}` : ''}`
  if (p.type === 'skill') return `${p.revert ? 'Revert ' : ''}skill ${p.target}`
  if (p.type === 'rule') return `rule: ${p.text ?? ''}`
  const where = p.file === 'repository' ? ` in ${p.repository}` : ''
  return `${p.key} ${JSON.stringify(p.from)} → ${JSON.stringify(p.to)}${where}`
}

export const directionText = (p: Proposal) => (p.type === 'rule' ? 'corrections' : `${p.metric} ${p.direction === 'down' ? '↓' : '↑'}`)

// A proposal's evidence in one line: plain text, or runs, value and effect.
export function evidenceText(p: Pick<Proposal, 'evidence'>): string {
  const e = p.evidence
  if (typeof e === 'string') return e
  if (!e) return ''
  return `${e.runs.join(', ')} · now ${e.value} · ${e.effect}`
}

// A unified diff as lines to color: added, removed, hunk header or context.
export function diffLines(diff: string | undefined): { kind: 'add' | 'del' | 'hunk' | 'same'; text: string }[] {
  if (!diff) return []
  return diff.split('\n').map((text) => ({
    kind: text.startsWith('@@') ? 'hunk' : text.startsWith('+') ? 'add' : text.startsWith('-') ? 'del' : 'same',
    text,
  }))
}

export function pdcaText(p: Proposal): string | null {
  if (p.status !== 'approved' || !p.pdca) return null
  if (!p.pdca.result && p.pdca.pendingReason) return `PDCA: ${p.pdca.pendingReason}`
  if (!p.pdca.result)
    return `PDCA: measuring over the next ${p.pdca.window} ${p.metric === 'CI minutes per pull request' || p.metric === 'Build minutes per pull request' ? 'closed pull requests' : 'tasks'}.`
  const verdict = p.pdca.result === 'helped' ? 'helped' : p.pdca.result === 'worse' ? 'worse' : 'did not help'
  const fmt = (v: number | null | undefined) =>
    v === null || v === undefined
      ? '–'
      : p.metric === 'CI minutes per pull request' || p.metric === 'Build minutes per pull request'
        ? `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} min`
        : /rate|efficiency/.test(p.metric)
          ? percent(v)
          : duration(v)
  return `PDCA: ${p.metric} ${fmt(p.pdca.before)} → ${fmt(p.pdca.after)}, ${verdict}.`
}

// What a pulled stop covers, in words.
export function scopeText(stop: Pick<LineStop, 'scope' | 'repositoryId' | 'planId' | 'taskId'>): string {
  if (stop.scope === 'repo') return `repository ${stop.repositoryId}`
  if (stop.scope === 'spec') return `spec ${stop.planId}`
  if (stop.scope === 'task') return `task ${stop.taskId} and its dependents`
  return 'everything in this workspace'
}

// Pull the Andon cord (R64): the dialog's choices and its checks, which
// match the backend's so a bad pull never leaves the page.
export type PullScope = 'all' | 'repo' | 'spec' | 'task'
export type PullKind = 'line' | 'agents'
export interface PullForm {
  kind: PullKind
  scope: PullScope
  repository: string
  spec: string
  taskId: string
  reason: string
}
export interface PullInput {
  scope: PullScope
  reason: string
  full?: boolean
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
// The dialog's two choices (R64.12).
export const PULL_KINDS: { value: PullKind; label: string; line: string }[] = [
  { value: 'line', label: 'Stop the line', line: 'No new work starts in what you pick. Chats already running keep going.' },
  { value: 'agents', label: 'Stop all agents', line: 'No new work starts anywhere, and every running chat Avoozl opened stops now.' },
]
// What the full stop's confirm says (R64.13).
export const FULL_STOP_WARNING =
  'Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.'
export const MAX_REASON = 200
export const emptyPull = (): PullForm => ({ kind: 'line', scope: 'all', repository: '', spec: '', taskId: '', reason: '' })

export function toPull(form: PullForm): { input?: PullInput; error?: string } {
  const reason = form.reason.trim()
  if (!reason) return { error: 'Reason is required.' }
  if (/[\r\n]/.test(reason)) return { error: 'Keep the reason to one line.' }
  if (reason.length > MAX_REASON) return { error: `Keep the reason to ${MAX_REASON} characters or fewer.` }
  if (form.kind === 'agents') return { input: { scope: 'all', full: true, reason } }
  if (form.scope === 'repo') return form.repository ? { input: { scope: 'repo', repository: form.repository, reason } } : { error: 'Pick a repository.' }
  if (form.scope === 'spec') return form.spec ? { input: { scope: 'spec', spec: form.spec, reason } } : { error: 'Pick a spec.' }
  if (form.scope === 'task') return form.taskId ? { input: { scope: 'task', taskId: form.taskId, reason } } : { error: 'Pick a task.' }
  return { input: { scope: 'all', reason } }
}

// The banner's sentence (§8.4).
// One row of Flow's Line stops list (R64.11): every stop in the window,
// pulled and automatic, newest first, with its time to fix once it closed.
export interface StopRow {
  id: string
  kind: 'Pulled' | 'Automatic' | 'All agents'
  what: string
  who: string | null
  openedAt: string
  fix: string
}
export function stopRows(stops: LineStop[]): StopRow[] {
  return [...stops]
    .sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0))
    .map((stop) => ({
      id: stop.id,
      kind: stop.manual ? (stop.full ? 'All agents' : 'Pulled') : 'Automatic',
      what: stop.manual
        ? `${stop.reason ?? ''} (${scopeText(stop)})`
        : stop.check
          ? `\`${stop.check}\` failed on ${stop.branch ?? stop.repositoryId}`
          : `a worker named ${stop.culprit ?? 'a task'} as the cause`,
      who: stop.manual ? (stop.by?.name ?? null) : null,
      openedAt: stop.openedAt,
      fix: stop.closedAt ? duration(stop.timeToFixMs ?? Date.parse(stop.closedAt) - Date.parse(stop.openedAt)) : 'open',
    }))
}

export function bannerText(stop: LineStop): string {
  if (stop.manual && stop.full) {
    const sessions = stop.sessions ?? [],
      stopped = sessions.filter((s) => s.stopped && !s.finished).length,
      refused = sessions.filter((s) => !s.stopped).length
    const chats = ` ${stopped} chat${stopped === 1 ? '' : 's'} stopped${refused ? `; ${refused} could not be stopped` : ''}.`
    return `All agents stopped by ${stop.by?.name ?? 'someone'}: ${stop.reason ?? ''}.${chats} ${stop.paused ?? 0} task${stop.paused === 1 ? '' : 's'} paused.`
  }
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
  return Boolean(filter.repository || filter.epic || filter.plan || filter.phase || filter.window || filter.stage)
}

// The Time per task list's order, picked in the Flow nav's Sort rows. The
// backend sends it newest first.
export type FlowSort = 'recent' | 'lead' | 'task'
export interface FlowOrder {
  sort: FlowSort
  dir: 'asc' | 'desc'
}
export const FLOW_ORDER: FlowOrder = { sort: 'recent', dir: 'desc' }
// A field's first direction when it is picked: newest and longest first, tasks A to Z.
export const FLOW_SORT_FIRST: Record<FlowSort, 'asc' | 'desc'> = { recent: 'desc', lead: 'desc', task: 'asc' }

export function sortTasks(tasks: TaskTiming[], { sort, dir }: FlowOrder): TaskTiming[] {
  const sign = dir === 'asc' ? 1 : -1
  const key = (t: TaskTiming) => (sort === 'lead' ? t.leadMs : (t.startedAt ?? ''))
  return [...tasks].sort((a, b) => {
    if (sort === 'task') return sign * a.taskId.localeCompare(b.taskId, undefined, { numeric: true })
    const [x, y] = [key(a), key(b)]
    return x === y ? 0 : sign * (x < y ? -1 : 1)
  })
}

export interface FlowChoice {
  value: string
  label: string
  count: number
}
// The nav's chips and their counts, from an unfiltered read, so picking one
// value does not hide the others. Each count is the tasks that carry it.
// Phases come from the filtered read: the backend lists them once a spec is picked.
export function flowChoices(base: Pick<FlowViewModel, 'tasks' | 'repositories' | 'epics' | 'stages' | 'plans'>, phaseList: FlowViewModel['phases'] = []) {
  const count = (pick: (t: TaskTiming) => string | null | undefined) => {
    const counts = new Map<string, number>()
    for (const t of base.tasks) {
      const value = pick(t)
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return counts
  }
  const repos = count((t) => t.repository),
    epics = count((t) => t.epic),
    plans = count((t) => t.plan),
    phases = count((t) => t.phase)
  const make = (list: { value: string; label: string }[], counts: Map<string, number>): FlowChoice[] => list.map((x) => ({ ...x, count: counts.get(x.value) ?? 0 }))
  return {
    repositories: make(
      base.repositories.map((r) => ({ value: r, label: r })),
      repos,
    ),
    epics: make(
      base.epics.map((e) => ({ value: e.id, label: e.title })),
      epics,
    ),
    plans: make(
      (base.plans ?? []).map((p) => ({ value: p.id, label: p.title })),
      plans,
    ),
    phases: make(
      (phaseList ?? []).map((p) => ({ value: p.id, label: p.title })),
      phases,
    ),
    stages: base.stages.map((stage): FlowChoice => ({ value: stage, label: STAGE_LABELS[stage], count: base.tasks.filter((t) => (t.stages[stage] || 0) > 0).length })),
  }
}

// ------------------------------------------------------------ settings

export interface FlowSection {
  stopTheLine?: { scope?: 'dependents' | 'repo' | 'all' }
  localChecksFirst?: boolean
  retro?: { everyTasks?: number; slowFactor?: number; model?: string }
  ci?: { windowDays?: number; docsOnlyMinutes?: number; waitShare?: number; minPullRequests?: number; classes?: Record<string, string[]> }
}

export interface RepositoryCi {
  repository: string
  windowDays: number
  byClass: Record<string, { task: { minutes: number; pullRequests: number }; other: { minutes: number; pullRequests: number } }>
  waitShare: number | null
  waitLimit: number
  closedPullRequests: number
  repeats: { workflow: string; commits: number; extraRuns: number; extraMinutes: number }[]
}

export interface FlowSettings {
  filename: string
  exists: boolean
  hash: string
  flow: FlowSection
  repositories: Record<string, FlowSection>
  instructions: string | null
  retroPrompt: string | null
  ciClassGlobs?: Record<string, string[]>
  ciEffective?: { windowDays: number; docsOnlyMinutes: number; waitShare: number; minPullRequests: number }
}

export const FLOW_DEFAULTS = {
  scope: 'dependents',
  localChecksFirst: true,
  everyTasks: 10,
  slowFactor: 3,
  model: 'auto',
  windowDays: 7,
  docsOnlyMinutes: 60,
  waitShare: 0.4,
  minPullRequests: 5,
} as const

export interface FlowForm {
  scope: '' | 'dependents' | 'repo' | 'all'
  localChecksFirst: '' | 'on' | 'off'
  everyTasks: string
  slowFactor: string
  model: string
  windowDays: string
  docsOnlyMinutes: string
  waitShare: string
  minPullRequests: string
  ciClasses?: Record<string, string[]>
}

export function toFlowForm(section: FlowSection = {}): FlowForm {
  return {
    scope: section.stopTheLine?.scope ?? '',
    localChecksFirst: section.localChecksFirst === undefined ? '' : section.localChecksFirst ? 'on' : 'off',
    everyTasks: section.retro?.everyTasks === undefined ? '' : String(section.retro.everyTasks),
    slowFactor: section.retro?.slowFactor === undefined ? '' : String(section.retro.slowFactor),
    model: section.retro?.model ?? '',
    windowDays: section.ci?.windowDays === undefined ? '' : String(section.ci.windowDays),
    docsOnlyMinutes: section.ci?.docsOnlyMinutes === undefined ? '' : String(section.ci.docsOnlyMinutes),
    waitShare: section.ci?.waitShare === undefined ? '' : String(section.ci.waitShare),
    minPullRequests: section.ci?.minPullRequests === undefined ? '' : String(section.ci.minPullRequests),
    ciClasses: section.ci?.classes,
  }
}

// The form back to a `flow` object: blank means the default, so the key is
// left out. Returns {flow} or {error} naming the field, before any save.
export function toFlowSection(form: FlowForm): { flow?: FlowSection; error?: string } {
  const flow: FlowSection = {}
  if (form.scope) flow.stopTheLine = { scope: form.scope }
  if (form.localChecksFirst) flow.localChecksFirst = form.localChecksFirst === 'on'
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
  const ci: NonNullable<FlowSection['ci']> = {}
  for (const [key, label, min, max, whole] of [
    ['windowDays', 'CI window days', 1, 90, true],
    ['docsOnlyMinutes', 'Docs-only CI minutes', 1, 100000, true],
    ['waitShare', 'CI wait share', 0.05, 1, false],
    ['minPullRequests', 'Closed pull requests', 1, 1000, true],
  ] as const) {
    if (!form[key].trim()) continue
    const n = Number(form[key])
    if (!Number.isFinite(n) || (whole && !Number.isInteger(n)) || n < min || n > max) return { error: `${label} must be ${whole ? 'a whole number' : 'a number'} ${min}–${max}.` }
    ci[key] = n
  }
  if (form.ciClasses) ci.classes = form.ciClasses
  if (Object.keys(ci).length) flow.ci = ci
  return { flow }
}
