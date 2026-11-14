// Settings > Delivery (R53.3, R54.8): the writer's default agent and model,
// and pull request feedback. Saves write `delivery` in .avoozl.json through
// delivery.settings.update with the file's hash. Per-task agent and model
// are the routing prompt's job, so this page links to Routing instead.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import { Marker, Section } from './SettingsView.tsx'
import { AskForHelp, useConfirm } from './controls.tsx'
import { modelOptions, parseModels } from './flow-api.ts'
import { useRead } from './useRead.ts'
import { COMMAND_PATH, errorMessage } from './workspace-api.ts'
import { DELIVERY_DEFAULTS, SHIP_CHOICES, toDeliveryForm, toDeliverySection, type DeliveryForm, type DeliverySettings as Settings, type ShipMode } from './delivery-api.ts'
import { RadioFold } from './RadioFold.tsx'

const OPTIONAL = { required: false } as const
const OFF_BLURB = 'The tick starts no ready task until delivery is on. Its agent, model and pull request settings show here then.'
const selectStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }

function Raw({ name }: { name: string }) {
  return (
    <code className="text-[11px] text-muted" style={{ overflowWrap: 'anywhere', opacity: 0.8 }}>
      {name}
    </code>
  )
}

function Labeled(props: { id: string; label: string; raw: string; width: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm" style={{ maxWidth: props.width, width: '100%' }}>
      <label htmlFor={props.id} className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{props.label}</span>
        <Marker rule={OPTIONAL} />
      </label>
      {props.children}
      {props.note && <span className="text-xs text-muted">{props.note}</span>}
      <Raw name={props.raw} />
    </div>
  )
}

