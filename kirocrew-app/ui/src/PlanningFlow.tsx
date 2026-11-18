import { Card } from './ui/Card'
import { duration, type PlanningTiming } from './flow-api.ts'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

export function PlanningFlow({ groups }: { groups: PlanningTiming[] }) {
  if (!groups.length) return null
  return <Stack data-planning-flow as="section" gap={3}>
    <Box as="h2" m0 size="base" weight="semibold">Planning</Box>
    <Hint as="p" size="sm" flush>Review and answer sessions by spec. Task flow is separate.</Hint>
    {groups.map((group) => <Card key={group.planId} data-planning-spec={group.spec}>
      <Box as="h3" m0 size="sm" weight="semibold">{group.spec}</Box>
      <Box as="p" my="1" size="sm">{duration(group.durationMs)} of session time</Box>
      <Box flex flexCol gap="2" size="sm">
        {group.roles.map((row) => <Box key={`${row.role}:${row.model}`} flex flexWrap justify="between" gapX="4" gapY="1" data-planning-role={row.role}>
          <span>{row.role === 'plan-review' ? 'Reviewer' : 'Planner answer'} · {row.model ?? 'Unreported model'}</span>
          <span>{duration(row.durationMs)} · {row.turns ? `${row.input.toLocaleString()} input / ${row.output.toLocaleString()} output tokens · ${row.credits.toLocaleString()} credits` : 'No usage recorded yet'}</span>
        </Box>)}
      </Box>
    </Card>)}
  </Stack>
}
