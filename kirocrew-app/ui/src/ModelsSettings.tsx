// Settings > Models: the harnesses on this machine once at the top, then one
// row per role (role | harness | agent | model | source). A role shows
// "default" until a harness, agent or model is set here, and Reset puts it back. A model a
// harness cannot take is dropped on pick and blocks Save if loaded (R98.3).
// It is the one roles table (R98.6, R98.7): the worker and falsifier also
// pick their agent here, and no other page picks a role's agent or model.
// Save writes `roles` in .avoozl.json with the file's hash and drops the
// older keys. Auto leaves the plan reviewer unset; other roles use their
// agent's own model and their project's harness.
import { useInstance } from './InstanceName.tsx'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input } from './ui/Input'
import { useAppApi } from './host.ts'
import Badge from './ui/Badge.tsx'
import { FieldRow } from './FieldRow.tsx'
import { FormSection } from './FormSection.tsx'
import { Picker } from './Picker.tsx'
import { optionItems } from './picker.ts'
import { SmallBtn } from './ui/controls.tsx'
import { SaveFooter } from './SaveFooter.tsx'
import { useRead } from './useRead.ts'
import { errorMessage } from './workspace-api.ts'
import { modelOptions } from './flow-api.ts'
import {
  DEFAULT_AGENTS,
  ROLES,
  ROLE_ACCESS,
  harnessTakesModel,
  provedLine,
  roleIsSet,
  roleProblem,
  KIROCREW_HARNESS,
  harnessOptions,
  modelsClient,
  toRoles,
  type ModelSettings,
  type Role,
  type RoleRow,
  type RoleTable,
} from './models-api.ts'
import { ErrorText } from './ui/ErrorText'
import { Hint } from './ui/Hint'
import { Stack } from './ui/Stack'
import { Box } from './ui/Box'

// One column on a phone; role | harness | agent | model | source from 1000px.
const ROW_CSS = '[data-model-role]{display:grid;grid-template-columns:minmax(0,1fr);gap:8px 16px}@media (min-width:1000px){[data-model-role]{grid-template-columns:11rem minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 10rem}}[data-model-role]~[data-model-role]{border-top:1px solid var(--border);padding-top:12px}'
// shortcut: these roles cannot run as a harness child yet (rows of
// src/app/role-table.mjs with process: false); drop a role here when its task
// lands.
const CHAT_ONLY = new Set<Role>(['issuePlanner'])

