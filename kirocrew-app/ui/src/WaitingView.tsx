// Needs you: everything that stops until a person acts. Decisions,
// conflicts and Radar handbacks come from Conflicts; planning-label items,
// incoming issues and ideas come from Intake. Both lost their own pages.
// Two tabs, one open at a time; each change of tab is a Back step.
// Decisions follow Kiro Crew's list-detail pattern: a dense list in the
// middle column, one item's details and actions on the right.
import { SegmentedControl } from '@kirocrew/app-sdk/ui'
import ConflictsView from './ConflictsView.tsx'
import UntriagedView from './UntriagedView.tsx'
import { ViewHeading } from './controls.tsx'
import { useSteppedState } from './NavHistory.tsx'
import type { Idea } from './ideas-api.ts'

export type WaitingSection = 'decisions' | 'intake'

export const SECTIONS: { key: WaitingSection; title: string; line: string }[] = [
  { key: 'decisions', title: 'Decisions and conflicts', line: 'A crew handed work back, a spec or issue was edited by hand, or a task needs your choice.' },
  { key: 'intake', title: 'Planning and intake', line: 'Issues labeled for planning, new issues and your own ideas. You choose which become work.' },
]

export default function WaitingView(props: {
  workspaceId: string | null
  onMakeSpec?: (idea: Idea) => void
  onOpenSources?: () => void
}) {
  const [open, step] = useSteppedState<WaitingSection>(
    'waiting-section',
    'inner',
    (previous) => `Back to ${SECTIONS.find((s) => s.key === previous)?.title ?? previous}`,
    'decisions',
  )
  const section = SECTIONS.find((s) => s.key === open) ?? SECTIONS[0]
  return (
    <section aria-labelledby="avoozl-waiting-title" className="flex h-full min-h-0 flex-col gap-2" data-waiting-view>
      <ViewHeading id="avoozl-waiting-title" view="waiting">
        Needs you
      </ViewHeading>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-waiting-tabs>
        <SegmentedControl
          collapse={false}
          wrap="hug"
          layoutId="avoozl-waiting-tabs"
          ariaLabel="Needs you sections"
          segments={SECTIONS.map((s) => ({ key: s.key, label: s.title }))}
          value={open}
          onChange={(key) => step(key as WaitingSection)}
        />
        <span className="text-xs text-muted">{section.line}</span>
      </div>
      <div className="min-h-0 flex-1" data-waiting-section={section.key} data-open="true">
        {open === 'decisions' ? (
          <ConflictsView workspaceId={props.workspaceId} embedded />
        ) : (
          <UntriagedView workspaceId={props.workspaceId} onMakeSpec={props.onMakeSpec} onOpenSources={props.onOpenSources} embedded />
        )}
      </div>
    </section>
  )
}
