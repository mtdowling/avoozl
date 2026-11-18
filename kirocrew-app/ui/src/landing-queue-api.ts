// Dashboards › Landing queue (task 44.5): the landing.queue read and how its
// rows draw. The read comes from Avoozl's store only, so Refresh never waits
// on GitHub. Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { safeHref } from './views-api.ts'
import type { BadgeVariant } from './Badge.tsx'

export type HoldKind = 'stopped' | 'off' | 'review' | 'failing' | 'pending' | 'conflict' | 'path' | 'behind' | 'next' | 'train' | 'held' | 'waiting'

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
  // Place in its queue from 1; null for a task out of the queue that comes back.
  position: number | null
  since: string | null
  hold: { kind: HoldKind; text: string }
}

// An integrator train target's queue depth and running train with its step.
export interface TrainQueue {
  depth: number
  train: { id: string; policy: string; step: string; members: number; startedAt: string } | null
}

export interface LandingBase {
  key: string
  projectId: string
  repository: string | null
  base: string
  landing: string | null
  queue?: TrainQueue
  items: LandingItem[]
}

export interface LandingQueue {
  bases: LandingBase[]
  readAt: string
}

export function landingQueueClient(api: AppApi) {
  return {
    read: async (workspaceId: string) =>
      (await api.post<{ result: LandingQueue }>(COMMAND_PATH, { operation: 'landing.queue', input: {}, workspaceId })).result,
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
  train: 'info',
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
  train: 'In a train',
  held: 'Held',
  waiting: 'Waiting',
}
export const holdWord = (kind: HoldKind) => WORD[kind] ?? 'Held'

// A group's heading: the repository (or project ID) and the base it lands on.
export const baseTitle = (base: LandingBase) => `${base.repository ?? base.projectId} → ${base.base}`

// How the group lands, for its heading's side note.
export const landingNote = (base: LandingBase) =>
  base.landing === 'pr' ? 'by pull request' : base.landing === 'direct' ? 'direct' : base.landing === 'train' ? 'by integrator train' : base.landing === 'off' ? 'landing off' : 'local'

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

// A train target's line under its heading: how many wait, and the running
// train with its step. Empty for a base that does not land in trains.
export function queueLine(base: LandingBase): string | null {
  if (!base.queue) return null
  const waiting = `${base.queue.depth} in the queue`
  const train = base.queue.train
  return train ? `${waiting}. ${train.id} (${train.policy}, ${train.members} branches) is at ${train.step}.` : `${waiting}. No train is running.`
}
