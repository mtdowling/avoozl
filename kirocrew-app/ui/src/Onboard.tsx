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
import { Modal } from './Modal.tsx'
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

const BADGE: Record<string, CSSProperties> = {
  create: { color: 'var(--ok)', borderColor: 'var(--ok)' },
  change: { color: 'var(--accent)', borderColor: 'var(--accent)' },
  keep: { color: 'var(--muted)', borderColor: 'var(--border)' },
}
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
    <dl className="grid gap-x-3 gap-y-1 text-sm" style={{ gridTemplateColumns: 'max-content minmax(0, 1fr)' }}>
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <Hint as="dt">{label}</Hint>
          <dd className="min-w-0" style={{ overflowWrap: 'anywhere' }}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Done({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-sm" data-step-done>
      <Check size={14} aria-hidden="true" style={{ color: 'var(--ok)' }} />
      {children}
    </p>
  )
}

function ModeStep(props: { form: OnboardForm; set: (patch: Partial<OnboardForm>) => void; found: FolderFacts; problem: string | null }) {
  const { form, found, set } = props
  const noGitHub = found.github ? null : found.remote ? `${found.remote} is not a GitHub remote.` : 'This folder has no GitHub remote.'
  return (
    <div className="flex flex-col gap-3 text-sm" data-onboard-mode>
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
            <div className="flex flex-col gap-1 text-sm">
              <Hint as="p" size="xs">Use it when: {card.useWhen.join('; ')}.</Hint>
              <Facts rows={card.facts.map(([k, v]) => [k, v] as [string, ReactNode])} />
            </div>
          ),
          fields:
            card.mode === 'plans-repo' ? (
              <Stack gap={2}>
                <fieldset className="flex flex-col gap-1">
                  <legend className="text-sm">This folder is</legend>
                  {(
                    [
                      [true, 'The planning repository', 'Specs and issues live here. It must be private.'],
                      [false, 'A code repository', 'Code and pull requests live here; specs live in the planning repository.'],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <label key={label} className="flex items-start gap-2">
                      <input type="radio" name="avoozl-onboard-role" className="mt-1" checked={form.isPlanning === value} onChange={() => set({ isPlanning: value })} />
                      <span>
                        {label}
                        <Hint size="xs" block>{hint}</Hint>
                      </span>
                    </label>
                  ))}
                </fieldset>
                {!form.isPlanning && (
                  <label className="flex flex-col gap-1" style={{ maxWidth: '22rem' }}>
                    <span>
                      Planning repository <Hint size="xs">(required)</Hint>
                    </span>
                    <Input value={form.planningRepository} placeholder="acme/plans" onChange={(e: Change) => set({ planningRepository: e.target.value })} />
                    <code className="text-[11px] text-muted">github.planningRepository</code>
                  </label>
                )}
              </Stack>
            ) : undefined,
        }))}
      />
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 15rem))' }}>
        <label className="flex flex-col gap-1">
          <span>
            Short ID <Hint size="xs">(required)</Hint>
          </span>
          <Input value={form.id} placeholder="my-service" disabled={Boolean(found.registered)} onChange={(e: Change) => set({ id: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>
            Branch tasks land on <Hint size="xs">(required)</Hint>
          </span>
          <Input value={form.baseBranch} placeholder={found.baseBranch} disabled={Boolean(found.registered)} onChange={(e: Change) => set({ baseBranch: e.target.value })} />
        </label>
      </div>
      {props.problem && (
        <ErrorText role="alert" size="sm">
          {props.problem}
        </ErrorText>
      )}
    </div>
  )
}

function CheckStep({ result }: { result: SetupResult | null }) {
  if (!result) return <Hint as="p" size="sm">Reading GitHub…</Hint>
  const groups = groupWrites(result.writes)
  const kept = result.steps.filter((s) => !result.writes.some((w) => w.step === s.id) && s.status !== 'failed')
  const failed = result.steps.filter((s) => s.status === 'failed')
  return (
    <div className="flex flex-col gap-3 text-sm" data-onboard-check>
      {result.writes.length === 0 && <Done>Nothing to create or change on GitHub.</Done>}
      {groups.map((group) => (
        <section key={group.key}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{group.title}</h4>
          <ul className="mt-1 flex flex-col gap-1">
            {group.writes.map((write, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <Pill kind={writeBadge(write)} />
                <span>
                  {write.object} <code>{write.name}</code>
                  {write.visibility ? ` (${write.visibility})` : ''} in {write.owner}
                </span>
                <span className="w-full pl-12 text-xs text-muted">{write.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {kept.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Already there</h4>
          <ul className="mt-1 flex flex-col gap-1">
            {kept.map((step) => (
              <li key={step.id} className="flex flex-wrap items-baseline gap-2">
                <Pill kind="keep" />
                <span>{step.title}</span>
                {step.notes[0] && <span className="w-full pl-12 text-xs text-muted">{step.notes[0]}</span>}
              </li>
            ))}
          </ul>
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
          <summary className="cursor-pointer text-xs text-muted">The .avoozl.json change Set up would save</summary>
          <pre className="mt-1 overflow-auto rounded border p-2 text-xs" style={{ borderColor: 'var(--border)' }}>
            {result.settings.diff}
          </pre>
        </details>
      )}
    </div>
  )
}

function OnboardDialog(props: { workspaceId: string; folder: string; client: OnboardClient; onClose: (note?: string) => void; onChanged: () => Promise<unknown>; onOpenPlans?: () => void }) {
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
  const steps: StepKey[] = (form ? onboardSteps(form, found) : (['mode', 'setup', 'import', 'finish'] as StepKey[])).filter((key): key is Exclude<StepKey, 'folder'> => key !== 'folder')
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
          if (failed.length) throw Error(`${failed.length} GitHub change${failed.length === 1 ? '' : 's'} failed: ${failed.map((f) => `${f.action} ${f.name}${f.reason ? ` (${f.reason})` : ''}`).join('; ')}`)
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
      setScan(await client.scan(workspaceId, shown.map((s) => s.name)))
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
      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Steps">
        {steps.map((key, i) => (
          <li key={key} aria-current={key === step ? 'step' : undefined} className={`inline-flex items-center gap-1 ${key === step ? 'font-semibold' : 'text-muted'}`}>
            {isDone(key) && <Check size={11} aria-label="done" style={{ color: 'var(--ok)' }} />}
            {i + 1}. {ONBOARD_STEPS.find((s) => s.key === key)!.title}
          </li>
        ))}
      </ol>
      <div>
        <Hint id="avoozl-onboard-line" as="p" size="sm">
          {text.line}
        </Hint>
      </div>
      {!form && !error && <Hint as="p" size="sm">Reading the folder…</Hint>}
      {step === 'mode' && form && found && <ModeStep form={form} set={set} found={found} problem={problem} />}
      {step === 'check' && <CheckStep result={check} />}
      {step === 'setup' && (
        <ol className="flex flex-col gap-2 text-sm" data-onboard-setup>
          {planned.map((write, i) => (
            <li key={write.key} className="flex items-start gap-2">
              <span className="w-5 flex-none text-right text-muted">{i + 1}.</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {write.done || setupDone ? <Check size={13} aria-label="done" style={{ color: 'var(--ok)' }} /> : null}
                  {write.title}
                  {write.confirm && !write.done && !setupDone && <Badge variant="warning">asks first</Badge>}
                </span>
                <Hint size="xs" block>{write.detail}</Hint>
              </span>
            </li>
          ))}
        </ol>
      )}
      {step === 'import' && (
        <div className="flex flex-col gap-2 text-sm" data-onboard-import>
          {shown.length === 0 && <Hint as="p">No spec folders here for this mode. Write one with Plan a goal, or add one under .kiro/specs/ and come back.</Hint>}
          {shown.length > 0 && shown.every(imported) && <Done>Every spec here is imported.</Done>}
          <ul className="flex flex-col gap-1.5">
            {shown.map((spec) => (
              <li key={spec.name} className="flex flex-wrap items-center gap-2" data-onboard-spec={spec.name}>
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
              </li>
            ))}
          </ul>
          {shown.some((s) => s.counts.error > 0) && <Hint as="p" size="xs">A draft with lint errors imports, but Specs won&apos;t approve it until they are fixed.</Hint>}
        </div>
      )}
      {step === 'scan' && (
        <div className="flex flex-col gap-2 text-sm" data-onboard-scan>
          {!scan && <Hint as="p">Scanning…</Hint>}
          {scan && findings.length === 0 && <Done>No secrets, local paths or content-rule matches in {scan.items.length} spec{scan.items.length === 1 ? '' : 's'}.</Done>}
          {findings.length > 0 && (
            <>
              <ErrorText role="alert">
                {findings.length} finding{findings.length === 1 ? '' : 's'}. Fix each line, then scan again. The next step waits until none are left.
              </ErrorText>
              <Stack as="ul" gap={1}>
                {findings.map((f, i) => (
                  <li key={i} className="text-xs">
                    <code>
                      {f.spec}/{f.file}:{f.line}
                    </code>{' '}
                    <Hint>
                      {f.set} {f.rule ?? ''}
                    </Hint>
                    <span className="block">{f.message}</span>
                  </li>
                ))}
              </Stack>
            </>
          )}
        </div>
      )}
      {step === 'issues' && (
        <div className="flex flex-col gap-3 text-sm" data-onboard-issues>
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
                <h4 className="font-semibold">
                  <code>{name}</code>
                </h4>
                {preview.blocked?.length ? (
                  <Hint as="p" size="xs">Not previewed until lint passes: {preview.blocked[0].message}</Hint>
                ) : (
                  <>
                    <Hint as="p" size="xs">
                      Approving would create {sum.create.length} issue{sum.create.length === 1 ? '' : 's'}
                      {sum.update.length ? `, update ${sum.update.length}` : ''}
                      {sum.other ? `, and make ${sum.other} label, link or board changes` : ''}.
                    </Hint>
                    <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                      {sum.create.slice(0, 8).map((w, i) => (
                        <li key={i}>
                          <Pill kind="create" /> {w.title} <Hint>in {w.repository}</Hint>
                        </li>
                      ))}
                      {sum.create.length > 8 && <Hint as="li">and {sum.create.length - 8} more</Hint>}
                    </ul>
                  </>
                )}
              </section>
            )
          })}
        </div>
      )}
      {step === 'finish' && (
        <div className="flex flex-col gap-2 text-sm" data-onboard-finish>
          {written.length ? (
            <ul className="list-disc pl-5">
              {written.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <Hint as="p">Nothing needed changing.</Hint>
          )}
          <Hint as="p" size="xs">Nothing was approved, no agent was started and nothing was pushed. Approve each draft in Specs when you are ready.</Hint>
        </div>
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
export default function SetupRepository(props: { workspaceId: string; folder: string; onChanged: () => Promise<unknown>; onClose: (note?: string) => void; onOpenPlans?: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => onboardClient(api), [api])
  return <OnboardDialog workspaceId={props.workspaceId} folder={props.folder} client={client} onChanged={props.onChanged} onClose={props.onClose} onOpenPlans={props.onOpenPlans} />
}
