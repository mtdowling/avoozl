// The Activity tab's calls and pure helpers (design §4.19, R71): the
// activity log (activity.list) read 100 rows a page, newest first, its saved
// filter, and the Keep activity setting. Kept free of JSX so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { safeHref } from './views-api.ts'
import { githubItemOf, githubRepository, githubUrl, githubUserUrl, knownRepository, type GithubRef } from './github-links.ts'

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
  // The GitHub owner/name the row's links use: its task's repository, else
  // the workspace's only one. Null with no GitHub remote.
  repository?: string | null
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
  // The workspace's GitHub repositories, from settings. Only these link.
  repositories?: string[]
}

interface ActivitySettings {
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
interface ActivityChoice {
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

// A row's summary as text and GitHub links. Rows hold Avoozl's own
// summaries; each rule below finds a number, SHA, branch, check or login in
// one, and the link is built for the row's known repository (or an
// owner/name the workspace has), never from the text's own URL. A row with
// no known repository, or a redacted one, stays text. No call to GitHub.
interface ActivityPart {
  text: string
  href?: string
}

type Rule = { pattern: RegExp; ref: (groups: Record<string, string>, row: ActivityRow, known: string[]) => [string | null, GithubRef] | string | null }

const NAME = String.raw`[\w.-]+\/[\w.-]*[\w-]`
const BRANCH = String.raw`\w(?:[\w./-]*[\w-])?`
// Kinds whose summary says "on <branch>" (spec-ticks, plan approval).
const BRANCH_KINDS = /^(?:task\.ticked|plan\.approved|worker\.released)$/
const at = (repository: string | null | undefined, ref: GithubRef): [string | null, GithubRef] => [repository ?? null, ref]
const RULES: Rule[] = [
  // owner/repo#12: the intake row says "New pr ..." for a pull request.
  {
    pattern: new RegExp(`(?<![\\w/])(?<x>(?<repo>${NAME})#(?<n>\\d+))`, 'dg'),
    ref: (g, row, known) => at(knownRepository(g.repo, known), { kind: row.summary.startsWith('New pr ') ? 'pull' : 'issue', number: Number(g.n) }),
  },
  { pattern: /\b[Cc]heck (?<x>[\w.:-]+) [^#]*?pull request #(?<n>\d+)/dg, ref: (g, row) => at(row.repository, { kind: 'checks', number: Number(g.n) }) },
  { pattern: /(?<x>\b(?:pull request|PR) #(?<n>\d+))/dg, ref: (g, row) => at(row.repository, { kind: 'pull', number: Number(g.n) }) },
  { pattern: /(?<x>\b[Ii]ssue #(?<n>\d+))/dg, ref: (g, row) => at(row.repository, { kind: 'issue', number: Number(g.n) }) },
  // A bare #12: GitHub sends /issues/N for a pull request on to /pull/N.
  { pattern: /(?<![\w/#])(?<x>#(?<n>\d+))\b/dg, ref: (g, row) => at(row.repository, { kind: 'issue', number: Number(g.n) }) },
  { pattern: /\b(?:commit|at) (?<x>[0-9a-f]{7,40})\b/dg, ref: (g, row) => at(row.repository, { kind: 'commit', sha: g.x }) },
  { pattern: new RegExp(`\\bbranch (?<x>${BRANCH})`, 'dg'), ref: (g, row) => at(row.repository, { kind: 'branch', ref: g.x }) },
  { pattern: new RegExp(`\\bon (?<x>${BRANCH})`, 'dg'), ref: (g, row) => (BRANCH_KINDS.test(row.kind) ? at(row.repository, { kind: 'branch', ref: g.x }) : null) },
  { pattern: new RegExp(`(?<![\\w./-])(?<x>${NAME})(?![\\w/#-])`, 'dg'), ref: (g, _row, known) => at(knownRepository(g.x, known), { kind: 'repo' }) },
  { pattern: /\bsigned in as (?<x>[A-Za-z0-9-]+)/dg, ref: (g) => (g.x === 'unknown' ? null : githubUserUrl(g.x)) },
]

// The Who cell's link: a GitHub row's actor is a GitHub login. A token row
// may name its provider there instead, so it links from its summary only.
// A workspace with no GitHub repository links nothing.
export const actorHref = (row: Pick<ActivityRow, 'source' | 'kind' | 'actor' | 'redacted'>, known: string[] = []) =>
  known.length && row.source === 'github' && row.kind !== 'github.token' && !row.redacted ? githubUserUrl(row.actor) : null

export function activityParts(row: ActivityRow, known: string[] = []): ActivityPart[] {
  const summary = row.summary
  if (row.redacted || !known.length) return [{ text: summary }]
  const own = row.repository ? knownRepository(githubRepository(row.repository) ?? '', known) : null
  const subject = { ...row, repository: own }
  const found: { start: number; end: number; href: string }[] = []
  const actor = actorHref(row, known)
  if (actor && row.actor && summary.startsWith(`${row.actor} `)) found.push({ start: 0, end: row.actor.length, href: actor })
  for (const rule of RULES)
    for (const match of summary.matchAll(rule.pattern)) {
      const made = rule.ref(match.groups ?? {}, subject, known)
      const href = typeof made === 'string' || made === null ? made : githubUrl(made[0], made[1])
      const span = match.indices?.groups?.x
      if (href && span) found.push({ start: span[0], end: span[1], href })
    }
  found.sort((a, b) => a.start - b.start || b.end - a.end)
  const parts: ActivityPart[] = []
  let cursor = 0
  for (const link of found) {
    if (link.start < cursor) continue
    if (link.start > cursor) parts.push({ text: summary.slice(cursor, link.start) })
    parts.push({ text: summary.slice(link.start, link.end), href: link.href })
    cursor = link.end
  }
  if (cursor < summary.length) parts.push({ text: summary.slice(cursor) })
  // A task row's Target opens the drawer, so its pull request or issue
  // link, when it has one, follows the summary.
  const item = row.task ? githubItemOf(row.link, known) : null
  const href = item && githubUrl(item.repository, { kind: item.kind, number: item.number })
  if (href && !parts.some((part) => part.href === href)) parts.push({ text: ' · ' }, { text: `${item.repository === own ? '' : item.repository}#${item.number}`, href })
  return parts
}

// Where a row's target goes: the task drawer for a task, a GitHub pull
// request or issue of a known repository, any other https link, or nowhere.
// A GitHub link to a repository the workspace does not have stays text.
export function rowTarget(row: ActivityRow, known: string[] = []): { kind: 'task'; id: string } | { kind: 'link'; href: string } | null {
  if (row.targetId && row.task) return { kind: 'task', id: row.targetId }
  if (row.redacted) return null
  const item = githubItemOf(row.link, known)
  if (item) {
    const href = githubUrl(item.repository, { kind: item.kind, number: item.number })
    return href ? { kind: 'link', href } : null
  }
  const href = safeHref(row.link)
  return href && href.startsWith('https:') && new URL(href).hostname !== 'github.com' ? { kind: 'link', href } : null
}

// The Keep activity field: blank keeps the default; otherwise 1–365 days.
export function retentionInput(text: string): { days: number | null; error?: string } {
  const value = text.trim()
  if (!value) return { days: null }
  const days = Number(value)
  if (!Number.isInteger(days) || days < 1 || days > MAX_RETENTION_DAYS) return { days: null, error: `Use a whole number of days, 1–${MAX_RETENTION_DAYS}.` }
  return { days }
}

const KEEP_SAVE_DELAY_MS = 800

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
