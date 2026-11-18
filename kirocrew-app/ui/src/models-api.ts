// Settings > Models: the one roles table (R98.6), each role's harness,
// model and, for the worker and falsifier, agent. Saved as `roles` in
// .avoozl.json (src/app/chat-models.mjs); a save drops the older `models`,
// `harnesses` and Delivery agent and model keys. Issue Radar crews pick
// their own model. Free of JSX so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { parseModels } from './flow-api.ts'

// Every role, in page order. `agent` marks the roles whose agent is picked
// here too.
export const ROLES = [
  { key: 'worker', label: 'Worker', line: 'Codes each ready task. A task’s manifest may pin another.', agent: true },
  { key: 'falsifier', label: 'Falsifier', line: 'Tries to prove a worker’s findings wrong before coding. A model equal to the worker’s is skipped.', agent: true },
  { key: 'planner', label: 'Planner', line: 'Drafts specs from a GitHub planning label.', agent: false },
  { key: 'planReviewer', label: 'Plan reviewer', line: 'Reviews draft specs on a different model. Auto skips review until a model is picked.', agent: false },
  { key: 'retro', label: 'Retro', line: 'Finds the slowest step and proposes one change.', agent: false },
  { key: 'reviewDraft', label: 'Review drafts', line: 'Drafts a pending review on a labeled pull request.', agent: false },
] as const
export type Role = (typeof ROLES)[number]['key']
export interface RoleRow {
  harness?: string
  agent?: string
  model?: string
}
export type RoleTable = Partial<Record<Role, RoleRow>>
// What each role may do to files: the worker writes code and the planner
// writes spec files; the others only read.
export const ROLE_ACCESS: Record<Role, 'write' | 'read'> = { worker: 'write', falsifier: 'read', planner: 'write', planReviewer: 'read', retro: 'read', reviewDraft: 'read' }
// The Kiro Crew chat; any other harness is a supervisor child.
export const KIROCREW_HARNESS = 'kirocrew'
// The agent each agent role opens on when none is picked.
export const DEFAULT_AGENTS: Partial<Record<Role, string>> = { worker: 'kirocrew-worker', falsifier: 'avoozl-falsifier' }
const AGENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export interface HarnessDefinition {
  name: string
  approved: boolean
  // The file sets `model`, so a session can name one.
  model?: boolean
}

export interface ModelSettings {
  filename: string
  exists: boolean
  hash: string
  roles: RoleTable
  // This machine's harness definition files.
  harnessDefinitions?: HarnessDefinition[]
}

// The form back to `roles`: auto and blank fields, then empty rows, are
// left out, so each role's default applies.
export function toRoles(form: RoleTable): RoleTable {
  const table: RoleTable = {}
  for (const [role, row] of Object.entries(form) as [Role, RoleRow][]) {
    const kept = Object.fromEntries(
      Object.entries(row ?? {})
        .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
        .filter(([, v]) => v && v !== 'auto'),
    ) as RoleRow
    if (Object.keys(kept).length) table[role] = kept
  }
  return table
}

// The harness choices: the project's default, the Kiro Crew chat, then this
// machine's definitions. A saved name with no file here still shows.
export function harnessOptions(definitions: HarnessDefinition[], current: string) {
  const options = [
    { value: 'auto', label: 'auto (project default)' },
    { value: KIROCREW_HARNESS, label: 'Kiro Crew chat' },
    ...definitions
      .filter((d) => d.name !== KIROCREW_HARNESS && d.name !== 'auto')
      .map((d) => ({ value: d.name, label: d.approved ? d.name : `${d.name} (not approved)` })),
  ]
  if (current && !options.some((o) => o.value === current)) options.push({ value: current, label: `${current} (not on this machine)` })
  return options
}

export function modelsClient(api: AppApi) {
  const run = <T>(workspaceId: string, operation: string, input: Record<string, unknown> = {}) =>
    api.post<{ result: T }>(COMMAND_PATH, { operation, input, workspaceId }).then((reply) => reply.result)
  return {
    get: (workspaceId: string) => run<ModelSettings>(workspaceId, 'models.settings.get'),
    save: (workspaceId: string, roles: RoleTable, expectedHash: string) =>
      run<ModelSettings>(workspaceId, 'models.settings.update', { roles: toRoles(roles), expectedHash }),
    list: () => api.get<unknown>('/api/models').then(parseModels),
  }
}

const isSet = (value?: string) => Boolean(value?.trim()) && value !== 'auto'

// A role runs on the default until a harness, agent or model is set for it here.
export function roleIsSet(role: Role, form: RoleTable): boolean {
  const row = form[role] ?? {}
  return isSet(row.harness) || isSet(row.agent) || isSet(row.model)
}

// Whether a harness can take a model: auto, the Kiro Crew chat and any
// harness that is not on this machine are given the benefit of the doubt.
export function harnessTakesModel(harness: string | undefined, definitions: HarnessDefinition[]): boolean {
  if (!isSet(harness) || harness === KIROCREW_HARNESS) return true
  const found = definitions.find((d) => d.name === harness)
  return found ? Boolean(found.model) : true
}

// Why a role's choice cannot be saved, or null.
export function roleProblem(role: Role, form: RoleTable, definitions: HarnessDefinition[]): string | null {
  const row = form[role] ?? {}
  const agent = row.agent?.trim()
  if (agent && !AGENT.test(agent)) return 'The agent is an agent name: letters, digits, . _ : or -.'
  if (isSet(row.model) && !harnessTakesModel(row.harness, definitions)) return `${row.harness} takes no model. Set the model to auto.`
  if (role === 'planReviewer' && isSet(row.model) && row.model === form.planner?.model) return 'The reviewer must use a different model than the planner.'
  return null
}
