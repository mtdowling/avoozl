// The Release queue (RC4.5, design D10): per Issue Radar repository, what is
// released, claimed, next and held, with one reason for each held task, and
// one Release button per spec in Step mode. Read only except that click, which
// a person makes. Rows stack on a narrow page and sit in columns on a wide one.
import { useCallback, useMemo, useState } from 'react'
import { Btn, Card } from '@kirocrew/app-sdk/ui'
import { viewsClient } from './views-api.ts'
import Badge, { type BadgeVariant } from './Badge.tsx'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { SectionHeading } from './controls.tsx'
import { errorMessage } from './workspace-api.ts'
import { MODE_TEXT, STATE_LABEL, capacityText, nextSteps, releaseClient, type QueueRepository, type QueueRow, type RowState } from './release-api.ts'

const VARIANT: Record<RowState, BadgeVariant> = { released: 'success', claimed: 'info', next: 'wave', held: 'warning' }

// `held` is a held-reason line the queue itself lacks: a sub-issue link the cap or GitHub left out.
function Row({ row, held }: { row: QueueRow; held?: string }) {
  return (
    <li data-release-row={row.state} style={{ flexDirection: 'row', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', padding: '8px 0', listStyle: 'none' }}>
      <span className="flex flex-none items-center gap-2 sm:w-28" style={{ flex: '0 0 88px' }}>
        <Badge variant={VARIANT[row.state]}>{STATE_LABEL[row.state]}</Badge>
      </span>
      <span className="min-w-0 text-sm sm:w-1/3" style={{ overflowWrap: 'anywhere', flex: '1 1 220px' }}>
        <span className="font-medium">{row.title}</span> <span className="text-xs text-muted">{row.taskId}</span>
        <span className="text-xs text-muted" style={{ display: 'block' }}>{row.phase}</span>
      </span>
      <span className="min-w-0 flex-1 text-sm text-muted" data-release-reason style={{ overflowWrap: 'anywhere', flex: '2 1 240px' }}>
        {row.reason}
        {held && (
          <span className="block text-xs" data-sub-issue>
            {held}
          </span>
        )}
      </span>
    </li>
  )
}

function Repository({ repository, onStep, busy, held }: { repository: QueueRepository; onStep: (planId: string) => void; busy: boolean; held: Map<string, string> }) {
  const steps = repository.mode === 'step' ? nextSteps(repository) : []
  return (
    <section data-release-repository={repository.repository} className="flex flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px' }}>
        <h4 className="m-0 text-sm font-semibold" style={{ overflowWrap: 'anywhere' }}>
          {repository.repository}
        </h4>
        <Badge variant="info">{MODE_TEXT[repository.mode].title}</Badge>
        <span className="text-xs text-muted">{capacityText(repository.capacity)}</span>
      </div>
      {steps.map((step) => (
        <div key={step.planId} data-release-step className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm" style={{ borderColor: 'var(--border)', border: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 8 }}>
          <span className="min-w-0 flex-1" style={{ overflowWrap: 'anywhere' }}>
            Step is waiting for {step.spec ?? step.planId}, phase <span className="font-medium">{step.title}</span>.
          </span>
          <Btn type="button" primary disabled={busy} onClick={() => onStep(step.planId)}>
            Release {step.title}
          </Btn>
        </div>
      ))}
      <ul className="m-0 list-none p-0" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {repository.rows.map((row) => (
          <Row key={row.taskId} row={row} held={held.get(row.taskId)} />
        ))}
      </ul>
    </section>
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
  // No Issue Radar repository yet: the card stays and says what to set up.
  if (value && !value.repositories.length && !error)
    return (
      <div data-release-queue data-release-empty>
        <Card className="flex flex-col gap-2">
          <SectionHeading title="Release queue" className="mb-0" />
          <p className="text-sm text-muted">
            Nothing is queued. The queue lists each task of an approved epic in the order Avoozl releases it, with the reason each one waits. It needs a repository coded by Issue Radar and an approved spec.
          </p>
          {props.onOpenSettings && (
            <div>
              <Btn type="button" onClick={props.onOpenSettings}>
                Open Repository setup
              </Btn>
            </div>
          )}
        </Card>
      </div>
    )
  if (!value && !error) return null
  return (
    <div data-release-queue>
    <Card className="flex flex-col gap-3" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionHeading title="Release queue" className="mb-0" />
      <p className="text-xs text-muted">In the order the tick releases them. Each held task says why.</p>
      {error && <p className="text-sm text-muted">The queue could not be read: {error}</p>}
      {failure && (
        <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
          {failure}
        </p>
      )}
      {value?.repositories.map((repository) => (
        <Repository key={repository.repository} repository={repository} onStep={(planId) => void step(planId)} busy={busy} held={value.held} />
      ))}
    </Card>
    </div>
  )
}
