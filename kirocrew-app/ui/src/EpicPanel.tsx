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
import { PlainButton } from './ui/Plain'

const bar = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0)

export function EpicPanel(props: { workspaceId: string; id: string; client: ReturnType<typeof viewsClient>; onDrill: (drill: Drill) => void; onOpenPlans?: () => void }) {
  const load = useCallback((workspace: string) => props.client.epic(workspace, props.id), [props.client, props.id])
  const { value, error } = useRead<EpicView>(props.workspaceId, load)
  if (error)
    return (
      <ErrorText role="alert" size="sm">
        {error}
      </ErrorText>
    )
  if (!value) return null
  return (
    <Card data-epic-panel>
      <SectionHeading
        title={value.title}
        actions={
          props.onOpenPlans && (
            <PlainButton type="button" size="sm" underline onClick={props.onOpenPlans}>
              Edit or discuss in Specs
            </PlainButton>
          )
        }
      />
      <Box mt="1" flex flexWrap items="center" gap="2">
        <Badge>{value.complete ? 'done' : value.approved ? 'approved' : 'draft'}</Badge>
        <Hint size="xs">
          {value.progress.done} of {value.progress.total} tasks done across {value.members.length} specs
        </Hint>
      </Box>
      <Box css-grid-template-columns="repeat-auto-fit-minmax-16rem-1fr" mt="2" grid gap="4" size="sm">
        <Box css-max-width="75ch" flex flexCol gap="2">
          {value.goal && (
            <div>
              <Box as="h4" size="xs" weight="semibold" uppercase trackingWide tone="muted">
                Goal
              </Box>
              <Box as="p" mt="1" whitespace="pre-wrap">
                {value.goal}
              </Box>
            </div>
          )}
          {value.done && (
            <div>
              <Box as="h4" size="xs" weight="semibold" uppercase trackingWide tone="muted">
                What done means
              </Box>
              <Box as="p" mt="1" whitespace="pre-wrap">
                {value.done}
              </Box>
            </div>
          )}
          {value.decisions.length > 0 && (
            <div>
              <Box as="h4" size="xs" weight="semibold" uppercase trackingWide tone="muted">
                Open decisions
              </Box>
              <Box as="ul" mt="1" listDisc pl="5">
                {value.decisions.map((d) => (
                  <li key={d.taskId}>
                    {d.title}: {d.decision}
                  </li>
                ))}
              </Box>
            </div>
          )}
        </Box>
        <div>
          <Box as="h4" size="xs" weight="semibold" uppercase trackingWide tone="muted">
            Member specs
          </Box>
          <Box as="ul" mt="1" flex flexCol gap="1">
            {value.members.map((member) => (
              <li key={member.plan}>
                <PlainButton
                  type="button"
                  wFull
                  rounded="base"
                  px="1"
                  py="0.5"
                  align="left"
                  hoverBgAccent10
                  onClick={() => props.onDrill({ kind: 'plan', id: member.plan, title: member.title })}
                >
                  <Box as="span" flex justify="between" gap="2">
                    <Box as="span" truncate>
                      {member.title}
                    </Box>
                    <Box as="span" shrink0 size="xs" tone="muted">
                      {member.status}
                      {!member.confirmed && ' · not confirmed'} · {member.progress.done}/{member.progress.total}
                    </Box>
                  </Box>
                  <Box as="span" css-background="border" mt="0.5" block h1 overflow="hidden" rounded="base">
                    <Box as="span" css-width={`${bar(member.progress.done, member.progress.total)}%`} css-background="ok" block hFull />
                  </Box>
                </PlainButton>
              </li>
            ))}
          </Box>
        </div>
      </Box>
    </Card>
  )
}
