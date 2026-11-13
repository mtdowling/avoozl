// Settings › Routing (design §8.3, R42): off by default, every task runs on
// this machine. On, one routing prompt guides the routing agent, which picks
// a crew and a model for each ready task among the options that passed the
// hard checks. Sections: Routing prompt, Providers, Crews, Preview. Every
// edit goes through routing.update, providers.settings.update or
// crews.update with the machine file's hash; all of it stays on this
// machine.
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import { Modal } from './Modal.tsx'
import { Marker, Section } from './SettingsView.tsx'
import { AskForHelp, DangerBtn, IconBtn, IconLabel } from './controls.tsx'
import { COSTS_DOCS, helpSettings } from './budget-api.ts'
import { Pencil, Plus, Trash2 } from './icons.ts'
import { modelOptions, parseModels } from './flow-api.ts'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import {
  CHECK_LABELS,
  DEFAULT_STALE_SECONDS,
  MC10_LINE,
  OFF_LINE,
  PROMPT_LIMIT,
  chatPlaceholder,
  checkText,
  crewMap,
  insertExample,
  levelText,
  optionText,
  readingText,
  routingClient,
  toCrewEntry,
  toCrewForm,
  toProviderBox,
  toRoutingSection,
  usedText,
  type Crew,
  type CrewForm,
  type Preview,
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

function Status(props: { message: { ok?: string; error?: string } | null }) {
  if (props.message?.error)
    return (
      <span role="alert" className="text-sm text-danger">
        {props.message.error}
      </span>
    )
  return props.message?.ok ? (
    <span role="status" className="text-sm text-muted">
      {props.message.ok}
    </span>
  ) : null
}

function PromptSection(props: { view: View; workspaceId: string; onSaved: () => Promise<void> }) {
  const api = useAppApi()
  const client = useMemo(() => routingClient(api), [api])
  const models = useModels()
  const [on, setOn] = useState(props.view.switchedOn)
  const [prompt, setPrompt] = useState(props.view.prompt ?? '')
  const [model, setModel] = useState(props.view.model ?? '')
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  const save = async () => {
    setMessage(null)
    const built = toRoutingSection({ enabled: on, prompt, model })
    if (built.error) return setMessage({ error: built.error })
    try {
      await client.save(props.workspaceId, { routing: built.routing!, expectedHash: props.view.machineHash })
      await props.onSaved()
      setMessage({ ok: 'Saved.' })
    } catch (caught) {
      setMessage({ error: errorMessage(caught) })
    }
  }
  const call = props.view.lastCall
  return (
    <Section title="Routing prompt" blurb="Tell the routing agent how to choose. It only picks among crews and models that pass the checks below.">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" role="switch" aria-checked={on} checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span className="font-medium">On</span>
        <Marker rule={OPTIONAL} />
        <span className="text-xs text-muted">{on ? 'One call each tick ranks every ready task. A bad or missing reply falls back to local.' : OFF_LINE}</span>
      </label>
      <Field id="avoozl-routing-prompt" label="Prompt" raw="routing.prompt" note={`Saved on this machine only. At most ${PROMPT_LIMIT} characters. A crew or model pinned in a task's manifest still wins.`}>
        <textarea
          id="avoozl-routing-prompt"
          rows={5}
          value={prompt}
          maxLength={PROMPT_LIMIT}
          placeholder="Tests go remote. Everything else stays local."
          onChange={(e) => setPrompt(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
          style={{ ...selectStyle, width: '100%', maxWidth: '48rem' }}
        />
      </Field>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Examples</span>
        <span className="text-xs text-muted">Insert one, then edit it.</span>
        <div className="flex flex-wrap gap-2" data-examples>
          {props.view.examples.map((example) => (
            <IconLabel key={example.id} icon={Plus} tooltip={example.text} onClick={() => setPrompt(insertExample(prompt, example))}>
              {example.title}
            </IconLabel>
          ))}
        </div>
      </div>
      <Field id="avoozl-routing-model" label="Routing agent's model" raw="routing.model" width="18rem">
        <select id="avoozl-routing-model" value={model || 'auto'} onChange={(e) => setModel(e.target.value === 'auto' ? '' : e.target.value)} className="rounded border px-2 py-1 text-sm" style={selectStyle}>
          {modelOptions(models, model).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Btn type="button" primary onClick={() => void save()}>
          Save
        </Btn>
        <Status message={message} />
      </div>
      {call && (
        <p className="text-xs text-muted" data-last-call>
          Last call {call.id}: {call.tasks} task{call.tasks === 1 ? '' : 's'}, {call.state === 'fallback' || (call.state === 'used' && call.why) ? `fell back to local (${call.why})` : call.state}.
        </p>
      )}
    </Section>
  )
}

function ProvidersSection(props: { view: View; workspaceId: string; onSaved: () => Promise<void> }) {
  const api = useAppApi()
  const client = useMemo(() => routingClient(api), [api])
  const box = props.view.providers
  const start = () => ({
    lowPercent: box.lowPercent === null ? '' : String(box.lowPercent),
    limits: Object.fromEntries(box.rows.map((r) => [r.provider, box.limits[r.provider]?.credits ? String(box.limits[r.provider].credits) : ''])),
  })
  const [form, setForm] = useState(start)
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  useEffect(() => setForm(start()), [props.view])
  const save = async () => {
    setMessage(null)
    const built = toProviderBox(form, box.limits)
    if (built.error) return setMessage({ error: built.error })
    try {
      await client.saveProviders(props.workspaceId, { providers: built.providers!, expectedHash: box.hash })
      await props.onSaved()
      setMessage({ ok: 'Saved.' })
    } catch (caught) {
      setMessage({ error: errorMessage(caught) })
    }
  }
  return (
    <Section
      title="Providers"
      blurb="Health and usage in the last 5 hours, read live. Out is never offered; low is a fact the prompt can weigh. A running chat switches model only when its provider is out."
      actions={
        <AskForHelp
          workspaceId={props.workspaceId}
          help={{
            page: 'Settings › Routing',
            section: 'Providers',
            says: 'When a provider counts as low or out, from its credit limit per 5 hours. Blank fields use the default.',
            settings: helpSettings({
              providers: { lowPercent: form.lowPercent, limits: Object.entries(form.limits).filter(([, v]) => v.trim()).map(([p, v]) => `${p} ${v} credits`) },
              defaults: `low at ${box.defaultLowPercent}%, no limits`,
            }),
            docs: COSTS_DOCS,
          }}
        />
      }
    >
      {box.rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="text-sm" style={{ borderCollapse: 'collapse', width: '100%' }} data-providers>
            <thead>
              <tr className="text-xs text-muted">
                {['Provider', 'Health', 'Usage', 'Limit (credits per 5 h)'].map((h) => (
                  <th key={h} style={cell}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {box.rows.map((row) => (
                <tr key={row.provider} style={{ borderTop: '1px solid var(--border)' }} data-provider={row.provider}>
                  <td style={cell} className="font-medium">
                    {row.provider}
                  </td>
                  <td style={{ ...cell, ...(row.level === 'out' ? needsYou : {}) }}>
                    {levelText(row.level)}
                    {row.why && row.level !== 'ok' ? <span className="block text-xs text-muted">{row.why}</span> : null}
                  </td>
                  <td style={cell}>{usedText(row)}</td>
                  <td style={{ ...cell, width: '10rem' }}>
                    <Input
                      aria-label={`${row.provider} limit in credits per 5 hours`}
                      inputMode="decimal"
                      value={form.limits[row.provider] ?? ''}
                      placeholder="none"
                      onChange={(e) => setForm({ ...form, limits: { ...form.limits, [row.provider]: e.target.value } })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted">No provider has usage or a health mark yet.</p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field id="avoozl-providers-low" label="Low at (% of limit)" raw="providers.lowPercent" width="12rem">
          <Input id="avoozl-providers-low" inputMode="numeric" value={form.lowPercent} placeholder={String(box.defaultLowPercent)} onChange={(e) => setForm({ ...form, lowPercent: e.target.value })} />
        </Field>
        <Btn type="button" onClick={() => void save()}>
          Save
        </Btn>
        <Status message={message} />
      </div>
    </Section>
  )
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
      unsaved={JSON.stringify(form) !== JSON.stringify(toCrewForm(props.crew)) && { title: `Discard your changes to ${props.crew.name}?`, body: 'Every edit in this dialog is lost.', action: 'Discard changes' }}
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
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  useEffect(() => setStale(props.view.staleSeconds === null ? '' : String(props.view.staleSeconds)), [props.view.staleSeconds])
  const saveMap = async (crews: Record<string, unknown>) => {
    await client.saveCrews(props.workspaceId, { crews, expectedHash: props.view.machineHash })
    await props.onSaved()
  }
  const saveStale = async () => {
    setMessage(null)
    const n = stale.trim() ? Number(stale) : null
    if (n !== null && (!Number.isInteger(n) || n < 10 || n > 3600)) return setMessage({ error: 'Stale after is a whole number of seconds, 10–3600.' })
    try {
      await client.saveCrews(props.workspaceId, { staleSeconds: n, expectedHash: props.view.machineHash })
      await props.onSaved()
      setMessage({ ok: 'Saved.' })
    } catch (caught) {
      setMessage({ error: errorMessage(caught) })
    }
  }
  return (
    <Section title="Crews" blurb="Machines that can run Avoozl chats, with the checks every option must pass. Tags and limits stay on this machine.">
      <div style={{ overflowX: 'auto' }}>
        <table className="text-sm" style={{ borderCollapse: 'collapse', width: '100%' }} data-crews>
          <thead>
            <tr className="text-xs text-muted">
              {['Crew', 'Tags', 'Chats', 'Load', 'Memory', ...Object.values(CHECK_LABELS), ''].map((h) => (
                <th key={h} style={cell}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.view.crews.map((crew) => {
              const r = readingText(crew)
              return (
                <tr key={crew.id} style={{ borderTop: '1px solid var(--border)' }} data-crew={crew.id}>
                  <td style={{ ...cell, minWidth: '9rem' }}>
                    <span className="font-medium">{crew.name}</span>
                    {crew.name !== crew.id && <span className="block text-xs text-muted">{crew.id}</span>}
                    <span className="block text-xs text-muted">{crew.trust}</span>
                  </td>
                  <td style={cell}>{crew.tags.filter((t) => !t.startsWith('trust:')).join(' ') || <span className="text-muted">none</span>}</td>
                  <td style={cell}>
                    {crew.running}/{crew.chatLimit}
                  </td>
                  <td style={cell}>{r.load}</td>
                  <td style={cell}>{r.mem}</td>
                  {crew.checks.map((check) => (
                    <td key={check.check} style={cell} className={check.ok ? undefined : 'text-muted'} data-check={check.check}>
                      {checkText(check)}
                    </td>
                  ))}
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
      <Field id="avoozl-stale" label="Stale after (seconds)" raw="crewStaleSeconds" note="A crew whose reading is older is not online." width="22rem">
        <span className="flex items-center gap-2">
          <span style={{ width: '8rem' }}>
            <Input id="avoozl-stale" inputMode="numeric" value={stale} placeholder={String(DEFAULT_STALE_SECONDS)} onChange={(e) => setStale(e.target.value)} />
          </span>
          <Btn type="button" onClick={() => void saveStale()}>
            Save
          </Btn>
          <Status message={message} />
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

function PreviewSection(props: { workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => routingClient(api), [api])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = () =>
    client.preview(props.workspaceId).then(
      (r) => {
        setPreview(r)
        setError(null)
      },
      (caught) => setError(errorMessage(caught)),
    )
  return (
    <Section
      title="Preview"
      blurb="A dry run on the ready tasks now: what passes the checks, and what the routing agent would get. Opens nothing and calls no agent."
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
      {preview === null ? (
        <p className="text-xs text-muted">Press Preview to see each ready task's options and what happens to it.</p>
      ) : !preview.items.length ? (
        <p className="text-xs text-muted">No task is ready now.</p>
      ) : (
        <ul className="flex flex-col text-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }} data-preview>
          {preview.items.map((item, i) => (
            <li key={item.taskId} style={{ borderTop: i ? '1px solid var(--border)' : undefined, padding: '6px 0' }} data-preview-task={item.taskId}>
              <span className="flex flex-wrap gap-x-3">
                <span className="font-medium">
                  {item.taskId} {item.title}
                </span>
                <span style={item.noFit ? needsYou : undefined}>
                  {item.outcome.crew ? `${item.outcome.crew} / ${item.outcome.model ?? 'default'}: ` : ''}
                  {item.noFit ? `Needs you: ${item.outcome.text}` : item.outcome.text}
                </span>
              </span>
              {item.options.length > 1 && <span className="block text-xs text-muted">options: {item.options.map(optionText).join('; ')}</span>}
              {item.removed.length > 0 && <span className="block text-xs text-muted">ruled out: {item.removed.map((w) => `${w.crew ?? w.model} (${w.by})`).join('; ')}</span>}
            </li>
          ))}
        </ul>
      )}
      {preview?.brief && (
        <details className="text-sm" data-brief>
          <summary>What the routing agent would get</summary>
          <pre className="text-xs" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '24rem', overflowY: 'auto' }}>
            {preview.brief}
          </pre>
        </details>
      )}
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
                {value.noFit.length === 1 ? `No crew fits ${value.noFit[0].taskId}: ${value.noFit[0].text}.` : `No crew fits ${value.noFit.length} tasks: ${value.noFit.map((d) => d.taskId).join(', ')}.`}
              </p>
            </Card>
          )}
          <Card className="flex flex-col gap-4">
            <PromptSection view={value} workspaceId={workspaceId} onSaved={saved} />
          </Card>
          <Card className="flex flex-col gap-4">
            <ProvidersSection view={value} workspaceId={workspaceId} onSaved={saved} />
          </Card>
          <Card className="flex flex-col gap-4">
            <CrewsSection view={value} workspaceId={workspaceId} onSaved={saved} />
          </Card>
          <Card className="flex flex-col gap-4">
            <PreviewSection workspaceId={workspaceId} />
          </Card>
        </>
      )}
    </div>
  )
}
