// Calls and pure helpers for the Intake tab (design §8.5, §4.12): incoming
// items from GitHub and every declared source; its default filter,
// Untriaged, shows those no trigger rule, triage label, or task covers.
// The backend (src/app/untriaged.mjs, src/app/intake.mjs) decides what is
// untriaged and builds every link; this module only filters, sorts and
// selects. Keep it free of JSX and runtime imports so node can test it
// directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import type { Option } from './filters.ts'
import type { Idea } from './ideas-api.ts'

export interface HandOff {
  url: string
  // False while Kiro Crew has no link to the exact item (MC-14).
  exact: boolean
  tooltip: string
}

export interface UntriagedItem {
  // `github`, or a declared intake source's id (absent from older backends).
  source?: string
  // The item's id at its source; `owner/repo#N` for GitHub.
  id?: string
  kind: 'issue' | 'pr' | 'review' | 'ticket'
  // Null for an item that is not from GitHub.
  number: number | null
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
  // `github` and `issueRadar` are null for an item from another source,
  // which links to its own `item` page instead.
  links: { github: string | null; item?: string; issueRadar: HandOff | null; review: { tooltip: string } | null }
  // A person's Plan this and Deliver this, for an item from another source.
  start?: { plan: boolean; deliver: boolean }
  // Why no rule took it, when one matched for someone who does not count.
  reason?: string | null
  // A pull request's code review chat (src/app/pr-review.mjs): queued until
  // the next tick opens it, then open with a link to Attach.
  reviewChat?: ReviewChat | null
}

export interface ReviewChat {
  state: 'queued' | 'open'
  attempt: number
  headSha: string | null
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

// A declared intake source and its last read (GitHub is `github`).
export interface IntakeSource {
  id: string
  via: string | null
  repository: string | null
  error: string | null
  checkedAt: string | null
  more?: boolean
  refused?: number
}

export interface UntriagedList {
  sources?: IntakeSource[]
  enabled: boolean
  mode: string | null
  total: number
  repositories: UntriagedRepository[]
  items: UntriagedItem[]
  withRadar?: RadarItem[]
  // Ideas (R63): never untriaged, so never in `items` or `total`.
  ideas?: Idea[]
}

export function untriagedClient(api: AppApi) {
  const run = (workspaceId: string, input: Record<string, unknown>) =>
    api
      .post<{ result: UntriagedList }>(COMMAND_PATH, { operation: 'untriaged.view', input, workspaceId })
      .then((reply) => reply.result)
  return {
    view: (workspaceId: string) => run(workspaceId, {}),
    refresh: (workspaceId: string) => run(workspaceId, { refresh: true }),
    // Plan this and Deliver this (R50.15): a person's start for an item
    // from another source. The backend refuses a session or MCP caller.
    start: (workspaceId: string, item: Pick<UntriagedItem, 'source' | 'id'>, action: 'deliver' | 'plan') =>
      api
        .post<{ result: { taskId: string } }>(COMMAND_PATH, {
          operation: action === 'deliver' ? 'intake.deliver' : 'intake.plan',
          input: { source: item.source, id: item.id },
          workspaceId,
        })
        .then((reply) => reply.result),
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
  if (items.some((item) => sourceOf(item) !== 'github'))
    return { ok: false, reason: 'Issue Radar works GitHub issues. Unselect the items from other sources first.', repository: null }
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
  source?: string
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
  { value: 'ticket', label: 'Tickets' },
  { value: 'review', label: 'Reviews' },
]

export const filterActive = (filter: UntriagedFilter) =>
  Boolean(filter.source || filter.repository || filter.kind || filter.age || filter.author || filter.label)

export const sourceOf = (item: Pick<UntriagedItem, 'source'>) => item.source ?? 'github'

const DAY = 86400000

export function matchesFilter(item: UntriagedItem, filter: UntriagedFilter, now = Date.now()): boolean {
  if (filter.source && sourceOf(item) !== filter.source) return false
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
    sources: sorted([...(list?.sources ?? []).map((row) => row.id), ...items.map(sourceOf)]),
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

// GitHub rows keep their `owner/repo#N` key; another source's rows add the
// source, since its ids are its own.
export const itemKey = (item: { repository: string; number: number | null; source?: string; id?: string }) =>
  sourceOf(item) === 'github' ? `${item.repository}#${item.number}` : `${item.source}:${item.id}`

// How a row names its item: `o/app #12` on GitHub, `tickets T-1042` elsewhere.
export const itemName = (item: Pick<UntriagedItem, 'repository' | 'number' | 'source' | 'id'>) =>
  sourceOf(item) === 'github' ? `${item.repository} #${item.number}` : `${item.source} ${item.id}`

// The GitHub host an item lives on, from its own link: github.com, or an
// Enterprise host. A link that does not parse falls back to github.com.
function githubOrigin(item: { url?: string; source?: string; links?: { github?: string | null } }): string {
  try {
    // Another source's url is its own tracker's, not a GitHub host.
    return new URL(item.links?.github || (sourceOf(item) === 'github' ? item.url : '') || '').origin
  } catch {
    return 'https://github.com'
  }
}

// Links for a row's repository and author on the item's GitHub host.
export const repositoryHref = (item: { repository: string; url?: string; source?: string; links?: { github?: string | null } }) =>
  `${githubOrigin(item)}/${item.repository.split('/').map(encodeURIComponent).join('/')}`
export const authorHref = (item: { author: string | null; url?: string; source?: string; links?: { github?: string | null } }) =>
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
export function selectionHandOff(chosen: UntriagedItem[]): HandOff {
  // Only GitHub rows go to Issue Radar.
  const items = chosen.filter((item) => sourceOf(item) === 'github' && item.links.issueRadar)
  if (!items.length) return { url: '/issue-radar', exact: false, tooltip: 'Select GitHub rows to open them in Issue Radar.' }
  const groups = new Map<string, string[]>()
  for (const item of items) groups.set(item.repository, [...(groups.get(item.repository) ?? []), `#${item.number}`])
  const names = [...groups].map(([repository, numbers]) => `${repository} ${numbers.join(', ')}`).join('; ')
  return {
    url: items[0].links.issueRadar?.url ?? '/issue-radar',
    exact: false,
    tooltip: `Issue Radar can't take a selection from a link yet, so this opens Issue Radar. Pick these there: ${names}.`,
  }
}

// What the empty state says, for a list with no items.
export function emptyText(list: UntriagedList): { title: string; subtitle: string } {
  const failed = list.repositories.find((row) => row.error)
  if (!list.repositories.length && (list.sources ?? []).length)
    return { title: 'Nothing untriaged', subtitle: 'Items from your intake sources that no trigger rule takes show here.' }
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
