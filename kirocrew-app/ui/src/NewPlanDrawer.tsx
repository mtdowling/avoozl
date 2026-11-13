// New plan: a right drawer that collects a plan idea and hands it to Kiro
// Crew's Spec Builder, which drafts the spec folder phase by phase. The
// backend (plan.new) checks the fields, runs content rules on what is
// handed over, and writes Avoozl's steering file only after the person
// agrees here. Avoozl then writes the manifest and the folder shows in
// Plans as a draft once it lints clean. When Spec Builder is off, an Avoozl
// planner chat is the fallback. Nothing here approves a plan, starts
// delivery or pushes.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAppApi, useChatLauncher, useNavigate } from '@kirocrew/app-sdk'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import { ExternalLink, MessageSquare, X } from './icons.ts'
import { ICON, IconLabel, SectionHeading, useConfirm } from './controls.tsx'
import { useMedia } from './TaskDrawer.tsx'
import { trapStep } from './focus-trap.ts'
import { useBackStep } from './NavHistory.tsx'
import { errorMessage, workspaceClient, type Repository } from './workspace-api.ts'
import { EMPTY_NEW_PLAN, EPIC_PROBLEM, formProblems, isDirty, nameProblem, newPlanClient, SPEC_NAME, type NewPlanForm, type NewPlanPreview } from './new-plan-api.ts'
import { openSpecBuilder, specBuilderClient, specBuilderProblem } from './spec-builder-api.ts'

// Spec Builder resolves symlinks (/tmp is /private/tmp on macOS).
const samePath = (left: string, right: string) => {
  const plain = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').replace(/^\/private(?=\/)/, '')
  return plain(left) === plain(right)
}

const fieldStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function Field(props: { id: string; label: string; need: 'required' | 'optional'; hint?: string; problem?: string | null; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={props.id} className="font-medium">
        {props.label} <span className="font-normal text-muted">({props.need})</span>
      </label>
      {props.children}
      {props.problem ? (
        <span id={`${props.id}-problem`} className="text-xs text-danger">
          {props.problem}
        </span>
      ) : (
        props.hint && <span className="text-xs text-muted">{props.hint}</span>
      )}
    </div>
  )
}

