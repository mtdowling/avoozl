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
    <Card flex flexCol gap="2">
      <Stack data-github-flow gap={2}>
        <SectionHeading title="From GitHub" />
        {issues && (
          <Hint as="p" size="sm">
            {summaryLine(view)}. Times are GitHub's.
          </Hint>
        )}
        <Box as="ul" m0 flex listNone flexCol gap="1.5" p="0" hidden={!issues}>
          {rows.map((row, index) => (
            <Box key={row.name} data-flow-stage={row.name} as="li" flex flexWrap items="center" gap="2" size="sm">
              <Box as="span" css-flex="0-0-9rem">
                {row.name}
              </Box>
              <Box aria-hidden="true" as="span" css-flex="1-1-6rem" css-height="8" css-border-radius="4" css-background="mix-muted-15%-transparent">
                <Box
                  as="span"
                  css-display="block"
                  css-height="100%"
                  css-border-radius="4"
                  css-width={`${(100 * (view.median?.[index] ?? 0)) / widest}%`}
                  css-background={row.slowest ? 'accent' : 'muted'}
                />
              </Box>
              <Box as="span" tabularNums>
                {row.median}
              </Box>
              {row.slowest && <Badge variant="warning">Slowest</Badge>}
            </Box>
          ))}
        </Box>
        {view.builds && view.builds.count > 0 && (
          <Stack data-flow-builds gap={1}>
            <Box as="h3" m0 size="sm" weight="semibold">
              Builds
            </Box>
            <Hint as="p" size="xs">
              {buildsLine(view.builds)}. From every build record of each merged pull request.
            </Hint>
            <Box as="ul" css-margin="0" css-padding="0" css-list-style="none" m0 flex listNone flexCol gap="1" p="0" data-flow-build-prs>
              {view.builds.recent.map((row) => (
                <Box
                  key={`${row.repository}-${row.pr}`}
                  data-flow-build-pr={row.pr}
                  as="li"
                  css-display="flex"
                  css-flex-wrap="wrap"
                  css-gap="0-12px"
                  css-overflow-wrap="anywhere"
                  flex
                  flexWrap
                  items="center"
                  gapX="3"
                  size="sm"
                >
                  <span>
                    {row.repository ? `${row.repository} ` : ''}#{row.pr}
                  </span>
                  <Box as="span" tabularNums>
                    {buildMedian(row.totalMs)}
                  </Box>
                  <Hint data-flow-costliest>costliest {costliestLine(row)}</Hint>
                  {row.failedMs > 0 && <Badge variant="danger">{buildMedian(row.failedMs)} failed</Badge>}
                </Box>
              ))}
            </Box>
            <Hint as="p" size="xs" flush>
              Median per phase, target and start, without failed attempts.
            </Hint>
            <Box as="ul" css-margin="0" css-padding="0" css-list-style="none" m0 flex listNone flexCol gap="1" p="0">
              {view.builds.byPhase.map((row) => (
                <Box
                  key={`${row.phase}-${row.target}-${row.start}`}
                  data-flow-build={row.phase}
                  as="li"
                  css-display="flex"
                  css-flex-wrap="wrap"
                  css-gap="0-12px"
                  css-overflow-wrap="anywhere"
                  flex
                  flexWrap
                  gapX="3"
                  size="sm"
                >
                  <span>{row.phase}</span>
                  <span>{row.target}</span>
                  <Hint>{row.start}</Hint>
                  <Box as="span" tabularNums>
                    {buildMedian(row.medianMs)}
                  </Box>
                  <Hint>
                    {row.count} {row.count === 1 ? 'build' : 'builds'}
                  </Hint>
                </Box>
              ))}
            </Box>
            {view.builds.byInstance.length > 1 && (
              <Box as="ul" css-margin="0" css-padding="0" css-list-style="none" m0 flex listNone flexCol gap="1" p="0" data-flow-instances>
                {view.builds.byInstance.map((row) => (
                  <Box key={row.instance ?? 'none'} as="li" css-display="flex" css-flex-wrap="wrap" css-gap="0-12px" css-overflow-wrap="anywhere" flex flexWrap gapX="3" size="sm">
                    {row.instance ? (
                      <Tooltip text={row.instance}>
                        <span>{row.name ?? 'Unnamed machine'}</span>
                      </Tooltip>
                    ) : (
                      <span>No instance</span>
                    )}
                    <Box as="span" tabularNums>
                      {buildMedian(row.medianMs)}
                    </Box>
                    <Hint>
                      {row.count} {row.count === 1 ? 'pull request' : 'pull requests'}, {span(row.totalMs)} in all
                    </Hint>
                  </Box>
                ))}
              </Box>
            )}
          </Stack>
        )}
        {view.skipped.length > 0 && (
          <Hint as="p" size="xs">
            Left out for a missing or unordered time: {view.skipped.map((s) => `#${s.number}`).join(', ')}.
          </Hint>
        )}
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
