// Calls and pure helpers for stopping the line: the banner, the Stop the
// line dialog and Settings > Flow (design §8.4, R64). The backend
// (src/app/flow/flow-line.ts) decides every stop; this module only formats
// and checks. Keep it free of JSX and runtime imports so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface LineStop {
  id: string
  repositoryId: string
  check: string | null
  branch: string
  culprit: string | null
  commit: string | null
  range: { from: string | null; to: string }
  openedAt: string
  closedAt: string | null
  timeToFixMs?: number
  fixTaskId: string | null
  runAnyway: { by: string; at: string } | null
  paused?: number
  fixState?: string | null
  needsYou?: boolean
  // A stop pulled by hand (R64): who, why, and what it covers.
  manual?: boolean
  by?: { kind: 'person' | 'agent'; name: string }
  reason?: string
  scope?: string
  planId?: string | null
  taskId?: string | null
  resumedBy?: { by: string; at: string }
  // Who pulled it, as a person reads it ("worker for a1"), from flow.view.
  who?: string | null
  // Stop all agents (R64.12): every running chat Avoozl opened, stopped.
  full?: boolean
  sessions?: { slot: string; taskId: string; role: string; attempt: number; stopped: boolean; error?: string; finished?: boolean }[]
}

// The page-wide signal that the line was stopped or resumed, so the top
// row's Stop the line button and every banner read again.
export const LINE_EVENT = 'avoozl:line-changed'
export const lineChanged = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LINE_EVENT))
}

export function flowClient(api: AppApi) {
  const run = <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    // The open stops, from flow.view's line list.
    stops: (workspaceId: string) => run<{ line?: LineStop[] }>(workspaceId, 'flow.view', { window: 10 }).then((view) => (view.line ?? []).filter((stop) => !stop.closedAt)),
    runAnyway: (workspaceId: string, stopId: string) => run(workspaceId, 'flow.runAnyway', { stopId, confirm: true }),
    stop: (workspaceId: string, input: PullInput) => run<{ stop: LineStop }>(workspaceId, 'flow.stop', { ...input }),
    resume: (workspaceId: string, stopId: string) => run<{ stop: LineStop }>(workspaceId, 'flow.resume', { stopId }),
    settings: (workspaceId: string) => run<FlowSettings>(workspaceId, 'flow.settings.get'),
    saveSettings: (workspaceId: string, input: { flow: FlowSection; repository?: string | null; expectedHash: string }) =>
      run<FlowSettings>(workspaceId, 'flow.settings.update', input),
  }
}

// What a pulled stop covers, in words.
export function scopeText(stop: Pick<LineStop, 'scope' | 'repositoryId' | 'planId' | 'taskId'>): string {
  if (stop.scope === 'repo') return `repository ${stop.repositoryId}`
  if (stop.scope === 'spec') return `spec ${stop.planId}`
  if (stop.scope === 'task') return `task ${stop.taskId} and its dependents`
  return 'everything in this workspace'
}

// Pull the Andon cord (R64): the dialog's choices and its checks, which
// match the backend's so a bad pull never leaves the page.
export type PullScope = 'all' | 'repo' | 'spec' | 'task'
export type PullKind = 'line' | 'agents'
export interface PullForm {
  kind: PullKind
  scope: PullScope
  repository: string
  spec: string
  taskId: string
  reason: string
}
export interface PullInput {
  scope: PullScope
  reason: string
  full?: boolean
  repository?: string
  spec?: string
  taskId?: string
}
export const PULL_SCOPES: { value: PullScope; label: string; line: string }[] = [
  { value: 'all', label: 'Everything', line: 'No new work starts anywhere in this workspace.' },
  { value: 'repo', label: 'One repository', line: 'No new work starts in the repository you pick.' },
  { value: 'spec', label: 'One spec', line: 'No new work starts for the tasks of the spec you pick.' },
  { value: 'task', label: 'One task and its dependents', line: 'The task and everything that waits on it hold.' },
]
// The dialog's two choices (R64.12).
export const PULL_KINDS: { value: PullKind; label: string; line: string }[] = [
  { value: 'line', label: 'Stop the line', line: 'No new work starts in what you pick. Chats already running keep going.' },
  { value: 'agents', label: 'Stop all agents', line: 'No new work starts anywhere, and every running chat Avoozl opened stops now.' },
]
// What the full stop's confirm says (R64.13).
export const FULL_STOP_WARNING =
  'Every running chat Avoozl opened stops now. Replies in progress are lost; committed and saved files, worktrees and branches are kept. Resume starts each task again on the same branch and model.'
