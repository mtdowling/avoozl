// The Dashboard's summary of one workspace, from the reads the other tabs
// already make: graph.view, delivery.view, conflicts.view and plan.list.
// Only graph-specific facts: Issue Radar shows issues, pull requests and CI,
// so those are not repeated here. Kept free
// of JSX so node can test it directly.
import type { BudgetChip } from './budget-api.ts'
import type { StoredPlanPage } from './plans-api.ts'
import { nodeState, waves, type NodeState } from './graph-layout.ts'
import { modelLabel, safeHref, type RadarClaim, type RadarCrews, type ConflictItem, type DeliveryItem, type DeliverySession, type Graph, type GraphTask } from './views-api.ts'

// Session statuses after which a session will not move again.
const ENDED = new Set(['closed', 'lost'])

export interface Attention {
  key: string
  kind: string
  // Null for a review group, which carries its tasks in `group`.
  taskId: string | null
  group?: ConflictItem
  title: string
  detail: string
  // Where the owner acts: the tab with the buttons, and a link out if any.
  tab: 'conflicts' | 'delivery'
  href: string | null
}

// What a Needs you title opens: a review group's list of tasks, the task's
// drawer (it shows the task's conflicts and decisions), or, for an item
// with no task, the tab where it is settled.
export type AttentionTarget = { kind: 'review' } | { kind: 'task'; id: string } | { kind: 'tab'; tab: Attention['tab'] }

export function attentionTarget(item: Attention): AttentionTarget {
  if (item.group) return { kind: 'review' }
  if (item.taskId) return { kind: 'task', id: item.taskId }
  return { kind: 'tab', tab: item.tab }
}

// The title link's tooltip: where the click goes.
export function attentionTip(item: Attention): string {
  const target = attentionTarget(item)
  if (target.kind === 'review') return 'Open the list of tasks to review'
  if (target.kind === 'task') return `Open ${target.id} in the drawer`
  return target.tab === 'conflicts' ? 'Open it in Conflicts' : 'Open it in Delivery'
}

export interface RunningTask {
  id: string
  title: string
  sessions: DeliverySession[]
}

// One running agent chat Avoozl started, for the Dashboard's In flight card.
export interface InFlight {
  slot: string
  role: string
  // A reviewer's focus or another session title, when the session has one.
  focus: string | null
  taskId: string
  title: string
  epic: string | null
  attempt: number
  model: string | null
  startedAt: string | null
  lastAt: string | null
  status: string | null
  session: DeliverySession
  // Spend against the cap (§4.17).
  budget: BudgetChip | null
}

export interface Progress {
  // An epic across plans; null is No epic (Requirement 59.10).
  epic: string | null
  title: string
  done: number
  total: number
  // Avoozl chats running for this epic's tasks now (worker, checks,
  // reviewer, planner).
  running: number
}

export interface DashboardSummary {
  attention: Attention[]
  counts: Record<NodeState, number>
  running: RunningTask[]
  inFlight: InFlight[]
  // Issue Radar crews with a live claim, from GitHub, on any machine.
  radarFlight: RadarClaim[]
  // What GitHub cannot show about them; empty when nothing was read.
  radarUnseen: string[]
  // Open tasks at or past their cap (§4.17), for the header count.
  overBudget: number
  // True only when the delivery read worked and no task has ever run, been
  // reviewed, integrated or completed (no session, evidence or integration
  // on any item). Gates the Start demo button; an unread list is false.
  neverRan: boolean
  readyNext: (GraphTask & { wave: number })[]
  progress: Progress[]
  plans: { approved: number; draft: number; total: number }
}

const issueHref = (owner: { issue?: { url: string | null } | null }) => safeHref(owner.issue?.url ?? null)

// A delivery the owner must act on: Avoozl stopped it after its retries.
// A failed attempt with retries left retries on its own, so it is not here.
function deliveryTrouble(item: DeliveryItem): string | null {
  if (item.complete) return null
  if (item.deliveries.some((d) => d.state === 'decision')) return 'Stopped after its retries; retry it or dismiss the findings.'
  return null
}

