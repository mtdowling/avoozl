// Swim lanes for the Delivery tab: one lane per delivery state, from the
// delivery and graph reads. Kept free of JSX so node can test it directly.
import { nodeState, waves, type NodeState } from './graph-layout.ts'
import { matches, type TaskFilter } from './filters.ts'
import type { DeliveryItem, DeliverySession, Graph, GraphTask, RemoteWorker } from './views-api.ts'
import { summarize } from './dashboard-api.ts'
import { laneOf as sharedLaneOf } from '../../../src/delivery-lanes.mjs'
import { TONE } from './ui/tones.ts'

export type LaneId = 'ready' | 'running' | 'reviewing' | 'needs-you' | 'waiting' | 'done'

// The lanes the Delivery tab draws, each with its tint. Running and
// reviewing work share one In progress lane, grouped inside it. Done work is
// not a lane: the Dashboard lists it under Recently done. No lane uses the
// warning (yellow) color: that means "needs you".
export type DrawnLaneId = 'ready' | 'in-progress' | 'needs-you' | 'waiting' | 'done'
export const LANES: { id: DrawnLaneId; label: string; tint: string }[] = [
  { id: 'ready', label: 'Ready', tint: TONE.accent },
  { id: 'in-progress', label: 'In progress', tint: TONE.purpleOrAccent },
  { id: 'needs-you', label: 'Needs you', tint: TONE.danger },
  { id: 'waiting', label: 'Blocked or waiting', tint: TONE.muted },
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

// The narrowest a lane gets before the row wraps to fewer lanes. Small, so
// all four lanes share one row on any page wider than a phone, even beside
// the left nav or zoomed in; cards wrap their text to fit.
export const LANE_MIN_WIDTH = 88

// A lane narrower than this draws its cards' buttons as icons alone (their
// tooltips and names stay), so a word never pushes a button out of its card.
export const LANE_LABEL_WIDTH = 160

// The width each of `columns` lanes gets in a row `width` wide.
export const laneWidth = (width: number, columns: number, gap = 16) => (width - (columns - 1) * gap) / columns

export interface LaneCard {
  id: string
  title: string
  // A manual task (R61.11): no agent works on it; tagged Manual.
  manual?: boolean
  epic: string | null
  // For filtering: the epic's ID, the task's repository and plan.
  epicId: string | null
  repository: string | null
  planId: string | null
  // The plan's title and the task's phase, shown on the card (R59.10).
  plan: string | null
  phase: { id: string; title: string } | null
  // A sub-issue link the cap or GitHub left out (R59.9, R59.15).
  subIssue: { parent: string; reason: string } | null
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
  // A live planner batch (§4.37, R108.9): one In progress card stands for
  // every task in it, with the planner's reason. Null on other cards.
  batch: { id: string; reason: string | null; members: { id: string; title: string }[] } | null
  // Why this task runs alone though the planner grouped it (R108.5).
  alone: string | null
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

// Which lane a task is in: the shared rule the Avoozl state Project field
// also uses (src/delivery-lanes.mjs).
export const laneOf: (task: GraphTask | null, item: DeliveryItem | null) => LaneId = sharedLaneOf

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
  const planTitles = new Map((graph?.plans ?? []).map((p) => [p.id, p.title]))
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
      manual: Boolean(task?.manual),
      epic: epic ? (titles.get(epic) ?? epic) : null,
      epicId: epic,
      repository: task?.repository ?? null,
      planId: task?.planId ?? null,
      plan: task?.planId ? (planTitles.get(task.planId) ?? task.planId) : null,
      phase: task?.phase ?? item?.phase ?? null,
      subIssue: item?.subIssue ?? null,
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
      batch: null,
      alone: item?.alone ?? null,
    })
  }
  // Superseded tasks are history; the Delivery tab offers them separately.
  for (const item of items) if (item.status !== 'superseded') add(tasks.get(item.id) ?? null, item)
  // Leaves with no delivery record yet still belong in their lane, so each
  // lane holds every task the Dashboard's state counts name.
  for (const task of graph?.tasks ?? []) if (!seen.has(task.id) && task.kind === 'leaf' && task.status !== 'superseded') add(task, null)
  lanes.done.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  lanes.running.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  const names = new Map<string, string>([...tasks.values()].map((t) => [t.id, t.title]))
  for (const item of items) names.set(item.id, item.title)
  lanes.running = foldBatches(lanes.running, names)
  lanes.reviewing = foldBatches(lanes.reviewing, names)
  return lanes
}

