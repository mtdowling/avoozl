// Send to Issue Radar (design §8.5, R52), stepped like Set up GitHub: pick a
// crew, check the label and issues, then the result. Nothing is written
// before the last step's button. Cancel, Esc and a click outside close it
// on every step before then.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { Check, CircleAlert, Radar, X } from './icons.ts'
import { ICON } from './controls.tsx'
import { crewLine, radarClient, type CrewList, type HandOffInput, type HandOffReply, type UntriagedItem } from './untriaged-api.ts'
import { errorMessage } from './workspace-api.ts'
import { useBackStep } from './NavHistory.tsx'

type Client = ReturnType<typeof radarClient>

const STEPS = [
  ['Pick a crew', 'A crew works the open issues that carry a label it watches. Avoozl adds that label.'],
  ['Check the label', 'Avoozl adds this one label to each issue, with your GitHub login. Nothing is written until you press Add label.'],
  ['Sent', 'A crew picks an issue on its own next turn. Follow it under With Issue Radar.'],
] as const

const WARN = { color: 'var(--danger)' }

export function SendToRadar(props: {
  workspaceId: string
  client: Client
  items: UntriagedItem[]
  repository: string
  onClose: (note?: string) => void
  onSent: () => void
}) {
  const { workspaceId, client, items, repository } = props
  const [step, setStep] = useState(0)
  const [crews, setCrews] = useState<CrewList | null>(null)
  const [crewId, setCrewId] = useState<string>('')
  const [typed, setTyped] = useState('')
  const [preview, setPreview] = useState<HandOffReply | null>(null)
  const [result, setResult] = useState<HandOffReply | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const cancel = useCallback(() => props.onClose(step === 2 ? undefined : 'Cancelled. Nothing was written.'), [props, step])
  useEffect(() => {
    let live = true
    client
      .crews(workspaceId, repository)
      .then((list) => {
        if (!live) return
        setCrews(list)
        if (list.crews.length) setCrewId(list.crews[0].id)
      })
      .catch((caught) => live && setError(errorMessage(caught)))
    return () => {
      live = false
    }
  }, [client, workspaceId, repository])
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, button')?.focus()
  }, [step, crews])
  // Esc and Back do what Cancel does.
  useBackStep('modal', true, 'Cancel', cancel)
  const crew = crews?.crews.find((entry) => entry.id === crewId) ?? null
  const input = (): HandOffInput => ({
    // Only GitHub issues reach this dialog (sendable), so each has a number.
    items: items.flatMap((item) => (item.number === null ? [] : [{ repository: item.repository, number: item.number }])),
    ...(crews?.available ? { crew: { id: crewId } } : { label: typed.trim() }),
  })
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
      setPreview(await client.preview(workspaceId, input()))
      setStep(1)
    })
  const send = () =>
    call(async () => {
      setResult(await client.send(workspaceId, input()))
      setStep(2)
      props.onSent()
    })
  const canReview = crews ? (crews.available ? Boolean(crew) : Boolean(typed.trim())) : false
  return (
    <div className="fixed inset-0" style={{ zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div aria-hidden="true" className="absolute inset-0" onClick={step === 2 ? () => props.onClose() : cancel} style={{ background: 'color-mix(in srgb, var(--text) 30%, transparent)' }} />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avoozl-radar-title"
        aria-describedby="avoozl-radar-line"
        data-radar-dialog={step}
        className="relative flex flex-col gap-3 rounded-lg border p-4 shadow-lg"
        style={{ width: 'min(36rem, 94vw)', maxHeight: '88vh', overflow: 'auto', background: 'var(--card, var(--bg))', color: 'var(--text)', borderColor: 'var(--border)' }}
      >
        <ol className="flex flex-wrap gap-2 text-xs" aria-label="Steps">
          {STEPS.map(([title], i) => (
            <li key={title} aria-current={i === step ? 'step' : undefined} className={i === step ? 'font-semibold' : 'text-muted'}>
              {i + 1}. {title}
            </li>
          ))}
        </ol>
        <div>
          <h3 id="avoozl-radar-title" className="flex items-center gap-1.5 text-base font-semibold">
            <Radar size={ICON} aria-hidden="true" />
            {STEPS[step][0]}
          </h3>
          <p id="avoozl-radar-line" className="text-sm text-muted">
            {STEPS[step][1]}
          </p>
        </div>

        {step === 0 && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-xs text-muted">
              {items.length === 1 ? `#${items[0].number} ${items[0].title}` : `${items.length} issues`} in {repository}
            </p>
            {!crews ? (
              <p className="text-muted">{error ? '' : 'Reading the crews from Issue Radar…'}</p>
            ) : crews.available ? (
              crews.crews.length === 0 ? (
                <p data-radar-no-crews>
                  {repository} has no crew in Issue Radar.{' '}
                  <a href="/issue-radar" target="_top" className="underline">
                    Add one in Issue Radar
                  </a>
                  , then come back.
                </p>
              ) : (
                <fieldset className="flex flex-col gap-1.5" data-radar-crews>
                  <legend className="sr-only">Crew</legend>
                  {crews.crews.map((entry) => (
                    <label
                      key={entry.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md border p-2"
                      style={{ borderColor: entry.id === crewId ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <input type="radio" name="avoozl-radar-crew" checked={entry.id === crewId} onChange={() => setCrewId(entry.id)} style={{ marginTop: 3 }} />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{entry.name}</span>
                          {entry.status && <Badge>{entry.status}</Badge>}
                          {entry.labels.map((label) => (
                            <Badge key={label} variant="info">
                              {label}
                            </Badge>
                          ))}
                        </span>
                        <span className="text-xs text-muted">{crewLine(entry)}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )
            ) : (
              <div className="flex flex-col gap-1.5" data-radar-typed>
                <p className="text-xs text-muted">{crews.reason}</p>
                <label className="flex flex-col gap-1">
                  <span>
                    Label the crew watches <span className="text-xs text-muted">(required)</span>
                  </span>
                  <Input value={typed} placeholder="radar" onChange={(e: { target: { value: string } }) => setTyped(e.target.value)} />
                  <span className="text-xs text-muted">Find it in Issue Radar under the crew’s Labels. A crew with no labels takes every open issue, so it needs none.</span>
                </label>
              </div>
            )}
            {crew?.emptyScope && (
              <p role="alert" className="flex items-start gap-1.5 text-sm" style={WARN} data-radar-empty-scope>
                <CircleAlert size={ICON} aria-hidden="true" style={{ marginTop: 3, flex: 'none' }} />
                {crew.name} has an empty scope, so it takes every open issue in {repository}, labeled or not. Avoozl writes no label; these move to With Issue Radar.
              </p>
            )}
          </div>
        )}

        {step === 1 && preview && (
          <div className="flex flex-col gap-2 text-sm" data-radar-confirm>
            {preview.label ? (
              <p>
                Add label <code data-radar-label>{preview.label}</code> to {preview.items.length === 1 ? 'this issue' : `these ${preview.items.length} issues`}
                {preview.crew ? ` for ${preview.crew.name}` : ''}:
              </p>
            ) : (
              <p>No label is written. These issues move to With Issue Radar:</p>
            )}
            <ul className="flex flex-col gap-0.5" data-radar-items>
              {preview.items.map((item) => (
                <li key={item.number}>
                  <span className="text-muted tabular-nums">#{item.number}</span> {item.title}
                </li>
              ))}
            </ul>
            {preview.warnings.map((warning) => (
              <p key={warning} role="alert" style={WARN}>
                {warning}
              </p>
            ))}
            <p className="text-xs text-muted">To undo, remove the label on GitHub before a crew claims the issue.</p>
          </div>
        )}

        {step === 2 && result && (
          <ul className="flex flex-col gap-1 text-sm" data-radar-results>
            {(result.results ?? []).map((row) => (
              <li key={row.number} className="flex items-start gap-1.5">
                {row.ok ? <Check size={ICON} aria-hidden="true" style={{ color: 'var(--ok)', marginTop: 3 }} /> : <X size={ICON} aria-hidden="true" style={{ color: 'var(--danger)', marginTop: 3 }} />}
                <span>
                  #{row.number} {row.ok ? (result.label ? `labeled ${result.label}` : 'recorded') : `not sent: ${row.error}`}
                </span>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {step < 2 && (
            <Btn type="button" onClick={cancel}>
              Cancel
            </Btn>
          )}
          {step === 1 && (
            <Btn type="button" onClick={() => setStep(0)} disabled={busy}>
              Back
            </Btn>
          )}
          {step === 0 && (
            <Btn type="button" data-radar-review onClick={() => void review()} disabled={busy || !canReview}>
              {busy ? 'Checking…' : 'Review'}
            </Btn>
          )}
          {step === 1 && (
            <Btn type="button" data-radar-send onClick={() => void send()} disabled={busy}>
              {busy ? 'Sending…' : preview?.label ? 'Add label' : 'Send'}
            </Btn>
          )}
          {step === 2 && (
            <Btn type="button" onClick={() => props.onClose()}>
              Close
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}
