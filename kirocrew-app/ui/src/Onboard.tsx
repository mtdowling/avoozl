// Settings > Repository setup > Set up GitHub and import specs: a stepped
// dialog for a repository that was just added (Add repository picked its
// folder). Pick mode, check GitHub, set up, import specs, leak scan (public
// repositories), preview issues, finish. Steps that do not apply are left out; steps
// already satisfied show as done and can be skipped. Cancel is on every
// step. Nothing is written before Set up, each GitHub write there asks
// first, and the flow never approves a plan, starts an agent or pushes.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import { useConfirm } from './ui/controls.tsx'
import { Check, GitBranch, Laptop, Lock } from './icons.ts'
import { RadioFold } from './ui/RadioFold.tsx'
import { MODE_CARDS, groupWrites, writeBadge, type GitHubSettings, type SetupResult } from './settings-api.ts'
import type { SpecList } from './plans-api.ts'
import { errorMessage } from './workspace-api.ts'
import { Modal } from './ui/Modal.tsx'
import {
  ONBOARD_STEPS,
  folderSpecs,
  imported,
  issueSummary,
  modeProblem,
  onboardClient,
  onboardForm,
  onboardSteps,
  registerInput,
  scanFindings,
  setupRequest,
  setupWrites,
  type FolderFacts,
  type IssuePreview,
  type OnboardClient,
  type OnboardForm,
  type OnboardMode,
  type ScanResult,
  type StepKey,
} from './onboarding-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Switch } from './ui/Switch'
import { Box } from './ui/Box'
import { PlainInput } from './ui/Plain'
import { BADGE } from './ui/looks/Onboard.ts'
import { Glyph } from './ui/Glyph'

const MODE_ICONS = { local: Laptop, 'plans-repo': Lock, 'single-repo': GitBranch } as const
type Change = { target: { value: string } }

