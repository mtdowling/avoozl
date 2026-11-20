// Settings > Flow (design §8.4, R48.6–R48.8): stop the line, local checks
// first and retros for this workspace. Saves write `flow` in
// .avoozl.json through flow.settings.update with the file's hash; the retro
// instructions are saved on this machine only (flow.instructions.update).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { ChoiceCards, SectionHeading } from './ui/controls.tsx'
import { Section } from './SettingsView.tsx'
import { CheckRow, FieldGrid as SharedGrid, Field, Marker, RawKey } from './ui/Field.tsx'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { Pause } from './icons.ts'
import { SaveFooter } from './SaveFooter.tsx'
import PromptInstructions from './PromptInstructions.tsx'
import { FLOW_DEFAULTS, flowClient, toFlowForm, toFlowSection, type FlowForm, type FlowSettings as Settings } from './flow-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

const OPTIONAL = { required: false } as const

// One field in a FieldGrid: the shared Field, lined up with the fields
// beside it (align), every Flow value optional.
function Labeled(props: { id: string; label: string; raw: string; children: React.ReactNode; note?: string }) {
  return (
    <Field id={props.id} label={props.label} raw={props.raw} rule={OPTIONAL} help={props.note} align attrs={{ 'data-flow-field': true }}>
      {props.children}
    </Field>
  )
}

function FieldGrid({ children, group }: { children: React.ReactNode; group?: string }) {
  return (
    <SharedGrid align group={group}>
      {children}
    </SharedGrid>
  )
}

// One bordered, titled box per sub-section, on the card surface.
function FlowBox({ children }: { children: React.ReactNode }) {
  return (
    <Card flex flexCol gap="4" data-flow-box>
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
  return <WorkspaceFlowSettings key={workspaceId} workspaceId={workspaceId} />
}

// A workspace switch discards its form and all pending reads together.
function WorkspaceFlowSettings({ workspaceId }: { workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => flowClient(api), [api])
  const load = useCallback((id: string) => client.settings(id), [client])
  const { value, error, reload } = useRead<Settings>(workspaceId, load)
  const [form, setForm] = useState<FlowForm>(toFlowForm())
  const [instructions, setInstructions] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null)
  useEffect(() => {
    if (!value) return
    setForm(toFlowForm(value.flow))
    setInstructions(value.instructions ?? '')
  }, [value])
  const set = (change: Partial<FlowForm>) => {
    setMessage(null)
    setForm({ ...form, ...change })
  }
  const built = toFlowSection(form)
  const dirty = Boolean(value) && (JSON.stringify(form) !== JSON.stringify(toFlowForm(value?.flow)) || instructions !== (value?.instructions ?? ''))
  const save = async () => {
    if (!value) return
    if (built.error) return
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
      <ErrorText role="alert" size="sm">
        {error}
      </ErrorText>
    )
  if (!value)
    return (
      <Hint as="p" size="sm">
        Loading…
      </Hint>
    )
  const scope = form.scope || FLOW_DEFAULTS.scope
  const local = form.localChecksFirst ? form.localChecksFirst === 'on' : FLOW_DEFAULTS.localChecksFirst
  return (
    <Stack gap={3} data-flow-settings>
      <FlowBox>
        <Section title="Timing" blurb="Always on. Avoozl records where each task's time goes; nothing to set." />
      </FlowBox>
      <FlowBox>
        <Section title="Pause on a broken check" blurb="When a change breaks a check that passed, pause new work until it's fixed." icon={Pause}>
          <Box flex flexCol gap="1" size="sm">
            <Box as="span" css-display="flex" css-flex-wrap="wrap" css-align-items="baseline" css-column-gap="8">
              <Box as="span" weight="medium">
                What to pause
              </Box>
              <Marker rule={OPTIONAL} />
            </Box>
            <ChoiceCards id="avoozl-flow-scope" label="What to pause" value={scope} onChange={(key) => set({ scope: key })} cards={FLOW_SCOPE_CARDS.map((c) => ({ ...c }))} />
            <RawKey name="flow.stopTheLine.scope" />
          </Box>
        </Section>
      </FlowBox>
      <FlowBox>
        <Section title="Local checks first" blurb="Run the checks here before any push, so CI only confirms. It matters only when sessions push.">
          <CheckRow label="Require a local pass before push" raw="flow.localChecksFirst" checked={local} onChange={(on) => set({ localChecksFirst: on ? 'on' : 'off' })} />
        </Section>
      </FlowBox>
      <FlowBox>
        <Section title="Retro" blurb="A review that finds the biggest slowdown and proposes a settings or spec change. You approve or reject each proposal.">
          <SectionHeading level={4} title="When it runs" />
          <FieldGrid group="when">
            <Labeled id="avoozl-flow-every" label="After this many tasks" raw="flow.retro.everyTasks">
              <Input
                id="avoozl-flow-every"
                inputMode="numeric"
                value={form.everyTasks}
                placeholder={String(FLOW_DEFAULTS.everyTasks)}
                onChange={(event) => set({ everyTasks: event.target.value })}
              />
            </Labeled>
            <Labeled id="avoozl-flow-slow" label="Slow when over (× usual)" raw="flow.retro.slowFactor">
              <Input
                id="avoozl-flow-slow"
                inputMode="decimal"
                value={form.slowFactor}
                placeholder={String(FLOW_DEFAULTS.slowFactor)}
                onChange={(event) => set({ slowFactor: event.target.value })}
              />
            </Labeled>
          </FieldGrid>
          {/* The retro's model is under Settings › Models. */}
          <SectionHeading level={4} title="What it weighs" />
          <PromptInstructions
            id="avoozl-flow-instructions"
            agent="retro"
            builtIn={value.retroPrompt}
            value={instructions}
            onChange={(text) => (setMessage(null), setInstructions(text))}
            raw="flow.retro.instructions"
            placeholder="What the retro should weigh, for example: fewer review rounds matter more than CI time."
            note="Saved on this machine only."
          />
        </Section>
      </FlowBox>
      <SaveFooter
        dirty={dirty}
        saving={saving}
        problem={built.error}
        error={message?.error}
        ok={message?.ok}
        note="Writes flow in .avoozl.json."
        onSave={() => void save()}
        onDiscard={() => {
          setMessage(null)
          setForm(toFlowForm(value.flow))
          setInstructions(value.instructions ?? '')
        }}
      />
    </Stack>
  )
}
