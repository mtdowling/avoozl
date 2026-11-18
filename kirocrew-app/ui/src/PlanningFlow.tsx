import { Card } from '@kirocrew/app-sdk/ui'
import { duration, type PlanningTiming } from './flow-api.ts'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'

export function PlanningFlow({ groups }: { groups: PlanningTiming[] }) {
  if (!groups.length) return null
  return <Stack data-planning-flow as="section" gap={3}>
    <h2 className="m-0 text-base font-semibold">Planning</h2>
    <Hint as="p" size="sm" flush>Review and answer sessions by spec. Task flow is separate.</Hint>
    {groups.map((group) => <Card key={group.planId} data-planning-spec={group.spec}>
      <h3 className="m-0 text-sm font-semibold">{group.spec}</h3>
      <p className="my-1 text-sm">{duration(group.durationMs)} of session time</p>
      <div className="flex flex-col gap-2 text-sm">
        {group.roles.map((row) => <div key={`${row.role}:${row.model}`} className="flex flex-wrap justify-between gap-x-4 gap-y-1" data-planning-role={row.role}>
          <span>{row.role === 'plan-review' ? 'Reviewer' : 'Planner answer'} · {row.model ?? 'Unreported model'}</span>
          <span>{duration(row.durationMs)} · {row.turns ? `${row.input.toLocaleString()} input / ${row.output.toLocaleString()} output tokens · ${row.credits.toLocaleString()} credits` : 'No usage recorded yet'}</span>
        </div>)}
      </div>
    </Card>)}
  </Stack>
}
