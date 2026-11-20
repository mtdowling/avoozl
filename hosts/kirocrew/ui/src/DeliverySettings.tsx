// Settings > Autopilot (R54.8): whether Avoozl delivers ready tasks on its
// own (the `delivery` block in .avoozl.json), and who merges pull requests
// (the workspace's landing.pr, R119; a repository's Landing tab may
// override it). Every setting shows whether Autopilot is on or off. The
// worker's agent and model are in Settings › Models (R98.7). Saves go
// through delivery.settings.update with the file's hash; only a person
// turns Autopilot on or off, after one confirm.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Card } from './ui/Card'
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
    body: 'The tick starts ready tasks in worker chats, about once a minute, with the agents and models set in Settings › Models. Stop the line or Defer pauses them.',
    action: 'Turn on Autopilot',
    primary: true,
  },
  off: {
    title: 'Turn off Autopilot?',
    body: 'The tick starts no ready task until Autopilot is on again. You take and land tasks yourself.',
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
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  const [modeError, setModeError] = useState<string | null>(null)
  const [turning, setTurning] = useState(false)
  const confirm = useConfirm()
  useEffect(() => {
    if (value) setPr(value.landingPr ?? null)
  }, [value])
  const dirty = Boolean(value) && pr !== (value?.landingPr ?? null)
  const save = async () => {
    if (!value) return
    setMessage(null)
    try {
      await run('delivery.settings.update', { expectedHash: value.hash, landingPr: pr })
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
  const mode: Mode = value.on ? 'autopilot' : 'off'
  // Turning on writes an empty delivery section (every key at its default);
  // turning off removes it. Each asks once first.
  const pick = async (next: Mode) => {
    if (next === mode || turning) return
    if (!(await confirm(CONFIRM[next]))) return
    setTurning(true)
    setModeError(null)
    try {
      await run('delivery.settings.update', next === 'autopilot' ? { delivery: {}, expectedHash: value.hash, turnOn: true } : { expectedHash: value.hash, turnOff: true })
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
              says: `Autopilot is ${value.on ? 'on' : 'off'}. ${AUTOPILOT_MODES[mode].line}`,
              settings: [
                { key: 'delivery', value: value.on ? 'set (Autopilot is on)' : 'not set (Autopilot is off)' },
                { key: 'saved in', value: '.avoozl.json, through this page' },
              ],
              docs: 'docs/delivery.md, section Turning Autopilot on',
            }}
          />
        </Section>
        <Section level="sub" title="Who merges" blurb="How Avoozl opens pull requests for pr landing, and who merges them. A repository's Landing tab can override this.">
          {!value.on && (
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
        note="Writes landing.pr in .avoozl.json."
        onSave={() => void save()}
        onDiscard={() => {
          setMessage(null)
          setPr(value.landingPr ?? null)
        }}
      />
    </Stack>
  )
}
