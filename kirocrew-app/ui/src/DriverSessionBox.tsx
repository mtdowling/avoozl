// The driver session on the Dashboard: a link to the one long-running chat
// that releases ready work, or a Start button that opens one. Opt in only:
// nothing here starts a chat until a person presses Start. In Demo mode it
// shows the demo's made-up session and never reads or starts anything.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDemoFixtures } from './Demo.tsx'
import { useAppApi, useChatLauncher } from './host.ts'
import { Play, RefreshCw } from './icons.ts'
import { CellAct, StatusCell, StatusRow } from './StatusCells.tsx'
import { sinceText } from './driver-view-api.ts'
import { DRIVER_AGENT, DRIVER_START_MESSAGE, driverFromFixture, driverLine, readDriverSession, type DriverRead } from './driver-view-api.ts'
import { driverView } from './panel-api.ts'

const LABEL = { running: 'Running', idle: 'Quiet', none: 'Not started', unknown: 'Unknown' } as const
const TIP =
  'One long-running chat that releases ready work in graph order, watches merges and hands you the decisions. Avoozl does not start one for you. Crews already working keep going without it.'

// The driver read for this workspace, again every minute while the page is open.
// In the demo it is the fixture and nothing is read.
export function useDriverSession(workspaceId: string | null): { read: DriverRead | null; reload: () => void } {
  const api = useAppApi()
  const fixtures = useDemoFixtures()
  const [read, setRead] = useState<DriverRead | null>(null)
  const reload = useCallback(() => {
    if (!fixtures) void readDriverSession(api, workspaceId).then(setRead)
  }, [api, workspaceId, fixtures])
  useEffect(() => {
    reload()
    const timer = setInterval(reload, 60000)
    return () => clearInterval(timer)
  }, [reload])
  return { read: fixtures ? driverFromFixture(fixtures.driverSession) : read, reload }
}

// The driver as one compact cell: "Driver: not started", its actions beside it.
// Everything longer is the title's tooltip.
export function DriverCell(props: { workspaceId: string | null }) {
  const { read, reload } = useDriverSession(props.workspaceId)
  const { openChat } = useChatLauncher()
  const view = useMemo(() => (read ? driverView(read) : null), [read])
  const open = () => read?.slot && openChat({ slotKey: read.slot })
  const start = () => openChat({ agent: DRIVER_AGENT, message: DRIVER_START_MESSAGE, autoSend: true })
  const seen = read?.lastSeenAt ? sinceText(Date.parse(read.lastSeenAt), Date.now()) : null
  const tip = [
    TIP,
    read ? driverLine(read.state) : 'Reading the driver session…',
    seen && read?.state !== 'none' ? `Last seen ${seen}.` : '',
    read?.turnsToday !== undefined && read.turnLimit ? `${read.turnsToday} of ${read.turnLimit} turns today.` : '',
    view?.workspace ? `Workspace: ${view.workspace}.` : '',
    view?.elsewhere ? view.elsewhere.text : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <StatusCell
      data-driver-session={read?.state ?? 'loading'}
      tone={read?.state === 'running' ? 'ok' : read?.state === 'unknown' ? 'warn' : 'muted'}
      title={`Driver: ${read ? LABEL[read.state].toLowerCase() : 'reading'}`}
      tip={tip}
      actions={
        <>
          {view?.link && <CellAct label={view.start ? 'Open' : 'Open session'} primary={!view.start} onClick={open} tip="Open the driver chat." data-driver-open />}
          {view?.start && <CellAct label="Start" icon={<Play size={11} aria-hidden="true" />} primary={!view.link} onClick={start} tip={view.link ? 'Start a new driver session.' : 'Start a driver session.'} data-driver-start />}
          {view?.elsewhere && (
            <CellAct label={`${view.elsewhere.workspace}'s`} tip={view.elsewhere.text} onClick={() => view.elsewhere && openChat({ slotKey: view.elsewhere.slot })} data-driver-elsewhere data-driver-elsewhere-open />
          )}
          {read && <CellAct label="" icon={<RefreshCw size={12} aria-hidden="true" />} aria-label="Check again" tip="Check again" onClick={reload} data-driver-recheck />}
        </>
      }
    />
  )
}

// On its own (Settings): the one cell, full width.
export default function DriverSessionBox(props: { workspaceId: string | null }) {
  return (
    <StatusRow>
      <DriverCell workspaceId={props.workspaceId} />
    </StatusRow>
  )
}
