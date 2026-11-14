// Calls and pure helpers for Trace (RC8.2, design D10). The backend
// (src/app/trace.mjs) holds each step's time from GitHub; this file reads it
// and words it. No JSX and no runtime imports beyond the types, so node can
// test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface TraceStep {
  key: string
  label: string
  // GitHub's time for the step; never a claim marker's `updated=`.
  at: string | null
  state: 'done' | 'now' | 'later' | 'skipped'
  by?: string | null
  detail?: string
  link?: string | null
  rounds?: number
}

export interface Trace {
  repository: string
  number: number
  title: string
  steps: TraceStep[]
  crew: { id: string | null; name: string | null } | null
  crewLastWordAt: string | null
  links: { issue: string | null; pr: string | null; claim: string | null }
  problems: string[]
}

export interface TraceTarget {
  repository: string
  number: number
}

// The page's memory key for the trace it shows (changePage's `open`).
export const TRACE_TARGET = 'trace-target'

export function traceClient(api: AppApi) {
  return {
    read: async (workspaceId: string, target: TraceTarget) => {
      const reply = await api.post<{ result: Trace }>(COMMAND_PATH, { operation: 'radar.trace', input: target, workspaceId })
      return reply.result
    },
  }
}

// `?trace=owner/repo#52`, with the separators escaped. Anything else is no link.
export const traceLink = (target: TraceTarget) => `?trace=${encodeURIComponent(`${target.repository}#${target.number}`)}`

export function parseTraceLink(search: string): TraceTarget | null {
  const value = new URLSearchParams(search).get('trace'),
    match = /^([^/\s#]+\/[^/\s#]+)#([1-9]\d*)$/.exec(value ?? '')
  return match ? { repository: match[1], number: Number(match[2]) } : null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// UTC, so the page and the tests read the same time on any machine.
export function clock(at: string | null | undefined): string {
  const time = Date.parse(at ?? '')
  if (Number.isNaN(time)) return '—'
  const date = new Date(time),
    two = (n: number) => String(n).padStart(2, '0')
  return `${DAYS[date.getUTCDay()]} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`
}

// "6 min after Ready": the wait since the last step that has a time.
export function afterPrevious(steps: Pick<TraceStep, 'label' | 'at'>[], index: number): string | null {
  const at = Date.parse(steps[index]?.at ?? '')
  if (Number.isNaN(at)) return null
  for (let before = index - 1; before >= 0; before--) {
    const earlier = Date.parse(steps[before].at ?? '')
    if (Number.isNaN(earlier)) continue
    const minutes = Math.round((at - earlier) / 60000)
    const wait = minutes < 60 ? `${minutes} min` : minutes < 2880 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 1440)} d`
    return `${wait} after ${steps[before].label}`
  }
  return null
}
