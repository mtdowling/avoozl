// Settings > Flow (design §8.4, R48.6–R48.8): stop the line, local checks
// first, batching and retros for this workspace. Saves write `flow` in
// .avoozl.json through flow.settings.update with the file's hash; the retro
// instructions are saved on this machine only (flow.instructions.update).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import { Tooltip } from './Tooltip.tsx'
import { ChoiceCards, SectionHeading } from './controls.tsx'
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

// One bordered, titled box per sub-section, on the card surface.
function Box({ children }: { children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4" data-flow-box>
      {children}
    </Card>
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
  // Overrides an Avoozl update changed under them (R70.5).
  const [drifted, setDrifted] = useState(0)
  useEffect(() => {
    let live = true
    client.proposals(workspaceId).then(
      (p) => live && setDrifted(p.prompts.reduce((n, row) => n + row.drift.length, 0)),
      () => live && setDrifted(0),
    )
    return () => {
      live = false
    }
  }, [client, workspaceId])
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
      <Box>
        <Section title="Timing" blurb="Always on. Avoozl records where each task's time goes; nothing to set." />
      </Box>
      <Box>
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
      </Box>
      <Box>
        <Section title="Local checks first" blurb="Run the checks here before any push, so CI only confirms. It matters only when sessions push.">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <input type="checkbox" checked={local} onChange={(event) => set({ localChecksFirst: event.target.checked ? 'on' : 'off' })} />
            <span className="font-medium">Require a local pass before push</span>
            <Marker rule={OPTIONAL} />
          </label>
          <Raw name="flow.localChecksFirst" />
        </Section>
      </Box>
      <Box>
        <Section title="Batching" blurb="Run small related tasks together to pay setup and checks once. 1 turns it off.">
          <div className="flex flex-wrap gap-4">
            <Labeled id="avoozl-flow-max" label="Most tasks per run" raw="flow.batch.max" width="13rem">
              <Input id="avoozl-flow-max" inputMode="numeric" value={form.max} placeholder={String(FLOW_DEFAULTS.max)} onChange={(event) => set({ max: event.target.value })} />
            </Labeled>
            <Labeled id="avoozl-flow-by" label="Group by" raw="flow.batch.by" width="12rem">
              <select id="avoozl-flow-by" value={form.by} onChange={(event) => set({ by: event.target.value as FlowForm['by'] })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
                <option value="">Same phase (default)</option>
                <option value="phase">Same phase</option>
                <option value="files">Same files</option>
              </select>
            </Labeled>
          </div>
        </Section>
      </Box>
      <Box>
        <Section title="Retro" blurb="A review that finds the biggest slowdown and proposes one change. You approve or reject each proposal.">
          <SectionHeading level={4} title="When it runs" />
          <div className="flex flex-wrap gap-4" data-flow-group="when">
            <Labeled id="avoozl-flow-every" label="After this many tasks" raw="flow.retro.everyTasks" width="14rem">
              <Input id="avoozl-flow-every" inputMode="numeric" value={form.everyTasks} placeholder={String(FLOW_DEFAULTS.everyTasks)} onChange={(event) => set({ everyTasks: event.target.value })} />
            </Labeled>
            <Labeled id="avoozl-flow-slow" label="Slow when over (× usual)" raw="flow.retro.slowFactor" width="14rem">
              <Input id="avoozl-flow-slow" inputMode="decimal" value={form.slowFactor} placeholder={String(FLOW_DEFAULTS.slowFactor)} onChange={(event) => set({ slowFactor: event.target.value })} />
            </Labeled>
          </div>
          <SectionHeading level={4} title="Who runs it and what it weighs" />
          <div className="flex flex-wrap gap-4" data-flow-group="model">
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
      </Box>
      <Box>
        <Section title="Lessons" blurb="What retros learned, as short summaries. Lessons stay on this computer and help retros in your other workspaces.">
          <div className="flex flex-col gap-2" data-flow-group="lessons">
            {(
              [
                ['share', "Share this workspace's lessons"],
                ['read', 'Use lessons from other workspaces'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-0.5">
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="checkbox" checked={form[key] ? form[key] === 'on' : FLOW_DEFAULTS[key]} onChange={(event) => set({ [key]: event.target.checked ? 'on' : 'off' })} />
                  <span className="font-medium">{label}</span>
                  <Marker rule={OPTIONAL} />
                </label>
                <Raw name={`flow.lessons.${key}`} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            <Labeled id="avoozl-flow-untested" label="Untested lessons expire after (days)" raw="flow.lessons.untestedDays" width="16rem">
              <Input id="avoozl-flow-untested" inputMode="numeric" value={form.untestedDays} placeholder={String(FLOW_DEFAULTS.untestedDays)} onChange={(event) => set({ untestedDays: event.target.value })} />
            </Labeled>
            <Labeled id="avoozl-flow-confirm" label="Confirm within (days)" raw="flow.lessons.confirmDays" width="14rem">
              <Input id="avoozl-flow-confirm" inputMode="numeric" value={form.confirmDays} placeholder={String(FLOW_DEFAULTS.confirmDays)} onChange={(event) => set({ confirmDays: event.target.value })} />
            </Labeled>
            <Labeled id="avoozl-flow-review" label="Review lessons every (retros)" raw="flow.lessons.reviewEvery" width="15rem">
              <Input id="avoozl-flow-review" inputMode="numeric" value={form.reviewEvery} placeholder={String(FLOW_DEFAULTS.reviewEvery)} onChange={(event) => set({ reviewEvery: event.target.value })} />
            </Labeled>
          </div>
          {drifted > 0 && (
            <p role="status" className="text-sm" style={{ color: 'var(--warning, var(--text))' }} data-override-warning>
              {drifted === 1 ? 'A prompt override is' : `${drifted} prompt overrides are`} based on an older built-in text. Review the rebase in Flow › Proposals.
            </p>
          )}
        </Section>
      </Box>
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
