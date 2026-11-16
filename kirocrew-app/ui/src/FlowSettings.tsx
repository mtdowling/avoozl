// Settings > Flow (design §8.4, R48.6–R48.8): stop the line, local checks
// first, batching and retros for this workspace. Saves write `flow` in
// .avoozl.json through flow.settings.update with the file's hash; the retro
// instructions are saved on this machine only (flow.instructions.update).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Card, Input, SegmentedControl } from '@kirocrew/app-sdk/ui'
import { Tooltip } from './Tooltip.tsx'
import { ChoiceCards, SectionHeading } from './controls.tsx'
import { Marker, Section } from './SettingsView.tsx'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { Pause } from './icons.ts'
import PromptInstructions from './PromptInstructions.tsx'
import { FLOW_DEFAULTS, flowClient, toFlowForm, toFlowSection, type FlowForm, type FlowSettings as Settings } from './flow-api.ts'

const OPTIONAL = { required: false } as const
// A label and its "(optional)" marker, spaced inline so no stylesheet can
// run them together.
const LABEL_ROW = { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 } as const

function Raw({ name }: { name: string }) {
  return (
    <Tooltip text=".avoozl.json key">
      <code className="text-[11px] text-muted" style={{ overflowWrap: 'anywhere', opacity: 0.8 }}>
        {name}
      </code>
    </Tooltip>
  )
}

// One field in a FieldGrid: label, input, hint, then the .avoozl.json key.
// Its four rows join the grid's rows (subgrid), so fields side by side line
// up row by row even when one label wraps.
function Labeled(props: { id: string; label: string; raw: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="min-w-0 text-sm" data-flow-field style={{ display: 'grid', gridRow: 'span 4', gridTemplateRows: 'subgrid', rowGap: 4, alignContent: 'start' }}>
      <label htmlFor={props.id} style={{ ...LABEL_ROW, alignSelf: 'end' }}>
        <span className="font-medium">{props.label}</span>
        <Marker rule={OPTIONAL} />
      </label>
      <div style={{ display: 'flex', minWidth: 0 }}>{props.children}</div>
      <span className="text-xs text-muted">{props.note ?? ''}</span>
      <Raw name={props.raw} />
    </div>
  )
}

