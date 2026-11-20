// Settings > Delivery (R54.8): who merges pull requests (the workspace's
// landing.pr, R119; a repository's Landing tab may override it). The
// worker's agent and model are in Settings › Models (R98.7). Saves write
// `landing.pr` in .avoozl.json through delivery.settings.update with the
// file's hash.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Card } from './ui/Card'
import { SaveFooter } from './SaveFooter.tsx'
import { Section } from './SettingsView.tsx'
import { AskForHelp, useConfirm } from './ui/controls.tsx'
import { useRead } from './useRead.ts'
import { COMMAND_PATH, errorMessage } from './workspace-api.ts'
import type { DeliverySettings as Settings } from './delivery-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { RadioFold } from './ui/RadioFold.tsx'
import { PR_MODES, PR_MODE_TEXT } from './settings-api.ts'

type PrMode = (typeof PR_MODES)[number]

const OFF_BLURB = 'The tick starts no ready task until delivery is on. Its pull request settings show here then.'

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
  return (
    <Stack gap={3} data-delivery-settings>
      <Card flex flexCol gap="4">
        <Section title="Who merges" blurb="How Avoozl opens pull requests for pr landing, and who merges them. A repository's Landing tab can override this.">
          <div id="avoozl-delivery-pr">
            <RadioFold
              name="avoozl-delivery-pr"
              label="Who merges"
              value={pr ?? 'draft'}
              onChange={(next) => {
                setMessage(null)
                setPr(next)
              }}
              sections={PR_MODES.map((mode) => ({
                key: mode,
                title: `${PR_MODE_TEXT[mode].title} (landing.pr: ${mode})`,
                line: `${PR_MODE_TEXT[mode].line}${!pr && mode === 'draft' ? ' Not set; this is the default.' : ''}`,
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
