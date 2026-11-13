// From template in New spec (design §4.16, Requirement 61.6–61.7): the
// approved templates by title and description, the picked one's inputs as
// fields, and its settings as the pack preview with Import these settings
// unticked. A file input is read here, in the page, at most 200 KB; nothing
// reads a path typed into a field. The parent owns the values.
import { useEffect, useMemo, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Input } from '@kirocrew/app-sdk/ui'
import { PackChanges } from './PackImport.tsx'
import { pluginsClient, type PackPreview } from './plugins-api.ts'
import { errorMessage, type Repository } from './workspace-api.ts'
import { readInputFile, type TemplateInput, type TemplateSummary } from './notes-api.ts'

const fieldStyle = {
  borderColor: 'var(--border)',
  color: 'var(--text)',
  background: 'var(--card, transparent)',
}

export const templateKey = (t: Pick<TemplateSummary, 'plugin' | 'id'>) => `${t.plugin}/${t.id}`

export type InputValues = Record<string, string | string[]>

function InputField(props: {
  input: TemplateInput
  value: string | string[] | undefined
  repositories: Repository[]
  epics: { id: string; title: string }[]
  tried: boolean
  onChange: (value: string | string[]) => void
}) {
  const { input } = props
  const id = `avoozl-template-input-${input.id}`
  const [file, setFile] = useState<{ name: string; size: number } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const empty = Array.isArray(props.value) ? !props.value.length : !String(props.value ?? '').trim()
  const missing = props.tried && input.required && empty
  const label = (
    <span className="font-medium">
      {input.label} <span className="font-normal text-muted">({input.required ? 'required' : 'optional'})</span>
    </span>
  )
  if (input.type === 'repositories')
    return (
      <fieldset className="flex flex-col gap-1 text-sm" data-template-input={input.id}>
        <legend>{label}</legend>
        {props.repositories.map((repo) => {
          const chosen = Array.isArray(props.value) ? props.value : []
          return (
            <label key={repo.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chosen.includes(repo.id)}
                onChange={(event) => props.onChange(event.target.checked ? [...chosen, repo.id] : chosen.filter((v) => v !== repo.id))}
              />
              <span>{repo.name || repo.id}</span>
            </label>
          )
        })}
        {missing && <span className="text-xs text-danger">Pick at least one repository.</span>}
      </fieldset>
    )
  return (
    <div className="flex flex-col gap-1 text-sm" data-template-input={input.id}>
      <label htmlFor={id}>{label}</label>
      {input.type === 'choice' ? (
        <select
          id={id}
          value={String(props.value ?? '')}
          onChange={(event) => props.onChange(event.target.value)}
          className="rounded border px-2 py-1 text-sm"
          style={{ ...fieldStyle, maxWidth: '24rem' }}
        >
          <option value="">Choose…</option>
          {(input.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : input.type === 'file' ? (
        <>
          <input
            id={id}
            type="file"
            accept=".md,.txt,.json,.csv,text/*"
            onChange={(event) => {
              const picked = event.target.files?.[0]
              setProblem(null)
              if (!picked) return
              readInputFile(picked).then(
                (text) => {
                  setFile({ name: picked.name, size: picked.size })
                  props.onChange(text)
                },
                (caught: unknown) => {
                  setFile(null)
                  props.onChange('')
                  setProblem(errorMessage(caught))
                },
              )
            }}
            className="text-sm"
          />
          <span className="text-xs text-muted">
            {file
              ? `${file.name}, ${Math.ceil(file.size / 1024)} KB, read here and sent as text.`
              : 'Read here as text, at most 200 KB. Avoozl never opens a path you type.'}
          </span>
          {problem && <span className="text-xs text-danger">{problem}</span>}
        </>
      ) : (
        <>
          <Input
            id={id}
            value={String(props.value ?? '')}
            list={input.type === 'epic' ? `${id}-list` : undefined}
            onChange={(event: { target: { value: string } }) => props.onChange(event.target.value)}
            style={{ maxWidth: '24rem' }}
            aria-invalid={missing}
          />
          {input.type === 'epic' && (
            <datalist id={`${id}-list`}>
              {props.epics.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.title}
                </option>
              ))}
            </datalist>
          )}
        </>
      )}
      {missing && <span className="text-xs text-danger">Fill in {input.label}.</span>}
    </div>
  )
}

