// The Release queue (RC4.5, design D10): per Issue Radar repository, what is
// released, claimed, next and held, with one reason for each held task, and
// one Release button per spec in Step mode. Read only except that click, which
// a person makes. Rows stack on a narrow page and sit in columns on a wide one.
import { useCallback, useMemo, useState } from 'react'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import { viewsClient } from './views-api.ts'
import Badge, { type BadgeVariant } from './ui/Badge.tsx'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { SectionHeading } from './ui/controls.tsx'
import { errorMessage } from './workspace-api.ts'
import { MODE_TEXT, STATE_LABEL, capacityText, nextSteps, releaseClient, type QueueRepository, type QueueRow, type RowState } from './release-api.ts'
import { Hint } from './ui/Hint'
import { Box } from './ui/Box'

const VARIANT: Record<RowState, BadgeVariant> = { released: 'success', claimed: 'info', next: 'wave', held: 'warning' }

// `held` is a held-reason line the queue itself lacks: a sub-issue link the cap or GitHub left out.
function Row({ row, held }: { row: QueueRow; held?: string }) {
  return (
    <Box data-release-row={row.state} as="li" css-flex-direction="row" css-border-top="1px-solid-border" css-display="flex" css-flex-wrap="wrap" css-gap="4px-12px" css-align-items="baseline" css-padding="8px-0" css-list-style="none">
      <span className="flex flex-none items-center gap-2 sm:w-28" style={{ flex: '0 0 88px' }}>
        <Badge variant={VARIANT[row.state]}>{STATE_LABEL[row.state]}</Badge>
      </span>
      <span className="min-w-0 text-sm sm:w-1/3" style={{ overflowWrap: 'anywhere', flex: '1 1 220px' }}>
        <Box as="span" weight="medium">{row.title}</Box> <Hint size="xs">{row.taskId}</Hint>
        <Box as="span" css-display="block" size="xs" tone="muted">{row.phase}</Box>
      </span>
      <Box as="span" css-overflow-wrap="anywhere" css-flex="2-1-240px" minW0 flex1 size="sm" tone="muted" data-release-reason>
        {row.reason}
        {held && (
          <Box as="span" block size="xs" data-sub-issue>
            {held}
          </Box>
        )}
      </Box>
    </Box>
  )
}

function Repository({ repository, onStep, busy, held }: { repository: QueueRepository; onStep: (planId: string) => void; busy: boolean; held: Map<string, string> }) {
  const steps = repository.mode === 'step' ? nextSteps(repository) : []
  return (
    <Box data-release-repository={repository.repository} as="section" css-display="flex" css-flex-direction="column" css-gap="8" flex flexCol gap="2">
      <Box css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="4px-12px" flex flexWrap items="center" gapX="3" gapY="1">
        <Box as="h4" css-overflow-wrap="anywhere" m0 size="sm" weight="semibold">
          {repository.repository}
        </Box>
        <Badge variant="info">{MODE_TEXT[repository.mode].title}</Badge>
        <Hint size="xs">{capacityText(repository.capacity)}</Hint>
      </Box>
      {steps.map((step) => (
        <Box key={step.planId} data-release-step css-border-color="border" css-border="1px-solid-border" css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="8" css-padding="8" flex flexWrap items="center" gap="2" rounded="md" border="all" p="2" size="sm">
          <Box as="span" css-overflow-wrap="anywhere" minW0 flex1>
            Step is waiting for {step.spec ?? step.planId}, phase <Box as="span" weight="medium">{step.title}</Box>.
          </Box>
          <Btn type="button" primary disabled={busy} onClick={() => onStep(step.planId)}>
            Release {step.title}
          </Btn>
        </Box>
      ))}
      <Box as="ul" css-margin="0" css-padding="0" css-list-style="none" m0 listNone p="0">
        {repository.rows.map((row) => (
          <Row key={row.taskId} row={row} held={held.get(row.taskId)} />
        ))}
      </Box>
    </Box>
  )
}

export default function ReleaseQueue(props: { workspaceId: string | null; onOpenSettings?: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => releaseClient(api), [api])
  const views = useMemo(() => viewsClient(api), [api])
  const load = useCallback(
    async (id: string) => {
      const [queue, delivery] = await Promise.all([client.queue(id), views.delivery(id).catch(() => [])])
      const held = new Map<string, string>()
      for (const item of delivery) if (item.subIssue) held.set(item.id, `Sub-issue link left out: ${item.subIssue.reason}`)
      return { ...queue, held }
    },
    [client, views],
  )
  const { value, error, reload } = useRead(props.workspaceId, load)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const step = async (planId: string) => {
    if (!props.workspaceId) return
    setBusy(true)
    setFailure(null)
    try {
      await client.step(props.workspaceId, planId)
      await reload()
    } catch (caught) {
      setFailure(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  // No repository yet: the card stays and says what to set up.
  if (value && !value.repositories.length && !error)
    return (
      <Box data-release-queue data-release-empty hFull>
        <Card className="flex h-full flex-col gap-2">
          <SectionHeading title="Release queue" className="mb-0" />
          <Hint as="p" size="sm">
            Nothing is queued. The queue lists each task of an approved epic in the order Avoozl releases it, with the reason each one waits. It needs a repository and an approved spec.
          </Hint>
          {props.onOpenSettings && (
            <div>
              <Btn type="button" onClick={props.onOpenSettings}>
                Open Repository setup
              </Btn>
            </div>
          )}
        </Card>
      </Box>
    )
  if (!value && !error) return null
  return (
    <Box data-release-queue hFull>
    <Card className="flex h-full flex-col gap-3" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionHeading title="Release queue" className="mb-0" />
      <Hint as="p" size="xs">In the order the tick releases them. Each held task says why.</Hint>
      {error && <Hint as="p" size="sm">The queue could not be read: {error}</Hint>}
      {failure && (
        <Box role="alert" as="p" css-color="danger" size="sm">
          {failure}
        </Box>
      )}
      {value?.repositories.map((repository) => (
        <Repository key={repository.repository} repository={repository} onStep={(planId) => void step(planId)} busy={busy} held={value.held} />
      ))}
    </Card>
    </Box>
  )
}
