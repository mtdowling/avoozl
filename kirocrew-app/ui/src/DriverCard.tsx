// The driver session on Home and in Settings: a link to the active one, or a
// Start button. It reads one Kiro Crew chat slot (driver-session-api.ts) and
// starts nothing on its own; Start opens a chat a person sends.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { InfoTip, SectionHeading } from './controls.tsx'
import { useAppApi, useChatLauncher } from './host.ts'
import { DRIVER_LINES, DRIVER_START_MESSAGE, readDriver, type DriverSession } from './driver-session-api.ts'
import { linkHref } from './views-api.ts'

const LABEL = { running: 'Running', idle: 'Open', none: 'Not started', unknown: 'Unknown' } as const

// The driver state, read again every minute while the page is open.
export function useDriverSession() {
  const api = useAppApi()
  const [session, setSession] = useState<DriverSession | null>(null)
  const reload = useCallback(() => void readDriver(api).then(setSession), [api])
  useEffect(() => {
    reload()
    const timer = setInterval(reload, 60000)
    return () => clearInterval(timer)
  }, [reload])
  return { session, reload }
}

export default function DriverCard(props: { session: DriverSession | null; reload: () => void }) {
  const { openChat } = useChatLauncher()
  const state = props.session?.state ?? null
  const start = useMemo(() => () => openChat({ message: DRIVER_START_MESSAGE, autoSend: true }), [openChat])
  return (
    <div data-driver-card={state ?? 'loading'}>
      <Card className="flex flex-col gap-2">
        <SectionHeading
          title="Driver session"
          className="mb-0"
          meta={
            <>
              {state && <Badge variant={state === 'running' ? 'success' : undefined}>{LABEL[state]}</Badge>}
              <InfoTip
                label="About the driver session"
                text="One long-running chat that releases ready work in order and watches merges. Crews already working keep going without it. Avoozl reads its state from Kiro Crew."
              />
            </>
          }
        />
        <p className="text-sm text-muted">{state ? DRIVER_LINES[state] : 'Reading the driver session…'}</p>
        <div className="flex flex-wrap items-center gap-2">
          {props.session?.href ? (
            <a href={linkHref(props.session.href)} data-driver-open className="text-sm underline">
              Open driver session
            </a>
          ) : (
            state && (
              <Btn type="button" primary onClick={start} data-driver-start>
                Start a driver session
              </Btn>
            )
          )}
          {state && (
            <button type="button" className="text-sm underline" onClick={props.reload}>
              Check again
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}