export const MAX_REASON = 200
export const emptyPull = (): PullForm => ({ kind: 'line', scope: 'all', repository: '', spec: '', taskId: '', reason: '' })

export function toPull(form: PullForm): { input?: PullInput; error?: string } {
  const reason = form.reason.trim()
  if (!reason) return { error: 'Reason is required.' }
  if (/[\r\n]/.test(reason)) return { error: 'Keep the reason to one line.' }
  if (reason.length > MAX_REASON) return { error: `Keep the reason to ${MAX_REASON} characters or fewer.` }
  if (form.kind === 'agents') return { input: { scope: 'all', full: true, reason } }
  if (form.scope === 'repo') return form.repository ? { input: { scope: 'repo', repository: form.repository, reason } } : { error: 'Pick a repository.' }
  if (form.scope === 'spec') return form.spec ? { input: { scope: 'spec', spec: form.spec, reason } } : { error: 'Pick a spec.' }
  if (form.scope === 'task') return form.taskId ? { input: { scope: 'task', taskId: form.taskId, reason } } : { error: 'Pick a task.' }
  return { input: { scope: 'all', reason } }
}

// The banner's sentence (§8.4).
export function bannerText(stop: LineStop): string {
  if (stop.manual && stop.full) {
    const sessions = stop.sessions ?? [],
      stopped = sessions.filter((s) => s.stopped && !s.finished).length,
      refused = sessions.filter((s) => !s.stopped).length
    const chats = ` ${stopped} chat${stopped === 1 ? '' : 's'} stopped${refused ? `; ${refused} could not be stopped` : ''}.`
    return `All agents stopped by ${stop.by?.name ?? 'someone'}: ${stop.reason ?? ''}.${chats} ${stop.paused ?? 0} task${stop.paused === 1 ? '' : 's'} paused.`
  }
  if (stop.manual) {
    const paused = ` ${stop.paused ?? 0} task${stop.paused === 1 ? '' : 's'} paused.`
    return `Line stopped by ${stop.by?.name ?? 'someone'}: ${stop.reason ?? ''}. Scope: ${scopeText(stop)}.${paused}`
  }
  const what = stop.check ? `\`${stop.check}\` fails on ${stop.branch}` : `a worker named ${stop.culprit} as the cause`
  const since = stop.commit ? ` since ${stop.commit.slice(0, 7)}` : ''
  const culprit = stop.culprit ? ` (task ${stop.culprit})` : ' (culprit unknown)'
  const fix = stop.fixTaskId ? ` Fix: ${stop.fixTaskId}, ${stop.fixState ?? 'ready'}.` : ''
  const paused = stop.runAnyway ? ' Dispatch resumed by Run anyway.' : ` ${stop.paused ?? 0} task${stop.paused === 1 ? '' : 's'} paused.`
  return `Line stopped: ${what}${since}${culprit}.${fix}${paused}`
}

// ------------------------------------------------------------ settings

export interface FlowSection {
  stopTheLine?: { scope?: 'dependents' | 'repo' | 'all' }
  localChecksFirst?: boolean
}

export interface FlowSettings {
  filename: string
  exists: boolean
  hash: string
  flow: FlowSection
  repositories: Record<string, FlowSection>
}

export const FLOW_DEFAULTS = {
  scope: 'dependents',
  localChecksFirst: true,
} as const

export interface FlowForm {
  scope: '' | 'dependents' | 'repo' | 'all'
  localChecksFirst: '' | 'on' | 'off'
}

export function toFlowForm(section: FlowSection = {}): FlowForm {
  return {
    scope: section.stopTheLine?.scope ?? '',
    localChecksFirst: section.localChecksFirst === undefined ? '' : section.localChecksFirst ? 'on' : 'off',
  }
}

// The form back to a `flow` object: blank means the default, so the key is
// left out. Returns {flow} or {error} naming the field, before any save.
export function toFlowSection(form: FlowForm): { flow?: FlowSection; error?: string } {
  const flow: FlowSection = {}
  if (form.scope) flow.stopTheLine = { scope: form.scope }
  if (form.localChecksFirst) flow.localChecksFirst = form.localChecksFirst === 'on'
  return { flow }
}
