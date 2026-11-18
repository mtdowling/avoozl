import { useCallback, useEffect, useMemo, useState } from 'react'
import { Tooltip } from './ui/Tooltip.tsx'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import {
  editChanges,
  editDraft,
  errorMessage,
  isRunning,
  pickDefault,
  removeLines,
  workspaceClient,
  workspaceState,
  type CatalogWorkspace,
  type EditDraft,
  type Repository,
  type WorkspaceList,
} from './workspace-api'
import { SectionHeading } from './ui/controls.tsx'
import { Button } from './ui/Button.tsx'
import { FormSection } from './FormSection.tsx'
import { Modal } from './Modal.tsx'
import { Pencil, Plus, Trash2 } from './icons.ts'
import { FolderField } from './FolderPicker.tsx'
import ListItem from './ListItem.tsx'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'

function Field(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <label htmlFor={props.id} className="flex flex-col gap-1 text-sm">
      <span>{props.label}</span>
      <Input
        id={props.id}
        value={props.value}
        placeholder={props.placeholder}
        required={props.required}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  )
}

function WorkspaceRow(props: {
  workspace: CatalogWorkspace
  selected: boolean
  onSelect: () => void
  onEdit: () => void
}) {
  const { workspace, selected } = props
  return (
    <ListItem
      className={selected ? 'bg-accent/10' : ''}
      title={
        <button type="button" aria-pressed={selected} onClick={props.onSelect} className="flex min-w-0 flex-wrap items-center gap-x-2 text-left">
          <span className="font-medium">{workspace.name}</span>
          <Hint size="xs">{workspace.id}</Hint>
          <span className="inline-flex gap-1">
            {workspace.served && <Badge variant="info">This backend</Badge>}
            <Tooltip text={workspaceState(workspace.state).tip}>
              <span data-workspace-state={workspace.state}>
                <Badge variant={workspaceState(workspace.state).variant}>{workspaceState(workspace.state).label}</Badge>
              </span>
            </Tooltip>
          </span>
        </button>
      }
      facts={[{ label: 'Folder', value: workspace.root, mono: true, truncate: true }]}
      actions={
        <Tooltip text={`Edit ${workspace.name}`}>
          <button
            type="button"
            data-edit-workspace={workspace.id}
            aria-label={`Edit ${workspace.name}`}
            onClick={props.onEdit}
            className="rounded border"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'transparent', borderColor: 'var(--border)', color: 'var(--text)', cursor: 'pointer' }}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
        </Tooltip>
      }
    />
  )
}

