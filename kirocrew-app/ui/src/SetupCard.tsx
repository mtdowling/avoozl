// An empty state that says what to set up and gives the button that does it.
// Used where a card used to disappear when nothing was there, so the page
// never looks unchanged for lack of data. Compact: the title, one line cut
// short (the whole of it in a tooltip), then small buttons.
import type { ReactNode } from 'react'
import { Card } from './ui/Card'
import { Tooltip } from './ui/Tooltip.tsx'

export default function SetupCard(props: { id: string; title: string; line: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div data-setup-card={props.id} data-compact-card className="min-w-0">
      <Card className="flex h-full min-w-0 flex-col gap-1" style={{ padding: '8px 12px' }}>
        <h3 className="m-0 truncate text-sm font-semibold">{props.title}</h3>
        <Tooltip text={props.line} display="block">
          {(describedBy) => (
            <p tabIndex={0} aria-describedby={describedBy} className="m-0 truncate text-xs text-muted" data-card-line>
              {props.line}
            </p>
          )}
        </Tooltip>
        {props.children}
        {props.action && <div className="flex min-w-0 flex-wrap items-center gap-1.5">{props.action}</div>}
      </Card>
    </div>
  )
}
