import { useMedia } from './use-media.ts'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Tooltip } from './Tooltip.tsx'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import {
  describeTick,
  errorMessage,
  pickDefault,
  workspaceClient,
  workspaceState,
  type CatalogWorkspace,
  type Repository,
  type TickHealth,
  type WorkspaceList,
} from './workspace-api'
import { TICK_LOG_LINES, chatClient, type TickLine } from './chat-api.ts'
import { relativeTime } from './task-api.ts'
import { SectionHeading } from './controls.tsx'

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
}) {
  const { workspace, selected } = props
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={props.onSelect}
        className={`w-full rounded px-3 py-2 text-left ${selected ? 'bg-accent/10' : ''}`}
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

  const wide = useMedia('(min-width: 768px)')
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

      {/* Workspaces and Add on the left; the tick log in its own panel on
          the right, top-aligned. Narrow pages stack it below. */}
      <div
        data-workspaces-layout
        style={wide && current ? { display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(18rem, 2fr)', gap: 14, alignItems: 'start' } : { display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div className="flex min-w-0 flex-col gap-3.5">
      <Card>
        <SectionHeading title={`Your workspaces (${list?.items.length ?? 0})`} className="mb-2" />
        <p className="mt-1 text-sm text-muted">The workspaces on this computer. The one you pick is the one the other tabs show.</p>
        {list === null ? (
          <p className="mt-2 text-sm text-muted">Loading…</p>
        ) : list.items.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No workspaces yet. Add one below.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {list.items.map((workspace) => (
              <WorkspaceRow
                key={workspace.id}
                workspace={workspace}
                selected={workspace.id === selected}
                onSelect={() => setSelected(workspace.id)}
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

      <Card>
        <section aria-labelledby="avoozl-ws-add" data-add-workspace>
          <h3 id="avoozl-ws-add" className="text-base font-semibold">
            Add a workspace
          </h3>
          <p className="mt-1 text-sm text-muted">A workspace is a folder with your specs. Pick one that already has them, or start a new one.</p>
          <form
            className="mt-3 flex flex-col gap-2"
            style={{ maxWidth: '36rem' }}
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
                <Btn type="submit" disabled={busy}>
                  Add existing
                </Btn>
                <p className="text-xs text-muted">The folder already has Avoozl specs (an .avoozl.json and its database). Avoozl lists it; nothing in it changes.</p>
              </div>
              <div className="flex flex-col gap-1.5 rounded border p-3" style={{ borderColor: 'var(--border)' }} data-choice="init">
                <Btn type="button" disabled={busy} onClick={() => void submitWorkspace('init')}>
                  Start new
                </Btn>
                <p className="text-xs text-muted">Creates an empty workspace in the folder: an .avoozl.json and a new database. Refused if one is already there.</p>
              </div>
            </div>
          </form>
        </section>
      </Card>
        </div>
        {current && (
          <aside aria-label="Tick health" className="min-w-0">
          <Card>
            <div data-tick-panel style={{ maxHeight: 'calc(100vh - 12rem)', overflowY: 'auto' }}>
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
              <ol className="mt-1 mb-2 flex max-h-64 flex-col overflow-y-auto text-xs" data-tick-log>
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
            <div className="flex gap-2">
              <Btn onClick={runTick} disabled={busy}>
                Run tick now
              </Btn>
              <Btn onClick={() => selected && void loadSelected(selected)} disabled={busy}>
                Refresh health
              </Btn>
            </div>
            </div>
          </Card>
          </aside>
        )}
      </div>

    </section>
  )
}
