// Calls and pure helpers for Settings › Routing (design §8.3, R42). The
// backend (src/app/routing.mjs) runs the hard checks and the routing agent;
// this module only reads, formats, and builds the edits. Free of JSX so node
// can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import type { Level, ProviderFact } from './providers-api.ts'

export interface Reading {
  source: string
  measuredAt: string | null
  memFreeGb: number | null
  diskFreeGb: number | null
  loadPerCpu: number | null
}

export interface CrewCheck {
  check: 'online' | 'ready' | 'reach'
  ok: boolean
  why: string | null
}

export interface Crew {
  id: string
  name: string
  tags: string[]
  trust: 'local' | 'remote'
  gitHosts: string[]
  chatLimit: number
  chatLimitSet: boolean
  delivery: 'handback' | 'push' | null
  sshHost?: string | null
  worktreeRoot?: string | null
  configured: boolean
  reading: Reading | null
  ageSeconds: number | null
  running: number
  checks: CrewCheck[]
}

export interface Example {
  id: string
  title: string
  text: string
}

export interface RoutingView {
  enabled: boolean
  switchedOn: boolean
  prompt: string | null
  hasPrompt: boolean
  model: string | null
  timeoutSeconds: number
  examples: Example[]
  machineHash: string | null
  crews: Crew[]
  staleSeconds: number | null
  models: string[]
  providers: {
    lowPercent: number | null
    defaultLowPercent: number
    limits: Record<string, { credits?: number; tokens?: number }>
    hash: string | null
    rows: ProviderFact[]
  }
  mc10: boolean
  remoteDispatch: boolean
  lastCall: { id: string; state: string; tasks: number; why: string | null; openedAt: string; finishedAt: string | null } | null
  noFit: { taskId: string; why: string; text: string }[]
}

export interface Option {
  crew: string
  model: string | null
}

export interface PreviewItem {
  taskId: string
  title: string
  pin: { agent?: string; model?: string; crew?: string }
  needs: string[]
  options: Option[]
  removed: { crew?: string; model?: string; by: string }[]
  outcome: { kind: 'fixed' | 'agent' | 'wait' | 'no-fit'; text: string; crew?: string; model?: string | null }
  noFit: boolean
}

export interface Preview {
  enabled: boolean
  mc10: boolean
  items: PreviewItem[]
  brief: string | null
}

export const DEFAULT_CHAT_LIMIT = { local: 3, remote: 2 }
export const DEFAULT_STALE_SECONDS = 120
export const PROMPT_LIMIT = 4000
export const TAG_KEYS = ['os', 'arch', 'tools', 'trust'] as const
export const MC10_LINE = 'Remote crews wait on Kiro Crew (MC-10). Every chat runs on local.'
export const OFF_LINE = 'Off: every task runs on this machine, as before.'
export const CHECK_LABELS: Record<CrewCheck['check'], string> = {
  online: 'Online',
  ready: 'Ready',
  reach: 'Reaches repos',
}

// An example appended to the prompt on its own line, never twice.
export function insertExample(prompt: string, example: Pick<Example, 'text'>): string {
  if (prompt.includes(example.text)) return prompt
  const base = prompt.trimEnd()
  return base ? `${base}\n${example.text}` : example.text
}

// The routing settings to save, or the first problem. The backend checks
// again (validateRouting).
export function toRoutingSection(form: { enabled: boolean; prompt: string; model: string }): {
  routing?: { enabled?: boolean; prompt?: string; model?: string }
  error?: string
} {
  const prompt = form.prompt.trim()
  if (prompt.length > PROMPT_LIMIT) return { error: `The prompt is at most ${PROMPT_LIMIT} characters.` }
  if (form.enabled && !prompt) return { error: 'Write a routing prompt before you turn routing on.' }
  return {
    routing: {
      ...(form.enabled ? { enabled: true } : {}),
      ...(prompt ? { prompt } : {}),
      ...(form.model ? { model: form.model } : {}),
    },
  }
}

// The provider box: one low line, and a credits limit per provider.
export function toProviderBox(form: { lowPercent: string; limits: Record<string, string> }, limits: RoutingView['providers']['limits'] = {}): {
  providers?: { lowPercent?: number; limits?: Record<string, { credits?: number; tokens?: number }> }
  error?: string
} {
  const out: { lowPercent?: number; limits?: Record<string, { credits?: number; tokens?: number }> } = {}
  const low = form.lowPercent.trim()
  if (low) {
    const n = Number(low)
    if (!Number.isInteger(n) || n < 1 || n > 99) return { error: 'Low at is a whole number 1–99.' }
    out.lowPercent = n
  }
  const next: Record<string, { credits?: number; tokens?: number }> = {}
  for (const [key, limit] of Object.entries(limits)) if (limit.tokens) next[key] = { tokens: limit.tokens }
  for (const [key, text] of Object.entries(form.limits)) {
    if (!text.trim()) continue
    const n = Number(text)
    if (!Number.isFinite(n) || n <= 0) return { error: `${key}: the limit is a number of credits above 0.` }
    next[key] = { ...next[key], credits: n }
  }
  if (Object.keys(next).length) out.limits = next
  return { providers: out }
}