export default function NewPlanDrawer(props: {
  workspaceId: string
  // Names a plan or spec folder already uses.
  taken: string[]
  categories: string[]
  // Epic folders to pick from: their folder name and title.
  epics?: { id: string; title: string }[]
  // Make it a spec (R63.9): fields filled from an idea, and its id.
  seed?: Partial<NewPlanForm>
  onClose: (notice: string | null) => void
}) {
  const api = useAppApi()
  const client = useMemo(() => newPlanClient(api), [api])
  const { openChat } = useChatLauncher()
  const navigate = useNavigate()
  const builder = useMemo(() => specBuilderClient(api), [api])
  const ask = useConfirm()
  const narrow = useMedia('(max-width: 767px)')
  const still = useMedia('(prefers-reduced-motion: reduce)')
  const [form, setForm] = useState<NewPlanForm>(() => ({ ...EMPTY_NEW_PLAN, ...props.seed }))
  const [repositories, setRepositories] = useState<Repository[] | null>(null)
  const [nameTouched, setNameTouched] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The steering file to ask about, once a preview found it missing.
  const [steering, setSteering] = useState<NewPlanPreview['steering'] | null>(null)
  // Spec Builder could not be reached: offer the planner chat instead.
  const [fallback, setFallback] = useState(false)
  const [shown, setShown] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const set = (change: Partial<NewPlanForm>) => {
    setForm((now) => ({ ...now, ...change }))
    // The question was about the old fields; Open in Spec Builder asks again.
    setSteering(null)
  }

  useEffect(() => {
    let live = true
    workspaceClient(api)
      .repositories(props.workspaceId)
      .then(
        (all) => {
          if (!live) return
          // The planning repository holds specs, not a plan's code.
          const items = all.filter((repo) => !repo.planning)
          setRepositories(items)
          // One repository: it is the only choice, so it starts picked.
          if (items.length === 1) set({ repositories: [items[0].id] })
        },
        (caught: unknown) => live && (setRepositories([]), setError(errorMessage(caught))),
      )
    return () => {
      live = false
    }
  }, [api, props.workspaceId])

  const dirty = isDirty(form)
  const close = async () => {
    if (busy) return
    if (dirty && !(await ask({ title: 'Discard this new spec?', body: 'What you typed is not saved anywhere.', action: 'Discard' }))) return
    props.onClose(null)
  }
  const closeRef = useRef(close)
  closeRef.current = close
  // Esc and Back ask first when something was typed, like Cancel.
  useBackStep('drawer', true, 'Close New spec', () => void closeRef.current())

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => {
      setShown(true)
      panel.current?.querySelector<HTMLElement>('#avoozl-new-plan-name')?.focus()
    })
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('[data-confirm-dialog]')) return
      if (event.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const next = trapStep(items.length, items.indexOf(document.activeElement as HTMLElement), event.shiftKey)
      if (next < 0) return
      event.preventDefault()
      items[next].focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [])

  const problems = repositories ? formProblems(form, props.taken, repositories.length) : []
  const nameIssue = nameTouched || tried ? nameProblem(form.name, props.taken) : null

  const run = async (step: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await step()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  // Record the request, then create the spec in Spec Builder and open it.
  const handOffNow = async (writeSteering: boolean) => {
      const handoff = await client.specBuilder(props.workspaceId, form, writeSteering)
      setSteering(null)
      let created
      try {
        created = await builder.create(handoff.specBuilder)
      } catch (caught) {
        const problem = specBuilderProblem(caught)
        setFallback(problem.fallback)
        setError(problem.message)
        return
      }
      const elsewhere = created.spec_dir && !samePath(created.spec_dir, handoff.folder)
      props.onClose(
        elsewhere
          ? `Spec Builder made ${handoff.name} in ${created.spec_dir}, but Avoozl reads ${handoff.folder}. Clear Spec Builder's base path setting, or move the folder.`
          : `Spec Builder is drafting ${handoff.name}. Avoozl writes its manifest after tasks.md, and it shows here as a draft; you approve it.`,
      )
      openSpecBuilder(handoff.name, navigate)
  }
  const handOff = (writeSteering: boolean) => run(() => handOffNow(writeSteering))

  const submit = () => {
    setTried(true)
    if (problems.length || !repositories) return
    setFallback(false)
    return run(async () => {
      const preview = await client.preview(props.workspaceId, form)
      // A missing file is asked about first; a present or changed one is left alone.
      if (preview.steering.state === 'missing' || preview.steering.state === 'older') setSteering(preview.steering)
      else await handOffNow(false)
    })
  }

  // The fallback: an Avoozl planner chat seeded with the same details.
  const plannerChat = () =>
    run(async () => {
      const result = await client.request(props.workspaceId, form)
      openChat({ message: result.message, agent: result.agent, autoSend: true })
      props.onClose(`A planner chat is drafting ${result.name}. It shows here as a draft once its folder is complete; you approve it.`)
    })

  return (
    <div className="fixed inset-0 z-50" style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div
        aria-hidden="true"
        data-drawer-backdrop
        onClick={() => void close()}
        className="absolute inset-0"
        style={{ background: 'color-mix(in srgb, var(--text) 25%, transparent)' }}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avoozl-new-plan-title"
        data-new-plan-drawer
        className="relative flex h-full flex-col border-l shadow-lg outline-none"
        style={{
          width: narrow ? '100%' : 'min(36rem, 92vw)',
          background: 'var(--card, var(--bg))',
          color: 'var(--text)',
          borderColor: 'var(--border)',
          transform: shown || still ? 'none' : 'translateX(100%)',
          transition: still ? 'none' : 'transform 180ms ease-out',
        }}
      >
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <SectionHeading
            level={2}
            id="avoozl-new-plan-title"
            title="New spec"
            actions={
              <IconLabel icon={X} onClick={() => void close()} aria-label="Close New spec">
                Close
              </IconLabel>
            }
          />
        </div>
        <form
          id="avoozl-new-plan-form"
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <p className="text-xs text-muted">
            Kiro Crew&apos;s Spec Builder drafts the spec from this: requirements, design, then tasks, each for you to review. Avoozl then writes the manifest, and the spec shows in Specs as a draft. Nothing is approved or started.
          </p>
          <Field id="avoozl-new-plan-name" need="required" label="Name" hint="Becomes the spec folder name: lowercase letters, digits and hyphens." problem={nameIssue}>
            <Input
              id="avoozl-new-plan-name"
              value={form.name}
              placeholder="cache-invalidation"
              aria-invalid={Boolean(nameIssue)}
              aria-describedby={nameIssue ? 'avoozl-new-plan-name-problem' : undefined}
              onChange={(event) => set({ name: event.target.value })}
              onBlur={() => setNameTouched(true)}
              style={{ maxWidth: '24rem' }}
            />
          </Field>
          <Field id="avoozl-new-plan-category" need="optional" label="Category" hint="Pick one or type a new one. Left blank, the spec is Uncategorized.">
            <Input
              id="avoozl-new-plan-category"
              list="avoozl-new-plan-categories"
              value={form.category}
              onChange={(event) => set({ category: event.target.value })}
              style={{ maxWidth: '18rem' }}
            />
            <datalist id="avoozl-new-plan-categories">
              {props.categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>
          <Field
            id="avoozl-new-plan-epic"
            need="optional"
            label="Epic"
            hint="Pick an epic, a goal that spans specs. Left blank, the spec is in no epic."
            problem={form.epic.trim() && !SPEC_NAME.test(form.epic.trim()) ? EPIC_PROBLEM : null}
          >
            <Input
              id="avoozl-new-plan-epic"
              value={form.epic}
              list="avoozl-new-plan-epic-list"
              placeholder="rewrite"
              onChange={(event) => set({ epic: event.target.value })}
              style={{ maxWidth: '18rem' }}
            />
            <datalist id="avoozl-new-plan-epic-list">
              {(props.epics ?? []).map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.title}
                </option>
              ))}
            </datalist>
          </Field>
          <Field id="avoozl-new-plan-phases" need="optional" label="Phases" hint="One per line; each becomes a heading in tasks.md. Left blank, the planner picks them.">
            <textarea
              id="avoozl-new-plan-phases"
              rows={3}
              value={form.phases}
              onChange={(event) => set({ phases: event.target.value })}
              className="rounded border px-2 py-1 text-sm"
              style={fieldStyle}
            />
          </Field>
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="font-medium">
              Repositories <span className="font-normal text-muted">(required)</span>
            </legend>
            {repositories === null ? (
              <span className="text-xs text-muted">Loading…</span>
            ) : repositories.length === 0 ? (
              <span className="text-xs text-muted">No repositories yet. Add one in Settings › Repositories, then come back.</span>
            ) : (
              repositories.map((repo) => (
                <label key={repo.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.repositories.includes(repo.id)}
                    onChange={(event) =>
                      set({ repositories: event.target.checked ? [...form.repositories, repo.id] : form.repositories.filter((id) => id !== repo.id) })
                    }
                  />
                  <span>{repo.name || repo.id}</span>
                  {repo.github && <span className="text-xs text-muted">{repo.github}</span>}
                </label>
              ))
            )}
            {tried && repositories && repositories.length > 0 && !form.repositories.length && (
              <span className="text-xs text-danger">Pick at least one repository.</span>
            )}
          </fieldset>
          <Field id="avoozl-new-plan-goal" need="required" label="What you want" hint="The planner's first prompt: the goal, who it is for, and what done looks like." problem={tried && !form.goal.trim() ? 'Say what you want.' : null}>
            <textarea
              id="avoozl-new-plan-goal"
              rows={6}
              value={form.goal}
              onChange={(event) => set({ goal: event.target.value })}
              className="rounded border px-2 py-1 text-sm"
              style={fieldStyle}
            />
          </Field>
          <Field id="avoozl-new-plan-context" need="optional" label="Links and context" hint="Files, issues and notes the planner should read.">
            <textarea
              id="avoozl-new-plan-context"
              rows={4}
              value={form.context}
              onChange={(event) => set({ context: event.target.value })}
              className="rounded border px-2 py-1 text-sm"
              style={fieldStyle}
            />
          </Field>
          {steering && (
            <section aria-labelledby="avoozl-new-plan-steering" className="flex flex-col gap-2 rounded border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
              <h4 id="avoozl-new-plan-steering" className="font-medium">
                Add Avoozl&apos;s spec rules to this repository?
              </h4>
              <p className="text-xs text-muted">
                Spec Builder&apos;s chat reads steering files from the repository. This writes <code>{steering.path}</code>, which you commit. Skip it, and the rules go with this one spec instead.
              </p>
              <pre className="max-h-64 overflow-auto rounded border p-2 text-xs" style={{ borderColor: 'var(--border)', whiteSpace: 'pre-wrap' }} data-steering-text>
                {steering.text}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Btn type="button" primary disabled={busy} onClick={() => void handOff(true)}>
                  Add the file and open Spec Builder
                </Btn>
                <Btn type="button" disabled={busy} onClick={() => void handOff(false)}>
                  Skip the file
                </Btn>
              </div>
            </section>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {fallback && (
            <div>
              <Btn type="button" disabled={busy} onClick={() => void plannerChat()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={ICON} aria-hidden="true" />
                Use an Avoozl planner chat instead
              </Btn>
            </div>
          )}
        </form>
        <div className="flex items-center gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <Btn type="submit" form="avoozl-new-plan-form" primary disabled={busy || repositories === null || steering !== null} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ExternalLink size={ICON} aria-hidden="true" />
            {busy ? 'Opening…' : 'Open in Spec Builder'}
          </Btn>
          <Btn type="button" onClick={() => void close()} disabled={busy}>
            Cancel
          </Btn>
        </div>
      </div>
    </div>
  )
}
