// Integration branches on the Dashboard (RC16.8): per epic with a branch, the
// tasks merged into it, how far it is behind the default branch, and the state
// of its head's checks. Read only. Nothing shows without a branch.
import { useCallback, useMemo } from 'react'
import { Card } from './ui/Card'
import Badge, { type BadgeVariant } from './ui/Badge.tsx'
import { SectionHeading } from './ui/controls.tsx'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { branchLine, releaseClient } from './release-api.ts'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'

const VARIANT: Record<string, BadgeVariant> = { green: 'success', red: 'danger', pending: 'warning' }

export default function IntegrationBranches(props: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => releaseClient(api), [api])
  const load = useCallback((id: string) => client.branches(id), [client])
  const { value } = useRead(props.workspaceId, load)
  if (!value?.branches.length) return null
  return (
    <div data-integration-branches>
      <Card className="flex flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionHeading title="Integration branches" className="mb-0" />
        {value.branches.map((row) => (
          <Box key={row.key} data-integration-branch={row.branch} css-display="flex" css-flex-wrap="wrap" css-align-items="baseline" css-gap="4px-12px" flex flexWrap items="baseline" gapX="3" gapY="1" size="sm">
            <Box as="span" css-overflow-wrap="anywhere" weight="medium">
              {row.branch}
            </Box>
            {row.checks && <Badge variant={VARIANT[row.checks] ?? 'info'}>{row.checks}</Badge>}
            <Box as="span" css-overflow-wrap="anywhere" tone="muted">
              {branchLine(row)}
            </Box>
            {row.error && <Hint>Last read failed: {row.error}</Hint>}
          </Box>
        ))}
      </Card>
    </div>
  )
}