export const levelText = (level: Level) => (level === 'ok' ? 'ok' : level === 'low' ? 'low' : 'out')

export function usedText(row: ProviderFact): string {
  if (row.percent !== null) return `${row.percent}% used`
  if (!row.credits && !row.tokens) return 'no usage'
  return `${Math.round(row.credits * 10) / 10} credits, ${row.tokens} tokens`
}

export function readingText(crew: Crew): { load: string; mem: string; disk: string } {
  const r = crew.reading
  const n = (v: number | null | undefined, unit: string, digits = 0) => (v === null || v === undefined ? '–' : `${v.toFixed(digits)}${unit}`)
  return { load: n(r?.loadPerCpu, '', 1), mem: n(r?.memFreeGb, ' GB'), disk: n(r?.diskFreeGb, ' GB') }
}

// One check as a short word with why, for the crews table.
export const checkText = (check: CrewCheck) => (check.ok ? 'yes' : (check.why ?? 'no'))

export function optionText(option: Option): string {
  return `${option.crew} / ${option.model ?? 'default'}`
}

export const chatPlaceholder = (crew: Pick<Crew, 'id'>) =>
  String(crew.id === 'local' ? DEFAULT_CHAT_LIMIT.local : DEFAULT_CHAT_LIMIT.remote)

// The side form for a crew's settings, as text fields.
export interface CrewForm {
  tags: string
  trust: 'local' | 'remote'
  gitHosts: string
  chatLimit: string
  delivery: '' | 'handback' | 'push'
  sshHost: string
  worktreeRoot: string
}

export function toCrewForm(crew: Crew): CrewForm {
  return {
    tags: crew.tags.filter((t) => !t.startsWith('trust:')).join(' '),
    trust: crew.trust,
    gitHosts: crew.gitHosts.join(' '),
    chatLimit: crew.chatLimitSet ? String(crew.chatLimit) : '',
    delivery: crew.id === 'local' || !crew.configured ? '' : (crew.delivery ?? ''),
    sshHost: crew.sshHost ?? '',
    worktreeRoot: crew.worktreeRoot ?? '',
  }
}

const words = (text: string) => text.split(/[\s,]+/).filter(Boolean)

// One crew's machine-local entry, or an error naming the field.
export function toCrewEntry(id: string, form: CrewForm): { entry?: Record<string, unknown>; error?: string } {
  const tags = words(form.tags)
  for (const tag of tags) {
    const key = tag.split(':')[0]
    if (!tag.includes(':') || !(TAG_KEYS as readonly string[]).includes(key))
      return { error: `Tag ${tag}: use key:value with key ${TAG_KEYS.join(', ')}.` }
  }
  const entry: Record<string, unknown> = { tags: [...tags.filter((t) => !t.startsWith('trust:')), `trust:${id === 'local' ? 'local' : form.trust}`] }
  const hosts = words(form.gitHosts)
  if (hosts.length) entry.gitHosts = hosts
  if (form.chatLimit.trim()) {
    const n = Number(form.chatLimit)
    if (!Number.isInteger(n) || n < 0 || n > 32) return { error: 'Chat limit is a whole number 0–32.' }
    entry.chatLimit = n
  }
  if (id !== 'local') {
    if (form.delivery) entry.delivery = form.delivery
    if (form.sshHost.trim()) entry.sshHost = form.sshHost.trim()
    if (form.worktreeRoot.trim()) {
      if (!form.worktreeRoot.trim().startsWith('/')) return { error: 'Worktree folder is an absolute folder on that crew.' }
      entry.worktreeRoot = form.worktreeRoot.trim()
    }
  }
  return { entry }
}

// Every crew's current machine entry, from the view, for a whole-map save.
export function crewMap(crews: Crew[]): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const crew of crews) {
    if (!crew.configured) continue
    const built = toCrewEntry(crew.id, toCrewForm(crew))
    if (built.entry) out[crew.id] = built.entry
  }
  return out
}

export function routingClient(api: AppApi) {
  const run = <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    view: (workspaceId: string) => run<RoutingView>(workspaceId, 'routing.view'),
    preview: (workspaceId: string) => run<Preview>(workspaceId, 'routing.preview'),
    save: (workspaceId: string, input: { routing: Record<string, unknown>; expectedHash: string | null }) =>
      run<{ hash: string }>(workspaceId, 'routing.update', { where: 'machine', ...input }),
    saveProviders: (workspaceId: string, input: { providers: Record<string, unknown>; expectedHash: string | null }) =>
      run<{ hash: string }>(workspaceId, 'providers.settings.update', input),
    saveCrews: (workspaceId: string, input: { crews?: Record<string, unknown>; staleSeconds?: number | null; expectedHash: string | null }) =>
      run(workspaceId, 'crews.update', input),
    pickAgain: (workspaceId: string, taskId: string) => run(workspaceId, 'delivery.pickAgain', { taskId }),
  }
}
