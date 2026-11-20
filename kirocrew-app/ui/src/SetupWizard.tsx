// Set up GitHub (design §8.2), GitHub modes only. On load it runs the
// wizard's read-only preview. The button shows only when the preview finds
// at least one change; else one "GitHub is set up" line with the time of the
// check and a quiet Recheck. A preview that can't run says why and how
// to fix it. The dialog is stepped like Add plugin: options, review the
// changes grouped with create/change/keep badges, apply, then save the
// .avoozl.json change. Cancel, Esc and a click outside close it on every
// step; before Apply nothing is written, and during Apply the backend stops
// before its next write (github.setup.cancel) and reports what was done.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Btn } from './ui/Btn'
import { Tooltip } from './ui/Tooltip.tsx'
import { IconBtn, IconLabel, ICON } from './ui/controls.tsx'
import { CircleCheck, RefreshCw, Workflow, X } from './icons.ts'
import {
  groupWrites,
  setupForm,
  setupInput,
  setupState,
  writeBadge,
  type GitHubSettings,
  type SetupForm,
  type SetupResult,
  settingsClient,
  highRisk,
  permissionsLine,
} from './settings-api.ts'
import { errorMessage } from './workspace-api.ts'
import { relativeTime } from './task-api.ts'
import { Modal } from './ui/Modal.tsx'
import { linkHref } from './views-api.ts'
import { SCOPE_RULE, SCOPE_STATEMENT } from '../../../src/work-split.mjs'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { TextLink } from './ui/TextLink'
import { Switch } from './ui/Switch'
import { Box } from './ui/Box'
import { WriteBadge } from './ui/WriteBadge'
import { Glyph } from './ui/Glyph'

type Client = ReturnType<typeof settingsClient>

// The values the workspace GitHub settings and the repository roles hold; the wizard never asks again.
export type SharedSetup = Pick<SetupForm, 'mode' | 'planningRepository' | 'repositories'>

const STEP_TEXT = [
  ['What to set up', 'Avoozl reads GitHub first. Pick the extras; the mode and repositories come from this tab.'],
  ['Check each change', 'Every write Avoozl would make on GitHub. It never deletes or renames anything.'],
  ['Making the changes', 'Avoozl makes them one at a time. Cancel stops before the next one.'],
  ['Save the settings file', 'Write the names GitHub gave back into .avoozl.json. Nothing is saved until you press Save.'],
] as const

