// Calls and pure helpers for the Epics screen and Trace's Done work. The
// backend (src/app/epics-view.mjs, src/app/trace-done.mjs) decides every gate,
// count and reason; this file reads them and words them. No JSX and no
// runtime imports, so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import type { Drill } from './graph-layout.ts'

export type Gate = 'passed' | 'open' | 'closed'

export interface EpicPhase {
  id: string
  title: string
  gate: Gate
  total: number
  merged: number
  // Merged, released or claimed.
  released: number
  held: string | null
}

export interface EpicPlan {
  id: string
  title: string
  state: string
  phases: EpicPhase[]
}

export interface Epic {
  id: string
  title: string
  tasks: number
  merged: number
  running: number
  plans: EpicPlan[]
}

export interface UnprojectedPlan {
  id: string
  title: string
  state: string
  tasks: number
  reason: string
}

export interface EpicsView {
  epics: Epic[]
  unprojected: UnprojectedPlan[]
  radarGraph: { url: string; focus: boolean }
}

export interface DoneRow {
  taskId: string
  title: string
  repository: string
  issue: number
  url: string
  pr: number | null
  prUrl: string | null
  mergedAt: string
  by: { kind: 'radar-crew'; id: string | null; name: string | null } | null
}

export function epicsClient(api: AppApi) {
  const run = async <T>(operation: string, workspaceId: string) => (await api.post<{ result: T }>(COMMAND_PATH, { operation, input: {}, workspaceId })).result
  return {
    read: (workspaceId: string) => run<EpicsView>('epics.view', workspaceId),
    done: (workspaceId: string) => run<{ rows: DoneRow[] }>('trace.done', workspaceId),
  }
}

export const GATE_TEXT: Record<Gate, string> = { passed: 'Passed', open: 'Open', closed: 'Closed' }
export const GATE_HELP: Record<Gate, string> = {
  passed: 'Every task in this phase has merged.',
  open: 'Tasks in this phase may be released.',
  closed: 'An earlier phase has not merged yet, so nothing here is released.',
}

// "1 of 4 released", counting merged tasks as released.
export const releaseCount = (phase: Pick<EpicPhase, 'released' | 'total'>) => `${phase.released} of ${phase.total} released`

// "5 of 12 merged · 1 running".
export function epicLine(epic: Pick<Epic, 'tasks' | 'merged' | 'running'>): string {
  const parts = [`${epic.tasks} ${epic.tasks === 1 ? 'task' : 'tasks'}`, `${epic.merged} merged`]
  if (epic.running) parts.push(`${epic.running} running`)
  return parts.join(' · ')
}

// The Graph's own drill-in for a spec or one of its phases. Opening it is one
// Back step (App's `go`).
export const planDrill = (plan: Pick<EpicPlan, 'id' | 'title'>): Drill => ({ kind: 'plan', id: plan.id, title: plan.title })
export const phaseDrill = (plan: Pick<EpicPlan, 'id'>, phase: Pick<EpicPhase, 'id' | 'title'>): Drill => ({ kind: 'phase', plan: plan.id, id: phase.id, title: phase.title })
export const epicDrill = (epic: Pick<Epic, 'id' | 'title'>): Drill => ({ kind: 'epic', id: epic.id, title: epic.title })

// Where "the issues on GitHub and their graph" goes. Issue Radar keeps its
// view and the issue it focuses on in the browser's own storage and has no
// address for either, so the link is its page, and the text says so.
export function radarGraphLink(view: Pick<EpicsView, 'radarGraph'>): { href: string; label: string; note: string | null } {
  return {
    href: view.radarGraph.url,
    label: 'Open the Issue Radar graph',
    note: view.radarGraph.focus ? null : 'Choose the Graph view there, then the issue.',
  }
}

// The Done list's line for who did it.
export function whoLine(row: Pick<DoneRow, 'by'>, machine?: string | null): string {
  if (!row.by) return 'No crew found on the issue'
  const name = row.by.name ?? row.by.id ?? 'a crew'
  return machine ? `Radar crew ${name} on ${machine}` : `Radar crew ${name}`
}
