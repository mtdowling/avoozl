// Home's tiles and sections, built from reads Home already makes
// (graph.view, delivery.view, conflicts.view, radar.crews, flow.view) and
// landing.view, which reads Avoozl's own store. None calls GitHub. Kept
// free of JSX so node can test it directly.
import type { Attention, DashboardSummary } from './dashboard-api.ts'
import type { FlowViewModel } from './flow-api.ts'
import { safeHref, type DeliveryItem, type LandingView } from './views-api.ts'

// The views a tile opens.
export type HomeTarget = 'graph' | 'delivery' | 'waiting' | 'landing' | 'flow'

export interface Tile {
  key: string
  label: string
  // Null while its read has not landed or failed: the tile shows a dash.
  value: number | null
  sub: string
  target: HomeTarget
  tip: string
  // Needs you takes the warm color, and only when something waits.
  warm: boolean
}

export function homeTiles(summary: DashboardSummary | null, landing: LandingView | null): Tile[] {
  const counts = summary?.counts,
    needs = summary ? summary.attention.length : null
  return [
    { key: 'ready', label: 'Ready', value: counts ? counts.ready : null, sub: 'can start now', target: 'graph', tip: 'Open the Graph', warm: false },
    {
      key: 'running',
      label: 'Running',
      value: summary ? summary.inFlight.length + summary.radarFlight.length : null,
      sub: 'chats and crews',
      target: 'delivery',
      tip: 'Open Delivery',
      warm: false,
    },
    { key: 'needs-you', label: 'Needs you', value: needs, sub: 'wait on your answer', target: 'waiting', tip: 'Open Needs you', warm: (needs ?? 0) > 0 },
    { key: 'waiting', label: 'Waiting', value: counts ? counts.waiting : null, sub: 'on other tasks', target: 'graph', tip: 'Open the Graph', warm: false },
    { key: 'landing', label: 'Landing queue', value: landing ? landing.queue.length : null, sub: 'checked, not landed', target: 'landing', tip: 'Open the Landing queue', warm: false },
    { key: 'landed', label: 'Landed this week', value: landing ? landing.landedThisWeek : null, sub: 'last 7 days', target: 'flow', tip: 'Open Flow', warm: false },
  ]
}

// The one answer that unblocks a Needs you card, by kind.
const ANSWERS: Record<string, string> = {
  decision: 'Decide',
  'needs-human': 'Answer',
  review: 'Review',
  'plan-review': 'Review the draft',
  delivery: 'Retry or dismiss',
  manual: 'Do the step',
  'github-conflict': 'Pick a version',
  'stale-session': 'Restart or close',
  'ready-to-merge': 'Merge',
  'branch-landing': 'Approve the landing',
  'content-match': 'Allow or edit',
}
export const answerLabel = (item: Pick<Attention, 'kind'>) => ANSWERS[item.kind] ?? 'Open'

// A running chat with no word for this long is quiet.
export const QUIET_MS = 30 * 60 * 1000

export interface StuckRow {
  key: string
  taskId: string | null
  title: string
  why: string
  // The chat to attach to, or the issue on GitHub.
  href: string | null
  external: boolean
}

const ago = (ms: number) => {
  const minutes = Math.round(ms / 60000)
  return minutes < 120 ? `${minutes} min` : `${Math.round(minutes / 60)} h`
}

// Running work that has gone quiet: a chat with no status for QUIET_MS, a
// chat on a crew that does not answer, or an Issue Radar claim GitHub
// shows as stale. Quietest first.
export function stuckRows(summary: DashboardSummary | null, now: number, sessionHref: (row: DashboardSummary['inFlight'][number]) => string | null): StuckRow[] {
  if (!summary) return []
  const rows: (StuckRow & { quiet: number })[] = []
  for (const row of summary.inFlight) {
    const last = Date.parse(row.lastAt ?? '')
    const quiet = Number.isFinite(last) ? now - last : Infinity
    const why = row.session.crewUnreachable ? 'Its crew does not answer.' : quiet >= QUIET_MS ? (Number.isFinite(quiet) ? `No word for ${ago(quiet)}.` : 'No status yet.') : null
    if (why) rows.push({ key: `chat:${row.slot}`, taskId: row.taskId, title: row.title, why: `${row.role.charAt(0).toUpperCase()}${row.role.slice(1)} chat. ${why}`, href: sessionHref(row), external: false, quiet })
  }
  for (const claim of summary.radarFlight)
    if (claim.stale)
      rows.push({
        key: `claim:${claim.repository}#${claim.number}`,
        taskId: null,
        title: `#${claim.number} ${claim.title}`,
        why: 'Issue Radar claim is stale.',
        href: safeHref(claim.url),
        external: true,
        quiet: Infinity,
      })
  return rows.sort((a, b) => b.quiet - a.quiet).map(({ quiet: _, ...row }) => row)
}

export interface LandedRow {
  key: string
  taskId: string | null
  title: string
  pr: number | null
  url: string | null
  at: string
}

// What landed, newest first: the landing queue's own record, then tasks
// integrated another way (a person's merge, an older Avoozl), each once.
export function landedRows(landing: LandingView | null, delivery: DeliveryItem[] | null, limit = 8): LandedRow[] {
  const rows: LandedRow[] = []
  const seen = new Set<string>()
  for (const row of landing?.landed ?? []) {
    const [first, ...rest] = row.tasks
    for (const task of row.tasks) seen.add(task.id)
    rows.push({
      key: row.key,
      taskId: first?.id ?? null,
      title: `${first?.title ?? row.key}${rest.length ? ` and ${rest.length} more` : ''}`,
      pr: row.pr,
      url: safeHref(row.url),
      at: row.at,
    })
  }
  for (const item of delivery ?? []) {
    if (seen.has(item.id) || !item.integration?.at) continue
    const pull = item.pullRequests.find((p) => p.merged) ?? null
    rows.push({ key: `task:${item.id}`, taskId: item.id, title: item.title, pr: pull?.number ?? null, url: safeHref(pull?.url ?? null), at: item.integration.at })
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

export interface CiRepository {
  repository: string
  waitShare: number | null
  waitLimit: number
  over: boolean
  closed: number
  repeats: number
}
export interface CiHealth {
  // False when this backend sends no CI facts.
  available: boolean
  repositories: CiRepository[]
  flaky: number
  ciOnly: number
}

// CI health from flow.view's own CI facts (recorded runs, no new read).
export function ciHealth(flow: Pick<FlowViewModel, 'ci' | 'flaky' | 'ciOnly'> | null): CiHealth {
  const repositories = (flow?.ci?.repositories ?? []).map((row) => ({
    repository: row.repository,
    waitShare: row.waitShare,
    waitLimit: row.waitLimit,
    over: row.waitShare !== null && row.waitShare > row.waitLimit,
    closed: row.closedPullRequests,
    repeats: row.repeats.reduce((sum, r) => sum + r.extraRuns, 0),
  }))
  return {
    available: Boolean(flow?.ci),
    repositories,
    flaky: flow?.flaky?.length ?? 0,
    ciOnly: flow?.ciOnly?.length ?? 0,
  }
}
