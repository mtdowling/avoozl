// The driver session on the Dashboard: a link to the one long-running chat
// that releases ready work, or a Start button that opens one. Opt in only:
// nothing here starts a chat until a person presses Start. In Demo mode it
// shows the demo's made-up session and never reads or starts anything.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { IconBtn, SmallBtn } from './controls.tsx'
import { useDemoFixtures } from './Demo.tsx'
import { useAppApi, useChatLauncher } from './host.ts'
import { Info, RefreshCw } from './icons.ts'
import { Tooltip } from './Tooltip.tsx'
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

export default function DriverSessionBox(props: { workspaceId: string | null }) {
  const { read, reload } = useDriverSession(props.workspaceId)
  const { openChat } = useChatLauncher()
  const view = useMemo(() => (read ? driverView(read) : null), [read])
  const open = () => read?.slot && openChat({ slotKey: read.slot })
  const start = () => openChat({ agent: DRIVER_AGENT, message: DRIVER_START_MESSAGE, autoSend: true })
  const seen = read?.lastSeenAt ? sinceText(Date.parse(read.lastSeenAt), Date.now()) : null
  const line = [
    read ? driverLine(read.state) : 'Reading the driver session…',
    seen && read?.state !== 'none' ? `Last seen ${seen}.` : '',
    read?.turnsToday !== undefined && read.turnLimit ? `${read.turnsToday} of ${read.turnLimit} turns today.` : '',
    view?.workspace ? `Workspace: ${view.workspace}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
  // Compact: the title and state, one line cut short (all of it, and what a
  // driver session is, in tooltips), then small buttons with Recheck right.
  return (
    <div data-driver-session={read?.state ?? 'loading'} data-compact-card className="min-w-0">
      <Card className="flex h-full min-w-0 flex-col gap-1" style={{ padding: '8px 12px' }}>
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="m-0 min-w-0 truncate text-sm font-semibold">Driver session</h3>
          {read && <Badge variant={read.state === 'running' ? 'success' : undefined}>{LABEL[read.state]}</Badge>}
          <Tooltip text={TIP}>
            {(describedBy) => (
              <span tabIndex={0} role="img" aria-label="About the driver session" aria-describedby={describedBy} data-info-tip className="inline-flex shrink-0 items-center text-muted">
                <Info size={14} aria-hidden="true" />
              </span>
            )}
          </Tooltip>
        </div>
        <Tooltip text={line} display="block">
          {(describedBy) => (
            <p tabIndex={0} aria-describedby={describedBy} className="m-0 truncate text-xs text-muted" data-card-line>
              {line}
            </p>
          )}
        </Tooltip>
        {view?.elsewhere && (
          <p className="m-0 truncate text-xs" data-driver-elsewhere>
            {view.elsewhere.text}{' '}
            <button type="button" className="underline" style={{ color: 'var(--accent)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => view.elsewhere && openChat({ slotKey: view.elsewhere.slot })} data-driver-elsewhere-open>
              Open
            </button>
          </p>
        )}
        <div className="flex min-w-0 items-center gap-1.5">
          {view?.link && (
            <SmallBtn primary={!view.start} onClick={open} attrs={{ 'data-driver-open': true, 'aria-label': 'Open driver session' }}>
              Open
            </SmallBtn>
          )}
          {view?.start && (
            <SmallBtn primary={!view.link} onClick={start} attrs={{ 'data-driver-start': true, 'aria-label': view.link ? 'Start a new driver session' : 'Start a driver session' }}>
              {view.link ? 'Start new' : 'Start'}
            </SmallBtn>
          )}
          {read && (
            <span className="ml-auto" data-driver-recheck-wrap>
              <IconBtn icon={RefreshCw} label="Recheck" tooltip="Read the driver session again" onClick={reload} />
            </span>
          )}
        </div>
      </Card>
    </div>
  )
}
