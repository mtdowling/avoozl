// Calls and pure helpers for release (RC4.5): the Release queue on the
// Dashboard and the release mode in Settings. The backend
// (src/app/radar-coder-queue.mjs) decides every state and reason; this module
// only reads and groups. No JSX and no runtime imports, so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export const RELEASE_MODES = ['automatic', 'step', 'hold'] as const
export type ReleaseMode = (typeof RELEASE_MODES)[number]

// What each mode does, in the words the page shows.
export const MODE_TEXT: Record<ReleaseMode, { title: string; line: string; use: string }> = {
  automatic: {
    title: 'Automatic',
    line: 'The tick adds the ready label as slots free, in graph order.',
    use: 'Use it when the spec is approved and you want crews to keep going.',
  },
  step: {
    title: 'Step',
    line: 'Nothing is released until you click Release for a phase.',
    use: 'Use it to look at each phase before the next one starts.',
  },
  hold: {
    title: 'Hold',
    line: 'Avoozl releases nothing. You add the ready label by hand.',
    use: 'Use it while you change the spec or the crews.',
  },
}

export type RowState = 'released' | 'claimed' | 'next' | 'held'

export interface QueueRow {
  taskId: string
  title: string
  planId: string
  spec: string | null
  phase: string
  scope: string | null
  label: string
  number: number | null
  url: string | null
  manual: boolean
  state: RowState
  reason: string
  used: number
  capacity: number
}

export interface QueueStep {
  planId: string
  spec: string | null
  phase: string
  title: string
  released: boolean
}

export interface QueueRepository {
  repository: string
  ready: string
  mode: ReleaseMode
  capacity: number
  scopes: { label: string; capacity: number }[]
  rows: QueueRow[]
  steps: QueueStep[]
}

export interface IntegrationBranch {
  key: string
  repository: string
  branch: string
  head: string | null
  base: string | null
  behind: number | null
  checks: 'green' | 'red' | 'pending' | null
  tasksMerged: number
  tasksTotal: number
  accepted: boolean
  landing: { head: string; approvedBy: string; at: string } | null
  error: string | null
  readAt: number | null
}

// One line per branch: tasks merged, distance behind the default branch, and the head's checks.
export function branchLine(row: IntegrationBranch): string {
  const behind = row.behind === null ? 'distance unknown' : row.behind === 0 ? `level with ${row.base}` : `${row.behind} behind ${row.base}`
  const checks = row.checks ? `head checks ${row.checks}` : 'head not read yet'
  return `${row.tasksMerged} of ${row.tasksTotal} tasks merged · ${behind} · ${checks}${row.accepted ? ' · accepted' : ''}`
}

export interface ArmedPull {
  repository: string
  number: number
  armedAt: string
}

// Review drafts made from the review label (RC20.6), from
// src/app/review-draft.mjs reviewDraftsView.
export type DraftState = 'queued' | 'chat' | 'waiting' | 'stale' | 'submitted' | 'discarded' | 'replaced' | 'ended' | 'refused' | 'closed'
export interface ReviewDraft {
  id: string
  repository: string
  number: number
  title: string
  url: string | null
  reviewer: string
  state: DraftState
  headSha: string | null
  staleHead: string | null
  requestedAt: string
  draftedAt: string | null
  closedAt: string | null
  reviewUrl: string | null
  chat: string | null
}
export interface ReviewDrafts {
  items: ReviewDraft[]
  searches: { label: string; query: string; url: string }[]
}

// What each state means, in the words the page shows.
export const DRAFT_STATE_TEXT: Record<DraftState, string> = {
  queued: 'Waiting for a chat',
  chat: 'Chat drafting',
  waiting: 'Waiting for you',
  stale: 'Stale: the pull request moved',
  submitted: 'Submitted',
  discarded: 'Discarded',
  replaced: 'Replaced by a new draft',
  ended: 'Chat ended without a draft',
  refused: 'Blocked by content rules',
  closed: 'Pull request closed',
}

export interface ReleaseQueue {
  repositories: QueueRepository[]
}

export function releaseClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) => {
    const reply = await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })
    return reply.result
  }
  return {
    queue: (workspaceId: string) => run<ReleaseQueue>('radar.releasequeue', {}, workspaceId),
    // Pull requests Avoozl armed that are still open, and the person-only Disarm (RC5.4).
    armed: (workspaceId: string) => run<{ pullRequests: ArmedPull[] }>('radar.armed', {}, workspaceId),
    disarm: (workspaceId: string, repository: string, pullRequest: number) => run<unknown>('radar.disarm', { repository, pullRequest }, workspaceId),
    // Integration branches (RC16.8) and the person-only landing approval (RC16.6).
    branches: (workspaceId: string) => run<{ branches: IntegrationBranch[] }>('integration.view', {}, workspaceId),
    land: (workspaceId: string, repository: string, branch: string, head: string) => run<unknown>('integration.land', { repository, branch, head }, workspaceId),
    drafts: (workspaceId: string, filter: { repository?: string; state?: string } = {}) =>
      run<ReviewDrafts>('review.drafts', Object.fromEntries(Object.entries(filter).filter(([, value]) => value)), workspaceId),
    // One click releases the next phase of a spec that has none yet.
    step: (workspaceId: string, planId: string) => run<{ planId: string; phase: string; title: string }>('radar.releasestep', { planId }, workspaceId),
  }
}

export const STATE_LABEL: Record<RowState, string> = {
  released: 'Released',
  claimed: 'Claimed',
  next: 'Next',
  held: 'Held',
}

// "2 at a time" or, for Infinity or 0, a plain word.
export function capacityText(capacity: number): string {
  if (!Number.isFinite(capacity)) return 'no limit'
  return capacity === 0 ? 'nothing released' : `${capacity} at a time`
}

// The Step click each plan offers: its first phase with no click.
export function nextSteps(repository: QueueRepository): QueueStep[] {
  const seen = new Set<string>()
  return repository.steps.filter((step) => {
    if (step.released || seen.has(step.planId)) return false
    seen.add(step.planId)
    return true
  })
}

// Why anything is held, grouped so the page can say each reason once.
export function heldReasons(repository: QueueRepository): { reason: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const row of repository.rows) if (row.state === 'held') counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1)
  return [...counts].map(([reason, count]) => ({ reason, count }))
}
