// Settings > Plugins > Intake sources (design §4.12, R50.6): where work
// other than GitHub comes in from. A source is a tracker plugin with poll,
// or `mcp` for a script or cron job that submits items. Declared on this
// computer by default; sharing it in `.avoozl.json` asks you to confirm,
// because its id and plugin may be private names.
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card, CardTitle, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { DangerBtn, IconLabel } from './controls.tsx'
import { Plus, Trash2 } from './icons.ts'
import { emptySourceForm, intakeClient, sourceEntry, type IntakeSourceRow, type PluginRow, type SourceForm } from './plugins-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage, workspaceClient } from './workspace-api.ts'

const selectStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }
type Change = { target: { value: string } }

function Field(props: { label: string; marker: 'required' | 'optional'; raw: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>
        {props.label} <span className="text-xs text-muted">({props.marker})</span>
      </span>
      {props.children}
      {props.hint && <span className="text-xs text-muted">{props.hint}</span>}
      <code className="text-[11px] text-muted">{props.raw}</code>
    </label>
  )
}

function SourceRow({ row, busy, onRemove }: { row: IntakeSourceRow; busy: boolean; onRemove: () => void }) {
  const entry = row.entry ?? {}
  return (
    <li className="flex flex-wrap items-start gap-2 border-t py-2 first:border-t-0" style={{ borderColor: 'var(--border)' }} data-intake-source-row={row.id ?? ''}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
        <span className="font-medium">
          {row.id ?? 'Unreadable'} <Badge>{row.scope === 'machine' ? 'This computer only' : 'Shared with the repo'}</Badge>
        </span>
        <span className="text-xs text-muted">
          {String(entry.via ?? '')} → {String(entry.repository ?? '')}
          {row.state?.readAt ? ` · read ${row.state.readAt}` : ''}
        </span>
        {(row.error || row.state?.error) && <span className="text-xs text-danger">{row.error ?? row.state?.error}</span>}
      </div>
      {row.id && (
        <DangerBtn
          icon={Trash2}
          label={`Remove intake source ${row.id}`}
          disabled={busy}
          confirm={{
            title: `Remove intake source ${row.id}?`,
            body: `Avoozl stops reading ${row.id}. Items it already brought in stay in Intake, and their tasks are not touched.`,
            action: 'Remove source',
          }}
          onConfirm={onRemove}
        >
          Remove
        </DangerBtn>
      )}
    </li>
  )
}

