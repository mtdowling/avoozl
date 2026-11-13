// Calls and pure helpers for the spec driver (design §6.10, R66): the
// header chip, the read-only banner, the Hand off, Take over and Force take
// over dialogs, and Settings › General › This computer. The backend
// (src/app/driver.mjs) decides everything; this module only words it. Keep
// it free of JSX and runtime imports so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface DriverClaim {
  login: string | null
  label: string | null
  machine: string | null
  forced?: boolean
  from?: { machine: string | null; label: string | null; login: string | null } | null
  takenAt?: string
}

export interface RunningChat {
  slot: string
  taskId: string
  role: string
  status: string | null
}

export interface DriverSpec {
  planId: string
  spec: string
  mode?: 'github' | 'local'
  state: 'driver' | 'read-only' | 'unknown'
  reason: string
  you: boolean
  text: string
  issue?: { number: number; url: string | null } | null
  assignees?: string[]
  decidedBy?: 'plan' | 'epic' | null
  driver?: DriverClaim | null
  offer?: 'handoff' | 'takeover' | 'force'
  seenAt: string | null
  stale: boolean
  decision?: { text: string; openedAt: string } | null
  handoff?: {
    state: 'draining' | 'exported'
    startedAt: string
    folder?: string
    file?: string
    sha256?: string
    unfinished?: string[]
    running: RunningChat[]
  } | null
  away: { taskId: string; reason: string }[]
  setup: { kind: string; id?: string }[]
}

export interface DriverStatus {
  enabled: boolean
  machine?: { id: string; label: string | null; heartbeatMinutes: number | null }
  readOnly?: number
  specs: DriverSpec[]
}

export interface TakeoverPreview {
  planId: string
  spec: string
  lost: string[]
  reraised: string[]
  current: { assignees: string[]; driver: DriverClaim | null; seenAt: string | null }
  setup: { kind: string; id?: string }[]
}

export const HEARTBEAT_PLACEHOLDER = 15
export const LABEL_MAX = 40

