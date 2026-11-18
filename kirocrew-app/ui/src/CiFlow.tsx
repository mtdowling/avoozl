import { Card } from './ui/Card'
import { SectionHeading } from './ui/controls.tsx'
import type { FlowViewModel, RepositoryCi } from './flow-api.ts'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

const classes = ['code', 'tests', 'ci', 'other', 'spec', 'docs']
const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })
const percent = (value: number) => `${number(value * 100)}%`

function RepositoryCard({ row }: { row: RepositoryCi }) {
  const max = Math.max(1, ...Object.values(row.byClass).map((entry) => entry.task.minutes + entry.other.minutes))
  return <Card className="flex min-w-0 flex-col gap-3">
    <Box data-ci-repository={row.repository} css-overflow-wrap="anywhere" flex minW0 flexCol gap="3">
      <div><SectionHeading title="CI" /><Box as="h3" m0 size="sm" weight="medium">{row.repository}</Box></div>
      <Hint as="p" size="xs" flush>Last {row.windowDays} days · all pull requests, including work outside Avoozl tasks.</Hint>
      <Stack gap={2}>
        <Box as="p" m0 size="sm" weight="medium">CI minutes by class</Box>
        <Box flex flexWrap gapX="4" gapY="1" size="xs"><span>Task <Box aria-hidden="true" as="span" css-display="inline-block" css-width="12" css-height="8" css-background="accent" /></span><span>Other <Box aria-hidden="true" as="span" css-display="inline-block" css-width="12" css-height="8" css-background="muted" /></span></Box>
        {classes.map((name) => {
          const entry = row.byClass[name], task = entry?.task.minutes ?? 0, other = entry?.other.minutes ?? 0
          return <Stack key={name} data-ci-class={name} gap={1}>
            <Box flex flexWrap justify="between" gapX="3" size="xs"><Box as="span" weight="medium">{name}</Box><span>{number(task)} task · {number(other)} other min</span></Box>
            <Box role="img" aria-label={`${name}: ${number(task)} task minutes, ${number(other)} other minutes`} css-display="flex" css-height="9" css-border-radius="3" css-overflow="hidden" css-background="mix-muted-12%-transparent">
              <Box as="span" css-width={`${100 * task / max}%`} css-background="accent" /><Box as="span" css-width={`${100 * other / max}%`} css-background="muted" />
            </Box>
          </Stack>
        })}
      </Stack>
      <Box as="p" m0 size="sm" data-ci-wait>{row.waitShare === null ? 'CI wait share not available yet' : `CI wait: ${percent(row.waitShare)} of lead time`} · limit {percent(row.waitLimit)} · {row.closedPullRequests} closed pull requests</Box>
      <Stack gap={2}><Box as="h3" m0 size="sm" weight="medium">Repeat runs</Box>
        {row.repeats.length ? row.repeats.map((repeat) => <Box key={repeat.workflow} data-ci-repeat css-border-color="border" flex minW0 flexCol gap="1" border="t" pt="2">
          <Box as="code" size="xs">{repeat.workflow}</Box><Box as="span" size="sm">{repeat.commits} {repeat.commits === 1 ? 'commit' : 'commits'} with repeats · {repeat.extraRuns} extra {repeat.extraRuns === 1 ? 'run' : 'runs'} · {number(repeat.extraMinutes)} extra min</Box>
        </Box>) : <Hint as="p" size="sm" flush>No repeat runs recorded in this window.</Hint>}
      </Stack>
    </Box>
  </Card>
}

export default function CiFlow({ value }: { value?: FlowViewModel['ci'] }) {
  return <Box data-flow-ci as="section" flex minW0 flexCol gap="3" aria-label="CI">
    {value?.repositories.length ? value.repositories.map((row) => <RepositoryCard key={row.repository} row={row} />) : <Card><SectionHeading title="CI" /><Hint as="p" size="sm">No pull requests read</Hint></Card>}
  </Box>
}
