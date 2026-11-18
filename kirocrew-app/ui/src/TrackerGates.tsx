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
import { Box } from './ui/Box'

const VARIANT: Record<GateState, BadgeVariant> = { open: 'info', failed: 'danger', unknown: 'warning', done: 'success', cleared: 'success' }

export function GateList(props: { gates: GateRow[]; busy?: boolean; onClear?: (taskId: string, reason: string) => void }) {
  const [asking, setAsking] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  return (
    <Box css-display="flex" css-flex-direction="column" css-gap="8" flex flexCol gap="2">
      {props.gates.map((gate) => (
        <Box key={gate.taskId} data-gate={gate.state} css-display="flex" css-flex-direction="column" css-gap="4" css-border-top="1px-solid-border" css-padding-top="8" flex flexCol gap="1" size="sm">
          <Box css-display="flex" css-flex-wrap="wrap" css-align-items="baseline" css-gap="4px-12px" flex flexWrap items="baseline" gapX="3" gapY="1">
            <Badge variant={VARIANT[gate.state]}>{gate.state}</Badge>
            <Box as="span" css-overflow-wrap="anywhere" weight="medium">
              {gate.title}
            </Box>
            <Hint size="xs">{gate.taskId}</Hint>
          </Box>
          <Box as="span" css-overflow-wrap="anywhere" tone="muted" data-gate-tracker>
            {gate.tracker} · {gate.item} · done when {gate.done}
          </Box>
          <Hint size="xs" data-gate-checks>
            Last check {gate.lastCheck ?? 'never'}
            {gate.nextCheck ? ` · next ${gate.nextCheck}` : ''}
          </Hint>
          {gate.evidence && (
            <Box as="span" css-overflow-wrap="anywhere" size="xs" tone="muted" data-gate-evidence>
              {gate.evidence}
            </Box>
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
            <Box css-display="flex" css-flex-wrap="wrap" css-align-items="center" css-gap="8" flex flexWrap items="center" gap="2">
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
            </Box>
          )}
        </Box>
      ))}
    </Box>
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
          <Box role="alert" as="p" css-color="danger" size="sm">
            {failure}
          </Box>
        )}
        <GateList gates={gates} busy={busy} onClear={(taskId, reason) => void clear(taskId, reason)} />
      </Card>
    </div>
  )
}
