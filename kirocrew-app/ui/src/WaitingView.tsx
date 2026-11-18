// Needs you: everything that stops until a person acts. Decisions,
// conflicts and Radar handbacks come from Conflicts; planning-label items,
// and incoming issues come from Intake. Both lost their own pages.
// Three pages (Decisions, Triage, Issue Radar), picked in the left nav; each
// change is a Back step.
// Decisions follow Kiro Crew's list-detail pattern: a dense list in the
// middle column, one item's details and actions on the right.
import ConflictsView from './ConflictsView.tsx'
import UntriagedView from './UntriagedView.tsx'
import { ViewHeading } from './ui/controls.tsx'
import { WAITING_SECTIONS, type WaitingSection } from './nav-api.ts'
import { Hint } from './ui/Hint'

export type { WaitingSection }
export const SECTIONS = WAITING_SECTIONS

// The section is picked in the left nav; this page shows only that one.
export default function WaitingView(props: {
  workspaceId: string | null
  section: WaitingSection
  onOpenSources?: () => void
}) {
  const open = props.section
  const section = SECTIONS.find((s) => s.key === open) ?? SECTIONS[0]
  return (
    <section aria-labelledby="avoozl-waiting-title" className="flex h-full min-h-0 flex-col gap-2" data-waiting-view>
      <ViewHeading id="avoozl-waiting-title" view="waiting">
        Needs you
      </ViewHeading>
      <Hint as="p" size="sm" data-waiting-line>
        {section.line}
      </Hint>
      <div className="min-h-0 flex-1" data-waiting-section={section.key} data-open="true">
        {open === 'decisions' ? (
          <ConflictsView workspaceId={props.workspaceId} embedded />
        ) : (
          <UntriagedView workspaceId={props.workspaceId} onOpenSources={props.onOpenSources} show={open === 'radar' ? 'radar' : 'untriaged'} embedded />
        )}
      </div>
    </section>
  )
}