export default function ModelsSettings({ workspaceId }: { workspaceId: string }) {
  const api = useAppApi()
  const host = useInstance(workspaceId)?.host
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
      <ErrorText role="alert" size="sm">
        {error}
      </ErrorText>
    )
  if (!value) return <Hint as="p" size="sm">Loading…</Hint>
  const choices = (role: Role) => modelOptions(list, form[role]?.model ?? '').map((option) =>
    role === 'planReviewer' && option.value === 'auto' ? { ...option, label: 'auto (no reviewer)' } : option,
  )
  const definitions = value.harnessDefinitions ?? []
  const changed = JSON.stringify(toRoles(form)) !== JSON.stringify(toRoles(value.roles ?? {}))
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
  const problems = ROLES.map((role) => roleProblem(role.key, form, definitions)).filter(Boolean) as string[]
  const set = (role: Role, change: RoleRow) => setForm({ ...form, [role]: { ...form[role], ...change } })
  const pickHarness = (role: Role, picked: string) => {
    const next = picked || 'auto'
    set(role, harnessTakesModel(next, definitions) ? { harness: next } : { harness: next, model: 'auto' })
  }
  const reset = (role: Role) => setForm({ ...form, [role]: {} })
  return (
    <Stack gap={4} data-models-settings>
      <style href="avoozl-models-rows" precedence="default">
        {ROW_CSS}
      </style>
      <FormSection title="Harnesses on this machine" blurb="Harness files live in this machine’s Avoozl config. Each is approved by its file hash.">
        <Box as="ul" css-column-gap="24" css-row-gap="8" flex flexWrap size="sm" data-models-harnesses>
          <Box as="li" flex items="center" gap="2">
            Kiro Crew chat <Badge variant="success">built in</Badge>
          </Box>
          {definitions.map((d) => (
            <Box key={d.name} as="li" flex items="center" gap="2" data-harness-definition={d.name}>
              {d.name} <Badge variant={d.approved ? 'success' : 'warning'}>{d.approved ? 'hash approved' : 'not approved'}</Badge>
              <Hint size="xs" data-harness-proved>
                {provedLine(d)}
              </Hint>
              {d.readRoles && (
                <Hint size="xs" data-harness-read-roles>
                  Not offered for read-only roles: {d.readRoles}
                </Hint>
              )}
            </Box>
          ))}
        </Box>
        {definitions.length === 0 && <Hint size="xs">No harness files here. Roles run as Kiro Crew chats or on their project’s executor.</Hint>}
      </FormSection>
      <FormSection title="Roles" blurb="Each role runs on its default until you set it here. This is the only place a role’s harness, agent or model is picked. A task’s session pin wins over its role.">
        <Stack gap={3}>
          {ROLES.map((role) => {
            const row = form[role.key] ?? {}
            const harness = row.harness || 'auto'
            const isSet = roleIsSet(role.key, form)
            const problem = roleProblem(role.key, form, definitions)
            const picked = definitions.find((d) => d.name === harness)
            const modelFree = !harnessTakesModel(harness, definitions)
            return (
              <Box key={role.key} data-model-role={role.key} data-source={isSet ? 'set here' : 'default'} minW0 size="sm">
                <Box flex minW0 flexCol gap="0.5">
                  <Box as="span" weight="medium">{role.label}</Box>
                  <Hint size="xs" data-role-access={ROLE_ACCESS[role.key]}>
                    {ROLE_ACCESS[role.key] === 'write' ? 'Writes files' : 'Read-only'}
                  </Hint>
                </Box>
                <FieldRow id={`avoozl-harness-${role.key}`} label="Harness">
                  <Picker
                    id={`avoozl-harness-${role.key}`}
                    label={<Box as="span" css-position="absolute" css-width="1" css-height="1" css-overflow="hidden" css-clip="rect-0-0-0-0">{role.label} harness</Box>}
                    items={optionItems(harnessOptions(definitions, row.harness ?? '', ROLE_ACCESS[role.key], host))}
                    value={harness}
                    onPick={(next) => pickHarness(role.key, next)}
                    placeholder="Type to find a harness, or auto"
                    plain
                  />
                  {picked && !picked.approved && <ErrorText as="span" size="xs">Not approved: it will not start until its hash is approved.</ErrorText>}
                </FieldRow>
                {role.agent ? (
                  <FieldRow id={`avoozl-agent-${role.key}`} label="Agent">
                    <Input id={`avoozl-agent-${role.key}`} value={row.agent ?? ''} placeholder={DEFAULT_AGENTS[role.key]} onChange={(e) => set(role.key, { agent: e.target.value })} />
                  </FieldRow>
                ) : (
                  <Box as="span" css-align-self="end" size="xs" tone="muted" data-fixed-agent>
                    Agent: Avoozl’s own.
                  </Box>
                )}
                <FieldRow id={`avoozl-model-${role.key}`} label="Model">
                  {modelFree || !role.model ? (
                    <Hint size="xs" data-no-model>
                      {role.model ? `${harness} takes no model.` : 'The harness’s own.'}
                    </Hint>
                  ) : (
                    <Picker
                      id={`avoozl-model-${role.key}`}
                      label={<Box as="span" css-position="absolute" css-width="1" css-height="1" css-overflow="hidden" css-clip="rect-0-0-0-0">{role.label} model</Box>}
                      items={optionItems(choices(role.key))}
                      value={row.model || 'auto'}
                      onPick={(model) => set(role.key, { model: model || 'auto' })}
                      placeholder="Type to find a model, or auto"
                      plain
                    />
                  )}
                </FieldRow>
                <Box css-align-self="end" flex flexWrap items="center" gap="2">
                  <Badge variant={isSet ? 'info' : undefined}>{isSet ? 'set here' : 'default'}</Badge>
                  {isSet && (
                    <SmallBtn onClick={() => reset(role.key)} attrs={{ 'data-reset': role.key }}>
                      Reset
                    </SmallBtn>
                  )}
                </Box>
                <Box css-grid-column="1-1" flex flexCol gap="0.5" size="xs" tone="muted">
                  <span>{role.line}</span>
                  {role.key === 'planReviewer' && (
                    <span data-second-model>
                      Must use a different model than the planner{form.planner?.model && form.planner.model !== 'auto' ? ` (${form.planner.model})` : ''}.
                    </span>
                  )}
                  {problem && (
                    <ErrorText role="alert" as="span" data-role-problem>
                      {problem}
                    </ErrorText>
                  )}
                  {CHAT_ONLY.has(role.key) && harness !== 'auto' && harness !== KIROCREW_HARNESS && (
                    <span data-harness-pending>Saved. On a harness this role starts but cannot hand back its answer yet. Keep it on auto or the Kiro Crew chat.</span>
                  )}
                </Box>
              </Box>
            )
          })}
        </Stack>
      </FormSection>
      <Hint as="p" size="xs" data-models-person-only>
        Kiro Crew chats run as you. Avoozl refuses person-only actions in them, but that only slows an agent down: it is not a lock.
      </Hint>
      <SaveFooter
        dirty={changed}
        saving={saving}
        problem={problems[0]}
        error={message?.error}
        ok={message?.ok}
        note="Writes roles in .avoozl.json."
        onSave={() => void save()}
        onDiscard={() => {
          setForm(value.roles ?? {})
          setMessage(null)
        }}
      />
    </Stack>
  )
}
