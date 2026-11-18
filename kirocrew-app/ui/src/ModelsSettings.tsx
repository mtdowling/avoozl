// Settings > Models: the one roles table (R98.6, R98.7). Per role, a themed
// harness picker and model picker, and for the worker and falsifier an
// agent field. It is the only page that picks these. Save writes `roles` in
// .avoozl.json with the file's hash and drops the older keys. Auto leaves
// the plan reviewer unset; other roles use their agent's own model and their
// project's harness.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input } from '@kirocrew/app-sdk/ui'
import { useAppApi } from './host.ts'
import { Picker } from './Picker.tsx'
import { optionItems } from './picker.ts'
import { SaveFooter } from './SaveFooter.tsx'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { modelOptions } from './flow-api.ts'
import {
  DEFAULT_AGENTS,
  KIROCREW_HARNESS,
  ROLES,
  harnessOptions,
  modelsClient,
  rolesProblem,
  toRoles,
  type ModelSettings,
  type Role,
  type RoleRow,
  type RoleTable,
} from './models-api.ts'

// shortcut: these roles do not run on a harness yet; drop a role here once
// its dispatch reads its harness.
const CHAT_ONLY = new Set<Role>(['falsifier', 'planReviewer', 'reviewDraft'])

export default function ModelsSettings({ workspaceId }: { workspaceId: string }) {
  const api = useAppApi()
  const client = useMemo(() => modelsClient(api), [api])
  const load = useCallback((id: string) => client.get(id), [client])
  const { value, error, reload } = useRead<ModelSettings>(workspaceId, load)
  const [form, setForm] = useState<RoleTable>({})
  const [list, setList] = useState<{ value: string; label: string }[]>([])
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (value) setForm(value.roles ?? {})
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
  const set = (role: Role, change: RoleRow) => {
    setMessage(null)
    setForm({ ...form, [role]: { ...form[role], ...change } })
  }
  const choices = (role: Role) =>
    modelOptions(list, form[role]?.model ?? '').map((option) =>
      role === 'planReviewer' && option.value === 'auto' ? { ...option, label: 'auto (no reviewer)' } : option,
    )
  const definitions = value.harnessDefinitions ?? []
  const changed = JSON.stringify(toRoles(form)) !== JSON.stringify(toRoles(value.roles ?? {}))
  const problem = rolesProblem(form)
  const save = async () => {
    if (problem) return
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
      <div className="grid gap-x-4 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }}>
        {ROLES.map((role) => {
          const row = form[role.key] ?? {}
          const harness = row.harness || 'auto'
          return (
            <div key={role.key} className="flex min-w-0 flex-col gap-1" data-model-role={role.key}>
              <span className="text-sm font-medium">{role.label}</span>
              <Picker
                id={`avoozl-harness-${role.key}`}
                label={<span className="text-xs text-muted">Harness</span>}
                items={optionItems(harnessOptions(definitions, row.harness ?? ''))}
                value={harness}
                onPick={(picked) => set(role.key, { harness: picked || 'auto' })}
                placeholder="Type to find a harness, or auto"
                plain
                maxWidth="20rem"
              />
              {role.agent && (
                <label className="flex flex-col gap-1" style={{ maxWidth: '20rem' }}>
                  <span className="text-xs text-muted">Agent</span>
                  <Input id={`avoozl-agent-${role.key}`} value={row.agent ?? ''} placeholder={DEFAULT_AGENTS[role.key]} onChange={(e) => set(role.key, { agent: e.target.value })} />
                </label>
              )}
              <Picker
                id={`avoozl-model-${role.key}`}
                label={<span className="text-xs text-muted">Model</span>}
                items={optionItems(choices(role.key))}
                value={row.model || 'auto'}
                onPick={(model) => set(role.key, { model: model || 'auto' })}
                placeholder="Type to find a model, or auto"
                plain
                maxWidth="20rem"
              />
              <span className="text-xs text-muted">{role.line}</span>
              {CHAT_ONLY.has(role.key) && harness !== 'auto' && harness !== KIROCREW_HARNESS && (
                <span className="text-xs text-muted" data-harness-pending>
                  Saved. This role still runs as a Kiro Crew chat until it can run on a harness.
                </span>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted" data-models-harness-note>
        A task’s <code>session</code> pin wins over its role’s harness, agent and model. Harness files live in this machine’s Avoozl config.
      </p>
      <p className="text-xs text-muted" data-models-person-only>
        Kiro Crew chats run as you. Avoozl refuses person-only actions in them, but that only slows an agent down: it is not a lock.
      </p>
      <SaveFooter
        dirty={changed}
        saving={saving}
        problem={problem ?? undefined}
        error={message?.error}
        ok={message?.ok}
        note="Writes roles in .avoozl.json."
        onSave={() => void save()}
        onDiscard={() => {
          setForm(value.roles ?? {})
          setMessage(null)
        }}
      />
    </div>
  )
}
