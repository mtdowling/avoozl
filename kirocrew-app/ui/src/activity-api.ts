// The Activity tab's calls and pure helpers (design §4.19, R71): the
// activity log (activity.list) read 100 rows a page, newest first, its saved
// filter, and the Keep activity setting. Kept free of JSX so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { safeHref } from './views-api.ts'

export type ActivitySource = 'local' | 'github' | 'plugin' | 'mcp' | 'tick'

export interface ActivityRow {
  seq: number
  at: string
  source: ActivitySource
  actor: string | null
  kind: string
  summary: string
  targetId: string | null
  link: string | null
  redacted: boolean
  // The target is a task in this workspace, so the drawer can open it.
  task?: boolean
}

export interface ActivityPage {
  items: ActivityRow[]
  total: number
  sources: string[]
  kinds: string[]
  actors: string[]
  // Rows per value over the whole log; an older app leaves it out.
  counts?: { source?: Record<string, number>; kind?: Record<string, number>; actor?: Record<string, number> }
  retentionDays: number
}

export interface ActivitySettings {
  hash: string | null
  retentionDays: number
  default: number
}

export interface ActivityFilter {
  source?: string
  kind?: string
  actor?: string
}

export const SOURCE_LABELS: Record<string, string> = {
  local: 'This workspace',
  github: 'GitHub',
  plugin: 'Plugin sync',
  mcp: 'MCP or a session',
  tick: 'Tick',
}

export const MAX_RETENTION_DAYS = 365

export function activityClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })).result
  return {
    list: (workspaceId: string, filter: ActivityFilter, offset = 0) => run<ActivityPage>('activity.list', { ...filter, offset }, workspaceId),
    settings: (workspaceId: string) => run<ActivitySettings>('activity.settings.get', {}, workspaceId),
    saveSettings: (workspaceId: string, retentionDays: number | null, expectedHash: string | null) =>
      run<ActivitySettings>('activity.settings.update', { retentionDays, expectedHash }, workspaceId),
  }
}

export const filterActive = (filter: ActivityFilter) => Boolean(filter.source || filter.kind || filter.actor)

// The filter's choices, each with its row count: the values the log holds,
// with the one in use kept so a filter never points at a choice that
// vanished. Sources keep the log's order of labels; kinds and people sort.
export interface ActivityChoice {
  value: string
  label: string
  count: number
}
export function filterChoices(page: ActivityPage | null, filter: ActivityFilter) {
  const list = (values: string[], chosen: string | undefined, counts: Record<string, number> = {}, label: (value: string) => string = (v) => v): ActivityChoice[] =>
    [...new Set([...values, ...(chosen ? [chosen] : [])])].sort().map((value) => ({ value, label: label(value), count: counts[value] ?? 0 }))
  return {
    sources: list(page?.sources ?? [], filter.source, page?.counts?.source, (value) => SOURCE_LABELS[value] ?? value),
    kinds: list(page?.kinds ?? [], filter.kind, page?.counts?.kind),
    actors: list(page?.actors ?? [], filter.actor, page?.counts?.actor),
  }
}

// Where a row's target goes: the task drawer for a task, GitHub (or any
// https link) in a new tab, or nowhere.
export function rowTarget(row: ActivityRow): { kind: 'task'; id: string } | { kind: 'link'; href: string } | null {
  if (row.targetId && row.task) return { kind: 'task', id: row.targetId }
  const href = safeHref(row.link)
  return href && href.startsWith('https:') ? { kind: 'link', href } : null
}

// The Keep activity field: blank keeps the default; otherwise 1–365 days.
export function retentionInput(text: string): { days: number | null; error?: string } {
  const value = text.trim()
  if (!value) return { days: null }
  const days = Number(value)
  if (!Number.isInteger(days) || days < 1 || days > MAX_RETENTION_DAYS) return { days: null, error: `Use a whole number of days, 1–${MAX_RETENTION_DAYS}.` }
  return { days }
}

export const KEEP_SAVE_DELAY_MS = 800

// Keep activity saves by itself. `change` runs on each keystroke and saves
// once after `delay` ms of quiet; `flush` (blur, Enter) saves at once. Only a
// valid value that differs from the last saved or loaded one is sent.
export function retentionAutosave(options: {
  save: (days: number | null) => void
  delay?: number
  setTimer?: (run: () => void, ms: number) => unknown
  clearTimer?: (timer: any) => void
}) {
  const { save, delay = KEEP_SAVE_DELAY_MS } = options
  const setTimer = options.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms))
  const clearTimer = options.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>))
  let timer: unknown = null
  let known = ''
  const cancel = () => {
    if (timer !== null) clearTimer(timer)
    timer = null
  }
  const send = (text: string) => {
    cancel()
    const parsed = retentionInput(text)
    if (parsed.error || text.trim() === known.trim()) return
    known = text
    save(parsed.days)
  }
  return {
    // The text now on the server (after a load or a conflict reload).
    reset(text: string) {
      cancel()
      known = text
    },
    change(text: string) {
      cancel()
      const parsed = retentionInput(text)
      if (parsed.error || text.trim() === known.trim()) return
      timer = setTimer(() => send(text), delay)
    },
    flush: send,
    cancel,
  }
}

const KEY = 'avoozl:activity-filter:'
export const ACTIVITY_FILTER_STORE = {
  event: 'avoozl:activity-filter',
  empty: {} as ActivityFilter,
  read(storage: Storage | null, workspaceId: string): ActivityFilter {
    try {
      const value = JSON.parse(storage?.getItem(KEY + workspaceId) ?? '{}')
      return value && typeof value === 'object' && !Array.isArray(value) ? (value as ActivityFilter) : {}
    } catch {
      return {}
    }
  },
  write(storage: Storage | null, workspaceId: string, value: ActivityFilter) {
    try {
      storage?.setItem(KEY + workspaceId, JSON.stringify(value))
    } catch {
      // Storage is optional; the filter still works for this visit.
    }
  },
}