function Pill({ kind }: { kind: string }) {
  return (
    <span className="rounded-full border px-1.5 text-[10px] font-semibold" style={BADGE[kind] ?? BADGE.keep}>
      {kind}
    </span>
  )
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <Box as="dl" css-grid-template-columns="max-content-minmax-0-1fr" grid gapX="3" gapY="1" size="sm">
      {rows.map(([label, value]) => (
        <Box key={label} contents>
          <Hint as="dt">{label}</Hint>
          <Box as="dd" css-overflow-wrap="anywhere" minW0>
            {value}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function Done({ children }: { children: ReactNode }) {
  return (
    <Box as="p" flex items="center" gap="1.5" size="sm" data-step-done>
      <Glyph icon={Check} size={14} aria-hidden="true" css-color="ok" />
      {children}
    </Box>
  )
}

function ModeStep(props: { form: OnboardForm; set: (patch: Partial<OnboardForm>) => void; found: FolderFacts; problem: string | null }) {
  const { form, found, set } = props
  const noGitHub = found.github ? null : found.remote ? `${found.remote} is not a GitHub remote.` : 'This folder has no GitHub remote.'
  return (
    <Box flex flexCol gap="3" size="sm" data-onboard-mode>
      <RadioFold<OnboardMode>
        name="avoozl-onboard-mode"
        label="Mode"
        value={form.mode}
        onChange={(mode) => set({ mode })}
        sections={MODE_CARDS.map((card) => ({
          key: card.mode as OnboardMode,
          title: card.title,
          line: card.line,
          icon: MODE_ICONS[card.mode],
          disabled: card.mode === 'local' ? null : noGitHub,
          description: (
            <Box flex flexCol gap="1" size="sm">
              <Hint as="p" size="xs">
                Use it when: {card.useWhen.join('; ')}.
              </Hint>
              <Facts rows={card.facts.map(([k, v]) => [k, v] as [string, ReactNode])} />
            </Box>
          ),
          fields:
            card.mode === 'plans-repo' ? (
              <Stack gap={2}>
                <Box as="fieldset" flex flexCol gap="1">
                  <Box as="legend" size="sm">
                    This folder is
                  </Box>
                  {(
                    [
                      [true, 'The planning repository', 'Specs and issues live here. It must be private.'],
                      [false, 'A code repository', 'Code and pull requests live here; specs live in the planning repository.'],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <Box key={label} as="label" flex items="start" gap="2">
                      <PlainInput type="radio" name="avoozl-onboard-role" mt="1" checked={form.isPlanning === value} onChange={() => set({ isPlanning: value })} />
                      <span>
                        {label}
                        <Hint size="xs" block>
                          {hint}
                        </Hint>
                      </span>
                    </Box>
                  ))}
                </Box>
                {!form.isPlanning && (
                  <Box as="label" css-max-width="22rem" flex flexCol gap="1">
                    <span>
                      Planning repository <Hint size="xs">(required)</Hint>
                    </span>
                    <Input value={form.planningRepository} placeholder="acme/plans" onChange={(e: Change) => set({ planningRepository: e.target.value })} />
                    <Box as="code" size="11" tone="muted">
                      github.planningRepository
                    </Box>
                  </Box>
                )}
              </Stack>
            ) : undefined,
        }))}
      />
      <Box css-grid-template-columns="repeat-auto-fill-minmax-12rem-15rem" grid gap="2">
        <Box as="label" flex flexCol gap="1">
          <span>
            Short ID <Hint size="xs">(required)</Hint>
          </span>
          <Input value={form.id} placeholder="my-service" disabled={Boolean(found.registered)} onChange={(e: Change) => set({ id: e.target.value })} />
        </Box>
        <Box as="label" flex flexCol gap="1">
          <span>
            Branch tasks land on <Hint size="xs">(required)</Hint>
          </span>
          <Input value={form.baseBranch} placeholder={found.baseBranch} disabled={Boolean(found.registered)} onChange={(e: Change) => set({ baseBranch: e.target.value })} />
        </Box>
      </Box>
      {props.problem && (
        <ErrorText role="alert" size="sm">
          {props.problem}
        </ErrorText>
      )}
    </Box>
  )
}

function CheckStep({ result }: { result: SetupResult | null }) {
  if (!result)
    return (
      <Hint as="p" size="sm">
        Reading GitHub…
      </Hint>
    )
  const groups = groupWrites(result.writes)
  const kept = result.steps.filter((s) => !result.writes.some((w) => w.step === s.id) && s.status !== 'failed')
  const failed = result.steps.filter((s) => s.status === 'failed')
  return (
    <Box flex flexCol gap="3" size="sm" data-onboard-check>
      {result.writes.length === 0 && <Done>Nothing to create or change on GitHub.</Done>}
      {groups.map((group) => (
        <section key={group.key}>
          <Box as="h4" size="xs" weight="semibold" uppercase trackingWide tone="muted">
            {group.title}
          </Box>
          <Box as="ul" mt="1" flex flexCol gap="1">
            {group.writes.map((write, i) => (
              <Box key={i} as="li" flex flexWrap items="baseline" gap="2">
                <Pill kind={writeBadge(write)} />
                <span>
                  {write.object} <code>{write.name}</code>
                  {write.visibility ? ` (${write.visibility})` : ''} in {write.owner}
                </span>
                <Box as="span" wFull pl="12" size="xs" tone="muted">
                  {write.detail}
                </Box>
              </Box>
            ))}
          </Box>
        </section>
      ))}
      {kept.length > 0 && (
        <section>
          <Box as="h4" size="xs" weight="semibold" uppercase trackingWide tone="muted">
            Already there
          </Box>
          <Box as="ul" mt="1" flex flexCol gap="1">
            {kept.map((step) => (
              <Box key={step.id} as="li" flex flexWrap items="baseline" gap="2">
                <Pill kind="keep" />
                <span>{step.title}</span>
                {step.notes[0] && (
                  <Box as="span" wFull pl="12" size="xs" tone="muted">
                    {step.notes[0]}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </section>
      )}
      {failed.map((step) => (
        <ErrorText key={step.id} role="alert" size="sm">
          {step.title}: {step.reason}
          {step.fix ? (
            <>
              {' '}
              Fix: <code>{step.fix}</code>
            </>
          ) : null}
        </ErrorText>
      ))}
      {result.settings.changed && (
        <details>
          <Box as="summary" cursorPointer size="xs" tone="muted">
            The .avoozl.json change Set up would save
          </Box>
          <Box as="pre" css-border-color="border" mt="1" overflow="auto" rounded="base" border="all" p="2" size="xs">
            {result.settings.diff}
          </Box>
        </details>
      )}
    </Box>
  )
}

function OnboardDialog(props: {
  workspaceId: string
  folder: string
  client: OnboardClient
  onClose: (note?: string) => void
  onChanged: () => Promise<unknown>
  onOpenPlans?: () => void
}) {
  const { workspaceId, client, onClose, folder } = props
  const ask = useConfirm()
  const [step, setStep] = useState<StepKey>('mode')
  const [found, setFound] = useState<FolderFacts | null>(null)
  const [settings, setSettings] = useState<GitHubSettings | null>(null)
  const [planningRegistered, setPlanningRegistered] = useState(false)
  const [form, setForm] = useState<OnboardForm | null>(null)
  const [check, setCheck] = useState<SetupResult | null>(null)
  const [written, setWritten] = useState<string[]>([])
  const [setupDone, setSetupDone] = useState(false)
  const [specs, setSpecs] = useState<SpecList | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [previews, setPreviews] = useState<Record<string, IssuePreview | { error: string }>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const steps: StepKey[] = (form ? onboardSteps(form, found) : (['mode', 'setup', 'import', 'finish'] as StepKey[])).filter(
    (key): key is Exclude<StepKey, 'folder'> => key !== 'folder',
  )
  const at = steps.indexOf(step)
  const text = ONBOARD_STEPS.find((s) => s.key === step)!
  const wrote = written.length > 0
  const cancel = useCallback(() => {
    onClose(wrote ? `Stopped. Done so far: ${written.join('; ')}.` : 'Cancelled. Nothing was written.')
  }, [onClose, wrote, written])
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input:not([disabled]), button')?.focus()
  }, [step])
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
  const go = (key: StepKey) => {
    setError(null)
    setStep(key)
  }
  const next = () => go(steps[Math.min(steps.length - 1, at + 1)])
  const back = () => go(steps[Math.max(0, at - 1)])
  const set = (patch: Partial<OnboardForm>) => setForm((current) => (current ? { ...current, ...patch } : current))

  // Read the folder, the workspace's settings and its repositories.
  const look = () =>
    call(async () => {
      const [facts, current, repositories] = await Promise.all([client.inspect(workspaceId, folder), client.settings(workspaceId), client.repositories(workspaceId)])
      setFound(facts)
      setSettings(current)
      setPlanningRegistered(repositories.items.some((r) => r.planning && r.id !== facts.registered?.id))
      setForm(onboardForm(facts, current))
    })
  useEffect(() => {
    void look()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Step 3: the read-only Set up GitHub preview.
  const checkGitHub = () =>
    call(async () => {
      if (!form || !found) return
      setCheck(null)
      setCheck(await client.checkGitHub(workspaceId, setupRequest(form, found, settings)))
    })
  useEffect(() => {
    if (step === 'check' && !check) void checkGitHub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])
  const planned = form && found ? setupWrites(form, found, settings, check) : []
  // Step 4: each write in order; a GitHub write asks first.
  const setUp = () =>
    call(async () => {
      if (!form || !found) return
      let result = check
      for (const write of planned) {
        if (write.done) continue
        if (write.confirm && !(await ask(write.confirm))) {
          setError(`Stopped before “${write.title}”. Nothing after it was written.`)
          return
        }
        if (write.key === 'github' && result) {
          result = await client.applyGitHub(workspaceId, setupRequest(form, found, settings), result.previewHash)
          setCheck(result)
          const failed = (result.results ?? []).filter((r) => r.status !== 'done')
          setWritten((list) => [...list, `made ${(result!.results ?? []).length - failed.length} GitHub changes`])
          if (failed.length)
            throw Error(
              `${failed.length} GitHub change${failed.length === 1 ? '' : 's'} failed: ${failed.map((f) => `${f.action} ${f.name}${f.reason ? ` (${f.reason})` : ''}`).join('; ')}`,
            )
        }
        if (write.key === 'settings') {
          const fresh = await client.settings(workspaceId)
          const github = form.mode === 'local' ? { ...fresh.github, mode: 'local' } : result!.settings.github
          const saved = await client.saveSettings(workspaceId, github, form.mode === 'local' ? fresh.hash : result!.settings.expectedHash)
          setSettings(saved)
          setWritten((list) => [...list, 'saved .avoozl.json'])
        }
        if (write.key === 'register') {
          await client.register(workspaceId, registerInput(form, found, planningRegistered))
          setWritten((list) => [...list, `added ${form.id.trim()}`])
        }
      }
      const facts = await client.inspect(workspaceId, found.root)
      setFound(facts)
      setSpecs(await client.specs(workspaceId).catch(() => null))
      await props.onChanged()
      setSetupDone(true)
      next()
    })
  const shown = found ? folderSpecs(specs, found) : []
  useEffect(() => {
    if (step === 'import') setPicked(new Set(shown.filter((s) => !imported(s)).map((s) => s.name)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, specs])
  const importPicked = () =>
    call(async () => {
      for (const name of picked) {
        await client.importSpec(workspaceId, name)
        setWritten((list) => [...list, `imported ${name} as a draft`])
      }
      setSpecs(await client.specs(workspaceId))
      await props.onChanged()
    })
  const runScan = () =>
    call(async () => {
      setScan(null)
      setScan(
        await client.scan(
          workspaceId,
          shown.map((s) => s.name),
        ),
      )
    })
  useEffect(() => {
    if (step === 'scan') void runScan()
    if (step === 'issues')
      void call(async () => {
        const drafts = shown.filter((s) => s.plan && !s.plan.approved)
        const entries = await Promise.all(
          drafts.map(async (s) => [s.name, await client.previewIssues(workspaceId, s.plan!.id).catch((e: unknown) => ({ error: errorMessage(e) }))] as const),
        )
        setPreviews(Object.fromEntries(entries))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])
  const findings = scanFindings(scan)
  const problem = step === 'mode' && form && found ? modeProblem(form, found) : null
  const checkFailed = step === 'check' && check ? check.steps.some((s) => s.status === 'failed') && check.writes.length === 0 : false
  const setupLeft = setupDone ? [] : planned.filter((w) => !w.done)
  const isDone = (key: StepKey) =>
    (key === 'mode' && typeof (settings?.github as { mode?: unknown } | undefined)?.mode === 'string') ||
    (key === 'check' && Boolean(check) && check!.writes.length === 0) ||
    (key === 'setup' && (setupDone || (Boolean(form) && setupLeft.length === 0))) ||
    (key === 'import' && shown.length > 0 && shown.every(imported))
  return (
    // Esc, Back and a click outside do what Cancel does.
    <Modal
      id="avoozl-onboard"
      width="44rem"
      backLabel="Cancel"
      dismissLabel="Cancel"
      describedBy="avoozl-onboard-line"
      boxRef={box}
      attrs={{ 'data-onboard-dialog': step }}
      title={text.title}
      onDismiss={cancel}
      footer={
        <>
          {at > 0 && step !== 'finish' && steps[at - 1] !== 'setup' && (
            <Btn type="button" onClick={back} disabled={busy}>
              Back
            </Btn>
          )}
          {step === 'mode' && (
            <Btn type="button" primary onClick={next} disabled={busy || Boolean(problem)}>
              Next
            </Btn>
          )}
          {step === 'check' && (
            <>
              <Btn type="button" onClick={() => void checkGitHub()} disabled={busy}>
                Recheck
              </Btn>
              <Btn type="button" primary onClick={next} disabled={busy || !check || checkFailed}>
                Next
              </Btn>
            </>
          )}
          {step === 'setup' &&
            (setupLeft.length ? (
              <Btn type="button" primary onClick={() => void setUp()} disabled={busy}>
                Set up
              </Btn>
            ) : (
              <Btn type="button" primary onClick={next} disabled={busy}>
                Next
              </Btn>
            ))}
          {step === 'import' && (
            <>
              {picked.size > 0 && (
                <Btn type="button" onClick={() => void importPicked()} disabled={busy}>
                  Import {picked.size} as draft{picked.size === 1 ? '' : 's'}
                </Btn>
              )}
              <Btn type="button" primary onClick={next} disabled={busy}>
                {shown.length && !shown.every(imported) && picked.size ? 'Skip import' : 'Next'}
              </Btn>
            </>
          )}
          {step === 'scan' && (
            <>
              <Btn type="button" onClick={() => void runScan()} disabled={busy}>
                Scan again
              </Btn>
              <Btn type="button" primary onClick={next} disabled={busy || !scan || findings.length > 0}>
                Next
              </Btn>
            </>
          )}
          {step === 'issues' && (
            <Btn type="button" primary onClick={next} disabled={busy}>
              Next
            </Btn>
          )}
          {step === 'finish' && props.onOpenPlans && (
            <Btn
              type="button"
              primary
              onClick={() => {
                onClose(written.length ? `Onboarded: ${written.join('; ')}.` : undefined)
                props.onOpenPlans!()
              }}
            >
              Approve in Specs
            </Btn>
          )}
        </>
      }
    >
      <Box as="ol" flex flexWrap gapX="3" gapY="1" size="xs" aria-label="Steps">
        {steps.map((key, i) => (
          <Box
            key={key}
            aria-current={key === step ? 'step' : undefined}
            as="li"
            inlineFlex
            items="center"
            gap="1"
            weight={key === step ? 'semibold' : undefined}
            tone={key === step ? undefined : 'muted'}
          >
            {isDone(key) && <Glyph icon={Check} size={11} aria-label="done" css-color="ok" />}
            {i + 1}. {ONBOARD_STEPS.find((s) => s.key === key)!.title}
          </Box>
        ))}
      </Box>
      <div>
        <Hint id="avoozl-onboard-line" as="p" size="sm">
          {text.line}
        </Hint>
      </div>
      {!form && !error && (
        <Hint as="p" size="sm">
          Reading the folder…
        </Hint>
      )}
      {step === 'mode' && form && found && <ModeStep form={form} set={set} found={found} problem={problem} />}
      {step === 'check' && <CheckStep result={check} />}
      {step === 'setup' && (
        <Box as="ol" flex flexCol gap="2" size="sm" data-onboard-setup>
          {planned.map((write, i) => (
            <Box key={write.key} as="li" flex items="start" gap="2">
              <Box as="span" w5 flexNone align="right" tone="muted">
                {i + 1}.
              </Box>
              <Box as="span" minW0 flex1>
                <Box as="span" flex items="center" gap="1.5">
                  {write.done || setupDone ? <Glyph icon={Check} size={13} aria-label="done" css-color="ok" /> : null}
                  {write.title}
                  {write.confirm && !write.done && !setupDone && <Badge variant="warning">asks first</Badge>}
                </Box>
                <Hint size="xs" block>
                  {write.detail}
                </Hint>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {step === 'import' && (
        <Box flex flexCol gap="2" size="sm" data-onboard-import>
          {shown.length === 0 && <Hint as="p">No spec folders here for this mode. Write one with Plan a goal, or add one under .kiro/specs/ and come back.</Hint>}
          {shown.length > 0 && shown.every(imported) && <Done>Every spec here is imported.</Done>}
          <Box as="ul" flex flexCol gap="1.5">
            {shown.map((spec) => (
              <Box key={spec.name} as="li" flex flexWrap items="center" gap="2" data-onboard-spec={spec.name}>
                <Switch
                  label={`Import ${spec.name}`}
                  disabled={imported(spec)}
                  checked={imported(spec) || picked.has(spec.name)}
                  onChange={(on) => {
                    const nextPicked = new Set(picked)
                    if (on) nextPicked.add(spec.name)
                    else nextPicked.delete(spec.name)
                    setPicked(nextPicked)
                  }}
                />
                <code>{spec.name}</code>
                <Hint size="xs">{spec.taskCount} tasks</Hint>
                {spec.counts.error > 0 ? (
                  <Badge variant="warning">
                    {spec.counts.error} lint error{spec.counts.error === 1 ? '' : 's'}
                  </Badge>
                ) : (
                  <Badge>lint clean{spec.counts.warning ? `, ${spec.counts.warning} warnings` : ''}</Badge>
                )}
                {spec.plan && <Badge>{spec.plan.approved ? 'approved' : 'draft'}</Badge>}
              </Box>
            ))}
          </Box>
          {shown.some((s) => s.counts.error > 0) && (
            <Hint as="p" size="xs">
              A draft with lint errors imports, but Specs won&apos;t approve it until they are fixed.
            </Hint>
          )}
        </Box>
      )}
      {step === 'scan' && (
        <Box flex flexCol gap="2" size="sm" data-onboard-scan>
          {!scan && <Hint as="p">Scanning…</Hint>}
          {scan && findings.length === 0 && (
            <Done>
              No secrets, local paths or content-rule matches in {scan.items.length} spec{scan.items.length === 1 ? '' : 's'}.
            </Done>
          )}
          {findings.length > 0 && (
            <>
              <ErrorText role="alert">
                {findings.length} finding{findings.length === 1 ? '' : 's'}. Fix each line, then scan again. The next step waits until none are left.
              </ErrorText>
              <Stack as="ul" gap={1}>
                {findings.map((f, i) => (
                  <Box key={i} as="li" size="xs">
                    <code>
                      {f.spec}/{f.file}:{f.line}
                    </code>{' '}
                    <Hint>
                      {f.set} {f.rule ?? ''}
                    </Hint>
                    <Box as="span" block>
                      {f.message}
                    </Box>
                  </Box>
                ))}
              </Stack>
            </>
          )}
        </Box>
      )}
      {step === 'issues' && (
        <Box flex flexCol gap="3" size="sm" data-onboard-issues>
          {shown.filter((s) => s.plan && !s.plan.approved).length === 0 && <Hint as="p">No draft specs to preview. Import a spec first.</Hint>}
          {Object.entries(previews).map(([name, preview]) => {
            if ('error' in preview)
              return (
                <ErrorText key={name} role="alert" size="sm">
                  {name}: {preview.error}
                </ErrorText>
              )
            const sum = issueSummary(preview)
            return (
              <section key={name} data-onboard-preview={name}>
                <Box as="h4" weight="semibold">
                  <code>{name}</code>
                </Box>
                {preview.blocked?.length ? (
                  <Hint as="p" size="xs">
                    Not previewed until lint passes: {preview.blocked[0].message}
                  </Hint>
                ) : (
                  <>
                    <Hint as="p" size="xs">
                      Approving would create {sum.create.length} issue{sum.create.length === 1 ? '' : 's'}
                      {sum.update.length ? `, update ${sum.update.length}` : ''}
                      {sum.other ? `, and make ${sum.other} label, link or board changes` : ''}.
                    </Hint>
                    <Box as="ul" mt="1" flex flexCol gap="0.5" size="xs">
                      {sum.create.slice(0, 8).map((w, i) => (
                        <li key={i}>
                          <Pill kind="create" /> {w.title} <Hint>in {w.repository}</Hint>
                        </li>
                      ))}
                      {sum.create.length > 8 && <Hint as="li">and {sum.create.length - 8} more</Hint>}
                    </Box>
                  </>
                )}
              </section>
            )
          })}
        </Box>
      )}
      {step === 'finish' && (
        <Box flex flexCol gap="2" size="sm" data-onboard-finish>
          {written.length ? (
            <Box as="ul" listDisc pl="5">
              {written.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </Box>
          ) : (
            <Hint as="p">Nothing needed changing.</Hint>
          )}
          <Hint as="p" size="xs">
            Nothing was approved, no agent was started and nothing was pushed. Approve each draft in Specs when you are ready.
          </Hint>
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

// What Add repository's follow-up opens for one added repository: the steps
// after the folder. `folder` is the repository's checkout.
export default function SetupRepository(props: {
  workspaceId: string
  folder: string
  onChanged: () => Promise<unknown>
  onClose: (note?: string) => void
  onOpenPlans?: () => void
}) {
  const api = useAppApi()
  const client = useMemo(() => onboardClient(api), [api])
  return <OnboardDialog workspaceId={props.workspaceId} folder={props.folder} client={client} onChanged={props.onChanged} onClose={props.onClose} onOpenPlans={props.onOpenPlans} />
}
