// Calls and pure helpers for the Graph, Delivery and Conflicts views. All three
// are read-only operations on the app backend. Keep this module free of JSX and
// runtime imports so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

// A task's owner as every view reports it (R28.5).
export interface TaskOwner {
  authority?: string
  issue?: { number: number | null; url: string | null; repository: string | null } | null
}

export interface GraphTask extends TaskOwner {
  id: string
  title: string
  epic: string | null
  // The stored plan it came from; older backends omit it.
  planId?: string | null
  // The spec folder its epic or source reference names (graph.view).
  spec?: string | null
  // Its place in the tick's dispatch order; older backends omit it.
  order?: number
  kind: 'epic' | 'package' | 'leaf'
  authority: string
  route: string
  completion: string
  repository: string | null
  status: string | null
  complete: boolean
  ready: boolean
  // One drawing state; older backends omit it (see nodeState).
  state?: 'ready' | 'running' | 'waiting' | 'needs-you' | 'done' | 'deferred'
  // Waits for review because its own plan text changed (or it is new).
  review?: boolean
  decision: string | null
  // Status review with no session, run or delivery behind it: set by hand.
  handSetReview?: boolean
  // Which status it has with no live session: 'review' or 'running'.
  noSession?: 'review' | 'running' | null
  nextAction?: string | null
  // The archived plan this task belongs to (plan.archive), or null.
  planArchived?: string | null
  issue: { number: number | null; url: string | null; repository: string | null } | null
}

export interface GraphEdge {
  from: string
  to: string
  kind: string
  condition: string | null
  blocking: boolean
  satisfied: boolean
}

export interface Graph {
  revision: number
  epics: { id: string; title: string; count: number }[]
  statuses: { id: string; label: string; complete: boolean }[]
  repositories: string[]
  total: number
  tasks: GraphTask[]
  edges: GraphEdge[]
}

export interface GraphFilter {
  epic?: string
  repository?: string
  status?: string
  // One plan's tasks: its stored plan ID, its spec folder, or both.
  plan?: string
  spec?: string
}

export interface DeliverySession {
  slot: string
  role: string
  attempt: number
  title: string | null
  status: string | null
  statusAt: string | null
  boundAt: string | null
  model?: string | null
  // What Kiro Crew said the session ran on; null when it does not report it.
  served?: { model: string | null; withheld: boolean; changed: boolean } | null
  commit?: string | null
  link?: string | null
  // Placement (§4.10, R41.9, R53.10).
  agent?: string | null
  crew?: string
  crewUnreachable?: boolean
  placementReason?: string | null
  sessionReason?: string | null
}

// One role's verdict on one subject commit (design §5.2).
export interface RoundVerdict {
  role: string
  attempt: number
  outcome: string
  verdict: string | null
  model: string | null
  served?: string | null
  commit: string | null
  stale: boolean
  cause: string | null
  slot: string | null
  link: string | null
  findings: { ref: string; kind: string; paths: string[]; text: string; state: string }[]
}

export interface ReviewRound {
  commit: string | null
  current: boolean
  verdicts: RoundVerdict[]
}

// A GitHub leaf's pull-request reviews on its head commit (task 9.10).
export interface GitHubReviews {
  state: 'approved' | 'changes-requested' | 'pending' | string
  approvals: number
  needed: number
  headSha: string | null
  pullRequest: string | null
  pullRequestNumber: number | null
  held: boolean
  reviews: {
    reviewer: string
    state: string
    commit: string | null
    stale: boolean
    allowed: boolean
    reason: string | null
  }[]
}

// Pull request feedback sent back to the leaf's worker (§4.13, R54.13).
export interface PrFeedback {
  pullRequest: string | null
  latest: { kinds: string[]; at: string; to: string } | null
  rounds: number
  bound: number | null
  session: string | null
  stopped: string | null
  notRelayed: number
  notRelayedLinks: { login: string; url: string | null }[]
  error: string | null
}

const FEEDBACK_KINDS: Record<string, string> = {
  check: 'failed checks',
  review: 'review',
  comment: 'comment',
  conflict: 'conflict',
  'auto-merge': 'auto-merge off',
}
const FEEDBACK_TO: Record<string, string> = {
  session: 'sent to the worker',
  conductor: 'queued for the conductor',
  'new attempt': 'carried to a new attempt',
}
const FEEDBACK_STOPS: Record<string, string> = {
  bound: 'stopped: all rounds used',
  'same-check': 'stopped: the same check failed 3 times',
  blocked: 'stopped: the worker is blocked',
}

