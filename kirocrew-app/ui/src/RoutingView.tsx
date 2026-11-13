// The Routing page (design §8.3, R42, R53.11): which route does each task's
// work and which crew runs the sessions Avoozl opens, on which agent and
// model. Crews, Rules, Smart pick, Model router, Preview, in that order.
// Every edit goes through routing.update or crews.update with the expected
// revision; crew settings and router instructions stay on this machine.
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import Badge from './Badge.tsx'
import { Modal } from './Modal.tsx'
import { Marker, Section } from './SettingsView.tsx'
import { Tooltip } from './Tooltip.tsx'
import { ChoiceCards, DangerBtn, IconBtn, IconLabel, ViewHeading } from './controls.tsx'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from './icons.ts'
import { modelOptions, parseModels } from './flow-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import {
  MC10_LINE,
  PRESETS,
  ROLES,
  WEIGHT_LABELS,
  DEFAULT_STALE_SECONDS,
  chatPlaceholder,
  crewMap,
  emptyRuleForm,
  moveRule,
  readingText,
  routingClient,
  ruleText,
  rulesIn,
  sessionNote,
  toCrewEntry,
  toCrewForm,
  toRule,
  toRuleForm,
  withRules,
  type Crew,
  type CrewForm,
  type PreviewItem,
  type Rule,
  type RuleForm,
  type RoutingView as View,
} from './routing-api.ts'

const OPTIONAL = { required: false } as const
const REQUIRED = { required: true } as const
const selectStyle: CSSProperties = { borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--card, transparent)' }
const cell: CSSProperties = { padding: '6px 8px', textAlign: 'left', verticalAlign: 'top' }
const needsYou: CSSProperties = { color: 'var(--warning, #b45309)' }

function Raw({ name }: { name: string }) {
  return (
    <code className="text-[11px] text-muted" style={{ overflowWrap: 'anywhere', opacity: 0.8 }}>
      {name}
    </code>
  )
}

function Field(props: { id: string; label: string; raw?: string; required?: boolean; width?: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm" style={props.width ? { maxWidth: props.width, width: '100%' } : undefined}>
      <label htmlFor={props.id} className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{props.label}</span>
        <Marker rule={props.required ? REQUIRED : OPTIONAL} />
      </label>
      {props.children}
      {props.note && <span className="text-xs text-muted">{props.note}</span>}
      {props.raw && <Raw name={props.raw} />}
    </div>
  )
}

// Checkboxes for a list Avoozl can name (labels, roles, tags).
function Checks(props: { id: string; options: string[]; value: string[]; onChange: (next: string[]) => void; empty: string }) {
  if (!props.options.length) return <span className="text-xs text-muted">{props.empty}</span>
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1" role="group" aria-labelledby={props.id}>
      {props.options.map((option) => (
        <label key={option} className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={props.value.includes(option)}
            onChange={(event) => props.onChange(event.target.checked ? [...props.value, option] : props.value.filter((v) => v !== option))}
          />
          {option}
        </label>
      ))}
    </div>
  )
}

function useModels() {
  const api = useAppApi()
  const [models, setModels] = useState<{ value: string; label: string }[]>([])
  useEffect(() => {
    let live = true
    api.get<unknown>('/api/models').then(
      (body) => live && setModels(parseModels(body)),
      () => live && setModels([]),
    )
    return () => {
      live = false
    }
  }, [api])
  return models
}

