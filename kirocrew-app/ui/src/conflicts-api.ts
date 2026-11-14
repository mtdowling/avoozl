// What the owner can do about each Conflicts item, and how a result changes
// the list without a full reload. Kept free of JSX so node can test it.
import type { ConflictItem, DeliveryItem, Graph, GraphTask } from './views-api.ts'
import { NO_REPOSITORY, planKey, type Option } from './filters.ts'
import { sessionHref } from './task-api.ts'
import type { SettleAction, SettleResult } from './task-api.ts'

// The one conflicts.settle action an item takes, if the page can apply it
// (alone or in bulk). GitHub- and plugin-owned rows are settled where they
// live, except an ended session, which is the page's own record.
export function settleActionOf(item: ConflictItem): SettleAction | null {
  const local = (item.authority ?? 'local') === 'local'
  if (item.kind === 'stale-session' && item.slot) return 'dismiss'
  if (item.kind === 'review') return reviewTargets(item).length ? 'reviewed' : null
  if (!local) return null
  // Status review set by hand: the drawer offers Discuss, Mark done and
  // Back to planned; no settle action fits it.
  if (item.kind === 'needs-human' && item.reason === 'hand-set-review') return null
  if (item.kind === 'needs-human') return item.reason === 'blocked' ? 'unblock' : 'reviewed'
  if (item.kind === 'decision') return 'settle'
  return null
}

export const ACTION_LABELS: Record<SettleAction, string> = {
  reviewed: 'Mark reviewed',
  unblock: 'Unblock',
  dismiss: 'Dismiss',
  settle: 'Settle',
}

// What each action does, for its tooltip. Checked against confirmSettle.
export const ACTION_TIPS: Record<SettleAction, string> = {
  reviewed: 'Count it as reviewed so it may start. Undo by editing it.',
  unblock: 'Return it to planned so it may start when ready.',
  dismiss: 'Remove the ended session from this list. Its chat is kept.',
  settle: 'Clear the decision and note your answer on the task.',
}

export const itemKey = (item: { kind?: string; taskId: string | null; field?: string; slot?: string; id?: string }) =>
  `${item.kind ?? ''}:${item.taskId ?? ''}:${item.field ?? ''}:${item.slot ?? ''}${item.id ? `:${item.id}` : ''}`

// A review group's tasks the page may mark reviewed: GitHub and plugin rows
// are reviewed where they live.
export const reviewTargets = (item: ConflictItem) =>
  (item.tasks ?? []).filter((task) => (task.authority ?? 'local') === 'local').map((task) => ({ taskId: task.id }))

// What conflicts.settle is sent for an item: a review group sends its tasks.
export const settleTargets = (item: ConflictItem): { taskId: string; slot?: string }[] =>
  item.kind === 'review' ? reviewTargets(item) : [item.slot ? { taskId: item.taskId!, slot: item.slot } : { taskId: item.taskId! }]

// How many tasks a selection settles, for the confirm step.
export const settleCount = (items: ConflictItem[]) => items.reduce((n, item) => n + settleTargets(item).length, 0)

// The list after a settle: the settled items of that action leave it.
export function withoutSettled(items: ConflictItem[], action: SettleAction, result: SettleResult): ConflictItem[] {
  const gone = new Set(result.settled.map((entry) => `${entry.taskId}\u0000${entry.slot ?? ''}`))
  const settled = (id: string) => gone.has(`${id}\u0000`)
  return items.flatMap((item) => {
    if (settleActionOf(item) !== action) return [item]
    if (item.kind === 'review') {
      const left = (item.tasks ?? []).filter((task) => !settled(task.id))
      return left.length === (item.tasks ?? []).length ? [item] : left.length ? [reviewGroup(item, left)] : []
    }
    return gone.has(`${item.taskId}\u0000${action === 'dismiss' ? (item.slot ?? '') : ''}`) ? [] : [item]
  })
}

