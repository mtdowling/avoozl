// Calls and pure helpers for provider health and the Switch model dialog
// (design §4.20, R72). The backend (src/app/provider-health.mjs) judges
// health and applies switches; this module reads, formats and builds the
// inputs. Free of JSX so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { parseModels } from './flow-api.ts'

export type Level = 'ok' | 'low' | 'out'

export interface Mark {
  id: string
  scope: 'provider' | 'model' | 'key'
  name: string
  level: Level
  source: 'usage' | 'error' | 'person'
  kind: string
  since: string
  percent?: number
  until?: string
  to?: string
  by?: string
}

export interface ProviderSettings {
  lowPercent?: number
  cooldownMinutes?: number
  windowHours?: number
  limits?: Record<string, { credits?: number; tokens?: number }>
  groups?: Record<string, string[]>
  fallback?: string[]
}

export interface LiveChat {
  slot: string
  taskId: string
  role: string
  model: string | null
  provider: string | null
  level: Level
}

export interface SwitchRecord {
  id: string
  slot: string
  taskId: string
  from: string
  to: string | null
  by: string
  state: 'pending' | 'done'
  result?: 'switched' | 'deferred' | 'refused' | 'skipped' | 'no target'
  at: string
}

export interface ProvidersView {
  settings: ProviderSettings
  hash: string | null
  defaults: {
    lowPercent: number
    cooldownMinutes: number
    windowHours: number
  }
  marks: Mark[]
  switches: SwitchRecord[]
  chats: LiveChat[]
}

export type From = { provider: string } | { model: string } | { tasks: string[] }

export interface SwitchPreview {
  chats: { slot: string; taskId: string; role: string; model: string | null }[]
  skipped: {
    slot: string
    taskId: string
    role: string
    model: string | null
    why: string
  }[]
  previewHash: string
}

// The dry run behind Switch model's step 2 (provider.switch.dryRun).
export interface DryRunChat {
  slot: string
  taskId: string
  title: string
  spec: string | null
  role: string
  model: string | null
  to: string
  where: string
}
export interface DryRunSkip {
  slot: string | null
  taskId: string
  title: string
  spec: string | null
  role: string | null
  model: string | null
  where: string | null
  why: string
}
export interface SwitchDryRun {
  to: string
  alsoNewTasks: boolean
  chats: DryRunChat[]
  skipped: DryRunSkip[]
  marks: { scope: 'provider' | 'model'; name: string; to: string }[]
  // Null when the ready tasks could not be read.
  queued: { taskId: string; title: string; spec: string | null; model: string }[] | null
  counts: { switch: number; cannot: number; queued: number | null }
  previewHash: string
}

export function providersClient(api: AppApi) {
  const run = <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    view: (workspaceId: string) => run<ProvidersView>(workspaceId, 'providers.view'),
    preview: (workspaceId: string, input: { from: From; to: string }) => run<SwitchPreview>(workspaceId, 'provider.switch.preview', input),
    dryRun: (workspaceId: string, input: { from: From; to: string; alsoNewTasks: boolean }) =>
      run<SwitchDryRun>(workspaceId, 'provider.switch.dryRun', input),
    switch: (
      workspaceId: string,
      input: {
        from: From
        to: string
        alsoNewTasks: boolean
        previewHash: string
      },
    ) => run<{ queued: number; marked: string[] }>(workspaceId, 'provider.switch', input),
    clear: (workspaceId: string, id: string) => run(workspaceId, 'provider.health.clear', { id }),
    save: (workspaceId: string, input: { providers: ProviderSettings; expectedHash: string | null }) =>
      run<{ hash: string }>(workspaceId, 'providers.settings.update', input),
    models: () => api.get<unknown>('/api/models').then(parseModels),
  }
}

// The dialog's From choice as the operation's input, or null until it is
// filled in.
export function fromInput(kind: 'provider' | 'model' | 'tasks', value: string, tasks: string[]): From | null {
  if (kind === 'tasks') return tasks.length ? { tasks: [...tasks] } : null
  const name = value.trim()
  if (!name) return null
  return kind === 'provider' ? { provider: name } : { model: name }
}

// From's dropdowns: the providers and models the running chats use, plus
// the ones the health list marks (a limit key may be either, so it is left
// out), and the running tasks.
export function fromOptions(chats: LiveChat[], marks: Mark[] = []) {
  const named = (scope: Mark['scope']) => marks.filter((m) => m.scope === scope).map((m) => m.name)
  const providers = [...new Set([...chats.map((c) => c.provider), ...named('provider')].filter((p): p is string => Boolean(p)))].sort()
  const models = [...new Set([...chats.map((c) => c.model), ...named('model')].filter((m): m is string => Boolean(m) && m !== 'auto'))].sort()
  const tasks = [...new Set(chats.map((c) => c.taskId))].sort()
  return { providers, models, tasks }
}

// What changed between two dry runs of the same choice: chats that joined,
// chats that left, and whether the new-task marks moved.
export function dryRunDiff(before: SwitchDryRun, after: SwitchDryRun) {
  const key = (c: DryRunChat) => `${c.slot}\u0000${c.model ?? ''}`
  const was = new Set(before.chats.map(key)),
    now = new Set(after.chats.map(key))
  const mark = (m: SwitchDryRun['marks'][number]) => `${m.scope}:${m.name}`
  return {
    added: after.chats.filter((c) => !was.has(key(c))),
    removed: before.chats.filter((c) => !now.has(key(c))),
    marks: before.marks.map(mark).join() !== after.marks.map(mark).join(),
  }
}

