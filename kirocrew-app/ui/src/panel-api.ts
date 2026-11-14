// What the side panel shows and when it reads again. The panel makes the same
// reads the app's pages make (conflicts.view, radar.crews, remote.view,
// radar.releasequeue, flow.view) and this module turns them into rows, so
// node can test it and a fixture can feed it (every `panelModel` input is
// plain data). No JSX and no host imports.
import { bannerText, type FlowViewModel } from './flow-api.ts'
import type { ReleaseQueue } from './release-api.ts'
import { linkHref, type ConflictItem, type RadarClaim, type RadarCrews, type RemoteWorker } from './views-api.ts'

// How often the panel reads while it is on screen and visible.
export const PANEL_REFRESH_MS = 30_000

interface Listener {
  addEventListener(name: string, fn: () => void): void
  removeEventListener(name: string, fn: () => void): void
}

export interface RefreshOptions {
  intervalMs: number
  doc: Listener & { visibilityState: string }
  win: Listener
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (timer: unknown) => void
}

// Reads once now, then on the interval while the page is visible, and again
// when the window gains focus or the tab becomes visible. A read still
// running is never started twice, and a failed read does not stop the timer.
// Returns the function that stops it all.
export function startRefresh(load: () => unknown, options: RefreshOptions): () => void {
  let busy = false
  let live = true
  const run = async () => {
    if (!live || busy) return
    busy = true
    try {
      await load()
    } catch {
      // The reader shows its own errors; the next tick tries again.
    } finally {
      busy = false
    }
  }
  const visible = () => options.doc.visibilityState !== 'hidden'
  const onTick = () => visible() && void run()
  const onShow = () => visible() && void run()
  const timer = options.setTimer(onTick, options.intervalMs)
  options.win.addEventListener('focus', onShow)
  options.doc.addEventListener('visibilitychange', onShow)
  void run()
  return () => {
    live = false
    options.clearTimer(timer)
    options.win.removeEventListener('focus', onShow)
    options.doc.removeEventListener('visibilitychange', onShow)
  }
}

export type PanelAction =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'resolve'; label: string; taskId: string; field: string; choice: 'desired' | 'github' }
  | { kind: 'land'; label: string; repository: string; branch: string; head: string }

export interface WaitingRow {
  key: string
  kind: string
  label: string
  title: string
  detail: string
  actions: PanelAction[]
}

export interface FlightRow {
  key: string
  source: 'radar' | 'remote'
  title: string
  // "o/r#52" for a crew's claim, the task id for a remote coder.
  ref: string
  who: string
  phase: string | null
  stale: boolean
  issueUrl: string | null
  prUrl: string | null
  prNumber: number | null
  // Where Attach goes, or null when this machine cannot open the chat.
  attach: string | null
  // Why there is no Attach, when there is none.
  noAttach: string | null
  pr: boolean
  updated: string | null
}

export interface QueueHead {
  taskId: string
  title: string
  repository: string
  reason: string
}

export interface RecentRow {
  taskId: string
  title: string
  repository: string | null
  at: string
}

export type PanelSection = 'waiting' | 'inFlight' | 'queue' | 'recent'

export interface PanelModel {
  waiting: WaitingRow[]
  inFlight: FlightRow[]
  queue: { head: QueueHead[]; held: number; mode: string | null } | null
  recent: RecentRow[]
  // Open line stops, each as the sentence the Flow banner shows.
  stops: string[]
  // Sections whose read failed or has not come yet: shown as unread, not empty.
  unread: PanelSection[]
}

export interface PanelInput {
  conflicts?: ConflictItem[] | null
  crews?: RadarCrews | null
  remote?: RemoteWorker[] | null
  queue?: ReleaseQueue | null
  flow?: Pick<FlowViewModel, 'tasks' | 'line'> | null
}

// Items a person settles. Local worker items (a stale session, a delivery
// decision, findings, a hand-set review, Integrate) are not here: local
// workers are retired.
const WAITING_KINDS = new Set(['needs-human', 'github-conflict', 'tracker-conflict', 'review', 'ready-to-merge', 'branch-landing', 'content-match', 'content-unavailable'])
const LABELS: Record<string, string> = {
  'needs-human': 'Needs you',
  'github-conflict': 'GitHub edit',
  'tracker-conflict': 'Tracker edit',
  review: 'Review',
  'ready-to-merge': 'Ready to merge',
  'branch-landing': 'Ready to land',
  'content-match': 'Content rule',
  'content-unavailable': 'Rule set unavailable',
}

