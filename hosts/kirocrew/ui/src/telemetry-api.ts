// The Telemetry box in Settings (spec otel-export, OT11): the status
// operation, the switch's operation, and the words each status and failure
// shows. Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface TelemetryStatus {
  status: string
  failure: string | null
  endpoint: string | null
  protocol: string
  headerNames: string[]
  sent: number
  queued: number
  dropped: number
  rejected: number
  lastSuccessAt: string | null
  local: { spans: number; points: number }
}

export function telemetryClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })).result
  return {
    status: (workspaceId: string) => run<TelemetryStatus>('telemetry.status', {}, workspaceId),
    configure: (workspaceId: string, enabled: boolean) => run<TelemetryStatus>('telemetry.configure', { enabled }, workspaceId),
  }
}

const WORDS: Record<string, string> = {
  off: 'Off',
  'no-endpoint': 'Waiting for an endpoint',
  protocol: 'Protocol not supported',
  'endpoint-not-allowed': 'Endpoint not allowed',
  'bad-headers': 'Headers are not written as name=value',
  ready: 'Ready. This process does not send; the process that runs the tick does',
  sending: 'Sending',
}
const FAILURES = ['timeout', 'refused', 'tls', 'dns']

// The status as a person reads it. A failure is one of its kinds and never
// the error's own words, so nothing here can hold a URL or a header.
export function statusWords(view: Pick<TelemetryStatus, 'status' | 'failure'>): string {
  if (view.status === 'backing-off') {
    const kind = view.failure && (FAILURES.includes(view.failure) || /^http \d{3}$/.test(view.failure)) ? view.failure : 'error'
    return `Backing off (${kind})`
  }
  return WORDS[view.status] ?? 'Off'
}

export const ENVIRONMENT_NOTE =
  "The endpoint and headers come from the OTEL_EXPORTER_OTLP_* environment of the process that runs Avoozl. A process a desktop app starts may not inherit a shell's variables."

export const lastSuccess = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'Never')
