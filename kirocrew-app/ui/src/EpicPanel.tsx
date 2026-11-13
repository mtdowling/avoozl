// The epic page (Requirement 59.10, design §6.9): the Graph's epic drill-in
// with the epic's prose beside it. Goal, what done means, each member plan
// with its status and computed progress, and open decisions. Edit and
// Discuss live on the epic folder's row in Plans, like any plan.
import { useCallback } from 'react'
import { Card, CardTitle } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { useRead } from './useRead.ts'
import type { Drill } from './graph-layout.ts'
import type { EpicView, viewsClient } from './views-api.ts'

const bar = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0)

export function EpicPanel(props: {
  workspaceId: string
  id: string
  client: ReturnType<typeof viewsClient>
  onDrill: (drill: Drill) => void
  onOpenPlans?: () => void
}) {
  const load = useCallback((workspace: string) => props.client.epic(workspace, props.id), [props.client, props.id])
  const { value, error } = useRead<EpicView>(props.workspaceId, load)
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>
  if (!value) return null
  return (
    <Card data-epic-panel>
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle>{value.title}</CardTitle>
        <Badge>{value.complete ? 'done' : value.approved ? 'approved' : 'draft'}</Badge>
        <span className="text-xs text-muted">
          {value.progress.done} of {value.progress.total} tasks done across {value.members.length} plans
        </span>
        {props.onOpenPlans && (
          <button type="button" className="ml-auto text-sm underline" onClick={props.onOpenPlans}>
            Edit or discuss in Plans
          </button>
        )}
      </div>
      <div className="mt-2 grid gap-4 text-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))' }}>
        <div className="flex flex-col gap-2" style={{ maxWidth: '75ch' }}>
          {value.goal && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Goal</h4>
              <p className="mt-1 whitespace-pre-wrap">{value.goal}</p>
            </div>
          )}
          {value.done && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">What done means</h4>
              <p className="mt-1 whitespace-pre-wrap">{value.done}</p>
            </div>
          )}
          {value.decisions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Open decisions</h4>
              <ul className="mt-1 list-disc pl-5">
                {value.decisions.map((d) => (
                  <li key={d.taskId}>
                    {d.title}: {d.decision}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Member plans</h4>
          <ul className="mt-1 flex flex-col gap-1">
            {value.members.map((member) => (
              <li key={member.plan}>
                <button
                  type="button"
                  className="w-full rounded px-1 py-0.5 text-left hover:bg-accent/10"
                  onClick={() => props.onDrill({ kind: 'plan', id: member.plan, title: member.title })}
                >
                  <span className="flex justify-between gap-2">
                    <span className="truncate">{member.title}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {member.status}
                      {!member.confirmed && ' · not confirmed'} · {member.progress.done}/{member.progress.total}
                    </span>
                  </span>
                  <span className="mt-0.5 block h-1 overflow-hidden rounded" style={{ background: 'var(--border)' }}>
                    <span className="block h-full" style={{ width: `${bar(member.progress.done, member.progress.total)}%`, background: 'var(--ok)' }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}
