// Calls and pure helpers for the spec driver (design §6.10, §4.44 and
// §4.46, R66, R116): the spec's chip and its Specs list row, the read-only
// banner and Settings › General › This computer. The driver is the spec
// issue's assignee; handing a spec to someone else is reassigning its issue
// on GitHub, and unassigning releases it. The backend (src/app/workers/driver.mjs)
// decides everything; this module only words it. Keep it free of JSX and
// runtime imports so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

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
  driver?: { label: string | null; machine: string | null } | null
  decision?: { text: string; openedAt: string } | null
}

export interface DriverStatus {
  enabled: boolean
  machine?: { id: string; label: string | null }
  readOnly?: number
  specs: DriverSpec[]
}

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

// The driver as a Specs list row says it (R116.7), from the cached driver
// row: who has the spec, by its issue's assignee. Null while it is unread.
export interface RowDriver {
  mode?: 'github' | 'local' | null
  state: string
  reason: string
  assignees?: string[]
}

export function rowDriverText(driver: RowDriver | null | undefined): string | null {
  if (!driver) return null
  if (driver.reason === 'not-shared') return 'Not shared'
  if (driver.state === 'driver') return 'You drive'
  const assignees = driver.assignees ?? []
  switch (driver.reason) {
    case 'other-person':
      return assignees[0] ? `Taken by ${assignees[0]}` : 'Taken by someone else'
    case 'several':
      return `${assignees.length} assignees`
    case 'no-assignee':
      return 'Nobody drives'
    default:
      return null
  }
}

// The spec's chip: "Driver: you", or who the spec issue is assigned to.
export function chipText(spec: DriverSpec | null | undefined): string {
  if (!spec) return 'Driver: unknown'
  if (spec.reason === 'not-shared') return 'Driver: you · not shared'
  if (spec.you) return 'Driver: you'
  if (spec.reason === 'several') return `Driver: nobody · ${spec.assignees?.length ?? 2} assignees`
  const assignee = spec.assignees?.length === 1 ? spec.assignees[0] : null
  if (!assignee) return 'Driver: nobody'
  return spec.reason === 'other-person' ? `Taken by ${assignee}` : `Driver: ${assignee}`
}

// The read-only banner's first words, by why it reads only here.
export function bannerTitle(spec: DriverSpec): string {
  switch (spec.reason) {
    case 'other-person':
      return 'Someone else drives this spec'
    case 'no-assignee':
      return 'Nobody drives this spec'
    case 'several':
      return 'Several assignees'
    default:
      return 'Read only here'
  }
}

// This computer's settings form, checked before a save.
export function toMachineSettings(form: { label: string }): {
  input?: { label: string | null }
  error?: string
} {
  const label = form.label.trim()
  if (label.length > LABEL_MAX) return { error: `A machine label is at most ${LABEL_MAX} characters.` }
  if (/[/\\]/.test(label)) return { error: 'A machine label has no slash.' }
  return { input: { label: label || null } }
}

export function driverClient(api: AppApi) {
  const run = <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    status: (workspaceId: string, planId?: string) => run<DriverStatus>(workspaceId, 'driver.status', planId ? { planId } : {}),
    saveMachine: (workspaceId: string, input: { label: string | null }) => run<DriverStatus>(workspaceId, 'driver.settings.update', input),
  }
}