// A review group with fewer tasks left, titled to match.
function reviewGroup(item: ConflictItem, tasks: NonNullable<ConflictItem['tasks']>): ConflictItem {
  const n = tasks.length
  return { ...item, tasks, title: `Review ${n} ${n === 1 ? 'task' : 'tasks'} in ${item.plan ?? 'this spec'}: their design text changed` }
}

// One line for the result: how many were settled, and each refusal's reason.
export function resultMessage(action: SettleAction, result: SettleResult): { ok: boolean; text: string } {
  const done = result.settled.length
  const parts = [done ? `${ACTION_LABELS[action]}: ${done} done.` : '']
  if (result.refused.length)
    parts.push(`Refused ${result.refused.length}: ${result.refused.map((r) => `${r.taskId} (${r.reason})`).join('; ')}`)
  return { ok: result.refused.length === 0, text: parts.filter(Boolean).join(' ') }
}

// What the page says for kinds it cannot change, so no item is only text.
export function noActionReason(item: ConflictItem): string | null {
  if (item.kind === 'github-conflict' && !item.choices?.length)
    return item.field === 'identity'
      ? 'Two issues claim this task. Close or merge the duplicate issue on GitHub; Avoozl reads the result on its next tick.'
      : item.field === 'Avoozl state'
        ? 'Avoozl fills Avoozl state and already wrote its value back. Move the card’s Status instead. This clears when the task’s state next changes.'
        : 'GitHub owns the issue state. Reopen or close it on GitHub; Avoozl reads the result on its next tick.'
  if (item.kind === 'resource') return 'Two active runs share a resource. Stop one run, or wait for one to finish.'
  if (item.kind === 'tracker-conflict') return 'The tracker record owns this field. Change it there or in the spec.'
  if (item.kind === 'content-unavailable')
    return 'Add or fix this rule set’s terms file or plugin on this machine. Avoozl checks again on the next tick.'
  if (item.kind === 'content-match') return null
  // Budget items carry their own actions (Budget.tsx BudgetActions), and
  // so do findings and Ready to merge (ConflictsView.tsx).
  if (item.kind === 'budget' || item.kind === 'over-budget') return null
  if (item.kind === 'investigation' || item.kind === 'ready-to-merge' || item.kind === 'routing-failed' || item.kind === 'branch-landing') return null
  if (item.kind === 'needs-human' && item.reason === 'hand-set-review')
    return 'Discuss it, mark it done, or move it back to planned from the task.'
  if (item.kind === 'review' && settleActionOf(item) === null)
    return 'GitHub or a plugin owns these tasks. Review them where they live.'
  if (settleActionOf(item) === null && item.kind !== 'github-conflict')
    return `${item.authority} owns this task. Settle it where it lives.`
  return null
}

// The Conflicts kinds the Kind filter offers, each with its own test of an
// item. 'all' is the filter's empty choice.
export const CONFLICT_TABS: { key: string; label: string; keep: (item: ConflictItem) => boolean }[] = [
  { key: 'all', label: 'All', keep: () => true },
  { key: 'github-conflict', label: 'GitHub edits', keep: (item) => item.kind === 'github-conflict' },
  { key: 'decision', label: 'Decisions', keep: (item) => ['decision', 'content-match', 'content-unavailable'].includes(item.kind) },
  { key: 'needs-human', label: 'Needs you', keep: (item) => ['needs-human', 'review', 'investigation', 'ready-to-merge', 'routing-failed', 'branch-landing'].includes(item.kind) },
  { key: 'other', label: 'Sessions and resources', keep: (item) => ['stale-session', 'resource', 'tracker-conflict'].includes(item.kind) },
]

export function tabCounts(items: ConflictItem[]): Record<string, number> {
  return Object.fromEntries(CONFLICT_TABS.map((tab) => [tab.key, items.filter(tab.keep).length]))
}