// "4 min ago", "2 h ago", "3 d ago".
export function ago(at: string | null | undefined, now = Date.now()): string {
  const time = at ? Date.parse(at) : NaN
  if (!Number.isFinite(time)) return 'never'
  const minutes = Math.max(0, Math.round((now - time) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

// The header chip: "Driver: you", or who drives and when it was last seen.
export function chipText(spec: DriverSpec | null | undefined, now = Date.now()): string {
  if (!spec) return 'Driver: unknown'
  if (spec.you) return 'Driver: you'
  if (spec.mode === 'local')
    return `Driver: ${spec.driver?.label || spec.driver?.machine || 'another machine'} · this file`
  const who = spec.driver
  if (!who || ['no-assignee', 'several'].includes(spec.reason)) return 'Driver: nobody'
  const name = [who.login, who.label].filter(Boolean).join(' · ')
  if (!spec.seenAt) return `Driver: ${name}`
  return spec.stale ? `Driver: ${name} · not seen since ${spec.seenAt}` : `Driver: ${name} · seen ${ago(spec.seenAt, now)}`
}

// The read-only banner's first words, by why it reads only here.
export function bannerTitle(spec: DriverSpec): string {
  switch (spec.reason) {
    case 'other-person':
      return 'Assigned to someone else'
    case 'other-machine':
      return 'Your other machine drives this spec'
    case 'no-assignee':
    case 'several':
      return 'No single assignee'
    case 'handed-off':
      return 'Handed off'
    case 'forced-away':
      return 'Taken over by force'
    case 'no-claim':
    case 'no-plan-issue':
      return 'No machine drives this spec yet'
    case 'local-other-machine':
      return 'Another machine holds this spec'
    case 'not-projected':
      return 'Not on GitHub yet'
    default:
      return 'Read only here'
  }
}

// Which button the banner offers: Take over when this login is the
// assignee, Force take over otherwise; none while no single person is
// assigned or after this machine handed it off.
export function bannerAction(spec: DriverSpec): 'takeover' | 'force' | null {
  if (spec.you || spec.state === 'unknown') return null
  if (['no-assignee', 'several', 'not-projected', 'unreadable'].includes(spec.reason)) return null
  if (spec.reason === 'handed-off') return null
  return spec.offer === 'takeover' ? 'takeover' : spec.mode === 'local' ? 'takeover' : 'force'
}

// One line for each item to set up again on this machine.
export function setupText(item: { kind: string; id?: string }): string {
  switch (item.kind) {
    case 'plugin':
      return `Approve plugin ${item.id} in Settings › Plugins`
    case 'terms':
      return `Add the terms file for rule set ${item.id} in Settings › Content rules`
    case 'retro-instructions':
      return 'Write retro instructions again in Settings › Flow'
    case 'router-instructions':
      return 'Write the routing prompt again in Settings › Routing'
    default:
      return `Set up ${item.kind}${item.id ? ' ' + item.id : ''} again`
  }
}

// The Force take over confirm: every check before the red button works.
export function forceReady(spec: DriverSpec, typed: string, acknowledged: boolean, file: string): string | null {
  if (typed.trim() !== spec.spec) return `Type ${spec.spec} to confirm.`
  if (!file.trim() && !acknowledged) return 'Tick that you understand what a rebuild loses, or give an export file.'
  if (file.trim() && !/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(file.trim())) return 'Give the export file by its full path.'
  return null
}

// This computer's settings form, checked before a save.
export function toMachineSettings(form: { label: string; heartbeat: string }): {
  input?: { label: string | null; heartbeatMinutes: number | null }
  error?: string
} {
  const label = form.label.trim()
  if (label.length > LABEL_MAX) return { error: `A machine label is at most ${LABEL_MAX} characters.` }
  if (/[/\\]/.test(label)) return { error: 'A machine label has no slash.' }
  const text = form.heartbeat.trim()
  let minutes: number | null = null
  if (text) {
    minutes = Number(text)
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60) return { error: 'Heartbeat minutes must be a whole number from 5 to 60.' }
  }
  return { input: { label: label || null, heartbeatMinutes: minutes } }
}

export function driverClient(api: AppApi) {
  const run = <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    status: (workspaceId: string, planId?: string) => run<DriverStatus>(workspaceId, 'driver.status', planId ? { planId } : {}),
    preview: (workspaceId: string, planId: string, rebuild: boolean) =>
      run<TakeoverPreview>(workspaceId, 'driver.takeover.preview', { planId, rebuild }),
    handoff: (workspaceId: string, planId: string, action: 'start' | 'export' | 'cancel', extra: { folder?: string; unfinished?: boolean } = {}) =>
      run<DriverStatus & { file?: string }>(workspaceId, 'driver.handoff', { planId, action, ...extra }),
    takeover: (workspaceId: string, planId: string, how: { file?: string; rebuild?: boolean }) =>
      run<DriverStatus & { won?: boolean }>(workspaceId, 'driver.takeover', {
        planId,
        ...(how.file ? { file: how.file } : {}),
        ...(how.rebuild ? { rebuild: true, acknowledgeLoss: true } : {}),
      }),
    force: (workspaceId: string, planId: string, confirm: string, file?: string) =>
      run<DriverStatus & { won?: boolean }>(workspaceId, 'driver.forceTakeover', {
        planId,
        confirm,
        ...(file ? { file } : { acknowledgeLoss: true }),
      }),
    decideAway: (workspaceId: string, taskId: string, choice: 'start' | 'wait') => run(workspaceId, 'driver.away.decide', { taskId, choice }),
    saveMachine: (workspaceId: string, input: { label: string | null; heartbeatMinutes: number | null }) =>
      run<DriverStatus>(workspaceId, 'driver.settings.update', input),
  }
}
