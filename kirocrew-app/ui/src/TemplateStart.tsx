// From template in New spec (design §4.16, Requirement 61.6–61.7): the
// approved templates by title and description, the picked one's inputs as
// fields, and its settings as the pack preview with Import these settings
// unticked. A file input is read here, in the page, at most 200 KB; nothing
// reads a path typed into a field. The parent owns the values.
import { useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Input } from './ui/Input'
import { PackChanges } from './PackImport.tsx'
import { pluginsClient, type PackPreview } from './plugins-api.ts'
import { errorMessage, type Repository } from './workspace-api.ts'
import { readInputFile, type TemplateInput, type TemplateSummary } from './notes-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { SelectField } from './ui/SelectField'
import { Switch } from './ui/Switch'
import { Box } from './ui/Box'

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
    <Box as="span" weight="medium">
      {input.label} <Box as="span" weight="normal" tone="muted">({input.required ? 'required' : 'optional'})</Box>
    </Box>
  )
  if (input.type === 'repositories')
    return (
      <Box as="fieldset" flex flexCol gap="1" size="sm" data-template-input={input.id}>
        <legend>{label}</legend>
        {props.repositories.map((repo) => {
          const chosen = Array.isArray(props.value) ? props.value : []
          return (
            <Switch key={repo.id} label={repo.name || repo.id} checked={chosen.includes(repo.id)} onChange={(on) => props.onChange(on ? [...chosen, repo.id] : chosen.filter((v) => v !== repo.id))}>
              <span>{repo.name || repo.id}</span>
            </Switch>
          )
        })}
        {missing && <ErrorText as="span" size="xs">Pick at least one repository.</ErrorText>}
      </Box>
    )
  return (
    <Box flex flexCol gap="1" size="sm" data-template-input={input.id}>
      <label htmlFor={id}>{label}</label>
      {input.type === 'choice' ? (
        <SelectField
          id={id}
          value={String(props.value ?? '')}
          onChange={(event) => props.onChange(event.target.value)} look="field" maxWidth="24rem"
        >
          <option value="">Choose…</option>
          {(input.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectField>
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
          <Hint size="xs">
            {file
              ? `${file.name}, ${Math.ceil(file.size / 1024)} KB, read here and sent as text.`
              : 'Read here as text, at most 200 KB. Avoozl never opens a path you type.'}
          </Hint>
          {problem && <ErrorText as="span" size="xs">{problem}</ErrorText>}
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
      {missing && <ErrorText as="span" size="xs">Fill in {input.label}.</ErrorText>}
    </Box>
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

  if (props.templates === null) return <Hint as="p" size="sm">Reading templates…</Hint>
  if (!props.templates.length)
    return <Hint as="p" size="sm">No templates yet. A template comes in a plugin: add and approve one in Settings › Plugins.</Hint>
  return (
    <Stack gap={3} data-template-start>
      <Box as="fieldset" flex flexCol gap="1" size="sm">
        <Box as="legend" weight="medium">Template</Box>
        {props.templates.map((t) => (
          <Box
            key={templateKey(t)}
            as="label" css-border-color={props.picked === templateKey(t) ? 'accent' : 'border'} flex items="start" gap="2" rounded="base" border="all" p="2"
          >
            <input
              type="radio"
              name="avoozl-template"
              className="mt-1"
              checked={props.picked === templateKey(t)}
              onChange={() => props.onPick(templateKey(t))}
            />
            <Stack as="span">
              <Box as="span" weight="medium">{t.title}</Box>
              <Hint size="xs">{t.description}</Hint>
              {t.phases.length > 0 && <Hint size="xs">Phases: {t.phases.map((p) => p.title).join(', ')}</Hint>}
            </Stack>
          </Box>
        ))}
        {props.tried && !template && <ErrorText as="span" size="xs">Pick a template.</ErrorText>}
      </Box>
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
        <Box
          as="section" css-border-color="border" flex flexCol gap="2" rounded="base" border="all" p="3" size="sm"
          aria-label="Template settings"
          data-template-settings
        >
          <Box as="h4" weight="medium">Settings this template suggests</Box>
          <Hint as="p" size="xs">Picking a template changes no setting. Tick the box to copy these into .avoozl.json when you submit.</Hint>
          {preview ? (
            <PackChanges preview={preview} />
          ) : previewError ? (
            <ErrorText size="xs">{previewError}</ErrorText>
          ) : (
            <Hint as="p" size="xs">Reading…</Hint>
          )}
          <Switch label="Import these settings" align="start" checked={props.importSettings} disabled={!preview} onChange={props.onImportSettings} data-import-settings>
            <span>Import these settings</span>
          </Switch>
        </Box>
      )}
    </Stack>
  )
}