export function SetupDialog(props: {
  workspaceId: string
  client: Client
  form: SetupForm
  set: (change: Partial<SetupForm>) => void
  first: SetupResult | null
  onClose: (note?: string) => void
  onSaved: () => Promise<unknown>
}) {
  const { workspaceId, client, form } = props
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<SetupResult | null>(props.first)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const applying = useRef<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const cancel = useCallback(() => {
    if (applying.current) {
      void client.cancelSetup(workspaceId, applying.current)
      props.onClose('Cancelled. Avoozl stops before its next write; check again to see what was made.')
    } else props.onClose(step === 3 ? undefined : 'Cancelled. Nothing was written.')
  }, [client, workspaceId, props, step])
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, button')?.focus()
  }, [])
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
      setResult(await client.setup(workspaceId, setupInput(form)))
      setStep(1)
    })
  const apply = () =>
    call(async () => {
      if (!result) return
      setStep(2)
      applying.current = result.previewHash
      try {
        // Apply is the Allow for every write listed above, with its job
        // and permissions (PC13.3): no second popup.
        const steps = highRisk(result.writes),
          allow = steps.length ? (await client.allow(workspaceId, steps)).grants : []
        setResult(await client.setup(workspaceId, { ...setupInput(form), confirm: true, previewHash: result.previewHash, allow }))
      } finally {
        applying.current = null
      }
      setStep(3)
    })
  const save = () =>
    call(async () => {
      if (!result) return
      await client.save(workspaceId, result.settings.github, result.settings.expectedHash)
      await props.onSaved()
      props.onClose('Saved to .avoozl.json.')
    })
  const groups = groupWrites(result?.writes ?? [])
  const count = result?.writes.length ?? 0
  const failed = (result?.results ?? []).filter((r) => r.status !== 'done')
  return (
    // Esc, Back and a click outside do what Cancel does. The form lives in
    // the Settings page, so closing loses nothing.
    <Modal
      id="avoozl-setup"
      width="40rem"
      backLabel="Cancel"
      dismissLabel="Cancel"
      describedBy="avoozl-setup-line"
      boxRef={box}
      attrs={{ 'data-setup-dialog': step }}
      title={STEP_TEXT[step][0]}
      onDismiss={cancel}
      footer={
        <>
          {step === 1 && (
            <Btn type="button" onClick={() => setStep(0)} disabled={busy}>
              Back
            </Btn>
          )}
          {step === 0 && (
            <Btn type="button" primary onClick={() => void review()} disabled={busy}>
              Check the changes
            </Btn>
          )}
          {step === 1 && count > 0 && (
            <Btn type="button" primary onClick={() => void apply()} disabled={busy}>
              Apply {count} change{count === 1 ? '' : 's'}
            </Btn>
          )}
          {step === 1 && count === 0 && result?.settings.changed && (
            <Btn type="button" primary onClick={() => setStep(3)}>
              Next
            </Btn>
          )}
          {step === 3 && result?.settings.changed && (
            <Btn type="button" primary onClick={() => void save()} disabled={busy || Boolean(result.settings.error)}>
              Save to .avoozl.json
            </Btn>
          )}
        </>
      }
    >
      <Box as="ol" flex flexWrap gap="2" size="xs" aria-label="Steps">
        {STEP_TEXT.map(([title], i) => (
          <Box key={title} aria-current={i === step ? 'step' : undefined} as="li" weight={i === step ? 'semibold' : undefined} tone={i === step ? undefined : 'muted'}>
            {i + 1}. {title}
          </Box>
        ))}
      </Box>
      <div>
        <Hint id="avoozl-setup-line" as="p" size="sm">
          {STEP_TEXT[step][1]}
        </Hint>
      </div>
      {step === 0 && (
        <Box flex flexCol gap="2" size="sm">
          <Hint as="p" size="xs" data-setup-shared>
            Mode {form.mode}
            {form.mode === 'plans-repo' ? `, planning repository ${form.planningRepository || 'not set'}` : ''}, repositories {form.repositories || 'none yet'}.
          </Hint>
          <Row gap={3} align="start">
            {([['epic', 'Epic issue type']] as const).map(([key, label]) => (
              <Switch key={key} label={label} gap={1.5} checked={form[key]} onChange={(on) => props.set({ [key]: on })}>
                {label}
              </Switch>
            ))}
          </Row>
        </Box>
      )}
      {step === 1 && result && (
        <Box flex flexCol gap="3" size="sm">
          {groups.length === 0 && <p>Nothing to change on GitHub.</p>}
          {groups.map((group) => (
            <section key={group.key} data-setup-group={group.key}>
              <Hint as="h4" size="xs" weight="semibold" uppercase trackingWide>
                {group.title}
              </Hint>
              <Box as="ul" mt="1" flex flexCol gap="1">
                {group.writes.map((write, i) => (
                  <Box key={i} as="li" flex flexWrap items="baseline" gap="2">
                    <WriteBadge kind={writeBadge(write)} />
                    <span>
                      {write.object} <code>{write.name}</code>
                      {write.visibility ? ` (${write.visibility})` : ''} in {write.owner}
                    </span>
                    <Hint as="span" wFull pl="12" size="xs">
                      {write.detail}
                    </Hint>
                    {write.job ? (
                      <Hint as="span" wFull pl="12" size="xs" data-setup-permissions>
                        {permissionsLine(write)}
                      </Hint>
                    ) : null}
                  </Box>
                ))}
              </Box>
            </section>
          ))}
          {result.checklist.length > 0 && (
            <section>
              <Hint as="h4" size="xs" weight="semibold" uppercase trackingWide>
                Left for you on GitHub
              </Hint>
              <Box as="ul" mt="1" listDisc pl="5" size="xs">
                {result.checklist.map((item) => (
                  <li key={item.id}>
                    {item.link ? (
                      <TextLink href={linkHref(item.link)} target="_blank" rel="noopener noreferrer">
                        {item.text}
                      </TextLink>
                    ) : (
                      item.text
                    )}
                  </li>
                ))}
              </Box>
            </section>
          )}
        </Box>
      )}
      {step === 2 && (
        <Box as="p" size="sm" role="status">
          Making {count} changes on GitHub…
        </Box>
      )}
      {step === 3 && result && (
        <Box flex flexCol gap="2" size="sm">
          <p role="status">
            Made {(result.results ?? []).filter((r) => r.status === 'done').length} of {count} changes.
          </p>
          {failed.length > 0 && (
            <Box role="alert" as="ul" size="xs" tone="danger">
              {failed.map((entry, i) => (
                <li key={i}>
                  {entry.status}: {entry.action} {entry.name}
                  {entry.reason ? ` (${entry.reason})` : ''}
                  {(entry.manual ?? []).map((line) => (
                    <Box key={line} as="span" block data-setup-manual>
                      {line}
                    </Box>
                  ))}
                </li>
              ))}
            </Box>
          )}
          {result.settings.changed ? (
            <>
              {result.settings.error && <ErrorText role="alert">{result.settings.error}</ErrorText>}
              <Box as="pre" css-border-color="border" overflow="auto" rounded="base" border="all" p="2" size="xs">
                {result.settings.diff}
              </Box>
            </>
          ) : (
            <Hint as="p">.avoozl.json already matches.</Hint>
          )}
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

export default function SetupWizard(props: { workspaceId: string; client: Client; settings: GitHubSettings; shared: SharedSetup; onSaved: () => Promise<unknown> }) {
  const { workspaceId, client, settings, shared } = props
  const [own, setForm] = useState<SetupForm>(() => setupForm(settings.github))
  const form: SetupForm = { ...own, ...shared, mode: shared.mode || own.mode }
  const [result, setResult] = useState<SetupResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [at, setAt] = useState(() => new Date().toISOString())
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const key = JSON.stringify(setupInput(form))
  const check = useCallback(async () => {
    setResult(null)
    setError(null)
    try {
      setResult(await client.setup(workspaceId, JSON.parse(key)))
    } catch (caught) {
      setError(errorMessage(caught))
    }
    setAt(new Date().toISOString())
  }, [client, workspaceId, key])
  useEffect(() => setForm(setupForm(settings.github)), [settings])
  useEffect(() => {
    void check()
  }, [check])
  const state = setupState(result, error, at)
  return (
    <Stack gap={2} data-setup-state={state.kind}>
      <Hint as="p" size="xs" data-scope-statement="">
        {SCOPE_STATEMENT} {SCOPE_RULE}
      </Hint>
      {state.kind === 'checking' && (
        <Hint as="p" size="sm">
          Checking GitHub…
        </Hint>
      )}
      {state.kind === 'set-up' && (
        <Box flex flexWrap items="center" gap="2" size="sm">
          <Glyph icon={CircleCheck} size={ICON + 2} aria-hidden="true" css-color="ok" />
          <span>GitHub is set up.</span>
          <Tooltip text={new Date(state.at).toLocaleString()}>
            <Hint size="xs">Checked {relativeTime(state.at, Date.now())}</Hint>
          </Tooltip>
          <IconBtn icon={RefreshCw} label="Recheck" tooltip="Read GitHub again. Writes nothing." onClick={() => void check()} />
        </Box>
      )}
      {state.kind === 'changes' && (
        <Box flex flexWrap items="center" gap="2" size="sm">
          <span>
            Setup found {state.count} thing{state.count === 1 ? '' : 's'} to create or change.
          </span>
          <IconLabel icon={Workflow} primary onClick={() => setOpen(true)} tooltip="Show each change first. Nothing is written until you apply.">
            Set up GitHub
          </IconLabel>
          <IconBtn icon={RefreshCw} label="Recheck" tooltip="Read GitHub again. Writes nothing." onClick={() => void check()} />
        </Box>
      )}
      {state.kind === 'error' && (
        <Box flex flexCol gap="1" size="sm" role="alert">
          <Box as="span" inlineFlex items="center" gap="1.5">
            <Glyph icon={X} size={ICON} aria-hidden="true" css-color="danger" />
            Avoozl can't check GitHub: {state.reason}
          </Box>
          {state.fix && (
            <Box as="span" size="xs">
              Fix: <code>{state.fix}</code>
            </Box>
          )}
          <span>
            <IconBtn icon={RefreshCw} label="Recheck" tooltip="Read GitHub again. Writes nothing." onClick={() => void check()} />
          </span>
        </Box>
      )}
      {note && (
        <Hint as="p" size="xs" role="status">
          {note}
        </Hint>
      )}
      {open && (
        <SetupDialog
          workspaceId={workspaceId}
          client={client}
          form={form}
          set={(change) => setForm({ ...own, ...change })}
          first={result}
          onSaved={props.onSaved}
          onClose={(text) => {
            setOpen(false)
            setNote(text ?? null)
            void check()
          }}
        />
      )}
    </Stack>
  )
}
