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
}

export const STAGE_NAMES = ['Ready to Claim', 'Claim to PR', 'PR to green', 'Green to merge'] as const

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
