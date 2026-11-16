// What the side panel shows and when it reads again. The panel makes the same
// reads the app's pages make (conflicts.view, radar.crews, remote.view,
// radar.releasequeue, flow.view) and this module turns them into rows, so
// node can test it and a fixture can feed it (every `panelModel` input is
// plain data). No JSX and no host imports.
import { driverLine, type DriverRead, type DriverState } from './driver-view-api.ts'
import { bannerText, type FlowViewModel } from './flow-api.ts'
import type { ReleaseQueue } from './release-api.ts'
import type { SpecSummary } from './plans-api.ts'
import { linkHref, type ConflictItem, type RadarClaim, type RadarCrews, type RemoteWorker } from './views-api.ts'
import { COMMAND_PATH } from './workspace-api.ts'
import type { AppApi } from '@kirocrew/app-sdk'

// How often the panel reads while it is on screen and visible, when nothing
// else drives it. The panel itself passes 0: its Refresh button counts down
// the GitHub cache time and reads at 0.
export const PANEL_REFRESH_MS = 30_000

// What `panel.view` returns: every part of the panel in one read. A part whose
// own read failed is null.
export interface PanelChecks {
  state: 'passing' | 'failing' | 'pending' | 'none'
  total: number
  done: number
  failed: string[]
}
export interface PanelRead extends PanelInput {
  readAt?: string
  driver?: DriverRead | null
  specs?: SpecSummary[] | null
  instance?: { id: string; name: string } | null
  // "owner/repo#57" -> the checks on that pull request's head.
  checks?: Record<string, PanelChecks> | null
}

// The panel's one read, for the workspace it shows.
export async function readPanel(api: AppApi, workspaceId: string): Promise<PanelRead> {
  const reply = await api.post<{ result: PanelRead }>(COMMAND_PATH, { operation: 'panel.view', input: {}, workspaceId })
  return reply.result
}

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
  const timer = options.intervalMs > 0 ? options.setTimer(onTick, options.intervalMs) : null
  options.win.addEventListener('focus', onShow)
  options.doc.addEventListener('visibilitychange', onShow)
  void run()
  return () => {
    live = false
    if (timer !== null) options.clearTimer(timer)
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
  // When a person could first act: the edit's time for a conflict, else null.
  at: string | null
  actions: PanelAction[]
}

export interface FlightRow {
  key: string
  source: 'radar' | 'remote'
  title: string
  // "o/r#52" for a crew's claim, the task id for a remote worker.
  ref: string
  who: string
  // The Avoozl that released the issue, by name, when its marker names one.
  instance: string | null
  crew: string | null
  repository: string | null
  phase: string | null
  stale: boolean
  issueUrl: string | null
  prUrl: string | null
  prNumber: number | null
  // Where Session goes, or null when this machine cannot open the chat.
  attach: string | null
  // Why there is no Session, when there is none.
  noAttach: string | null
  pr: boolean
  // The pull request's checks, or null when unknown or there is no pull request.
  check: PanelChecks | null
  claimedAt: string | null
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
  queue: { head: QueueHead[]; next: number; claimed: number; held: number; mode: string | null } | null
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
  checks?: Record<string, PanelChecks> | null
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
  // The host lets an app write only what its own API offers, so a row with no
  // direct action deep-links to the page that has the full item.
  if (!actions.length) actions.push({ kind: 'link', label: 'Open in Avoozl', href: '/apps/avoozl' })
  return {
    key: `${item.kind}:${item.taskId ?? item.id ?? ''}:${item.field ?? ''}:${item.branch ?? ''}`,
    kind: item.kind,
    label: LABELS[item.kind] ?? item.kind,
    title: item.title,
    detail: item.detail,
    at: item.changedAt ?? null,
    actions,
  }
}

