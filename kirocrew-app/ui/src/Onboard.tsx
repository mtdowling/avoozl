// Settings > Repositories > Onboard: a stepped dialog styled like Add
// plugin that takes a folder to plans ready to approve. Pick folder, pick
// mode, check GitHub, set up, import specs, leak scan (public repositories),
// preview issues, finish. Steps that do not apply are left out; steps
// already satisfied show as done and can be skipped. Cancel is on every
// step. Nothing is written before Set up, each GitHub write there asks
// first, and the flow never approves a plan, starts an agent or pushes.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { IconLabel, SectionHeading, useConfirm } from './controls.tsx'
import { Check, GitBranch, Laptop, Lock, Workflow } from './icons.ts'
import { RadioFold } from './RadioFold.tsx'
import { MODE_CARDS, groupWrites, writeBadge, type GitHubSettings, type SetupResult } from './settings-api.ts'
import type { SpecList } from './plans-api.ts'
import { errorMessage } from './workspace-api.ts'
import { Shelf } from './Shelf.tsx'
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
          <dt className="text-muted">{label}</dt>
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

function FolderStep(props: { folder: string; setFolder: (v: string) => void; found: FolderFacts | null }) {
  const { found } = props
  return (
    <div className="flex flex-col gap-3 text-sm" data-onboard-folder>
      <label className="flex flex-col gap-1">
        <span>
          Folder <span className="text-xs text-muted">(required)</span>
        </span>
        <Input id="avoozl-onboard-folder" value={props.folder} placeholder="/path/to/my-service" onChange={(e: Change) => props.setFolder(e.target.value)} />
        <span className="text-xs text-muted">The checkout&apos;s folder, as an absolute path. Any folder inside it works too.</span>
      </label>
      {found && (
        <Facts
          rows={[
            ['Checkout', found.root],
            ['GitHub', found.github ? `${found.github}${found.visibility ? ` (${found.visibility})` : ''}` : found.remote ? `${found.remote} is not on GitHub` : 'No remote: local only'],
            ['Default branch', found.baseBranch],
            ['.avoozl.json', found.settingsFile ? 'Found in the checkout' : 'None in the checkout'],
            ['Specs', found.specs.length ? `${found.specs.length} in .kiro/specs: ${found.specs.join(', ')}` : 'None in .kiro/specs'],
            ['In this workspace', found.registered ? `Already added as ${found.registered.id}` : 'Not added yet'],
          ]}
        />
      )}
      {found?.githubError && <p className="text-xs text-muted">{found.githubError} Visibility is unknown, so the leak scan step is skipped.</p>}
    </div>
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
              <p className="text-xs text-muted">Use it when: {card.useWhen.join('; ')}.</p>
              <Facts rows={card.facts.map(([k, v]) => [k, v] as [string, ReactNode])} />
            </div>
          ),
          fields:
            card.mode === 'plans-repo' ? (
              <div className="flex flex-col gap-2">
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
                        <span className="block text-xs text-muted">{hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                {!form.isPlanning && (
                  <label className="flex flex-col gap-1" style={{ maxWidth: '22rem' }}>
                    <span>
                      Planning repository <span className="text-xs text-muted">(required)</span>
                    </span>
                    <Input value={form.planningRepository} placeholder="acme/plans" onChange={(e: Change) => set({ planningRepository: e.target.value })} />
                    <code className="text-[11px] text-muted">github.planningRepository</code>
                  </label>
                )}
              </div>
            ) : undefined,
        }))}
      />
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 15rem))' }}>
        <label className="flex flex-col gap-1">
          <span>
            Short ID <span className="text-xs text-muted">(required)</span>
          </span>
          <Input value={form.id} placeholder="my-service" disabled={Boolean(found.registered)} onChange={(e: Change) => set({ id: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>
            Branch tasks land on <span className="text-xs text-muted">(required)</span>
          </span>
          <Input value={form.baseBranch} placeholder={found.baseBranch} disabled={Boolean(found.registered)} onChange={(e: Change) => set({ baseBranch: e.target.value })} />
        </label>
      </div>
      {props.problem && (
        <p role="alert" className="text-sm text-danger">
          {props.problem}
        </p>
      )}
    </div>
  )
}

function CheckStep({ result }: { result: SetupResult | null }) {
  if (!result) return <p className="text-sm text-muted">Reading GitHub…</p>
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
        <p key={step.id} role="alert" className="text-sm text-danger">
          {step.title}: {step.reason}
          {step.fix ? (
            <>
              {' '}
              Fix: <code>{step.fix}</code>
            </>
          ) : null}
        </p>
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

function OnboardDialog(props: { workspaceId: string; client: OnboardClient; onClose: (note?: string) => void; onChanged: () => Promise<unknown>; onOpenPlans?: () => void }) {
  const { workspaceId, client, onClose } = props
  const ask = useConfirm()
  const [step, setStep] = useState<StepKey>('folder')
  const [folder, setFolder] = useState('')
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
  const steps = form ? onboardSteps(form, found) : (['folder', 'mode', 'setup', 'import', 'finish'] as StepKey[])
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

  // Step 1: read the folder, the workspace's settings and its repositories.
  const look = () =>
    call(async () => {
      if (!folder.trim()) throw Error('Give the checkout folder.')
      const [facts, current, repositories] = await Promise.all([client.inspect(workspaceId, folder.trim()), client.settings(workspaceId), client.repositories(workspaceId)])
      setFound(facts)
      setSettings(current)
      setPlanningRegistered(repositories.items.some((r) => r.planning && r.id !== facts.registered?.id))
      setForm(onboardForm(facts, current))
      go('mode')
    })
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
    (key === 'folder' && Boolean(found)) ||
    (key === 'check' && Boolean(check) && check!.writes.length === 0) ||
    (key === 'setup' && (setupDone || (Boolean(form) && setupLeft.length === 0))) ||
    (key === 'import' && shown.length > 0 && shown.every(imported))
  return (
    // Esc, Back and a click outside do what Cancel does, asking first once
    // a folder was entered.
    <Shelf
      id="avoozl-onboard"
      width="44rem"
      backLabel="Cancel"
      describedBy="avoozl-onboard-line"
      boxRef={box}
      attrs={{ 'data-onboard-dialog': step }}
      unsaved={folder.trim() !== '' && { title: 'Stop onboarding?', body: wrote ? `What was done stays: ${written.join('; ')}.` : 'What you entered is lost. Nothing was written.', action: 'Stop' }}
      onDismiss={cancel}
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
        <h3 id="avoozl-onboard-title" className="text-base font-semibold">
          {text.title}
        </h3>
        <p id="avoozl-onboard-line" className="text-sm text-muted">
          {text.line}
        </p>
      </div>
      {step === 'folder' && <FolderStep folder={folder} setFolder={(v) => { setFolder(v); setFound(null) }} found={found} />}
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
                <span className="block text-xs text-muted">{write.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {step === 'import' && (
        <div className="flex flex-col gap-2 text-sm" data-onboard-import>
          {shown.length === 0 && <p className="text-muted">No spec folders here for this mode. Write one with Plan a goal, or add one under .kiro/specs/ and come back.</p>}
          {shown.length > 0 && shown.every(imported) && <Done>Every spec here is imported.</Done>}
          <ul className="flex flex-col gap-1.5">
            {shown.map((spec) => (
              <li key={spec.name} className="flex flex-wrap items-center gap-2" data-onboard-spec={spec.name}>
                <input
                  type="checkbox"
                  aria-label={`Import ${spec.name}`}
                  disabled={imported(spec)}
                  checked={imported(spec) || picked.has(spec.name)}
                  onChange={(e) => {
                    const nextPicked = new Set(picked)
                    if (e.target.checked) nextPicked.add(spec.name)
                    else nextPicked.delete(spec.name)
                    setPicked(nextPicked)
                  }}
                />
                <code>{spec.name}</code>
                <span className="text-xs text-muted">{spec.taskCount} tasks</span>
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
          {shown.some((s) => s.counts.error > 0) && <p className="text-xs text-muted">A draft with lint errors imports, but Specs won&apos;t approve it until they are fixed.</p>}
        </div>
      )}
      {step === 'scan' && (
        <div className="flex flex-col gap-2 text-sm" data-onboard-scan>
          {!scan && <p className="text-muted">Scanning…</p>}
          {scan && findings.length === 0 && <Done>No secrets, local paths or content-rule matches in {scan.items.length} spec{scan.items.length === 1 ? '' : 's'}.</Done>}
          {findings.length > 0 && (
            <>
              <p role="alert" className="text-danger">
                {findings.length} finding{findings.length === 1 ? '' : 's'}. Fix each line, then scan again. The next step waits until none are left.
              </p>
              <ul className="flex flex-col gap-1">
                {findings.map((f, i) => (
                  <li key={i} className="text-xs">
                    <code>
                      {f.spec}/{f.file}:{f.line}
                    </code>{' '}
                    <span className="text-muted">
                      {f.set} {f.rule ?? ''}
                    </span>
                    <span className="block">{f.message}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {step === 'issues' && (
        <div className="flex flex-col gap-3 text-sm" data-onboard-issues>
          {shown.filter((s) => s.plan && !s.plan.approved).length === 0 && <p className="text-muted">No draft specs to preview. Import a spec first.</p>}
          {Object.entries(previews).map(([name, preview]) => {
            if ('error' in preview)
              return (
                <p key={name} role="alert" className="text-sm text-danger">
                  {name}: {preview.error}
                </p>
              )
            const sum = issueSummary(preview)
            return (
              <section key={name} data-onboard-preview={name}>
                <h4 className="font-semibold">
                  <code>{name}</code>
                </h4>
                {preview.blocked?.length ? (
                  <p className="text-xs text-muted">Not previewed until lint passes: {preview.blocked[0].message}</p>
                ) : (
                  <>
                    <p className="text-xs text-muted">
                      Approving would create {sum.create.length} issue{sum.create.length === 1 ? '' : 's'}
                      {sum.update.length ? `, update ${sum.update.length}` : ''}
                      {sum.other ? `, and make ${sum.other} label, link or board changes` : ''}.
                    </p>
                    <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                      {sum.create.slice(0, 8).map((w, i) => (
                        <li key={i}>
                          <Pill kind="create" /> {w.title} <span className="text-muted">in {w.repository}</span>
                        </li>
                      ))}
                      {sum.create.length > 8 && <li className="text-muted">and {sum.create.length - 8} more</li>}
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
            <p className="text-muted">Nothing needed changing.</p>
          )}
          <p className="text-xs text-muted">Nothing was approved, no agent was started and nothing was pushed. Approve each draft in Specs when you are ready.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Btn type="button" onClick={cancel} disabled={busy}>
          {step === 'finish' ? 'Close' : 'Cancel'}
        </Btn>
        {at > 0 && step !== 'finish' && steps[at - 1] !== 'setup' && (
          <Btn type="button" onClick={back} disabled={busy}>
            Back
          </Btn>
        )}
        {step === 'folder' && (
          <Btn type="button" primary onClick={() => void look()} disabled={busy || !folder.trim()}>
            Check folder
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
              Check again
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
      </div>
    </Shelf>
  )
}

// The box above Add repository: what Onboard does, its steps, and the button.
export default function Onboard(props: { workspaceId: string; disabled: string | null; onChanged: () => Promise<unknown>; onOpenPlans?: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => onboardClient(api), [api])
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const close = useCallback((text?: string) => {
    setOpen(false)
    setNote(text ?? null)
  }, [])
  return (
    <Card>
      <SectionHeading title="Onboard a repository" className="mb-2" />
      <p className="mt-1 text-xs text-muted">From a folder to specs ready to approve: mode, GitHub setup, spec import and an issue preview. Each GitHub write asks first.</p>
      <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {ONBOARD_STEPS.map((s, i) => (
          <li key={s.key}>
            {i + 1}. {s.title}
          </li>
        ))}
      </ol>
      <div className="mt-3">
        <IconLabel
          icon={Workflow}
          primary
          disabled={Boolean(props.disabled)}
          tooltip={props.disabled ?? 'Walk through each step. Nothing is written before Set up.'}
          onClick={() => {
            setNote(null)
            setOpen(true)
          }}
        >
          Onboard
        </IconLabel>
      </div>
      {props.disabled && <p className="mt-2 text-xs text-muted">{props.disabled}</p>}
      {note && (
        <p className="mt-2 text-xs text-muted" role="status">
          {note}
        </p>
      )}
      {open && <OnboardDialog workspaceId={props.workspaceId} client={client} onChanged={props.onChanged} onClose={close} onOpenPlans={props.onOpenPlans} />}
    </Card>
  )
}
