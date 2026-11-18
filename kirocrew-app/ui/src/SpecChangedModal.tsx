// Spec changed (RC2.8, mockup 04-projection.html). One row per edited, added
// or removed task and what Avoozl will do to its issue. Nothing is written
// until Approve change and apply, and that is off until the spec is approved
// again. A claimed issue is only ever commented on.
import { useEffect, useState } from 'react'
import { Btn } from './ui/Btn'
import Badge from './ui/Badge.tsx'
import { Modal } from './ui/Modal.tsx'
import { ACTION_LABEL, ISSUE_STATE_LABEL, projectionClient, writing, type SpecChange } from './projection-api.ts'
import { errorMessage } from './workspace-api.ts'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

type Client = ReturnType<typeof projectionClient>

export function SpecChangedModal(props: { workspaceId: string; client: Client; planId: string; title: string; onClose: (note?: string) => void; onApplied: () => void }) {
  const { workspaceId, client, planId } = props
  const [change, setChange] = useState<SpecChange | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    client
      .changed(workspaceId, planId)
      .then((value) => live && setChange(value))
      .catch((caught) => live && setError(errorMessage(caught)))
    return () => {
      live = false
    }
  }, [client, workspaceId, planId])
  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      await client.apply(workspaceId, planId)
      props.onApplied()
      props.onClose('Spec change applied.')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const todo = change ? writing(change.rows).length : 0
  const why = !change ? 'Reading the change…' : change.applied ? 'Already applied.' : !change.approved ? 'Approve the spec again at this revision first.' : todo === 0 ? 'Nothing to write.' : null
  return (
    <Modal
      id="avoozl-spec-changed"
      width="52rem"
      title={`Spec changed: ${props.title}`}
      backLabel="Later"
      dismissLabel="Cancel"
      attrs={{ 'data-spec-changed-dialog': '' }}
      onDismiss={() => props.onClose('Nothing was written.')}
      footer={
        <>
          {why && <Hint size="sm">{why}</Hint>}
          <Btn primary onClick={() => void apply()} disabled={busy || why !== null}>
            Approve change and apply
          </Btn>
        </>
      }
    >
      <Box flex flexCol gap="3" size="sm">
        {error && (
          <p role="alert" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        {change && (
          <>
            <Hint as="p">Avoozl wrote nothing yet. The spec must be approved again before it does.</Hint>
            {change.rows.length === 0 ? (
              <Hint as="p">No task changed.</Hint>
            ) : (
              <Stack as="ul" gap={2} data-change-rows>
                {change.rows.map((row) => (
                  <li key={row.taskId} className="flex flex-col gap-0.5 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                    <Box as="span" breakWords>
                      <code>{row.taskId}</code> {row.title} <Badge>{row.change}</Badge>
                    </Box>
                    <Hint>
                      {row.number ? `#${row.number} ` : ''}
                      {ISSUE_STATE_LABEL[row.issueState]} · {ACTION_LABEL[row.action]}. {row.text}
                    </Hint>
                  </li>
                ))}
              </Stack>
            )}
          </>
        )}
      </Box>
    </Modal>
  )
}
