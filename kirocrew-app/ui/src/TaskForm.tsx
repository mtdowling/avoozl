import { useMemo, useState, type ReactNode } from 'react'
import { useAppApi } from './host.ts'
import { Btn } from './ui/Btn'
import { Input } from './ui/Input'
import Badge from './ui/Badge.tsx'
import {
  COMPLETION_LEVELS,
  emptyForm,
  findCycle,
  formFrom,
  newTaskId,
  saveError,
  taskClient,
  taskInput,
  type ChangePreview,
  type Prerequisite,
  type TaskDetail,
  type TaskForm as Form,
} from './task-api.ts'
import type { Graph } from './views-api.ts'
import { errorMessage } from './workspace-api.ts'
import { linkHref } from './views-api.ts'
import { Picker, taskItems } from './Picker.tsx'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Stack } from './ui/Stack'
import { TextLink } from './ui/TextLink'
import { SelectField } from './ui/SelectField'
import { Box } from './ui/Box'
import { PlainTextarea } from './ui/Plain'

function Field({ id, label, children, hint }: { id: string; label: string; children: ReactNode; hint?: string }) {
  return (
    <Box htmlFor={id} as="label" flex flexCol gap="1" size="sm">
      <span>{label}</span>
      {children}
      {hint && <Hint size="xs">{hint}</Hint>}
    </Box>
  )
}

function Area(props: { id: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string }) {
  return (
    <PlainTextarea
      id={props.id}
      rows={props.rows ?? 3}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(event) => props.onChange(event.target.value)}
      css-border-color="border"
      css-color="text"
      css-background="card-transparent"
      rounded="base"
      border="all"
      px="2"
      py="1"
      size="sm"
    />
  )
}

