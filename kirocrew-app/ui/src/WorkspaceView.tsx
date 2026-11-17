import { useCallback, useEffect, useMemo, useState } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi } from './host.ts'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import {
  describeTick,
  errorMessage,
  isRunning,
  pickDefault,
  removeLines,
  workspaceClient,
  workspaceState,
  type CatalogWorkspace,
  type Repository,
  type TickHealth,
  type WorkspaceList,
} from './workspace-api'
import { TICK_LOG_LINES, chatClient, type TickLine } from './chat-api.ts'
import { relativeTime } from './task-api.ts'
import { SectionHeading, dangerStyle } from './controls.tsx'
import { Modal } from './Modal.tsx'
import { Pencil, Plus, Trash2 } from './icons.ts'

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

// Tick log levels: errors in the danger color, warnings in plain text,
// never the warning yellow (that means "needs you").
const LEVEL_COLOR: Record<TickLine['level'], string> = {
  info: 'var(--muted)',
  warn: 'var(--text)',
  error: 'var(--danger)',
}

function WorkspaceRow(props: {
  workspace: CatalogWorkspace
  selected: boolean
  onSelect: () => void
  onEdit: () => void
}) {
  const { workspace, selected } = props
  return (
    <li className="flex items-start gap-1">
      <button
        type="button"
        aria-pressed={selected}
        onClick={props.onSelect}
        className={`min-w-0 flex-1 rounded px-3 py-2 text-left ${selected ? 'bg-accent/10' : ''}`}
      >
        <span className="font-medium">{workspace.name}</span>{' '}
        <span className="text-xs text-muted">{workspace.id}</span>
        <span className="ml-2 inline-flex gap-1">
          {workspace.served && <Badge variant="info">This backend</Badge>}
          <Tooltip text={workspaceState(workspace.state).tip}>
            <span data-workspace-state={workspace.state}>
              <Badge variant={workspaceState(workspace.state).variant}>{workspaceState(workspace.state).label}</Badge>
            </span>
          </Tooltip>
        </span>
        <span className="block truncate text-xs text-muted">{workspace.root}</span>
      </button>
      <Tooltip text={`Edit ${workspace.name}`}>
        <button
          type="button"
          data-edit-workspace={workspace.id}
          aria-label={`Edit ${workspace.name}`}
          onClick={props.onEdit}
          className="rounded border"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, marginTop: 6, background: 'transparent', borderColor: 'var(--border)', color: 'var(--text)', cursor: 'pointer' }}
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
      </Tooltip>
    </li>
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
  const chats = useMemo(() => chatClient(api), [api])
  const [log, setLog] = useState<TickLine[] | null>(null)
  const [list, setList] = useState<WorkspaceList | null>(null)
  const [selected, setSelected] = useState<string | null>(props.selected ?? null)
  const [health, setHealth] = useState<TickHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ id: '', root: '', name: '' })
  // Which dialog is open: the add form, or one workspace's details.
  const [dialog, setDialog] = useState<'add' | { edit: string } | { remove: string } | null>(null)

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

  const loadSelected = useCallback(
    (id: string) =>
      attempt(async () => {
        setHealth(null)
        setLog(null)
        const [tick, lines] = await Promise.all([
          client.tickHealth(id),
          chats.tickLog(id, TICK_LOG_LINES).catch(() => []),
        ])
        setHealth(tick)
        setLog(lines)
      }),
    [attempt, client, chats],
  )

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    if (selected) void loadSelected(selected)
  }, [selected, loadSelected])

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

  const runTick = () => {
    if (!selected) return
    const workspaceId = selected
    void attempt(async () => {
      await client.tick(workspaceId)
      setHealth(await client.tickHealth(workspaceId))
      setLog(await chats.tickLog(workspaceId, TICK_LOG_LINES).catch(() => []))
    })
  }

  const current = list?.items.find((w) => w.id === selected) ?? null
  const editing = dialog && typeof dialog === 'object' && 'edit' in dialog ? dialog.edit : null
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
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p role="status" className="sr-only">
        {busy ? 'Working…' : ''}
      </p>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <SectionHeading title={`Your workspaces (${list?.items.length ?? 0})`} className="mb-0" />
          <span className="flex-1" />
          <Btn type="button" primary data-add-workspace onClick={() => setDialog('add')}>
            <Plus size={14} aria-hidden="true" /> Add a workspace
          </Btn>
        </div>
        <p className="mt-1 text-sm text-muted">The workspaces on this computer. The one you pick is the one the other tabs show.</p>
        {list === null ? (
          <p className="mt-2 text-sm text-muted">Loading…</p>
        ) : list.items.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No workspaces yet. Add one.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {list.items.map((workspace) => (
              <WorkspaceRow
                key={workspace.id}
                workspace={workspace}
                selected={workspace.id === selected}
                onSelect={() => setSelected(workspace.id)}
                onEdit={() => {
                  setSelected(workspace.id)
                  setDialog({ edit: workspace.id })
                }}
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
          <p id="avoozl-ws-add-line" className="text-sm text-muted">
            A workspace is a folder with your specs. Pick one that already has them, or start a new one.
          </p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <form
            id="avoozl-ws-form"
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void submitWorkspace('add')
            }}
          >
            <Field
              id="avoozl-ws-root"
              label="Folder (absolute path)"
              value={draft.root}
              placeholder="/path/to/plans"
              required
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
                <p className="text-xs text-muted">The folder already has Avoozl specs (an .avoozl.json and its database). Avoozl lists it; nothing in it changes.</p>
              </div>
              <div className="flex flex-col gap-1.5 rounded border p-3" style={{ borderColor: 'var(--border)' }} data-choice="init">
                <span className="text-sm font-medium">Start new</span>
                <p className="text-xs text-muted">Creates an empty workspace in the folder: an .avoozl.json and a new database. Refused if one is already there.</p>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {editing && current && current.id === editing && (
        <Modal
          id="avoozl-ws-edit"
          width="40rem"
          title={current.name}
          backLabel="Close"
          focusClose
          describedBy="avoozl-ws-edit-line"
          attrs={{ 'data-edit-workspace-modal': true }}
          onDismiss={() => setDialog(null)}
          footer={
            <>
              {/* Remove sits at the footer's left, red; it asks first. */}
              <Btn type="button" data-remove-workspace onClick={() => setDialog({ remove: current.id })} disabled={busy} style={{ ...dangerStyle, marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={14} aria-hidden="true" />
                Remove
              </Btn>
              <Btn onClick={runTick} disabled={busy}>
                Run tick now
              </Btn>
              <Btn onClick={() => selected && void loadSelected(selected)} disabled={busy}>
                Refresh health
              </Btn>
            </>
          }
        >
          <p id="avoozl-ws-edit-line" className="text-sm text-muted">
            {current.id} · {current.root}
          </p>
          <div data-tick-panel>
            <SectionHeading title="Tick health" className="mb-2" />
            <p className="my-2 text-sm">{describeTick(health)}</p>
            <h4 className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Last {TICK_LOG_LINES} ticks, newest first
            </h4>
            {!log ? (
              <p className="mt-1 text-xs text-muted">Loading…</p>
            ) : log.length === 0 ? (
              <p className="mt-1 text-xs text-muted">No tick has run yet.</p>
            ) : (
              <ol className="mt-1 mb-2 flex flex-col text-xs" data-tick-log>
                {log.map((line, i) => (
                  <li key={i} className="flex flex-col gap-0.5 border-t py-1 first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                    <span className="flex items-baseline gap-2">
                      <Tooltip text={line.at}>
                        <span className="whitespace-nowrap tabular-nums text-muted">
                          {line.at ? `${line.at.slice(11, 19)} · ${relativeTime(line.at)}` : 'unknown'}
                        </span>
                      </Tooltip>
                      <span className="font-medium uppercase" style={{ color: LEVEL_COLOR[line.level] }}>
                        {line.level}
                      </span>
                    </span>
                    <span className="min-w-0">{line.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Modal>
      )}
      {removing && (
        <Modal
          id="avoozl-ws-remove"
          role="alertdialog"
          width="32rem"
          title={`Remove ${removing.name} from Avoozl?`}
          backLabel="Cancel"
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
              <Btn type="button" data-danger data-remove-confirm disabled={busy} onClick={() => void removeWorkspace(removing, false)} style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}>
                Remove from list
              </Btn>
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
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </Modal>
      )}
    </section>
  )
}