export function summarize(input: {
  graph: Graph | null
  delivery: DeliveryItem[] | null
  conflicts: ConflictItem[] | null
  plans: StoredPlanPage | null
  radar?: RadarCrews | null
  limit?: number
}): DashboardSummary {
  const limit = input.limit ?? 8
  // Archived plans' work is hidden here (Show archived is a Graph and
  // Delivery filter). Live chats under them still show in In flight, so a
  // running agent is never out of sight.
  const graph = input.graph && { ...input.graph, tasks: input.graph.tasks.filter((t) => !t.planArchived) }
  const allDelivery = input.delivery
  input = {
    ...input,
    delivery: input.delivery && input.delivery.filter((item) => !item.planArchived),
    conflicts: input.conflicts && input.conflicts.filter((item) => !item.planArchived),
  }
  const leaves = (graph?.tasks ?? []).filter((t) => t.kind === 'leaf')
  const counts: Record<NodeState, number> = { ready: 0, running: 0, waiting: 0, 'needs-you': 0, done: 0, deferred: 0 }
  // Running counts the same thing In flight lists: an open task with a live
  // session. A task drawn running with none needs the owner instead.
  const liveTasks = new Set(
    (allDelivery ?? []).filter((item) => !item.complete && item.sessions.some((s) => !ENDED.has(s.status ?? ''))).map((item) => item.id),
  )
  for (const task of leaves) {
    const state = nodeState(task)
    counts[state === 'done' ? 'done' : liveTasks.has(task.id) ? 'running' : state === 'running' ? 'needs-you' : state] += 1
  }

  const attention: Attention[] = []
  const seen = new Set<string>()
  const push = (entry: Attention) => {
    if (seen.has(entry.key)) return
    seen.add(entry.key)
    attention.push(entry)
  }
  for (const item of input.delivery ?? []) {
    const trouble = deliveryTrouble(item)
    if (trouble)
      push({ key: `delivery:${item.id}`, kind: 'delivery', taskId: item.id, title: item.title, detail: trouble, tab: 'delivery', href: issueHref(item) })
  }
  // A manual task once its blockers hold (R61.11): a person's step, tagged
  // Manual, in the same Needs you list.
  for (const task of leaves)
    if (task.needsYou?.manual && nodeState(task) === 'needs-you')
      push({ key: `manual:${task.id}`, kind: 'manual', taskId: task.id, title: task.title, detail: task.needsYou.reason, tab: 'delivery', href: null })
  // Decisions and GitHub conflicts first, then the rest in view order.
  const rank = (kind: string) => ['decision', 'github-conflict', 'stale-session'].indexOf(kind) >>> 0
  for (const item of [...(input.conflicts ?? [])].sort((a, b) => rank(a.kind) - rank(b.kind)))
    push({
      key: `${item.kind}:${item.taskId ?? item.id ?? ''}:${item.field ?? ''}`,
      kind: item.kind,
      taskId: item.taskId,
      ...(item.kind === 'review' ? { group: item } : {}),
      title: item.title,
      detail: item.detail,
      tab: 'conflicts',
      href: issueHref(item),
    })

  const running = (allDelivery ?? [])
    .filter((item) => !item.complete)
    .map((item) => ({ id: item.id, title: item.title, budget: item.budget ?? null, sessions: item.sessions.filter((s) => !ENDED.has(s.status ?? '')) }))
    .filter((item) => item.sessions.length > 0)

  const tasks = new Map((graph?.tasks ?? []).map((t) => [t.id, t]))
  const epicTitles = new Map((graph?.epics ?? []).map((e) => [e.id, e.title]))
  const inFlight: InFlight[] = running
    .flatMap((item) =>
      item.sessions.map((session) => {
        const epic = tasks.get(item.id)?.epic ?? null
        return {
          slot: session.slot,
          role: session.role,
          focus: session.title,
          taskId: item.id,
          title: item.title,
          epic: epic ? (epicTitles.get(epic) ?? epic) : null,
          attempt: session.attempt,
          model: modelLabel(session),
          startedAt: session.boundAt,
          lastAt: session.statusAt ?? session.boundAt,
          status: session.status,
          session,
          budget: item.budget,
        }
      }),
    )
    .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))

  const wave = graph ? waves(graph) : new Map<string, number>()
  // The tick's own dispatch order (graph.view `order`: start-now, rank,
  // graph order); an older backend without it falls back to wave.
  const readyNext = leaves
    .filter((t) => nodeState(t) === 'ready')
    .map((t) => ({ ...t, wave: wave.get(t.id) ?? 1 }))
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.wave - b.wave || a.id.localeCompare(b.id))

  const titles = new Map((graph?.epics ?? []).map((e) => [e.id, e.title]))
  const chats = new Map<string, number>()
  for (const row of inFlight) {
    const epic = tasks.get(row.taskId)?.epic
    if (epic) chats.set(epic, (chats.get(epic) ?? 0) + 1)
  }
  // One row per epic, counting the tasks of all its member plans, in the
  // backend's epic order, then No epic.
  const byEpic = new Map<string | null, Progress>()
  for (const epic of graph?.epics ?? []) byEpic.set(epic.id, { epic: epic.id, title: epic.title, done: 0, total: 0, running: chats.get(epic.id) ?? 0 })
  let none = 0
  for (const task of leaves) {
    const key = task.epic && titles.has(task.epic) ? task.epic : null
    if (key === null) none += 1
    const entry = byEpic.get(key) ?? { epic: null, title: 'No epic', done: 0, total: 0, running: 0 }
    entry.total += 1
    if (nodeState(task) === 'done') entry.done += 1
    byEpic.set(key, entry)
  }
  for (const [key, entry] of byEpic) if (!entry.total || (key === null && !none)) byEpic.delete(key)

  const stored = (input.plans?.items ?? []).filter((p) => !p.archivedAt)
  const archivedPlans = (input.plans?.items ?? []).length - stored.length
  return {
    attention,
    counts,
    running,
    inFlight,
    radarFlight: input.radar?.rows ?? [],
    radarUnseen: input.radar?.unseen ?? [],
    neverRan: input.delivery != null && !input.delivery.some((item) => item.complete || item.sessions.length > 0 || item.evidence.length > 0 || item.deliveries.length > 0 || item.integration),
    overBudget: (input.delivery ?? []).filter((item) => !item.complete && item.budget?.reached).length,
    readyNext,
    progress: [...byEpic.values()],
    plans: {
      approved: stored.filter((p) => p.state === 'approved').length,
      draft: stored.filter((p) => p.state === 'draft').length,
      total: (input.plans?.total ?? stored.length + archivedPlans) - archivedPlans,
    },
  }
}

// How the Dashboard heading row lays out its state buttons, by width:
// wide (≥1024 px) shares the title's line, pushed right; medium takes its
// own line under the title, right-aligned and wrapping with even gaps;
// small (≤480 px) is an even two-column grid of 32 px tall buttons whose
// labels shorten before a long count can push the row.
export type CountsLayout = 'wide' | 'medium' | 'small'
export const SMALL = '(max-width: 480px)'

export function countsLayout(wide: boolean, small: boolean): CountsLayout {
  return small ? 'small' : wide ? 'wide' : 'medium'
}

export function countsStyles(layout: CountsLayout) {
  if (layout === 'small')
    return {
      list: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, width: '100%' },
      button: { minHeight: 32, width: '100%', justifyContent: 'space-between' },
    }
  return {
    list: {
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: 6,
      ...(layout === 'medium' ? { width: '100%' } : { marginLeft: 'auto' }),
    },
    // 8 px sides, not 10, so the title, count, Refresh and all six buttons
    // fit one line at 1024 px.
    button: { minHeight: 26, paddingInline: 8 },
  } as const
}
