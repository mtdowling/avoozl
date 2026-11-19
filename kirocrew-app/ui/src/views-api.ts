// Calls and pure helpers for the Graph, Delivery and Conflicts views. All three
// are read-only operations on the app backend. Keep this module free of JSX and
// runtime imports so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import type { SpecPull } from './spec-pr-api.ts'
import { COMMAND_PATH } from './workspace-api.ts'

// A task's owner as every view reports it (R28.5).
export interface TaskOwner {
  authority?: string
  issue?: { number: number | null; url: string | null; repository: string | null } | null
}

// A requirement or design ref on a tasks.md item (Requirement 115): the ref
// as written, the spec file it names, and the line it is on, or null when
// it names nothing.
export interface TaskRef {
  kind: 'requirement' | 'design'
  ref: string
  file: string
  line: number | null
}

export interface GraphTask extends TaskOwner {
  id: string
  title: string
  // Its requirement and design refs, in tasks.md order.
  refs?: TaskRef[]
  // Its plan's epic, across plans (Requirement 59.2); null is No epic.
  epic: string | null
  // The stored plan it came from; older backends omit it.
  planId?: string | null
  // The spec folder its source reference names (graph.view).
  spec?: string | null
  // Its phase inside the plan; null is No phase.
  phase?: { id: string; title: string } | null
  // The level's group, set by groupGraph (graph-layout.ts) for drawing.
  group?: string | null
  // Its place in the tick's dispatch order; older backends omit it.
  order?: number
  kind: 'package' | 'leaf'
  authority: string
  route: string
  completion: string
  repository: string | null
  status: string | null
  complete: boolean
  ready: boolean
  // The batch issue it shares (an ID in `Graph.batches`), or null. Older
  // backends omit it.
  batch?: string | null
  // One drawing state; older backends omit it (see nodeState).
  state?: 'ready' | 'running' | 'waiting' | 'needs-you' | 'done' | 'deferred' | 'draft'
  // A task of a spec not approved yet (graph.view's `drafts`): its spec and
  // the spec's plan state, 'not stored' when it was never stored.
  draft?: { spec: string; status: string } | null
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
  // A step only a person does (R61.11); `needsYou.manual` once it waits for
  // one. Older backends omit them.
  manual?: boolean
  needsYou?: { reason: string; manual?: boolean } | null
}

export interface GraphEdge {
  from: string
  to: string
  kind: string
  condition: string | null
  blocking: boolean
  satisfied: boolean
}

export interface GraphPlan {
  id: string
  title: string
  spec: string | null
  epic: string | null
  phases: { id: string | null; title: string | null; count: number }[]
}

// One issue that closes several tasks together (a batch issue).
export interface GraphBatch {
  id: string
  repository: string
  number: number
  url: string | null
  lead: string
  members: string[]
}

export interface Graph {
  revision: number
  // Batch issues with their member task IDs; older backends omit it.
  batches?: GraphBatch[]
  // Epics across plans, each with its member plan IDs in order.
  epics: { id: string; title: string; count: number; plans?: string[] }[]
  // The plans the Graph drills into, with their phases; older backends omit it.
  plans?: GraphPlan[]
  // The groups this level draws, in order (groupGraph); not from the backend.
  groups?: { id: string | null; title: string }[]
  statuses: { id: string; label: string; complete: boolean }[]
  repositories: string[]
  total: number
  tasks: GraphTask[]
  edges: GraphEdge[]
  // Tasks of specs not approved yet, kept apart so no other view counts
  // them; the Graph draws them with withDrafts. Older backends omit it.
  drafts?: { specs: { name: string; title: string; status: string; count: number }[]; total: number; tasks: GraphTask[]; edges: GraphEdge[] }
}

