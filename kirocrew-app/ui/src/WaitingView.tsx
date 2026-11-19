// Needs you: everything that stops until a person acts. Decisions and
// conflicts come from Conflicts; the items the triage agent handed over
// come from the GitHub pages' owner queue.
// Two pages (Decisions, From the agent), picked in the left nav; each change
// is a Back step.
// Decisions follow Kiro Crew's list-detail pattern: a dense list in the
// middle column, one item's details and actions on the right.
import ConflictsView from './ConflictsView.tsx'
import GitHubItemsView from './GitHubItemsView.tsx'
import { ViewHeading } from './ui/controls.tsx'
import { WAITING_SECTIONS, type WaitingSection } from './nav-api.ts'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'

export type { WaitingSection }
export const SECTIONS = WAITING_SECTIONS

// The section is picked in the left nav; this page shows only that one.
// `decision` is a notice's link to one decision (direct-links D3).
export default function WaitingView(props: {
  workspaceId: string | null
  section: WaitingSection
  onOpenSources?: () => void
  decision?: string | null
  onLeaveDecision?: () => void
}) {
  const open = props.section
  const section = SECTIONS.find((s) => s.key === open) ?? SECTIONS[0]
  return (
    <Box aria-labelledby="avoozl-waiting-title" as="section" flex hFull minH0 flexCol gap="2" data-waiting-view>
      <ViewHeading id="avoozl-waiting-title" view="waiting">
        Needs you
      </ViewHeading>
      <Hint as="p" size="sm" data-waiting-line>
        {section.line}
      </Hint>
      <Box minH0 flex1 data-waiting-section={section.key} data-open="true">
        {open === 'agent' ? (
          <GitHubItemsView workspaceId={props.workspaceId} kind="all" ownerOnly embedded />
        ) : (
          <ConflictsView workspaceId={props.workspaceId} embedded decision={props.decision ?? null} onLeaveDecision={props.onLeaveDecision} />
        )}
      </Box>
    </Box>
  )
}
