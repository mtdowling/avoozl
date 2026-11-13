// Calls and pure helpers for the Untriaged tab (design §8.5): open GitHub
// issues and pull requests no trigger rule, triage label, or task covers.
// The backend (src/app/untriaged.mjs) decides what is untriaged and builds
// every link; this module only filters, sorts and selects. Keep it free of
// JSX and runtime imports so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import type { Option } from './filters.ts'

export interface HandOff {
  url: string
  // False while Kiro Crew has no link to the exact item (MC-14).
  exact: boolean
  tooltip: string
}

export interface UntriagedItem {
  kind: 'issue' | 'pr'
  number: number
  title: string
  url: string
  repository: string
  author: string | null
  createdAt: string | null
  labels: string[]
  comments: number
  draft?: boolean
  checks?: 'passing' | 'failing' | 'pending' | null
  headSha?: string | null
  links: { github: string; issueRadar: HandOff; review: HandOff | null }
  // A pull request's code review chat (src/app/pr-review.mjs): queued until
  // the next tick opens it, then open with a link to Attach.
  reviewChat?: ReviewChat | null
}

export interface ReviewChat {
  state: 'queued' | 'open'
  attempt: number
  headSha: string | null
  skill: string | null
  slot: string | null
  status: string | null
  link: string | null
}

// An issue a crew has, or was sent to (R52.6).
export interface RadarItem extends UntriagedItem {
  claimed: boolean
  needsHuman: boolean
  needsHumanLabel: string
  handoff: { label: string | null; crew: { id: string; name: string } | null; actor: string | null; at: string | null } | null
}

export interface UntriagedRepository {
  repository: string
  checkedAt: string | null
  error: string | null
  searched: number | null
  // Items read before the exclusions; below `searched` only when truncated.
  read: number
  truncated: boolean
  count: number
  withRadar?: number
  query: string | null
  filter: string | null
  defaultFilter: string
  notify: boolean
}

export interface UntriagedList {
  enabled: boolean
  mode: string | null
  total: number
  repositories: UntriagedRepository[]
  items: UntriagedItem[]
  withRadar?: RadarItem[]
}

export function untriagedClient(api: AppApi) {
  const run = (workspaceId: string, input: Record<string, unknown>) =>
    api
      .post<{ result: UntriagedList }>(COMMAND_PATH, { operation: 'untriaged.view', input, workspaceId })
      .then((reply) => reply.result)
  return {
    view: (workspaceId: string) => run(workspaceId, {}),
    refresh: (workspaceId: string) => run(workspaceId, { refresh: true }),
    review: (workspaceId: string, item: Pick<UntriagedItem, 'repository' | 'number'>) =>
      api
        .post<{ result: ReviewChat & { created: boolean } }>(COMMAND_PATH, {
          operation: 'review.chat',
          input: { repository: item.repository, number: item.number },
          workspaceId,
        })
        .then((reply) => reply.result),
  }
}

// Send to Issue Radar (design §8.5, R52).
export interface Crew {
  id: string
  name: string
  labels: string[]
  status: string | null
  emptyScope: boolean
}

export interface CrewList {
  repository: string
  available: boolean
  reason: string | null
  crews: Crew[]
  needsHumanLabel: string | null
}

export interface HandOffInput {
  items: { repository: string; number: number }[]
  crew?: { id: string; name?: string } | null
  label?: string
}

export interface HandOffReply {
  repository: string
  label: string | null
  crew: { id: string; name: string; emptyScope?: boolean } | null
  items: { number: number; title: string; url: string }[]
  warnings: string[]
  written: boolean
  actor?: string
  results?: { number: number; ok: boolean; error?: string }[]
  sent?: number
  failed?: number
}

export function radarClient(api: AppApi) {
  const call = <T,>(workspaceId: string, operation: string, input: Record<string, unknown>) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    crews: (workspaceId: string, repository: string) => call<CrewList>(workspaceId, 'untriaged.crews', { repository }),
    preview: (workspaceId: string, input: HandOffInput) => call<HandOffReply>(workspaceId, 'untriaged.handoff', { ...input, preview: true }),
    send: (workspaceId: string, input: HandOffInput) => call<HandOffReply>(workspaceId, 'untriaged.handoff', { ...input, confirm: true }),
  }
}

