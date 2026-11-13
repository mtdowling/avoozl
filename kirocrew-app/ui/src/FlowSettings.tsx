// Settings > Flow (design §8.4, R48.6–R48.8): stop the line, local checks
// first, batching and retros for this workspace. Saves write `flow` in
// .avoozl.json through flow.settings.update with the file's hash; the retro
// instructions are saved on this machine only (flow.instructions.update).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import { Tooltip } from './Tooltip.tsx'
import { ChoiceCards } from './controls.tsx'
import { Marker, Section } from './SettingsView.tsx'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import PromptInstructions from './PromptInstructions.tsx'
import { FLOW_DEFAULTS, flowClient, modelOptions, toFlowForm, toFlowSection, type FlowForm, type FlowSettings as Settings } from './flow-api.ts'

const OPTIONAL = { required: false } as const
const selectStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }

function Raw({ name }: { name: string }) {
  return (
    <Tooltip text=".avoozl.json key">
      <code className="text-[11px] text-muted" style={{ overflowWrap: 'anywhere', opacity: 0.8 }}>
        {name}
      </code>
    </Tooltip>
  )
}

function Labeled(props: { id: string; label: string; raw: string; width?: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm" style={props.width ? { maxWidth: props.width } : undefined}>
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

export const FLOW_SCOPE_CARDS = [
  { key: 'dependents', title: 'Tasks that build on it', line: "Pause the culprit's dependents; unrelated work keeps moving.", when: 'most of the time (the default).' },
  { key: 'repo', title: 'This repository', line: 'Pause every task in the repository that broke.', when: 'one repository shares a lot of code across tasks.' },
  { key: 'all', title: 'Everything', line: 'Pause every task in the workspace.', when: 'repositories depend on each other.' },
] as const

export default function FlowSettings({ workspaceId }: { workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => flowClient(api), [api])
  const load = useCallback((id: string) => client.settings(id), [client])
  const { value, error, reload } = useRead<Settings>(workspaceId, load)
  const [form, setForm] = useState<FlowForm>(toFlowForm())
  const [instructions, setInstructions] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null)
  // The models Kiro Crew offers, for the Model dropdown.
  const [models, setModels] = useState<{ list: { value: string; label: string }[]; error: string | null }>({ list: [], error: null })
  useEffect(() => {
    let live = true
    client.models().then(
      (list) => live && setModels({ list, error: list.length ? null : 'Kiro Crew listed no models; auto uses its default.' }),
      () => live && setModels({ list: [], error: "Kiro Crew's model list could not be read; auto uses its default." }),
    )
    return () => {
      live = false
    }
  }, [client])
  useEffect(() => {
    if (!value) return
    setForm(toFlowForm(value.flow))
    setInstructions(value.instructions ?? '')
  }, [value])
  const set = (change: Partial<FlowForm>) => setForm({ ...form, ...change })
  const save = async () => {
    if (!value) return
    const built = toFlowSection(form)
    if (built.error) return setMessage({ error: built.error })
    setSaving(true)
    setMessage(null)
    try {
      await client.saveSettings(workspaceId, { flow: built.flow!, expectedHash: value.hash })
      if (instructions !== (value.instructions ?? '')) await client.saveInstructions(workspaceId, instructions)
      setMessage({ ok: 'Saved.' })
      await reload()
    } catch (caught) {
      setMessage({ error: errorMessage(caught) })
    } finally {
      setSaving(false)
    }
  }
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  if (!value) return <p className="text-sm text-muted">Loading…</p>
  const scope = form.scope || FLOW_DEFAULTS.scope
  const local = form.localChecksFirst ? form.localChecksFirst === 'on' : FLOW_DEFAULTS.localChecksFirst
  return (
    <div className="flex flex-col gap-3" data-flow-settings>
      <Card className="flex flex-col gap-4">
        <Section title="Timing" blurb="Always on. Avoozl records where each task's time goes; nothing to set." />
        <Section title="Stop the line" blurb="When a change breaks a check that passed, pause new work until it's fixed.">
          <div className="flex flex-col gap-1 text-sm">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">What to pause</span>
              <Marker rule={OPTIONAL} />
            </span>
            <ChoiceCards id="avoozl-flow-scope" label="What to pause" value={scope} onChange={(key) => set({ scope: key })} cards={FLOW_SCOPE_CARDS.map((c) => ({ ...c }))} />
            <Raw name="flow.stopTheLine.scope" />
          </div>
        </Section>
        <Section title="Local checks first" blurb="Run the checks here before any push, so CI only confirms. It matters only when sessions push.">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <input type="checkbox" checked={local} onChange={(event) => set({ localChecksFirst: event.target.checked ? 'on' : 'off' })} />
            <span className="font-medium">Require a local pass before push</span>
            <Marker rule={OPTIONAL} />
          </label>
          <Raw name="flow.localChecksFirst" />
        </Section>
        <Section title="Batching" blurb="Run small related tasks together to pay setup and checks once. 1 turns it off.">
          <div className="flex flex-wrap gap-4">
            <Labeled id="avoozl-flow-max" label="Most tasks per run" raw="flow.batch.max" width="13rem">
              <Input id="avoozl-flow-max" inputMode="numeric" value={form.max} placeholder={String(FLOW_DEFAULTS.max)} onChange={(event) => set({ max: event.target.value })} />
            </Labeled>
            <Labeled id="avoozl-flow-by" label="Group by" raw="flow.batch.by" width="12rem">
              <select id="avoozl-flow-by" value={form.by} onChange={(event) => set({ by: event.target.value as FlowForm['by'] })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
                <option value="">Same epic (default)</option>
                <option value="epic">Same epic</option>
                <option value="files">Same files</option>
              </select>
            </Labeled>
          </div>
        </Section>
        <Section title="Retro" blurb="A review that finds the biggest slowdown and proposes one change. You approve or reject each proposal.">
          <div className="flex flex-wrap gap-4">
            <Labeled id="avoozl-flow-every" label="After this many tasks" raw="flow.retro.everyTasks" width="14rem">
              <Input id="avoozl-flow-every" inputMode="numeric" value={form.everyTasks} placeholder={String(FLOW_DEFAULTS.everyTasks)} onChange={(event) => set({ everyTasks: event.target.value })} />
            </Labeled>
            <Labeled id="avoozl-flow-slow" label="Slow when over (× usual)" raw="flow.retro.slowFactor" width="14rem">
              <Input id="avoozl-flow-slow" inputMode="decimal" value={form.slowFactor} placeholder={String(FLOW_DEFAULTS.slowFactor)} onChange={(event) => set({ slowFactor: event.target.value })} />
            </Labeled>
            <Labeled id="avoozl-flow-model" label="Model" raw="flow.retro.model" width="16rem" note={models.error ?? undefined}>
              <select id="avoozl-flow-model" value={form.model || FLOW_DEFAULTS.model} onChange={(event) => set({ model: event.target.value === FLOW_DEFAULTS.model ? '' : event.target.value })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
                {modelOptions(models.list, form.model).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Labeled>
          </div>
          <PromptInstructions
            id="avoozl-flow-instructions"
            agent="retro"
            builtIn={value.retroPrompt}
            value={instructions}
            onChange={setInstructions}
            raw="flow.retro.instructions"
            placeholder="What the retro should weigh, for example: fewer review rounds matter more than CI time."
            note="Saved on this machine only."
          />
        </Section>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Btn type="button" primary disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </Btn>
        {message?.error && (
          <span role="alert" className="text-sm text-danger">
            {message.error}
          </span>
        )}
        {message?.ok && <span className="text-sm text-muted">{message.ok}</span>}
        <span className="text-xs text-muted">Writes flow in .avoozl.json.</span>
      </div>
    </div>
  )
}
