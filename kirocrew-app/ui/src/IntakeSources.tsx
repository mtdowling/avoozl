// Settings > Plugins > Intake sources (design §4.12, R50.6): where work
// comes in from. GitHub is built in and set in Settings > GitHub; it shows
// here read-only. Any other source is a tracker plugin with poll, or `mcp`
// for a script or cron job that sends items. Each source is one box with
// its status (on or off, last poll, items, last error), what it can set
// off, and who counts. A source is declared on this computer by default;
// sharing it in `.avoozl.json` asks you to confirm, because its id and
// plugin may be private names. The backend has add and remove only, so a
// source is changed by removing it and adding it again.
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Card, EmptyState, Input } from '@kirocrew/app-sdk/ui'
import Badge, { type BadgeVariant } from './Badge.tsx'
import { DangerBtn, IconLabel, SectionHeading } from './controls.tsx'
import { Modal } from './Modal.tsx'
import { RadioFold } from './RadioFold.tsx'
import { Tooltip } from './Tooltip.tsx'
import { CircleAlert, Plus, Settings, Trash2 } from './icons.ts'
import {
  DEFAULT_PERMISSION,
  PERMISSIONS,
  emptySourceForm,
  intakeClient,
  listText,
  sourceEntry,
  sourceStatus,
  sourceTriggers,
  viaLabel,
  whoCounts,
  type IntakeGitHub,
  type IntakeSourceRow,
  type PluginRow,
  type SourceForm,
  type SourceTone,
} from './plugins-api.ts'
import { relativeTime } from './task-api.ts'
import { useMedia } from './use-media.ts'
import { useRead } from './useRead.ts'
import { errorMessage, workspaceClient } from './workspace-api.ts'

const selectStyle = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)', maxWidth: '100%' }
const BOX = { borderColor: 'var(--border)' }
const TONE: Record<SourceTone, BadgeVariant | undefined> = { ok: 'success', off: undefined, error: 'danger', waiting: 'info' }
const SCOPE = { machine: 'This computer only', repository: 'Shared with the repo' }
const SCOPE_TIP = {
  machine: "Saved in this computer's Avoozl settings. Nobody else sees it.",
  repository: "Saved in the repo's .avoozl.json, so everyone with the repo gets it.",
}
type Change = { target: { value: string } }

// One fact: a plain label, its raw setting name small, and its value.
function Fact({ label, raw, children }: { label: string; raw?: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted">
        {label}
        {raw && <code className="ml-1 text-[11px]">{raw}</code>}
      </dt>
      <dd className="m-0 min-w-0" style={{ overflowWrap: 'anywhere' }}>
        {children}
      </dd>
    </div>
  )
}

// Labels in one column of the same width in every box; on a narrow page
// each label sits over its value.
function Facts({ children }: { children: ReactNode }) {
  const narrow = useMedia('(max-width: 767px)')
  return (
    <dl className="mt-2 grid gap-x-4 text-xs" style={{ gridTemplateColumns: narrow ? 'minmax(0, 1fr)' : '13rem minmax(0, 1fr)', rowGap: narrow ? 2 : 4 }} data-intake-facts>
      {children}
    </dl>
  )
}

// The box every source shares: a titled header with badges, the status
// line, any problem, the facts, and the actions on the right.
function SourceBox(props: { id: string; title: string; badges: ReactNode; status: string; problem?: { kind: string; text: string } | null; children: ReactNode; actions?: ReactNode; attrs?: Record<string, string> }) {
  const heading = `avoozl-intake-${props.id}`
  return (
    <li>
      <article aria-labelledby={heading} className="rounded-lg border p-3" style={BOX} {...props.attrs}>
        <div className="flex flex-wrap items-center gap-2">
          <h4 id={heading} className="m-0 text-sm font-semibold" style={{ overflowWrap: 'anywhere' }}>
            {props.title}
          </h4>
          {props.badges}
        </div>
        <p className="mt-1 text-xs text-muted" data-intake-status>
          {props.status}
        </p>
        {props.problem && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-danger" data-intake-problem>
            <CircleAlert size={14} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
            <span>
              <span className="font-semibold">{props.problem.kind}:</span> {props.problem.text}
            </span>
          </p>
        )}
        {props.children}
        {props.actions && <div className="mt-3 flex flex-wrap justify-end gap-2">{props.actions}</div>}
      </article>
    </li>
  )
}

