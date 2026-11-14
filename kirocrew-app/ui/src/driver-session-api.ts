// The driver session: the one long-running Kiro Crew chat that releases work
// and watches merges. The page reads that chat's slot (app.json grants
// /api/chat/slots/avoozl_*) and links to it, or offers to start one. Kept
// free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'

// shortcut: Kiro Crew names a chat's slot itself, so a chat started from the
// Start button is found only once its slot is this name. Swap for the roster
// the driver conductor records when that exists.
export const DRIVER_SLOT = 'avoozl_driver'
export const DRIVER_HREF = `/chat?sid=${DRIVER_SLOT}`

export type DriverState = 'running' | 'idle' | 'none' | 'unknown'

export interface DriverSession {
  state: DriverState
  href: string | null
}

// The state from GET /api/chat/slots/<slot>: a turn running or queued is
// running; a held slot with nothing queued is idle; a missing one is none.
export function driverFromSlot(status: number, body: { running?: boolean; queue?: unknown[] } | null): DriverSession {
  if (status === 404) return { state: 'none', href: null }
  if (status < 200 || status >= 300) return { state: 'unknown', href: null }
  const busy = body?.running === true || (Array.isArray(body?.queue) && body.queue.length > 0)
  return { state: busy ? 'running' : 'idle', href: DRIVER_HREF }
}

export async function readDriver(api: AppApi): Promise<DriverSession> {
  try {
    const body = await api.get<{ running?: boolean; queue?: unknown[] }>(`/api/chat/slots/${DRIVER_SLOT}?limit=1`)
    return driverFromSlot(200, body)
  } catch (caught) {
    const status = (caught as { status?: number } | null)?.status
    return status === 404 ? driverFromSlot(404, null) : { state: 'unknown', href: null }
  }
}

export const DRIVER_LINES: Record<DriverState, string> = {
  running: 'A driver session is working. Open it to watch or steer.',
  idle: 'A driver session is open and waiting for its next turn.',
  none: 'No driver session. Nothing is released and nobody watches merges until one runs. Crews already working keep going.',
  unknown: 'Avoozl could not read the driver session from Kiro Crew.',
}

export const DRIVER_START_MESSAGE =
  'Start the Avoozl driver session. Keep this chat open. Release ready work in graph order, watch pull requests through checks and merge, and bring anything that needs a person to me. Use the avoozl tools; do not code issues yourself.'
