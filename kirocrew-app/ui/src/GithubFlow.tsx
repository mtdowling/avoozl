// Flow from GitHub data (RC8.4): the stage waits of finished Issue Radar
// issues, from GitHub's own times. The numbers come from the backend; this
// draws them. Hidden until a Radar repository has been read once.
import { useCallback, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import Badge from './ui/Badge.tsx'
import { SectionHeading } from './ui/controls.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { useRead } from './useRead.ts'
import { buildMedian, buildsLine, costliestLine, flowRows, githubFlowClient, span, summaryLine } from './radar-flow-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

export default function GithubFlow({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => githubFlowClient(api), [api])
  // Read again changes `presses`, which makes the next read ask GitHub.
  const [presses, setPresses] = useState(0)
  const load = useCallback((id: string) => client.read(id, presses > 0), [client, presses])
  const { value: view, error, busy } = useRead(workspaceId, load)
  // A repository with build receipts but no Issue Radar crew shows only its
  // builds: there are no finished issues to time.
  const builds = Boolean(view?.builds?.count)
  if (!view || (!view.repositories.length && !builds && !error)) return null
  const issues = view.repositories.length > 0
  const rows = flowRows(view),
    widest = Math.max(1, ...(view.median ?? [0]))
  return (
    <Card className="flex flex-col gap-2">
      <Stack data-github-flow gap={2}>
        <SectionHeading title="From GitHub" />
        {issues && <Hint as="p" size="sm">{summaryLine(view)}. Times are GitHub's.</Hint>}
        <Box as="ul" m0 flex listNone flexCol gap="1.5" p="0" hidden={!issues}>
          {rows.map((row, index) => (
            <Box key={row.name} data-flow-stage={row.name} as="li" flex flexWrap items="center" gap="2" size="sm">
              <span style={{ flex: '0 0 9rem' }}>{row.name}</span>
              <span
                aria-hidden="true"
                style={{
                  flex: '1 1 6rem',
                  height: 8,
                  borderRadius: 4,
                  background: 'color-mix(in srgb, var(--muted) 15%, transparent)',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    borderRadius: 4,
                    width: `${(100 * (view.median?.[index] ?? 0)) / widest}%`,
                    background: row.slowest ? 'var(--accent)' : 'var(--muted)',
                  }}
                />
              </span>
              <Box as="span" tabularNums>{row.median}</Box>
              {row.slowest && <Badge variant="warning">Slowest</Badge>}
            </Box>
          ))}
        </Box>
        {view.builds && view.builds.count > 0 && (
          <Stack data-flow-builds gap={1}>
            <Box as="h3" m0 size="sm" weight="semibold">Builds</Box>
            <Hint as="p" size="xs">{buildsLine(view.builds)}. From every build record of each merged pull request.</Hint>
            <ul className="m-0 flex list-none flex-col gap-1 p-0" data-flow-build-prs style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {view.builds.recent.map((row) => (
                <li key={`${row.repository}-${row.pr}`} data-flow-build-pr={row.pr} className="flex flex-wrap items-center gap-x-3 text-sm" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 12px', overflowWrap: 'anywhere' }}>
                  <span>{row.repository ? `${row.repository} ` : ''}#{row.pr}</span>
                  <Box as="span" tabularNums>{buildMedian(row.totalMs)}</Box>
                  <Hint data-flow-costliest>
                    costliest {costliestLine(row)}
                  </Hint>
                  {row.failedMs > 0 && <Badge variant="danger">{buildMedian(row.failedMs)} failed</Badge>}
                </li>
              ))}
            </ul>
            <Hint as="p" size="xs" flush>Median per phase, target and start, without failed attempts.</Hint>
            <ul className="m-0 flex list-none flex-col gap-1 p-0" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {view.builds.byPhase.map((row) => (
                <li key={`${row.phase}-${row.target}-${row.start}`} data-flow-build={row.phase} className="flex flex-wrap gap-x-3 text-sm" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 12px', overflowWrap: 'anywhere' }}>
                  <span>{row.phase}</span>
                  <span>{row.target}</span>
                  <Hint>{row.start}</Hint>
                  <Box as="span" tabularNums>{buildMedian(row.medianMs)}</Box>
                  <Hint>{row.count} {row.count === 1 ? 'build' : 'builds'}</Hint>
                </li>
              ))}
            </ul>
            {view.builds.byInstance.length > 1 && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0" data-flow-instances style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {view.builds.byInstance.map((row) => (
                  <li key={row.instance ?? 'none'} className="flex flex-wrap gap-x-3 text-sm" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 12px', overflowWrap: 'anywhere' }}>
                    {row.instance ? (
                      <Tooltip text={row.instance}>
                        <span>{row.name ?? 'Unnamed machine'}</span>
                      </Tooltip>
                    ) : (
                      <span>No instance</span>
                    )}
                    <Box as="span" tabularNums>{buildMedian(row.medianMs)}</Box>
                    <Hint>{row.count} {row.count === 1 ? 'pull request' : 'pull requests'}, {span(row.totalMs)} in all</Hint>
                  </li>
                ))}
              </ul>
            )}
          </Stack>
        )}
        {view.skipped.length > 0 && <Hint as="p" size="xs">Left out for a missing or unordered time: {view.skipped.map((s) => `#${s.number}`).join(', ')}.</Hint>}
        {[...view.errors.map((e) => `${e.repository}: ${e.error}`), ...(error ? [error] : [])].map((text) => (
          <ErrorText key={text} role="alert" size="xs">
            {text}
          </ErrorText>
        ))}
        <Box as="p" flex items="center" gap="2" size="xs" tone="muted">
          {view.readAt ? `Read ${span(Date.now() - Date.parse(view.readAt))} ago.` : ''}
          <Btn type="button" disabled={busy} onClick={() => setPresses((n) => n + 1)}>
            {busy ? 'Reading…' : 'Read again'}
          </Btn>
        </Box>
      </Stack>
    </Card>
  )
}
