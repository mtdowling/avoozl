// Settings > Models: per role, a themed harness picker and, for Avoozl's own
// chats (planner, retro, review drafts and plan reviewer), a model picker
// (R98.3). Save writes `models` and `harnesses` in .avoozl.json with the
// file's hash. Auto leaves the plan reviewer unset; other roles use their
// agent's own model and their project's harness.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Picker } from './Picker.tsx'
import { optionItems } from './picker.ts'
import { SmallBtn } from './controls.tsx'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { modelOptions } from './flow-api.ts'
import {
  HARNESS_ROLES,
  KIROCREW_HARNESS,
  harnessOptions,
  modelsClient,
  toHarnesses,
  toModels,
  type ChatModels,
  type HarnessRole,
  type ModelRole,
  type ModelSettings,
  type RoleHarnesses,
} from './models-api.ts'

const hasModel = (role: HarnessRole): role is ModelRole => role !== 'worker'

export default function ModelsSettings({ workspaceId }: { workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => modelsClient(api), [api])
  const load = useCallback((id: string) => client.get(id), [client])
  const { value, error, reload } = useRead<ModelSettings>(workspaceId, load)
  const [form, setForm] = useState<ChatModels>({})
  const [harnesses, setHarnesses] = useState<RoleHarnesses>({})
  const [list, setList] = useState<{ value: string; label: string }[]>([])
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (value) {
      setForm(value.models)
      setHarnesses(value.harnesses ?? {})
    }
  }, [value])
  useEffect(() => {
    let live = true
    client.list().then(
      (models) => live && setList(models),
      () => live && setList([]),
    )
    return () => {
      live = false
    }
  }, [client])
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  if (!value) return <p className="text-sm text-muted">Loading…</p>
  const choices = (role: ModelRole) => modelOptions(list, form[role] ?? '').map((option) =>
    role === 'planReviewer' && option.value === 'auto' ? { ...option, label: 'auto (no reviewer)' } : option,
  )
  const definitions = value.harnessDefinitions ?? []
  const changed =
    JSON.stringify(toModels(form)) !== JSON.stringify(toModels(value.models)) ||
    JSON.stringify(toHarnesses(harnesses)) !== JSON.stringify(toHarnesses(value.harnesses ?? {}))
  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await client.save(workspaceId, form, harnesses, value.hash)
      await reload()
      setMessage({ ok: 'Saved to .avoozl.json.' })
    } catch (caught) {
      setMessage({ error: errorMessage(caught) })
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="flex flex-col gap-2" data-models-settings>
      <div className="grid gap-x-4 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }}>
        {HARNESS_ROLES.map((role) => {
          const harness = harnesses[role.key] || 'auto'
          return (
            <div key={role.key} className="flex min-w-0 flex-col gap-1" data-model-role={role.key}>
              <span className="text-sm font-medium">{role.label}</span>
              <Picker
                id={`avoozl-harness-${role.key}`}
                label={<span className="text-xs text-muted">Harness</span>}
                items={optionItems(harnessOptions(definitions, harnesses[role.key] ?? ''))}
                value={harness}
                onPick={(picked) => setHarnesses({ ...harnesses, [role.key]: picked || 'auto' })}
                placeholder="Type to find a harness, or auto"
                plain
                maxWidth="20rem"
              />
              {hasModel(role.key) && (
                <Picker
                  id={`avoozl-model-${role.key}`}
                  label={<span className="text-xs text-muted">Model</span>}
                  items={optionItems(choices(role.key))}
                  value={form[role.key] || 'auto'}
                  onPick={(model) => setForm({ ...form, [role.key]: model || 'auto' })}
                  placeholder="Type to find a model, or auto"
                  plain
                  maxWidth="20rem"
                />
              )}
              <span className="text-xs text-muted">{role.line}</span>
              {/* shortcut: only the worker follows a non-chat harness until Phase 49 moves the other roles; drop this line then. */}
              {hasModel(role.key) && harness !== 'auto' && harness !== KIROCREW_HARNESS && (
                <span className="text-xs text-muted" data-harness-pending>
                  Saved. This role still runs as a Kiro Crew chat until it can run on a harness.
                </span>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted" data-models-harness-note>
        A task’s <code>session.harness</code> pin wins over the role’s harness. Harness files live in this machine’s Avoozl config.
      </p>
      <p className="text-xs text-muted" data-models-person-only>
        Kiro Crew chats run as you. Avoozl refuses person-only actions in them, but that only slows an agent down: it is not a lock.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SmallBtn primary onClick={() => void save()} disabled={saving || !changed} attrs={{ 'data-models-save': true }}>
          {saving ? 'Saving…' : 'Save'}
        </SmallBtn>
        {message?.error && (
          <span role="alert" className="text-sm text-danger">
            {message.error}
          </span>
        )}
        {message?.ok && <span className="text-xs text-muted">{message.ok}</span>}
      </div>
    </div>
  )
}