// Prerequisites picked from existing tasks with a search box.
function Prerequisites(props: { graph: Graph | null; self: string; value: Prerequisite[]; onChange: (value: Prerequisite[]) => void }) {
  const titles = useMemo(() => new Map((props.graph?.tasks ?? []).map((t) => [t.id, t.title])), [props.graph])
  const chosenKey = props.value.map((p) => p.id).join('\n')
  const candidates = useMemo(() => {
    const chosen = new Set(chosenKey.split('\n'))
    return taskItems(props.graph?.tasks ?? []).filter((t) => t.id !== props.self && !chosen.has(t.id))
  }, [props.graph, props.self, chosenKey])
  const update = (at: number, change: Partial<Prerequisite>) => props.onChange(props.value.map((p, i) => (i === at ? { ...p, ...change } : p)))
  return (
    <Box flex flexCol gap="2" size="sm">
      <span>Prerequisites</span>
      {props.value.length === 0 && <Hint size="xs">None. It can start once reviewed.</Hint>}
      <Box as="ul" flex flexCol gap="1.5">
        {props.value.map((p, i) => (
          <Box key={p.id} as="li" flex flexWrap items="center" gap="2">
            <Box as="span" minW0 flex1 truncate>
              {titles.get(p.id) ?? p.id} <Hint size="xs">{p.id}</Hint>
            </Box>
            <SelectField
              aria-label={`Link kind for ${p.id}`}
              value={p.kind}
              onChange={(event) => update(i, { kind: event.target.value as Prerequisite['kind'], condition: '' })}
              look="tight"
            >
              <option value="requires">needs it done</option>
              <option value="sequence">runs after it</option>
            </SelectField>
            {p.kind === 'requires' && (
              <SelectField aria-label={`Level for ${p.id}`} value={p.condition} onChange={(event) => update(i, { condition: event.target.value })} look="tight">
                <option value="">its own completion</option>
                {COMPLETION_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </SelectField>
            )}
            <Btn onClick={() => props.onChange(props.value.filter((_, at) => at !== i))}>Remove</Btn>
          </Box>
        ))}
      </Box>
      <Picker
        label="Add a prerequisite"
        placeholder="Search tasks by title or ID"
        items={candidates}
        value=""
        keep={false}
        onPick={(id) => props.onChange([...props.value, { id, kind: 'requires', condition: '' }])}
      />
    </Box>
  )
}

function PreviewBlock({ preview }: { preview: ChangePreview }) {
  return (
    <Box css-border-color="border" flex flexCol gap="2" rounded="base" border="all" p="2" size="sm">
      <p>{preview.message}</p>
      {preview.link && (
        <TextLink href={linkHref(preview.link)} target="_blank" rel="noreferrer">
          Open the issue
        </TextLink>
      )}
      {preview.tasks && (
        <Box size="xs">
          <Box weight="medium">
            {preview.folder}tasks.md line {preview.tasks.line}
          </Box>
          <Box as="pre" css-border-color="border" mt="1" whitespace="pre-wrap" rounded="base" border="all" p="1">
            {`- ${preview.tasks.before}\n+ ${preview.tasks.after}`}
          </Box>
        </Box>
      )}
      {preview.facts && (
        <Box size="xs">
          <Box weight="medium">
            {preview.folder}tasks.md, Facts of task {preview.facts.key}
          </Box>
          <Box as="pre" css-border-color="border" mt="1" maxH48 overflow="auto" whitespace="pre-wrap" rounded="base" border="all" p="1">
            {JSON.stringify(preview.facts.after, null, 2)}
          </Box>
        </Box>
      )}
      <Hint as="p" size="xs">
        Nothing was written. Approving the changed spec stays your step.
      </Hint>
    </Box>
  )
}

// Add a task (detail null) or edit one. A locked task's change becomes a
// plan-change preview instead of a row write.
export default function TaskForm(props: {
  workspaceId: string
  graph: Graph | null
  detail: TaskDetail | null
  prerequisite?: string
  onSaved: (id: string) => void
  // Without it there is no Cancel button (a modal's footer has one).
  onCancel?: () => void
}) {
  const { workspaceId, graph, detail } = props
  const api = useAppApi()
  const client = useMemo(() => taskClient(api), [api])
  const original = useMemo(() => (detail ? formFrom(detail) : null), [detail])
  const [form, setForm] = useState<Form>(
    () => original ?? { ...emptyForm(), prerequisites: props.prerequisite ? [{ id: props.prerequisite, kind: 'requires', condition: '' }] : [] },
  )
  const [idTouched, setIdTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ChangePreview | null>(null)
  const taken = useMemo(() => new Set((graph?.tasks ?? []).map((t) => t.id)), [graph])
  const id = detail ? detail.task.id : idTouched ? form.id : newTaskId(form.title, taken)
  const cycle = findCycle(
    graph?.edges ?? [],
    id || '(new)',
    form.prerequisites.map((p) => p.id),
  )
  const set = (change: Partial<Form>) => setForm({ ...form, ...change })
  const locked = detail?.locked ?? null
  const valid = Boolean(form.title.trim()) && (Boolean(detail) || /^[a-z][a-z0-9-]{2,80}$/.test(id)) && !cycle

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const input = taskInput({ ...form, id }, original)
      if (locked) {
        const { id: _id, needsReview: _review, create: _create, ...change } = input
        setPreview(await client.preview(workspaceId, id, change))
        return
      }
      await client.save(workspaceId, input, detail?.revision ?? graph?.revision ?? 0)
      props.onSaved(id)
    } catch (caught) {
      setError(saveError(errorMessage(caught)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack
      as="form"
      gap={3}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {locked ? (
        <Box as="p" css-border-color="border" rounded="base" border="all" p="2" size="sm">
          <Badge variant="warning">Locked</Badge> {locked.message}
        </Box>
      ) : !detail ? (
        <Hint as="p" size="xs">
          A new task starts as a draft. It waits for your review before it can start.
        </Hint>
      ) : (
        <Hint as="p" size="xs">
          Changing the text marks this task for review again. Other tasks are not touched.
        </Hint>
      )}
      <Field id="avoozl-task-title" label="Title">
        <Input id="avoozl-task-title" value={form.title} onChange={(event) => set({ title: event.target.value })} required />
      </Field>
      {!detail && (
        <Field id="avoozl-task-id" label="Task ID" hint="Lower-case letters, digits and dashes. Made from the title unless you change it.">
          <Input
            id="avoozl-task-id"
            value={id}
            onChange={(event) => {
              setIdTouched(true)
              set({ id: event.target.value })
            }}
          />
        </Field>
      )}
      <Field id="avoozl-task-summary" label="Description">
        <Area id="avoozl-task-summary" rows={4} value={form.summary} onChange={(summary) => set({ summary })} />
      </Field>
      <Box grid gap="3" smGridCols2>
        <Field id="avoozl-task-repository" label="Repository">
          <SelectField id="avoozl-task-repository" value={form.repository} onChange={(event) => set({ repository: event.target.value })} look="field">
            <option value="">None</option>
            {(graph?.repositories ?? []).map((repository) => (
              <option key={repository} value={repository}>
                {repository}
              </option>
            ))}
          </SelectField>
        </Field>
      </Box>
      <Field id="avoozl-task-acceptance" label="Acceptance" hint="One condition per line.">
        <Area id="avoozl-task-acceptance" value={form.acceptance} onChange={(acceptance) => set({ acceptance })} />
      </Field>
      <Field id="avoozl-task-checks" label="Checks" hint="One command per line, such as npm test.">
        <Area id="avoozl-task-checks" rows={2} value={form.checks} onChange={(checks) => set({ checks })} />
      </Field>
      <Prerequisites graph={graph} self={id} value={form.prerequisites} onChange={(prerequisites) => set({ prerequisites })} />
      {cycle && (
        <ErrorText role="alert" size="sm">
          That makes a cycle: {cycle.join(' → ')}. Remove one of these prerequisites.
        </ErrorText>
      )}
      {error && (
        <ErrorText role="alert" size="sm">
          {error}
        </ErrorText>
      )}
      {preview && <PreviewBlock preview={preview} />}
      <Row gap={2} align="start">
        <Btn type="submit" primary disabled={busy || !valid}>
          {locked ? 'Draft the spec change' : detail ? 'Save changes' : 'Add draft task'}
        </Btn>
        {props.onCancel && (
          <Btn type="button" onClick={props.onCancel} disabled={busy}>
            Cancel
          </Btn>
        )}
      </Row>
    </Stack>
  )
}
