// Flow's Builds (R101.4): every build record of each merged pull request
// and each push to the base branch. The numbers come from the backend; this
// draws them. Hidden until a build was recorded.
import { useCallback, useMemo } from 'react'
import { useAppApi } from './host.ts'
import { Card } from './ui/Card'
import Badge from './ui/Badge.tsx'
import { SectionHeading } from './ui/controls.tsx'
import { Tooltip } from './ui/Tooltip.tsx'
import { useRead } from './useRead.ts'
import { buildMedian, buildsLine, buildsClient, costliestLine, span } from './builds-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

export default function FlowBuilds({ workspaceId }: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => buildsClient(api), [api])
  const load = useCallback((id: string) => client.read(id), [client])
  const { value: builds, error } = useRead(workspaceId, load)
  if (!builds?.count && !error) return null
  return (
    <Card flex flexCol gap="2">
      <Stack data-github-flow gap={2}>
        <SectionHeading title="Builds" />
        {builds && builds.count > 0 && (
          <Stack data-flow-builds gap={1}>
            <Hint as="p" size="xs">
              {buildsLine(builds)}. From every build record of each merged pull request and each push to the base branch.
            </Hint>
            <Box as="ul" css-margin="0" css-padding="0" css-list-style="none" m0 flex listNone flexCol gap="1" p="0" data-flow-build-prs>
              {builds.recent.map((row) => (
                <Box
                  key={`${row.repository}-${row.pr ?? row.commit}`}
                  data-flow-build-pr={row.pr ?? undefined}
                  data-flow-build-commit={row.commit ?? undefined}
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
                    {row.repository ? `${row.repository} ` : ''}
                    {row.pr != null ? `#${row.pr}` : String(row.commit).slice(0, 12)}
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
              {builds.byPhase.map((row) => (
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
            {builds.byInstance.length > 1 && (
              <Box as="ul" css-margin="0" css-padding="0" css-list-style="none" m0 flex listNone flexCol gap="1" p="0" data-flow-instances>
                {builds.byInstance.map((row) => (
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
        {error && (
          <ErrorText role="alert" size="xs">
            {error}
          </ErrorText>
        )}
      </Stack>
    </Card>
  )
}
