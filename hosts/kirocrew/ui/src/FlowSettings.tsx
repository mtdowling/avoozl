// Settings > Flow (design §8.4, R48.6–R48.8): stop the line and local
// checks first for this workspace. Saves write `flow` in .avoozl.json
// through flow.settings.update with the file's hash.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Card } from './ui/Card'
import { ChoiceCards } from './ui/controls.tsx'
import { Section } from './SettingsView.tsx'
import { CheckRow, Marker, RawKey } from './ui/Field.tsx'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { Pause } from './icons.ts'
import { SaveFooter } from './SaveFooter.tsx'
import { FLOW_DEFAULTS, flowClient, toFlowForm, toFlowSection, type FlowForm, type FlowSettings as Settings } from './line-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

const OPTIONAL = { required: false } as const

// One bordered, titled box per sub-section, on the card surface.
function FlowBox({ children }: { children: React.ReactNode }) {
  return (
    <Card flex flexCol gap="4" data-flow-box>
      {children}
    </Card>
  )
}

const FLOW_SCOPE_CARDS = [
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
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null)
  useEffect(() => {
    if (!value) return
    setForm(toFlowForm(value.flow))
  }, [value])
  const set = (change: Partial<FlowForm>) => {
    setMessage(null)
    setForm({ ...form, ...change })
  }
  const built = toFlowSection(form)
  const dirty = Boolean(value) && JSON.stringify(form) !== JSON.stringify(toFlowForm(value?.flow))
  const save = async () => {
    if (!value) return
    if (built.error) return
    setSaving(true)
    setMessage(null)
    try {
      await client.saveSettings(workspaceId, { flow: built.flow!, expectedHash: value.hash })
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
        }}
      />
    </Stack>
  )
}
