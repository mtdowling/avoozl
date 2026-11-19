// Send to Issue Radar (design §8.5, R52), stepped like Set up GitHub: pick a
// crew, check the label and issues, then the result. Nothing is written
// before the last step's button. Cancel, Esc and a click outside close it
// on every step before then. On a public repository it says to add the
// content hook to the crew's agent first; sending stays the person's act.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Btn } from './ui/Btn'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import { Check, CircleAlert, Radar, X } from './icons.ts'
import { ICON } from './ui/controls.tsx'
import { crewLine, radarClient, type CrewList, type HandOffInput, type HandOffReply, type UntriagedItem } from './untriaged-api.ts'
import { errorMessage } from './workspace-api.ts'
import { Modal } from './ui/Modal.tsx'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { TextLink } from './ui/TextLink'
import { Box } from './ui/Box'
import { PlainInput } from './ui/Plain'
import { Glyph } from './ui/Glyph'

type Client = ReturnType<typeof radarClient>

// The one line a public repository's dialog shows, and the command it names.
export const PUBLIC_LINE = "This repository is public. The crew writes with your GitHub login. Add avoozl content hook to the crew's agent first."
export const HOOK_COMMAND = 'avoozl content hook'

const STEPS = [
  ['Pick a crew', 'A crew works the open issues that carry a label it watches. Avoozl adds that label.'],
  ['Check the label', 'Avoozl adds this one label to each issue, with your GitHub login. Nothing is written until you press Add label.'],
  ['Sent', 'A crew picks an issue on its own next turn. Follow it under With Issue Radar.'],
] as const

