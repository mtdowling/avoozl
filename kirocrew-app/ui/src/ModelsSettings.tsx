// Settings > Models: one themed picker per Avoozl chat role (planner, driver,
// retro, review drafts and plan reviewer). Save writes `models` in .avoozl.json
// with the file's hash. Auto leaves the plan reviewer unset; other roles
// use their agent's own model.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import { Picker } from './Picker.tsx'
import { optionItems } from './picker.ts'
import { SmallBtn } from './controls.tsx'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { modelOptions } from './flow-api.ts'
import { MODEL_ROLES, modelsClient, toModels, type ChatModels, type ModelRole, type ModelSettings } from './models-api.ts'

export default function ModelsSettings({ workspaceId }: { workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => modelsClient(api), [api])
  const load = useCallback((id: string) => client.get(id), [client])
  const { value, error, reload } = useRead<ModelSettings>(workspaceId, load)
  const [form, setForm] = useState<ChatModels>({})
  const [list, setList] = useState<{ value: string; label: string }[]>([])
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (value) setForm(value.models)
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
  const changed = JSON.stringify(toModels(form)) !== JSON.stringify(toModels(value.models))
  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await client.save(workspaceId, form, value.hash)
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
      <div className="grid gap-x-4 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }}>
        {MODEL_ROLES.map((role) => (
          <div key={role.key} className="flex min-w-0 flex-col gap-0.5" data-model-role={role.key}>
            <Picker
              id={`avoozl-model-${role.key}`}
              label={<span className="text-sm font-medium">{role.label}</span>}
              items={optionItems(choices(role.key))}
              value={form[role.key] || 'auto'}
              onPick={(model) => setForm({ ...form, [role.key]: model || 'auto' })}
              placeholder="Type to find a model, or auto"
              plain
              maxWidth="20rem"
            />
            <span className="text-xs text-muted">{role.line}</span>
          </div>
        ))}
      </div>
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
        <code className="text-[11px] text-muted">models</code>
      </div>
    </div>
  )
}