export default function IntakeSources({ workspaceId, plugins }: { workspaceId: string; plugins: PluginRow[] }) {
  const api = useAppApi()
  const client = useMemo(() => intakeClient(api), [api])
  const load = useCallback((id: string) => client.list(id), [client])
  const { value, error, reload } = useRead(workspaceId, load)
  const repos = useMemo(() => workspaceClient(api), [api])
  const loadRepos = useCallback((id: string) => repos.repositories(id), [repos])
  const { value: registered } = useRead(workspaceId, loadRepos)
  const [form, setForm] = useState<SourceForm>(emptySourceForm)
  const [confirmPublic, setConfirmPublic] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const set = (patch: Partial<SourceForm>) => setForm({ ...form, ...patch })
  const pollers = plugins.filter((row) => row.id && row.capabilities?.tracker?.includes('poll'))
  const rows = value?.sources ?? []
  const act = (fn: () => Promise<unknown>) => {
    setBusy(true)
    setProblem(null)
    fn()
      .then(() => reload())
      .catch((caught) => setProblem(errorMessage(caught)))
      .finally(() => setBusy(false))
  }
  const add = () => {
    const made = sourceEntry(
      form,
      rows.flatMap((row) => (row.id ? [row.id] : [])),
    )
    if (made.error || !made.id || !made.entry) return setProblem(made.error ?? 'Check the fields.')
    if (form.scope === 'repository' && !confirmPublic) return setProblem('Tick the box to share this source in .avoozl.json.')
    act(async () => {
      await client.add(workspaceId, { id: made.id!, entry: made.entry!, scope: form.scope, confirmPublic })
      setForm(emptySourceForm())
      setConfirmPublic(false)
    })
  }
  return (
    <Card>
      <CardTitle>Intake sources</CardTitle>
      <p className="mb-2 text-xs text-muted">
        Where work other than GitHub comes in. Items show in the Intake tab; a rule with <code>source:&lt;id&gt;</code> can take them. Avoozl writes nothing back to a source.
      </p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {rows.length ? (
        <ul className="flex flex-col" aria-label="Declared intake sources">
          {rows.map((row, i) => (
            <SourceRow key={`${row.id}-${row.scope}-${i}`} row={row} busy={busy} onRemove={() => act(() => client.remove(workspaceId, row))} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No source yet. Add one below to bring in tickets or a script's items.</p>
      )}
      <div className="mt-3 flex flex-col gap-2 rounded-md border p-3" style={{ borderColor: 'var(--border)' }} data-intake-source-add>
        <span className="text-sm font-medium">Add a source</span>
        <div className="flex flex-wrap gap-3">
          <Field label="Name" marker="required" raw="intake.sources.<id>">
            <Input value={form.id} onChange={(event: Change) => set({ id: event.target.value })} placeholder="tickets" style={{ width: '12rem' }} />
          </Field>
          <Field label="Comes from" marker="required" raw="via" hint="A plugin with poll, or MCP for a script or cron job.">
            <select className="rounded-md border px-2 py-1 text-sm" style={selectStyle} value={form.via} onChange={(event: Change) => set({ via: event.target.value })}>
              <option value="mcp">MCP (a script submits items)</option>
              {pollers.map((row) => (
                <option key={row.id} value={`plugin:${row.id}`}>
                  Plugin {row.id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Repository" marker="required" raw="repository" hint="Its rules apply; a delivered item's task lands there.">
            <select className="rounded-md border px-2 py-1 text-sm" style={selectStyle} value={form.repository} onChange={(event: Change) => set({ repository: event.target.value })}>
              <option value="">Pick a repository</option>
              {(registered ?? []).map((repo) => (
                <option key={repo.id} value={repo.github ?? repo.id}>
                  {repo.github ?? repo.id}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <Field label="Fields as labels" marker="optional" raw="labelFields" hint="Each adds a field:value label before rules match.">
            <Input value={form.labelFields} onChange={(event: Change) => set({ labelFields: event.target.value })} placeholder="component, queue" style={{ width: '14rem' }} />
          </Field>
          <Field label="Assignee field" marker="optional" raw="assigneeField">
            <Input value={form.assigneeField} onChange={(event: Change) => set({ assigneeField: event.target.value })} placeholder="owner" style={{ width: '10rem' }} />
          </Field>
          <Field label="Who counts" marker="optional" raw="minimumPermission" hint="The standing the plugin must report. Blank means write.">
            <select className="rounded-md border px-2 py-1 text-sm" style={selectStyle} value={form.minimumPermission} onChange={(event: Change) => set({ minimumPermission: event.target.value })}>
              <option value="">write (default)</option>
              {['read', 'triage', 'write', 'maintain', 'admin'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm" role="radiogroup" aria-label="Applies to">
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" name="intake-scope" checked={form.scope === 'machine'} onChange={() => set({ scope: 'machine' })} /> This computer only
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" name="intake-scope" checked={form.scope === 'repository'} onChange={() => set({ scope: 'repository' })} /> Shared with the repo
          </label>
        </div>
        {form.scope === 'repository' && (
          <label className="inline-flex items-center gap-1.5 text-xs" data-intake-public-warning>
            <input type="checkbox" checked={confirmPublic} onChange={(event) => setConfirmPublic(event.target.checked)} />
            .avoozl.json may be public. Saving there publishes this source's name and plugin. I understand.
          </label>
        )}
        {problem ? (
          <p role="alert" className="text-xs text-danger">
            {problem}
          </p>
        ) : null}
        <div className="flex gap-2">
          <IconLabel icon={Plus} onClick={add} disabled={busy}>
            Add source
          </IconLabel>
          <Btn type="button" onClick={() => setForm(emptySourceForm())} disabled={busy}>
            Clear
          </Btn>
        </div>
      </div>
    </Card>
  )
}
