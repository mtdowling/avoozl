// The Issues and Pull requests pages and the Triage agent page
// (triage-agent TA5, TA6, TA8): their reads, their actions, and the pure
// helpers the pages draw with. Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export type ItemKind = 'issue' | 'pr'

export interface CheckCounts {
  failed: number
  passed: number
  skipped: number
  pending: number
}

export interface PullCounts {
  files: number
  additions: number
  deletions: number
  checks: CheckCounts
  reviewDecision?: string | null
  reviewers?: string[]
}

export interface ItemRow {
  repository: string
  number: number
  kind: ItemKind
  title: string
  author: string | null
  state: 'open' | 'closed'
  labels: string[]
  assignees: string[]
  createdAt: string | null
  updatedAt: string | null
  url: string | null
  draft: boolean
  counts: PullCounts | null
  class: string | null
  result: string | null
  owner: { reason: string; kind: string } | null
  snoozed: string | null
}

export interface ItemList {
  kind: ItemKind | 'all'
  total: number
  items: ItemRow[]
  labels: string[]
  repositories: string[]
  ownerQueue: number
}

export interface RunView {
  id: string
  repository: string
  number: number
  kind: ItemKind
  title: string | null
  url: string | null
  state: string
  why: string
  class: string | null
  reason: string | null
  outcome: string | null
  writes: { kind: string; state: string; reason?: string; partial?: boolean }[]
  queuedAt: string
  finishedAt: string | null
}

export interface TimelineEntry {
  kind: string
  at: string | null
  by: string | null
  body?: string
  state?: string
  label?: string
}

export interface ItemDetail {
  repository: string
  kind: ItemKind
  number: number
  title: string
  body: string
  url: string | null
  state: 'open' | 'closed'
  author: string | null
  firstTime: boolean
  labels: string[]
  assignees: string[]
  timeline: TimelineEntry[]
  createdAt: string | null
  updatedAt: string | null
  merged?: boolean
  draft?: boolean
  base?: string | null
  branch?: string | null
  head?: string | null
  counts?: PullCounts
  reviewers?: { login: string; state: string }[]
  files?: string[]
  triage: {
    class: string | null
    reason: string | null
    owner: { reason: string; kind: string } | null
    suggested: string[]
    draft: { kind: 'answer' | 'review'; body: string; comments?: unknown[] } | null
    asked: { at: string } | null
    note: string | null
    runs: RunView[]
    result: string | null
  }
  actions: string[]
  history: { action: string; at: string; by: string | null }[]
}

export interface TriageRepository {
  repository: string
  on: boolean
  paused: boolean
  hold: string | null
  cap: number
  left: number
  used: number
  settings: { agent: string; existing: string; dailyRuns: number; fullReviewMaxLines: number; labels: string; reviews: string }
}

export interface TriageView {
  stopAll: string | null
  repositories: TriageRepository[]
  inProgress: RunView[]
  runs: RunView[]
  days: { day: string; runs: number; byClass: Record<string, number>; byState: Record<string, number> }[]
  calls: { day: string; rest: number; notModified: number; graphql: number; writes: number }
  rate: { limit: number; remaining: number; resetAt: string } | null
  ownerQueue: number
}

export interface ListFilter {
  repository?: string
  state?: 'open' | 'closed' | 'all'
  owner?: boolean
  mine?: boolean
  assigned?: boolean
  review?: boolean
  label?: string
  q?: string
  sort?: 'number' | 'updated'
}

export function itemsClient(api: AppApi) {
  const call = async <T>(operation: string, workspaceId: string, input: Record<string, unknown>) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation, workspaceId, input })).result
  return {
    list: (workspaceId: string, kind: ItemKind | 'all', filter: ListFilter = {}) => call<ItemList>('items.list', workspaceId, { kind, ...filter }),
    detail: (workspaceId: string, repository: string, number: number) => call<ItemDetail>('items.detail', workspaceId, { repository, number }),
    act: (workspaceId: string, repository: string, number: number, action: string, extra: Record<string, unknown> = {}) =>
      call<Record<string, unknown>>('items.act', workspaceId, { repository, number, action, ...extra }),
    adoptSpec: (workspaceId: string, repository: string, number: number) => call<unknown>('specpr.adopt', workspaceId, { repository, number }),
    view: (workspaceId: string) => call<TriageView>('triage.view', workspaceId, {}),
    control: (workspaceId: string, action: 'pause' | 'resume' | 'stop' | 'start', repository?: string) =>
      call<unknown>(`triage.${action}`, workspaceId, repository ? { repository } : {}),
    settings: (workspaceId: string, repository: string, change: Record<string, unknown>) => call<unknown>('triage.settings', workspaceId, { repository, ...change }),
    settle: (workspaceId: string, repository: string, number: number) => call<unknown>('triage.owner.done', workspaceId, { repository, number }),
  }
}