// One line: rounds used out of the bound, then the latest round.
export function prFeedbackLine(feedback: PrFeedback): string {
  const parts = [`${feedback.rounds} of ${feedback.bound ?? '?'} rounds`]
  if (feedback.latest)
    parts.push(
      `last: ${feedback.latest.kinds.map((kind) => FEEDBACK_KINDS[kind] ?? kind).join(', ')}, ${FEEDBACK_TO[feedback.latest.to] ?? feedback.latest.to}`,
    )
  if (feedback.stopped) parts.push(FEEDBACK_STOPS[feedback.stopped] ?? `stopped: ${feedback.stopped}`)
  return parts.join(' · ')
}

export interface DeliveryItem extends TaskOwner {
  id: string
  title: string
  status: string | null
  complete: boolean
  repository: string | null
  // The supersede chain (§5.2): the task this one replaced, and its replacement.
  supersedes?: string | null
  supersededBy?: string | null
  sessions: DeliverySession[]
  runs: { id: string; state: string; provider: string | null; createdAt: string | null }[]
  evidence: {
    id?: string
    kind?: string | null
    commit?: string | null
    text: string | null
    exitCode?: number | null
    at?: string | null
  }[]
  integration: { commit: string | null; branch: string | null; at: string | null } | null
  pullRequests: { number: number | null; url: string | null; merged: boolean }[]
  deliveries: Record<string, unknown>[]
  rounds?: ReviewRound[]
  githubReviews?: GitHubReviews | null
  prFeedback?: PrFeedback | null
  worktrees: Record<string, unknown>[]
  // The GitHub Project card, when the task is on the board.
  project?: { status: string | null; release: string | null; wave: number | null; notes: string[] } | null
  // What a person must do before a remote leaf moves (route or plugin).
  needsYou?: unknown
  handSetReview?: boolean
  noSession?: 'review' | 'running' | null
  nextAction?: string | null
  planArchived?: string | null
}

// One task in a review group.
export interface ReviewTask extends TaskOwner {
  id: string
  title: string
  status: string | null
}

export interface ConflictItem extends TaskOwner {
  kind: 'decision' | 'needs-human' | 'review' | 'stale-session' | 'resource' | 'github-conflict' | 'tracker-conflict' | string
  // Null for a review group, which stands for many tasks.
  taskId: string | null
  title: string
  detail: string
  field?: string
  slot?: string
  link?: string | null
  runs?: string[]
  // A github-conflict: Avoozl's value, GitHub's, and who changed it when.
  expected?: string | string[] | null
  actual?: string | string[] | null
  changedBy?: string | null
  changedAt?: string | null
  choices?: ('desired' | 'github')[]
  resolution?: 'desired' | 'github' | null
  // A needs-human item: why it waits on a person. 'crew': an Issue Radar
  // crew asked for one on an issue no task owns (R52.10). 'hand-set-review':
  // status running or review with no live session behind it.
  reason?: 'review' | 'blocked' | 'crew' | 'hand-set-review'
  // A stale-session item: its delivery's state; Retry applies to 'decision'.
  deliveryState?: string | null
  // A content-match or content-unavailable item (design §4.9): the decision
  // id, the rule set, its rules and where they matched. Never the text.
  id?: string
  set?: string
  rules?: string[]
  boundary?: string
  target?: string | null
  line?: number | null
  readable?: boolean
  // A review group: the plan it is for and its tasks.
  plan?: string
  tasks?: ReviewTask[]
  // The archived plan the item's task belongs to, or null.
  planArchived?: string | null
}

// A `report` content rule finding: the content was written.
export interface ContentReport {
  id: string
  set: string
  rule: string
  boundary: string
  target: string
  line: number | null
  taskId: string | null
  version: string | null
  at: string | null
}

