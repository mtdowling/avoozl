// Settings › Providers (design §4.20 Page, R72.17): the machine `providers`
// key (thresholds, cooldown, limits, groups, fallback) and the health marks,
// with Undo for a person's. Thresholds are a few plain fields in titled
// boxes, each showing its default; the window, cooldown and groups fold
// away under Advanced. Saves write ~/.config/avoozl/config.json through
// providers.settings.update with the file's hash, never .avoozl.json.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from '@kirocrew/app-sdk'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import { Marker, Section } from './SettingsView.tsx'
import { FieldBox } from './FieldBox.tsx'
import { COSTS_DOCS, COSTS_SKILL } from './help-chat.ts'
import { AskForHelp } from './AskForHelp.tsx'
import { Fold } from './controls.tsx'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import {
  canUndo,
  emptyLimit,
  markText,
  providersClient,
  switchText,
  toProvidersForm,
  toProvidersSection,
  type LimitRow,
  type ProvidersForm,
  type ProvidersView,
} from './providers-api.ts'

const OPTIONAL = { required: false } as const
const areaStyle = {
  borderColor: 'var(--border)',
  color: 'var(--text)',
  background: 'var(--card, transparent)',
}
const selectStyle = { ...areaStyle, borderWidth: 1, borderStyle: 'solid', borderRadius: 6, padding: '4px 6px' }

function Labeled(props: { id: string; label: string; raw: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm" style={{ width: '100%', maxWidth: '20rem' }}>
      <label htmlFor={props.id} className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{props.label}</span>
        <Marker rule={OPTIONAL} />
      </label>
      {props.children}
      {props.note && (
        <span id={`${props.id}-note`} className="text-xs text-muted">
          {props.note}
        </span>
      )}
      <code className="text-[11px] text-muted">{props.raw}</code>
    </div>
  )
}

