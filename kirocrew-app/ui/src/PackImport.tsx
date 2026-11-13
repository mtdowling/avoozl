// A plugin's settings pack (design §4.14, R55.5-R55.7): the preview table
// that Add plugin's review step and the Import dialog both show, and the
// Import dialog itself. Nothing is written until Import, and Import sends the
// exact preview the person saw.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Btn } from '@kirocrew/app-sdk/ui'
import Badge, { type BadgeVariant } from './Badge.tsx'
import {
  importBlocked,
  importInput,
  packCounts,
  pluginsClient,
  shortValue,
  type PackChange,
  type PackPreview,
  type PluginRow,
} from './plugins-api.ts'
import { errorMessage } from './workspace-api.ts'
import { Modal } from './Modal.tsx'

type Client = ReturnType<typeof pluginsClient>

const ACTION: Record<PackChange['action'], { label: string; variant?: BadgeVariant }> = {
  create: { label: 'Create', variant: 'success' },
  change: { label: 'Change', variant: 'info' },
  keep: { label: 'Keep' },
  skip: { label: 'Skip' },
}

// Each setting the pack sets, as create, change, keep or skip. A who-counts
// change is shown on its line and above the table, never only in a tooltip.
export function PackChanges({ preview }: { preview: PackPreview }) {
  const counts = packCounts(preview.changes)
  return (
    <div className="flex flex-col gap-2 text-sm" data-pack-preview>
      {preview.description && <p className="text-xs text-muted">{preview.description}</p>}
      <p className="text-xs text-muted">
        {counts.create} to create, {counts.change} to change, {counts.keep} already the same
        {counts.skip ? `, ${counts.skip} skipped` : ''}
        {preview.repositories.length ? `. Repositories: ${preview.repositories.join(', ')}.` : '.'}
      </p>
      {preview.warnings.map((warning) => (
        <p key={warning} role="alert" className="text-sm text-danger" data-pack-warning>
          {warning}
        </p>
      ))}
      <div style={{ overflowX: 'auto' }}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 pr-2 font-normal">Setting</th>
              <th className="py-1 pr-2 font-normal">Action</th>
              <th className="py-1 font-normal">Value</th>
            </tr>
          </thead>
          <tbody>
            {preview.changes.map((change) => (
              <tr key={change.setting} className="align-top" style={{ borderTop: '1px solid var(--border)' }}>
                <td className="py-1 pr-2 break-all">
                  <code>{change.setting}</code>
                </td>
                <td className="py-1 pr-2">
                  <Badge variant={change.warning ? 'warning' : ACTION[change.action].variant}>{ACTION[change.action].label}</Badge>
                </td>
                <td className="py-1 break-all">
                  {change.action === 'skip' ? (
                    <span className="text-muted">{change.reason}</span>
                  ) : (
                    <>
                      {change.action === 'change' && (
                        <span className="block text-muted">
                          was <code>{shortValue(change.from)}</code>
                        </span>
                      )}
                      <code>{shortValue(change.to)}</code>
                      {change.warning && <span className="block text-danger">Lowers who counts, as said above.</span>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// The Import dialog for one installed plugin with a pack.
export function PackImportDialog(props: { row: PluginRow; workspaceId: string; client: Client; onClose: (note?: string) => void; onChanged: () => Promise<unknown> }) {
  const { row, workspaceId, client, onClose, onChanged } = props
  const [preview, setPreview] = useState<PackPreview | null>(null)
  const [acceptLowered, setAcceptLowered] = useState(false)
  const [confirmPublic, setConfirmPublic] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const cancel = useCallback(() => onClose(), [onClose])
  useEffect(() => {
    let live = true
    client
      .packPreview(workspaceId, row.id ?? '')
      .then((found) => live && setPreview(found))
      .catch((caught) => live && setError(errorMessage(caught)))
    return () => {
      live = false
    }
  }, [client, workspaceId, row.id])
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button')?.focus()
  }, [])
  const blocked = importBlocked(row, preview, acceptLowered, confirmPublic)
  const run = async () => {
    if (!preview || blocked) return
    setBusy(true)
    setError(null)
    try {
      await client.packImport(workspaceId, importInput(preview, acceptLowered, confirmPublic))
      await onChanged()
      onClose(`Imported ${row.id} version ${row.version} into .avoozl.json.`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    // Esc, Back and a click outside do what Cancel does.
    <Modal id="avoozl-pack" width="48rem" backLabel="Cancel" boxRef={box} attrs={{ 'data-pack-dialog': true }} onDismiss={cancel}>
      <div>
        <h3 id="avoozl-pack-title" className="text-base font-semibold">
          Import {row.id} version {row.version}
        </h3>
        <p className="text-sm text-muted">Copies these settings into .avoozl.json once. Later versions offer their changes here again.</p>
      </div>
      {preview ? <PackChanges preview={preview} /> : !error && <p className="text-sm text-muted">Reading the pack...</p>}
      {preview && preview.warnings.length > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={acceptLowered} onChange={(e) => setAcceptLowered(e.target.checked)} />
          <span>Import the who-counts change above</span>
        </label>
      )}
      {row.source === 'machine' && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={confirmPublic} onChange={(e) => setConfirmPublic(e.target.checked)} />
          <span>
            Write the plugin id into .avoozl.json
            <span className="block text-xs text-muted">This plugin is declared on this computer only. Anyone who can read the repository sees its id and these settings.</span>
          </span>
        </label>
      )}
      {blocked && preview && !(preview.warnings.length && !acceptLowered) && <p className="text-xs text-muted">{blocked}</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Btn type="button" onClick={cancel} disabled={busy}>
          Cancel
        </Btn>
        <Btn type="button" primary onClick={() => void run()} disabled={busy || Boolean(blocked)}>
          Import settings
        </Btn>
      </div>
    </Modal>
  )
}
