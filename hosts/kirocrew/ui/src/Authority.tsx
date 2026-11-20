import Badge from './ui/Badge.tsx'
import { safeHref, type TaskOwner } from './views-api.ts'
import { linkHref } from './views-api.ts'
import { PlainLink } from './ui/Plain'

// Who owns a task (R28.5): a github task links its issue; a local task shows
// "local". Every view that lists tasks draws this.
export function Authority({ owner }: { owner: TaskOwner }) {
  if (!owner.authority) return null
  if (owner.authority !== 'github') return <Badge>{owner.authority}</Badge>
  // A github task with no issue yet is waiting for its first projection.
  if (!owner.issue) return <Badge>pending projection</Badge>
  const href = safeHref(owner.issue.url)
  const label = owner.issue.number ? `#${owner.issue.number}` : 'GitHub'
  return href ? (
    <PlainLink href={linkHref(href)} target="_blank" rel="noreferrer" size="xs" underline>
      {label}
    </PlainLink>
  ) : (
    <Badge>{label}</Badge>
  )
}