export function viewsClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string, expectedRevision?: number) => {
    const reply = await api.post<{ result: T }>(COMMAND_PATH, {
      operation,
      input,
      workspaceId,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    })
    return reply.result
  }
  return {
    graph: (workspaceId: string, filter: GraphFilter = {}) => {
      const input: Record<string, unknown> = {}
      for (const key of ['epic', 'repository', 'status', 'plan', 'spec'] as const)
        if (filter[key]) input[key] = filter[key]
      return run<Graph>('graph.view', input, workspaceId)
    },
    delivery: (workspaceId: string) =>
      run<{ revision: number; items: DeliveryItem[] }>('delivery.view', {}, workspaceId).then(
        (r) => r.items,
      ),
    deliveryPage: (workspaceId: string) =>
      run<{ revision: number; items: DeliveryItem[]; contentReports?: ContentReport[] }>('delivery.view', {}, workspaceId),
    // Replace a local task with a new one; dependents then wait on the new one.
    supersede: (workspaceId: string, id: string, create: { id?: string; title?: string }) =>
      run<{ superseded: { id: string }; task: { id: string } }>('task.supersede', { id, create }, workspaceId),
    conflicts: (workspaceId: string) =>
      run<{ revision: number; items: ConflictItem[] }>('conflicts.view', {}, workspaceId).then(
        (r) => r.items,
      ),
    conflictsPage: (workspaceId: string) =>
      run<{ revision: number; items: ConflictItem[] }>('conflicts.view', {}, workspaceId),
    // A person's choice for one conflicted managed field; the next
    // projection applies it.
    resolveConflict: (workspaceId: string, taskId: string, field: string, choice: 'desired' | 'github') =>
      run<unknown>('github.conflict.resolve', { taskId, field, choice }, workspaceId),
    // Local tasks only: the backend refuses edits to a github task's row.
    updateTask: (workspaceId: string, id: string, change: Record<string, unknown>, expectedRevision: number) =>
      run<unknown>('task.update', { id, ...change }, workspaceId, expectedRevision),
    // Retry a delivery waiting on a decision, dismissing the named findings.
    retry: (workspaceId: string, taskId: string, dismiss: { finding: string; reason: string }[] = []) =>
      run<unknown>('delivery.retry', { taskId, dismiss }, workspaceId),
    // Content rules (design §4.9): read the matched line again from its
    // source (never stored), and allow one blocked write once, with a reason.
    showContentLine: (workspaceId: string, id: string) =>
      run<{ id: string; line: number | null; text: string | null; reason?: string }>('content.show', { id }, workspaceId),
    allowContentOnce: (workspaceId: string, id: string, reason: string) =>
      run<unknown>('content.allow', { id, reason }, workspaceId),
  }
}

export function graphSummary(graph: Graph) {
  return {
    tasks: graph.tasks.length,
    edges: graph.edges.length,
    blocking: graph.edges.filter((e) => e.blocking).length,
    ready: graph.tasks.filter((t) => t.ready).length,
  }
}

// Only http(s) links are clickable. Evidence and PR text comes from agents and
// GitHub, so anything else (javascript:, file:, data:) renders as plain text.
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

export function sessionLabel(session: DeliverySession): string {
  return [
    `${session.role} #${session.attempt}`,
    session.crewUnreachable ? 'crew unreachable' : (session.status ?? 'not observed'),
    session.crew && session.crew !== 'local' ? `on ${session.crew}` : null,
    session.agent && session.agent !== 'kirocrew-worker' ? session.agent : null,
    modelLabel(session),
  ]
    .filter(Boolean)
    .join(' · ')
}

// Requested vs served model (§5.2). A Kiro Crew that reports no served model
// gets "served model not reported", and its requested model is trusted.
export function modelLabel(session: DeliverySession): string | null {
  if (session.served === undefined) return session.model ?? null
  const requested = `requested ${session.model ?? 'agent default'}`
  if (!session.served) return `${requested}, served model not reported`
  const flags = [session.served.withheld ? 'withheld' : null, session.served.changed ? 'changed mid-session' : null]
    .filter(Boolean)
    .join(', ')
  return `${requested}, served ${session.served.model ?? 'unknown'}${flags ? ` (${flags})` : ''}`
}

// A verdict's one-line label: role, verdict (or why it has none), model, and
// whether a newer commit made it stale.
export function verdictLabel(verdict: RoundVerdict): string {
  const said =
    verdict.outcome === 'refused'
      ? `${verdict.verdict ?? 'verdict'} refused`
      : (verdict.verdict ?? (verdict.outcome === 'failed' ? 'no verdict' : verdict.outcome))
  const model =
    verdict.served && verdict.served !== verdict.model
      ? `${verdict.model ?? 'model unknown'} → served ${verdict.served}`
      : (verdict.model ?? 'model unknown')
  return [verdict.role, said, model, verdict.stale ? 'stale' : null]
    .filter(Boolean)
    .join(' · ')
}