// The Graph with its draft tasks folded in, or as it is with `show` off.
// Display only: a draft is never ready (its state is 'draft').
export function withDrafts(graph: Graph, show: boolean): Graph {
  const drafts = graph.drafts
  if (!show || !drafts?.tasks.length) return graph
  return { ...graph, total: graph.total + drafts.tasks.length, tasks: [...graph.tasks, ...drafts.tasks], edges: [...graph.edges, ...drafts.edges] }
}

export interface GraphFilter {
  epic?: string
  phase?: string
  repository?: string
  status?: string
  // One plan's tasks: its stored plan ID, its spec folder, or both.
  plan?: string
  spec?: string
}

// What a notice's link found (direct-links D3): its item is open (and
// marked `linked`), closed, or unknown here.
export interface DecisionTarget {
  state: 'open' | 'closed' | 'unknown'
  taskId?: string | null
  newer?: boolean
}

// A worker chat on another machine's crew, from a runner over SSH (R84).
export interface RemoteWorker {
  host: string
  crewId: string
  taskId: string
  state: string
  chatKey: string
  status: string | null
  updatedAt: string
  // The runner crew's dashboard chat URL, built from this machine's own
  // settings. Null when no dashboard URL is set for the host. No token.
  attachUrl: string | null
  // The last read of the runner failed; this is its last answer.
  stale: boolean
  lastOkAt: string | null
}

// The worker machine holding a task's grant (worker pull, R90), on its
// delivery item. `machine` is the worker's Remote Crew ID when this machine
// names one (links.workers), else its login (direct-links D2).
export interface GrantedWorker {
  taskId: string
  spec: string | null
  worker: string
  grant: string
  at: string | null
  machine: string
}

// Where one attempt opens (direct-links D2): a chat, its log, a crew to
// connect, or nothing, with the label and the machine it runs on.
export interface AttemptDestination {
  action: 'chat' | 'log' | 'connect' | 'none'
  label: string | null
  href: string | null
  machine: string
  note?: string | null
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
  // The crew, agent, and why (R41.9, R53.10).
  agent?: string | null
  crew?: string
  crewUnreachable?: boolean
  sessionReason?: string | null
  // `kirocrew` (a chat) or `process` (an agent CLI under the supervisor).
  executor?: string
  // A live `process` session's details from the supervisor (R98.1).
  process?: ProcessDetails
  // Where this exact attempt opens (direct-links D2); older backends omit it.
  open?: AttemptDestination
}

