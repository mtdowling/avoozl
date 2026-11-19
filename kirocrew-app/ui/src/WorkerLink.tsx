// The action that opens one worker attempt (direct-links D2): its chat on
// this machine or a Remote Crew, its log, or where to connect. A link names
// one exact session, so an older attempt's link never opens a newer one.
import { attemptAction } from './task-api.ts'
import { linkHref, type DeliverySession, type GrantedWorker } from './views-api.ts'
import { CirclePlus } from './icons.ts'
import { Hint } from './ui/Hint'
import { PlainLink } from './ui/Plain'

export function AttemptLink(props: { session: DeliverySession; title: string }) {
  const action = attemptAction(props.session)
  if (!action.href || !action.label)
    return (
      <Hint size="xs" data-attempt-note>
        {action.note ?? 'No chat to open'}
      </Hint>
    )
  return (
    <PlainLink
      href={linkHref(action.href)}
      css-display="inline-flex"
      css-align-items="center"
      css-gap="4"
      size="sm"
      underline
      aria-label={`${action.label}: the ${props.session.role} for ${props.title}, attempt ${props.session.attempt}`}
      data-attempt-link
    >
      <CirclePlus size={14} aria-hidden="true" />
      {action.label}
    </PlainLink>
  )
}

// A task a worker machine holds the grant for: its chat lives there, so the
// row names the worker and the machine instead of a link.
export function GrantedWorker(props: { worker: GrantedWorker }) {
  const { worker } = props
  return (
    <Hint size="xs" data-attempt-note data-granted>
      Its chat is on {worker.machine}
    </Hint>
  )
}
