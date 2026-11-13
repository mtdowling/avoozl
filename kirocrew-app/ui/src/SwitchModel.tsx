// The Switch model button and dialog (design §4.20 Page, R72.12–R72.13).
// Step 1 picks From (a provider, a model or running tasks, from what is in
// use) and To (Kiro Crew's models, or auto). Step 2 is the backend's dry run
// (provider.switch.preview), which changes nothing. Step 3 confirms exactly
// that set (provider.switch with its hash); if the set changed, the dialog
// shows the difference and asks again. The backend applies the switch on its
// next pass with Kiro Crew's per-chat model change.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn } from '@kirocrew/app-sdk/ui'
import { Modal } from './Modal.tsx'
import { IconLabel } from './controls.tsx'
import { Picker } from './Picker.tsx'
import { Bot } from './icons.ts'
import { errorMessage } from './workspace-api.ts'
import {
  canUndo,
  fromInput,
  fromOptions,
  markText,
  previewDiff,
  providersClient,
  toOptions,
  type ProvidersView,
  type SwitchPreview,
  type SwitchResult,
} from './providers-api.ts'

const selectStyle = {
  borderColor: 'var(--border)',
  color: 'var(--text)',
  background: 'var(--card, transparent)',
  maxWidth: '24rem',
}
const KINDS = [
  { key: 'provider', label: 'Provider' },
  { key: 'model', label: 'Model' },
  { key: 'tasks', label: 'Tasks' },
] as const
type Kind = (typeof KINDS)[number]['key']
type Step = 'choose' | 'preview' | 'done'
// A longer list than this uses the searchable picker.
const LONG = 12

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

