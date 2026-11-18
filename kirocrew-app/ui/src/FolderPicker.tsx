// A folder path field with a Browse button. Browse opens a small list of the
// folders under the person's home folder, read through the app backend
// (workspaces.browse): the page runs in Kiro Crew's iframe, which has no
// native folder dialog. The typed path stays; a pick fills it in.
import { useState } from 'react'
import { Btn } from './ui/Btn'
import { Input } from './ui/Input'
import { errorMessage, type FolderListing, type WorkspaceClient } from './workspace-api'
import { ArrowUp, Folder, FolderOpen } from './icons.ts'
import Badge from './ui/Badge.tsx'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'

export function FolderField(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  client: WorkspaceClient
  placeholder?: string
  required?: boolean
}) {
  const [listing, setListing] = useState<FolderListing | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const show = async (at?: string) => {
    setLoading(true)
    setError(null)
    try {
      setListing(await props.client.browse(at))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }
  const toggle = () => {
    if (open) return setOpen(false)
    setOpen(true)
    // Start where the typed path is, when it is in home; else at home.
    const typed = props.value.trim()
    void (async () => {
      if (typed) {
        setLoading(true)
        try {
          setListing(await props.client.browse(typed))
          setError(null)
          setLoading(false)
          return
        } catch {
          // Not a folder in home: start at home instead.
        }
      }
      await show()
    })()
  }
  const pick = (path: string) => {
    props.onChange(path)
    void show(path)
  }
  return (
    <div className="flex flex-col gap-1 text-sm" data-folder-field={props.id}>
      <label htmlFor={props.id}>{props.label}</label>
      <Row gap={2} wrap={false}>
        <Input
          id={props.id}
          value={props.value}
          placeholder={props.placeholder}
          required={props.required}
          onChange={(event) => props.onChange(event.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Btn type="button" data-folder-browse aria-expanded={open} aria-controls={`${props.id}-browser`} onClick={toggle} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <FolderOpen size={14} aria-hidden="true" /> Browse
        </Btn>
      </Row>
      <Hint size="xs">A full path. ~/ means your home folder.</Hint>
      {open && (
        <div id={`${props.id}-browser`} data-folder-browser className="flex flex-col rounded border" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 border-b px-2 py-1" style={{ borderColor: 'var(--border)' }}>
            <Btn type="button" data-folder-up aria-label="Up one folder" disabled={!listing?.parent || loading} onClick={() => listing?.parent && pick(listing.parent)} style={{ display: 'inline-flex', alignItems: 'center', padding: '0 6px' }}>
              <ArrowUp size={14} aria-hidden="true" />
            </Btn>
            <span className="min-w-0 flex-1 text-xs text-muted" data-folder-at style={{ overflowWrap: "anywhere" }}>
              {listing ? listing.path : 'Loading…'}
            </span>
            {listing?.workspace && <Badge variant="info">Workspace</Badge>}
          </div>
          {error && (
            <p role="alert" className="px-2 py-1 text-xs text-danger">
              {error}
            </p>
          )}
          <ul className="flex flex-col overflow-y-auto py-1" style={{ maxHeight: 200, listStyle: 'none', margin: 0, paddingLeft: 0 }} aria-label="Folders" data-folder-list>
            {listing && listing.folders.length === 0 && <li className="px-2 py-1 text-xs text-muted">No folders here.</li>}
            {listing?.folders.map((folder) => (
              <li key={folder.path}>
                <button
                  type="button"
                  data-folder={folder.name}
                  onClick={() => pick(folder.path)}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm"
                  style={{ background: 'none', border: 0, color: 'var(--text)', cursor: 'pointer' }}
                >
                  <Folder size={14} aria-hidden="true" style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  {folder.workspace && <Badge variant="info">Workspace</Badge>}
                </button>
              </li>
            ))}
            {listing?.truncated && <li className="px-2 py-1 text-xs text-muted">Only the first 500 folders show. Type the rest of the path.</li>}
          </ul>
          <div className="flex justify-end border-t px-2 py-1" style={{ borderColor: 'var(--border)' }}>
            <Btn type="button" data-folder-done onClick={() => setOpen(false)}>
              Use this folder
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}
