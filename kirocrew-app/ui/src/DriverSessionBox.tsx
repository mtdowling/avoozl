// The driver session on the Dashboard: a link to the one long-running chat
// that releases ready work, or a Start button that opens one. Opt in only:
// nothing here starts a chat until a person presses Start. In Demo mode it
// shows the demo's made-up session and never reads or starts anything.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { SectionHeading } from './controls.tsx'
import { useDemoFixtures } from './Demo.tsx'
import { useAppApi, useChatLauncher } from './host.ts'
import { Info } from './icons.ts'
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
  return (
    <div data-driver-session={read?.state ?? 'loading'}>
      <Card className="flex flex-col gap-2">
        <SectionHeading
          title="Driver session"
          className="mb-0"
          meta={
            <>
              {read && <Badge variant={read.state === 'running' ? 'success' : undefined}>{LABEL[read.state]}</Badge>}
              <Tooltip text={TIP}>
                {(describedBy) => (
                  <span tabIndex={0} role="img" aria-label="About the driver session" aria-describedby={describedBy} data-info-tip className="inline-flex items-center text-muted">
                    <Info size={14} aria-hidden="true" />
                  </span>
                )}
              </Tooltip>
            </>
          }
        />
        <p className="text-sm text-muted">
          {read ? driverLine(read.state) : 'Reading the driver session…'}
          {seen && read?.state !== 'none' ? ` Last seen ${seen}.` : ''}
          {read?.turnsToday !== undefined && read.turnLimit ? ` ${read.turnsToday} of ${read.turnLimit} turns today.` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {view?.link && (
            <Btn type="button" primary={!view.start} onClick={open} data-driver-open>
              Open driver session
            </Btn>
          )}
          {view?.start && (
            <Btn type="button" primary={!view.link} onClick={start} data-driver-start>
              {view.link ? 'Start a new driver session' : 'Start a driver session'}
            </Btn>
          )}
          {read && (
            <button type="button" className="text-sm underline" onClick={reload} data-driver-recheck>
              Check again
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}
