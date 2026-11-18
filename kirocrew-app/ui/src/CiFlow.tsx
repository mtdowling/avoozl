import { Card } from '@kirocrew/app-sdk/ui'
import { SectionHeading } from './controls.tsx'
import type { FlowViewModel, RepositoryCi } from './flow-api.ts'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'

const classes = ['code', 'tests', 'ci', 'other', 'spec', 'docs']
const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })
const percent = (value: number) => `${number(value * 100)}%`

function RepositoryCard({ row }: { row: RepositoryCi }) {
  const max = Math.max(1, ...Object.values(row.byClass).map((entry) => entry.task.minutes + entry.other.minutes))
  return <Card className="flex min-w-0 flex-col gap-3">
    <div data-ci-repository={row.repository} className="flex min-w-0 flex-col gap-3" style={{ overflowWrap: 'anywhere' }}>
      <div><SectionHeading title="CI" /><h3 className="m-0 text-sm font-medium">{row.repository}</h3></div>
      <Hint as="p" size="xs" flush>Last {row.windowDays} days · all pull requests, including work outside Avoozl tasks.</Hint>
      <Stack gap={2}>
        <p className="m-0 text-sm font-medium">CI minutes by class</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs"><span>Task <span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 8, background: 'var(--accent)' }} /></span><span>Other <span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 8, background: 'var(--muted)' }} /></span></div>
        {classes.map((name) => {
          const entry = row.byClass[name], task = entry?.task.minutes ?? 0, other = entry?.other.minutes ?? 0
          return <Stack key={name} data-ci-class={name} gap={1}>
            <div className="flex flex-wrap justify-between gap-x-3 text-xs"><span className="font-medium">{name}</span><span>{number(task)} task · {number(other)} other min</span></div>
            <div role="img" aria-label={`${name}: ${number(task)} task minutes, ${number(other)} other minutes`} style={{ display: 'flex', height: 9, borderRadius: 3, overflow: 'hidden', background: 'color-mix(in srgb, var(--muted) 12%, transparent)' }}>
              <span style={{ width: `${100 * task / max}%`, background: 'var(--accent)' }} /><span style={{ width: `${100 * other / max}%`, background: 'var(--muted)' }} />
            </div>
          </Stack>
        })}
      </Stack>
      <p className="m-0 text-sm" data-ci-wait>{row.waitShare === null ? 'CI wait share not available yet' : `CI wait: ${percent(row.waitShare)} of lead time`} · limit {percent(row.waitLimit)} · {row.closedPullRequests} closed pull requests</p>
      <Stack gap={2}><h3 className="m-0 text-sm font-medium">Repeat runs</h3>
        {row.repeats.length ? row.repeats.map((repeat) => <div key={repeat.workflow} data-ci-repeat className="flex min-w-0 flex-col gap-1 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
          <code className="text-xs">{repeat.workflow}</code><span className="text-sm">{repeat.commits} {repeat.commits === 1 ? 'commit' : 'commits'} with repeats · {repeat.extraRuns} extra {repeat.extraRuns === 1 ? 'run' : 'runs'} · {number(repeat.extraMinutes)} extra min</span>
        </div>) : <Hint as="p" size="sm" flush>No repeat runs recorded in this window.</Hint>}
      </Stack>
    </div>
  </Card>
}

export default function CiFlow({ value }: { value?: FlowViewModel['ci'] }) {
  return <section data-flow-ci className="flex min-w-0 flex-col gap-3" aria-label="CI">
    {value?.repositories.length ? value.repositories.map((row) => <RepositoryCard key={row.repository} row={row} />) : <Card><SectionHeading title="CI" /><Hint as="p" size="sm">No pull requests read</Hint></Card>}
  </section>
}