// Whether these rows can go to one crew together, and why not.
export function sendable(items: UntriagedItem[]): { ok: boolean; reason: string; repository: string | null } {
  if (!items.length) return { ok: false, reason: 'Select issues to send them to an Issue Radar crew.', repository: null }
  if (items.some((item) => item.kind !== 'issue'))
    return { ok: false, reason: 'Crews work issues. Unselect the pull requests first.', repository: null }
  const repository = items[0].repository
  if (items.some((item) => item.repository !== repository))
    return { ok: false, reason: 'Each crew works one repository. Select issues from one repository.', repository: null }
  return {
    ok: true,
    reason: `Pick a crew and send ${items.length === 1 ? `#${items[0].number}` : `${items.length} issues`} to it. You confirm the label first.`,
    repository,
  }
}

// What one crew does with a label, in a short line for the picker.
export function crewLine(crew: Crew): string {
  if (crew.emptyScope) return 'Empty scope: takes every open issue, labeled or not.'
  return `Watches ${crew.labels.join(', ')}. Avoozl adds ${crew.labels[0]}.`
}

// Where a With Issue Radar row stands, most urgent first.
export function radarState(item: RadarItem): { text: string; tone: 'warning' | 'info' | undefined } {
  if (item.needsHuman) return { text: 'Needs you', tone: 'warning' }
  if (item.claimed) return { text: 'Crew working', tone: 'info' }
  return { text: 'Waiting for a crew', tone: undefined }
}

// The repository's label names, for Settings' triage label checkboxes.
export interface RepositoryLabels {
  repository: string
  labels: string[] | null
  error: string | null
}

export const labelsClient = (api: AppApi) => (workspaceId: string, repository: string) =>
  api
    .post<{ result: RepositoryLabels }>(COMMAND_PATH, {
      operation: 'github.repository.labels',
      input: { repository },
      workspaceId,
    })
    .then((reply) => reply.result)

// One checkbox per label GitHub has, plus saved names it no longer has,
// marked missing. Names compare without case, as GitHub's do.
export function triageRows(saved: string[], labels: string[] | null): { name: string; checked: boolean; missing: boolean }[] {
  const lower = (value: string) => value.toLocaleLowerCase()
  const chosen = new Set(saved.map(lower))
  const known = labels ?? []
  const seen = new Set(known.map(lower))
  return [
    ...known.map((name) => ({ name, checked: chosen.has(lower(name)), missing: false })),
    ...saved.filter((name) => !seen.has(lower(name))).map((name) => ({ name, checked: true, missing: labels !== null })),
  ]
}

export interface UntriagedFilter {
  repository?: string
  kind?: 'issue' | 'pr'
  // Days: newer than this many.
  age?: string
  author?: string
  label?: string
}

export const AGE_OPTIONS: Option[] = [
  { value: '1', label: 'Last day' },
  { value: '7', label: 'Last week' },
  { value: '30', label: 'Last 30 days' },
  { value: 'older', label: 'Older than 30 days' },
]

export const KIND_OPTIONS: Option[] = [
  { value: 'issue', label: 'Issues' },
  { value: 'pr', label: 'Pull requests' },
]

export const filterActive = (filter: UntriagedFilter) =>
  Boolean(filter.repository || filter.kind || filter.age || filter.author || filter.label)

const DAY = 86400000

export function matchesFilter(item: UntriagedItem, filter: UntriagedFilter, now = Date.now()): boolean {
  if (filter.repository && item.repository !== filter.repository) return false
  if (filter.kind && item.kind !== filter.kind) return false
  if (filter.author && item.author !== filter.author) return false
  if (filter.label && !item.labels.includes(filter.label)) return false
  if (filter.age) {
    const at = item.createdAt ? Date.parse(item.createdAt) : NaN
    if (!Number.isFinite(at)) return false
    if (filter.age === 'older') return now - at > 30 * DAY
    return now - at <= Number(filter.age) * DAY
  }
  return true
}

// The dropdown choices the items on hand allow.
export function filterOptions(list: UntriagedList | null) {
  const sorted = (values: Iterable<string>) =>
    [...new Set(values)].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }))
  const items = list?.items ?? []
  return {
    repositories: sorted((list?.repositories ?? []).map((row) => row.repository)),
    authors: sorted(items.map((item) => item.author).filter((author): author is string => Boolean(author))),
    labels: sorted(items.flatMap((item) => item.labels)),
  }
}

