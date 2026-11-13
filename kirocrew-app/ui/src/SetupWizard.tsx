// Set up GitHub (design §8.2), GitHub modes only. On load it runs the
// wizard's read-only preview. The button shows only when the preview finds
// at least one change; else one "GitHub is set up" line with the time of the
// check and a quiet Check again. A preview that can't run says why and how
// to fix it. The dialog is stepped like Add plugin: options, review the
// changes grouped with create/change/keep badges, apply, then save the
// .avoozl.json change. Cancel, Esc and a click outside close it on every
// step; before Apply nothing is written, and during Apply the backend stops
// before its next write (github.setup.cancel) and reports what was done.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import { Tooltip } from './Tooltip.tsx'
import { IconBtn, IconLabel, ICON } from './controls.tsx'
import { CircleCheck, RefreshCw, Workflow, X } from './icons.ts'
import { groupWrites, setupForm, setupInput, setupState, writeBadge, type GitHubSettings, type SetupForm, type SetupResult, settingsClient } from './settings-api.ts'
import { errorMessage } from './workspace-api.ts'
import { relativeTime } from './task-api.ts'

type Client = ReturnType<typeof settingsClient>

// The values the Where tasks live tab's own fields hold; the wizard never asks again.
export type SharedSetup = Pick<SetupForm, 'mode' | 'planningRepository' | 'repositories' | 'projectOwner' | 'projectNumber'>

const BADGE_STYLE: Record<string, CSSProperties> = {
  create: { color: 'var(--ok)', borderColor: 'var(--ok)' },
  change: { color: 'var(--accent)', borderColor: 'var(--accent)' },
  keep: { color: 'var(--muted)', borderColor: 'var(--border)' },
}

const STEP_TEXT = [
  ['What to set up', 'Avoozl reads GitHub first. Pick the extras; the mode, repositories and Project come from this tab.'],
  ['Check each change', 'Every write Avoozl would make on GitHub. It never deletes or renames anything.'],
  ['Making the changes', 'Avoozl makes them one at a time. Cancel stops before the next one.'],
  ['Save the settings file', 'Write the names GitHub gave back into .avoozl.json. Nothing is saved until you press Save.'],
] as const