// Why an item needs a person, in one plain line.
export function whyLine(item: ConflictItem): string {
  if (item.kind === 'github-conflict')
    return `${item.changedBy ?? 'Someone'} changed ${item.field ?? 'a managed field'} on GitHub; Avoozl manages it. ${item.detail}`
  if (item.kind === 'needs-human' && item.reason === 'crew') return item.detail
  if (item.kind === 'needs-human' && item.reason === 'hand-set-review') return item.detail
  if (item.kind === 'needs-human')
    return item.reason === 'blocked' ? 'Marked blocked: nothing starts until you unblock it.' : 'New or edited: it waits for your review before it can start.'
  if (item.kind === 'review') return item.detail
  if (item.kind === 'decision') return `An open question stops this task: ${item.detail}`
  if (item.kind === 'stale-session') return `Its chat ended before the task finished. ${item.detail}`
  return item.detail
}

// When the item started, when the view knows.
export const itemTime = (item: ConflictItem & { openedAt?: string | null }) => item.changedAt ?? item.openedAt ?? null

// Bulk resolve takes one action for every selected item; it is offered
// only when they all share it. Settling a decision needs an answer each.
export function bulkAction(items: ConflictItem[]): SettleAction | null {
  const actions = new Set(items.map(settleActionOf))
  if (actions.size !== 1) return null
  const [action] = actions
  return action && action !== 'settle' ? action : null
}

// What the confirm step says before a settle that one click cannot undo.
export function confirmSettle(action: SettleAction, count: number, title?: string) {
  const what = count === 1 && title ? title : `${count} ${action === 'reviewed' ? 'tasks' : 'items'}`
  const body: Record<SettleAction, string> = {
    reviewed: 'They count as reviewed and may start when ready. To undo, edit each task again.',
    unblock: 'They go back to planned and may start when ready.',
    dismiss: 'The ended sessions leave the list. Their chats are not deleted.',
    settle: 'The decision is cleared and your answer is noted on the task.',
  }
  return { title: `${ACTION_LABELS[action]}: ${what}?`, body: body[action], action: ACTION_LABELS[action] }
}

// Each task's newest live chat (worker first), as a link to attach to.
export function liveChats(items: DeliveryItem[]): Map<string, string> {
  const ended = new Set(['closed', 'lost'])
  const out = new Map<string, string>()
  for (const item of items) {
    const live = item.sessions.filter((s) => !ended.has(s.status ?? '')).sort((a, b) => (a.role === 'worker' ? -1 : 0) - (b.role === 'worker' ? -1 : 0) || b.attempt - a.attempt)
    if (live[0]) out.set(item.id, sessionHref(live[0]))
  }
  return out
}

// The Conflicts filter: kind next to the task filters that fit an item.
export interface ConflictFilter {
  q?: string
  kind?: string
  plan?: string
  epic?: string
  repository?: string
  // An AGES value: only items older than that.
  age?: string
  changedBy?: string
}

const DAY = 24 * 60 * 60 * 1000
export const AGES: { value: string; label: string; ms: number }[] = [
  { value: '1d', label: 'Older than a day', ms: DAY },
  { value: '7d', label: 'Older than a week', ms: 7 * DAY },
  { value: '30d', label: 'Older than 30 days', ms: 30 * DAY },
]

// The task an item's filters read: its own, or a review group's first (a
// group's tasks share a plan).
export const conflictTaskId = (item: ConflictItem) => item.taskId ?? item.tasks?.[0]?.id ?? null

const repositoryOf = (item: ConflictItem, task: GraphTask | undefined) => item.issue?.repository ?? task?.repository ?? null