// One choice: a dropdown, the searchable picker for a long list, or a text
// box with a note when the list could not be read.
function Choice(props: { id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] | null; empty: string; note: string; placeholder: string }) {
  if (!props.options)
    return (
      <>
        <input
          id={props.id}
          type="text"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.placeholder}
          aria-describedby={`${props.id}-note`}
          className="rounded border px-2 py-1"
          style={selectStyle}
        />
        <span id={`${props.id}-note`} className="text-xs text-muted" data-switch-to-note={props.id === 'avoozl-switch-to' ? '' : undefined}>
          {props.note}
        </span>
      </>
    )
  if (props.options.length > LONG)
    return (
      <Picker
        id={props.id}
        label={<span className="sr-only">{props.label}</span>}
        items={props.options.map((o) => ({ id: o.value, title: o.label }))}
        value={props.value}
        onPick={props.onChange}
        placeholder={props.empty}
        maxWidth="24rem"
      />
    )
  return (
    <select id={props.id} value={props.value} onChange={(event) => props.onChange(event.target.value)} className="rounded border px-2 py-1" style={selectStyle}>
      <option value="">{props.empty}</option>
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function PreviewView({ preview }: { preview: SwitchPreview }) {
  const cell = { padding: '4px 8px', borderTop: '1px solid var(--border)', verticalAlign: 'baseline' } as const
  const head = { ...cell, borderTop: 'none', textAlign: 'left', fontWeight: 500, fontSize: 12, color: 'var(--muted)' } as const
  const task = (c: { taskId: string; title: string | null }) => (
    <>
      {c.title ?? c.taskId} <span className="text-xs text-muted">{c.taskId}</span>
    </>
  )
  return (
    <section aria-label="Preview" data-switch-preview className="flex flex-col gap-3">
      <p className="font-medium">
        {preview.counts.move ? `Moves ${plural(preview.counts.move, 'running chat')}` : 'Moves no running chat'} · {preview.counts.stay} stay{preview.counts.stay === 1 ? 's' : ''}
        {preview.counts.newTasks ? ` · ${plural(preview.counts.newTasks, 'new task')}` : ''}
      </p>
      {preview.chats.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Task', 'Spec', 'Now', 'New', 'Runs on'].map((h) => (
                  <th key={h} style={head} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.chats.map((c) => (
                <tr key={c.slot ?? c.taskId}>
                  <td style={cell}>
                    {task(c)} <span className="text-xs text-muted">· {c.role}</span>
                  </td>
                  <td style={cell}>{c.spec ?? '—'}</td>
                  <td style={cell}>{c.model ?? 'auto'}</td>
                  <td style={cell}>{c.to}</td>
                  <td style={cell}>
                    {c.where ?? '—'}
                    {c.agent ? <span className="text-xs text-muted"> · {c.agent}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview.skipped.length > 0 && (
        <div>
          <h4 className="font-medium">Can't switch</h4>
          <ul className="mt-1 flex flex-col gap-0.5">
            {preview.skipped.map((c) => (
              <li key={`${c.slot ?? ''}:${c.taskId}`}>
                {task(c)}
                {c.role ? ` · ${c.role}` : ''}: <span className="text-muted">{c.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.newTasks.length > 0 && (
        <div>
          <h4 className="font-medium">Queued tasks the new-task rule moves</h4>
          <ul className="mt-1 flex flex-col gap-0.5">
            {preview.newTasks.map((q) => (
              <li key={q.taskId}>
                {task(q)}: <span className="text-muted">skips {q.model}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function SwitchModelDialog(props: { workspaceId: string; tasks: string[]; onClose: (switched: boolean) => void }) {
  const { workspaceId } = props
  const api = useAppApi()
  const client = useMemo(() => providersClient(api), [api])
  const [view, setView] = useState<ProvidersView | null>(null)
  const [viewFailed, setViewFailed] = useState(false)
  const [models, setModels] = useState<{ value: string; label: string }[] | null>(null)
  const [modelsFailed, setModelsFailed] = useState(false)
  const [kind, setKind] = useState<Kind>(props.tasks.length ? 'tasks' : 'provider')
  const [name, setName] = useState('')
  const [tasks, setTasks] = useState<string[]>(props.tasks)
  const [to, setTo] = useState('')
  const [alsoNew, setAlsoNew] = useState(false)
  const [step, setStep] = useState<Step>('choose')
  const [preview, setPreview] = useState<SwitchPreview | null>(null)
  const [changed, setChanged] = useState<{ added: string[]; removed: string[] } | null>(null)
  const [result, setResult] = useState<SwitchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reload = () =>
    client.view(workspaceId).then(
      (v) => {
        setView(v)
        setViewFailed(false)
      },
      () => setViewFailed(true),
    )
  useEffect(() => {
    void reload()
    client.models().then(setModels, () => setModelsFailed(true))
  }, [client, workspaceId])
  const options = fromOptions(view?.chats ?? [], view?.marks ?? [])
  const from = fromInput(kind, name, tasks)
  const input = from && to ? { from, to: to.trim(), alsoNewTasks: alsoNew } : null
  // The From list: what is in use, or null (a text box) when it can't be read.
  const fromList = viewFailed ? null : (kind === 'provider' ? options.providers : options.models).map((v) => ({ value: v, label: v }))
  const toList = modelsFailed ? null : models ? toOptions(models) : []

  const dryRun = async () => {
    if (!input) return null
    return client.preview(workspaceId, input)
  }
  const runPreview = async () => {
    setBusy(true)
    setError(null)
    setChanged(null)
    try {
      const next = await dryRun()
      if (next) {
        setPreview(next)
        setStep('preview')
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const confirm = async () => {
    if (!input || !preview) return
    setBusy(true)
    setError(null)
    try {
      const done = await client.switch(workspaceId, { ...input, previewHash: preview.previewHash })
      setResult(done)
      setStep('done')
      await reload()
    } catch (caught) {
      // The set changed since the preview: show what moved and ask again.
      if ((caught as { status?: unknown })?.status === 409) {
        try {
          const next = await dryRun()
          if (next) {
            setChanged(previewDiff(preview, next))
            setPreview(next)
          }
        } catch (again) {
          setError(errorMessage(again))
        }
      } else setError(errorMessage(caught))
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
  const close = () => props.onClose(step === 'done')
  const footer = (
    <div className="flex flex-wrap items-center gap-3">
      {step === 'choose' && (
        <Btn type="button" primary disabled={busy || !input} onClick={() => void runPreview()}>
          Preview
        </Btn>
      )}
      {step === 'preview' && (
        <>
          <Btn
            type="button"
            onClick={() => {
              setStep('choose')
              setChanged(null)
            }}
          >
            Back
          </Btn>
          <Btn type="button" primary disabled={busy || !preview || (!preview.chats.length && !alsoNew)} onClick={() => void confirm()} data-switch-confirm>
            Switch
          </Btn>
        </>
      )}
      <Btn type="button" onClick={close}>
        Close
      </Btn>
      {error && (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      )}
    </div>
  )
  const field = (label: string, htmlFor: string, body: ReactNode) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="font-medium">
        {label}
      </label>
      {body}
    </div>
  )
  return (
    <Modal
      id="avoozl-switch-model"
      title="Switch model"
      unsaved={step !== 'done' && to !== '' && { title: 'Stop switching?', body: 'No chat is moved. What you picked is lost.', action: 'Stop' }}
      onDismiss={close}
      footer={footer}
    >
      <div className="flex flex-col gap-4 text-sm" data-switch-model>
        <div className="flex flex-col gap-1 text-muted" data-switch-intro>
          <p>
            A switch moves running chats to another model. Each chat changes at its next turn and keeps its branch and worktree. The reply it is writing is not lost.
          </p>
          <p>
            <span className="font-medium" style={{ color: 'var(--text)' }}>
              Also new tasks
            </span>{' '}
            makes routing skip the old model for new tasks, until you undo it.
          </p>
        </div>
        {step === 'choose' && (
          <>
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
                    <input
                      type="radio"
                      name="avoozl-switch-from"
                      value={k.key}
                      checked={kind === k.key}
                      onChange={() => {
                        setKind(k.key)
                        setName('')
                      }}
                    />
                    {k.label}
                  </label>
                ))}
              </div>
              {kind !== 'tasks' ? (
                <>
                  <label htmlFor="avoozl-switch-from-name" className="sr-only">
                    {kind === 'provider' ? 'Provider' : 'Model'}
                  </label>
                  <Choice
                    id="avoozl-switch-from-name"
                    label={kind === 'provider' ? 'Provider' : 'Model'}
                    value={name}
                    onChange={setName}
                    options={fromList}
                    empty={kind === 'provider' ? 'Choose a provider' : 'Choose a model'}
                    placeholder={kind === 'provider' ? 'A provider, for example claude' : 'A model ID'}
                    note="The running chats could not be read, so type a name."
                  />
                  {fromList && !fromList.length && <span className="text-muted">No running chat or health mark names one.</span>}
                </>
              ) : options.tasks.length ? (
                <ul className="flex flex-col gap-1" aria-label="Running tasks">
                  {options.tasks.map((id) => (
                    <li key={id}>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={tasks.includes(id)} onChange={(event) => setTasks(event.target.checked ? [...tasks, id] : tasks.filter((t) => t !== id))} />
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
                <p className="text-muted">{viewFailed ? 'The running chats could not be read.' : 'No task is running.'}</p>
              )}
            </fieldset>
            {field(
              'To',
              'avoozl-switch-to',
              <Choice
                id="avoozl-switch-to"
                label="To"
                value={to}
                onChange={setTo}
                options={toList}
                empty="Choose a model"
                placeholder="A model ID, or auto"
                note="Kiro Crew's model list could not be read, so type a model ID."
              />,
            )}
            <label className="flex items-center gap-1.5">
              <input id="avoozl-switch-also-new" type="checkbox" checked={alsoNew} onChange={(event) => setAlsoNew(event.target.checked)} />
              <span className="font-medium">Also new tasks</span>
            </label>
          </>
        )}
        {step === 'preview' && preview && (
          <>
            {changed && (
              <section role="alert" data-switch-changed className="rounded border p-2" style={{ borderColor: 'var(--warning, var(--border))' }}>
                <p className="font-medium">The set changed since the preview. Check it, then Switch again.</p>
                {changed.added.length > 0 && <p>Now in: {changed.added.join(', ')}</p>}
                {changed.removed.length > 0 && <p>Now out: {changed.removed.join(', ')}</p>}
              </section>
            )}
            <PreviewView preview={preview} />
          </>
        )}
        {step === 'done' && result && (
          <section role="status" data-switch-done className="flex flex-col gap-1">
            <p className="font-medium">
              Queued {plural(result.queued, 'switch', 'switches')}. Each chat moves at its next turn.
            </p>
            <ul className="flex flex-col gap-0.5">
              {result.switches.map((s) => (
                <li key={`${s.taskId}:${s.role}`}>
                  {s.taskId} · {s.role}: {s.from} → {s.to}
                </li>
              ))}
            </ul>
            {alsoNew && <p className="text-muted">New tasks skip the old model until you undo it in Settings › Providers.</p>}
          </section>
        )}
      </div>
    </Modal>
  )
}
