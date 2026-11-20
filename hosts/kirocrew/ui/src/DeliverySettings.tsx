// Settings > Autopilot (R54.8): whether Avoozl delivers ready tasks on its
// own, and who merges pull requests (the workspace's landing.pr, R119; a
// repository's Landing tab may override it). Autopilot runs here only with
// both switches: the workspace's `delivery` block in .avoozl.json and this
// machine's `loop` (SM6). Picking Autopilot writes both; Off removes the
// loop. Every setting shows whether Autopilot is on or off. The worker's
// agent and model are in Settings › Models (R98.7). Saves go through
// delivery.settings.update; only a person turns Autopilot on or off, after
// one confirm.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Card } from './ui/Card'
import { CheckRow, Field } from './ui/Field'
import { Input } from './ui/Input'
import { SaveFooter } from './SaveFooter.tsx'
import { Section } from './SettingsView.tsx'
import { AskForHelp, type ConfirmCopy, useConfirm } from './ui/controls.tsx'
import { useRead } from './useRead.ts'
import { COMMAND_PATH, errorMessage } from './workspace-api.ts'
import type { DeliverySettings as Settings } from './delivery-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { RadioFold } from './ui/RadioFold.tsx'
import { PR_MODES, PR_MODE_TEXT } from './settings-api.ts'

type PrMode = (typeof PR_MODES)[number]
type Mode = 'off' | 'autopilot'
type Loop = NonNullable<Settings['loop']>

// The loop kinds `loop.run` takes (tick/loop.mjs LOOP_KINDS).
const RUN_KINDS = [
  { key: 'specs', label: 'Specs', help: "Every spec's tasks." },
  { key: 'epics', label: 'Epics', help: 'Only the specs named below, and the specs they link.' },
  { key: 'issues', label: 'Issues', help: 'Labeled issues.' },
] as const
// What picking Autopilot writes when this machine has no loop yet.
const DEFAULT_LOOP: Loop = { run: ['specs'] }

// The form's loop: `every` and `epics` as typed text.
interface LoopForm {
  run: string[]
  every: string
  epics: string
}
const loopForm = (loop: Loop | null | undefined): LoopForm => {
  const from = loop ?? DEFAULT_LOOP
  return { run: [...from.run], every: from.every ?? '', epics: (from.epics ?? []).join(', ') }
}
// The loop a form writes; blank `every` and `epics` are left out.
const loopOf = (form: LoopForm): Loop => {
  const epics = form.epics
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  return { run: form.run, ...(form.every.trim() ? { every: form.every.trim() } : {}), ...(epics.length ? { epics } : {}) }
}
const sameLoop = (a: Loop | null | undefined, b: Loop) => JSON.stringify(loopOf(loopForm(a))) === JSON.stringify(b)

// Each choice: its title, one line, and the steps a task takes.
export const AUTOPILOT_MODES: Record<Mode, { title: string; line: string; steps: string[] }> = {
  off: {
    title: 'Off: you deliver',
    line: 'Avoozl lists ready tasks and runs the checks when you report one done.',
    steps: ['You pick a task', 'You or your chat codes it', 'You land it'],
  },
  autopilot: {
    title: 'Autopilot: Avoozl delivers',
    line: 'About once a minute the tick starts ready tasks. Stop the line or Defer pauses them.',
    steps: ['Tick finds a ready task', 'Claims it', 'Worker chat codes it', 'Checks', 'Reviewer', 'Lands it and ticks the task'],
  },
}

