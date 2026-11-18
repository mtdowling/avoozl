// Settings > Models: the model each of Avoozl's own chats opens on, saved as
// `models` in .avoozl.json, and the harness each role runs on, saved as
// `harnesses` (src/app/chat-models.mjs; R98.3). Issue Radar crews pick
// their own model. Free of JSX so node can test it.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'
import { parseModels } from './flow-api.ts'

export const MODEL_ROLES = [
  { key: 'planner', label: 'Planner', line: 'Drafts specs from a GitHub planning label.' },
  { key: 'planReviewer', label: 'Plan reviewer', line: 'Reviews draft specs on a different model. Auto skips review until a model is picked.' },
  { key: 'retro', label: 'Retro', line: 'Finds the slowest step and proposes one change.' },
  { key: 'reviewDraft', label: 'Review drafts', line: 'Drafts a pending review on a labeled pull request.' },
] as const
export type ModelRole = (typeof MODEL_ROLES)[number]['key']
export type ChatModels = Partial<Record<ModelRole, string>>

// Every role a harness can be picked for: the worker, whose model is in
// Settings > Delivery, then Avoozl's own chats.
export const HARNESS_ROLES = [
  { key: 'worker', label: 'Worker', line: 'Codes each ready task. Its model is set in Delivery.' },
  ...MODEL_ROLES,
] as const
export type HarnessRole = (typeof HARNESS_ROLES)[number]['key']
export type RoleHarnesses = Partial<Record<HarnessRole, string>>
// The Kiro Crew chat; any other harness is a supervisor child.
export const KIROCREW_HARNESS = 'kirocrew'

export interface HarnessDefinition {
  name: string
  approved: boolean
}

export interface ModelSettings {
  filename: string
  exists: boolean
  hash: string
  models: ChatModels
  harnesses?: RoleHarnesses
  // This machine's harness definition files.
  harnessDefinitions?: HarnessDefinition[]
}

// The form back to `models`: auto and blank leave the role out.
export function toModels(form: ChatModels): ChatModels {
  return Object.fromEntries(Object.entries(form).filter(([, model]) => model && model !== 'auto')) as ChatModels
}

// The form back to `harnesses`: auto and blank leave the role out.
export function toHarnesses(form: RoleHarnesses): RoleHarnesses {
  return Object.fromEntries(Object.entries(form).filter(([, harness]) => harness && harness !== 'auto')) as RoleHarnesses
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
    save: (workspaceId: string, models: ChatModels, harnesses: RoleHarnesses, expectedHash: string) =>
      run<ModelSettings>(workspaceId, 'models.settings.update', { models: toModels(models), harnesses: toHarnesses(harnesses), expectedHash }),
    list: () => api.get<unknown>('/api/models').then(parseModels),
  }
}
