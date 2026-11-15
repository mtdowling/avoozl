// Waiting on you: everything that stops until a person acts. Decisions,
// conflicts and Radar handbacks come from Conflicts; planning-label items,
// incoming issues and ideas come from Intake. Both lost their own pages.
// One section is open at a time, and each change of section is a Back step.
import type { ReactNode } from 'react'
import ConflictsView from './ConflictsView.tsx'
import UntriagedView from './UntriagedView.tsx'
import { ViewHeading } from './controls.tsx'
import { ChevronRight } from './icons.ts'
import { useSteppedState } from './NavHistory.tsx'
import { useListDetail, type ListDetail } from './list-detail.ts'
import { DetailPane } from './ListDetail.tsx'
import type { Idea } from './ideas-api.ts'

export type WaitingSection = 'decisions' | 'intake'

const SECTIONS: { key: WaitingSection; title: string; line: string }[] = [
  { key: 'decisions', title: 'Decisions and conflicts', line: 'A crew handed work back, a spec or issue was edited by hand, or a task needs your choice.' },
  { key: 'intake', title: 'Planning and intake', line: 'Issues labeled for planning, new issues and your own ideas. You choose which become work.' },
]

// A desktop shows the sections as an accordion. A phone shows them as a list,
// and a picked section on its own page with a Back control (list-detail).
export function WaitingSections(props: { open: WaitingSection; onOpen: (key: WaitingSection) => void; bodies: Record<WaitingSection, ReactNode>; ld?: ListDetail }) {
  const own = useListDetail(true)
  const ld = props.ld ?? own
  const { openDetail } = ld
  if (ld.phone) {
    const section = SECTIONS.find((s) => s.key === props.open) ?? SECTIONS[0]
    return ld.showDetail ? (
      <section data-waiting-section={section.key} data-open="true">
        <DetailPane backLabel="Waiting on you" onBack={ld.closeDetail} title={section.title}>
          {props.bodies[section.key]}
        </DetailPane>
      </section>
    ) : (
      <div className="flex flex-col" data-waiting-sections>
        {SECTIONS.map((row) => (
          <section key={row.key} data-waiting-section={row.key} data-open="false" className="border-t" style={{ borderColor: 'var(--border)' }}>
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded="false"
                onClick={() => (props.onOpen(row.key), openDetail())}
                className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold"
                style={{ cursor: 'pointer', background: 'none', border: 0, color: 'inherit', minHeight: 56 }}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {row.title}
                  <span className="text-xs font-normal text-muted">{row.line}</span>
                </span>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </h3>
          </section>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col" data-waiting-sections>
      {SECTIONS.map((section) => {
        const open = props.open === section.key
        return (
          <section key={section.key} data-waiting-section={section.key} data-open={open} className="border-t" style={{ borderColor: 'var(--border)' }}>
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => props.onOpen(section.key)}
                className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold"
                style={{ cursor: 'pointer', background: 'none', border: 0, color: 'inherit' }}
              >
                <span aria-hidden="true" style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none' }}>
                  <ChevronRight size={14} />
                </span>
                {section.title}
                <span className="text-xs font-normal text-muted">{section.line}</span>
              </button>
            </h3>
            {open && <div className="pb-3">{props.bodies[section.key]}</div>}
          </section>
        )
      })}
    </div>
  )
}

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
  const ld = useListDetail(true)
  // A phone showing one section gives it the whole pane: no page heading.
  const detail = ld.phone && ld.showDetail
  return (
    <section aria-labelledby={detail ? undefined : 'avoozl-waiting-title'} aria-label={detail ? 'Waiting on you' : undefined} className="flex flex-col gap-3.5" data-waiting-view>
      {!detail && (
        <>
          <ViewHeading id="avoozl-waiting-title" view="waiting">
            Waiting on you
          </ViewHeading>
          <p className="text-sm text-muted">
            Everything that stops until you act. Crews working, pull requests in checks and merges are not here; they are on Home.
          </p>
        </>
      )}
      <WaitingSections
        ld={ld}
        open={open}
        onOpen={step}
        bodies={{
          decisions: <ConflictsView workspaceId={props.workspaceId} embedded />,
          intake: <UntriagedView workspaceId={props.workspaceId} onMakeSpec={props.onMakeSpec} onOpenSources={props.onOpenSources} embedded />,
        }}
      />
    </section>
  )
}
