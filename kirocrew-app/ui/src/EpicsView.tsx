// The Epics screen (experience proposal, Epics mockup): each epic opens to its
// specs, each spec to its phases with Avoozl's release state: the phase gate,
// the release count and why anything is held. Epics and specs are single-open
// fold-outs. A spec or phase opens the Graph's own drill-in (one Back step).
// This is the only place the plan graph is shown. Specs not on GitHub yet are
// listed apart, and issues already on GitHub link to Issue Radar's Graph.
// Read only: the backend decides every state (src/app/epics-view.mjs).
import { useCallback, useMemo, useState } from 'react'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import Badge, { type BadgeVariant } from './Badge.tsx'
import { RadioFold, type RadioSection } from './RadioFold.tsx'
import { SectionHeading } from './controls.tsx'
import { Network, RefreshCw } from './icons.ts'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { linkHref } from './views-api.ts'
import type { Drill } from './graph-layout.ts'
import {
  GATE_HELP,
  GATE_TEXT,
  epicDrill,
  epicLine,
  epicsClient,
  phaseDrill,
  planDrill,
  radarGraphLink,
  releaseCount,
  type Epic,
  type EpicPlan,
  type EpicsView as View,
  type Gate,
} from './epics-api.ts'

const GATE_VARIANT: Record<Gate, BadgeVariant> = { passed: 'success', open: 'info', closed: 'warning' }
const CELL = { padding: '6px 8px', textAlign: 'left' as const, verticalAlign: 'top' as const, borderTop: '1px solid var(--border)' }

