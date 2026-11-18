// Project to GitHub (RC2.1, mockup 04-projection.html). Step 1 previews every
// write, with a batch choice per suggested group. Step 2 confirms. Create
// issues (held) and Create and release are the only buttons that write, and
// only on step 2. Cancel, Esc and a click outside write nothing.
import { useCallback, useEffect, useState } from 'react'
import { Btn } from './ui/Btn'
import Badge from './ui/Badge.tsx'
import { Modal } from './ui/Modal.tsx'
import { describeWrite, writesByRepository } from './plans-api.ts'
import { UNDO, confirmLines, headline, preflightFailures, projectionClient, toggleBatch, type ProjectionDetail } from './projection-api.ts'
import { errorMessage } from './workspace-api.ts'
import { Hint } from './ui/Hint'
import { Switch } from './ui/Switch'
import { Box } from './ui/Box'

type Client = ReturnType<typeof projectionClient>

export function ProjectionModal(props: { workspaceId: string; client: Client; planId: string; title: string; onClose: (note?: string) => void; onCreated: () => void }) {
  const { workspaceId, client, planId } = props
  const [preview, setPreview] = useState<ProjectionDetail | null>(null)
  const [batches, setBatches] = useState<string[][]>([])
  const [confirm, setConfirm] = useState<'held' | 'release' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(
    async (chosen: string[][]) => {
      setBusy(true)
      setError(null)
      try {
        setPreview(await client.preview(workspaceId, planId, chosen))
        setBatches(chosen)
      } catch (caught) {
        setError(errorMessage(caught))
      } finally {
        setBusy(false)
      }
    },
    [client, workspaceId, planId],
  )
  useEffect(() => {
    void load([])
  }, [load])
  const create = async (release: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await client.create(workspaceId, planId, batches, release)
      props.onCreated()
      props.onClose(release ? 'Issues created and released.' : 'Issues created. Crews are not released.')
    } catch (caught) {
      setError(errorMessage(caught))
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }
  const repository = preview?.writes.find((write) => write.repository)?.repository ?? null
  const blocked = preview?.blocked?.length ? preview.blocked : null
  const writes = preview?.writes.length ?? 0
  const failing = preflightFailures(preview)
  return (
    <Modal
      id="avoozl-projection"
      width="52rem"
      title={`Project “${props.title}” to GitHub`}
      backLabel="Cancel"
      dismissLabel="Cancel"
      attrs={{ 'data-projection-dialog': confirm ?? 'preview' }}
      onDismiss={() => props.onClose('Cancelled. Nothing was written.')}
      footer={
        confirm ? (
          <>
            <Btn onClick={() => setConfirm(null)} disabled={busy}>
              Back
            </Btn>
            <Btn primary onClick={() => void create(confirm === 'release')} disabled={busy}>
              {confirm === 'release' ? 'Create and release' : 'Create issues (held)'}
            </Btn>
          </>
        ) : (
          <>
            <Btn onClick={() => setConfirm('held')} disabled={busy || !preview || writes === 0 || Boolean(blocked)}>
              Create issues (held)…
            </Btn>
            <Btn
              primary
              onClick={() => setConfirm('release')}
              disabled={busy || !preview || writes === 0 || Boolean(blocked) || failing.length > 0}
              title={failing.length ? `Preflight: ${failing.map((item) => item.label).join(', ')}` : undefined}
            >
              Create and release…
            </Btn>
          </>
        )
      }
    >
      <Box flex flexCol gap="3" size="sm">
        {error && (
          <Box role="alert" as="p" css-color="danger">
            {error}
          </Box>
        )}
        {!preview && !error && <Hint as="p">Reading what the projection would write…</Hint>}
        {preview && !confirm && (
          <>
            <Hint as="p">{headline(preview, batches)}</Hint>
            {blocked?.map((item) => (
              <p key={item.code}>
                <Badge variant="danger">blocked</Badge> {item.message}
              </p>
            ))}
            {preview.preflight && (
              <Box as="fieldset" flex flexCol gap="1" border="0" p="0" data-preflight>
                <Box as="legend" weight="medium">Preflight for Create and release</Box>
                {preview.preflight.items.map((item) => (
                  <p key={item.id} data-preflight-item={item.status}>
                    <Badge variant={item.status === 'ok' ? 'success' : item.status === 'fail' ? 'danger' : 'info'}>{item.status === 'unverified' ? 'cannot verify' : item.status}</Badge> {item.label}. <Hint>{item.detail}</Hint>
                  </p>
                ))}
              </Box>
            )}
            {preview.simulated && <Hint as="p">This spec is not approved yet. The list shows what approval would write.</Hint>}
            {(preview.suggestedBatches?.length ?? 0) > 0 && (
              <Box as="fieldset" flex flexCol gap="1" border="0" p="0" data-batches>
                <Box as="legend" weight="medium">Batches</Box>
                <Hint as="p">Small tasks in one wave can share one issue. Each task keeps its own ID.</Hint>
                {preview.suggestedBatches!.map((group) => (
                  <Switch
                    key={group.join()}
                    label={`${group.join(', ')} as one issue`}
                    align="start"
                    checked={batches.some((entry) => entry.join() === group.join())}
                    disabled={busy}
                    onChange={() => void load(toggleBatch(batches, group))}
                  >
                    <span>
                      <code>{group.join(', ')}</code> as one issue
                    </span>
                  </Switch>
                ))}
              </Box>
            )}
            {writes === 0 ? (
              <Hint as="p">GitHub already matches this revision.</Hint>
            ) : (
              writesByRepository(preview.writes).map(([name, list]) => (
                <div key={name}>
                  <Box as="p" weight="medium">
                    {name} · {list.length} writes
                  </Box>
                  <Box as="ul" mt="1" flex flexCol gap="0.5">
                    {list.map((write, index) => (
                      <Box key={index} as="li" breakWords>
                        {describeWrite(write)}
                      </Box>
                    ))}
                  </Box>
                </div>
              ))
            )}
            {preview.conflicts.map((conflict) => (
              <p key={`${conflict.taskId}:${conflict.field}`}>
                <Badge variant="danger">conflict</Badge> <code>{conflict.taskId}</code> {conflict.reason}
              </p>
            ))}
            {[...preview.notes, ...(preview.project.problems ?? [])].map((note) => (
              <Hint key={note} as="p">
                {note}
              </Hint>
            ))}
          </>
        )}
        {preview && confirm && (
          <div data-confirm>
            <p>
              Avoozl will write to <code>{repository ?? 'the repository'}</code> with your GitHub login:
            </p>
            <Box as="ul" mt="1" flex listDisc flexCol gap="0.5" pl="5">
              {confirmLines(preview, repository, confirm === 'release').map((line) => (
                <li key={line}>{line}</li>
              ))}
            </Box>
            <Box as="p" mt="2" tone="muted">{confirm === 'held' ? 'Crews are not released. Your release mode in Settings decides when.' : UNDO}</Box>
            {confirm === 'held' && <Hint as="p">{UNDO}</Hint>}
          </div>
        )}
      </Box>
    </Modal>
  )
}
