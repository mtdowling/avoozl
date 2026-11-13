import { useMemo, useState, type ReactNode } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
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

const fieldStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }

function Field({ id, label, children, hint }: { id: string; label: string; children: ReactNode; hint?: string }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}

function Area(props: { id: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea
      id={props.id}
      rows={props.rows ?? 3}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(event) => props.onChange(event.target.value)}
      className="rounded border px-2 py-1 text-sm"
      style={fieldStyle}
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
  const update = (at: number, change: Partial<Prerequisite>) =>
    props.onChange(props.value.map((p, i) => (i === at ? { ...p, ...change } : p)))
  return (
    <div className="flex flex-col gap-2 text-sm">
      <span>Prerequisites</span>
      {props.value.length === 0 && <span className="text-xs text-muted">None. It can start once reviewed.</span>}
      <ul className="flex flex-col gap-1.5">
        {props.value.map((p, i) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate">
              {titles.get(p.id) ?? p.id} <span className="text-xs text-muted">{p.id}</span>
            </span>
            <select
              aria-label={`Link kind for ${p.id}`}
              value={p.kind}
              onChange={(event) => update(i, { kind: event.target.value as Prerequisite['kind'], condition: '' })}
              className="rounded border px-1 py-0.5 text-xs"
              style={fieldStyle}
            >
              <option value="requires">needs it done</option>
              <option value="sequence">runs after it</option>
            </select>
            {p.kind === 'requires' && (
              <select
                aria-label={`Level for ${p.id}`}
                value={p.condition}
                onChange={(event) => update(i, { condition: event.target.value })}
                className="rounded border px-1 py-0.5 text-xs"
                style={fieldStyle}
              >
                <option value="">its own completion</option>
                {COMPLETION_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            )}
            <Btn onClick={() => props.onChange(props.value.filter((_, at) => at !== i))}>Remove</Btn>
          </li>
        ))}
      </ul>
      <Picker
        label="Add a prerequisite"
        placeholder="Search tasks by title or ID"
        items={candidates}
        value=""
        keep={false}
        onPick={(id) => props.onChange([...props.value, { id, kind: 'requires', condition: '' }])}
      />
    </div>
  )
}

function PreviewBlock({ preview }: { preview: ChangePreview }) {
  return (
    <div className="flex flex-col gap-2 rounded border p-2 text-sm" style={{ borderColor: 'var(--border)' }}>
      <p>{preview.message}</p>
      {preview.link && (
        <a href={linkHref(preview.link)} target="_blank" rel="noreferrer" className="underline">
          Open the issue
        </a>
      )}
      {preview.tasks && (
        <div className="text-xs">
          <div className="font-medium">
            {preview.folder}tasks.md line {preview.tasks.line}
          </div>
          <pre className="mt-1 whitespace-pre-wrap rounded border p-1" style={{ borderColor: 'var(--border)' }}>
            {`- ${preview.tasks.before}\n+ ${preview.tasks.after}`}
          </pre>
        </div>
      )}
      {preview.manifest && (
        <div className="text-xs">
          <div className="font-medium">
            {preview.folder}avoozl/manifest.json, task {preview.manifest.key}
          </div>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border p-1" style={{ borderColor: 'var(--border)' }}>
            {JSON.stringify(preview.manifest.after, null, 2)}
          </pre>
        </div>
      )}
      <p className="text-xs text-muted">Nothing was written. Approving the changed spec stays your step.</p>
    </div>
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
  onCancel: () => void
}) {
  const { workspaceId, graph, detail } = props
  const api = useAppApi()
  const client = useMemo(() => taskClient(api), [api])
  const original = useMemo(() => (detail ? formFrom(detail) : null), [detail])
  const [form, setForm] = useState<Form>(() =>
    original ?? { ...emptyForm(), prerequisites: props.prerequisite ? [{ id: props.prerequisite, kind: 'requires', condition: '' }] : [] },
  )
  const [idTouched, setIdTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ChangePreview | null>(null)
  const taken = useMemo(() => new Set((graph?.tasks ?? []).map((t) => t.id)), [graph])
  const id = detail ? detail.task.id : idTouched ? form.id : newTaskId(form.title, taken)
  const cycle = findCycle(graph?.edges ?? [], id || '(new)', form.prerequisites.map((p) => p.id))
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
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      {locked ? (
        <p className="rounded border p-2 text-sm" style={{ borderColor: 'var(--border)' }}>
          <Badge variant="warning">Locked</Badge> {locked.message}
        </p>
      ) : !detail ? (
        <p className="text-xs text-muted">A new task starts as a draft. It waits for your review before it can start.</p>
      ) : (
        <p className="text-xs text-muted">Changing the text marks this task for review again. Other tasks are not touched.</p>
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="avoozl-task-repository" label="Repository">
          <select
            id="avoozl-task-repository"
            value={form.repository}
            onChange={(event) => set({ repository: event.target.value })}
            className="rounded border px-2 py-1 text-sm"
            style={fieldStyle}
          >
            <option value="">None</option>
            {(graph?.repositories ?? []).map((repository) => (
              <option key={repository} value={repository}>
                {repository}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="avoozl-task-acceptance" label="Acceptance" hint="One condition per line.">
        <Area id="avoozl-task-acceptance" value={form.acceptance} onChange={(acceptance) => set({ acceptance })} />
      </Field>
      <Field id="avoozl-task-checks" label="Checks" hint="One command per line, such as npm test.">
        <Area id="avoozl-task-checks" rows={2} value={form.checks} onChange={(checks) => set({ checks })} />
      </Field>
      <Prerequisites graph={graph} self={id} value={form.prerequisites} onChange={(prerequisites) => set({ prerequisites })} />
      {cycle && (
        <p role="alert" className="text-sm text-danger">
          That makes a cycle: {cycle.join(' → ')}. Remove one of these prerequisites.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {preview && <PreviewBlock preview={preview} />}
      <div className="flex flex-wrap gap-2">
        <Btn type="submit" primary disabled={busy || !valid}>
          {locked ? 'Draft the spec change' : detail ? 'Save changes' : 'Add draft task'}
        </Btn>
        <Btn type="button" onClick={props.onCancel} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </form>
  )
}