function crewRow(row: RadarClaim, names: Map<string, string>, checks: PanelChecks | null): FlightRow {
  return {
    key: `radar:${row.repository}#${row.number}`,
    source: 'radar',
    title: row.title,
    ref: `${row.repository}#${row.number}`,
    who: row.crewName ?? row.crewId ?? 'no crew named',
    instance: (row.instanceId && names.get(row.instanceId)) || null,
    crew: row.crewName ?? row.crewId ?? null,
    repository: row.repository,
    phase: row.phase,
    stale: row.stale,
    issueUrl: linkHref(row.url) ?? null,
    prUrl: linkHref(row.prUrl) ?? null,
    prNumber: row.pr,
    // The crew's chat opens only if the crew runs on this machine.
    attach: row.crewId ? `/chat?sid=crew-${encodeURIComponent(row.crewId)}` : null,
    noAttach: row.crewId ? null : 'The claim names no crew.',
    pr: Boolean(row.pr),
    check: checks,
    claimedAt: row.claimedAt ?? null,
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
    instance: null,
    crew: worker.crewId,
    repository: null,
    phase: worker.status ?? worker.state,
    stale: worker.stale,
    issueUrl: null,
    prUrl: null,
    prNumber: null,
    attach,
    noAttach: attach ? null : `Set the dashboard link for ${worker.host} to open its session.`,
    pr: false,
    check: null,
    claimedAt: null,
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
  const names = new Map<string, string>()
  for (const group of input.crews?.groups ?? []) for (const row of group.rows) if (row.instanceId) names.set(row.instanceId, group.name)
  const inFlight = [...(input.crews?.rows ?? []).map((row) => crewRow(row, names, input.checks?.[`${row.repository}#${row.pr}`] ?? null)), ...(input.remote ?? []).map(remoteRow)]

  let queue: PanelModel['queue'] = null
  if (input.queue) {
    const rows = input.queue.repositories.flatMap((repo) => repo.rows.map((row) => ({ repo, row })))
    queue = {
      head: rows.filter((entry) => entry.row.state === 'next').slice(0, 3).map(({ repo, row }) => ({ taskId: row.taskId, title: row.title, repository: repo.repository, reason: row.reason })),
      next: rows.filter((entry) => entry.row.state === 'next').length,
      claimed: rows.filter((entry) => entry.row.state === 'claimed').length,
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

// The driver session as the panel shows it: a link when one was seen, Start
// when none runs or the last one went quiet, and neither Start nor a link when
// the read failed (it may be running; a second one would double-release).
export interface DriverView {
  state: DriverState
  link: string | null
  start: boolean
  note: string
  // The workspace the line is about, by name.
  workspace: string | null
  // When this workspace has no running driver and another one does:
  // "No driver for A. B has one:" and that driver's link.
  elsewhere: { text: string; href: string; slot: string; workspace: string } | null
}

export function driverView(read: DriverRead | null | undefined): DriverView {
  const state = read?.state ?? 'none'
  const workspace = read?.workspace ?? null
  const other = state === 'none' || state === 'idle' ? read?.others?.[0] : undefined
  return {
    state,
    link: read?.href ?? null,
    start: state === 'none' || state === 'idle',
    note: driverLine(state),
    workspace,
    elsewhere: other ? { text: `No driver for ${workspace ?? 'this workspace'}. ${other.workspace} has one:`, href: other.href, slot: other.slot, workspace: other.workspace } : null,
  }
}

// The workspace a chat drives, from a driver read's `others`: the root of the
// workspace whose running driver is this chat, or null.
export function drivenRoot(read: DriverRead | null | undefined, chat: string): string | null {
  return (chat && read?.others?.find((other) => other.slot === chat)?.root) || null
}

// Two workspace roots name the same folder (separators and a trailing slash
// aside).
export const sameRoot = (left: string, right: string) => {
  const plain = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '')
  return plain(left) === plain(right)
}

// "now", "5m", "3h", "2d": how long since `at`, short enough for a row.
export function shortAgo(at: string | null | undefined, now = Date.now()): string {
  const time = at ? Date.parse(at) : NaN
  if (!Number.isFinite(time)) return ''
  const minutes = Math.max(0, Math.round((now - time) / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)}h`
  return `${Math.round(minutes / 60 / 24)}d`
}

// A pull request's check state as a row shows it: a word for the tooltip and
// a tone for the chip.
export function checkLabel(check: PanelChecks | null | undefined): { text: string; tone: 'ok' | 'danger' | 'warn' | 'muted'; tip: string } {
  if (!check) return { text: '?', tone: 'muted', tip: 'Avoozl could not read this pull request\'s checks.' }
  if (check.state === 'failing') return { text: `✗ ${check.failed.length}`, tone: 'danger', tip: `Failing: ${check.failed.join(', ')}.` }
  if (check.state === 'pending') return { text: `… ${check.done}/${check.total}`, tone: 'warn', tip: `${check.done} of ${check.total} checks done.` }
  if (check.state === 'passing') return { text: `✓ ${check.total}`, tone: 'ok', tip: `All ${check.total} checks passed.` }
  return { text: 'no checks', tone: 'muted', tip: 'No checks have run on this pull request.' }
}

// A path is inside a root: the root itself or a folder under it (separators
// and a trailing slash aside).
export function insideRoot(path: string, root: string): boolean {
  const plain = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '')
  const p = plain(path),
    r = plain(root)
  return Boolean(r) && (p === r || p.startsWith(`${r}/`))
}

export interface PanelWorkspace {
  id: string
  // The workspace's own root, then each registered repository's checkout.
  roots: string[]
}

export type PanelPick = { id: string | null; why: 'driver' | 'folder' | 'last' | 'default' | 'none' }

// Which workspace the side panel reads, in order: the workspace this driver
// chat drives; the one whose root, or a repository registered to it, holds
// the chat's project folder (the longest matching root wins); the page's
// last workspace; the catalog's default. Only a workspace still in the
// catalog counts.
export function pickPanelWorkspace(input: {
  driverRoot: string | null
  project: string | null
  workspaces: (PanelWorkspace & { root: string })[]
  last: string | null
  fallback: string | null
}): PanelPick {
  const known = (id: string | null) => Boolean(id && input.workspaces.some((w) => w.id === id))
  if (input.driverRoot) {
    const drives = input.workspaces.find((w) => sameRoot(w.root, input.driverRoot!))
    if (drives) return { id: drives.id, why: 'driver' }
  }
  if (input.project) {
    let best: { id: string; length: number } | null = null
    for (const workspace of input.workspaces)
      for (const root of [workspace.root, ...workspace.roots])
        if (root && insideRoot(input.project, root) && (!best || root.length > best.length)) best = { id: workspace.id, length: root.length }
    if (best) return { id: best.id, why: 'folder' }
  }
  if (known(input.last)) return { id: input.last, why: 'last' }
  if (known(input.fallback)) return { id: input.fallback, why: 'default' }
  return { id: null, why: 'none' }
}

// The chat's project folder, from Kiro Crew's slot list, or null when the
// host refuses the read or the chat is not listed.
// shortcut: Kiro Crew gives a panel tab no project folder, and its app grant
// matches path prefixes only, so this needs `/api/chat/slots` in app.json's
// permissions.api, which reaches every chat. Without that grant the read is
// refused and the folder rule is skipped. Switch to an SDK call that names
// the panel's own chat folder if Kiro Crew adds one.
export async function chatProject(api: AppApi, chat: string): Promise<string | null> {
  if (!chat) return null
  try {
    const rows = await api.get<{ key?: string; project?: string }[]>('/api/chat/slots')
    const row = (Array.isArray(rows) ? rows : []).find((item) => item.key === chat)
    return typeof row?.project === 'string' && row.project ? row.project : null
  } catch {
    return null
  }
}
