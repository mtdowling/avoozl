// Settings > Delivery (R53.3, R54.8): the writer's default agent and model,
// and pull request feedback. Saves write `delivery` in .avoozl.json through
// delivery.settings.update with the file's hash. Per-task agent and model
// are routing rules, so this page links to Routing instead of repeating them.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import { Marker, Section } from './SettingsView.tsx'
import { modelOptions, parseModels } from './flow-api.ts'
import { useRead } from './useRead.ts'
import { COMMAND_PATH, errorMessage } from './workspace-api.ts'
import { DELIVERY_DEFAULTS, toDeliveryForm, toDeliverySection, type DeliveryForm, type DeliverySettings as Settings } from './delivery-api.ts'

const OPTIONAL = { required: false } as const
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
  if (!value.on)
    return (
      <Card>
        <Section title="Delivery is off" blurb="Add a delivery section to .avoozl.json to let the tick start ready tasks; these settings appear then." />
      </Card>
    )
  const feedback = form.prFeedback ? form.prFeedback === 'on' : DELIVERY_DEFAULTS.prFeedback
  return (
    <div className="flex flex-col gap-3" data-delivery-settings>
      <Card className="flex flex-col gap-4">
        <Section title="Writer" blurb="The agent and model worker chats open on, unless a routing rule or the task picks another.">
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
            Per-task agent and model, and spreading tasks across models, are routing rules.{' '}
            {onOpenRouting ? (
              <button type="button" className="underline" onClick={onOpenRouting}>
                Open Routing
              </button>
            ) : (
              'Set them on the Routing tab.'
            )}
          </p>
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
