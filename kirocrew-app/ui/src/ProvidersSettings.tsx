// Settings › Providers (design §4.20 Page, R72.17): the machine `providers`
// key (thresholds, cooldown, limits, groups, fallback) and the health marks,
// with Undo for a person's. Saves write ~/.config/avoozl/config.json through
// providers.settings.update with the file's hash, never .avoozl.json.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Btn, Card, Input } from '@kirocrew/app-sdk/ui'
import { Marker, Section } from './SettingsView.tsx'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { canUndo, markText, providersClient, switchText, toProvidersForm, toProvidersSection, type ProvidersForm, type ProvidersView } from './providers-api.ts'

const OPTIONAL = { required: false } as const
const areaStyle = {
  borderColor: 'var(--border)',
  color: 'var(--text)',
  background: 'var(--card, transparent)',
}

function Labeled(props: { id: string; label: string; raw: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <label htmlFor={props.id} className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{props.label}</span>
        <Marker rule={OPTIONAL} />
      </label>
      {props.children}
      {props.note && <span className="text-xs text-muted">{props.note}</span>}
      <code className="text-[11px] text-muted">{props.raw}</code>
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
  return (
    <div className="flex flex-col gap-3" data-providers-settings>
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
        <Section title="Thresholds" blurb="When usage counts as low, and how long an error keeps a model out.">
          <div className="flex flex-wrap gap-4">
            <Labeled id="avoozl-providers-low" label="Low at (% of limit)" raw="providers.lowPercent">
              <Input
                id="avoozl-providers-low"
                inputMode="numeric"
                value={form.lowPercent}
                placeholder={String(d.lowPercent)}
                onChange={(e) => set({ lowPercent: e.target.value })}
              />
            </Labeled>
            <Labeled id="avoozl-providers-window" label="Usage window (hours)" raw="providers.windowHours">
              <Input
                id="avoozl-providers-window"
                inputMode="numeric"
                value={form.windowHours}
                placeholder={String(d.windowHours)}
                onChange={(e) => set({ windowHours: e.target.value })}
              />
            </Labeled>
            <Labeled id="avoozl-providers-cooldown" label="Error cooldown (minutes)" raw="providers.cooldownMinutes">
              <Input
                id="avoozl-providers-cooldown"
                inputMode="numeric"
                value={form.cooldownMinutes}
                placeholder={String(d.cooldownMinutes)}
                onChange={(e) => set({ cooldownMinutes: e.target.value })}
              />
            </Labeled>
          </div>
        </Section>
        <Section title="Limits and fallback" blurb="Limits turn usage into low and out. Fallback models take tasks whose every model is out.">
          <Labeled id="avoozl-providers-limits" label="Limits" raw="providers.limits" note="One per line: <provider or model> credits|tokens <amount>.">
            <textarea
              id="avoozl-providers-limits"
              rows={3}
              value={form.limits}
              onChange={(e) => set({ limits: e.target.value })}
              className="rounded border px-2 py-1 font-mono text-sm"
              style={areaStyle}
              placeholder="claude credits 500"
            />
          </Labeled>
          <Labeled
            id="avoozl-providers-groups"
            label="Groups"
            raw="providers.groups"
            note="One per line: <provider>: <pattern>, <pattern>. Without one, a model's provider is its ID's first word."
          >
            <textarea
              id="avoozl-providers-groups"
              rows={2}
              value={form.groups}
              onChange={(e) => set({ groups: e.target.value })}
              className="rounded border px-2 py-1 font-mono text-sm"
              style={areaStyle}
              placeholder="anthropic: claude-*"
            />
          </Labeled>
          <Labeled id="avoozl-providers-fallback" label="Fallback models" raw="providers.fallback" note="In order, separated by commas.">
            <Input id="avoozl-providers-fallback" value={form.fallback} onChange={(e) => set({ fallback: e.target.value })} />
          </Labeled>
        </Section>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Btn type="button" primary disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </Btn>
        {message?.error && (
          <span role="alert" className="text-sm text-danger">
            {message.error}
          </span>
        )}
        {message?.ok && <span className="text-sm text-muted">{message.ok}</span>}
        <span className="text-xs text-muted">Saved on this machine only.</span>
      </div>
    </div>
  )
}
