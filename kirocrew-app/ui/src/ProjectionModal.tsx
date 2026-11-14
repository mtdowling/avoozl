// Project to GitHub (RC2.1, mockup 04-projection.html). Step 1 previews every
// write, with a batch choice per suggested group. Step 2 confirms. Create
// issues (held) and Create and release are the only buttons that write, and
// only on step 2. Cancel, Esc and a click outside write nothing.
import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { Modal } from './Modal.tsx'
import { describeWrite, writesByRepository } from './plans-api.ts'
import { UNDO, confirmLines, headline, preflightFailures, projectionClient, toggleBatch, type ProjectionDetail } from './projection-api.ts'
import { errorMessage } from './workspace-api.ts'

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
      attrs={{ 'data-projection-dialog': confirm ?? 'preview' }}
      onDismiss={() => props.onClose('Cancelled. Nothing was written.')}
      footer={
        confirm ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Btn onClick={() => setConfirm(null)} disabled={busy}>
              Back
            </Btn>
            <Btn onClick={() => void create(confirm === 'release')} disabled={busy}>
              {confirm === 'release' ? 'Create and release' : 'Create issues (held)'}
            </Btn>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <Btn onClick={() => props.onClose('Cancelled. Nothing was written.')}>Cancel</Btn>
            <Btn onClick={() => setConfirm('held')} disabled={busy || !preview || writes === 0 || Boolean(blocked)}>
              Create issues (held)…
            </Btn>
            <Btn
              onClick={() => setConfirm('release')}
              disabled={busy || !preview || writes === 0 || Boolean(blocked) || failing.length > 0}
              title={failing.length ? `Preflight: ${failing.map((item) => item.label).join(', ')}` : undefined}
            >
              Create and release…
            </Btn>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {error && (
          <p role="alert" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        {!preview && !error && <p className="text-muted">Reading what the projection would write…</p>}
        {preview && !confirm && (
          <>
            <p className="text-muted">{headline(preview, batches)}</p>
            {blocked?.map((item) => (
              <p key={item.code}>
                <Badge variant="danger">blocked</Badge> {item.message}
              </p>
            ))}
            {preview.publishes !== undefined && (
              <p data-publishes>
                A person publishes {preview.publishes} pull {preview.publishes === 1 ? 'request' : 'requests'} for this spec.
              </p>
            )}
            {preview.preflight && (
              <fieldset className="flex flex-col gap-1 border-0 p-0" data-preflight>
                <legend className="font-medium">Preflight for Create and release</legend>
                {preview.preflight.items.map((item) => (
                  <p key={item.id} data-preflight-item={item.status}>
                    <Badge variant={item.status === 'ok' ? 'success' : item.status === 'fail' ? 'danger' : 'info'}>{item.status === 'unverified' ? 'cannot verify' : item.status}</Badge> {item.label}. <span className="text-muted">{item.detail}</span>
                  </p>
                ))}
              </fieldset>
            )}
            {preview.simulated && <p className="text-muted">This spec is not approved yet. The list shows what approval would write.</p>}
            {(preview.suggestedBatches?.length ?? 0) > 0 && (
              <fieldset className="flex flex-col gap-1 border-0 p-0" data-batches>
                <legend className="font-medium">Batches</legend>
                <p className="text-muted">Small tasks in one wave can share one issue. Each task keeps its own ID.</p>
                {preview.suggestedBatches!.map((group) => (
                  <label key={group.join()} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={batches.some((entry) => entry.join() === group.join())}
                      disabled={busy}
                      onChange={() => void load(toggleBatch(batches, group))}
                    />
                    <span>
                      <code>{group.join(', ')}</code> as one issue
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {writes === 0 ? (
              <p className="text-muted">GitHub already matches this revision.</p>
            ) : (
              writesByRepository(preview.writes).map(([name, list]) => (
                <div key={name}>
                  <p className="font-medium">
                    {name} · {list.length} writes
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {list.map((write, index) => (
                      <li key={index} className="break-words">
                        {describeWrite(write)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
            {preview.conflicts.map((conflict) => (
              <p key={`${conflict.taskId}:${conflict.field}`}>
                <Badge variant="danger">conflict</Badge> <code>{conflict.taskId}</code> {conflict.reason}
              </p>
            ))}
            {[...preview.notes, ...(preview.project.problems ?? [])].map((note) => (
              <p key={note} className="text-muted">
                {note}
              </p>
            ))}
          </>
        )}
        {preview && confirm && (
          <div data-confirm>
            <p>
              Avoozl will write to <code>{repository ?? 'the repository'}</code> with your GitHub login:
            </p>
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
              {confirmLines(preview, repository, confirm === 'release').map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-2 text-muted">{confirm === 'held' ? 'Crews are not released. Your release mode in Settings decides when.' : UNDO}</p>
            {confirm === 'held' && <p className="text-muted">{UNDO}</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}