// "3 failed · 12 passed · 1 skipped", leaving out the zeros.
export function checksLine(checks: CheckCounts | null | undefined): string {
  if (!checks) return ''
  const parts = [
    checks.failed ? `${checks.failed} failed` : '',
    checks.pending ? `${checks.pending} running` : '',
    checks.passed ? `${checks.passed} passed` : '',
    checks.skipped ? `${checks.skipped} skipped` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'No checks'
}

// "4 files · +120 −8".
export function changeLine(counts: PullCounts | null | undefined): string {
  if (!counts) return ''
  return `${counts.files} ${counts.files === 1 ? 'file' : 'files'} · +${counts.additions} −${counts.deletions}`
}

export const CLASS_LABELS: Record<string, string> = {
  question: 'Question',
  bug: 'Bug',
  optimization: 'Optimization',
  feature: 'Feature',
  'pull-request': 'Pull request',
  unclear: 'Unclear',
}

// What the agent's last run came to, in a word or two.
export const RESULT_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  finished: 'Finishing',
  done: 'Done',
  held: 'Held for you',
  stopped: 'Stopped',
  failed: 'Failed',
}

export function agentLine(row: Pick<ItemRow, 'class' | 'result' | 'owner'>): string {
  if (row.owner) return `Needs you: ${row.owner.reason}`
  if (!row.class && !row.result) return 'Not looked at yet'
  return [row.class ? (CLASS_LABELS[row.class] ?? row.class) : null, row.result ? (RESULT_LABELS[row.result] ?? row.result) : null].filter(Boolean).join(' · ')
}

// Each action's button label and what it does.
export const ACTIONS: Record<string, { label: string; tip: string; person?: boolean }> = {
  fix: { label: 'Fix', tip: 'Start one change from this issue. Starting it approves it; it lands like any task.' },
  answer: { label: 'Answer', tip: "Edit the agent's draft answer, then post it as a comment." },
  spec: { label: 'Make this a spec', tip: 'Send this issue to the planner, which writes a draft spec. Nothing is approved.' },
  again: { label: 'Run triage again', tip: 'Have the agent look at this item once more.' },
  assign: { label: 'Assign to me', tip: 'Assign this issue to your GitHub login.' },
  labels: { label: 'Edit labels', tip: 'Add or remove labels the repository has.' },
  snooze: { label: 'Snooze', tip: 'Hide this from the list for a day.' },
  close: { label: 'Close', tip: 'Close it on GitHub, with a reason.', person: true },
  review: { label: 'Review', tip: "Run the agent's review again." },
  editReview: { label: 'Edit review', tip: "Edit the agent's draft review and its line comments, then post it." },
  approve: { label: 'Approve', tip: 'Approve this pull request as yourself.', person: true },
  requestChanges: { label: 'Request changes', tip: 'Ask the author for changes, as yourself.', person: true },
  comment: { label: 'Comment', tip: 'Post a comment as yourself.' },
  reviewAsSpec: { label: 'Review as spec', tip: 'This pull request only changes a spec: review it on the spec page.' },
}

// An age like "3 d" or "5 h" from an ISO time.
export function ageOf(at: string | null | undefined, now = Date.now()): string {
  const ms = at ? now - Date.parse(at) : NaN
  if (!Number.isFinite(ms)) return ''
  const minutes = Math.max(0, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.round(hours / 24)} d`
}

// The page's count of GitHub calls today, by kind.
export function callsLine(calls: TriageView['calls']): string {
  return `${calls.rest} REST (${calls.notModified} unchanged, free) · ${calls.graphql} GraphQL · ${calls.writes} writes`
}

export const itemKey = (row: Pick<ItemRow, 'repository' | 'number'>) => `${row.repository}#${row.number}`