// A task's steps as one wrapping row of chips. Spans, since it sits inside
// the choice's label.
function Steps({ steps }: { steps: string[] }) {
  return (
    <span role="list" data-autopilot-steps className="mt-1 flex flex-wrap items-center gap-1 text-xs">
      {steps.map((step, index) => (
        <span key={step} role="listitem" className="inline-flex items-center gap-1">
          {index > 0 && (
            <span aria-hidden="true" style={{ color: 'var(--muted)' }}>
              →
            </span>
          )}
          <span className="rounded px-1.5 py-0.5" style={{ border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
            {step}
          </span>
        </span>
      ))}
    </span>
  )
}

const CONFIRM: Record<Mode, ConfirmCopy> = {
  autopilot: {
    title: 'Turn on Autopilot?',
    body: "Avoozl turns on delivery in .avoozl.json and writes loop to this machine's config. The tick then starts ready tasks in worker chats, with the agents and models set in Settings › Models. Stop the line or Defer pauses them.",
    action: 'Turn on Autopilot',
    primary: true,
  },
  off: {
    title: 'Turn off Autopilot?',
    body: "Avoozl removes loop from this machine's config. The tick here starts and lands nothing until Autopilot is on again. You take and land tasks yourself.",
    action: 'Turn off Autopilot',
    primary: true,
  },
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
  // The workspace's landing.pr; null is unset (draft).
  const [pr, setPr] = useState<PrMode | null>(null)
  const [form, setForm] = useState<LoopForm>(loopForm(null))
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  const [modeError, setModeError] = useState<string | null>(null)
  const [turning, setTurning] = useState(false)
  const confirm = useConfirm()
  useEffect(() => {
    if (!value) return
    setPr(value.landingPr ?? null)
    setForm(loopForm(value.loop))
  }, [value])
  const prDirty = Boolean(value) && pr !== (value?.landingPr ?? null)
  // The loop saves here only while it is on; while off, picking Autopilot
  // writes it.
  const loopDirty = Boolean(value?.loop) && !sameLoop(value?.loop, loopOf(form))
  const dirty = prDirty || loopDirty
  const save = async () => {
    if (!value) return
    setMessage(null)
    try {
      await run('delivery.settings.update', { expectedHash: value.hash, ...(prDirty ? { landingPr: pr } : {}), ...(loopDirty ? { loop: loopOf(form) } : {}) })
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
  if (!value)
    return (
      <Hint as="p" size="sm">
        Loading…
      </Hint>
    )
  const mode: Mode = value.on && value.loop ? 'autopilot' : 'off'
  // Turning on writes the delivery section (an empty one, every key at its
  // default, when it is missing) and this machine's loop from the fields
  // below; turning off removes the loop. Each asks once first.
  const pick = async (next: Mode) => {
    if (next === mode || turning) return
    if (!(await confirm(CONFIRM[next]))) return
    setTurning(true)
    setModeError(null)
    try {
      await run(
        'delivery.settings.update',
        next === 'autopilot' ? { delivery: {}, expectedHash: value.hash, turnOn: true, loop: loopOf(form) } : { expectedHash: value.hash, loop: null },
      )
      await reload()
    } catch (caught) {
      setModeError(errorMessage(caught))
    } finally {
      setTurning(false)
    }
  }
  return (
    <Stack gap={3} data-delivery-settings data-autopilot={mode}>
      <Card flex flexCol gap="4">
        <Section title="Who delivers" blurb="Whether Avoozl starts and lands ready tasks on its own. Only a person changes this.">
          <RadioFold
            name="avoozl-autopilot"
            label="Who delivers"
            value={mode}
            onChange={(next) => void pick(next)}
            sections={(['off', 'autopilot'] as const).map((key) => ({
              key,
              title: AUTOPILOT_MODES[key].title,
              line: AUTOPILOT_MODES[key].line,
              preview: <Steps steps={AUTOPILOT_MODES[key].steps} />,
            }))}
          />
          {turning && (
            <Hint as="p" size="sm">
              Saving…
            </Hint>
          )}
          {modeError && (
            <ErrorText role="alert" size="sm">
              {modeError}
            </ErrorText>
          )}
          <AskForHelp
            workspaceId={workspaceId}
            help={{
              page: 'Settings › Autopilot',
              section: 'Who delivers',
              says: `Autopilot is ${mode === 'autopilot' ? 'on' : 'off'} on this machine. ${AUTOPILOT_MODES[mode].line}`,
              settings: [
                { key: 'delivery', value: value.on ? 'set' : 'not set' },
                { key: 'loop', value: value.loop ? JSON.stringify(value.loop) : 'not set on this machine' },
                { key: 'saved in', value: ".avoozl.json and this machine's config, through this page" },
              ],
              docs: 'docs/delivery.md, section Turning Autopilot on',
            }}
          />
        </Section>
        <Section level="sub" title="This machine's loop" blurb="What the tick on this machine takes, and how often. Saved in this machine's config, never in .avoozl.json.">
          {!value.loop && (
            <Hint as="p" size="sm" data-autopilot-loop-note>
              Written when you pick Autopilot.
            </Hint>
          )}
          {value.loopError && (
            <ErrorText role="alert" size="sm">
              {value.loopError}
            </ErrorText>
          )}
          <Stack gap={3} data-autopilot-loop>
            <Stack gap={2} role="group" aria-labelledby="avoozl-loop-run">
              <span id="avoozl-loop-run" className="text-sm font-medium">
                Run
              </span>
              {RUN_KINDS.map((kind) => (
                <CheckRow
                  key={kind.key}
                  label={kind.label}
                  help={kind.help}
                  raw={`loop.run: ${kind.key}`}
                  checked={form.run.includes(kind.key)}
                  onChange={(on) => {
                    setMessage(null)
                    setForm({ ...form, run: on ? [...new Set([...form.run, kind.key])] : form.run.filter((k) => k !== kind.key) })
                  }}
                />
              ))}
            </Stack>
            {form.run.includes('epics') && (
              <Field id="avoozl-loop-epics" label="Epics" raw="loop.epics" width="md" help="Spec names, separated by commas.">
                <Input
                  id="avoozl-loop-epics"
                  value={form.epics}
                  placeholder="rewrite-v3"
                  onChange={(e: { target: { value: string } }) => setForm({ ...form, epics: e.target.value })}
                />
              </Field>
            )}
            <Field id="avoozl-loop-every" label="Every" raw="loop.every" width="sm" help="Least time between two passes, like 30s, 1m or 2h." note="Blank: every tick.">
              <Input id="avoozl-loop-every" value={form.every} placeholder="1m" onChange={(e: { target: { value: string } }) => setForm({ ...form, every: e.target.value })} />
            </Field>
          </Stack>
        </Section>
        <Section level="sub" title="Who merges" blurb="How Avoozl opens pull requests for pr landing, and who merges them. A repository's Landing tab can override this.">
          {mode === 'off' && (
            <Hint as="p" size="sm" data-autopilot-off-note>
              Used when Autopilot is on.
            </Hint>
          )}
          <div id="avoozl-delivery-pr">
            <RadioFold
              name="avoozl-delivery-pr"
              label="Who merges"
              value={pr ?? 'draft'}
              onChange={(next) => {
                setMessage(null)
                setPr(next)
              }}
              sections={PR_MODES.map((prMode) => ({
                key: prMode,
                title: `${PR_MODE_TEXT[prMode].title} (landing.pr: ${prMode})`,
                line: `${PR_MODE_TEXT[prMode].line}${!pr && prMode === 'draft' ? ' Not set; this is the default.' : ''}`,
              }))}
            />
          </div>
        </Section>
      </Card>
      <SaveFooter
        dirty={dirty}
        error={message?.error}
        ok={message?.ok}
        note={loopDirty ? "Writes landing.pr in .avoozl.json and loop in this machine's config." : 'Writes landing.pr in .avoozl.json.'}
        onSave={() => void save()}
        onDiscard={() => {
          setMessage(null)
          setPr(value.landingPr ?? null)
          setForm(loopForm(value.loop))
        }}
      />
    </Stack>
  )
}
