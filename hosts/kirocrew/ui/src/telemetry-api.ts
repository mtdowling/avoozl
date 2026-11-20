// The Telemetry box in Settings (spec otel-export, OT11): the status
// operation, the save operation, the words each status and failure shows, and
// the Set up export form's steps and checks. Kept free of JSX so node can
// test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface TelemetrySaved {
  endpoint: string | null
  protocol: string
  headers: string[]
}

export interface TelemetryStatus {
  status: string
  failure: string | null
  endpoint: string | null
  endpointFrom: 'environment' | 'machine' | null
  protocol: string
  headerNames: string[]
  missingHeaders: string[]
  saved: TelemetrySaved
  sent: number
  queued: number
  dropped: number
  rejected: number
  lastSuccessAt: string | null
  local: { spans: number; points: number; days: number; spanCap: number; pointCap: number }
}

export interface TelemetryInput {
  enabled: boolean
  endpoint: string
  protocol: string
  headers: string[]
}

export function telemetryClient(api: AppApi) {
  const run = async <T>(operation: string, input: Record<string, unknown>, workspaceId: string) =>
    (await api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId })).result
  return {
    status: (workspaceId: string) => run<TelemetryStatus>('telemetry.status', {}, workspaceId),
    configure: (workspaceId: string, input: Partial<TelemetryInput>) => run<TelemetryStatus>('telemetry.configure', input, workspaceId),
  }
}

const WORDS: Record<string, string> = {
  off: 'export off',
  'no-endpoint': 'export waiting for an endpoint',
  protocol: 'export protocol not supported',
  'endpoint-not-allowed': 'export endpoint not allowed',
  'bad-headers': 'export headers are not written as name=value',
  'missing-headers': 'export waiting for header values',
  ready: 'export ready; the process that runs the tick sends',
  sending: 'exporting',
}
const FAILURES = ['timeout', 'refused', 'tls', 'dns']
export const LOCAL_WORDS = 'Recording locally'

// The status as a person reads it: local recording first, then the export.
// A failure is one of its kinds and never the error's own words, so nothing
// here can hold a URL or a header.
export function statusWords(view: Pick<TelemetryStatus, 'status' | 'failure'>): string {
  if (view.status === 'backing-off') {
    const kind = view.failure && (FAILURES.includes(view.failure) || /^http \d{3}$/.test(view.failure)) ? view.failure : 'error'
    return `${LOCAL_WORDS} · export backing off (${kind})`
  }
  return `${LOCAL_WORDS} · ${WORDS[view.status] ?? WORDS.off}`
}

const count = (n: number) => n.toLocaleString('en-US')

// The Local store row: on, always, with what it holds and keeps.
export const localWords = (local: TelemetryStatus['local']) =>
  `On, always · ${count(local.spans)} spans, ${count(local.points)} points · kept ${local.days} days, at most ${count(local.spanCap)} spans and ${count(local.pointCap)} points`

export const HEADERS_VARIABLE = 'OTEL_EXPORTER_OTLP_HEADERS'

export const ENVIRONMENT_NOTE =
  'The OTEL_EXPORTER_OTLP_* environment of the process that runs Avoozl beats what is saved here. Header values come only from OTEL_EXPORTER_OTLP_HEADERS, and a process a desktop app starts may not inherit a shell’s variables.'

export const lastSuccess = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'Never')

// The Set up export dialog's steps: [title, what the step is for].
export const TELEMETRY_STEPS = [
  ['What is recorded', 'Avoozl always records task timing on this computer. Nothing leaves it unless you turn on export.'],
  ['Export', 'Optional: also send the same timing to a collector you run.'],
  ['Review and save', 'Saving writes this computer’s Avoozl config only.'],
] as const

export const RECORDED = [
  'One trace per task, with a span for each stage (queued, coding, checks, review, merge and the rest).',
  'Lead time, first-pass rate, tokens, credits and stop-the-line events.',
  'Labels: repository, spec, task, role, harness and model.',
  'Never prompts, output, diffs or file contents.',
]

export const formOf = (view: TelemetryStatus): TelemetryInput => ({
  enabled: view.status !== 'off',
  endpoint: view.saved.endpoint ?? '',
  protocol: view.saved.protocol || 'http/json',
  headers: view.saved.headers,
})

// "authorization, x-team" as names. A name=value pair is refused, so a value
// is never sent to be saved.
export function headerNames(text: string): { names: string[]; error?: string } {
  const names = text
    .split(/[\s,]+/)
    .map((name) => name.trim())
    .filter(Boolean)
  if (names.some((name) => name.includes('=') || name.includes(':'))) return { names: [], error: `Enter header names only. Their values come from ${HEADERS_VARIABLE}.` }
  if (names.some((name) => !/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name))) return { names: [], error: 'A header name has a character a header name cannot hold.' }
  return { names: [...new Set(names)] }
}

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]']

// The endpoint problem the server would refuse, or null. Blank is allowed:
// the environment may name the endpoint.
export function endpointProblem(endpoint: string): string | null {
  if (!endpoint.trim()) return null
  let url: URL
  try {
    url = new URL(endpoint.trim())
  } catch {
    return 'Enter a full URL, such as https://collector.example:4318.'
  }
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.includes(url.hostname)))) return 'Use https, or http to localhost, 127.0.0.1 or ::1.'
  if (url.username || url.password || url.search || url.hash) return 'Leave out a user, a password and a query. Put secrets in a header.'
  return null
}
