// The spec page's Review view (R104.9-R104.11, design §4.33): its data from
// plan.review.view, a person's decisions through plan.review.finding.decide,
// and the place it keeps in the page address. No JSX, so node tests it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export type FindingSeverity = 'info' | 'warn' | 'blocker'
export type FindingState = 'open' | 'fixed' | 'answered' | 'for you' | 'accepted' | 'rejected' | 'deferred' | 'resolved'
export type FindingAction = 'accept' | 'reject' | 'defer' | 'resolve' | 'reopen'
export interface ChatLink {
  href: string | null
  closed: boolean
}
export interface ReviewFinding {
  id: string
  roundId: string
  revisionHash: string
  severity: FindingSeverity
  category: string
  state: FindingState
  quote: string | null
  anchor: {
    file: string
    lineStart: number
    lineEnd: number
    moved?: boolean
    revisionHash?: string
  }
  decisions: {
    action: FindingAction
    by: string
    at: string
    revisionHash: string
    note: string
  }[]
  claim: string
  evidence: string
  answer: {
    action: 'fixed' | 'answered'
    revisionHash?: string
    text: string
    at: string
  } | null
}
export interface ReviewRound {
  id: string
  pass: number
  round: number
  state: string
  revisionHash: string
  reviewerModel: string | null
  note: string | null
  reviewChat: ChatLink | null
  plannerChat: ChatLink | null
}
export interface ReviewViewData {
  planId: string
  spec: string
  revisionHash: string
  current: boolean
  files: Record<string, string>
  rounds: ReviewRound[]
  findings: ReviewFinding[]
  bySeverity: Record<FindingSeverity, number>
  byState: Partial<Record<FindingState, number>>
}

export function reviewClient(api: AppApi) {
  const run = async <T>(workspaceId: string, operation: string, input: Record<string, unknown>): Promise<T> =>
    (
      await api.post<{ result: T }>(COMMAND_PATH, {
        operation,
        input,
        workspaceId,
      })
    ).result
  return {
    view: (workspaceId: string, planId: string, revisionHash?: string | null) =>
      run<ReviewViewData>(workspaceId, 'plan.review.view', {
        planId,
        ...(revisionHash ? { revisionHash } : {}),
      }),
    // The decision is recorded at the revision on screen.
    decide: (workspaceId: string, id: string, action: FindingAction, revisionHash: string, note?: string) =>
      run<unknown>(workspaceId, 'plan.review.finding.decide', {
        id,
        action,
        revisionHash,
        ...(note ? { note } : {}),
      }),
  }
}
export type ReviewClient = ReturnType<typeof reviewClient>

export const SEVERITIES: FindingSeverity[] = ['blocker', 'warn', 'info']
export const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  blocker: 'Blocker',
  warn: 'Warn',
  info: 'Info',
}
// Border colors from the theme: info grey, warn yellow, blocker red.
export const SEVERITY_COLOR: Record<FindingSeverity, string> = {
  info: 'var(--border)',
  warn: 'var(--warning, #b7791f)',
  blocker: 'var(--danger)',
}
export const STATES: FindingState[] = ['for you', 'open', 'answered', 'accepted', 'fixed', 'rejected', 'deferred', 'resolved']
export const DECIDED = new Set<FindingState>(['accepted', 'rejected', 'deferred', 'resolved'])
export const TAB_LABEL: Record<string, string> = {
  'requirements.md': 'Requirements',
  'bugfix.md': 'Bugfix',
  'design.md': 'Design',
  'tasks.md': 'Tasks',
}

// Where the person is in the view; kept in the address as
// ?view=review&plan=P&rev=H&file=F&severity=S&state=X.
export interface ReviewPlace {
  plan: string
  rev: string | null
  file: string | null
  severity: FindingSeverity | null
  state: FindingState | null
}

export function parseReviewLink(search: string): ReviewPlace | null {
  const query = new URLSearchParams(search)
  if (query.get('view') !== 'review') return null
  const plan = query.get('plan')
  if (!plan) return null
  const severity = query.get('severity') as FindingSeverity | null,
    state = query.get('state') as FindingState | null,
    rev = query.get('rev'),
    file = query.get('file')
  return {
    plan,
    rev: rev && /^[\w-]{1,128}$/.test(rev) ? rev : null,
    file: file && /^[\w.-]{1,64}$/.test(file) ? file : null,
    severity: severity && SEVERITIES.includes(severity) ? severity : null,
    state: state && STATES.includes(state) ? state : null,
  }
}

export function reviewLink(place: ReviewPlace): string {
  const query = new URLSearchParams({ view: 'review', plan: place.plan })
  for (const key of ['rev', 'file', 'severity', 'state'] as const) {
    const value = place[key]
    if (value) query.set(key, value)
  }
  return '?' + query.toString()
}

// The findings the filters show, in line order, and the counts each chip shows: a chip's
// count applies the other filter, so the numbers add up to what shows.
export function filterFindings(findings: ReviewFinding[], place: Pick<ReviewPlace, 'severity' | 'state'>) {
  return findings
    .filter((f) => (!place.severity || f.severity === place.severity) && (!place.state || f.state === place.state))
    .sort((a, b) => a.anchor.file.localeCompare(b.anchor.file) || a.anchor.lineStart - b.anchor.lineStart)
}
export function chipCounts(findings: ReviewFinding[], place: Pick<ReviewPlace, 'severity' | 'state'>) {
  const severity: Record<string, number> = {},
    state: Record<string, number> = {}
  for (const f of findings) {
    if (!place.state || f.state === place.state) severity[f.severity] = (severity[f.severity] ?? 0) + 1
    if (!place.severity || f.severity === place.severity) state[f.state] = (state[f.state] ?? 0) + 1
  }
  return { severity, state }
}

export const lineText = (anchor: ReviewFinding['anchor']) =>
  anchor.lineStart === anchor.lineEnd ? `${anchor.file}:${anchor.lineStart}` : `${anchor.file}:${anchor.lineStart}-${anchor.lineEnd}`
