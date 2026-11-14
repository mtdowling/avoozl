// The Switch model button and dialog (design §4.20 Page, R72.12–R72.13), in
// three steps. 1: From a provider, a model or running tasks (dropdowns of
// what is in use), To a model Kiro Crew offers or auto (the shared picker),
// and Also new tasks. 2: a dry run (provider.switch.dryRun) that changes
// nothing: each chat that switches, each that can't and why, the queued
// tasks the new-task rule moves, and the counts. 3: Confirm runs exactly
// that set; if it changed meanwhile, step 2 shows the difference and asks
// again. The backend applies the switch with Kiro Crew's per-chat model
// change; chats keep their session, branch and worktree.
import { useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import { Modal } from './Modal.tsx'
import { IconLabel } from './controls.tsx'
import { Bot } from './icons.ts'
import { Picker } from './Picker.tsx'
import { optionItems } from './picker.ts'
import { modelOptions } from './flow-api.ts'
import { selectStyle } from './FilterSelect.tsx'
import { errorMessage } from './workspace-api.ts'
import {
  canUndo,
  dryRunDiff,
  fromInput,
  fromOptions,
  markText,
  providersClient,
  switchResultText,
  type ProvidersView,
  type SwitchDryRun,
} from './providers-api.ts'

const KINDS = [
  { key: 'provider', label: 'Provider' },
  { key: 'model', label: 'Model' },
  { key: 'tasks', label: 'Tasks' },
] as const
type Kind = (typeof KINDS)[number]['key']
type Step = 'choose' | 'review' | 'done'
const CELL = { padding: '4px 6px', borderTop: '1px solid var(--border)', verticalAlign: 'baseline', textAlign: 'left' } as const
const HEAD = { ...CELL, borderTop: 'none', fontWeight: 500, fontSize: 12, color: 'var(--muted)' } as const

export function SwitchModelButton(props: { workspaceId: string | null; onSwitched?: () => void }) {
  const [open, setOpen] = useState(false)
  if (!props.workspaceId) return null
  return (
    <>
      <IconLabel icon={Bot} tooltip="Move running chats to another model, and optionally new tasks too" onClick={() => setOpen(true)}>
        Switch model
      </IconLabel>
      {open && (
        <SwitchModelDialog
          workspaceId={props.workspaceId}
          onClose={(switched) => {
            setOpen(false)
            if (switched) props.onSwitched?.()
          }}
        />
      )}
    </>
  )
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function SwitchModelDialog(props: { workspaceId: string; onClose: (switched: boolean) => void }) {
  const { workspaceId } = props
  const api = useAppApi()
  const client = useMemo(() => providersClient(api), [api])
  const [view, setView] = useState<ProvidersView | null>(null)
  const [viewFailed, setViewFailed] = useState(false)
  // Null until read; 'failed' when Kiro Crew's list could not be read.
  const [models, setModels] = useState<{ value: string; label: string }[] | 'failed' | null>(null)
  const [step, setStep] = useState<Step>('choose')
  const [kind, setKind] = useState<Kind>('provider')
  const [name, setName] = useState('')
  const [tasks, setTasks] = useState<string[]>([])
  const [to, setTo] = useState('')
  const [alsoNew, setAlsoNew] = useState(false)
  const [dry, setDry] = useState<SwitchDryRun | null>(null)
  const [changed, setChanged] = useState<ReturnType<typeof dryRunDiff> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const reload = () =>
    client.view(workspaceId).then(
      (next) => {
        setView(next)
        setViewFailed(false)
      },
      () => setViewFailed(true),
    )
  useEffect(() => {
    void reload()
    client.models().then(setModels, () => setModels('failed'))
  }, [client, workspaceId])
  const options = fromOptions(view?.chats ?? [], view?.marks ?? [])
  const from = fromInput(kind, name, tasks)
  const toItems = useMemo(() => optionItems(modelOptions(Array.isArray(models) ? models : [], '')), [models])
  const runDryRun = async () => {
    if (!from || !to.trim()) return
    setBusy(true)
    setError(null)
    setChanged(null)
    try {
      setDry(await client.dryRun(workspaceId, { from, to: to.trim(), alsoNewTasks: alsoNew }))
      setStep('review')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const confirm = async () => {
    if (!from || !dry) return
    setBusy(true)
    setError(null)
    try {
      const result = await client.switch(workspaceId, { from, to: dry.to, alsoNewTasks: dry.alsoNewTasks, previewHash: dry.previewHash })
      setDone(switchResultText(result, dry.to))
      setStep('done')
      await reload()
    } catch (caught) {
      const status = (caught as { status?: unknown })?.status
      const message = errorMessage(caught)
      if (status === 409 || /changed since the dry run/.test(message)) {
        // The set moved: run the dry run again and show what changed.
        try {
          const next = await client.dryRun(workspaceId, { from, to: dry.to, alsoNewTasks: dry.alsoNewTasks })
          setChanged(dryRunDiff(dry, next))
          setDry(next)
        } catch (again) {
          setError(errorMessage(again))
        }
      } else setError(message)
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
  const alert = error && (
    <span role="alert" className="text-sm text-danger">
      {error}
    </span>
  )
  const close = () => props.onClose(step === 'done')
  const footer =
    step === 'choose' ? (
      <div className="flex flex-wrap items-center gap-3">
        <Btn type="button" primary disabled={busy || !from || !to.trim()} onClick={() => void runDryRun()} data-switch-dry-run>
          {busy ? 'Checking…' : 'Dry run'}
        </Btn>
        <Btn type="button" onClick={close}>
          Cancel
        </Btn>
        {alert}
      </div>
    ) : step === 'review' ? (
      <div className="flex flex-wrap items-center gap-3">
        <Btn type="button" onClick={() => setStep('choose')} data-switch-back>
          Back
        </Btn>
        <Btn type="button" primary disabled={busy || !dry || (!dry.chats.length && !dry.marks.length)} onClick={() => void confirm()} data-switch-confirm>
          {busy ? 'Switching…' : changed ? 'Confirm again' : 'Confirm'}
        </Btn>
        <Btn type="button" onClick={close}>
          Cancel
        </Btn>
        {alert}
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-3">
        <Btn type="button" primary onClick={close}>
          Close
        </Btn>
      </div>
    )
  const choice = (label: string, values: string[], none: string) =>
    viewFailed ? (
      <>
        <p className="text-xs text-muted">The running chats could not be read, so there is no list. Type a {label.toLowerCase()} name.</p>
        <Input aria-label={label} value={name} onChange={(e: { target: { value: string } }) => setName(e.target.value)} style={{ maxWidth: '24rem' }} />
      </>
    ) : !view ? (
      <p className="text-muted">Reading…</p>
    ) : values.length ? (
      <select aria-label={label} value={name} onChange={(e) => setName(e.target.value)} className="rounded border px-2 py-1" style={{ ...selectStyle, maxWidth: '24rem' }} data-switch-from>
        <option value="">Choose a {label.toLowerCase()}</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    ) : (
      <p className="text-muted">{none}</p>
    )
  return (
    <Modal
      id="avoozl-switch-model"
      title="Switch model"
      backLabel="Close Switch model"
      unsaved={step !== 'done' && (to !== '' || from !== null) && { title: 'Stop switching?', body: 'No chat is moved. What you picked is lost.', action: 'Stop' }}
      onDismiss={close}
      footer={footer}
    >
      <div className="flex flex-col gap-4 text-sm" data-switch-model data-switch-step={step}>
        {step === 'choose' && (
          <>
            <div className="flex flex-col gap-1 text-muted" data-switch-intro>
              <p>Running chats change model at their next turn. Each keeps its branch and worktree.</p>
              <p>The reply a chat is writing now finishes first, so nothing is lost.</p>
              <p>Nothing changes until you check the dry run and press Confirm.</p>
            </div>
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
              {kind === 'provider' ? (
                choice('Provider', options.providers, 'No running chat or health mark names a provider.')
              ) : kind === 'model' ? (
                choice('Model', options.models, 'No running chat or health mark names a model.')
              ) : !view ? (
                <p className="text-muted">{viewFailed ? 'The running chats could not be read.' : 'Reading…'}</p>
              ) : options.tasks.length ? (
                <ul className="flex flex-col gap-1" aria-label="Running tasks">
                  {options.tasks.map((id) => (
                    <li key={id}>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={tasks.includes(id)} onChange={(event) => setTasks(event.target.checked ? [...tasks, id] : tasks.filter((t) => t !== id))} />
                        {id}
                        <span className="text-xs text-muted">
                          {view.chats
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
            {models === 'failed' ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="avoozl-switch-to" className="font-medium">
                  To
                </label>
                <p className="text-xs text-muted">Kiro Crew's model list could not be read, so there is no list. Type a model ID, or auto.</p>
                <Input id="avoozl-switch-to" value={to} onChange={(e: { target: { value: string } }) => setTo(e.target.value)} style={{ maxWidth: '24rem' }} />
              </div>
            ) : models === null ? (
              <p className="text-muted">Reading Kiro Crew's models…</p>
            ) : (
              <Picker id="avoozl-switch-to" label={<span className="font-medium">To</span>} items={toItems} value={to} onPick={setTo} placeholder="Type to find a model, or auto" maxWidth="24rem" />
            )}
            <label className="flex items-start gap-1.5">
              <input type="checkbox" className="mt-1" checked={alsoNew} onChange={(event) => setAlsoNew(event.target.checked)} data-switch-also-new />
              <span>
                <span className="font-medium">Also new tasks</span>
                <span className="block text-muted">
                  Routing skips the From provider or model for new tasks and uses To instead. It stays that way until you undo it under Health, here or in Settings › Providers.
                </span>
              </span>
            </label>
          </>
        )}
        {step === 'review' && dry && <DryRunView dry={dry} changed={changed} />}
        {step === 'done' && (
          <p role="status" data-switch-done>
            {done}
          </p>
        )}
      </div>
    </Modal>
  )
}

// Step 2: what Confirm would do, in tables. Nothing has changed yet.
function DryRunView({ dry, changed }: { dry: SwitchDryRun; changed: ReturnType<typeof dryRunDiff> | null }) {
  const { counts } = dry
  return (
    <section aria-label="Dry run" data-switch-preview className="flex flex-col gap-3">
      <p className="text-muted">Dry run: nothing has changed yet. Confirm switches exactly this set.</p>
      {changed && (
        <div role="alert" className="rounded border p-2" style={{ borderColor: 'var(--warning, var(--border))' }} data-switch-changed>
          <p className="font-medium">The running chats changed since the dry run. Check the new set, then confirm again.</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {changed.added.map((c) => (
              <li key={`+${c.slot}`}>
                Added: {c.title} ({c.taskId}) · {c.role} on {c.model ?? 'auto'}
              </li>
            ))}
            {changed.removed.map((c) => (
              <li key={`-${c.slot}`}>
                Gone: {c.title} ({c.taskId}) · {c.role} on {c.model ?? 'auto'}
              </li>
            ))}
            {changed.marks && <li>The new-task rule changed.</li>}
          </ul>
        </div>
      )}
      <p className="font-medium" data-switch-counts>
        {plural(counts.switch, 'chat')} switch · {counts.cannot} can't · {counts.queued === null ? 'queued tasks unknown' : plural(counts.queued, 'queued task')} affected
      </p>
      {dry.chats.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">Chats that switch</caption>
            <thead>
              <tr>
                <th style={HEAD}>Task</th>
                <th style={HEAD}>Spec</th>
                <th style={HEAD}>Now</th>
                <th style={HEAD}>New</th>
                <th style={HEAD}>Runs on</th>
              </tr>
            </thead>
            <tbody>
              {dry.chats.map((c) => (
                <tr key={c.slot}>
                  <td style={CELL}>
                    {c.title} <span className="text-xs text-muted">{c.taskId} · {c.role}</span>
                  </td>
                  <td style={CELL}>{c.spec ?? '—'}</td>
                  <td style={CELL}>{c.model ?? 'auto'}</td>
                  <td style={CELL}>{c.to}</td>
                  <td style={CELL}>{c.where === 'local' ? 'this machine' : c.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No running chat switches.</p>
      )}
      {dry.skipped.length > 0 && (
        <section aria-label="Can't switch">
          <h4 className="font-medium">Can't switch</h4>
          <ul className="mt-1 flex flex-col gap-0.5">
            {dry.skipped.map((c) => (
              <li key={c.slot ?? c.taskId}>
                {c.title} <span className="text-xs text-muted">{c.taskId}{c.role ? ` · ${c.role}` : ''}</span>: {c.why}
              </li>
            ))}
          </ul>
        </section>
      )}
      {dry.alsoNewTasks && (
        <section aria-label="New tasks">
          <h4 className="font-medium">New tasks</h4>
          {dry.marks.length ? (
            <p>
              Routing skips {dry.marks.map((m) => `${m.scope} ${m.name}`).join(', ')} and uses {dry.to}, until you undo it.
            </p>
          ) : (
            <p className="text-muted">No provider or model to mark: To is already the same.</p>
          )}
          {dry.queued === null ? (
            <p className="text-muted">The queued tasks could not be read.</p>
          ) : dry.queued.length ? (
            <ul className="mt-1 flex flex-col gap-0.5" aria-label="Queued tasks affected">
              {dry.queued.map((q) => (
                <li key={q.taskId}>
                  {q.title} <span className="text-xs text-muted">{q.taskId}{q.spec ? ` · ${q.spec}` : ''}</span>: {q.model} → {dry.to}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No queued task would have used it.</p>
          )}
        </section>
      )}
    </section>
  )
}
