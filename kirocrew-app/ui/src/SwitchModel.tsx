// The Switch model button and dialog (design §4.20 Page, R72.12–R72.13):
// From a provider, a model or the chosen running tasks, To a model Kiro
// Crew offers, an optional Also new tasks, the preview of the chats it
// moves, and Switch. The backend applies the switch on its next pass with
// Kiro Crew's per-chat model change; the chats keep their session and branch.
import { useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from '@kirocrew/app-sdk/ui'
import { Modal } from './Modal.tsx'
import { IconLabel } from './controls.tsx'
import { Bot } from './icons.ts'
import { errorMessage } from './workspace-api.ts'
import { canUndo, fromInput, fromOptions, markText, providersClient, type ProvidersView, type SwitchPreview } from './providers-api.ts'

const selectStyle = {
  borderColor: 'var(--border)',
  color: 'var(--text)',
  background: 'var(--card, transparent)',
}
const KINDS = [
  { key: 'provider', label: 'Provider' },
  { key: 'model', label: 'Model' },
  { key: 'tasks', label: 'Tasks' },
] as const
type Kind = (typeof KINDS)[number]['key']

export function SwitchModelButton(props: { workspaceId: string | null; tasks?: string[]; onSwitched?: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!props.workspaceId) return null
  return (
    <>
      <IconLabel icon={Bot} tooltip="Move running chats to another model, and optionally new tasks too" onClick={() => setOpen(true)}>
        {props.compact ? 'Switch' : 'Switch model'}
      </IconLabel>
      {open && (
        <SwitchModelDialog
          workspaceId={props.workspaceId}
          tasks={props.tasks ?? []}
          onClose={(switched) => {
            setOpen(false)
            if (switched) props.onSwitched?.()
          }}
        />
      )}
    </>
  )
}

function SwitchModelDialog(props: { workspaceId: string; tasks: string[]; onClose: (switched: boolean) => void }) {
  const { workspaceId } = props
  const api = useAppApi()
  const client = useMemo(() => providersClient(api), [api])
  const [view, setView] = useState<ProvidersView | null>(null)
  const [models, setModels] = useState<{ value: string; label: string }[]>([])
  const [kind, setKind] = useState<Kind>(props.tasks.length ? 'tasks' : 'provider')
  const [name, setName] = useState('')
  const [tasks, setTasks] = useState<string[]>(props.tasks)
  const [to, setTo] = useState('')
  const [alsoNew, setAlsoNew] = useState(false)
  const [preview, setPreview] = useState<SwitchPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const reload = () => client.view(workspaceId).then(setView, (e) => setError(errorMessage(e)))
  useEffect(() => {
    void reload()
    client.models().then(setModels, () => setError("Kiro Crew's model list could not be read."))
  }, [client, workspaceId])
  const options = fromOptions(view?.chats ?? [])
  const from = fromInput(kind, name, tasks)
  // Any change to the choice makes the old preview stale.
  useEffect(() => setPreview(null), [kind, name, tasks, to])
  const runPreview = async () => {
    if (!from || !to) return
    setBusy(true)
    setError(null)
    try {
      setPreview(await client.preview(workspaceId, { from, to }))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const confirm = async () => {
    if (!from || !to || !preview) return
    setBusy(true)
    setError(null)
    try {
      const result = await client.switch(workspaceId, {
        from,
        to,
        alsoNewTasks: alsoNew,
        previewHash: preview.previewHash,
      })
      setDone(`Queued ${result.queued} switch${result.queued === 1 ? '' : 'es'}. Each chat moves at its next turn.`)
      setPreview(null)
      await reload()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const undo = async (id: string) => {
    setError(null)
    try {
      await client.clear(workspaceId, id)
      await reload()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }
  const footer = (
    <div className="flex flex-wrap items-center gap-3">
      <Btn type="button" disabled={busy || !from || !to} onClick={() => void runPreview()}>
        Preview
      </Btn>
      <Btn type="button" primary disabled={busy || !preview || (!preview.chats.length && !alsoNew)} onClick={() => void confirm()} data-switch-confirm>
        Switch
      </Btn>
      <Btn type="button" onClick={() => props.onClose(Boolean(done))}>
        Close
      </Btn>
      {error && (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      )}
      {done && (
        <span role="status" className="text-sm text-muted">
          {done}
        </span>
      )}
    </div>
  )
  return (
    <Modal
      id="avoozl-switch-model"
      title="Switch model"
      unsaved={!done && to !== '' && { title: 'Stop switching?', body: 'No chat is moved. What you picked is lost.', action: 'Stop' }}
      onDismiss={() => props.onClose(Boolean(done))}
      footer={footer}
    >
      <div className="flex flex-col gap-4 text-sm" data-switch-model>
        {(view?.marks.length ?? 0) > 0 && (
          <section aria-label="Provider health">
            <h4 className="font-medium">Health</h4>
            <ul className="mt-1 flex flex-col gap-1">
              {view!.marks.map((mark) => (
                <li key={mark.id} className="flex flex-wrap items-center gap-2">
                  <span>{markText(mark)}</span>
                  {canUndo(mark) && (
                    <Btn type="button" onClick={() => void undo(mark.id)} aria-label={`Undo: ${markText(mark)}`}>
                      Undo
                    </Btn>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="font-medium">From</legend>
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Switch from">
            {KINDS.map((k) => (
              <label key={k.key} className="flex items-center gap-1.5">
                <input type="radio" name="avoozl-switch-from" value={k.key} checked={kind === k.key} onChange={() => setKind(k.key)} />
                {k.label}
              </label>
            ))}
          </div>
          {kind !== 'tasks' ? (
            <>
              <label htmlFor="avoozl-switch-name" className="sr-only">
                {kind === 'provider' ? 'Provider' : 'Model'}
              </label>
              <input
                id="avoozl-switch-name"
                list="avoozl-switch-names"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={kind === 'provider' ? 'A provider, for example claude' : 'A model ID'}
                className="rounded border px-2 py-1"
                style={{ ...selectStyle, maxWidth: '24rem' }}
              />
              <datalist id="avoozl-switch-names">
                {(kind === 'provider' ? options.providers : options.models).map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          ) : options.tasks.length ? (
            <ul className="flex flex-col gap-1" aria-label="Running tasks">
              {options.tasks.map((id) => (
                <li key={id}>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={tasks.includes(id)}
                      onChange={(event) => setTasks(event.target.checked ? [...tasks, id] : tasks.filter((t) => t !== id))}
                    />
                    {id}
                    <span className="text-xs text-muted">
                      {(view?.chats ?? [])
                        .filter((c) => c.taskId === id)
                        .map((c) => `${c.role} on ${c.model ?? 'auto'}`)
                        .join(', ')}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No task is running.</p>
          )}
        </fieldset>
        <div className="flex flex-col gap-1">
          <label htmlFor="avoozl-switch-to" className="font-medium">
            To
          </label>
          <select
            id="avoozl-switch-to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="rounded border px-2 py-1"
            style={{ ...selectStyle, maxWidth: '24rem' }}
          >
            <option value="">Choose a model</option>
            {models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={alsoNew} onChange={(event) => setAlsoNew(event.target.checked)} />
          <span>
            <span className="font-medium">Also new tasks</span> <span className="text-muted">— mark From out, so new tasks use To until you undo it.</span>
          </span>
        </label>
        {preview && (
          <section aria-label="Preview" data-switch-preview>
            <h4 className="font-medium">
              {preview.chats.length ? `Moves ${preview.chats.length} running chat${preview.chats.length === 1 ? '' : 's'}` : 'Moves no running chat'}
            </h4>
            <ul className="mt-1 flex flex-col gap-0.5">
              {preview.chats.map((c) => (
                <li key={c.slot}>
                  {c.taskId} · {c.role} · {c.model} → {to}
                </li>
              ))}
              {preview.skipped.map((c) => (
                <li key={c.slot} className="text-muted">
                  {c.taskId} · {c.role} stays: {c.why}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  )
}