function ScopeBadge({ scope }: { scope: 'machine' | 'repository' }) {
  return (
    <Tooltip text={SCOPE_TIP[scope]}>
      <span tabIndex={0} className="inline-flex">
        <Badge>{SCOPE[scope]}</Badge>
      </span>
    </Tooltip>
  )
}

function GitHubBox({ github, onOpen }: { github: IntakeGitHub; onOpen?: () => void }) {
  const now = Date.now()
  const errors = github.repositories.filter((r) => r.error)
  const read = github.repositories.map((r) => r.checkedAt).filter((at): at is string => Boolean(at)).sort()
  const on = Boolean(github.mode)
  const status = on
    ? [read.length ? `Read ${relativeTime(read[0], now)}` : 'Not read yet', github.items ? `${github.items.total} items, ${github.items.untriaged} untriaged` : null].filter(Boolean).join(' · ')
    : 'Off: no GitHub mode is set for this workspace.'
  return (
    <SourceBox
      id="github"
      title="GitHub"
      badges={
        <>
          <Badge>Built in</Badge>
          <Badge variant={!on ? undefined : errors.length ? 'danger' : 'success'}>{!on ? 'Off' : errors.length ? 'Error' : 'On'}</Badge>
        </>
      }
      status={status}
      problem={errors.length ? { kind: 'Last error', text: errors.map((r) => `${r.repository}: ${r.error}`).join(' ') } : null}
      attrs={{ 'data-intake-source-row': 'github' }}
      actions={
        onOpen ? (
          <IconLabel icon={Settings} onClick={onOpen} tooltip="Its mode, repositories and trigger rules are set there">
            Open GitHub settings
          </IconLabel>
        ) : undefined
      }
    >
      <Facts>
        <Fact label="Mode">{github.mode ?? 'None'}</Fact>
        <Fact label="Repositories">{github.repositories.map((r) => r.repository).join(', ') || 'None read yet'}</Fact>
        <Fact label="Can trigger">{on ? "Full rules: each repository's trigger rules, for people with its minimum permission." : 'Nothing until a GitHub mode is set.'}</Fact>
      </Facts>
    </SourceBox>
  )
}

function SourceRow({ row, plugins, busy, onRemove }: { row: IntakeSourceRow; plugins: PluginRow[]; busy: boolean; onRemove: () => void }) {
  const entry = row.entry ?? {}
  const status = sourceStatus(row, plugins)
  const triggers = sourceTriggers(row, plugins)
  const id = row.id ?? 'unreadable'
  return (
    <SourceBox
      id={`source-${id}`}
      title={row.id ?? 'Unreadable entry'}
      badges={
        <>
          <ScopeBadge scope={row.scope} />
          <Badge variant={TONE[status.tone]}>{status.label}</Badge>
        </>
      }
      status={status.facts.join(' · ')}
      problem={status.problem ? { kind: status.tone === 'off' ? 'Off' : row.error ? 'Not used' : 'Last error', text: status.problem } : null}
      attrs={{ 'data-intake-source-row': row.id ?? '', 'data-tone': status.tone }}
      actions={
        row.id ? (
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
        ) : undefined
      }
    >
      <Facts>
        <Fact label="Comes from" raw="via">
          {viaLabel(entry.via)}
        </Fact>
        <Fact label="Work lands in" raw="repository">
          {String(entry.repository ?? '')}
        </Fact>
        <Fact label="Can trigger">
          <span className="font-semibold">{triggers.level}.</span> {triggers.line}
        </Fact>
        <Fact label="Who counts" raw={entry.via === 'mcp' ? undefined : entry.allowedActors ? 'allowedActors' : 'minimumPermission'}>
          {whoCounts(row.entry)}
        </Fact>
        {listText(entry.labelFields) && (
          <Fact label="Fields as labels" raw="labelFields">
            {listText(entry.labelFields)}
          </Fact>
        )}
        {typeof entry.assigneeField === 'string' && (
          <Fact label="Assignee field" raw="assigneeField">
            {entry.assigneeField}
          </Fact>
        )}
        {row.state?.cursor && (
          <Fact label="Next poll from" raw="cursor">
            <code>{row.state.cursor}</code>
          </Fact>
        )}
      </Facts>
    </SourceBox>
  )
}

