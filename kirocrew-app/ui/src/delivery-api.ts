// Swim lanes for the Delivery tab: one lane per delivery state, from the
// delivery and graph reads. Kept free of JSX so node can test it directly.
import { documentEpic, nodeState, waves, type NodeState } from './graph-layout.ts'
import { matches, type TaskFilter } from './filters.ts'
import type { DeliveryItem, DeliverySession, Graph, GraphTask } from './views-api.ts'

export type LaneId = 'ready' | 'running' | 'reviewing' | 'needs-you' | 'waiting' | 'done'

// The lanes the Delivery tab draws, each with its tint. Running and
// reviewing work share one In progress lane, grouped inside it. Done work is
// not a lane: the Dashboard lists it under Recently done. No lane uses the
// warning (yellow) color: that means "needs you".
export type DrawnLaneId = 'ready' | 'in-progress' | 'needs-you' | 'waiting' | 'done'
export const LANES: { id: DrawnLaneId; label: string; tint: string }[] = [
  { id: 'ready', label: 'Ready', tint: 'var(--accent)' },
  { id: 'in-progress', label: 'In progress', tint: 'var(--tile-purple, var(--accent))' },
  { id: 'needs-you', label: 'Needs you', tint: 'var(--danger)' },
  { id: 'waiting', label: 'Blocked or waiting', tint: 'var(--muted)' },
]

// The groups inside the In progress lane, in order, each with its cards.
export const PROGRESS_GROUPS: { id: 'running' | 'reviewing'; label: string }[] = [
  { id: 'running', label: 'Running' },
  { id: 'reviewing', label: 'Reviewing' },
]

// The cards a drawn lane holds: In progress is running then reviewing.
export function drawnLane(lanes: Record<LaneId, LaneCard[]>, id: DrawnLaneId): LaneCard[] {
  return id === 'in-progress' ? [...lanes.running, ...lanes.reviewing] : lanes[id]
}

// In progress's groups with their cards; a group with none is left out.
export function progressGroups(lanes: Record<LaneId, LaneCard[]>) {
  return PROGRESS_GROUPS.map((group) => ({ ...group, cards: lanes[group.id] })).filter((group) => group.cards.length)
}

// The narrowest a lane gets before the row wraps to fewer lanes.
export const LANE_MIN_WIDTH = 320

// A lane's background: a little of its tint over the card color, so text in
// var(--text) stays readable in light and dark themes.
export const laneBackground = (tint: string) => `color-mix(in srgb, ${tint} 8%, var(--card, transparent))`

// Session statuses after which a session will not move again.
const ENDED = new Set(['closed', 'lost'])

export interface LaneCard {
  id: string
  title: string
  epic: string | null
  // For filtering: the epic's ID, the task's repository and plan.
  epicId: string | null
  repository: string | null
  planId: string | null
  spec: string | null
  // The shared filter's view of the card: its state and wave.
  state: NodeState
  wave: number
  decision: string | null
  authority: string
  route: string | null
  issue: GraphTask['issue']
  // The delivery record, when the task has one; a ready leaf may not.
  item: DeliveryItem | null
  attempt: number | null
  sessions: DeliverySession[]
  reviewRounds: number
  // `task_deliveries.state` (running, done, verified, decision, failed, integrated).
  deliveryState: string | null
  deferred: boolean
  // Waits for review: its own plan text changed, or it is new.
  review: boolean
  // Status review with nothing behind it: no review to show or attach to.
  handSetReview: boolean
  noSession: string | null
  nextAction: string | null
  // The archived plan it belongs to, or null; hidden unless Show archived.
  planArchived: string | null
  at: string | null
}

const deliveryState = (item: DeliveryItem | null) => {
  const states = (item?.deliveries ?? []).map((d) => d.state).filter((s): s is string => typeof s === 'string')
  return states.at(-1) ?? null
}

function newest(item: DeliveryItem | null): string | null {
  if (!item) return null
  return (
    [
      item.integration?.at,
      ...item.sessions.map((s) => s.statusAt ?? s.boundAt),
      ...item.evidence.map((e) => e.at),
      ...item.deliveries.map((d) => (typeof d.updatedAt === 'string' ? d.updatedAt : null)),
    ]
      .filter((t): t is string => typeof t === 'string')
      .sort()
      .at(-1) ?? null
  )
}

// Which lane a task is in. Needs-you wins, then done, then review, then a
// live session, then readiness.
export function laneOf(task: GraphTask | null, item: DeliveryItem | null): LaneId {
  const state = deliveryState(item)
  const live = (item?.sessions ?? []).filter((s) => !ENDED.has(s.status ?? ''))
  if (state === 'decision' || item?.needsYou || (task && nodeState(task) === 'needs-you' && !item?.complete)) return 'needs-you'
  if (item?.complete || (task && nodeState(task) === 'done')) return 'done'
  if (
    state === 'done' ||
    state === 'verified' ||
    (item?.status === 'review' && !item.handSetReview) ||
    live.some((s) => s.role !== 'worker') ||
    item?.githubReviews?.state === 'pending'
  )
    return 'reviewing'
  if (live.length || state === 'running' || state === 'failed' || (item?.status === 'running' && !item.handSetReview)) return 'running'
  if (task && nodeState(task) === 'ready') return 'ready'
  return 'waiting'
}

// A card's state for the shared filter: its lane, with Waiting split into
// waiting and deferred the way the Graph draws them.
function cardState(lane: LaneId, task: GraphTask | null): NodeState {
  if (lane === 'running' || lane === 'reviewing') return 'running'
  if (lane === 'waiting') return task && nodeState(task) === 'deferred' ? 'deferred' : 'waiting'
  return lane
}