// One card per live batch (R108.9): the leader's card lists every member and
// the planner's reason, and the other members' cards fold into it. A split
// batch is not folded: its tasks run alone.
export function foldBatches(cards: LaneCard[], names: Map<string, string> = new Map()): LaneCard[] {
  const runs = new Map<string, LaneCard[]>()
  for (const card of cards) {
    const run = card.item?.batchGroup
    if (run?.id && run.state !== 'split') runs.set(run.id, [...(runs.get(run.id) ?? []), card])
  }
  const out: LaneCard[] = []
  for (const card of cards) {
    const run = card.item?.batchGroup
    const group = run?.id && run.state !== 'split' ? runs.get(run.id) : undefined
    if (!run || !group) {
      out.push(card)
      continue
    }
    const host = group.find((c) => c.id === run.leader) ?? group[0]
    if (card !== host) continue
    const titles = new Map([...names, ...group.map((c): [string, string] => [c.id, c.title])])
    out.push({
      ...card,
      batch: {
        id: run.id as string,
        reason: run.reason,
        members: run.tasks.map((id) => ({ id, title: titles.get(id) ?? id })),
      },
    })
  }
  return out
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
      lanes[lane].filter((card) => matches({ ...card, epic: card.epicId, decision: card.decision ?? (card.deliveryState === 'decision' ? 'delivery stopped' : null) }, filter)),
    ]),
  ) as Record<LaneId, LaneCard[]>
}

// The lanes the board draws for a filter: Done only when the filter asks
// for done work (the Dashboard's Done count opens it), else the four lanes.
export const DONE_LANE = { id: 'done' as const, label: 'Done', tint: TONE.ok }

// Lanes per row: 1 on a phone; else every lane in one row, falling back to
// 2, then 1, only when lanes would go under LANE_MIN_WIDTH, so the row never
// scrolls sideways.
export function laneColumns(width: number, lanes: number, gap = 16, phone = false): number {
  if (phone) return 1
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
  if (state === 'deferred' || state === 'draft') return 'waiting'
  return state
}

// Start now is offered on Ready cards Avoozl codes itself: local-route
// tasks. GitHub-route tasks are started by their board.
export const canStartNow = (card: LaneCard) => card.route === 'local' && !card.deferred

// What Defer, Resume and Start now do, on their tooltips and in the drawer.
export const DEFER_TIP = 'Pauses new dispatch. A running chat is left alone. Resume undoes it.'
export const RESUME_TIP = 'Lets the tick start this task again. Undoes Defer.'
export const START_TIP = 'Starts this task first on the next tick, within the limit.'
export const RETRY_TIP = 'Starts a new attempt for this task.'

// Settings > Delivery (R53.3, R54.8): the backend's defaults, shown as
// placeholders (src/app/delivery/delivery.mjs DELIVERY_DEFAULTS).
export const DELIVERY_DEFAULTS = {
  investigateMode: 'not-small',
  minConfidence: 'high',
} as const

export type ShipMode = 'auto-merge' | 'manual'
export type InvestigateMode = 'all' | 'not-small' | 'off'

export interface DeliverySettings {
  hash: string | null
  on: boolean
  delivery: {
    investigate?: { mode?: InvestigateMode; minConfidence?: 'medium' | 'high' }
  }
}

export interface DeliveryForm {
  investigateMode?: InvestigateMode
  minConfidence?: 'medium' | 'high'
}

