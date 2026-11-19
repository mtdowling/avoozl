// The spec page's Review view (R104.9-R104.11, design §4.33): its data from
// plan.review.view, a person's decisions through plan.review.finding.decide,
// and the place it keeps in the page address. No JSX, so node tests it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { urlBase } from './focus-tree.ts'
import { TONE } from './ui/tones.ts'

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
  info: TONE.border,
  warn: TONE.warn,
  blocker: TONE.danger,
}
// Text and icon colors: the border's, but info reads in muted grey.
export const SEVERITY_INK: Record<FindingSeverity, string> = {
  info: TONE.muted,
  warn: TONE.warn,
  blocker: TONE.danger,
}
// States that still need the planner or the person; the rest are done.
export const OPEN_STATES = new Set<FindingState>(['open', 'answered', 'for you', 'accepted'])
export const STATES: FindingState[] = ['for you', 'open', 'answered', 'accepted', 'fixed', 'rejected', 'deferred', 'resolved']
export const DECIDED = new Set<FindingState>(['accepted', 'rejected', 'deferred', 'resolved'])
// One tab per spec file, named as the file, then All findings.
export const ALL_TAB = 'all'
export const TAB_LABEL: Record<string, string> = {
  'requirements.md': 'requirements.md',
  'bugfix.md': 'bugfix.md',
  'design.md': 'design.md',
  'tasks.md': 'tasks.md',
  [ALL_TAB]: 'All findings',
}

// Where the person is in the view; kept in the address as
// ?view=review&plan=P&rev=H&file=F&severity=blocker,warn&state=open,accepted.
// The two filters are toggles: any number on, none on shows everything.
export interface ReviewPlace {
  plan: string
  rev: string | null
  file: string | null
  severity: FindingSeverity[]
  state: FindingState[]
}

// The listed values that are real, once each, in the order the page shows.
const pick = <T extends string>(value: string | null, all: readonly T[]): T[] => {
  const asked = new Set((value ?? '').split(','))
  return all.filter((item) => asked.has(item))
}

export function parseReviewLink(search: string): ReviewPlace | null {
  const query = new URLSearchParams(search)
  if (query.get('view') !== 'review') return null
  const plan = query.get('plan')
  if (!plan) return null
  const rev = query.get('rev'),
    file = query.get('file')
  return {
    plan,
    rev: rev && /^[\w-]{1,128}$/.test(rev) ? rev : null,
    file: file && /^[\w./-]{1,64}$/.test(file) && !file.includes('..') ? file : null,
    severity: pick(query.get('severity'), SEVERITIES),
    state: pick(query.get('state'), STATES),
  }
}

export function reviewLink(place: ReviewPlace): string {
  const query = new URLSearchParams({ view: 'review', plan: place.plan })
  for (const key of ['rev', 'file'] as const) if (place[key]) query.set(key, place[key]!)
  for (const key of ['severity', 'state'] as const) if (place[key].length) query.set(key, place[key].join(','))
  return '?' + query.toString()
}

// The spec page's tabs in the address. Review is ?view=review&plan=P (above);
// every other tab is the spec id plus tab=T, and the Overview is the spec id alone.
export interface SpecPlace {
  plan: string
  tab: string
}
export function specTabLink(plan: string, tab: string): string {
  const query = new URLSearchParams({ plan })
  if (tab !== 'overview') query.set('tab', tab)
  return '?' + query.toString()
}
export function parseSpecTab(search: string): SpecPlace | null {
  const query = new URLSearchParams(search)
  const plan = query.get('plan'),
    tab = query.get('tab') ?? 'overview'
  if (!plan || query.get('view') === 'review') return null
  if (tab !== 'overview' && (tab === 'review' || !/^[\w./-]{1,64}$/.test(tab) || tab.includes('..'))) return null
  return { plan, tab }
}

// An Approve dialog's Open review: the view at that revision on Kiro Crew's
// app route, or null off it (a popout or test page), where the dialog opens
// the view without an address.
export function reviewHref(pathname: string, plan: string, rev: string): string | null {
  const base = urlBase(pathname)
  return base ? base + reviewLink({ plan, rev, file: null, severity: [], state: [] }) : null
}

// The findings the filters show, in line order, and the counts each chip shows: a chip's
// count applies the other filter, so the numbers add up to what shows.
export function filterFindings(findings: ReviewFinding[], place: Pick<ReviewPlace, 'severity' | 'state'>) {
  return findings
    .filter((f) => (!place.severity.length || place.severity.includes(f.severity)) && (!place.state.length || place.state.includes(f.state)))
    .sort((a, b) => a.anchor.file.localeCompare(b.anchor.file) || a.anchor.lineStart - b.anchor.lineStart)
}
export function chipCounts(findings: ReviewFinding[], place: Pick<ReviewPlace, 'severity' | 'state'>) {
  const severity: Record<string, number> = {},
    state: Record<string, number> = {}
  for (const f of findings) {
    if (!place.state.length || place.state.includes(f.state)) severity[f.severity] = (severity[f.severity] ?? 0) + 1
    if (!place.severity.length || place.severity.includes(f.severity)) state[f.state] = (state[f.state] ?? 0) + 1
  }
  return { severity, state }
}

// Open findings per file and per severity, ignoring the filters: what the
// tabs and the spec Summary's badges count.
export function openCounts(findings: Pick<ReviewFinding, 'severity' | 'state' | 'anchor'>[]) {
  const byFile: Record<string, number> = {},
    bySeverity: Record<FindingSeverity, number> = { blocker: 0, warn: 0, info: 0 }
  for (const f of findings) {
    if (!OPEN_STATES.has(f.state)) continue
    byFile[f.anchor.file] = (byFile[f.anchor.file] ?? 0) + 1
    bySeverity[f.severity]++
  }
  return { byFile, bySeverity, total: bySeverity.blocker + bySeverity.warn + bySeverity.info }
}

// The tab bar's keys live with the shared tab bar.
export { tabKey } from './tabs.ts'

// A spec file's text as the view renders it: Markdown as is, a JSON file as
// a JSON code block.
export const renderText = (file: string, text: string) => (file.endsWith('.json') ? '```json\n' + text + '\n```' : text)

export const lineText = (anchor: ReviewFinding['anchor']) =>
  anchor.lineStart === anchor.lineEnd ? `${anchor.file}:${anchor.lineStart}` : `${anchor.file}:${anchor.lineStart}-${anchor.lineEnd}`

// Rendered blocks' first source lines, in order: block i runs from lines[i]
// to lines[i + 1] - 1 (the last one to the end).
// The block an anchor starts in: the last one at or before its first line,
// else the first block.
export function blockFor(lines: number[], line: number): number {
  let at = 0
  for (let i = 0; i < lines.length; i++) if (lines[i] <= line) at = i
  return at
}

// The blocks an anchor's lines touch.
export function blocksIn(lines: number[], start: number, end: number): number[] {
  const out: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const last = i + 1 < lines.length ? lines[i + 1] - 1 : Infinity
    if (lines[i] <= end && last >= start) out.push(i)
  }
  return out.length ? out : lines.length ? [blockFor(lines, start)] : []
}