function Phases({ plan, onDrill }: { plan: EpicPlan; onDrill: (drill: Drill) => void }) {
  if (!plan.phases.length) return <p className="text-sm text-muted">This spec has no tasks in the graph yet.</p>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table data-epic-phases={plan.id} className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr className="text-xs text-muted">
            <th style={{ ...CELL, borderTop: 0 }}>Phase</th>
            <th style={{ ...CELL, borderTop: 0 }}>Gate</th>
            <th style={{ ...CELL, borderTop: 0 }}>Release count</th>
            <th style={{ ...CELL, borderTop: 0 }}>Held reason</th>
            <th style={{ ...CELL, borderTop: 0 }} />
          </tr>
        </thead>
        <tbody>
          {plan.phases.map((phase) => (
            <tr key={phase.id} data-epic-phase={phase.id} data-gate={phase.gate}>
              <td style={CELL}>{phase.title}</td>
              <td style={CELL}>
                <Tooltip text={GATE_HELP[phase.gate]}>
                  {(describedBy) => (
                    <span aria-describedby={describedBy} tabIndex={0}>
                      <Badge variant={GATE_VARIANT[phase.gate]}>{GATE_TEXT[phase.gate]}</Badge>
                    </span>
                  )}
                </Tooltip>
              </td>
              <td style={CELL}>{releaseCount(phase)}</td>
              <td style={{ ...CELL, overflowWrap: 'anywhere' }} data-epic-held>
                {phase.held ?? <span className="text-muted">none</span>}
              </td>
              <td style={CELL}>
                <Btn type="button" aria-label={`Graph of phase ${phase.title}`} onClick={() => onDrill(phaseDrill(plan, phase))}>
                  Graph
                </Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// One epic's specs, one open at a time.
function EpicBody({ epic, onDrill }: { epic: Epic; onDrill: (drill: Drill) => void }) {
  const [open, setOpen] = useState<string>(epic.plans[0]?.id ?? '')
  const sections: RadioSection<string>[] = epic.plans.map((plan) => ({
    key: plan.id,
    title: plan.title,
    line: `${plan.phases.length} ${plan.phases.length === 1 ? 'phase' : 'phases'} · ${plan.phases.reduce((n, p) => n + p.merged, 0)} of ${plan.phases.reduce((n, p) => n + p.total, 0)} merged`,
    description: (
      <div className="flex flex-col gap-2">
        <div>
          <Btn type="button" data-epic-graph={plan.id} onClick={() => onDrill(planDrill(plan))}>
            <Network size={14} aria-hidden="true" /> Graph of this spec
          </Btn>
        </div>
        <Phases plan={plan} onDrill={onDrill} />
      </div>
    ),
  }))
  return (
    <div className="flex flex-col gap-1">
      <div>
        <Btn type="button" data-epic-graph-epic={epic.id} onClick={() => onDrill(epicDrill(epic))}>
          <Network size={14} aria-hidden="true" /> Graph of the epic
        </Btn>
      </div>
      <RadioFold name={`epic-${epic.id}`} label={`Specs of ${epic.title}`} value={open} onChange={setOpen} sections={sections} />
    </div>
  )
}

function Empty({ onPlanEpic }: { onPlanEpic?: () => void }) {
  return (
    <Card>
      <div data-epics-empty className="flex flex-col items-start gap-2 p-1">
        <p className="m-0 font-medium">No epics yet</p>
        <p className="m-0 text-sm text-muted">
          An epic is an approved goal that needs many changes in a set order. Start one, approve its spec, and Avoozl turns the tasks into issues and releases them to Issue Radar crews. Work that fits
          in one pull request is not an epic: give it to a crew directly.
        </p>
        {onPlanEpic && (
          <Btn type="button" primary data-plan-epic onClick={onPlanEpic}>
            Plan an epic
          </Btn>
        )}
      </div>
    </Card>
  )
}

function Unprojected({ items }: { items: View['unprojected'] }) {
  if (!items.length) return null
  return (
    <section data-epics-unprojected className="flex flex-col gap-2">
      <SectionHeading title="Not on GitHub yet" level={3} blurb="Specs that have no issues. They cannot be coded until they do." />
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((plan) => (
          <li key={plan.id} data-unprojected={plan.id}>
            <Card>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{plan.title}</span>
                <Badge variant={plan.state === 'approved' ? 'info' : 'warning'}>{plan.state === 'approved' ? 'Approved' : 'Draft'}</Badge>
                <span className="text-xs text-muted">
                  {plan.tasks} {plan.tasks === 1 ? 'task' : 'tasks'}
                </span>
              </div>
              <p className="m-0 mt-1 text-sm text-muted">{plan.reason}</p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function EpicsView(props: { workspaceId: string | null; onDrill: (drill: Drill) => void; onPlanEpic?: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => epicsClient(api), [api])
  const load = useCallback((id: string) => client.read(id), [client])
  const { value, error, busy, reload } = useRead(props.workspaceId, load)
  const [open, setOpen] = useState<string>('')
  const view = value
  const link = view ? radarGraphLink(view) : null
  const sections: RadioSection<string>[] = (view?.epics ?? []).map((epic) => ({
    key: epic.id,
    title: epic.title,
    line: epicLine(epic),
    description: <EpicBody epic={epic} onDrill={props.onDrill} />,
  }))
  return (
    <section data-epics-view aria-labelledby="avoozl-epics-title" className="flex flex-col gap-3">
      <SectionHeading
        id="avoozl-epics-title"
        level={2}
        title="Epics"
        blurb="Approved goals that need many changes in a set order. Each epic opens to its specs and phases."
        actions={
          <>
            {props.onPlanEpic && (
              <Btn type="button" onClick={props.onPlanEpic}>
                Plan an epic
              </Btn>
            )}
            <Btn type="button" onClick={() => void reload()} disabled={busy} aria-label="Refresh epics">
              <RefreshCw size={14} aria-hidden="true" />
            </Btn>
          </>
        }
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!view && !error && <p className="text-sm text-muted">Reading epics…</p>}
      {view && !view.epics.length && !view.unprojected.length && <Empty onPlanEpic={props.onPlanEpic} />}
      {view && sections.length > 0 && <RadioFold name="epics-open" label="Epics" value={open} onChange={setOpen} sections={sections} />}
      {view && <Unprojected items={view.unprojected} />}
      {link && view && view.epics.length > 0 && (
        <p data-radar-graph className="m-0 text-sm">
          Issues on GitHub and their graph:{' '}
          <a href={linkHref(link.href)} target="_top" className="underline">
            {link.label} →
          </a>
          {link.note && <span className="block text-xs text-muted">{link.note}</span>}
        </p>
      )}
    </section>
  )
}
