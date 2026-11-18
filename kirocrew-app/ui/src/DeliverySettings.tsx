// Settings > Delivery (R54.8): investigate first and pull request feedback.
// Merging is on each repository's Landing tab, and the worker's agent and
// model are in Settings › Models (R98.7). Saves write `delivery` in
// .avoozl.json through delivery.settings.update with the file's hash.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import { SaveFooter } from './SaveFooter.tsx'
import { Section } from './SettingsView.tsx'
import { CheckRow, FieldRow } from './FieldRow.tsx'
import { AskForHelp, useConfirm } from './controls.tsx'
import { useRead } from './useRead.ts'
import { COMMAND_PATH, errorMessage } from './workspace-api.ts'
import { DELIVERY_DEFAULTS, toDeliveryForm, toDeliverySection, type DeliveryForm, type DeliverySettings as Settings } from './delivery-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'

const OPTIONAL = { required: false } as const
const OFF_BLURB = 'The tick starts no ready task until delivery is on. Its investigate and pull request settings show here then.'
const selectStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }

// A field: the shared FieldRow, every Delivery value optional.
// `byDefault` is the value a blank field uses; `reset` shows when the field
// holds another value and puts the default back.
function Labeled(props: { id: string; label: string; raw: string; width: string; note?: string; byDefault?: string; reset?: () => void; children: React.ReactNode }) {
  return (
    <FieldRow id={props.id} label={props.label} raw={props.raw} rule={OPTIONAL} width={props.width} help={props.note} note={props.byDefault ? `Default: ${props.byDefault}.` : undefined} onReset={props.reset} defaultText={props.byDefault}>
      {props.children}
    </FieldRow>
  )
}

export default function DeliverySettings({ workspaceId }: { workspaceId: string }) {
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
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  const [turning, setTurning] = useState(false)
  const confirm = useConfirm()
  useEffect(() => {
    if (value) setForm(toDeliveryForm(value.delivery))
  }, [value])
  const set = (change: Partial<DeliveryForm>) => {
    setMessage(null)
    setForm({ ...form, ...change })
  }
  const built = toDeliverySection(form)
  const dirty = Boolean(value) && JSON.stringify(form) !== JSON.stringify(toDeliveryForm(value?.delivery))
  const save = async () => {
    if (!value || built.error) return
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
      <ErrorText role="alert" size="sm">
        {error}
      </ErrorText>
    )
  if (!value) return <Hint as="p" size="sm">Loading…</Hint>
  // Turn on delivery: the normal save, with an empty delivery section (every
  // key at its default) written first.
  const turnOn = async () => {
    const yes = await confirm({
      title: 'Turn on delivery?',
      body: 'The tick starts ready tasks in Kiro Crew chats, about once a minute, with the agents and models set in Settings › Models. Stop the line or Defer pauses them.',
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
          <Row gap={3} data-delivery-off>
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
              <ErrorText role="alert" as="span" size="sm">
                {message.error}
              </ErrorText>
            )}
          </Row>
        </Section>
      </Card>
    )
  const feedback = form.prFeedback ? form.prFeedback === 'on' : DELIVERY_DEFAULTS.prFeedback
  // A field that does nothing under another's value is disabled with why.
  const offInvestigate = form.investigateMode === 'off' ? 'Off while Which tasks is Off.' : null
  return (
    <Stack gap={3} data-delivery-settings>
      <Card className="flex flex-col gap-4">
        <Section title="Investigate first" blurb="Before coding, the writer reports what it found and how sure it is; a second chat tries to prove it wrong. Coding starts only when both are sure enough and the findings stand.">
          <Row gap={4} align="start">
            <Labeled id="avoozl-delivery-investigate" label="Which tasks" raw="delivery.investigate.mode" width="16rem" note="A task's facts in tasks.md can set investigate: true or false." byDefault="All but small tasks" reset={form.investigateMode && form.investigateMode !== DELIVERY_DEFAULTS.investigateMode ? () => set({ investigateMode: DELIVERY_DEFAULTS.investigateMode }) : undefined}>
              <select id="avoozl-delivery-investigate" value={form.investigateMode ?? DELIVERY_DEFAULTS.investigateMode} onChange={(e) => set({ investigateMode: e.target.value as DeliveryForm['investigateMode'] })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
                <option value="not-small">All but small tasks</option>
                <option value="all">All tasks</option>
                <option value="off">Off</option>
              </select>
            </Labeled>
            <Labeled id="avoozl-delivery-confidence" label="Sure enough at" raw="delivery.investigate.minConfidence" width="16rem" note={offInvestigate ?? 'Less sure waits in Needs you.'} byDefault="High" reset={form.minConfidence && form.minConfidence !== DELIVERY_DEFAULTS.minConfidence ? () => set({ minConfidence: DELIVERY_DEFAULTS.minConfidence }) : undefined}>
              <select id="avoozl-delivery-confidence" disabled={Boolean(offInvestigate)} value={form.minConfidence ?? DELIVERY_DEFAULTS.minConfidence} onChange={(e) => set({ minConfidence: e.target.value as DeliveryForm['minConfidence'] })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>
            </Labeled>
          </Row>
        </Section>
        <Section title="Pull request feedback" blurb="Send failed checks and allowed reviewers' comments back to the chat that wrote the pull request. Matters only in a GitHub mode.">
          <CheckRow label="Send pull request feedback to the writer" help="On by default." raw="delivery.prFeedback" checked={feedback} onChange={(on) => set({ prFeedback: on ? 'on' : 'off' })} />
          <Labeled id="avoozl-delivery-rounds" label="Most feedback rounds per task" raw="delivery.feedbackRounds" width="9rem" note={feedback ? 'Whole number, 1–20. Then Avoozl stops and asks you.' : 'Off while pull request feedback is off.'} byDefault={String(DELIVERY_DEFAULTS.feedbackRounds)} reset={form.feedbackRounds.trim() && form.feedbackRounds.trim() !== String(DELIVERY_DEFAULTS.feedbackRounds) ? () => set({ feedbackRounds: '' }) : undefined}>
            <Input id="avoozl-delivery-rounds" inputMode="numeric" disabled={!feedback} value={form.feedbackRounds} placeholder={String(DELIVERY_DEFAULTS.feedbackRounds)} onChange={(e) => set({ feedbackRounds: e.target.value })} />
          </Labeled>
        </Section>
      </Card>
      <SaveFooter
        dirty={dirty}
        problem={built.error}
        error={message?.error}
        ok={message?.ok}
        note="Writes delivery in .avoozl.json."
        onSave={() => void save()}
        onDiscard={() => {
          setMessage(null)
          setForm(toDeliveryForm(value.delivery))
        }}
      />
    </Stack>
  )
}