function SetupDialog(props: {
  workspaceId: string
  client: Client
  form: SetupForm
  set: (change: Partial<SetupForm>) => void
  first: SetupResult | null
  onClose: (note?: string) => void
  onSaved: () => Promise<unknown>
}) {
  const { workspaceId, client, form } = props
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<SetupResult | null>(props.first)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const applying = useRef<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const cancel = useCallback(() => {
    if (applying.current) {
      void client.cancelSetup(workspaceId, applying.current)
      props.onClose('Cancelled. Avoozl stops before its next write; check again to see what was made.')
    } else props.onClose(step === 3 ? undefined : 'Cancelled. Nothing was written.')
  }, [client, workspaceId, props, step])
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cancel])
  const call = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const review = () =>
    call(async () => {
      setResult(await client.setup(workspaceId, setupInput(form)))
      setStep(1)
    })
  const apply = () =>
    call(async () => {
      if (!result) return
      setStep(2)
      applying.current = result.previewHash
      try {
        setResult(await client.setup(workspaceId, { ...setupInput(form), confirm: true, previewHash: result.previewHash }))
      } finally {
        applying.current = null
      }
      setStep(3)
    })
  const save = () =>
    call(async () => {
      if (!result) return
      await client.save(workspaceId, result.settings.github, result.settings.expectedHash)
      await props.onSaved()
      props.onClose('Saved to .avoozl.json.')
    })
  const groups = groupWrites(result?.writes ?? [])
  const count = result?.writes.length ?? 0
  const failed = (result?.results ?? []).filter((r) => r.status !== 'done')
  return (
    <div className="fixed inset-0" style={{ zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div aria-hidden="true" className="absolute inset-0" onClick={cancel} style={{ background: 'color-mix(in srgb, var(--text) 30%, transparent)' }} />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avoozl-setup-title"
        aria-describedby="avoozl-setup-line"
        data-setup-dialog={step}
        className="relative flex flex-col gap-3 rounded-lg border p-4 shadow-lg"
        style={{ width: 'min(40rem, 94vw)', maxHeight: '88vh', overflow: 'auto', background: 'var(--card, var(--bg))', color: 'var(--text)', borderColor: 'var(--border)' }}
      >
        <ol className="flex flex-wrap gap-2 text-xs" aria-label="Steps">
          {STEP_TEXT.map(([title], i) => (
            <li key={title} aria-current={i === step ? 'step' : undefined} className={i === step ? 'font-semibold' : 'text-muted'}>
              {i + 1}. {title}
            </li>
          ))}
        </ol>
        <div>
          <h3 id="avoozl-setup-title" className="text-base font-semibold">
            {STEP_TEXT[step][0]}
          </h3>
          <p id="avoozl-setup-line" className="text-sm text-muted">
            {STEP_TEXT[step][1]}
          </p>
        </div>
        {step === 0 && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-xs text-muted" data-setup-shared>
              Mode {form.mode}
              {form.mode === 'plans-repo' ? `, planning repository ${form.planningRepository || 'not set'}` : ''}, repositories {form.repositories || 'none yet'}, Project{' '}
              {form.projectOwner ? `${form.projectOwner}/${form.projectNumber || 'new'}` : 'not set'}.
            </p>
            {!/^\d+$/.test(form.projectNumber.trim()) && (
              <label className="flex flex-col gap-1">
                New Project title <span className="text-xs text-muted">(optional)</span>
                <Input id="avoozl-setup-title-field" value={form.projectTitle} placeholder="Avoozl" onChange={(e: { target: { value: string } }) => props.set({ projectTitle: e.target.value })} />
              </label>
            )}
            <label className="flex flex-col gap-1">
              Releases, if no spec names one <span className="text-xs text-muted">(optional)</span>
              <Input id="avoozl-setup-releases" value={form.releases} placeholder="v1, v2" onChange={(e: { target: { value: string } }) => props.set({ releases: e.target.value })} />
            </label>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ['iteration', 'Iteration field'],
                  ['tableByWave', 'Table by wave view'],
                  ['epic', 'Epic issue type'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={form[key]} onChange={(e) => props.set({ [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}
        {step === 1 && result && (
          <div className="flex flex-col gap-3 text-sm">
            {groups.length === 0 && <p>Nothing to change on GitHub.</p>}
            {groups.map((group) => (
              <section key={group.key} data-setup-group={group.key}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{group.title}</h4>
                <ul className="mt-1 flex flex-col gap-1">
                  {group.writes.map((write, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-2">
                      <span className="rounded-full border px-1.5 text-[10px] font-semibold" style={BADGE_STYLE[writeBadge(write)]}>
                        {writeBadge(write)}
                      </span>
                      <span>
                        {write.object} <code>{write.name}</code>
                        {write.visibility ? ` (${write.visibility})` : ''} in {write.owner}
                      </span>
                      <span className="w-full pl-12 text-xs text-muted">{write.detail}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {result.checklist.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Left for you on GitHub</h4>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {result.checklist.map((item) => (
                    <li key={item.id}>
                      {item.link ? (
                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="underline">
                          {item.text}
                        </a>
                      ) : (
                        item.text
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
        {step === 2 && <p className="text-sm" role="status">Making {count} changes on GitHub…</p>}
        {step === 3 && result && (
          <div className="flex flex-col gap-2 text-sm">
            <p role="status">
              Made {(result.results ?? []).filter((r) => r.status === 'done').length} of {count} changes.
            </p>
            {failed.length > 0 && (
              <ul role="alert" className="text-xs text-danger">
                {failed.map((entry, i) => (
                  <li key={i}>
                    {entry.status}: {entry.action} {entry.name}
                    {entry.reason ? ` (${entry.reason})` : ''}
                  </li>
                ))}
              </ul>
            )}
            {result.settings.changed ? (
              <>
                {result.settings.error && <p role="alert" className="text-danger">{result.settings.error}</p>}
                <pre className="overflow-auto rounded border p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
                  {result.settings.diff}
                </pre>
              </>
            ) : (
              <p className="text-muted">.avoozl.json already matches.</p>
            )}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Btn type="button" onClick={cancel}>
            {step === 3 ? 'Close' : 'Cancel'}
          </Btn>
          {step === 1 && (
            <Btn type="button" onClick={() => setStep(0)} disabled={busy}>
              Back
            </Btn>
          )}
          {step === 0 && (
            <Btn type="button" primary onClick={() => void review()} disabled={busy}>
              Check the changes
            </Btn>
          )}
          {step === 1 && count > 0 && (
            <Btn type="button" primary onClick={() => void apply()} disabled={busy}>
              Apply {count} change{count === 1 ? '' : 's'}
            </Btn>
          )}
          {step === 1 && count === 0 && result?.settings.changed && (
            <Btn type="button" primary onClick={() => setStep(3)}>
              Next
            </Btn>
          )}
          {step === 3 && result?.settings.changed && (
            <Btn type="button" primary onClick={() => void save()} disabled={busy || Boolean(result.settings.error)}>
              Save to .avoozl.json
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SetupWizard(props: {
  workspaceId: string
  client: Client
  settings: GitHubSettings
  shared: SharedSetup
  onSaved: () => Promise<unknown>
}) {
  const { workspaceId, client, settings, shared } = props
  const [own, setForm] = useState<SetupForm>(() => setupForm(settings.github))
  const form: SetupForm = { ...own, ...shared, mode: shared.mode || own.mode }
  const [result, setResult] = useState<SetupResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [at, setAt] = useState(() => new Date().toISOString())
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const key = JSON.stringify(setupInput(form))
  const check = useCallback(async () => {
    setResult(null)
    setError(null)
    try {
      setResult(await client.setup(workspaceId, JSON.parse(key)))
    } catch (caught) {
      setError(errorMessage(caught))
    }
    setAt(new Date().toISOString())
  }, [client, workspaceId, key])
  useEffect(() => setForm(setupForm(settings.github)), [settings])
  useEffect(() => {
    void check()
  }, [check])
  const state = setupState(result, error, at)
  return (
    <div className="flex flex-col gap-2" data-setup-state={state.kind}>
      {state.kind === 'checking' && <p className="text-sm text-muted">Checking GitHub…</p>}
      {state.kind === 'set-up' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CircleCheck size={ICON + 2} aria-hidden="true" style={{ color: 'var(--ok)' }} />
          <span>GitHub is set up.</span>
          <Tooltip text={new Date(state.at).toLocaleString()}>
            <span className="text-xs text-muted">Checked {relativeTime(state.at, Date.now())}</span>
          </Tooltip>
          <IconBtn icon={RefreshCw} label="Check again" tooltip="Read GitHub again. Writes nothing." onClick={() => void check()} />
        </div>
      )}
      {state.kind === 'changes' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Setup found {state.count} thing{state.count === 1 ? '' : 's'} to create or change.
          </span>
          <IconLabel icon={Workflow} primary onClick={() => setOpen(true)} tooltip="Show each change first. Nothing is written until you apply.">
            Set up GitHub
          </IconLabel>
          <IconBtn icon={RefreshCw} label="Check again" tooltip="Read GitHub again. Writes nothing." onClick={() => void check()} />
        </div>
      )}
      {state.kind === 'error' && (
        <div className="flex flex-col gap-1 text-sm" role="alert">
          <span className="inline-flex items-center gap-1.5">
            <X size={ICON} aria-hidden="true" style={{ color: 'var(--danger)' }} />
            Avoozl can't check GitHub: {state.reason}
          </span>
          {state.fix && (
            <span className="text-xs">
              Fix: <code>{state.fix}</code>
            </span>
          )}
          <span>
            <IconBtn icon={RefreshCw} label="Check again" tooltip="Read GitHub again. Writes nothing." onClick={() => void check()} />
          </span>
        </div>
      )}
      {note && <p className="text-xs text-muted" role="status">{note}</p>}
      {open && (
        <SetupDialog
          workspaceId={workspaceId}
          client={client}
          form={form}
          set={(change) => setForm({ ...own, ...change })}
          first={result}
          onSaved={props.onSaved}
          onClose={(text) => {
            setOpen(false)
            setNote(text ?? null)
            void check()
          }}
        />
      )}
    </div>
  )
}