export function SendToRadar(props: { workspaceId: string; client: Client; items: UntriagedItem[]; repository: string; onClose: (note?: string) => void; onSent: () => void }) {
  const { workspaceId, client, items, repository } = props
  const [step, setStep] = useState(0)
  const [crews, setCrews] = useState<CrewList | null>(null)
  const [crewId, setCrewId] = useState<string>('')
  const [typed, setTyped] = useState('')
  const [preview, setPreview] = useState<HandOffReply | null>(null)
  const [result, setResult] = useState<HandOffReply | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const cancel = useCallback(() => props.onClose(step === 2 ? undefined : 'Cancelled. Nothing was written.'), [props, step])
  useEffect(() => {
    let live = true
    client
      .crews(workspaceId, repository)
      .then((list) => {
        if (!live) return
        setCrews(list)
        if (list.crews.length) setCrewId(list.crews[0].id)
      })
      .catch((caught) => live && setError(errorMessage(caught)))
    return () => {
      live = false
    }
  }, [client, workspaceId, repository])
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, button')?.focus()
  }, [step, crews])
  const crew = crews?.crews.find((entry) => entry.id === crewId) ?? null
  const input = (): HandOffInput => ({
    // Only GitHub issues reach this dialog (sendable), so each has a number.
    items: items.flatMap((item) => (item.number === null ? [] : [{ repository: item.repository, number: item.number }])),
    ...(crews?.available ? { crew: { id: crewId } } : { label: typed.trim() }),
  })
  const call = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const review = () =>
    call(async () => {
      setPreview(await client.preview(workspaceId, input()))
      setStep(1)
    })
  const send = () =>
    call(async () => {
      setResult(await client.send(workspaceId, input()))
      setStep(2)
      props.onSent()
    })
  const canReview = crews ? (crews.available ? Boolean(crew) : Boolean(typed.trim())) : false
  return (
    // Esc, Back and a click outside do what Cancel does, asking first once
    // a label was typed.
    <Modal
      id="avoozl-radar"
      width="36rem"
      backLabel="Cancel"
      dismissLabel="Cancel"
      describedBy="avoozl-radar-line"
      boxRef={box}
      attrs={{ 'data-radar-dialog': step }}
      unsaved={step < 2 && typed.trim() !== '' && { title: 'Stop the hand-off?', body: 'Nothing is sent. What you typed is lost.', action: 'Stop' }}
      title={
        <Box as="span" inlineFlex items="center" gap="1.5">
          <Radar size={ICON} aria-hidden="true" /> {STEPS[step][0]}
        </Box>
      }
      onDismiss={cancel}
      footer={
        <>
          {step === 1 && (
            <Btn type="button" onClick={() => setStep(0)} disabled={busy}>
              Back
            </Btn>
          )}
          {step === 0 && (
            <Btn type="button" primary data-radar-review onClick={() => void review()} disabled={busy || !canReview}>
              {busy ? 'Checking…' : 'Review'}
            </Btn>
          )}
          {step === 1 && (
            <Btn type="button" primary data-radar-send onClick={() => void send()} disabled={busy}>
              {busy ? 'Sending…' : preview?.label ? 'Add label' : 'Send'}
            </Btn>
          )}
        </>
      }
    >
      <Box as="ol" flex flexWrap gap="2" size="xs" aria-label="Steps">
        {STEPS.map(([title], i) => (
          <Box key={title} aria-current={i === step ? 'step' : undefined} as="li" weight={i === step ? 'semibold' : undefined} tone={i === step ? undefined : 'muted'}>
            {i + 1}. {title}
          </Box>
        ))}
      </Box>
      <div>
        <Hint id="avoozl-radar-line" as="p" size="sm">
          {STEPS[step][1]}
        </Hint>
      </div>
      {crews?.public && step < 2 && (
        <Box role="note" flex flexCol gap="1" size="sm" data-radar-public>
          <p>{PUBLIC_LINE}</p>
          <code data-radar-hook>{HOOK_COMMAND}</code>
        </Box>
      )}

      {step === 0 && (
        <Box flex flexCol gap="2" size="sm">
          <Hint as="p" size="xs">
            {items.length === 1 ? `#${items[0].number} ${items[0].title}` : `${items.length} issues`} in {repository}
          </Hint>
          {!crews ? (
            <Hint as="p">{error ? '' : 'Reading the crews from Issue Radar…'}</Hint>
          ) : crews.available ? (
            crews.crews.length === 0 ? (
              <p data-radar-no-crews>
                {repository} has no crew in Issue Radar.{' '}
                <TextLink href="/issue-radar" target="_top">
                  Add one in Issue Radar
                </TextLink>
                , then come back.
              </p>
            ) : (
              <Box as="fieldset" flex flexCol gap="1.5" data-radar-crews>
                <Box as="legend" srOnly>
                  Crew
                </Box>
                {crews.crews.map((entry) => (
                  <Box
                    key={entry.id}
                    as="label"
                    css-border-color={entry.id === crewId ? 'accent' : 'border'}
                    flex
                    cursorPointer
                    items="start"
                    gap="2"
                    rounded="md"
                    border="all"
                    p="2"
                  >
                    <PlainInput type="radio" name="avoozl-radar-crew" checked={entry.id === crewId} onChange={() => setCrewId(entry.id)} css-margin-top="3" />
                    <Box as="span" flex minW0 flexCol gap="0.5">
                      <Box as="span" flex flexWrap items="center" gap="1.5">
                        <Box as="span" weight="medium">
                          {entry.name}
                        </Box>
                        {entry.status && <Badge>{entry.status}</Badge>}
                        {entry.labels.map((label) => (
                          <Badge key={label} variant="info">
                            {label}
                          </Badge>
                        ))}
                      </Box>
                      <Hint size="xs">{crewLine(entry)}</Hint>
                    </Box>
                  </Box>
                ))}
              </Box>
            )
          ) : (
            <Box flex flexCol gap="1.5" data-radar-typed>
              <Hint as="p" size="xs">
                {crews.reason}
              </Hint>
              <Box as="label" flex flexCol gap="1">
                <span>
                  Label the crew watches <Hint size="xs">(required)</Hint>
                </span>
                <Input value={typed} placeholder="radar" onChange={(e: { target: { value: string } }) => setTyped(e.target.value)} />
                <Hint size="xs">Find it in Issue Radar under the crew’s Labels. A crew with no labels takes every open issue, so it needs none.</Hint>
              </Box>
            </Box>
          )}
          {crew?.emptyScope && (
            <Box role="alert" as="p" css-color="danger" flex items="start" gap="1.5" size="sm" data-radar-empty-scope>
              <Glyph icon={CircleAlert} size={ICON} aria-hidden="true" css-margin-top="3" css-flex="none" />
              {crew.name} has an empty scope, so it takes every open issue in {repository}, labeled or not. Avoozl writes no label; these move to With Issue Radar.
            </Box>
          )}
        </Box>
      )}

      {step === 1 && preview && (
        <Box flex flexCol gap="2" size="sm" data-radar-confirm>
          {preview.label ? (
            <p>
              Add label <code data-radar-label>{preview.label}</code> to {preview.items.length === 1 ? 'this issue' : `these ${preview.items.length} issues`}
              {preview.crew ? ` for ${preview.crew.name}` : ''}:
            </p>
          ) : (
            <p>No label is written. These issues move to With Issue Radar:</p>
          )}
          <Box as="ul" flex flexCol gap="0.5" data-radar-items>
            {preview.items.map((item) => (
              <li key={item.number}>
                <Box as="span" tone="muted" tabularNums>
                  #{item.number}
                </Box>{' '}
                {item.title}
              </li>
            ))}
          </Box>
          {preview.warnings.map((warning) => (
            <Box key={warning} role="alert" as="p" css-color="danger">
              {warning}
            </Box>
          ))}
          <Hint as="p" size="xs">
            To undo, remove the label on GitHub before a crew claims the issue.
          </Hint>
        </Box>
      )}

      {step === 2 && result && (
        <Box as="ul" flex flexCol gap="1" size="sm" data-radar-results>
          {(result.results ?? []).map((row) => (
            <Box key={row.number} as="li" flex items="start" gap="1.5">
              {row.ok ? (
                <Glyph icon={Check} size={ICON} aria-hidden="true" css-color="ok" css-margin-top="3" />
              ) : (
                <Glyph icon={X} size={ICON} aria-hidden="true" css-color="danger" css-margin-top="3" />
              )}
              <span>
                #{row.number} {row.ok ? (result.label ? `labeled ${result.label}` : 'recorded') : `not sent: ${row.error}`}
              </span>
            </Box>
          ))}
        </Box>
      )}

      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
    </Modal>
  )
}
