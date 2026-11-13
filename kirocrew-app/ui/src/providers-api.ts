// Calls and pure helpers for provider health and the Switch model dialog
// (design §4.20, R72). The backend (src/app/provider-health.mjs) judges
// health and applies switches; this module reads, formats and builds the
// inputs. Free of JSX so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { modelOptions, parseModels } from './flow-api.ts'

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

// One chat in the dry run: its task, spec, current and new model, and where
// it runs (a crew ID, or local).
export interface PreviewChat {
  slot: string | null
  taskId: string
  title: string | null
  spec: string | null
  role: string | null
  model: string | null
  to: string
  where: string | null
  agent: string | null
}

export interface SwitchPreview {
  chats: PreviewChat[]
  // Chats or chosen tasks that cannot switch, and why.
  skipped: (PreviewChat & { why: string })[]
  // With Also new tasks: queued tasks whose next pick moves off From.
  newTasks: { taskId: string; title: string | null; model: string }[]
  counts: { move: number; stay: number; newTasks: number }
  previewHash: string
}

export interface SwitchResult {
  queued: number
  to: string
  switches: { taskId: string; role: string; from: string; to: string }[]
}

export function providersClient(api: AppApi) {
  const run = <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    view: (workspaceId: string) => run<ProvidersView>(workspaceId, 'providers.view'),
    preview: (workspaceId: string, input: { from: From; to: string; alsoNewTasks: boolean }) => run<SwitchPreview>(workspaceId, 'provider.switch.preview', input),
    switch: (
      workspaceId: string,
      input: {
        from: From
        to: string
        alsoNewTasks: boolean
        previewHash: string
      },
    ) => run<SwitchResult>(workspaceId, 'provider.switch', input),
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

// The providers and models in use, for From's dropdowns: the running chats'
// and the health list's (a key mark names neither).
export function fromOptions(chats: LiveChat[], marks: Mark[] = []) {
  const sorted = (list: (string | null)[]) => [...new Set(list.filter((v): v is string => Boolean(v)))].sort()
  const named = (scope: Mark['scope']) => marks.filter((m) => m.scope === scope).map((m) => m.name)
  return {
    providers: sorted([...chats.map((c) => c.provider), ...named('provider')]),
    models: sorted([...chats.map((c) => c.model), ...named('model')]),
    tasks: sorted(chats.map((c) => c.taskId)),
  }
}

// To's choices: auto first, then Kiro Crew's models (the Flow dropdown's feed).
export const toOptions = (models: { value: string; label: string }[]) => modelOptions(models, '')

// What a fresh dry run moved in and out of the set the person saw.
export function previewDiff(before: SwitchPreview, after: SwitchPreview) {
  const keys = (p: SwitchPreview) =>
    new Map([
      ...p.chats.map((c) => [`chat:${c.slot}:${c.model}`, `${c.taskId} ${c.role}`] as const),
      ...p.newTasks.map((q) => [`new:${q.taskId}:${q.model}`, `${q.taskId} (new task)`] as const),
    ])
  const was = keys(before),
    now = keys(after)
  return {
    added: [...now].filter(([k]) => !was.has(k)).map(([, v]) => v),
    removed: [...was].filter(([k]) => !now.has(k)).map(([, v]) => v),
  }
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

// Settings › Providers form: text fields, as typed.
export interface ProvidersForm {
  lowPercent: string
  cooldownMinutes: string
  windowHours: string
  limits: string
  groups: string
  fallback: string
}

const list = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)

// Limits as "key credits 500" or "key tokens 2000000" lines; groups as
// "id: pattern, pattern" lines.
export function toProvidersForm(settings: ProviderSettings = {}): ProvidersForm {
  return {
    lowPercent: settings.lowPercent === undefined ? '' : String(settings.lowPercent),
    cooldownMinutes: settings.cooldownMinutes === undefined ? '' : String(settings.cooldownMinutes),
    windowHours: settings.windowHours === undefined ? '' : String(settings.windowHours),
    limits: Object.entries(settings.limits ?? {})
      .flatMap(([key, limit]) => Object.entries(limit).map(([field, n]) => `${key} ${field} ${n}`))
      .join('\n'),
    groups: Object.entries(settings.groups ?? {})
      .map(([id, patterns]) => `${id}: ${patterns.join(', ')}`)
      .join('\n'),
    fallback: (settings.fallback ?? []).join(', '),
  }
}

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
    if (!/^\d+$/.test(text)) return { error: `${key} must be a whole number.` }
    out[key] = Number(text)
  }
  const limits: NonNullable<ProviderSettings['limits']> = {}
  for (const line of form.limits
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)) {
    const [key, field, amount, ...rest] = line.split(/\s+/)
    const n = Number(amount)
    if (rest.length || !key || (field !== 'credits' && field !== 'tokens') || !Number.isFinite(n) || n <= 0)
      return {
        error: `Limit "${line}" must read: <provider or model> credits|tokens <amount>.`,
      }
    limits[key] = { ...limits[key], [field]: n }
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