export default function DeliverySettings({ workspaceId, onOpenRouting }: { workspaceId: string; onOpenRouting?: () => void }) {
  const api = useAppApi()
  const run = useMemo(
    () =>
      <T,>(operation: string, input: Record<string, unknown> = {}) =>
        api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result),
    [api, workspaceId],
  )
  const load = useCallback(() => run<Settings>('delivery.settings.get'), [run])
  const { value, error, reload } = useRead<Settings>(workspaceId, load)
  const [form, setForm] = useState<DeliveryForm>(toDeliveryForm())
  const [models, setModels] = useState<{ value: string; label: string }[]>([])
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  const [turning, setTurning] = useState(false)
  const confirm = useConfirm()
  useEffect(() => {
    let live = true
    api.get<unknown>('/api/models').then(
      (body) => live && setModels(parseModels(body)),
      () => live && setModels([]),
    )
    return () => {
      live = false
    }
  }, [api])
  useEffect(() => {
    if (value) setForm(toDeliveryForm(value.delivery))
  }, [value])
  const set = (change: Partial<DeliveryForm>) => setForm({ ...form, ...change })
  const save = async () => {
    if (!value) return
    const built = toDeliverySection(form)
    if (built.error) return setMessage({ error: built.error })
    setMessage(null)
    try {
      await run('delivery.settings.update', { delivery: built.delivery, expectedHash: value.hash })
      await reload()
      setMessage({ ok: 'Saved.' })
    } catch (caught) {
      setMessage({ error: errorMessage(caught) })
    }
  }
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  if (!value) return <p className="text-sm text-muted">Loading…</p>
  // Turn on delivery: the normal save, with an empty delivery section (every
  // key at its default) written first.
  const turnOn = async () => {
    const yes = await confirm({
      title: 'Turn on delivery?',
      body: 'The tick starts ready tasks in Kiro Crew chats, about once a minute, with the default agent and model. Stop the line or Defer pauses them.',
      action: 'Turn on delivery',
    })
    if (!yes) return
    setTurning(true)
    setMessage(null)
    try {
      await run('delivery.settings.update', { delivery: {}, expectedHash: value.hash, turnOn: true })
      await reload()
    } catch (caught) {
      setMessage({ error: errorMessage(caught) })
    } finally {
      setTurning(false)
    }
  }
  if (!value.on)
    return (
      <Card>
        <Section title="Delivery is off" blurb={OFF_BLURB}>
          <div className="flex flex-wrap items-center gap-3" data-delivery-off>
            <Btn type="button" primary disabled={turning} onClick={() => void turnOn()} data-turn-on-delivery>
              {turning ? 'Turning on…' : 'Turn on delivery'}
            </Btn>
            <AskForHelp
              workspaceId={workspaceId}
              help={{
                page: 'Settings › Delivery',
                section: 'Delivery is off',
                says: `${OFF_BLURB} A Turn on delivery button writes a default delivery section.`,
                settings: [
                  { key: 'delivery', value: 'not set (delivery is off)' },
                  { key: 'saved in', value: '.avoozl.json, through this page' },
                ],
                docs: 'README.md, sections Deliver locally and Deliver through GitHub',
              }}
            />
            {message?.error && (
              <span role="alert" className="text-sm text-danger">
                {message.error}
              </span>
            )}
          </div>
        </Section>
      </Card>
    )
  const feedback = form.prFeedback ? form.prFeedback === 'on' : DELIVERY_DEFAULTS.prFeedback
  return (
    <div className="flex flex-col gap-3" data-delivery-settings>
      <Card className="flex flex-col gap-4">
        <Section title="Writer" blurb="The agent and model worker chats open on, unless the routing prompt or the task picks another.">
          <div className="flex flex-wrap gap-4">
            <Labeled id="avoozl-delivery-agent" label="Agent" raw="delivery.agent" width="16rem">
              <Input id="avoozl-delivery-agent" value={form.agent} placeholder={DELIVERY_DEFAULTS.agent} onChange={(e) => set({ agent: e.target.value })} />
            </Labeled>
            <Labeled id="avoozl-delivery-model" label="Model" raw="delivery.model" width="18rem" note="Review roles that must differ from the writer need a named model.">
              <select id="avoozl-delivery-model" value={form.model || 'auto'} onChange={(e) => set({ model: e.target.value === 'auto' ? '' : e.target.value })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
                {modelOptions(models, form.model).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Labeled>
          </div>
          <p className="text-xs text-muted">
            Spreading tasks across crews and models is the routing prompt's job; a task's manifest can pin one.{' '}
            {onOpenRouting ? (
              <button type="button" className="underline" onClick={onOpenRouting}>
                Open Routing
              </button>
            ) : (
              'Set it on the Routing tab.'
            )}
          </p>
        </Section>
        <Section title="Who merges" blurb="Who lands a finished pull request. A repository, spec or task may set its own in .avoozl.json or the manifest; Avoozl never merges one itself.">
          <RadioFold<ShipMode>
            name="avoozl-delivery-ship"
            label="Who merges"
            value={form.ship ?? DELIVERY_DEFAULTS.ship}
            onChange={(ship) => set({ ship })}
            sections={SHIP_CHOICES.map((choice) => ({
              key: choice.key,
              title: choice.title,
              line: choice.line,
              description: (
                <table className="text-sm">
                  <tbody>
                    {['Writer', 'Avoozl', 'You'].map((who, i) => (
                      <tr key={who}>
                        <th scope="row" className="pr-3 text-left font-medium">
                          {who}
                        </th>
                        <td>{choice.who[i]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ),
            }))}
          />
          {form.ship === 'manual' && <p className="text-xs text-muted">Briefs tell writers not to turn on auto-merge.</p>}
          <Raw name="delivery.ship" />
        </Section>
        <Section title="Investigate first" blurb="Before coding, the writer reports what it found and how sure it is; a second chat tries to prove it wrong. Coding starts only when both are sure enough and the findings stand.">
          <div className="flex flex-wrap gap-4">
            <Labeled id="avoozl-delivery-investigate" label="Which tasks" raw="delivery.investigate.mode" width="16rem" note="A task's manifest can set investigate: true or false.">
              <select id="avoozl-delivery-investigate" value={form.investigateMode ?? DELIVERY_DEFAULTS.investigateMode} onChange={(e) => set({ investigateMode: e.target.value as DeliveryForm['investigateMode'] })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
                <option value="not-small">All but small tasks</option>
                <option value="all">All tasks</option>
                <option value="off">Off</option>
              </select>
            </Labeled>
            <Labeled id="avoozl-delivery-confidence" label="Sure enough at" raw="delivery.investigate.minConfidence" width="16rem" note="Less sure waits in Needs you.">
              <select id="avoozl-delivery-confidence" value={form.minConfidence ?? DELIVERY_DEFAULTS.minConfidence} onChange={(e) => set({ minConfidence: e.target.value as DeliveryForm['minConfidence'] })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>
            </Labeled>
          </div>
        </Section>
        <Section title="Pull request feedback" blurb="Send failed checks and allowed reviewers' comments back to the chat that wrote the pull request. Matters only in a GitHub mode.">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <input type="checkbox" checked={feedback} onChange={(e) => set({ prFeedback: e.target.checked ? 'on' : 'off' })} />
            <span className="font-medium">Send pull request feedback to the writer</span>
            <Marker rule={OPTIONAL} />
          </label>
          <Raw name="delivery.prFeedback" />
          <Labeled id="avoozl-delivery-rounds" label="Most feedback rounds per task" raw="delivery.feedbackRounds" width="16rem" note="Then Avoozl stops and asks you.">
            <Input id="avoozl-delivery-rounds" inputMode="numeric" value={form.feedbackRounds} placeholder={String(DELIVERY_DEFAULTS.feedbackRounds)} onChange={(e) => set({ feedbackRounds: e.target.value })} />
          </Labeled>
        </Section>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Btn type="button" primary onClick={() => void save()}>
          Save
        </Btn>
        {message?.error && (
          <span role="alert" className="text-sm text-danger">
            {message.error}
          </span>
        )}
        {message?.ok && <span className="text-sm text-muted">{message.ok}</span>}
        <span className="text-xs text-muted">Writes delivery in .avoozl.json.</span>
      </div>
    </div>
  )
}
