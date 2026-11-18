// Tracker gates (RC23.11, design D28.8): each gate with its tracker, state,
// last and next check, evidence and link, the tasks it holds, and Clear. The
// list is the same one `avoozl gate list` prints. Nothing shows without a gate.
import { useCallback, useMemo, useState } from 'react'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import Badge, { type BadgeVariant } from './ui/Badge.tsx'
import { SectionHeading } from './ui/controls.tsx'
import { useAppApi } from './host.ts'
import { useRead } from './useRead.ts'
import { clearable, releaseClient, type GateRow, type GateState } from './release-api.ts'
import { errorMessage } from './workspace-api.ts'
import { linkHref } from './views-api.ts'
import { Hint } from './ui/Hint'

const VARIANT: Record<GateState, BadgeVariant> = { open: 'info', failed: 'danger', unknown: 'warning', done: 'success', cleared: 'success' }

export function GateList(props: { gates: GateRow[]; busy?: boolean; onClear?: (taskId: string, reason: string) => void }) {
  const [asking, setAsking] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  return (
    <div className="flex flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {props.gates.map((gate) => (
        <div key={gate.taskId} data-gate={gate.state} className="flex flex-col gap-1 text-sm" style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px' }}>
            <Badge variant={VARIANT[gate.state]}>{gate.state}</Badge>
            <span className="font-medium" style={{ overflowWrap: 'anywhere' }}>
              {gate.title}
            </span>
            <Hint size="xs">{gate.taskId}</Hint>
          </div>
          <span className="text-muted" data-gate-tracker style={{ overflowWrap: 'anywhere' }}>
            {gate.tracker} · {gate.item} · done when {gate.done}
          </span>
          <Hint size="xs" data-gate-checks>
            Last check {gate.lastCheck ?? 'never'}
            {gate.nextCheck ? ` · next ${gate.nextCheck}` : ''}
          </Hint>
          {gate.evidence && (
            <span className="text-xs text-muted" data-gate-evidence style={{ overflowWrap: 'anywhere' }}>
              {gate.evidence}
            </span>
          )}
          {gate.link && (
            <a href={linkHref(gate.link)} target="_blank" rel="noreferrer" className="text-xs" style={{ overflowWrap: 'anywhere' }}>
              Open in the tracker
            </a>
          )}
          {gate.cleared && (
            <Hint size="xs" data-gate-cleared>
              Cleared by {gate.cleared.actor} ({gate.cleared.how}) at {gate.cleared.at}: {gate.cleared.reason} Last state was {gate.cleared.lastState}.
            </Hint>
          )}
          {gate.held.length > 0 && <Hint size="xs">Holds {gate.held.join(', ')}</Hint>}
          {props.onClear && clearable(gate) && (
            <div className="flex flex-wrap items-center gap-2" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {asking === gate.taskId ? (
                <>
                  <input aria-label={`Why clear ${gate.taskId}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why it can be cleared" style={{ flex: '1 1 160px', minWidth: 0 }} />
                  <Btn type="button" disabled={props.busy || !reason.trim()} onClick={() => props.onClear?.(gate.taskId, reason.trim())}>
                    Confirm clear
                  </Btn>
                </>
              ) : (
                <Btn type="button" onClick={() => setAsking(gate.taskId)}>
                  Clear
                </Btn>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function TrackerGates(props: { workspaceId: string | null }) {
  const api = useAppApi()
  const client = useMemo(() => releaseClient(api), [api])
  const load = useCallback((id: string) => client.gates(id), [client])
  const { value, reload } = useRead(props.workspaceId, load)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const gates = value?.gates ?? []
  if (!gates.length) return null
  const clear = async (taskId: string, reason: string) => {
    if (!props.workspaceId) return
    setBusy(true)
    setFailure(null)
    try {
      await client.clearGate(props.workspaceId, taskId, reason)
      await reload()
    } catch (caught) {
      setFailure(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div data-tracker-gates>
      <Card className="flex flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionHeading title="Tracker gates" className="mb-0" />
        <Hint as="p" size="xs">Tasks that wait on an item outside GitHub. Avoozl reads each one and never clears it. A clear is your order, recorded with your name.</Hint>
        {failure && (
          <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
            {failure}
          </p>
        )}
        <GateList gates={gates} busy={busy} onClear={(taskId, reason) => void clear(taskId, reason)} />
      </Card>
    </div>
  )
}
