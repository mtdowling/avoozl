// The epic page (Requirement 59.10, design §6.9): the Graph's epic drill-in
// with the epic's prose beside it. Goal, what done means, each member plan
// with its status and computed progress, and open decisions. Edit and
// Discuss live on the epic folder's row in Plans, like any plan.
import { useCallback } from 'react'
import { Card } from './ui/Card'
import { SectionHeading } from './ui/controls.tsx'
import Badge from './ui/Badge.tsx'
import { useRead } from './useRead.ts'
import type { Drill } from './graph-layout.ts'
import type { EpicView, viewsClient } from './views-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'

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
  if (error) return <ErrorText role="alert" size="sm">{error}</ErrorText>
  if (!value) return null
  return (
    <Card data-epic-panel>
      <SectionHeading
        title={value.title}
        actions={
          props.onOpenPlans && (
            <button type="button" className="text-sm underline" onClick={props.onOpenPlans}>
              Edit or discuss in Specs
            </button>
          )
        }
      />
      <Box mt="1" flex flexWrap items="center" gap="2">
        <Badge>{value.complete ? 'done' : value.approved ? 'approved' : 'draft'}</Badge>
        <Hint size="xs">
          {value.progress.done} of {value.progress.total} tasks done across {value.members.length} specs
        </Hint>
      </Box>
      <div className="mt-2 grid gap-4 text-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))' }}>
        <div className="flex flex-col gap-2" style={{ maxWidth: '75ch' }}>
          {value.goal && (
            <div>
              <Box as="h4" size="xs" weight="semibold" uppercase trackingWide tone="muted">Goal</Box>
              <Box as="p" mt="1" whitespace="pre-wrap">{value.goal}</Box>
            </div>
          )}
          {value.done && (
            <div>
              <Box as="h4" size="xs" weight="semibold" uppercase trackingWide tone="muted">What done means</Box>
              <Box as="p" mt="1" whitespace="pre-wrap">{value.done}</Box>
            </div>
          )}
          {value.decisions.length > 0 && (
            <div>
              <Box as="h4" size="xs" weight="semibold" uppercase trackingWide tone="muted">Open decisions</Box>
              <Box as="ul" mt="1" listDisc pl="5">
                {value.decisions.map((d) => (
                  <li key={d.taskId}>
                    {d.title}: {d.decision}
                  </li>
                ))}
              </Box>
            </div>
          )}
        </div>
        <div>
          <Box as="h4" size="xs" weight="semibold" uppercase trackingWide tone="muted">Member specs</Box>
          <Box as="ul" mt="1" flex flexCol gap="1">
            {value.members.map((member) => (
              <li key={member.plan}>
                <button
                  type="button"
                  className="w-full rounded px-1 py-0.5 text-left hover:bg-accent/10"
                  onClick={() => props.onDrill({ kind: 'plan', id: member.plan, title: member.title })}
                >
                  <Box as="span" flex justify="between" gap="2">
                    <Box as="span" truncate>{member.title}</Box>
                    <Box as="span" shrink0 size="xs" tone="muted">
                      {member.status}
                      {!member.confirmed && ' · not confirmed'} · {member.progress.done}/{member.progress.total}
                    </Box>
                  </Box>
                  <span className="mt-0.5 block h-1 overflow-hidden rounded" style={{ background: 'var(--border)' }}>
                    <span className="block h-full" style={{ width: `${bar(member.progress.done, member.progress.total)}%`, background: 'var(--ok)' }} />
                  </span>
                </button>
              </li>
            ))}
          </Box>
        </div>
      </div>
    </Card>
  )
}
