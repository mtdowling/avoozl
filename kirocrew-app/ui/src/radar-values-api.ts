// Calls and pure helpers for the Radar values screen (radar-coder RC7.2,
// RC7.3). The backend (src/app/radar-values.mjs) decides every value and
// every verdict; this module only shapes them for the screen. Keep it free
// of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export type RadarItemStatus = 'ok' | 'differs' | 'cannot-verify'

export interface RadarItem {
  id: string
  label: string
  value: string
  controls: string
  status: RadarItemStatus
  note: string
}

export interface RadarValues {
  repository: string
  // True when Issue Radar's own read answered.
  grant: boolean
  link: string
  items: RadarItem[]
}

export const radarValuesClient = (api: AppApi) => ({
  read: (workspaceId: string, repository: string) =>
    api.post<{ result: RadarValues }>(COMMAND_PATH, { operation: 'radar.values', input: { repository }, workspaceId }).then((reply) => reply.result),
})

// What the row's box shows: a tick the re-read confirmed, a box the person
// ticks (marked "cannot verify"), or a mismatch to fix.
export function rowState(item: RadarItem, ticked: boolean): { checked: boolean; locked: boolean; badge: string } {
  if (item.status === 'ok') return { checked: true, locked: true, badge: 'Confirmed by Issue Radar' }
  if (item.status === 'differs') return { checked: false, locked: true, badge: 'Differs in Issue Radar' }
  return { checked: ticked, locked: false, badge: 'Cannot verify' }
}

// One line over the list: how many are confirmed or ticked.
export function progressLine(items: RadarItem[], ticked: ReadonlySet<string>): string {
  const done = items.filter((item) => rowState(item, ticked.has(item.id)).checked).length
  return `${done} of ${items.length} done`
}
