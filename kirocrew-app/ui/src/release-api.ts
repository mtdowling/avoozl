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