// Step 3's words for a finished switch.
export function switchResultText(result: { queued: number; marked?: string[] }, to: string): string {
  const chats = result.queued
    ? `Queued ${result.queued} running chat${result.queued === 1 ? '' : 's'} to ${to}. Each moves at its next turn.`
    : 'No running chat was moved.'
  const marked = result.marked?.length ? ` New tasks skip ${result.marked.join(', ')} until you undo it.` : ''
  return chats + marked
}

const SOURCE: Record<Mark['source'], string> = {
  usage: 'usage',
  error: 'errors',
  person: 'a person',
}

// One mark as a line: "Provider alpha is out (a person; new tasks use gamma-1)".
export function markText(mark: Mark): string {
  const what = mark.scope === 'model' ? 'Model' : mark.scope === 'provider' ? 'Provider' : 'Limit'
  const extra =
    mark.source === 'usage' && typeof mark.percent === 'number'
      ? `${mark.percent}% of its limit`
      : mark.source === 'person' && mark.to
        ? `new tasks use ${mark.to}`
        : mark.kind === 'credits'
          ? 'out of credits'
          : mark.kind === 'rate-limit'
            ? 'rate limited'
            : ''
  return `${what} ${mark.name} is ${mark.level} (${[SOURCE[mark.source], extra].filter(Boolean).join('; ')})`
}

// Only a person's mark has Undo; the others clear by themselves.
export const canUndo = (mark: Mark) => mark.source === 'person'

// One switch record's outcome in words.
export function switchText(entry: SwitchRecord): string {
  const to = entry.to ?? 'nothing'
  switch (entry.state === 'pending' ? 'pending' : entry.result) {
    case 'pending':
      return `${entry.from} → ${to}: waiting for the next pass`
    case 'switched':
      return `${entry.from} → ${to}`
    case 'deferred':
      return `${entry.from} → ${to} at the next turn`
    case 'refused':
      return `${entry.from} → ${to}: Kiro Crew refused`
    case 'no target':
      return `${entry.from}: no healthy model to switch to`
    default:
      return `${entry.from} → ${to}: skipped, the chat ended or moved`
  }
}

// Settings › Providers form: text fields, as typed. Limits are rows, one
// per provider or model.
export interface LimitRow {
  name: string
  unit: 'credits' | 'tokens'
  amount: string
}
export interface ProvidersForm {
  lowPercent: string
  cooldownMinutes: string
  windowHours: string
  limits: LimitRow[]
  groups: string
  fallback: string
}

export const emptyLimit = (): LimitRow => ({ name: '', unit: 'credits', amount: '' })

const list = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)

// Groups as "id: pattern, pattern" lines.
export function toProvidersForm(settings: ProviderSettings = {}): ProvidersForm {
  return {
    lowPercent: settings.lowPercent === undefined ? '' : String(settings.lowPercent),
    cooldownMinutes: settings.cooldownMinutes === undefined ? '' : String(settings.cooldownMinutes),
    windowHours: settings.windowHours === undefined ? '' : String(settings.windowHours),
    limits: Object.entries(settings.limits ?? {}).flatMap(([name, limit]) =>
      (['credits', 'tokens'] as const).filter((unit) => limit[unit] !== undefined).map((unit) => ({ name, unit, amount: String(limit[unit]) })),
    ),
    groups: Object.entries(settings.groups ?? {})
      .map(([id, patterns]) => `${id}: ${patterns.join(', ')}`)
      .join('\n'),
    fallback: (settings.fallback ?? []).join(', '),
  }
}

const LABELS = {
  lowPercent: 'Low at',
  cooldownMinutes: 'Error cooldown',
  windowHours: 'Usage window',
} as const

// The form as the `providers` key, or the first problem. The backend checks
// again (providersInput).
export function toProvidersSection(form: ProvidersForm): {
  providers?: ProviderSettings
  error?: string
} {
  const out: ProviderSettings = {}
  for (const key of ['lowPercent', 'cooldownMinutes', 'windowHours'] as const) {
    const text = form[key].trim()
    if (!text) continue
    if (!/^\d+$/.test(text)) return { error: `${LABELS[key]} must be a whole number.` }
    out[key] = Number(text)
  }
  const limits: NonNullable<ProviderSettings['limits']> = {}
  for (const row of form.limits) {
    const name = row.name.trim(),
      amount = row.amount.trim()
    if (!name && !amount) continue
    const n = Number(amount)
    if (!name) return { error: 'Each limit needs a provider or model name.' }
    if (!amount || !Number.isFinite(n) || n <= 0) return { error: `The limit for ${name} needs an amount above 0.` }
    limits[name] = { ...limits[name], [row.unit]: n }
  }
  if (Object.keys(limits).length) out.limits = limits
  const groups: NonNullable<ProviderSettings['groups']> = {}
  for (const line of form.groups
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)) {
    const at = line.indexOf(':')
    const id = at > 0 ? line.slice(0, at).trim() : ''
    const patterns = at > 0 ? list(line.slice(at + 1)) : []
    if (!id || !patterns.length)
      return {
        error: `Group "${line}" must read: <provider>: <pattern>, <pattern>.`,
      }
    groups[id] = patterns
  }
  if (Object.keys(groups).length) out.groups = groups
  const fallback = list(form.fallback)
  if (fallback.length) out.fallback = fallback
  return { providers: out }
}
