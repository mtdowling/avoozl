// An empty state that says what to set up and gives the button that does it.
// Used where a card used to disappear when nothing was there, so the page
// never looks unchanged for lack of data. Compact: the title, one line cut
// short (the whole of it in a tooltip), then small buttons.
import type { ReactNode } from 'react'
import { Card } from './ui/Card'
import { Tooltip } from './ui/Tooltip.tsx'
import { Box } from './ui/Box'

export default function SetupCard(props: { id: string; title: string; line: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <Box data-setup-card={props.id} data-compact-card minW0>
      <Card css-padding="8px-12px" flex hFull minW0 flexCol gap="1">
        <Box as="h3" m0 truncate size="sm" weight="semibold">{props.title}</Box>
        <Tooltip text={props.line} display="block">
          {(describedBy) => (
            <Box tabIndex={0} aria-describedby={describedBy} as="p" m0 truncate size="xs" tone="muted" data-card-line>
              {props.line}
            </Box>
          )}
        </Tooltip>
        {props.children}
        {props.action && <Box flex minW0 flexWrap items="center" gap="1.5">{props.action}</Box>}
      </Card>
    </Box>
  )
}
