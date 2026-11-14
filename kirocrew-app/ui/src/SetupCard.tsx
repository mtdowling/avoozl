// An empty state that says what to set up and gives the button that does it.
// Used where a card used to disappear when nothing was there, so the page
// never looks unchanged for lack of data.
import type { ReactNode } from 'react'
import { Card } from '@kirocrew/app-sdk/ui'
import { SectionHeading } from './controls.tsx'

export default function SetupCard(props: { id: string; title: string; line: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div data-setup-card={props.id}>
      <Card className="flex flex-col gap-2">
        <SectionHeading title={props.title} className="mb-0" />
        <p className="text-sm text-muted">{props.line}</p>
        {props.children}
        {props.action && <div className="flex flex-wrap items-center gap-2">{props.action}</div>}
      </Card>
    </div>
  )
}
