// Dashboards › Landing queue (task 44.5): the landing.queue read and how its
// rows draw. The read comes from Avoozl's store only, so Refresh never waits
// on GitHub. Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { safeHref } from './views-api.ts'
import type { BadgeVariant } from './ui/Badge.tsx'

export type HoldKind = 'stopped' | 'off' | 'review' | 'failing' | 'pending' | 'conflict' | 'path' | 'behind' | 'next' | 'held' | 'waiting'

export interface LandingLink {
  kind: string
  repository: string
  url: string
  number?: number
  ref?: string
  state?: string
}

export interface LandingItem {
  key: string
  tasks: { id: string; title: string }[]
  commit: string | null
  pr: LandingLink | null
  branch: LandingLink | null
  checks: { state: string; dot: string; current: boolean; ageMs: number | null; url: string | null } | null
  // A check of this entry ran with no isolation; older backends omit it.
  unsandboxed?: boolean
  // Place in its queue from 1; null for a task out of the queue that comes back.
  position: number | null
  since: string | null
  // Whole minutes since it was queued; null for a task out of the queue.
  waitedMinutes: number | null
  hold: { kind: HoldKind; text: string }
}

export type BatchStep = 'testing' | 'rerun' | 'bisect' | 'push'

// The merge batch being tested now: its members and its step.
export interface TestingBatch {
  members: string[]
  step: BatchStep
  since: string
}

// One finished merge batch.
export interface FinishedBatch {
  at: string
  size: number
  landed: number
  culprits: number
  seconds: number | null
  outcome: 'landed' | 'partly landed' | 'culprit sent back'
}

// The size limit and the failure rate it comes from.
export interface BatchSize {
  limit: number
  fixed: boolean
  failureRate: number
  results: number
}

export interface LandingBase {
  key: string
  repositoryId: string
  repository: string | null
  base: string
  landing: string | null
  items: LandingItem[]
  // Only for a base that lands directly, in merge batches.
  testing?: TestingBatch | null
  last?: FinishedBatch[]
  size?: BatchSize
}

export interface LandingQueue {
  bases: LandingBase[]
  readAt: string
}

export function landingQueueClient(api: AppApi) {
  return {
    read: async (workspaceId: string) => (await api.post<{ result: LandingQueue }>(COMMAND_PATH, { operation: 'landing.queue', input: {}, workspaceId })).result,
  }
}

// The hold's badge: red when it needs a fix, yellow when a person must act,
// green for the next to land, plain for the rest.
const VARIANT: Partial<Record<HoldKind, BadgeVariant>> = {
  stopped: 'danger',
  failing: 'danger',
  conflict: 'danger',
  review: 'warning',
  path: 'warning',
  next: 'success',
  pending: 'info',
  held: 'warning',
}
export const holdVariant = (kind: HoldKind): BadgeVariant | undefined => VARIANT[kind]

// The badge's short word; the full reason sits under the title.
const WORD: Record<HoldKind, string> = {
  stopped: 'Line stopped',
  off: 'Landing off',
  review: 'Review missing',
  failing: 'Checks failing',
  pending: 'Checks pending',
  conflict: 'Conflict',
  path: 'Path hold',
  behind: 'Waiting',
  next: 'Next',
  held: 'Held',
  waiting: 'Waiting',
}
export const holdWord = (kind: HoldKind) => WORD[kind] ?? 'Held'

// A group's heading: the repository (or repository ID) and the base it lands on.
export const baseTitle = (base: LandingBase) => `${base.repository ?? base.repositoryId} → ${base.base}`

// How the group lands, for its heading's side note.
export const landingNote = (base: LandingBase) =>
  base.landing === 'pr' ? 'by pull request' : base.landing === 'direct' ? 'in merge batches' : base.landing === 'off' ? 'landing off' : 'local'

// The item's links: only http(s), each opening a new tab.
export function itemLinks(item: LandingItem): { key: string; label: string; href: string }[] {
  const out: { key: string; label: string; href: string }[] = []
  const pr = safeHref(item.pr?.url ?? null)
  if (pr && item.pr?.number) out.push({ key: 'pr', label: `PR #${item.pr.number}`, href: pr })
  const branch = safeHref(item.branch?.url ?? null)
  if (branch && item.branch?.ref) out.push({ key: 'branch', label: item.branch.ref, href: branch })
  return out
}

export const itemCount = (view: LandingQueue | null) => (view ? view.bases.reduce((n, b) => n + b.items.length, 0) : 0)

const STEP: Record<BatchStep, string> = {
  testing: 'running the checks',
  rerun: 'running a failed check again',
  bisect: 'looking for the member that broke it',
  push: 'pushing',
}

// What the merge batch under test is doing.
export const testingLine = (batch: TestingBatch) => `${batch.members.length} ${batch.members.length === 1 ? 'member' : 'members'}, ${STEP[batch.step] ?? batch.step}`

// A duration in seconds as minutes and seconds.
export function batchTime(seconds: number | null): string {
  if (seconds == null) return ''
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

// The size line: the limit, whether a person set it, and the failure rate.
export function sizeLine(size: BatchSize): string {
  const rate = `${Math.round(size.failureRate * 100)}%`
  const basis = size.results < 5 ? 'assumed until 5 results are in' : `over the last ${size.results} results`
  return `Up to ${size.limit} ${size.limit === 1 ? 'task' : 'tasks'} per batch${size.fixed ? ' (set in the repository settings)' : ''}. Failure rate ${rate}, ${basis}.`
}