export function TemplateStart(props: {
  workspaceId: string
  templates: TemplateSummary[] | null
  picked: string | null
  onPick: (key: string) => void
  values: InputValues
  onValues: (values: InputValues) => void
  repositories: Repository[]
  epics: { id: string; title: string }[]
  tried: boolean
  importSettings: boolean
  onImportSettings: (on: boolean) => void
  onPreview: (preview: PackPreview | null) => void
}) {
  const api = useAppApi()
  const plugins = useMemo(() => pluginsClient(api), [api])
  const template = props.templates?.find((t) => templateKey(t) === props.picked) ?? null
  const [preview, setPreview] = useState<PackPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const { onPreview } = props
  useEffect(() => {
    setPreview(null)
    setPreviewError(null)
    onPreview(null)
    if (!template?.settings) return
    let live = true
    plugins.templatePackPreview(props.workspaceId, template.plugin, template.id).then(
      (found) => {
        if (!live) return
        setPreview(found)
        onPreview(found)
      },
      (caught: unknown) => live && setPreviewError(errorMessage(caught)),
    )
    return () => {
      live = false
    }
  }, [plugins, props.workspaceId, template?.plugin, template?.id, template?.settings, onPreview])

  if (props.templates === null) return <p className="text-sm text-muted">Reading templates…</p>
  if (!props.templates.length)
    return <p className="text-sm text-muted">No templates yet. A template comes in a plugin: add and approve one in Settings › Plugins.</p>
  return (
    <div className="flex flex-col gap-3" data-template-start>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">Template</legend>
        {props.templates.map((t) => (
          <label
            key={templateKey(t)}
            className="flex items-start gap-2 rounded border p-2"
            style={{
              borderColor: props.picked === templateKey(t) ? 'var(--accent)' : 'var(--border)',
            }}
          >
            <input
              type="radio"
              name="avoozl-template"
              className="mt-1"
              checked={props.picked === templateKey(t)}
              onChange={() => props.onPick(templateKey(t))}
            />
            <span className="flex flex-col">
              <span className="font-medium">{t.title}</span>
              <span className="text-xs text-muted">{t.description}</span>
              {t.phases.length > 0 && <span className="text-xs text-muted">Phases: {t.phases.map((p) => p.title).join(', ')}</span>}
            </span>
          </label>
        ))}
        {props.tried && !template && <span className="text-xs text-danger">Pick a template.</span>}
      </fieldset>
      {template &&
        template.inputs.map((input) => (
          <InputField
            key={input.id}
            input={input}
            value={props.values[input.id]}
            repositories={props.repositories}
            epics={props.epics}
            tried={props.tried}
            onChange={(value) => props.onValues({ ...props.values, [input.id]: value })}
          />
        ))}
      {template?.settings && (
        <section
          className="flex flex-col gap-2 rounded border p-3 text-sm"
          style={{ borderColor: 'var(--border)' }}
          aria-label="Template settings"
          data-template-settings
        >
          <h4 className="font-medium">Settings this template suggests</h4>
          <p className="text-xs text-muted">Picking a template changes no setting. Tick the box to copy these into .avoozl.json when you submit.</p>
          {preview ? (
            <PackChanges preview={preview} />
          ) : previewError ? (
            <p className="text-xs text-danger">{previewError}</p>
          ) : (
            <p className="text-xs text-muted">Reading…</p>
          )}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={props.importSettings}
              disabled={!preview}
              onChange={(event) => props.onImportSettings(event.target.checked)}
              data-import-settings
            />
            <span>Import these settings</span>
          </label>
        </section>
      )}
    </div>
  )
}