// "2 d", "5 h": an item's age, short for a table cell.
export function age(at: string | null, now = Date.now()): string {
  if (!at) return ''
  const then = Date.parse(at)
  if (!Number.isFinite(then)) return ''
  const minutes = Math.max(0, Math.round((now - then) / 60000))
  if (minutes < 60) return `${minutes} min`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h`
  if (minutes < 60 * 24 * 365) return `${Math.round(minutes / 60 / 24)} d`
  return `${Math.round(minutes / 60 / 24 / 365)} y`
}

export const itemKey = (item: { repository: string; number: number }) => `${item.repository}#${item.number}`

// The GitHub host an item lives on, from its own link: github.com, or an
// Enterprise host. A link that does not parse falls back to github.com.
function githubOrigin(item: { url?: string; links?: { github?: string } }): string {
  try {
    return new URL(item.links?.github || item.url || '').origin
  } catch {
    return 'https://github.com'
  }
}

// Links for a row's repository and author on the item's GitHub host.
export const repositoryHref = (item: { repository: string; url?: string; links?: { github?: string } }) =>
  `${githubOrigin(item)}/${item.repository.split('/').map(encodeURIComponent).join('/')}`
export const authorHref = (item: { author: string | null; url?: string; links?: { github?: string } }) =>
  item.author ? `${githubOrigin(item)}/${encodeURIComponent(item.author)}` : null

// The selection with one row turned on or off, or every shown row at once.
export function toggleSelected(selected: Set<string>, keys: string[], on: boolean): Set<string> {
  const next = new Set(selected)
  for (const key of keys) {
    if (on) next.add(key)
    else next.delete(key)
  }
  return next
}

// The bulk button's link and tooltip for the chosen rows. Issue Radar takes
// no selection from a link yet (design F98, MC-14), so it opens Issue Radar
// and names them. shortcut: page link only; pass the selection when MC-14
// ships.
export function selectionHandOff(items: UntriagedItem[]): HandOff {
  if (!items.length) return { url: '/issue-radar', exact: false, tooltip: 'Select rows to open them in Issue Radar.' }
  const groups = new Map<string, string[]>()
  for (const item of items) groups.set(item.repository, [...(groups.get(item.repository) ?? []), `#${item.number}`])
  const names = [...groups].map(([repository, numbers]) => `${repository} ${numbers.join(', ')}`).join('; ')
  return {
    url: items[0].links.issueRadar.url,
    exact: false,
    tooltip: `Issue Radar can't take a selection from a link yet, so this opens Issue Radar. Pick these there: ${names}.`,
  }
}

// What the empty state says, for a list with no items.
export function emptyText(list: UntriagedList): { title: string; subtitle: string } {
  const failed = list.repositories.find((row) => row.error)
  if (!list.repositories.length)
    return { title: 'No repository yet', subtitle: 'Add a GitHub repository in Settings › Repositories, and its untriaged items show here.' }
  if (list.repositories.every((row) => !row.checkedAt))
    return {
      title: 'Not checked yet',
      subtitle: failed?.error ?? 'Avoozl reads GitHub on its next tick, at most every 10 minutes. Check now reads it at once.',
    }
  return {
    title: 'Nothing untriaged',
    subtitle:
      'Untriaged means open issues and pull requests that no trigger rule, triage label or Avoozl task covers. Change what counts in Settings › Repositories › Triggers and labels › Untriaged.',
  }
}

const KEY = 'avoozl:untriaged-filter:'
export const UNTRIAGED_FILTER_STORE = {
  event: 'avoozl:untriaged-filter',
  empty: {} as UntriagedFilter,
  read(storage: Storage | null, workspaceId: string): UntriagedFilter {
    try {
      const value = JSON.parse(storage?.getItem(KEY + workspaceId) ?? '{}')
      return value && typeof value === 'object' && !Array.isArray(value) ? (value as UntriagedFilter) : {}
    } catch {
      return {}
    }
  },
  write(storage: Storage | null, workspaceId: string, value: UntriagedFilter) {
    try {
      storage?.setItem(KEY + workspaceId, JSON.stringify(value))
    } catch {
      // Storage is optional; the filter still works for this visit.
    }
  },
}
