// Settings > Models: the harnesses on this machine once at the top, then one
// row per role (role | harness | model | source). A role shows "default"
// until a harness or model is set here, and Reset puts it back. A model a
// harness cannot take is dropped on pick and blocks Save if loaded (R98.3).
// Save writes `models` and `harnesses` in .avoozl.json with the file's hash.
// Auto leaves the plan reviewer unset; other roles use their agent's own
// model and their project's harness.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppApi } from './host.ts'
import Badge from './Badge.tsx'
import { FieldRow } from './FieldRow.tsx'
import { FormSection } from './FormSection.tsx'
import { Picker } from './Picker.tsx'
import { optionItems } from './picker.ts'
import { SmallBtn } from './controls.tsx'
import { SaveFooter } from './SaveFooter.tsx'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { modelOptions } from './flow-api.ts'
import {
  HARNESS_ROLES,
  ROLE_ACCESS,
  harnessTakesModel,
  roleIsSet,
  roleProblem,
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
const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } as const
// One column on a phone; role | harness | model | source from 1000px.
const ROW_CSS = '[data-model-role]{display:grid;grid-template-columns:minmax(0,1fr);gap:8px 16px}@media (min-width:1000px){[data-model-role]{grid-template-columns:11rem minmax(0,1fr) minmax(0,1fr) 10rem}}[data-model-role]~[data-model-role]{border-top:1px solid var(--border);padding-top:12px}'
// shortcut: these roles do not run on a harness yet; drop a role here once
// its dispatch reads `harnesses`.
const CHAT_ONLY = new Set<HarnessRole>(['planReviewer', 'reviewDraft'])

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
  const problems = HARNESS_ROLES.map((role) => roleProblem(role.key, form, harnesses, definitions)).filter(Boolean) as string[]
  const pickHarness = (role: HarnessRole, picked: string) => {
    const next = picked || 'auto'
    setHarnesses({ ...harnesses, [role]: next })
    if (hasModel(role) && !harnessTakesModel(next, definitions)) setForm({ ...form, [role]: 'auto' })
  }
  const reset = (role: HarnessRole) => {
    setHarnesses({ ...harnesses, [role]: 'auto' })
    if (hasModel(role)) setForm({ ...form, [role]: 'auto' })
  }
  return (
    <div className="flex flex-col gap-4" data-models-settings>
      <style href="avoozl-models-rows" precedence="default">
        {ROW_CSS}
      </style>
      <FormSection title="Harnesses on this machine" blurb="Harness files live in this machine’s Avoozl config. Each is approved by its file hash.">
        <ul className="flex flex-wrap text-sm" style={{ columnGap: 24, rowGap: 8 }} data-models-harnesses>
          <li className="flex items-center gap-2">
            Kiro Crew chat <Badge variant="success">built in</Badge>
          </li>
          {definitions.map((d) => (
            <li key={d.name} className="flex items-center gap-2" data-harness-definition={d.name}>
              {d.name} <Badge variant={d.approved ? 'success' : 'warning'}>{d.approved ? 'hash approved' : 'not approved'}</Badge>
            </li>
          ))}
        </ul>
        {definitions.length === 0 && <span className="text-xs text-muted">No harness files here. Roles run as Kiro Crew chats or on their project’s executor.</span>}
      </FormSection>
      <FormSection title="Roles" blurb="Each role runs on its default until you set it here. A task’s session.harness pin wins over the role’s harness.">
        <div className="flex flex-col gap-3">
          {HARNESS_ROLES.map((role) => {
            const harness = harnesses[role.key] || 'auto'
            const set = roleIsSet(role.key, form, harnesses)
            const problem = roleProblem(role.key, form, harnesses, definitions)
            const picked = definitions.find((d) => d.name === harness)
            const modelFree = hasModel(role.key) && !harnessTakesModel(harness, definitions)
            return (
              <div key={role.key} data-model-role={role.key} data-source={set ? 'set here' : 'default'} className="min-w-0 text-sm">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{role.label}</span>
                  <span className="text-xs text-muted" data-role-access={ROLE_ACCESS[role.key]}>
                    {ROLE_ACCESS[role.key] === 'write' ? 'Writes files' : 'Read-only'}
                  </span>
                </div>
                <FieldRow id={`avoozl-harness-${role.key}`} label="Harness">
                  <Picker
                    id={`avoozl-harness-${role.key}`}
                    label={<span style={HIDDEN}>{role.label} harness</span>}
                    items={optionItems(harnessOptions(definitions, harnesses[role.key] ?? ''))}
                    value={harness}
                    onPick={(next) => pickHarness(role.key, next)}
                    placeholder="Type to find a harness, or auto"
                    plain
                  />
                  {picked && !picked.approved && <span className="text-xs text-danger">Not approved: it will not start until its hash is approved.</span>}
                </FieldRow>
                {hasModel(role.key) ? (
                  <FieldRow id={`avoozl-model-${role.key}`} label="Model">
                    {modelFree ? (
                      <span className="text-xs text-muted" data-no-model>
                        {harness} takes no model.
                      </span>
                    ) : (
                      <Picker
                        id={`avoozl-model-${role.key}`}
                        label={<span style={HIDDEN}>{role.label} model</span>}
                        items={optionItems(choices(role.key))}
                        value={form[role.key] || 'auto'}
                        onPick={(model) => setForm({ ...form, [role.key]: model || 'auto' })}
                        placeholder="Type to find a model, or auto"
                        plain
                      />
                    )}
                  </FieldRow>
                ) : (
                  <span className="text-xs text-muted" style={{ alignSelf: 'end' }}>
                    Model: set in Delivery.
                  </span>
                )}
                <div className="flex flex-wrap items-center gap-2" style={{ alignSelf: 'end' }}>
                  <Badge variant={set ? 'info' : undefined}>{set ? 'set here' : 'default'}</Badge>
                  {set && (
                    <SmallBtn onClick={() => reset(role.key)} attrs={{ 'data-reset': role.key }}>
                      Reset
                    </SmallBtn>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 text-xs text-muted" style={{ gridColumn: '1 / -1' }}>
                  <span>{role.line}</span>
                  {role.key === 'planReviewer' && (
                    <span data-second-model>
                      Must use a different model than the planner{form.planner && form.planner !== 'auto' ? ` (${form.planner})` : ''}.
                    </span>
                  )}
                  {problem && (
                    <span role="alert" className="text-danger" data-role-problem>
                      {problem}
                    </span>
                  )}
                  {CHAT_ONLY.has(role.key) && harness !== 'auto' && harness !== KIROCREW_HARNESS && (
                    <span data-harness-pending>Saved. This role still runs as a Kiro Crew chat until it can run on a harness.</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </FormSection>
      <p className="text-xs text-muted" data-models-person-only>
        Kiro Crew chats run as you. Avoozl refuses person-only actions in them, but that only slows an agent down: it is not a lock.
      </p>
      <SaveFooter
        dirty={changed}
        saving={saving}
        problem={problems[0]}
        error={message?.error}
        ok={message?.ok}
        note="Writes .avoozl.json."
        onSave={() => void save()}
        onDiscard={() => {
          setForm(value.models)
          setHarnesses(value.harnesses ?? {})
          setMessage(null)
        }}
      />
    </div>
  )
}
