// Settings > Workspaces > Notifications: browser notices for new Needs you
// items, on the standalone page only (SW8). Off by default. Only a click on
// Turn on asks the browser for permission; a refusal leaves the page working.
import { useEffect, useState } from 'react'
import { Btn } from './ui/Btn'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { FieldGroup } from './ui/FieldGroup.tsx'
import { useInstance } from './InstanceName.tsx'
import { NOTICES_CHANGED, noticesOn, setNotices } from './notices.ts'

type Permission = NotificationPermission | 'unsupported'
const permission = (): Permission => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

export function NoticesSettings(props: { workspaceId: string | null }) {
  const host = useInstance(props.workspaceId)?.host
  const [on, setOn] = useState(() => noticesOn(window.localStorage))
  const [allowed, setAllowed] = useState<Permission>(permission)
  useEffect(() => {
    const read = () => setOn(noticesOn(window.localStorage))
    window.addEventListener(NOTICES_CHANGED, read)
    return () => window.removeEventListener(NOTICES_CHANGED, read)
  }, [])
  if (host !== 'standalone') return null
  const change = (next: boolean) => {
    setNotices(window.localStorage, next)
    setOn(next)
    window.dispatchEvent(new Event(NOTICES_CHANGED))
  }
  const turnOn = async () => {
    // Only this click asks the browser.
    const answer = permission() === 'default' ? await Notification.requestPermission() : permission()
    setAllowed(answer)
    if (answer === 'granted') change(true)
  }
  return (
    <FieldGroup title="Notifications" blurb="A browser notice for each new Needs you item, with its title. Off by default. The page reads Needs you only while it is open.">
      <Stack gap={2} data-notices>
        <Row gap={2}>
          {on ? (
            <Btn onClick={() => change(false)}>Turn off</Btn>
          ) : (
            <Btn onClick={() => void turnOn()} disabled={allowed === 'unsupported'}>
              Turn on
            </Btn>
          )}
          <Hint size="xs" data-notices-state={on ? 'on' : 'off'}>
            {allowed === 'unsupported' ? 'This browser has no notifications.' : on ? 'On for this browser.' : 'Off.'}
          </Hint>
        </Row>
        {allowed === 'denied' && <Hint size="xs">The browser blocked notices for this page. Allow them in its site settings, then turn them on. The page works as before.</Hint>}
      </Stack>
    </FieldGroup>
  )
}