// A form field: a plain label with (required) or (optional), the raw
// setting name small beside it, the control, then a hint. The hint and raw
// name describe the control; they are not part of its name.
function Field(props: { id: string; label: string; marker: 'required' | 'optional'; raw: string; hint?: string; children: (describedBy: string) => ReactNode }) {
  const described = [props.hint ? `${props.id}-hint` : '', `${props.id}-raw`].filter(Boolean).join(' ')
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <label htmlFor={props.id} className="text-sm font-medium">
          {props.label} <span className="text-xs font-normal text-muted">({props.marker})</span>
        </label>
        <code id={`${props.id}-raw`} className="text-[11px] text-muted">
          {props.raw}
        </code>
      </div>
      {props.children(described)}
      {props.hint && (
        <span id={`${props.id}-hint`} className="text-xs text-muted">
          {props.hint}
        </span>
      )}
    </div>
  )
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-semibold">{legend}</legend>
      {children}
    </fieldset>
  )
}

function AddSourceDialog(props: { plugins: PluginRow[]; repositories: { id: string; github?: string | null }[]; taken: string[]; onClose: () => void; onAdd: (made: { id: string; entry: Record<string, unknown> }, form: SourceForm, confirmPublic: boolean) => Promise<void> }) {
  const [form, setForm] = useState<SourceForm>(emptySourceForm)
  const [confirmPublic, setConfirmPublic] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ text: string; field?: keyof SourceForm } | null>(null)
  const set = (patch: Partial<SourceForm>) => setForm({ ...form, ...patch })
  const pollers = props.plugins.filter((row) => row.id && row.capabilities?.tracker?.includes('poll'))
  const plugin = form.via !== 'mcp'
  const dirty = JSON.stringify(form) !== JSON.stringify(emptySourceForm())
  const invalid = (field: keyof SourceForm) => (problem?.field === field ? true : undefined)
  const add = () => {
    const made = sourceEntry(form, props.taken)
    if (made.error || !made.id || !made.entry) {
      setProblem({ text: made.error ?? 'Check the fields.', field: made.field })
      if (made.field) document.getElementById(`intake-${made.field}`)?.focus()
      return
    }
    if (form.scope === 'repository' && !confirmPublic) {
      setProblem({ text: 'Tick the box to share this source in .avoozl.json.', field: 'scope' })
      document.getElementById('intake-confirm-public')?.focus()
      return
    }
    setBusy(true)
    setProblem(null)
    props
      .onAdd({ id: made.id, entry: made.entry }, form, confirmPublic)
      .then(props.onClose)
      .catch((caught) => setProblem({ text: errorMessage(caught) }))
      .finally(() => setBusy(false))
  }
  const via = [
    ...pollers.map((row) => {
      const t = sourceTriggers({ id: null, scope: 'machine', error: null, entry: { via: `plugin:${row.id}` } }, props.plugins)
      return {
        key: `plugin:${row.id}`,
        title: `Plugin ${row.id}`,
        line: `Avoozl polls it on each tick.${row.state === 'approved' ? '' : ' The plugin is off until you approve or enable it.'}`,
        description: (
          <p className="text-xs">
            <span className="font-semibold">{t.level}.</span> {t.line}
          </p>
        ),
      }
    }),
    {
      key: 'mcp',
      title: 'MCP',
      line: "A script or cron job sends items through Avoozl's MCP tools.",
      description: (
        <p className="text-xs">
          <span className="font-semibold">Untriaged only.</span> Rules can only pause or quarantine its items. You start work with Plan this or Deliver this.
        </p>
      ),
    },
  ]
  return (
    <Modal
      id="avoozl-intake-add"
      title="Add an intake source"
      width="40rem"
      onDismiss={props.onClose}
      unsaved={dirty ? { title: 'Discard this source?', body: 'What you typed is lost.', action: 'Discard' } : null}
      backLabel="Close Add an intake source"
      attrs={{ 'data-intake-source-add': true }}
      footer={
        <div className="flex flex-col gap-2">
          {problem && (
            <p role="alert" className="m-0 text-xs text-danger">
              {problem.text}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Btn type="button" onClick={props.onClose} disabled={busy}>
              Cancel
            </Btn>
            <IconLabel icon={Plus} primary onClick={add} disabled={busy}>
              Add source
            </IconLabel>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Group legend="Source">
          <Field id="intake-id" label="Name" marker="required" raw="intake.sources.<id>" hint="Lowercase letters, digits and dashes. Rules match it with source:<name>.">
            {(described) => (
              <Input id="intake-id" value={form.id} onChange={(event: Change) => set({ id: event.target.value })} placeholder="e.g. tickets" aria-describedby={described} aria-invalid={invalid('id')} style={{ width: '20ch', maxWidth: '100%' }} />
            )}
          </Field>
          <Field id="intake-repository" label="Work lands in" marker="required" raw="repository" hint="Its rules apply, and a delivered item's task lands there.">
            {(described) => (
              <select id="intake-repository" className="rounded-md border px-2 py-1 text-sm" style={{ ...selectStyle, width: 'fit-content' }} value={form.repository} onChange={(event: Change) => set({ repository: event.target.value })} aria-describedby={described} aria-invalid={invalid('repository')}>
                <option value="">Pick a repository</option>
                {props.repositories.map((repo) => (
                  <option key={repo.id} value={repo.github ?? repo.id}>
                    {repo.github ?? repo.id}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </Group>
        <Group legend="Comes from (required)">
          <RadioFold name="intake-via" label="Comes from" value={form.via} onChange={(value) => set({ via: value })} sections={via} />
          {!pollers.length && <p className="m-0 text-xs text-muted">No plugin with poll is installed. Add one above to poll a tracker.</p>}
        </Group>
        <Group legend="Item fields">
          <Field id="intake-labelFields" label="Fields as labels" marker="optional" raw="labelFields" hint="Comma list. Each adds a field:value label before rules match.">
            {(described) => <Input id="intake-labelFields" value={form.labelFields} onChange={(event: Change) => set({ labelFields: event.target.value })} placeholder="none" aria-describedby={described} style={{ width: '28ch', maxWidth: '100%' }} />}
          </Field>
          <Field id="intake-assigneeField" label="Assignee field" marker="optional" raw="assigneeField" hint="The item field that names who it's assigned to.">
            {(described) => <Input id="intake-assigneeField" value={form.assigneeField} onChange={(event: Change) => set({ assigneeField: event.target.value })} placeholder="none" aria-describedby={described} style={{ width: '20ch', maxWidth: '100%' }} />}
          </Field>
        </Group>
        {plugin && (
          <Group legend="Who counts (optional)">
            <RadioFold
              name="intake-who"
              label="Who counts"
              value={form.who}
              onChange={(who) => set({ who })}
              sections={[
                {
                  key: 'permission',
                  title: 'People with a permission',
                  line: 'The standing the plugin reports for the person who acted.',
                  fields: (
                    <Field id="intake-minimumPermission" label="At least" marker="optional" raw="minimumPermission">
                      {(described) => (
                        <select id="intake-minimumPermission" className="rounded-md border px-2 py-1 text-sm" style={{ ...selectStyle, width: 'fit-content' }} value={form.minimumPermission} onChange={(event: Change) => set({ minimumPermission: event.target.value })} aria-describedby={described}>
                          <option value="">{DEFAULT_PERMISSION} (default)</option>
                          {PERMISSIONS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                  ),
                },
                {
                  key: 'people',
                  title: 'Only named people',
                  line: 'Only these people can set off a rule.',
                  fields: (
                    <Field id="intake-allowedActors" label="People" marker="required" raw="allowedActors" hint="Comma list of names, as the plugin reports them.">
                      {(described) => <Input id="intake-allowedActors" value={form.allowedActors} onChange={(event: Change) => set({ allowedActors: event.target.value })} placeholder="e.g. sam, riley" aria-describedby={described} aria-invalid={invalid('allowedActors')} style={{ width: '28ch', maxWidth: '100%' }} />}
                    </Field>
                  ),
                },
              ]}
            />
          </Group>
        )}
        <Group legend="Saved in (required)">
          <RadioFold
            name="intake-scope"
            label="Saved in"
            value={form.scope}
            onChange={(scope) => set({ scope })}
            sections={[
              { key: 'machine', title: SCOPE.machine, line: SCOPE_TIP.machine },
              {
                key: 'repository',
                title: SCOPE.repository,
                line: SCOPE_TIP.repository,
                fields: (
                  <label className="inline-flex items-start gap-2 text-xs" data-intake-public-warning>
                    <input id="intake-confirm-public" type="checkbox" checked={confirmPublic} onChange={(event) => setConfirmPublic(event.target.checked)} aria-invalid={invalid('scope')} style={{ marginTop: 2 }} />
                    <span>.avoozl.json may be public. Saving there publishes this source's name and plugin. I understand.</span>
                  </label>
                ),
              },
            ]}
          />
        </Group>
      </div>
    </Modal>
  )
}

export default function IntakeSources({ workspaceId, plugins, onOpenGitHub }: { workspaceId: string; plugins: PluginRow[]; onOpenGitHub?: () => void }) {
  const api = useAppApi()
  const client = useMemo(() => intakeClient(api), [api])
  const load = useCallback((id: string) => client.list(id), [client])
  const { value, error, reload } = useRead(workspaceId, load)
  const repos = useMemo(() => workspaceClient(api), [api])
  const loadRepos = useCallback((id: string) => repos.repositories(id), [repos])
  const { value: registered } = useRead(workspaceId, loadRepos)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const rows = value?.sources ?? []
  const remove = (row: IntakeSourceRow) => {
    setBusy(true)
    setProblem(null)
    client
      .remove(workspaceId, row)
      .then(() => reload())
      .catch((caught) => setProblem(errorMessage(caught)))
      .finally(() => setBusy(false))
  }
  const addButton = (
    <IconLabel icon={Plus} primary={!rows.length} onClick={() => setAdding(true)} disabled={busy}>
      Add a source
    </IconLabel>
  )
  return (
    <section data-intake-sources aria-labelledby="avoozl-intake-title">
      <Card>
        <SectionHeading
          id="avoozl-intake-title"
          title="Intake sources"
          actions={rows.length ? addButton : undefined}
          blurb="Where work comes in. Items show in the Intake tab. Avoozl writes nothing back to a source."
          className="mb-3"
        />
        {error || problem ? (
          <p role="alert" className="mb-2 text-xs text-danger">
            {error ?? problem}
          </p>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Intake sources">
          {value?.github && <GitHubBox github={value.github} onOpen={onOpenGitHub} />}
          {rows.map((row, i) => (
            <SourceRow key={`${row.id}-${row.scope}-${i}`} row={row} plugins={plugins} busy={busy} onRemove={() => remove(row)} />
          ))}
        </ul>
        {value && !rows.length && (
          <div className="mt-3 rounded-lg border p-3" style={{ ...BOX, borderStyle: 'dashed' }} data-intake-empty>
            <EmptyState
              title="No other source yet"
              subtitle="Add one to poll a tracker plugin, or to take items a script or cron job sends through MCP."
              // TODO: add the shared "Ask for help" chat link here once it is on main.
              action={addButton}
            />
          </div>
        )}
      </Card>
      {adding && (
        <AddSourceDialog
          plugins={plugins}
          repositories={registered ?? []}
          taken={rows.flatMap((row) => (row.id ? [row.id] : []))}
          onClose={() => setAdding(false)}
          onAdd={async (made, form, confirmPublic) => {
            await client.add(workspaceId, { id: made.id, entry: made.entry, scope: form.scope, confirmPublic })
            await reload()
          }}
        />
      )}
    </section>
  )
}