// One limit row: provider or model, unit, amount, and Remove.
function LimitEditor(props: { rows: LimitRow[]; onChange: (rows: LimitRow[]) => void }) {
  const set = (i: number, change: Partial<LimitRow>) => props.onChange(props.rows.map((row, j) => (j === i ? { ...row, ...change } : row)))
  return (
    <div className="flex flex-col gap-2">
      {props.rows.length === 0 && <p className="text-sm text-muted">No limits. Usage never marks a provider low.</p>}
      {props.rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2" data-limit-row>
          <label className="flex flex-col gap-0.5 text-xs" style={{ flex: '1 1 10rem', minWidth: 0 }}>
            Provider or model
            <Input value={row.name} placeholder="claude" onChange={(e) => set(i, { name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5 text-xs" style={{ width: '7rem' }}>
            Amount
            <Input inputMode="numeric" value={row.amount} placeholder="500" onChange={(e) => set(i, { amount: e.target.value })} />
          </label>
          <label className="flex flex-col gap-0.5 text-xs" style={{ width: '7rem' }}>
            Unit
            <select value={row.unit} onChange={(e) => set(i, { unit: e.target.value as LimitRow['unit'] })} className="text-sm" style={selectStyle}>
              <option value="credits">credits</option>
              <option value="tokens">tokens</option>
            </select>
          </label>
          <Btn type="button" aria-label={`Remove the limit for ${row.name || 'this row'}`} onClick={() => props.onChange(props.rows.filter((_, j) => j !== i))}>
            Remove
          </Btn>
        </div>
      ))}
      <div>
        <Btn type="button" onClick={() => props.onChange([...props.rows, emptyLimit()])}>
          Add a limit
        </Btn>
      </div>
    </div>
  )
}

export default function ProvidersSettings({ workspaceId }: { workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => providersClient(api), [api])
  const load = useCallback((id: string) => client.view(id), [client])
  const { value, error, reload } = useRead<ProvidersView>(workspaceId, load)
  const [form, setForm] = useState<ProvidersForm>(toProvidersForm())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    error?: string
    ok?: string
  } | null>(null)
  useEffect(() => {
    if (value) setForm(toProvidersForm(value.settings))
  }, [value])
  const set = (change: Partial<ProvidersForm>) => setForm({ ...form, ...change })
  const save = async () => {
    if (!value) return
    const built = toProvidersSection(form)
    if (built.error) return setMessage({ error: built.error })
    setSaving(true)
    setMessage(null)
    try {
      await client.save(workspaceId, {
        providers: built.providers!,
        expectedHash: value.hash,
      })
      setMessage({ ok: 'Saved.' })
      await reload()
    } catch (caught) {
      setMessage({ error: errorMessage(caught) })
    } finally {
      setSaving(false)
    }
  }
  const undo = async (id: string) => {
    setMessage(null)
    try {
      await client.clear(workspaceId, id)
      await reload()
    } catch (caught) {
      setMessage({ error: errorMessage(caught) })
    }
  }
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  if (!value) return <p className="text-sm text-muted">Loading…</p>
  const d = value.defaults
  const windowHours = form.windowHours.trim() || String(d.windowHours)
  const help = () => ({
    page: 'Settings > Providers',
    purpose: 'Its Thresholds decide when a provider or model counts as low or out, so new tasks skip it, and which models take over.',
    settings: { current: toProvidersSection(form).providers ?? value.settings, defaults: d },
    skill: COSTS_SKILL,
    docs: COSTS_DOCS,
  })
  return (
    <div className="flex flex-col gap-3" data-providers-settings>
      <div className="flex flex-wrap items-center gap-2">
        <AskForHelp context={help} />
      </div>
      <Card className="flex flex-col gap-3">
        <Section title="Health" blurb="Low and out providers and models. New tasks skip them; running chats on an out model switch at their next turn.">
          {value.marks.length ? (
            <ul className="flex flex-col gap-1 text-sm" aria-label="Health marks">
              {value.marks.map((mark) => (
                <li key={mark.id} className="flex flex-wrap items-center gap-2">
                  <span>{markText(mark)}</span>
                  {canUndo(mark) && (
                    <Btn type="button" onClick={() => void undo(mark.id)} aria-label={`Undo: ${markText(mark)}`}>
                      Undo
                    </Btn>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Every provider is ok.</p>
          )}
          {value.switches.length > 0 && (
            <>
              <h4 className="text-sm font-medium">Recent switches</h4>
              <ul className="flex flex-col gap-0.5 text-sm">
                {value.switches.slice(0, 10).map((entry) => (
                  <li key={entry.id}>
                    {entry.taskId} · {switchText(entry)} <span className="text-xs text-muted">by {entry.by}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      </Card>
      <Card className="flex flex-col gap-4">
        <Section title="Thresholds" blurb="When a provider or model counts as low or out. New tasks skip it, and fallback models take over when every model a task may use is out. Blank fields use the default shown.">
          <FieldBox title="Low and out" blurb="A provider or model is low at this share of its limit, and out at 100%.">
            <Labeled id="avoozl-providers-low" label="Low at (% of its limit)" raw="providers.lowPercent" note={`Blank: ${d.lowPercent}%`}>
              <Input
                id="avoozl-providers-low"
                inputMode="numeric"
                value={form.lowPercent}
                placeholder={String(d.lowPercent)}
                aria-describedby="avoozl-providers-low-note"
                onChange={(e) => set({ lowPercent: e.target.value })}
              />
            </Labeled>
          </FieldBox>
          <FieldBox title="Limits" blurb={`How much each provider or model may use in ${windowHours} hours. Without a limit, usage never marks it low.`}>
            <LimitEditor rows={form.limits} onChange={(limits) => set({ limits })} />
            <code className="text-[11px] text-muted">providers.limits</code>
          </FieldBox>
          <FieldBox title="Fallback models" blurb="Used, in order, when every model a task may use is out.">
            <Labeled id="avoozl-providers-fallback" label="Fallback models" raw="providers.fallback" note="Blank: no fallback. Separate models with commas.">
              <Input
                id="avoozl-providers-fallback"
                value={form.fallback}
                placeholder="claude-haiku-4.5, claude-sonnet-4.5"
                aria-describedby="avoozl-providers-fallback-note"
                onChange={(e) => set({ fallback: e.target.value })}
              />
            </Labeled>
          </FieldBox>
          <Fold title="Advanced: usage window, error cooldown, provider groups" id="providers-advanced">
            <div className="flex flex-col gap-3">
              <FieldBox title="Timing">
                <div className="flex flex-wrap gap-3">
                  <Labeled id="avoozl-providers-window" label="Usage window (hours)" raw="providers.windowHours" note={`Blank: ${d.windowHours} hours. How far back usage counts toward a limit.`}>
                    <Input
                      id="avoozl-providers-window"
                      inputMode="numeric"
                      value={form.windowHours}
                      placeholder={String(d.windowHours)}
                      aria-describedby="avoozl-providers-window-note"
                      onChange={(e) => set({ windowHours: e.target.value })}
                    />
                  </Labeled>
                  <Labeled
                    id="avoozl-providers-cooldown"
                    label="Error cooldown (minutes)"
                    raw="providers.cooldownMinutes"
                    note={`Blank: ${d.cooldownMinutes} minutes. How long a rate limit or credit error keeps a model out.`}
                  >
                    <Input
                      id="avoozl-providers-cooldown"
                      inputMode="numeric"
                      value={form.cooldownMinutes}
                      placeholder={String(d.cooldownMinutes)}
                      aria-describedby="avoozl-providers-cooldown-note"
                      onChange={(e) => set({ cooldownMinutes: e.target.value })}
                    />
                  </Labeled>
                </div>
              </FieldBox>
              <FieldBox title="Provider groups" blurb="Which models belong to a provider. Blank: a model's provider is the first word of its ID, so claude-sonnet-4.5 is claude.">
                <Labeled id="avoozl-providers-groups" label="Groups" raw="providers.groups" note="One per line: provider, a colon, then model patterns with * (anthropic: claude-*).">
                  <textarea
                    id="avoozl-providers-groups"
                    rows={2}
                    value={form.groups}
                    aria-describedby="avoozl-providers-groups-note"
                    onChange={(e) => set({ groups: e.target.value })}
                    className="rounded border px-2 py-1 font-mono text-sm"
                    style={areaStyle}
                    placeholder="anthropic: claude-*"
                  />
                </Labeled>
              </FieldBox>
            </div>
          </Fold>
        </Section>
        <div className="flex flex-wrap items-center gap-3">
          <Btn type="button" primary disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </Btn>
          {message?.error && (
            <span role="alert" className="text-sm text-danger">
              {message.error}
            </span>
          )}
          {message?.ok && (
            <span role="status" className="text-sm text-muted">
              {message.ok}
            </span>
          )}
          <span className="text-xs text-muted">Saved on this computer only.</span>
        </div>
      </Card>
    </div>
  )
}
