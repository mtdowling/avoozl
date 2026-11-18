// New plan: a right drawer that collects what a plan is for and hands it to Kiro
// Crew's Spec Builder, which drafts the spec folder phase by phase. The
// backend (plan.new) checks the fields, runs content rules on what is
// handed over, and writes Avoozl's steering file only after the person
// agrees here. Avoozl then writes the manifest and the folder shows in
// Plans as a draft once it lints clean. When Spec Builder is off, an Avoozl
// planner chat is the fallback. Nothing here approves a plan, starts
// delivery or pushes.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAppApi, useNavigate } from './host.ts'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import { Crosshair, ExternalLink, FileText, MessageSquare, Package } from './icons.ts'
import { RadioFold } from './RadioFold.tsx'
import { Picker } from './Picker.tsx'
import { TemplateStart, templateKey, type InputValues } from './TemplateStart.tsx'
import { missingInputs, notesClient, type TemplateSummary } from './notes-api.ts'
import { importInput, pluginsClient, type PackPreview } from './plugins-api.ts'
import { ICON } from './controls.tsx'
import { Modal } from './Modal.tsx'
import { errorMessage, workspaceClient, type Repository } from './workspace-api.ts'
import {
  EMPTY_NEW_PLAN,
  EPIC_PROBLEM,
  formProblems,
  isDirty,
  nameProblem,
  newPlanClient,
  SPEC_NAME,
  templateProblems,
  type NewPlanForm,
  type NewPlanPreview,
} from './new-plan-api.ts'
import { openSpecBuilder, specBuilderClient, specBuilderProblem } from './spec-builder-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'

// Spec Builder resolves symlinks (/tmp is /private/tmp on macOS).
const samePath = (left: string, right: string) => {
  const plain = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').replace(/^\/private(?=\/)/, '')
  return plain(left) === plain(right)
}

const fieldStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }

function Field(props: { id: string; label: string; need: 'required' | 'optional'; hint?: string; problem?: string | null; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={props.id} className="font-medium">
        {props.label} <span className="font-normal text-muted">({props.need})</span>
      </label>
      {props.children}
      {props.problem ? (
        <ErrorText id={`${props.id}-problem`} as="span" size="xs">
          {props.problem}
        </ErrorText>
      ) : (
        props.hint && <Hint size="xs">{props.hint}</Hint>
      )}
    </div>
  )
}

// The three starts: Spec Builder, a plugin's template, or a planner chat
// that writes the spec from a goal (RC30.1).
type Start = 'blank' | 'template' | 'goal'

// A picker's last choice, which turns into a field for a new name.
const NEW_CHOICE = '__new__'

