// Integration branches on the Dashboard (RC16.8): per epic with a branch, the
// tasks merged into it, how far it is behind the default branch, and the state
// of its head's checks. Read only. Nothing shows without a branch.
import { useCallback, useMemo } from 'react'
import { Card } from '@kirocrew/app-sdk/ui'
import Badge, { type BadgeVariant } from './Badge.tsx'
import { SectionHeading } from './controls.tsx'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { branchLine, releaseClient } from './release-api.ts'

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
          <div key={row.key} data-integration-branch={row.branch} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px' }}>
            <span className="font-medium" style={{ overflowWrap: 'anywhere' }}>
              {row.branch}
            </span>
            {row.checks && <Badge variant={VARIANT[row.checks] ?? 'info'}>{row.checks}</Badge>}
            <span className="text-muted" style={{ overflowWrap: 'anywhere' }}>
              {branchLine(row)}
            </span>
            {row.error && <span className="text-muted">Last read failed: {row.error}</span>}
          </div>
        ))}
      </Card>
    </div>
  )
}
