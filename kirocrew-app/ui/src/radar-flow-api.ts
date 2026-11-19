// Calls and words for Flow from GitHub data (RC8.4, design D10). The backend
// (src/app/radar-flow.mjs) computes every number; this file words them. No JSX
// and no runtime imports beyond the types, so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface GithubFlow {
  readAt: string | null
  count: number
  issues: { number: number; stages: number[]; lead: number }[]
  skipped: { number: number }[]
  median: number[] | null
  medianLead: number | null
  efficiency: number | null
  bottleneck: string | null
  errors: { repository: string; error: string }[]
  repositories: string[]
  // Every build record of merged pull requests (R101.4); absent on an older backend.
  builds?: BuildView
}

export interface BuildPhase {
  phase: string
  ms: number
}

export interface BuildView {
  count: number
  totalMs: number
  failedMs: number
  medianMs: number | null
  byPhase: { phase: string; target: string; start: string; count: number; medianMs: number | null }[]
  byInstance: { instance: string | null; name: string | null; count: number; medianMs: number | null; totalMs: number }[]
  recent: { repository: string | null; pr: number; number?: number; totalMs: number; failedMs: number; phases: BuildPhase[]; costliest: BuildPhase | null }[]
}

export const STAGE_NAMES = ['Ready to start', 'Start to PR', 'PR to green', 'Green to merge'] as const

export function githubFlowClient(api: AppApi) {
  return {
    read: async (workspaceId: string, refresh = false) => {
      const reply = await api.post<{ result: GithubFlow }>(COMMAND_PATH, { operation: 'radar.flow', input: refresh ? { refresh: true } : {}, workspaceId })
      return reply.result
    },
  }
}

export function span(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`
  const days = Math.floor(hours / 24)
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`
}

export function flowRows(view: GithubFlow): { name: string; median: string; slowest: boolean }[] {
  if (!view.median) return []
  return STAGE_NAMES.map((name, index) => ({ name, median: span(view.median![index]), slowest: name === view.bottleneck }))
}

export function summaryLine(view: GithubFlow): string {
  if (!view.count) return 'No finished issue yet'
  return `${view.count} ${view.count === 1 ? 'issue' : 'issues'} · median lead time ${span(view.medianLead)} · flow efficiency ${Math.round((view.efficiency ?? 0) * 100)}%`
}

// "12 pull requests · median 41 s · 2 min in failed attempts".
export function buildsLine(builds: BuildView): string {
  const failed = builds.failedMs > 0 ? ` · ${buildMedian(builds.failedMs)} in failed attempts` : ''
  return `${builds.count} ${builds.count === 1 ? 'pull request' : 'pull requests'} · median ${buildMedian(builds.medianMs)}${failed}`
}

// The phase that took the most in one pull request: "test 3 min".
export function costliestLine(row: BuildView['recent'][number]): string {
  return row.costliest ? `${row.costliest.phase} ${buildMedian(row.costliest.ms)}` : '—'
}

export function buildMedian(ms: number | null): string {
  return ms == null ? '—' : ms < 90000 ? `${Math.round(ms / 1000)} s` : span(ms)
}