export default function NewPlanDrawer(props: {
  workspaceId: string
  // Names a plan or spec folder already uses.
  taken: string[]
  categories: string[]
  // Epic folders to pick from: their folder name and title.
  epics?: { id: string; title: string }[]
  // Fields to start the form with.
  seed?: Partial<NewPlanForm>
  // Which way it opens; none picked unless said, and Submit waits for one.
  start?: Start
  onClose: (notice: string | null) => void
}) {
  const api = useAppApi()
  const client = useMemo(() => newPlanClient(api), [api])
  const navigate = useNavigate()
  const builder = useMemo(() => specBuilderClient(api), [api])
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
  // Blank, or From template (R61.7): a template's inputs, and its settings
  // imported only when ticked.
  const [start, setStart] = useState<Start | null>(props.start ?? null)
  // A picker's "New …" choice turns into a name field.
  const [newCategory, setNewCategory] = useState(false)
  const [newEpic, setNewEpic] = useState(false)
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [values, setValues] = useState<InputValues>({})
  const [importSettings, setImportSettings] = useState(false)
  const [settingsPreview, setSettingsPreview] = useState<PackPreview | null>(null)
  const onPreview = useCallback((preview: PackPreview | null) => {
    setSettingsPreview(preview)
    setImportSettings(false)
  }, [])
  const notes = useMemo(() => notesClient(api), [api])
  const plugins = useMemo(() => pluginsClient(api), [api])
  const template = templates?.find((t) => templateKey(t) === picked) ?? null
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

  useEffect(() => {
    if (start !== 'template' || templates !== null) return
    let live = true
    notes.templates(props.workspaceId).then(
      (found) => {
        if (!live) return
        setTemplates(found.templates)
        if (found.templates.length === 1) setPicked(templateKey(found.templates[0]))
      },
      (caught: unknown) => live && (setTemplates([]), setError(errorMessage(caught))),
    )
    return () => {
      live = false
    }
  }, [notes, props.workspaceId, start, templates])

  const dirty = isDirty(form) || Object.values(values).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(String(v).trim())))
  const problems =
    start === null
      ? ['Pick Blank, From template or From a goal.']
      : start === 'template'
      ? [...(template ? [] : ['Pick a template.']), ...templateProblems(form, props.taken, template ? missingInputs(template, values) : [])]
      : repositories
        ? formProblems(form, props.taken, repositories.length)
        : []
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

  // From template: import the settings only when ticked, against the exact
  // preview shown; the tick opens the planner chat the template seeds.
  const fromTemplate = () =>
    run(async () => {
      if (!template) return
      if (importSettings && settingsPreview)
        await plugins.packImport(props.workspaceId, { ...importInput(settingsPreview, false, false), template: template.id })
      const result = await client.fromTemplate(props.workspaceId, form, { plugin: template.plugin, id: template.id, version: template.version }, values)
      props.onClose(
        `Avoozl is opening a planner chat for ${result.name} from ${template.title}; find it in your chats.${importSettings ? ' Its settings were imported.' : ''} It shows here as a draft once its folder is complete; you approve it.`,
      )
    })

  const submit = () => {
    setTried(true)
    if (start === null) return
    if (start === 'template') {
      if (problems.length) return
      return fromTemplate()
    }
    if (problems.length || !repositories) return
    // From a goal: the planner chat writes the spec folder from the goal.
    if (start === 'goal') return plannerChat()
    setFallback(false)
    return run(async () => {
      const preview = await client.preview(props.workspaceId, form)
      // A missing file is asked about first; a present or changed one is left alone.
      if (preview.steering.state === 'missing' || preview.steering.state === 'older') setSteering(preview.steering)
      else await handOffNow(false)
    })
  }

  // The fallback: an Avoozl planner chat seeded with the same details. The
  // tick opens it, so Avoozl knows the model that wrote the draft (§4.29).
  const plannerChat = () =>
    run(async () => {
      const result = await client.request(props.workspaceId, form)
      props.onClose(`Avoozl is opening a planner chat for ${result.name}; find it in your chats. It shows here as a draft once its folder is complete; you approve it.`)
    })

  // Repositories, what you want, and links: Blank and From a goal share them.
  const sharedFields = (
    <>
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="font-medium">
              Repositories <span className="font-normal text-muted">(required)</span>
            </legend>
            {repositories === null ? (
              <Hint size="xs">Loading…</Hint>
            ) : repositories.length === 0 ? (
              <Hint size="xs">No repositories yet. Add one in Settings › Repositories, then come back.</Hint>
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
                  {repo.github && <Hint size="xs">{repo.github}</Hint>}
                </label>
              ))
            )}
            {tried && repositories && repositories.length > 0 && !form.repositories.length && (
              <ErrorText as="span" size="xs">Pick at least one repository.</ErrorText>
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
    </>
  )

  return (
    <Modal
      id="avoozl-new-plan"
      width="40rem"
      height="48rem"
      title="New spec"
      kind="drawer"
      backLabel="Close New spec"
      dismissLabel="Cancel"
      attrs={{ 'data-new-plan-drawer': true }}
      unsaved={dirty && { title: 'Discard this new spec?', body: 'What you typed is not saved anywhere.', action: 'Discard' }}
      onDismiss={() => {
        if (!busy) props.onClose(null)
      }}
      footer={
        <>
          {tried && start === null && (
            <span role="alert" className="mr-auto text-xs text-danger" style={{ order: -1 }} data-start-problem>
              Pick Blank, From template or From a goal.
            </span>
          )}
          <Btn type="submit" form="avoozl-new-plan-form" primary disabled={busy || start === null || repositories === null || steering !== null} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {start === 'template' || start === 'goal' ? <MessageSquare size={ICON} aria-hidden="true" /> : <ExternalLink size={ICON} aria-hidden="true" />}
            {busy ? 'Opening…' : start === 'template' || start === 'goal' ? 'Open a planner chat' : start === 'blank' ? 'Open in Spec Builder' : 'Pick how to start'}
          </Btn>
        </>
      }
    >
        <Stack
          id="avoozl-new-plan-form"
          as="form" gap={3}
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Hint as="p" size="xs">
            {start === 'template'
              ? 'An Avoozl planner chat drafts the spec from the template and what you fill in. It shows in Specs as a draft. Nothing is approved or started.'
              : start === 'goal'
                ? 'An Avoozl planner chat writes the spec from your goal: requirements, design and tasks. It shows in Specs as a draft and is approved like any spec. Nothing is started.'
                : start === 'blank'
                ? "Kiro Crew's Spec Builder drafts the spec from this: requirements, design, then tasks, each for you to review. Avoozl then writes the manifest, and the spec shows in Specs as a draft. Nothing is approved or started."
                : 'Name it, then pick how to start: Blank, From template or From a goal. It shows in Specs as a draft. Nothing is approved or started.'}
          </Hint>
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
          <Field id="avoozl-new-plan-category" need="optional" label="Category" hint="Pick one, or New category to name one. Left blank, the spec is Uncategorized.">
            <Picker
              id="avoozl-new-plan-category"
              label={<span className="sr-only">Category</span>}
              items={[...props.categories.map((c) => ({ id: c, title: c })), { id: NEW_CHOICE, title: 'New category…' }]}
              value={newCategory ? NEW_CHOICE : form.category}
              emptyLabel="Uncategorized"
              plain
              maxWidth="18rem"
              onPick={(id) => {
                setNewCategory(id === NEW_CHOICE)
                set({ category: id === NEW_CHOICE ? '' : id })
              }}
            />
            {newCategory && (
              <Input id="avoozl-new-plan-category-new" aria-label="New category" value={form.category} placeholder="Platform" onChange={(event) => set({ category: event.target.value })} style={{ maxWidth: '18rem' }} />
            )}
          </Field>
          <Field
            id="avoozl-new-plan-epic"
            need="optional"
            label="Epic"
            hint="An epic is a goal that holds several specs. Pick one, or New epic to start one. Left blank, the spec is in no epic."
            problem={form.epic.trim() && !SPEC_NAME.test(form.epic.trim()) ? EPIC_PROBLEM : null}
          >
            <Picker
              id="avoozl-new-plan-epic"
              label={<span className="sr-only">Epic</span>}
              items={[...(props.epics ?? []).map((epic) => ({ id: epic.id, title: epic.title })), { id: NEW_CHOICE, title: 'New epic…' }]}
              value={newEpic ? NEW_CHOICE : form.epic}
              emptyLabel="No epic"
              plain
              maxWidth="18rem"
              onPick={(id) => {
                setNewEpic(id === NEW_CHOICE)
                set({ epic: id === NEW_CHOICE ? '' : id })
              }}
            />
            {newEpic && (
              <Input id="avoozl-new-plan-epic-new" aria-label="New epic folder name" value={form.epic} placeholder="rewrite" onChange={(event) => set({ epic: event.target.value })} style={{ maxWidth: '18rem' }} />
            )}
          </Field>
          <RadioFold<Start>
            name="avoozl-new-plan-start"
            label="How to start"
            // Neither is picked at first; each says what it does.
            value={(start ?? '') as Start}
            onChange={(next) => {
              setStart(next)
              setTried(false)
              setError(null)
            }}
            sections={[
              {
                key: 'blank',
                title: 'Blank',
                line: "Kiro Crew's Spec Builder writes the spec with you from what you want: requirements, then design, then tasks, each for you to review. Use it for new work with no set shape.",
                icon: FileText,
                fields: (
                  <Stack gap={3}>
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
          {sharedFields}
                  </Stack>
                ),
              },
              {
                key: 'template',
                title: 'From template',
                line: "Start from a workflow template in an approved plugin. It brings its own phases, proofs and manual steps, and a planner chat fills them in. Use it when a team's way of working already exists.",
                icon: Package,
                fields: (
                  <TemplateStart
                    workspaceId={props.workspaceId}
                    templates={templates}
                    picked={picked}
                    onPick={(key) => {
                      setPicked(key)
                      setValues({})
                    }}
                    values={values}
                    onValues={setValues}
                    repositories={repositories ?? []}
                    epics={props.epics ?? []}
                    tried={tried}
                    importSettings={importSettings}
                    onImportSettings={setImportSettings}
                    onPreview={onPreview}
                  />
                ),
              },
              {
                key: 'goal',
                title: 'From a goal',
                line: 'Type the goal. An Avoozl planner chat writes the draft spec, requirements, design and tasks, and you approve it like any spec. Use it when you know the outcome but not the steps.',
                icon: Crosshair,
                fields: <Stack gap={3}>{sharedFields}</Stack>,
              },
            ]}
          />
          {steering && (
            <section aria-labelledby="avoozl-new-plan-steering" className="flex flex-col gap-2 rounded border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
              <h4 id="avoozl-new-plan-steering" className="font-medium">
                Add Avoozl&apos;s spec rules to this repository?
              </h4>
              <Hint as="p" size="xs">
                Spec Builder&apos;s chat reads steering files from the repository. This writes <code>{steering.path}</code>, which you commit. Skip it, and the rules go with this one spec instead.
              </Hint>
              <pre className="max-h-64 overflow-auto rounded border p-2 text-xs" style={{ borderColor: 'var(--border)', whiteSpace: 'pre-wrap' }} data-steering-text>
                {steering.text}
              </pre>
              <Row gap={2} align="start">
                <Btn type="button" primary disabled={busy} onClick={() => void handOff(true)}>
                  Add the file and open Spec Builder
                </Btn>
                <Btn type="button" disabled={busy} onClick={() => void handOff(false)}>
                  Skip the file
                </Btn>
              </Row>
            </section>
          )}
          {error && (
            <ErrorText role="alert" size="sm">
              {error}
            </ErrorText>
          )}
          {fallback && (
            <div>
              <Btn type="button" disabled={busy} onClick={() => void plannerChat()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={ICON} aria-hidden="true" />
                Use an Avoozl planner chat instead
              </Btn>
            </div>
          )}
        </Stack>
    </Modal>
  )
}