export function toDeliveryForm(delivery: DeliverySettings['delivery'] = {}): DeliveryForm {
  return {
    investigateMode: delivery.investigate?.mode ?? DELIVERY_DEFAULTS.investigateMode,
    minConfidence: delivery.investigate?.minConfidence ?? DELIVERY_DEFAULTS.minConfidence,
  }
}

// The keys to write; a blank field is left out, so its default applies.
export function toDeliverySection(form: DeliveryForm): { delivery?: DeliverySettings['delivery']; error?: string } {
  const delivery: DeliverySettings['delivery'] = {}
  // A default value is left out, so a later default change still applies.
  const investigate = {
    ...(form.investigateMode && form.investigateMode !== DELIVERY_DEFAULTS.investigateMode ? { mode: form.investigateMode } : {}),
    ...(form.minConfidence && form.minConfidence !== DELIVERY_DEFAULTS.minConfidence ? { minConfidence: form.minConfidence } : {}),
  }
  if (Object.keys(investigate).length) delivery.investigate = investigate
  return { delivery }
}

// Settings > Delivery's ship fold-out (§4.25): one line each, and what the
// writer, Avoozl and the person do.
export const SHIP_CHOICES: { key: ShipMode; title: string; line: string; who: [string, string, string] }[] = [
  {
    key: 'auto-merge',
    title: 'Auto-merge',
    line: 'The writer turns on GitHub auto-merge; the pull request merges when its checks and reviews pass.',
    who: ['Turns on auto-merge', 'Waits for the merge', 'Nothing'],
  },
  {
    key: 'manual',
    title: 'I merge',
    line: 'Auto-merge stays off. Needs you shows Ready to merge with a link when checks and reviews pass.',
    who: ['Leaves auto-merge off', 'Shows Ready to merge', 'Merges on GitHub, or presses Integrate for a local task'],
  },
]

// One chip per value with its card count, in the order `options` gives.
export function chipCounts(
  options: { value: string; label: string }[],
  cards: LaneCard[],
  valueOf: (card: LaneCard) => string | null,
): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const card of cards) {
    const value = valueOf(card)
    if (value === null) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return options.map((option) => ({ ...option, count: counts.get(option.value) ?? 0 })).filter((item) => item.count > 0)
}

export const THIS_MAC = 'This Mac'

export interface MachineLoad {
  host: string
  running: number
  // Chats this machine runs at once; null when Avoozl does not know it.
  limit: number | null
}

// What runs on each machine now, from the reads Delivery already makes
// (delivery.view, remote.view): the live chats per host, this Mac first. A
// remote host's limit is not recorded, so it shows its count alone.
export function machineLoads(items: DeliveryItem[], workers: RemoteWorker[], laneLimit: number | null) {
  const rows = summarize({ graph: null, delivery: items, conflicts: null, plans: null, remote: workers, limit: Infinity }).inFlight
  const hostsOf = new Map<string, string[]>()
  const running = new Map<string, number>()
  for (const row of rows) {
    const host = row.remote?.host ?? THIS_MAC
    running.set(host, (running.get(host) ?? 0) + 1)
    const hosts = hostsOf.get(row.taskId) ?? []
    if (!hosts.includes(host)) hosts.push(host)
    hostsOf.set(row.taskId, hosts)
  }
  if (laneLimit !== null && !running.has(THIS_MAC)) running.set(THIS_MAC, 0)
  const loads: MachineLoad[] = [...running]
    .map(([host, count]) => ({ host, running: count, limit: host === THIS_MAC ? laneLimit : null }))
    .sort((a, b) => Number(b.host === THIS_MAC) - Number(a.host === THIS_MAC) || a.host.localeCompare(b.host))
  return { loads, hostsOf }
}

export const loadLabel = (load: MachineLoad) => `${load.host} ${load.running}${load.limit === null ? '' : `/${load.limit}`}`