// Fields on a grid: as many columns as fit, each at least 13rem.
function FieldGrid({ children, group }: { children: React.ReactNode; group?: string }) {
  return (
    <div data-flow-group={group} style={{ display: 'grid', columnGap: 16, rowGap: 4, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 13rem), 1fr))' }}>
      {children}
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
  const ciDefaults = value.ciEffective ?? FLOW_DEFAULTS
  return (
    <div className="flex flex-col gap-3" data-flow-settings>
      <Box>
        <Section title="Timing" blurb="Always on. Avoozl records where each task's time goes; nothing to set." />
      </Box>
      <Box>
        <Section title="Pause on a broken check" blurb="When a change breaks a check that passed, pause new work until it's fixed." icon={Pause}>
          <div className="flex flex-col gap-1 text-sm">
            <span style={LABEL_ROW}>
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
          <label className="text-sm" style={{ ...LABEL_ROW, alignItems: 'center' }}>
            <input type="checkbox" checked={local} onChange={(event) => set({ localChecksFirst: event.target.checked ? 'on' : 'off' })} />
            <span className="font-medium">Require a local pass before push</span>
            <Marker rule={OPTIONAL} />
          </label>
          <Raw name="flow.localChecksFirst" />
        </Section>
      </Box>
      <Box>
        <Section title="Batching" blurb="Run small related tasks together to pay setup and checks once. 1 turns it off.">
          <FieldGrid group="batch">
            <Labeled id="avoozl-flow-max" label="Most tasks per run" raw="flow.batch.max">
              <Input id="avoozl-flow-max" inputMode="numeric" value={form.max} placeholder={String(FLOW_DEFAULTS.max)} onChange={(event) => set({ max: event.target.value })} />
            </Labeled>
            <Labeled id="avoozl-flow-by" label="Group by" raw="flow.batch.by" note="Same phase is the default.">
              <SegmentedControl
                layoutId="avoozl-flow-by"
                ariaLabel="Group by"
                segments={[
                  { key: 'phase', label: 'Same phase' },
                  { key: 'files', label: 'Same files' },
                ]}
                value={form.by || FLOW_DEFAULTS.by}
                onChange={(key) => set({ by: key as FlowForm['by'] })}
              />
            </Labeled>
          </FieldGrid>
        </Section>
      </Box>
      <Box>
        <Section title="CI" blurb="Review steady CI costs across every pull request. These limits trigger a retrospective proposal; you decide what changes.">
          <div data-ci-settings className="flex flex-col gap-4">
            <FieldGrid group="ci">
              <Labeled id="avoozl-flow-ci-window" label="Window (days)" raw="flow.ci.windowDays" note="Whole number 1–90.">
                <Input id="avoozl-flow-ci-window" inputMode="numeric" value={form.windowDays} placeholder={String(ciDefaults.windowDays)} onChange={(event) => set({ windowDays: event.target.value })} />
              </Labeled>
              <Labeled id="avoozl-flow-ci-docs" label="Docs-only CI limit (minutes)" raw="flow.ci.docsOnlyMinutes" note="Whole number 1–100,000. Includes spec-only changes.">
                <Input id="avoozl-flow-ci-docs" inputMode="numeric" value={form.docsOnlyMinutes} placeholder={String(ciDefaults.docsOnlyMinutes)} onChange={(event) => set({ docsOnlyMinutes: event.target.value })} />
              </Labeled>
              <Labeled id="avoozl-flow-ci-wait" label="CI wait share limit" raw="flow.ci.waitShare" note="0.05–1 of lead time. 0.4 means 40%.">
                <Input id="avoozl-flow-ci-wait" inputMode="decimal" value={form.waitShare} placeholder={String(ciDefaults.waitShare)} onChange={(event) => set({ waitShare: event.target.value })} />
              </Labeled>
              <Labeled id="avoozl-flow-ci-min" label="Closed pull requests before wait check" raw="flow.ci.minPullRequests" note="Whole number 1–1,000.">
                <Input id="avoozl-flow-ci-min" inputMode="numeric" value={form.minPullRequests} placeholder={String(ciDefaults.minPullRequests)} onChange={(event) => set({ minPullRequests: event.target.value })} />
              </Labeled>
            </FieldGrid>
            <div className="flex flex-col gap-2" data-ci-globs>
              <h4 className="m-0 text-sm font-semibold">File classes (read-only)</h4>
              <p className="m-0 text-xs text-muted">First matching class wins in the order below. A repository can override these lists in its configuration.</p>
              {Object.entries(value.ciClassGlobs ?? {}).map(([name, globs]) => <div key={name} className="flex min-w-0 flex-col gap-1 border-t pt-2" style={{ borderColor: 'var(--border)' }}><span className="text-sm font-medium">{name}</span><code className="text-xs text-muted" style={{ overflowWrap: 'anywhere' }}>{globs.join(', ') || 'No matching paths'}</code></div>)}
              <div className="flex flex-col gap-1 border-t pt-2" style={{ borderColor: 'var(--border)' }}><span className="text-sm font-medium">code</span><span className="text-xs text-muted">Anything that does not match a class above.</span></div>
              <Raw name="flow.ci.classes" />
            </div>
          </div>
        </Section>
      </Box>
      <Box>
        <Section title="Retro" blurb="A review that finds the biggest slowdown and proposes one change. You approve or reject each proposal.">
          <SectionHeading level={4} title="When it runs" />
          <FieldGrid group="when">
            <Labeled id="avoozl-flow-every" label="After this many tasks" raw="flow.retro.everyTasks">
              <Input id="avoozl-flow-every" inputMode="numeric" value={form.everyTasks} placeholder={String(FLOW_DEFAULTS.everyTasks)} onChange={(event) => set({ everyTasks: event.target.value })} />
            </Labeled>
            <Labeled id="avoozl-flow-slow" label="Slow when over (× usual)" raw="flow.retro.slowFactor">
              <Input id="avoozl-flow-slow" inputMode="decimal" value={form.slowFactor} placeholder={String(FLOW_DEFAULTS.slowFactor)} onChange={(event) => set({ slowFactor: event.target.value })} />
            </Labeled>
          </FieldGrid>
          {/* The retro's model is under Settings › Models. */}
          <SectionHeading level={4} title="What it weighs" />
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
          {drifted > 0 && (
            <p role="status" className="text-sm" style={{ color: 'var(--warning, var(--text))' }} data-override-warning>
              {drifted === 1 ? 'A prompt override is' : `${drifted} prompt overrides are`} based on an older built-in text. Review the rebase in Flow › Proposals.
            </p>
          )}
        </Section>
      </Box>
      {/* The dialog's footer: it stays at the bottom while the groups scroll,
          on the darker surface over a divider, Save last at the right. */}
      <div
        data-flow-footer
        style={{ position: 'sticky', bottom: -16, zIndex: 1, margin: '0 -20px -16px', padding: '12px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border)', background: 'var(--bg-accent, var(--bg-elevated))' }}
      >
        <span className="text-xs text-muted" style={{ marginRight: 'auto' }}>
          Writes flow in .avoozl.json.
        </span>
        {message?.error && (
          <span role="alert" className="text-sm text-danger">
            {message.error}
          </span>
        )}
        {message?.ok && <span className="text-sm text-muted">{message.ok}</span>}
        <Btn type="button" primary disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </Btn>
      </div>
    </div>
  )
}
