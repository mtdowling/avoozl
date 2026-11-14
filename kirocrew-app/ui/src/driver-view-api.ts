// The driver session on the page: the one long-running Kiro Crew chat that
// releases ready work and watches merges. Kiro Crew shows an app only the chats
// the app opened, and the person opens this one, so Avoozl cannot read its slot
// from the host. It reads what the chat told Avoozl itself (src/app/
// driver-session.mjs: the avoozl-driver agent's hooks and its plans_next call).
// Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { ago } from './driver-api.ts'
import type { DemoFixtures } from './demo-fixtures.ts'
import { COMMAND_PATH } from './workspace-api.ts'

export type DriverState = 'running' | 'idle' | 'none' | 'unknown'

export interface DriverRead {
  state: DriverState
  slot: string | null
  // The chat link, /chat?sid=<slot>, or null when no session was seen.
  href: string | null
  openedAt: string | null
  lastSeenAt: string | null
  // The demo shows made-up counts; a real read has none.
  turnsToday?: number
  turnLimit?: number
}

// The agent the Start button opens (kirocrew-app/agents/avoozl-driver.json).
export const DRIVER_AGENT = 'avoozl-driver'

export const DRIVER_START_MESSAGE =
  'Start the Avoozl driver session. Keep this chat open. Release ready work in graph order, watch pull requests through checks and merge, and bring anything that needs a person to me. Use the avoozl tools. Do not merge anything yourself and do not code issues yourself.'

export const driverLine = (state: DriverState): string =>
  ({
    running: 'A driver session is working. Open it to watch or steer.',
    idle: 'The driver session has been quiet for a while. Open it to check on it, or start a new one.',
    none: 'No driver session. Nothing is released and nobody watches merges until one runs. Crews already working keep going.',
    unknown: 'Avoozl could not read the driver session. It tries again soon.',
  })[state]

const UNKNOWN: DriverRead = { state: 'unknown', slot: null, href: null, openedAt: null, lastSeenAt: null }

// One observe call. A failed read is `unknown`, never `none`: the session may
// be running, and the page must not offer a second one.
export async function readDriverSession(api: AppApi, workspaceId?: string | null): Promise<DriverRead> {
  try {
    const reply = await api.post<{ result: DriverRead }>(COMMAND_PATH, {
      operation: 'driversession.view',
      input: {},
      ...(workspaceId ? { workspaceId } : {}),
    })
    return reply.result
  } catch {
    return UNKNOWN
  }
}

// The demo's made-up session (demo-fixtures.ts), shaped like a real read.
export function driverFromFixture(fixture: DemoFixtures['driverSession']): DriverRead {
  return {
    state: fixture.state === 'running' ? 'running' : 'none',
    slot: fixture.slot,
    href: fixture.link,
    openedAt: fixture.startedAt,
    lastSeenAt: fixture.lastTurnAt,
    turnsToday: fixture.turnsToday,
    turnLimit: fixture.turnLimit,
  }
}

// "since you left" (side panel). `away` is what the panel kept when the window
// last lost focus: the time and the keys of the rows that waited on you then.
export interface Away {
  at: number
  waitingKeys: string[]
}

export interface Recap {
  since: string
  finished: { taskId: string; title: string; repository: string | null; at: string }[]
  needsYou: { key: string; title: string; label: string }[]
}

// A person who looked away for less than this has nothing to catch up on.
export const AWAY_MIN_MS = 60_000

export const sinceText = (at: number, now: number): string => ago(new Date(at).toISOString(), now)

export function recapSince(
  model: { waiting: { key: string; title: string; label: string }[]; recent: { taskId: string; title: string; repository: string | null; at: string }[] },
  away: Away | null,
  now: number,
): Recap | null {
  if (!away || now - away.at < AWAY_MIN_MS) return null
  const seen = new Set(away.waitingKeys)
  const finished = model.recent.filter((row) => Date.parse(row.at) > away.at)
  const needsYou = model.waiting.filter((row) => !seen.has(row.key)).map(({ key, title, label }) => ({ key, title, label }))
  if (!finished.length && !needsYou.length) return null
  return { since: sinceText(away.at, now), finished, needsYou }
}