export function matchesConflict(item: ConflictItem, filter: ConflictFilter, task: GraphTask | undefined, now: number): boolean {
  const text = filter.q?.trim().toLowerCase() ?? ''
  const kind = CONFLICT_TABS.find((t) => t.key === filter.kind)
  const age = AGES.find((a) => a.value === filter.age)
  const time = itemTime(item as ConflictItem & { openedAt?: string | null })
  const repository = repositoryOf(item, task)
  return (
    (!text ||
      item.title.toLowerCase().includes(text) ||
      (item.taskId ?? '').toLowerCase().includes(text) ||
      item.detail.toLowerCase().includes(text)) &&
    (!kind || kind.keep(item)) &&
    (!filter.plan || (task ? planKey(task) : null) === filter.plan) &&
    (!filter.epic || task?.epic === filter.epic) &&
    (!filter.repository || (filter.repository === NO_REPOSITORY ? !repository : repository === filter.repository)) &&
    (!age || (time !== null && now - Date.parse(time) > age.ms)) &&
    (!filter.changedBy || item.changedBy === filter.changedBy)
  )
}

// Each control's choices, from the items and the tasks they name. Kinds
// carry their count over the whole list.
export function conflictChoices(items: ConflictItem[], graph: Graph | null) {
  const tasks = new Map((graph?.tasks ?? []).map((t) => [t.id, t]))
  const epicTitles = new Map((graph?.epics ?? []).map((e) => [e.id, e.title]))
  const counts = tabCounts(items)
  const distinct = (pick: (item: ConflictItem) => string | null | undefined, label: (value: string) => string = (v) => v): Option[] => {
    const seen = new Set<string>()
    for (const item of items) {
      const value = pick(item)
      if (value) seen.add(value)
    }
    return [...seen].map((value) => ({ value, label: label(value) })).sort((a, b) => a.label.localeCompare(b.label))
  }
  const task = (item: ConflictItem) => tasks.get(conflictTaskId(item) ?? '')
  return {
    kinds: CONFLICT_TABS.filter((t) => t.key !== 'all').map((t) => ({ value: t.key, label: `${t.label} (${counts[t.key]})` })),
    plans: distinct((item) => { const t = task(item); return t ? planKey(t) : null }, (value) => value.replace(/^(spec|plan):/, '')),
    epics: distinct((item) => task(item)?.epic, (value) => epicTitles.get(value) ?? value),
    repositories: [
      ...distinct((item) => repositoryOf(item, task(item))),
      ...(items.some((item) => !repositoryOf(item, task(item))) ? [{ value: NO_REPOSITORY, label: 'No repository' }] : []),
    ],
    ages: AGES.map(({ value, label }) => ({ value, label })),
    changedBy: distinct((item) => item.changedBy),
  }
}

// Saved per workspace beside the task filter, under its own key.
export const CONFLICT_FILTER_EVENT = 'avoozl-conflict-filter'
const filterKey = (workspaceId: string) => `avoozl.conflict-filters.${workspaceId}`
const FILTER_FIELDS = ['q', 'kind', 'plan', 'epic', 'repository', 'age', 'changedBy'] as const

export function readConflictFilter(storage: Pick<Storage, 'getItem'> | null, workspaceId: string): ConflictFilter {
  try {
    const value = JSON.parse(storage?.getItem(filterKey(workspaceId)) ?? 'null')
    if (!value || typeof value !== 'object') return {}
    const out: ConflictFilter = {}
    for (const name of FILTER_FIELDS) if (typeof value[name] === 'string' && value[name]) out[name] = value[name]
    if (out.kind && !CONFLICT_TABS.some((t) => t.key === out.kind && t.key !== 'all')) delete out.kind
    if (out.age && !AGES.some((a) => a.value === out.age)) delete out.age
    return out
  } catch {
    return {}
  }
}

export function writeConflictFilter(storage: Pick<Storage, 'setItem'> | null, workspaceId: string, filter: ConflictFilter): void {
  try {
    storage?.setItem(filterKey(workspaceId), JSON.stringify(filter))
  } catch {
    // Storage may be full or blocked; the filter still works for this visit.
  }
}

export const conflictFilterActive = (filter: ConflictFilter) => FILTER_FIELDS.some((name) => Boolean(filter[name]?.trim()))
