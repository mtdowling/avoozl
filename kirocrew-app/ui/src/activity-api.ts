// The Activity tab's calls and pure helpers (design §4.19, R71): the
// activity log (activity.list) read 100 rows a page, newest first, its saved
// filter, and the Keep activity setting. Kept free of JSX so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { safeHref } from './views-api.ts'
import type { Option } from './filters.ts'

export type ActivitySource = 'local' | 'github' | 'plugin' | 'mcp'

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

// The filter's choices: the values the log holds, with the one in use kept
// so a filter never points at a choice that vanished.
export function filterOptions(page: ActivityPage | null, filter: ActivityFilter) {
  const list = (values: string[], chosen: string | undefined, label: (value: string) => string = (v) => v): Option[] => [
    { value: '', label: 'All' },
    ...[...new Set([...values, ...(chosen ? [chosen] : [])])].sort().map((value) => ({ value, label: label(value) })),
  ]
  return {
    sources: list(page?.sources ?? [], filter.source, (value) => SOURCE_LABELS[value] ?? value),
    kinds: list(page?.kinds ?? [], filter.kind),
    actors: list(page?.actors ?? [], filter.actor),
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