export function deliveryLanes(graph: Graph | null, items: DeliveryItem[]): Record<LaneId, LaneCard[]> {
  const tasks = new Map((graph?.tasks ?? []).map((t) => [t.id, t]))
  const wave = graph ? waves(graph) : new Map<string, number>()
  const titles = new Map((graph?.epics ?? []).map((e) => [e.id, e.title]))
  const lanes: Record<LaneId, LaneCard[]> = { ready: [], running: [], reviewing: [], 'needs-you': [], waiting: [], done: [] }
  const seen = new Set<string>()
  const add = (task: GraphTask | null, item: DeliveryItem | null) => {
    const id = item?.id ?? task!.id
    seen.add(id)
    const epic = task?.epic ?? null
    const attempts = (item?.sessions ?? []).map((s) => s.attempt)
    const lane = laneOf(task, item)
    lanes[lane].push({
      id,
      title: item?.title ?? task!.title,
      epic: epic ? (titles.get(epic) ?? documentEpic(epic)) : null,
      epicId: epic,
      repository: task?.repository ?? null,
      planId: task?.planId ?? null,
      spec: task?.spec ?? null,
      state: cardState(lane, task),
      wave: wave.get(id) ?? 1,
      decision: task?.decision ?? null,
      authority: item?.authority ?? task?.authority ?? 'local',
      route: task?.route ?? null,
      issue: item?.issue ?? task?.issue ?? null,
      item,
      attempt: attempts.length ? Math.max(...attempts) : null,
      sessions: item?.sessions ?? [],
      reviewRounds: item?.rounds?.length ?? 0,
      deliveryState: deliveryState(item),
      deferred: task ? nodeState(task) === 'deferred' : false,
      review: task?.review === true,
      handSetReview: Boolean(item?.handSetReview ?? task?.handSetReview),
      noSession: item?.noSession ?? task?.noSession ?? null,
      nextAction: item?.nextAction ?? task?.nextAction ?? null,
      planArchived: item?.planArchived ?? task?.planArchived ?? null,
      at: newest(item),
    })
  }
  // Superseded tasks are history; the Delivery tab offers them separately.
  for (const item of items) if (item.status !== 'superseded') add(tasks.get(item.id) ?? null, item)
  // Leaves with no delivery record yet still belong in their lane, so each
  // lane holds every task the Dashboard's state counts name.
  for (const task of graph?.tasks ?? [])
    if (!seen.has(task.id) && task.kind === 'leaf' && task.status !== 'superseded') add(task, null)
  lanes.done.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  lanes.running.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  return lanes
}

// The status a resumed local task goes back to: `planned` when the
// workspace has it, else its first open status that is not deferred or
// blocked.
export function resumeStatus(graph: Graph | null): string | null {
  const open = (graph?.statuses ?? []).filter((s) => !s.complete && !['deferred', 'blocked'].includes(s.id))
  return open.find((s) => s.id === 'planned')?.id ?? open[0]?.id ?? null
}

// The status Mark done sets: `done` when the workspace has it, else
// `accepted`, else its first complete status.
export function doneStatus(graph: Graph | null): string | null {
  const complete = (graph?.statuses ?? []).filter((s) => s.complete)
  return (complete.find((s) => s.id === 'done') ?? complete.find((s) => s.id === 'accepted') ?? complete[0])?.id ?? null
}

// The lanes with only the cards the shared filter keeps, so lane counts are
// the filtered counts. A card waiting on a decision counts as needing you.
export function filterLanes(lanes: Record<LaneId, LaneCard[]>, filter: TaskFilter): Record<LaneId, LaneCard[]> {
  return Object.fromEntries(
    (Object.keys(lanes) as LaneId[]).map((lane) => [
      lane,
      lanes[lane].filter((card) =>
        matches(
          { ...card, decision: card.decision ?? (card.deliveryState === 'decision' ? 'delivery stopped' : null) },
          filter,
        ),
      ),
    ]),
  ) as Record<LaneId, LaneCard[]>
}

// The lanes the board draws for a filter: Done only when the filter asks
// for done work (the Dashboard's Done count opens it), else the four lanes.
export const DONE_LANE = { id: 'done' as const, label: 'Done', tint: 'var(--ok)' }

// Lanes per row for a given width: 4, then 2, then 1, so lanes never squeeze
// a card below LANE_MIN_WIDTH and the row never scrolls sideways.
export function laneColumns(width: number, lanes: number, gap = 16): number {
  for (const columns of [4, 2, 1]) {
    const n = Math.min(columns, lanes)
    if (n * LANE_MIN_WIDTH + (n - 1) * gap <= width) return n
  }
  return 1
}

// The lane a state filter shows on its own.
export function laneForState(state: NodeState | undefined): DrawnLaneId | undefined {
  if (!state) return undefined
  if (state === 'running') return 'in-progress'
  if (state === 'deferred') return 'waiting'
  return state
}

// Start now is offered on Ready cards Avoozl codes itself: local-route
// tasks. GitHub-route tasks are started by their board or Issue Radar.
export const canStartNow = (card: LaneCard) => card.route === 'local' && !card.deferred

// What Defer, Resume and Start now do, on their tooltips and in the drawer.
export const DEFER_TIP = 'Pauses new dispatch. A running chat is left alone. Resume undoes it.'
export const RESUME_TIP = 'Lets the tick start this task again. Undoes Defer.'
export const START_TIP = 'Starts this task first on the next tick, within the limit.'
export const RETRY_TIP = 'Starts a new attempt for this task.'