// One GitHub review's label: reviewer, state, and why it counts for nothing.
export function githubReviewLabel(review: GitHubReviews['reviews'][number]): string {
  return [
    review.reviewer,
    review.state,
    review.stale ? `stale (${review.commit?.slice(0, 12) ?? 'older commit'})` : null,
    review.allowed ? null : `ignored: ${review.reason ?? 'not allowed'}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

// Scalar fields of a record another task stores (deliveries, worktrees), for
// display without guessing its shape.
export function scalarFields(record: Record<string, unknown>): [string, string][] {
  return Object.entries(record)
    .filter(([key, value]) => key !== 'taskId' && ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => [key, String(value)])
}

export const CONFLICT_LABELS: Record<string, string> = {
  decision: 'Open decision',
  'needs-human': 'Needs you',
  review: 'Review',
  'stale-session': 'Session ended',
  resource: 'Shared resource',
  'content-match': 'Content rule',
  'content-unavailable': 'Rule set unavailable',
}

// A local task that is not already replaced may be superseded by hand. GitHub
// and plugin tasks are replaced in their plan or tracker instead.
export function canSupersede(item: DeliveryItem): boolean {
  return (item.authority ?? 'local') === 'local' && !item.supersededBy && item.status !== 'superseded'
}

// The new task's fields from the form: blank inputs fall back to the defaults
// the operation picks (the next free ID, the old title).
export function supersedeInput(form: { id: string; title: string }): { id?: string; title?: string } {
  const input: { id?: string; title?: string } = {}
  if (form.id.trim()) input.id = form.id.trim()
  if (form.title.trim()) input.title = form.title.trim()
  return input
}

// One review chat or verdict on a task, for the drawer, the Delivery card
// and the In flight card: who reviews, the model asked for and the one
// served, the round, the verdict, and the chat to attach to.
export interface ReviewRun {
  key: string
  role: string
  round: number
  requested: string | null
  served: string | null
  status: string | null
  verdict: string | null
  stale: boolean
  link: string | null
  live: boolean
}

const ENDED_SESSION = new Set(['closed', 'lost', 'gone'])

// Every non-worker session and every review verdict on a delivery item,
// newest round first. A verdict and the session that gave it are one run.
export function reviewRuns(item: DeliveryItem | null): ReviewRun[] {
  if (!item) return []
  const runs = new Map<string, ReviewRun>()
  for (const session of item.sessions)
    if (session.role !== 'worker')
      runs.set(`${session.role}:${session.attempt}`, {
        key: session.slot,
        role: session.role,
        round: session.attempt,
        requested: session.model ?? null,
        served: session.served?.model ?? null,
        status: session.status,
        verdict: null,
        stale: false,
        link: session.link ?? null,
        live: !ENDED_SESSION.has(session.status ?? ''),
      })
  for (const round of item.rounds ?? [])
    for (const verdict of round.verdicts) {
      if (verdict.role === 'checks') continue
      const key = `${verdict.role}:${verdict.attempt}`
      const known = runs.get(key)
      runs.set(key, {
        key: known?.key ?? `${key}:${verdict.commit ?? ''}`,
        role: verdict.role,
        round: verdict.attempt,
        requested: known?.requested ?? verdict.model ?? null,
        served: known?.served ?? verdict.served ?? null,
        status: known?.status ?? null,
        verdict: verdict.verdict ?? verdict.outcome ?? null,
        stale: verdict.stale,
        link: known?.link ?? verdict.link ?? null,
        live: known?.live ?? false,
      })
    }
  return [...runs.values()].sort((a, b) => b.round - a.round || a.role.localeCompare(b.role))
}

// The plain label for a status with no live session behind it (graph.view
// `noSession`): set by hand, or left by a session that ended.
export function noSessionLabel(status: string | null | undefined): string {
  return status === 'running'
    ? 'Waiting on your decision: marked running, but no session is running'
    : 'Waiting on your decision: marked in review, but no review is running'
}