export function CrewDialog(props: { crew: Crew; onCancel: () => void; onSave: (form: CrewForm) => Promise<string | null> }) {
  const [form, setForm] = useState<CrewForm>(toCrewForm(props.crew))
  const [error, setError] = useState<string | null>(null)
  const set = (change: Partial<CrewForm>) => setForm({ ...form, ...change })
  const local = props.crew.id === 'local'
  return (
    <Modal
      id="avoozl-crew-dialog"
      title={`Crew ${props.crew.name}`}
      onDismiss={props.onCancel}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Btn type="button" primary onClick={() => void props.onSave(form).then(setError)}>
            Save
          </Btn>
          <Btn type="button" onClick={props.onCancel}>
            Cancel
          </Btn>
          {error && (
            <span role="alert" className="text-sm text-danger">
              {error}
            </span>
          )}
          <span className="text-xs text-muted">Saved on this machine only.</span>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field id="avoozl-crew-trust" label="Trust" raw={`crews.${props.crew.id}.tags trust:`} required width="16rem">
          <select id="avoozl-crew-trust" value={local ? 'local' : form.trust} disabled={local} onChange={(e) => set({ trust: e.target.value as 'local' | 'remote' })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
            <option value="remote">remote</option>
            <option value="local">local</option>
          </select>
        </Field>
        <Field id="avoozl-crew-tags" label="Tags" raw={`crews.${props.crew.id}.tags`} note="key:value, keys os, arch, tools. Example: os:linux arch:x64 tools:docker." width="32rem">
          <Input id="avoozl-crew-tags" value={form.tags} placeholder="none" onChange={(e) => set({ tags: e.target.value })} />
        </Field>
        {!local && (
          <Field id="avoozl-crew-hosts" label="Git hosts" raw={`crews.${props.crew.id}.gitHosts`} note="Hosts this crew can fetch from. Without one, nothing goes there." width="32rem">
            <Input id="avoozl-crew-hosts" value={form.gitHosts} placeholder="none" onChange={(e) => set({ gitHosts: e.target.value })} />
          </Field>
        )}
        <Field id="avoozl-crew-limit" label="Chat limit" raw={`crews.${props.crew.id}.chatLimit`} note="Avoozl chats at once on this crew." width="10rem">
          <Input id="avoozl-crew-limit" inputMode="numeric" value={form.chatLimit} placeholder={chatPlaceholder(props.crew)} onChange={(e) => set({ chatLimit: e.target.value })} />
        </Field>
        {!local && (
          <>
            <Field id="avoozl-crew-delivery" label="Work comes back by" raw={`crews.${props.crew.id}.delivery`} width="20rem">
              <select id="avoozl-crew-delivery" value={form.delivery} onChange={(e) => set({ delivery: e.target.value as CrewForm['delivery'] })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
                <option value="">Hand-back over SSH (default)</option>
                <option value="handback">Hand-back over SSH</option>
                <option value="push">The worker pushes its branch</option>
              </select>
            </Field>
            <Field id="avoozl-crew-ssh" label="SSH host" raw={`crews.${props.crew.id}.sshHost`} note="Needed for hand-back. The host key is pinned on first fetch." width="24rem">
              <Input id="avoozl-crew-ssh" value={form.sshHost} placeholder="user@host" onChange={(e) => set({ sshHost: e.target.value })} />
            </Field>
            <Field id="avoozl-crew-root" label="Worktree folder" raw={`crews.${props.crew.id}.worktreeRoot`} note="An absolute folder on that crew. Needed for hand-back." width="32rem">
              <Input id="avoozl-crew-root" value={form.worktreeRoot} placeholder="/srv/avoozl-work" onChange={(e) => set({ worktreeRoot: e.target.value })} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  )
}

function CrewsSection(props: { view: View; workspaceId: string; onSaved: () => Promise<void> }) {
  const api = useAppApi()
  const client = useMemo(() => routingClient(api), [api])
  const [editing, setEditing] = useState<Crew | null>(null)
  const [stale, setStale] = useState(props.view.staleSeconds === null ? '' : String(props.view.staleSeconds))
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => setStale(props.view.staleSeconds === null ? '' : String(props.view.staleSeconds)), [props.view.staleSeconds])
  const saveMap = async (crews: Record<string, unknown>) => {
    await client.saveCrews(props.workspaceId, { crews, expectedHash: props.view.machineHash })
    await props.onSaved()
  }
  const saveStale = async () => {
    setMessage(null)
    const n = stale.trim() ? Number(stale) : null
    if (n !== null && (!Number.isInteger(n) || n < 10 || n > 3600)) return setMessage('Stale after is a whole number of seconds, 10–3600.')
    try {
      await client.saveCrews(props.workspaceId, { staleSeconds: n, expectedHash: props.view.machineHash })
      await props.onSaved()
      setMessage('Saved.')
    } catch (caught) {
      setMessage(errorMessage(caught))
    }
  }
  return (
    <Section title="Crews" blurb="Machines that can run Avoozl chats. Tags and limits stay on this machine.">
      <div style={{ overflowX: 'auto' }}>
        <table className="text-sm" style={{ borderCollapse: 'collapse', width: '100%' }} data-crews>
          <thead>
            <tr className="text-xs text-muted">
              {['Crew', 'Tags', 'Trust', 'Chats', 'Load', 'Memory', 'Disk', 'Health', ''].map((h) => (
                <th key={h} style={cell}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.view.crews.map((crew) => {
              const r = readingText(crew)
              const remoteWaits = crew.trust !== 'local' && (!props.view.mc10 || !props.view.remoteDispatch)
              return (
                <tr key={crew.id} style={{ borderTop: '1px solid var(--border)' }} data-crew={crew.id}>
                  <td style={{ ...cell, minWidth: '9rem' }}>
                    <span className="font-medium">{crew.name}</span>
                    {crew.name !== crew.id && <span className="block text-xs text-muted">{crew.id}</span>}
                    {remoteWaits && (
                      <span className="block text-xs text-muted">{!props.view.remoteDispatch ? "Kiro Crew's remote dispatch is off." : 'Waits on Kiro Crew.'}</span>
                    )}
                  </td>
                  <td style={cell}>{crew.tags.filter((t) => !t.startsWith('trust:')).join(' ') || <span className="text-muted">none</span>}</td>
                  <td style={cell}>{crew.trust}</td>
                  <td style={cell}>
                    {crew.running}/{crew.chatLimit}
                  </td>
                  <td style={cell}>{r.load}</td>
                  <td style={cell}>{r.mem}</td>
                  <td style={cell}>{r.disk}</td>
                  <td style={cell} className="text-muted">
                    {r.health}
                  </td>
                  <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span className="inline-flex gap-1.5">
                      <IconBtn icon={Pencil} label={`Edit ${crew.name}`} tooltip="Edit tags, limit, and hand-back" onClick={() => setEditing(crew)} />
                      {crew.configured && (
                        <DangerBtn
                          icon={Trash2}
                          label={`Remove settings for ${crew.name}`}
                          tooltip="Clear this machine's settings for the crew"
                          confirm={{ title: `Remove settings for ${crew.name}?`, body: 'Clears its tags, limits, and hand-back on this machine. The crew stays connected to Kiro Crew.', action: 'Remove' }}
                          onConfirm={() => {
                            const map = crewMap(props.view.crews)
                            delete map[crew.id]
                            void saveMap(map)
                          }}
                        >
                          {''}
                        </DangerBtn>
                      )}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {props.view.crews.length === 1 && <p className="text-xs text-muted">Only this machine. Connect another Kiro Crew instance to see it here.</p>}
      {!props.view.mc10 && (
        <p className="text-sm text-muted" data-mc10>
          {MC10_LINE}
        </p>
      )}
      <Field id="avoozl-stale" label="Stale after (seconds)" raw="crewStaleSeconds" note="A crew whose reading is older is not used." width="22rem">
        <span className="flex items-center gap-2">
          <span style={{ width: '8rem' }}>
            <Input id="avoozl-stale" inputMode="numeric" value={stale} placeholder={String(DEFAULT_STALE_SECONDS)} onChange={(e) => setStale(e.target.value)} />
          </span>
          <Btn type="button" onClick={() => void saveStale()}>
            Save
          </Btn>
          {message && <span className="text-sm text-muted">{message}</span>}
        </span>
      </Field>
      {editing && (
        <CrewDialog
          crew={editing}
          onCancel={() => setEditing(null)}
          onSave={async (form) => {
            const built = toCrewEntry(editing.id, form)
            if (built.error) return built.error
            try {
              await saveMap({ ...crewMap(props.view.crews), [editing.id]: built.entry })
              setEditing(null)
              return null
            } catch (caught) {
              return errorMessage(caught)
            }
          }}
        />
      )}
    </Section>
  )
}

export function RuleDialog(props: {
  view: View
  form: RuleForm
  isNew: boolean
  models: { value: string; label: string }[]
  onCancel: () => void
  onSave: (form: RuleForm) => Promise<string | null>
  onDelete: () => void
}) {
  const [form, setForm] = useState<RuleForm>(props.form)
  const [error, setError] = useState<string | null>(null)
  const set = (change: Partial<RuleForm>) => setForm({ ...form, ...change })
  const tags = [...new Set(props.view.crews.flatMap((c) => c.tags))].sort()
  const repositories = Object.keys(props.view.repositories)
  const crews = props.view.crews.filter((c) => c.id !== 'local').map((c) => c.id)
  const routeNote = sessionNote({ id: form.id, route: form.route || undefined })
  const modelSelect = (id: string, value: string, onChange: (v: string) => void) => (
    <select id={id} value={value || 'auto'} onChange={(e) => onChange(e.target.value === 'auto' ? '' : e.target.value)} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
      {modelOptions(props.models, value).map((o) => (
        <option key={o.value} value={o.value}>
          {o.value === 'auto' ? 'default (the role setting, else auto)' : o.label}
        </option>
      ))}
    </select>
  )
  return (
    <Modal
      id="avoozl-rule-dialog"
      title={props.isNew ? 'Add rule' : `Rule ${props.form.id}`}
      onDismiss={props.onCancel}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Btn type="button" primary onClick={() => void props.onSave(form).then(setError)}>
            Save
          </Btn>
          <Btn type="button" onClick={props.onCancel}>
            Cancel
          </Btn>
          {error && (
            <span role="alert" className="text-sm text-danger">
              {error}
            </span>
          )}
          {!props.isNew && (
            <span style={{ marginLeft: 'auto' }}>
              <DangerBtn icon={Trash2} confirm={{ title: `Delete rule ${props.form.id}?`, body: 'Tasks it matched follow the remaining rules from the next tick.', action: 'Delete' }} onConfirm={props.onDelete}>
                Delete
              </DangerBtn>
            </span>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3" data-rule-form>
        <div className="flex flex-wrap gap-4">
          <Field id="avoozl-rule-id" label="Name" raw="id" required width="16rem">
            <Input id="avoozl-rule-id" value={form.id} disabled={!props.isNew} onChange={(e) => set({ id: e.target.value })} />
          </Field>
          <Field id="avoozl-rule-save" label="Save in" required width="18rem" note={form.saveIn === 'machine' ? 'Kept on this machine; may name a crew.' : 'In .avoozl.json; tags and local only.'}>
            <select id="avoozl-rule-save" value={form.saveIn} disabled={!props.isNew} onChange={(e) => set({ saveIn: e.target.value })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
              <option value="workspace">This workspace</option>
              {repositories.map((id) => (
                <option key={id} value={`repository:${id}`}>
                  Repository {id}
                </option>
              ))}
              <option value="machine">This machine</option>
            </select>
          </Field>
        </div>
        <hr style={{ borderColor: 'var(--border)', margin: '4px 0' }} />
        <span className="text-sm font-semibold">When</span>
        <Field id="avoozl-rule-labels" label="Labels" raw="when.labels" note="Any of these. Blank matches every task.">
          <Checks id="avoozl-rule-labels" options={props.view.labels} value={form.labels} onChange={(labels) => set({ labels })} empty="No task has a label yet." />
        </Field>
        <Field id="avoozl-rule-roles" label="Roles" raw="when.roles">
          <Checks id="avoozl-rule-roles" options={[...ROLES]} value={form.roles} onChange={(roles) => set({ roles })} empty="" />
        </Field>
        <div className="flex flex-wrap gap-4">
          <Field id="avoozl-rule-kinds" label="Kinds" raw="when.kinds" width="14rem">
            <Input id="avoozl-rule-kinds" value={form.kinds} placeholder="any, e.g. test" onChange={(e) => set({ kinds: e.target.value })} />
          </Field>
          <Field id="avoozl-rule-paths" label="Paths" raw="when.paths" width="18rem">
            <Input id="avoozl-rule-paths" value={form.paths} placeholder="any, e.g. src/win/**" onChange={(e) => set({ paths: e.target.value })} />
          </Field>
          <Field id="avoozl-rule-repos" label="Repositories" raw="when.repositories" width="14rem">
            <Input id="avoozl-rule-repos" value={form.repositories} placeholder="any" onChange={(e) => set({ repositories: e.target.value })} />
          </Field>
          <Field id="avoozl-rule-cats" label="Categories" raw="when.categories" width="14rem">
            <Input id="avoozl-rule-cats" value={form.categories} placeholder="any" onChange={(e) => set({ categories: e.target.value })} />
          </Field>
        </div>
        <hr style={{ borderColor: 'var(--border)', margin: '4px 0' }} />
        <span className="text-sm font-semibold">Where</span>
        <div className="flex flex-wrap gap-4">
          <Field id="avoozl-rule-route" label="Route" raw="route" width="16rem">
            <select id="avoozl-rule-route" value={form.route} onChange={(e) => set({ route: e.target.value })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
              <option value="">repository route (default)</option>
              <option value="local">local worker</option>
              <option value="github">GitHub route</option>
            </select>
          </Field>
          <Field id="avoozl-rule-on" label="Run on" raw="on" width="16rem">
            <select id="avoozl-rule-on" value={form.on} onChange={(e) => set({ on: e.target.value })} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
              <option value="">local (default)</option>
              <option value="any">any crew</option>
              <option value="tags">crews with tags</option>
              {form.saveIn === 'machine' &&
                crews.map((id) => (
                  <option key={id} value={id}>
                    crew {id}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        {form.on === 'tags' && (
          <Field id="avoozl-rule-ontags" label="Crews with all of" raw="on: tags:…">
            <Checks id="avoozl-rule-ontags" options={tags} value={form.onTags} onChange={(onTags) => set({ onTags })} empty="No crew has tags yet." />
          </Field>
        )}
        <Field id="avoozl-rule-require" label="Require tags" raw="requireTags">
          <Checks id="avoozl-rule-require" options={tags} value={form.requireTags} onChange={(requireTags) => set({ requireTags })} empty="No crew has tags yet." />
        </Field>
        <Field id="avoozl-rule-forbid" label="Forbid tags" raw="forbidTags">
          <Checks id="avoozl-rule-forbid" options={tags} value={form.forbidTags} onChange={(forbidTags) => set({ forbidTags })} empty="No crew has tags yet." />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.keepLocal} onChange={(e) => set({ keepLocal: e.target.checked })} />
          <span className="font-medium">Keep local</span>
          <Marker rule={OPTIONAL} />
          <span className="text-xs text-muted">Wins over every other rule.</span>
        </label>
        <hr style={{ borderColor: 'var(--border)', margin: '4px 0' }} />
        <span className="text-sm font-semibold">Session</span>
        {routeNote ? (
          <p className="text-xs text-muted">{routeNote}</p>
        ) : (
          <>
            <p className="text-xs text-muted">The agent and model the matching worker chats open on. Blank keeps the repository or workspace setting.</p>
            {!form.choices.length && (
              <div className="flex flex-wrap gap-4">
                <Field id="avoozl-rule-agent" label="Agent" raw="session.agent" width="16rem">
                  <Input id="avoozl-rule-agent" value={form.agent} placeholder="kirocrew-worker" onChange={(e) => set({ agent: e.target.value })} />
                </Field>
                <Field id="avoozl-rule-model" label="Model" raw="session.model" width="18rem">
                  {modelSelect('avoozl-rule-model', form.model, (model) => set({ model }))}
                </Field>
              </div>
            )}
            {form.choices.map((choice, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3" data-choice-row>
                <Field id={`avoozl-choice-agent-${i}`} label={`Choice ${i + 1} agent`} raw={`session.choices[${i}].agent`} width="14rem">
                  <Input id={`avoozl-choice-agent-${i}`} value={choice.agent} placeholder="kirocrew-worker" onChange={(e) => set({ choices: form.choices.map((c, j) => (j === i ? { ...c, agent: e.target.value } : c)) })} />
                </Field>
                <Field id={`avoozl-choice-model-${i}`} label="Model" raw={`session.choices[${i}].model`} width="16rem">
                  {modelSelect(`avoozl-choice-model-${i}`, choice.model, (model) => set({ choices: form.choices.map((c, j) => (j === i ? { ...c, model } : c)) }))}
                </Field>
                <Field id={`avoozl-choice-weight-${i}`} label="Weight" raw={`session.choices[${i}].weight`} width="7rem">
                  <Input id={`avoozl-choice-weight-${i}`} inputMode="numeric" value={choice.weight} placeholder="1" onChange={(e) => set({ choices: form.choices.map((c, j) => (j === i ? { ...c, weight: e.target.value } : c)) })} />
                </Field>
                <IconBtn icon={Trash2} label={`Remove choice ${i + 1}`} onClick={() => set({ choices: form.choices.filter((_, j) => j !== i) })} />
              </div>
            ))}
            {form.choices.length < 10 && (
              <span>
                <IconLabel
                  icon={Plus}
                  tooltip="Spread tasks across several agents or models by weight"
                  onClick={() =>
                    set({
                      choices: form.choices.length ? [...form.choices, { agent: '', model: '', weight: '' }] : [{ agent: form.agent, model: form.model, weight: '' }, { agent: '', model: '', weight: '' }],
                    })
                  }
                >
                  Add choice
                </IconLabel>
              </span>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

function RulesSection(props: { view: View; workspaceId: string; onSaved: () => Promise<void> }) {
  const api = useAppApi()
  const client = useMemo(() => routingClient(api), [api])
  const models = useModels()
  const [editing, setEditing] = useState<{ form: RuleForm; isNew: boolean } | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const hashFor = (saveIn: string) => (saveIn === 'machine' ? props.view.machineHash : props.view.configHash)
  const write = async (saveIn: string, rules: Rule[]) => {
    await client.save(props.workspaceId, { where: saveIn, routing: withRules(props.view, saveIn, rules), expectedHash: hashFor(saveIn) })
    await props.onSaved()
  }
  const sourceOf = (rule: Rule) => (rule.source === 'machine' ? 'machine' : rule.source === 'repository' ? `repository:${rule.repository}` : 'workspace')
  // Reorder within one source: rules are checked workspace, repository, then
  // this machine, and order only picks the route and which pin applies.
  const move = (index: number, to: number) => {
    const rule = props.view.rules[index],
      target = props.view.rules[to]
    if (!rule || !target || sourceOf(rule) !== sourceOf(target)) return
    const saveIn = sourceOf(rule),
      own = rulesIn(props.view, saveIn),
      from = own.findIndex((r) => r.id === rule.id),
      dest = own.findIndex((r) => r.id === target.id)
    setMessage(null)
    void write(saveIn, moveRule(own, from, dest)).catch((caught) => setMessage(errorMessage(caught)))
  }
  return (
    <Section
      title="Rules"
      blurb="Checked top to bottom for the route. Every matching limit always applies."
      actions={
        <IconLabel icon={Plus} primary onClick={() => setEditing({ form: emptyRuleForm(), isNew: true })}>
          Add rule
        </IconLabel>
      }
    >
      <ol className="flex flex-col" data-rules style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {props.view.rules.map((rule, i) => (
          <li
            key={`${rule.source}:${rule.repository ?? ''}:${rule.id}`}
            draggable
            onDragStart={() => setDragging(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging !== null && dragging !== i) move(dragging, i)
              setDragging(null)
            }}
            className="flex flex-wrap items-center gap-2 text-sm"
            style={{ borderTop: i ? '1px solid var(--border)' : undefined, padding: '6px 0', cursor: 'grab' }}
            data-rule={rule.id}
          >
            <span aria-hidden="true" className="text-muted">
              ⋮⋮
            </span>
            <span className="font-medium" style={{ minWidth: '8rem' }}>
              {rule.id}
            </span>
            <span style={{ flex: '1 1 18rem', minWidth: 'min(18rem, 100%)' }}>
              {ruleText(rule)}
              {sessionNote(rule) && rule.session && <span className="block text-xs text-muted">{sessionNote(rule)}</span>}
            </span>
            <span className="inline-flex items-center gap-1" style={{ marginLeft: 'auto' }}>
            <Badge>{rule.source === 'machine' ? 'this machine' : rule.source === 'repository' ? `repository ${rule.repository}` : 'workspace'}</Badge>
            <span className="inline-flex gap-1">
              <IconBtn icon={ArrowUp} label={`Move ${rule.id} up`} disabled={i === 0 || sourceOf(props.view.rules[i - 1]) !== sourceOf(rule)} onClick={() => move(i, i - 1)} />
              <IconBtn icon={ArrowDown} label={`Move ${rule.id} down`} disabled={i === props.view.rules.length - 1 || sourceOf(props.view.rules[i + 1]) !== sourceOf(rule)} onClick={() => move(i, i + 1)} />
              <IconBtn icon={Pencil} label={`Edit ${rule.id}`} onClick={() => setEditing({ form: toRuleForm(rule), isNew: false })} />
            </span>
            </span>
          </li>
        ))}
        <li className="flex flex-wrap items-center gap-2 text-sm text-muted" style={{ borderTop: props.view.rules.length ? '1px solid var(--border)' : undefined, padding: '6px 0' }} data-rule="(default)">
          <span style={{ minWidth: '8rem', paddingLeft: '1.25rem' }}>(default)</span>
          <span className="flex-1">Anything else -&gt; repository route on local</span>
        </li>
      </ol>
      {!props.view.rules.length && <p className="text-xs text-muted">No rules: every chat runs on this machine, as before. Add a rule to send work to another crew or model.</p>}
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
      {editing && (
        <RuleDialog
          view={props.view}
          form={editing.form}
          isNew={editing.isNew}
          models={models}
          onCancel={() => setEditing(null)}
          onDelete={() => {
            const saveIn = editing.form.saveIn
            void write(
              saveIn,
              rulesIn(props.view, saveIn).filter((r) => r.id !== editing.form.id),
            ).then(() => setEditing(null), (caught) => setMessage(errorMessage(caught)))
          }}
          onSave={async (form) => {
            const built = toRule(form)
            if (built.error) return built.error
            const own = rulesIn(props.view, form.saveIn)
            const at = own.findIndex((r) => r.id === built.rule!.id)
            if (editing.isNew && at >= 0) return `Rule ${form.id} already exists there.`
            const next = at >= 0 ? own.map((r, i) => (i === at ? built.rule! : r)) : [...own, built.rule!]
            try {
              await write(form.saveIn, next)
              setEditing(null)
              return null
            } catch (caught) {
              return errorMessage(caught)
            }
          }}
        />
      )}
    </Section>
  )
}

function PickSection(props: { view: View; workspaceId: string; onSaved: () => Promise<void> }) {
  const api = useAppApi()
  const client = useMemo(() => routingClient(api), [api])
  const [show, setShow] = useState(false)
  const [weights, setWeights] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const preset = props.view.pick.preset
  const save = async (pick: { preset?: string; weights?: Record<string, number> }) => {
    setMessage(null)
    try {
      await client.save(props.workspaceId, { where: 'workspace', routing: { ...props.view.workspace, pick }, expectedHash: props.view.configHash })
      await props.onSaved()
    } catch (caught) {
      setMessage(errorMessage(caught))
    }
  }
  return (
    <Section title="Smart pick" blurb="How Avoozl chooses among the crews a rule allows.">
      <ChoiceCards
        id="avoozl-pick"
        label="Smart pick"
        value={(preset === 'custom' ? 'balanced' : preset) as (typeof PRESETS)[number]['key']}
        onChange={(key) => void save({ preset: key })}
        cards={PRESETS.map((p) => ({ ...p }))}
      />
      {preset === 'custom' && <p className="text-xs text-muted">Custom weights are in use.</p>}
      <span>
        <Btn type="button" onClick={() => setShow(!show)} aria-expanded={show}>
          {show ? 'Hide weights' : 'Show weights'}
        </Btn>
      </span>
      {show && (
        <div className="flex flex-wrap items-end gap-3" data-weights>
          {Object.entries(props.view.pick.weights).map(([key, value]) => (
            <Field key={key} id={`avoozl-weight-${key}`} label={WEIGHT_LABELS[key] ?? key} raw={`routing.pick.weights.${key}`} width="11rem">
              <Input id={`avoozl-weight-${key}`} inputMode="decimal" value={weights[key] ?? ''} placeholder={String(value)} onChange={(e) => setWeights({ ...weights, [key]: e.target.value })} />
            </Field>
          ))}
          <Btn
            type="button"
            onClick={() => {
              const out: Record<string, number> = {}
              for (const [k, v] of Object.entries(weights)) if (v.trim()) out[k] = Number(v)
              void save({ preset: preset === 'custom' ? 'balanced' : preset, ...(Object.keys(out).length ? { weights: out } : {}) })
            }}
          >
            Save weights
          </Btn>
        </div>
      )}
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
    </Section>
  )
}

function RouterSection(props: { view: View; workspaceId: string; onSaved: () => Promise<void> }) {
  const api = useAppApi()
  const client = useMemo(() => routingClient(api), [api])
  const models = useModels()
  const machine = props.view.machine.router || {}
  const [on, setOn] = useState(props.view.router.enabled)
  const [model, setModel] = useState(props.view.router.model ?? '')
  const [timeout, setTimeoutText] = useState(machine.timeoutSeconds ? String(machine.timeoutSeconds) : '')
  const [instructions, setInstructions] = useState(props.view.instructions ?? '')
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  const save = async () => {
    setMessage(null)
    const t = timeout.trim() ? Number(timeout) : undefined
    if (t !== undefined && (!Number.isInteger(t) || t < 10 || t > 600)) return setMessage({ error: 'Time limit is a whole number of seconds, 10–600.' })
    const router = {
      enabled: on,
      ...(model ? { model } : {}),
      ...(t !== undefined ? { timeoutSeconds: t } : {}),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
    }
    try {
      await client.save(props.workspaceId, { where: 'machine', routing: { ...props.view.machine, router }, expectedHash: props.view.machineHash })
      await props.onSaved()
      setMessage({ ok: 'Saved.' })
    } catch (caught) {
      setMessage({ error: errorMessage(caught) })
    }
  }
  return (
    <Section title="Model router" blurb="Optional. A model ranks the allowed crews; rules still decide what is allowed.">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span className="font-medium">On</span>
        <Marker rule={OPTIONAL} />
        <span className="text-xs text-muted">Fallback: Smart pick, when the router fails or runs out of time.</span>
      </label>
      <div className="flex flex-wrap items-start gap-4">
        <Field id="avoozl-router-model" label="Model" raw="routing.router.model" width="18rem">
          <select id="avoozl-router-model" value={model || 'auto'} onChange={(e) => setModel(e.target.value === 'auto' ? '' : e.target.value)} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
            {modelOptions(models, model).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="avoozl-router-timeout" label="Time limit (seconds)" raw="routing.router.timeoutSeconds" width="16rem">
          <Input id="avoozl-router-timeout" inputMode="numeric" value={timeout} placeholder="90" onChange={(e) => setTimeoutText(e.target.value)} />
        </Field>
      </div>
      <Field id="avoozl-router-instructions" label="Instructions" raw="routing.router.instructions" note="Saved on this machine only.">
        <textarea
          id="avoozl-router-instructions"
          rows={3}
          value={instructions}
          placeholder="Prefer the build box for long test runs."
          onChange={(e) => setInstructions(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
          style={{ ...selectStyle, width: '100%', maxWidth: '48rem' }}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Btn type="button" primary onClick={() => void save()}>
          Save
        </Btn>
        {message?.error && (
          <span role="alert" className="text-sm text-danger">
            {message.error}
          </span>
        )}
        {message?.ok && <span className="text-sm text-muted">{message.ok}</span>}
      </div>
    </Section>
  )
}

function PreviewSection(props: { workspaceId: string; mc10: boolean; crews: Crew[] }) {
  const name = (id: string) => props.crews.find((c) => c.id === id)?.name ?? id
  const api = useAppApi()
  const client = useMemo(() => routingClient(api), [api])
  const [items, setItems] = useState<PreviewItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = () =>
    client.preview(props.workspaceId).then(
      (r) => {
        setItems(r.items)
        setError(null)
      },
      (caught) => setError(errorMessage(caught)),
    )
  return (
    <Section
      title="Preview"
      blurb="Where ready tasks would go now. Opens nothing."
      actions={
        <Btn type="button" onClick={() => void run()}>
          Preview
        </Btn>
      }
    >
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {items === null ? (
        <p className="text-xs text-muted">Press Preview to see each ready task's route, crew, agent and model, and why.</p>
      ) : !items.length ? (
        <p className="text-xs text-muted">No task is ready now.</p>
      ) : (
        <ul className="flex flex-col text-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }} data-preview>
          {items.map((item, i) => (
            <li key={item.taskId} style={{ borderTop: i ? '1px solid var(--border)' : undefined, padding: '6px 0' }} data-preview-task={item.taskId}>
              <span className="flex flex-wrap gap-x-3">
                <span className="font-medium">
                  {item.taskId} {item.title}
                </span>
                <span>{item.route === 'local' ? 'local worker' : item.route}</span>
                <span style={item.noFit ? needsYou : undefined}>{item.noFit ? 'no fit' : item.crew ? name(item.crew) : 'waits'}</span>
                <span className="text-muted">{[item.agent, item.model ?? 'auto'].filter(Boolean).join(' / ')}</span>
              </span>
              <span className="block text-xs text-muted" style={item.noFit ? needsYou : undefined}>
                {item.noFit ? `Needs you: ${item.reason}` : item.reason}
                {item.sessionReason ? ` · session: ${item.sessionReason}` : ''}
              </span>
              {item.whyNot.length > 0 && (
                <span className="block text-xs text-muted">
                  why not: {item.whyNot.map((w) => `${name(w.crew)} (${w.by})`).join('; ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!props.mc10 && items && items.some((i) => i.crew && i.crew !== 'local') && <p className="text-xs text-muted">Remote picks show where tasks would go; they run on local until Kiro Crew ships MC-10.</p>}
    </Section>
  )
}

export default function RoutingView({ workspaceId: given }: { workspaceId: string | null }) {
  const workspaceId = given ?? ''
  const api = useAppApi()
  const client = useMemo(() => routingClient(api), [api])
  const load = useCallback((id: string) => client.view(id), [client])
  const { value, error, reload } = useRead<View>(given, load)
  const saved = async () => {
    await reload()
  }
  return (
    <div className="flex flex-col gap-3" data-routing>
      <div>
        <ViewHeading id="avoozl-routing-heading" view="routing">
          Routing
        </ViewHeading>
        <p className="text-sm text-muted">Decide what does each task's work, and which crew and model run it.</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!value ? (
        !error && <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          {value.noFit.length > 0 && (
            <Card>
              <p className="text-sm" style={needsYou} data-no-fit>
                <Tooltip text="Change a rule or a crew's tags; the task starts when it fits.">
                  <span>
                    {value.noFit.length === 1 ? `No crew fits ${value.noFit[0].taskId}: ${value.noFit[0].text}.` : `No crew fits ${value.noFit.length} tasks: ${value.noFit.map((d) => d.taskId).join(', ')}.`}
                  </span>
                </Tooltip>
              </p>
            </Card>
          )}
          <Card className="flex flex-col gap-4">
            <CrewsSection view={value} workspaceId={workspaceId} onSaved={saved} />
          </Card>
          <Card className="flex flex-col gap-4">
            <RulesSection view={value} workspaceId={workspaceId} onSaved={saved} />
          </Card>
          <Card className="flex flex-col gap-4">
            <PickSection view={value} workspaceId={workspaceId} onSaved={saved} />
          </Card>
          <Card className="flex flex-col gap-4">
            <RouterSection view={value} workspaceId={workspaceId} onSaved={saved} />
          </Card>
          <Card className="flex flex-col gap-4">
            <PreviewSection workspaceId={workspaceId} mc10={value.mc10} crews={value.crews} />
          </Card>
        </>
      )}
    </div>
  )
}