// `selected` is the page's workspace; `onSelect` tells the page which one the
// other views read. `onListChange` hands the page each fresh catalog.
export default function WorkspaceView(
  props: {
    selected?: string | null
    onSelect?: (id: string | null) => void
    onListChange?: (list: WorkspaceList) => void
  } = {},
) {
  const { onSelect, onListChange } = props
  const api = useAppApi()
  const client = useMemo(() => workspaceClient(api), [api])
  const [list, setList] = useState<WorkspaceList | null>(null)
  const [selected, setSelected] = useState<string | null>(props.selected ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ id: '', root: '', name: '' })
  // Which dialog is open: the add form, or one workspace's details.
  const [dialog, setDialog] = useState<'add' | { edit: string } | { remove: string } | null>(null)
  // The edit dialog's form, filled from the workspace when it opens.
  const [edit, setEdit] = useState<EditDraft | null>(null)

  // Run one call; show its error instead of throwing.
  const attempt = useCallback(async (call: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await call()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [])

  const loadList = useCallback(
    (prefer: string | null = null) =>
      attempt(async () => {
        const next = await client.list()
        setList(next)
        setSelected((current) => pickDefault(next, prefer ?? current))
      }),
    [attempt, client],
  )

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    onSelect?.(selected)
  }, [selected, onSelect])

  useEffect(() => {
    if (list) onListChange?.(list)
  }, [list, onListChange])

  useEffect(() => {
    if (props.selected) setSelected(props.selected)
  }, [props.selected])

  const submitWorkspace = (mode: 'add' | 'init') =>
    attempt(async () => {
      const input = { id: draft.id.trim(), root: draft.root.trim(), name: draft.name.trim() || undefined }
      const created = mode === 'add' ? await client.add(input) : await client.init(input)
      setDraft({ id: '', root: '', name: '' })
      setDialog(null)
      const next = await client.list()
      setList(next)
      setSelected(created.id)
    })

  const current = list?.items.find((w) => w.id === selected) ?? null
  const editing = dialog && typeof dialog === 'object' && 'edit' in dialog ? dialog.edit : null
  const isDefault = Boolean(current && list?.defaultWorkspace === current.id)
  const editCheck = current && edit ? editChanges(current, isDefault, edit) : { change: null, error: null }
  const openEdit = (workspace: CatalogWorkspace) => {
    setSelected(workspace.id)
    setError(null)
    setEdit(editDraft(workspace, list?.defaultWorkspace === workspace.id))
    setDialog({ edit: workspace.id })
  }
  const closeEdit = () => {
    setEdit(null)
    setError(null)
    setDialog(null)
  }
  const saveEdit = () => {
    const { change } = editCheck
    if (!change) return
    void attempt(async () => {
      await client.update(change)
      const next = await client.list()
      setList(next)
      setEdit(null)
      setDialog(null)
    })
  }
  const removing = dialog && typeof dialog === 'object' && 'remove' in dialog ? (list?.items.find((w) => w.id === dialog.remove) ?? null) : null
  // Remove (or Stop it first, then Remove): the list reloads and the page
  // picks its default again when the shown workspace left.
  const removeWorkspace = (target: CatalogWorkspace, stopFirst: boolean) =>
    attempt(async () => {
      if (stopFirst) await client.stop(target.id)
      await client.remove(target.id)
      setDialog(null)
      const next = await client.list()
      setList(next)
      setSelected((now) => pickDefault(next, now === target.id ? null : now))
    })

  return (
    <section aria-labelledby="avoozl-workspace-title" className="flex flex-col gap-3.5">
      <h2 id="avoozl-workspace-title" className="text-lg font-semibold">
        Workspace
      </h2>
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
      <p role="status" className="sr-only">
        {busy ? 'Working…' : ''}
      </p>

      <Card>
        <Row gap={2}>
          <SectionHeading title={`Your workspaces (${list?.items.length ?? 0})`} className="mb-0" />
          <span className="flex-1" />
          <Btn type="button" primary data-add-workspace onClick={() => setDialog('add')}>
            <Plus size={14} aria-hidden="true" /> Add a workspace
          </Btn>
        </Row>
        <p className="mt-1 text-sm text-muted">The workspaces on this computer. The one you pick is the one the other tabs show.</p>
        {list === null ? (
          <p className="mt-2 text-sm text-muted">Loading…</p>
        ) : list.items.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No workspaces yet. Add one.</p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {list.items.map((workspace) => (
              <WorkspaceRow
                key={workspace.id}
                workspace={workspace}
                selected={workspace.id === selected}
                onSelect={() => setSelected(workspace.id)}
                onEdit={() => openEdit(workspace)}
              />
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Btn onClick={() => void loadList()} disabled={busy}>
            Refresh
          </Btn>
        </div>
      </Card>

      {dialog === 'add' && (
        <Modal
          id="avoozl-ws-add"
          width="36rem"
          title="Add a workspace"
          backLabel="Cancel"
          dismissLabel="Cancel"
          describedBy="avoozl-ws-add-line"
          attrs={{ 'data-add-workspace-modal': true }}
          unsaved={Boolean(draft.id || draft.root || draft.name) && { title: 'Discard this workspace?', body: 'What you entered is lost.', action: 'Discard' }}
          onDismiss={() => setDialog(null)}
          footer={
            <>
              <Btn type="button" disabled={busy} data-add-start-new onClick={() => void submitWorkspace('init')}>
                Start new
              </Btn>
              <Btn type="submit" form="avoozl-ws-form" primary disabled={busy} data-add-existing>
                Add existing
              </Btn>
            </>
          }
        >
          <Hint id="avoozl-ws-add-line" as="p" size="sm">
            A workspace is a folder with your specs. Pick one that already has them, or start a new one.
          </Hint>
          {error && (
            <ErrorText role="alert" size="sm">
              {error}
            </ErrorText>
          )}
          <Stack
            id="avoozl-ws-form"
            as="form" gap={2}
            onSubmit={(event) => {
              event.preventDefault()
              void submitWorkspace('add')
            }}
          >
            <FolderField
              id="avoozl-ws-root"
              label="Folder"
              value={draft.root}
              placeholder="~/plans"
              required
              client={client}
              onChange={(root) => setDraft({ ...draft, root })}
            />
            <Field
              id="avoozl-ws-id"
              label="Short ID"
              value={draft.id}
              placeholder="my-plans"
              required
              onChange={(id) => setDraft({ ...draft, id })}
            />
            <Field id="avoozl-ws-name" label="Name (optional)" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
            <h4 className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted" data-add-how>
              How to add:
            </h4>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }}>
              <div className="flex flex-col gap-1.5 rounded border p-3" style={{ borderColor: 'var(--border)' }} data-choice="add">
                <span className="text-sm font-medium">Add existing</span>
                <Hint as="p" size="xs">The folder already has Avoozl specs (an .avoozl.json and its database). Avoozl lists it; nothing in it changes.</Hint>
              </div>
              <div className="flex flex-col gap-1.5 rounded border p-3" style={{ borderColor: 'var(--border)' }} data-choice="init">
                <span className="text-sm font-medium">Start new</span>
                <Hint as="p" size="xs">Creates an empty workspace in the folder: an .avoozl.json and a new database. Refused if one is already there.</Hint>
              </div>
            </div>
          </Stack>
        </Modal>
      )}

      {editing && current && current.id === editing && edit && (
        <Modal
          id="avoozl-ws-edit"
          width="40rem"
          title={`Edit ${current.name}`}
          backLabel="Close"
          dismissLabel="Cancel"
          focusClose
          describedBy="avoozl-ws-edit-line"
          attrs={{ 'data-edit-workspace-modal': true }}
          unsaved={Boolean(editCheck.change) && { title: 'Discard your changes?', body: 'What you changed is lost.', action: 'Discard' }}
          onDismiss={closeEdit}
          footer={
            <>
              {/* Remove sits at the footer's left, red; it asks first. */}
              <Button type="button" variant="danger" data-remove-workspace onClick={() => setDialog({ remove: current.id })} disabled={busy} style={{ order: -1, marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={14} aria-hidden="true" />
                Remove
              </Button>
              <Btn type="submit" form="avoozl-ws-edit-form" primary data-edit-save disabled={busy || !editCheck.change || Boolean(editCheck.error)}>
                Save
              </Btn>
            </>
          }
        >
          <Hint id="avoozl-ws-edit-line" as="p" size="sm">
            ID {current.id}. The ID cannot change: tasks, receipts and chats name it.
          </Hint>
          <Stack
            id="avoozl-ws-edit-form"
            data-edit-form
            as="form" gap={3}
            onSubmit={(event) => {
              event.preventDefault()
              saveEdit()
            }}
          >
            <FormSection title="Workspace">
              <Field id="avoozl-ws-edit-name" label="Name" value={edit.name} required onChange={(name) => setEdit({ ...edit, name })} />
              <FolderField id="avoozl-ws-edit-root" label="Folder" value={edit.root} required client={client} onChange={(root) => setEdit({ ...edit, root })} />
              <Hint as="p" size="xs">Change it after you move the folder. The new folder must hold this workspace.</Hint>
            </FormSection>
            <FormSection title="Running">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" data-edit-enabled checked={edit.enabled} onChange={(event) => setEdit({ ...edit, enabled: event.target.checked })} />
                On (ticks run and pages read it)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" data-edit-default checked={edit.default} disabled={isDefault} onChange={(event) => setEdit({ ...edit, default: event.target.checked })} />
                {isDefault ? 'The default workspace' : 'Make it the default workspace'}
              </label>
            </FormSection>
            {editCheck.error && (
              <ErrorText size="sm" data-edit-error>
                {editCheck.error}
              </ErrorText>
            )}
            {error && (
              <ErrorText role="alert" size="sm">
                {error}
              </ErrorText>
            )}
          </Stack>
        </Modal>
      )}
      {removing && (
        <Modal
          id="avoozl-ws-remove"
          role="alertdialog"
          width="32rem"
          title={`Remove ${removing.name} from Avoozl?`}
          backLabel="Cancel"
          dismissLabel="Cancel"
          focusClose
          describedBy="avoozl-ws-remove-lines"
          attrs={{ 'data-remove-workspace-confirm': true }}
          onDismiss={() => setDialog({ edit: removing.id })}
          footer={
            <>
              {isRunning(removing) && (
                <Tooltip text="Turn it off, then take it off the list">
                  {(describedBy) => (
                    <Btn type="button" data-remove-stop-first aria-describedby={describedBy} disabled={busy} onClick={() => void removeWorkspace(removing, true)}>
                      Stop it first
                    </Btn>
                  )}
                </Tooltip>
              )}
              <Button type="button" variant="danger" data-remove-confirm disabled={busy} onClick={() => void removeWorkspace(removing, false)}>
                Remove from list
              </Button>
            </>
          }
        >
          <ul id="avoozl-ws-remove-lines" className="flex flex-col gap-1 pl-5 text-sm" style={{ listStyle: 'disc' }} data-remove-lines>
            {removeLines(removing).map((line) => (
              <li key={line} style={{ overflowWrap: 'anywhere' }}>
                {line}
              </li>
            ))}
          </ul>
          {error && (
            <ErrorText role="alert" size="sm">
              {error}
            </ErrorText>
          )}
        </Modal>
      )}
    </section>
  )
}