export interface ProcessDetails {
  harness: string
  // The supervisor's record: requested, running, exited, gone or stopped.
  state: string
  exitCode: number | null
  run: number
  logTail: string | null
  // USD, when the harness definition says where to read it.
  cost: number | null
  // What a person runs to join the session; copied, never run here.
  attach: string | null
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

// One task's link set from src/app/tasks/scm-links.mjs (R92.1-R92.3). URLs are
// built by the backend from validated fields; the page still passes each
// through safeHref.
export interface TaskLinks {
  branch: { ref: string; url: string } | null
  pr: { number: number; url: string; state: 'open' | 'closed' | 'merged' | 'unknown' } | null
  // `dot` is the state only when `head` is the task's current commit;
  // otherwise it is 'stale' (R92.3).
  checks: { state: 'pass' | 'fail' | 'pending'; dot: 'pass' | 'fail' | 'pending' | 'stale'; head: string; ageMs: number | null; current: boolean; url: string | null } | null
}

export interface DeliveryBatch {
  id: string | null
  group: string | null
  tasks: string[]
  leader: string
  reason: string | null
  state: string | null
}

export interface DeliveryItem extends TaskOwner {
  id: string
  title: string
  // Its plan, epic and phase (R59.10); older backends omit them.
  planId?: string | null
  epic?: string | null
  phase?: { id: string; title: string } | null
  // A sub-issue link the cap or GitHub left out (R59.9, R59.15).
  subIssue?: { parent: string; reason: string } | null
  status: string | null
  complete: boolean
  repository: string | null
  // The supersede chain (§5.2): the task this one replaced, and its replacement.
  supersedes?: string | null
  supersededBy?: string | null
  // Its planner batch group (§4.37): `id` is the run once it has one; and,
  // when it runs alone, the rule its group broke. Older backends omit both.
  batchGroup?: DeliveryBatch | null
  alone?: string | null
  sessions: DeliverySession[]
  // A worker start queued and not bound yet (direct-links DL1.3).
  starting?: boolean
  // The worker machine holding this task's grant (worker pull).
  worker?: GrantedWorker | null
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
  worktrees: Record<string, unknown>[]
  // Branch, pull request, checks and landed commit from stored records
  // (R92.1-R92.3); older backends omit it.
  links?: TaskLinks | null
  // What a person must do before the task moves (a manual step).
  needsYou?: unknown
  handSetReview?: boolean
  noSession?: 'review' | 'running' | null
  nextAction?: string | null
  planArchived?: string | null
}

// What Needs you shows so a person can decide in place (needs-you-context.mjs).
export interface TaskText {
  summary: string | null
  acceptance: string[]
}
export interface ItemContext {
  task?: { id: string; title: string }
  // planId is null when no stored plan exists; the name is then plain text.
  spec?: { planId: string | null; name: string | null; title: string } | null
  source?: { path: string; lineStart: number | null; lineEnd: number | null } | null
  text?: TaskText
  prior?: ({ title: string | null } & TaskText) | null
  unblocks?: { total: number; tasks: { id: string; title: string }[] }
  links?: TaskLinks | null
  // The checks the task stopped on, each with its first error line when the
  // check gave one.
  failedChecks?: { commit: string | null; checks: { name: string; conclusion: string | null; firstError: string | null }[] } | null
  // A draft's review: counts by severity and the cached AI summary.
  review?: {
    state: string
    current: boolean
    reviewerModel: string | null
    openBySeverity: Record<string, number>
    found: number
    fixed: number
    summary: { text: string; revisionHash: string; current: boolean } | null
  } | null
}

// One task in a review group.
export interface ReviewTask extends TaskOwner {
  id: string
  title: string
  status: string | null
  context?: ItemContext
}

export interface ConflictItem extends TaskOwner {
  context?: ItemContext
  // The item a notice's link opened (direct-links D3).
  linked?: boolean
  planReview?: { planId: string; revisionHash: string }
  // A spec pull request adopted into its spec (R107.5).
  specPull?: SpecPull
  kind: 'decision' | 'needs-human' | 'review' | 'stale-session' | string
  // Null for a review group, which stands for many tasks.
  taskId: string | null
  title: string
  detail: string
  // A crew-mode item: the .avoozl.json hash Let the tick run it saves against.
  hash?: string
  field?: string
  slot?: string
  link?: string | null
  // A needs-human item: why it waits on a person. 'hand-set-review':
  // status running or review with no live session behind it. 'disk': a
  // volume too full for a worktree. 'crew-mode': a workspace a Crew Mode
  // conductor drove, held until a person lets the tick run it (WP1.3).
  reason?: 'review' | 'blocked' | 'crew-mode' | 'hand-set-review' | 'approval' | 'forward' | 'forward-audit' | 'public-branch' | 'disk'
  // A forward item (RC24.9): the mirror change the Forward screen shows.
  forwardId?: string
  // A branch-landing item (RC16.6): the branch and the head a person may approve.
  repository?: string
  branch?: string
  head?: string
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
  // An investigation item (design §4.21): the round, the worker's findings
  // and the falsifier's reply, and the person's choices.
  round?: number
  findings?: Findings
  reply?: FalsifierReply | null
  // A ready-to-merge item (§4.25): the pull request a person merges, or a
  // local task's commit waiting for Integrate.
  pullRequest?: number
  commit?: string
  integrate?: boolean
}

export interface Findings {
  read: string
  cause: string
  plan: string
  check: string
  confidence: 'low' | 'medium' | 'high'
}

export interface FalsifierReply {
  verdict: 'stands' | 'refuted'
  evidence: string
  confidence: 'low' | 'medium' | 'high'
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

// One epic (epic.get, Requirement 59.10): its goal, what done means, and
// each member plan with computed progress. Writes nothing.
export interface EpicView {
  id: string
  title: string
  approved: boolean
  goal: string | null
  done: string | null
  progress: { done: number; total: number }
  complete: boolean
  members: {
    plan: string
    title: string
    confirmed: boolean
    status: string
    progress: { done: number; total: number }
    phases: { id: string | null; title: string | null; done: number; total: number }[]
  }[]
  decisions: { taskId: string; title: string; decision: string; plan: string }[]
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
    // Send message on a `process` session (R98.2): queued for the supervisor.
    sendSession: (workspaceId: string, slot: string, text: string) =>
      run<{ id: string; state: 'queued'; slot: string; taskId: string }>('session.send', { slot, text }, workspaceId),
    decidePlanReview: (workspaceId: string, planId: string, revisionHash: string, action: 'review' | 'skip') =>
      run<unknown>('plan.review.decide', { planId, revisionHash, action }, workspaceId),
    graph: (workspaceId: string, filter: GraphFilter = {}) => {
      const input: Record<string, unknown> = {}
      for (const key of ['epic', 'phase', 'repository', 'status', 'plan', 'spec'] as const) if (filter[key]) input[key] = filter[key]
      return run<Graph>('graph.view', input, workspaceId)
    },
    remote: (workspaceId: string) => run<{ workers: RemoteWorker[] }>('remote.view', {}, workspaceId),
    landing: (workspaceId: string) => run<LandingView>('landing.view', {}, workspaceId),
    epic: (workspaceId: string, id: string) => run<EpicView>('epic.get', { id }, workspaceId),
    delivery: (workspaceId: string) => run<{ revision: number; items: DeliveryItem[] }>('delivery.view', {}, workspaceId).then((r) => r.items),
    deliveryPage: (workspaceId: string) =>
      run<{ revision: number; items: DeliveryItem[]; contentReports?: ContentReport[]; laneLimit?: number | null }>('delivery.view', {}, workspaceId),
    // Replace a local task with a new one; dependents then wait on the new one.
    supersede: (workspaceId: string, id: string, create: { id?: string; title?: string }) =>
      run<{ superseded: { id: string }; task: { id: string } }>('task.supersede', { id, create }, workspaceId),
    conflicts: (workspaceId: string) => run<{ revision: number; items: ConflictItem[] }>('conflicts.view', {}, workspaceId).then((r) => r.items),
    conflictsPage: (workspaceId: string, decision?: string | null) =>
      run<{ revision: number; items: ConflictItem[]; target?: DecisionTarget }>('conflicts.view', decision ? { decision } : {}, workspaceId),
    // Local tasks only: the backend refuses edits to a github task's row.
    updateTask: (workspaceId: string, id: string, change: Record<string, unknown>, expectedRevision: number) =>
      run<unknown>('task.update', { id, ...change }, workspaceId, expectedRevision),
    // Go ahead, Investigate again or Stop on a task's findings (§4.21).
    decideInvestigation: (workspaceId: string, taskId: string, action: 'go' | 'again' | 'stop') => run<unknown>('investigation.decide', { taskId, action }, workspaceId),
    // Land a verified local task under manual ship (§4.25).
    // Let the tick run a workspace a Crew Mode conductor drove (WP1.3).
    letTickRun: (workspaceId: string, expectedHash?: string) => run<unknown>('delivery.runner.release', expectedHash ? { expectedHash } : {}, workspaceId),
    integrate: (workspaceId: string, taskId: string, commit?: string) => run<unknown>('delivery.integrate', { taskId, ...(commit ? { commit } : {}) }, workspaceId),
    // Retry a delivery waiting on a decision, dismissing the named findings.
    retry: (workspaceId: string, taskId: string, dismiss: { finding: string; reason: string }[] = []) => run<unknown>('delivery.retry', { taskId, dismiss }, workspaceId),
    // Content rules (design §4.9): read the matched line again from its
    // source (never stored), and allow one blocked write once, with a reason.
    showContentLine: (workspaceId: string, id: string) => run<{ id: string; line: number | null; text: string | null; reason?: string }>('content.show', { id }, workspaceId),
    allowContentOnce: (workspaceId: string, id: string, reason: string) => run<unknown>('content.allow', { id, reason }, workspaceId),
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
// One portion in a landing queue, or one that landed (landing.view). Read
// from Avoozl's own store; `url` is the pull request's GitHub page.
export interface LandingRow {
  key: string
  base: string
  repository: string | null
  tasks: { id: string; title: string }[]
  pr: number | null
  url: string | null
}
export interface LandingView {
  queue: (LandingRow & { position: number; queuedAt: string | null; held: string })[]
  landed: (LandingRow & { at: string })[]
  landedThisWeek: number
}

export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

// Kiro Crew's own pages and chats: the only relative links the app makes.
// A Remote Crew chat is `/chat?crew=…&crewSid=…` (direct-links D2), and the
// desktop app's registered link opens a local chat.
const APP_PATH = /^\/(?:chat\?(?:sid|crew)=|apps\/|settings\/instances$)[^\s\\]*$/
const DESKTOP = /^kirocrew:\/\/chat\?sid=[A-Za-z0-9._:%-]+$/

// Every href in the UI: an http(s) URL (safeHref) or one of Kiro Crew's own
// pages. Anything else is undefined, so the anchor renders as plain text.
export function linkHref(value: unknown): string | undefined {
  if (typeof value === 'string' && (APP_PATH.test(value) || DESKTOP.test(value))) return value
  return safeHref(value) ?? undefined
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
  const flags = [session.served.withheld ? 'withheld' : null, session.served.changed ? 'changed mid-session' : null].filter(Boolean).join(', ')
  return `${requested}, served ${session.served.model ?? 'unknown'}${flags ? ` (${flags})` : ''}`
}

// A verdict's one-line label: role, verdict (or why it has none), model, and
// whether a newer commit made it stale.
export function verdictLabel(verdict: RoundVerdict): string {
  const said = verdict.outcome === 'refused' ? `${verdict.verdict ?? 'verdict'} refused` : (verdict.verdict ?? (verdict.outcome === 'failed' ? 'no verdict' : verdict.outcome))
  const model = verdict.served && verdict.served !== verdict.model ? `${verdict.model ?? 'model unknown'} → served ${verdict.served}` : (verdict.model ?? 'model unknown')
  return [verdict.role, said, model, verdict.stale ? 'stale' : null].filter(Boolean).join(' · ')
}

// Scalar fields of a record another task stores (deliveries, worktrees), for
// display without guessing its shape.
export function scalarFields(record: Record<string, unknown>): [string, string][] {
  return Object.entries(record)
    .filter(([key, value]) => key !== 'taskId' && ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => [key, String(value)])
}

export const CONFLICT_LABELS: Record<string, string> = {
  'plan-review': 'Draft review',
  decision: 'Open decision',
  'needs-human': 'Needs you',
  review: 'Review',
  'stale-session': 'Session ended',
  untick: 'Tick removed',
  'content-match': 'Content rule',
  'content-unavailable': 'Rule set unavailable',
  'provider-out': 'Provider out',
  'tick-failed': 'Tick failed',
  investigation: 'Findings',
  'ready-to-merge': 'Ready to merge',
  'branch-landing': 'Ready to land',
}

// A local task that is not already replaced may be superseded by hand. GitHub
// tasks are replaced in their plan instead.
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
  return status === 'running' ? 'Waiting on your decision: marked running, but no session is running' : 'Waiting on your decision: marked in review, but no review is running'
}