function waitingRow(item: ConflictItem): WaitingRow | null {
  if (!WAITING_KINDS.has(item.kind)) return null
  if (item.kind === 'needs-human' && item.reason === 'hand-set-review') return null
  if (item.kind === 'ready-to-merge' && item.integrate) return null
  const actions: PanelAction[] = []
  const href = linkHref(item.link) ?? linkHref(item.issue?.url)
  if (item.kind === 'github-conflict' && item.taskId && item.field)
    for (const choice of item.choices ?? [])
      actions.push({ kind: 'resolve', label: choice === 'desired' ? "Keep Avoozl's" : "Keep GitHub's", taskId: item.taskId, field: item.field, choice })
  else if (item.kind === 'branch-landing' && item.repository && item.branch && item.head)
    actions.push({ kind: 'land', label: 'Land it', repository: item.repository, branch: item.branch, head: item.head })
  else if (href) actions.push({ kind: 'link', label: item.kind === 'ready-to-merge' ? `Open PR${item.pullRequest ? ` #${item.pullRequest}` : ''}` : 'Open issue', href })
  return {
    key: `${item.kind}:${item.taskId ?? item.id ?? ''}:${item.field ?? ''}:${item.branch ?? ''}`,
    kind: item.kind,
    label: LABELS[item.kind] ?? item.kind,
    title: item.title,
    detail: item.detail,
    actions,
  }
}

function crewRow(row: RadarClaim): FlightRow {
  return {
    key: `radar:${row.repository}#${row.number}`,
    source: 'radar',
    title: row.title,
    ref: `${row.repository}#${row.number}`,
    who: row.crewName ?? row.crewId ?? 'no crew named',
    phase: row.phase,
    stale: row.stale,
    issueUrl: linkHref(row.url) ?? null,
    prUrl: linkHref(row.prUrl) ?? null,
    prNumber: row.pr,
    // The crew's chat opens only if the crew runs on this machine.
    attach: row.crewId ? `/chat?sid=crew-${encodeURIComponent(row.crewId)}` : null,
    noAttach: row.crewId ? null : 'The claim names no crew.',
    pr: Boolean(row.pr),
    updated: row.updated,
  }
}

function remoteRow(worker: RemoteWorker): FlightRow {
  const attach = linkHref(worker.attachUrl) ?? null
  return {
    key: `remote:${worker.host}:${worker.chatKey}`,
    source: 'remote',
    title: worker.taskId,
    ref: worker.taskId,
    who: `${worker.host}, crew ${worker.crewId}`,
    phase: worker.status ?? worker.state,
    stale: worker.stale,
    issueUrl: null,
    prUrl: null,
    prNumber: null,
    attach,
    noAttach: attach ? null : `Set the dashboard link for ${worker.host} to attach.`,
    pr: false,
    updated: worker.updatedAt || null,
  }
}

export function panelModel(input: PanelInput): PanelModel {
  const unread: PanelSection[] = []
  if (!input.conflicts) unread.push('waiting')
  if (!input.crews && !input.remote) unread.push('inFlight')
  if (!input.queue) unread.push('queue')
  if (!input.flow) unread.push('recent')

  const waiting = (input.conflicts ?? []).map(waitingRow).filter((row): row is WaitingRow => row !== null)
  const inFlight = [...(input.crews?.rows ?? []).map(crewRow), ...(input.remote ?? []).map(remoteRow)]

  let queue: PanelModel['queue'] = null
  if (input.queue) {
    const rows = input.queue.repositories.flatMap((repo) => repo.rows.map((row) => ({ repo, row })))
    queue = {
      head: rows.filter((entry) => entry.row.state === 'next').slice(0, 3).map(({ repo, row }) => ({ taskId: row.taskId, title: row.title, repository: repo.repository, reason: row.reason })),
      held: rows.filter((entry) => entry.row.state === 'held').length,
      mode: input.queue.repositories[0]?.mode ?? null,
    }
  }

  const recent = (input.flow?.tasks ?? [])
    .filter((task) => task.finishedAt)
    .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))
    .slice(0, 5)
    .map((task) => ({ taskId: task.taskId, title: task.title, repository: task.repository, at: String(task.finishedAt) }))
  const stops = (input.flow?.line ?? []).filter((stop) => !stop.closedAt).map(bannerText)
  return { waiting, inFlight, queue, recent, stops, unread }
}

// The driver session. Avoozl has no read for it yet (another change owns
// that logic), so the panel passes null and shows the Start button; when a
// read exists it feeds `{ state: 'running', link }` here.
export interface DriverSession {
  state: 'running' | 'not-started'
  link?: string | null
}
export interface DriverView {
  state: 'running' | 'not-started'
  link: string | null
  note: string | null
}

export function driverView(driver: DriverSession | null | undefined): DriverView {
  if (driver?.state === 'running') return { state: 'running', link: driver.link ?? null, note: null }
  return { state: 'not-started', link: null, note: 'No driver session is open. While none runs, nothing is released and nobody watches merges. Crews already working keep going.' }
}

export const DRIVER_START_MESSAGE =
  'Be the Avoozl driver session for this workspace. Release ready work in graph order, watch merges, and hand me the decisions that need a person. Check Avoozl before each step and do not merge anything yourself.'
